-- Historical import staging is sanitized, idempotent, concurrency-safe, and
-- never retains workbook bytes.
BEGIN;

ALTER TABLE public.historical_program_duplicate_decisions
  ADD COLUMN IF NOT EXISTS decision_status text NOT NULL DEFAULT 'pending' CHECK(decision_status IN('pending','decided'));

CREATE OR REPLACE FUNCTION public.phase2_stage_historical_import(p_file_hash text,p_template_version text,p_rows jsonb,p_replaces_batch_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE mode text; batch_id uuid; row_item jsonb; staged_id uuid; candidate record; errors jsonb; v_duplicate_count integer:=0; v_error_count integer:=0; actor_email text;
BEGIN
 mode:=public.phase2_assert_actor_runtime('historical_programs');
 IF NOT public.phase2_current_has_capability('historical_program.import') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_file_hash !~ '^[0-9a-f]{64}$' OR p_template_version<>'agape.historical-programs.v2.1' OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>10000 THEN RAISE EXCEPTION 'invalid historical import envelope' USING ERRCODE='22023'; END IF;
 SELECT id INTO batch_id FROM public.historical_program_import_batches WHERE file_hash=p_file_hash AND created_by=auth.uid() AND status<>'purged';
 IF batch_id IS NOT NULL THEN RETURN jsonb_build_object('batch_id',batch_id,'idempotent',true); END IF;
 INSERT INTO public.historical_program_import_batches(file_hash,template_version,status,row_count,replaced_batch_id,created_by)
 VALUES(p_file_hash,p_template_version,'validating',jsonb_array_length(p_rows),p_replaces_batch_id,auth.uid()) RETURNING id INTO batch_id;
 FOR row_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF NOT public.phase1_json_object_has_only(row_item,ARRAY['row_key','data','errors']) OR length(row_item->>'row_key') NOT BETWEEN 1 AND 80 OR jsonb_typeof(row_item->'errors')<>'array' THEN RAISE EXCEPTION 'invalid staged row' USING ERRCODE='22023'; END IF;
  errors:=row_item->'errors'; v_error_count:=v_error_count+jsonb_array_length(errors);
  IF jsonb_array_length(errors)=0 AND (jsonb_typeof(row_item->'data')<>'object' OR NOT public.phase1_json_object_has_only(row_item->'data',ARRAY['title','summary','category','date_precision','starts_on','ends_on','beneficiary_count','volunteer_count','volunteer_hours','budget_total','currency','source_type','source_notes','partner_codes','barangay_codes','sdgs'])) THEN RAISE EXCEPTION 'invalid sanitized historical row' USING ERRCODE='22023'; END IF;
  INSERT INTO public.historical_program_import_rows(batch_id,row_key,sanitized_data,errors) VALUES(batch_id,row_item->>'row_key',CASE WHEN jsonb_array_length(errors)=0 THEN row_item->'data' ELSE NULL END,errors) RETURNING id INTO staged_id;
  IF jsonb_array_length(errors)=0 THEN
   FOR candidate IN SELECT h.id FROM public.historical_programs h WHERE h.data_mode=mode AND lower(regexp_replace(h.title,'\s+',' ','g'))=lower(regexp_replace(row_item->'data'->>'title','\s+',' ','g'))
      AND extract(year FROM h.starts_on)=extract(year FROM nullif(row_item->'data'->>'starts_on','')::date) LOOP
    INSERT INTO public.historical_program_duplicate_decisions(batch_id,row_key,candidate_program_id,decision_status) VALUES(batch_id,row_item->>'row_key',candidate.id,'pending') ON CONFLICT DO NOTHING;
    v_duplicate_count:=v_duplicate_count+1;
   END LOOP;
  END IF;
 END LOOP;
 UPDATE public.historical_program_import_batches SET error_count=v_error_count,status=CASE WHEN v_error_count>0 OR v_duplicate_count>0 THEN 'needs_correction' ELSE 'ready' END WHERE id=batch_id;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'historical_import.stage','historical_import_batch',batch_id::text,jsonb_build_object('rows',jsonb_array_length(p_rows),'errors',v_error_count,'duplicates',v_duplicate_count));
 RETURN jsonb_build_object('batch_id',batch_id,'status',CASE WHEN v_error_count>0 OR v_duplicate_count>0 THEN 'needs_correction' ELSE 'ready' END,'error_count',v_error_count,'duplicate_count',v_duplicate_count,'idempotent',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_resolve_historical_duplicate(p_batch_id uuid,p_row_key text,p_candidate_id uuid,p_outcome text,p_reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE batch public.historical_program_import_batches; unresolved integer; actor_email text;
BEGIN
 PERFORM public.phase2_assert_actor_runtime('historical_programs');
 IF NOT public.phase2_current_has_capability('historical_program.import') OR p_outcome NOT IN('link_existing','distinct','exclude') OR length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'invalid duplicate decision' USING ERRCODE='42501'; END IF;
 SELECT * INTO batch FROM public.historical_program_import_batches WHERE id=p_batch_id FOR UPDATE;
 IF batch.created_by<>auth.uid() AND NOT public.phase2_current_has_capability('historical_program.review') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 UPDATE public.historical_program_duplicate_decisions SET outcome=p_outcome,reason=p_reason,decided_by=auth.uid(),decided_at=now(),decision_status='decided'
  WHERE batch_id=p_batch_id AND row_key=p_row_key AND candidate_program_id=p_candidate_id AND decision_status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'duplicate candidate is stale or missing' USING ERRCODE='40001'; END IF;
 SELECT count(*) INTO unresolved FROM public.historical_program_duplicate_decisions WHERE batch_id=p_batch_id AND decision_status='pending';
 IF unresolved=0 AND batch.error_count=0 THEN UPDATE public.historical_program_import_batches SET status='ready' WHERE id=p_batch_id; END IF;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'historical_import.duplicate.resolve','historical_import_batch',p_batch_id::text,jsonb_build_object('row_key',p_row_key,'outcome',p_outcome));
 RETURN CASE WHEN unresolved=0 AND batch.error_count=0 THEN 'ready' ELSE 'needs_correction' END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_commit_historical_import(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE batch public.historical_program_import_batches; staged record; payload jsonb; created_id uuid; created_count integer:=0; linked_count integer:=0; excluded_count integer:=0; outcome text; actor_email text;
BEGIN
 PERFORM public.phase2_assert_actor_runtime('historical_programs');
 IF NOT public.phase2_current_has_capability('historical_program.import') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO batch FROM public.historical_program_import_batches WHERE id=p_batch_id FOR UPDATE;
 IF batch.status='committed' THEN RETURN jsonb_build_object('batch_id',batch.id,'idempotent',true,'created',0); END IF;
 IF batch.status<>'ready' OR batch.error_count<>0 OR EXISTS(SELECT 1 FROM public.historical_program_duplicate_decisions WHERE batch_id=batch.id AND decision_status='pending') THEN RAISE EXCEPTION 'batch is not ready' USING ERRCODE='23514'; END IF;
 FOR staged IN SELECT * FROM public.historical_program_import_rows WHERE batch_id=batch.id ORDER BY row_key LOOP
  SELECT d.outcome INTO outcome FROM public.historical_program_duplicate_decisions d WHERE d.batch_id=batch.id AND d.row_key=staged.row_key AND d.decision_status='decided' ORDER BY d.decided_at DESC LIMIT 1;
  IF outcome='exclude' THEN excluded_count:=excluded_count+1; CONTINUE; ELSIF outcome='link_existing' THEN linked_count:=linked_count+1; CONTINUE; END IF;
  payload:=staged.sanitized_data||jsonb_build_object(
   'partner_ids',coalesce((SELECT jsonb_agg(p.id) FROM public.partner_entities p WHERE p.code IN(SELECT jsonb_array_elements_text(staged.sanitized_data->'partner_codes'))),'[]'::jsonb),
   'barangay_ids',coalesce((SELECT jsonb_agg(p.barangay_id) FROM public.partner_entities p WHERE p.barangay_id IS NOT NULL AND p.code IN(SELECT jsonb_array_elements_text(staged.sanitized_data->'barangay_codes'))),'[]'::jsonb)
  )-'partner_codes'-'barangay_codes';
  created_id:=public.phase2_create_historical_program(payload); created_count:=created_count+1;
 END LOOP;
 UPDATE public.historical_program_import_batches SET status='committed',committed_at=now() WHERE id=batch.id;
 UPDATE public.historical_program_import_rows SET sanitized_data=NULL,row_key='purged-'||id::text,errors='[]' WHERE batch_id=batch.id;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'historical_import.commit','historical_import_batch',batch.id::text,jsonb_build_object('created',created_count,'linked',linked_count,'excluded',excluded_count));
 RETURN jsonb_build_object('batch_id',batch.id,'idempotent',false,'created',created_count,'linked',linked_count,'excluded',excluded_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_purge_historical_imports()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE purged integer;
BEGIN
 UPDATE public.historical_program_import_rows r SET sanitized_data=NULL,row_key='purged-'||r.id::text,errors='[]'
  FROM public.historical_program_import_batches b WHERE b.id=r.batch_id AND b.status IN('needs_correction','failed') AND b.purge_after<=now() AND r.sanitized_data IS NOT NULL;
 GET DIAGNOSTICS purged=ROW_COUNT;
 UPDATE public.historical_program_import_batches SET status='purged' WHERE status IN('needs_correction','failed') AND purge_after<=now();
 RETURN purged;
END;
$function$;

REVOKE ALL ON FUNCTION public.phase2_stage_historical_import(text,text,jsonb,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_resolve_historical_duplicate(uuid,text,uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_commit_historical_import(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_purge_historical_imports() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_stage_historical_import(text,text,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_resolve_historical_duplicate(uuid,text,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_commit_historical_import(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_purge_historical_imports() TO service_role;
COMMIT;
