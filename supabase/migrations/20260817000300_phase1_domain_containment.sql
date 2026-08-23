-- Phase 1A/1C: survey atomicity, donation inventory integrity, impact retention.
BEGIN;

ALTER TABLE public.surveys ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1 CHECK (row_version>0);
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS archive_reason text;
ALTER TABLE public.donation_distributions ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE public.donation_distributions ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.donation_distributions ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE public.impact_indicators ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE public.impact_indicators ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.impact_indicators ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE public.impact_qualitative ADD COLUMN IF NOT EXISTS subject_consent_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE public.impact_qualitative ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE public.impact_qualitative ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.impact_qualitative ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE public.follow_up_records ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0);
ALTER TABLE public.follow_up_records ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE public.follow_up_records ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.follow_up_records ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE public.follow_up_records DROP CONSTRAINT IF EXISTS follow_up_records_status_check;
UPDATE public.follow_up_records SET status='scheduled' WHERE status='pending';
ALTER TABLE public.follow_up_records ADD CONSTRAINT follow_up_records_status_check CHECK(status IN('scheduled','in_progress','completed','overdue'));

CREATE TABLE public.domain_correction_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),domain text NOT NULL CHECK(domain IN('donation','impact')),
  entity_type text NOT NULL,entity_id uuid NOT NULL,event_type text NOT NULL,reason text,
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.domain_correction_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY phase1_domain_events_active_guard ON public.domain_correction_events AS RESTRICTIVE FOR ALL TO authenticated USING(public.phase0_current_account_is_active()) WITH CHECK(public.phase0_current_account_is_active());
CREATE POLICY phase1_domain_events_rpc_only ON public.domain_correction_events FOR ALL TO authenticated USING(false) WITH CHECK(false);
REVOKE ALL ON public.domain_correction_events FROM anon,authenticated;
CREATE TRIGGER domain_correction_events_immutable BEFORE UPDATE OR DELETE ON public.domain_correction_events FOR EACH ROW EXECUTE FUNCTION public.phase1_block_immutable_change();

-- Mutation tables are server/RPC-only. Existing SELECT policies remain and
-- are still constrained by Phase 1 Admin/legacy isolation.
DO $deny_domain_direct_writes$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['surveys','survey_questions','survey_responses','survey_answers','donations','donation_distributions','impact_indicators','impact_qualitative','follow_up_records'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(false)','phase1_direct_insert_denied',table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(false) WITH CHECK(false)','phase1_direct_update_denied',table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(false)','phase1_direct_delete_denied',table_name);
  END LOOP;
END;
$deny_domain_direct_writes$;

CREATE OR REPLACE FUNCTION public.phase1_save_survey(p_survey_id uuid,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE survey_id uuid; old_status text; item jsonb; inserted_ids uuid[]:='{}'; question_id uuid; parent_index integer; i integer:=0;
BEGIN
  IF NOT public.phase1_current_has_capability('survey.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF p_payload->>'status'<>'draft' OR jsonb_typeof(p_payload->'questions')<>'array' OR jsonb_array_length(p_payload->'questions') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'survey content saves must remain draft' USING ERRCODE='22023'; END IF;
  IF p_survey_id IS NULL THEN
    INSERT INTO public.surveys(title,description,status,target_barangay_id,opens_at,closes_at,is_anonymous,is_editable,reminder_enabled,submission_type,methodology,parent_survey_id,program_id,created_by,published_at)
    VALUES(btrim(p_payload->>'title'),nullif(btrim(p_payload->>'description'),''),(p_payload->>'status'),nullif(p_payload->>'target_barangay_id','')::uuid,nullif(p_payload->>'opens_at','')::timestamptz,nullif(p_payload->>'closes_at','')::timestamptz,
      coalesce((p_payload->>'is_anonymous')::boolean,false),coalesce((p_payload->>'is_editable')::boolean,false),coalesce((p_payload->>'reminder_enabled')::boolean,false),coalesce(p_payload->>'submission_type','once'),coalesce(p_payload->>'methodology','quantitative'),nullif(p_payload->>'parent_survey_id','')::uuid,nullif(p_payload->>'program_id','')::uuid,auth.uid(),CASE WHEN p_payload->>'status'='published' THEN now() END)
    RETURNING id INTO survey_id;
  ELSE
    SELECT status INTO old_status FROM public.surveys WHERE id=p_survey_id FOR UPDATE;
    IF old_status IS NULL THEN RAISE EXCEPTION 'survey not found' USING ERRCODE='P0002'; END IF;
    IF old_status<>'draft' THEN RAISE EXCEPTION 'published surveys are immutable; use the status action' USING ERRCODE='23514'; END IF;
    survey_id:=p_survey_id;
    UPDATE public.surveys SET title=btrim(p_payload->>'title'),description=nullif(btrim(p_payload->>'description'),''),status=p_payload->>'status',target_barangay_id=nullif(p_payload->>'target_barangay_id','')::uuid,
      opens_at=nullif(p_payload->>'opens_at','')::timestamptz,closes_at=nullif(p_payload->>'closes_at','')::timestamptz,is_anonymous=coalesce((p_payload->>'is_anonymous')::boolean,false),is_editable=coalesce((p_payload->>'is_editable')::boolean,false),reminder_enabled=coalesce((p_payload->>'reminder_enabled')::boolean,false),submission_type=coalesce(p_payload->>'submission_type','once'),methodology=coalesce(p_payload->>'methodology','quantitative'),parent_survey_id=nullif(p_payload->>'parent_survey_id','')::uuid,program_id=nullif(p_payload->>'program_id','')::uuid,published_at=CASE WHEN p_payload->>'status'='published' THEN now() ELSE NULL END,row_version=row_version+1,updated_at=now() WHERE id=survey_id;
    DELETE FROM public.survey_questions WHERE survey_id=phase1_save_survey.survey_id;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'questions') LOOP
    IF item->>'question_type' NOT IN ('text','multiple_choice','checkbox','rating') OR length(btrim(item->>'question_text'))<1 THEN RAISE EXCEPTION 'invalid survey question' USING ERRCODE='22023'; END IF;
    INSERT INTO public.survey_questions(survey_id,question_text,question_type,options,is_required,section_title,order_index,conditions)
    VALUES(survey_id,btrim(item->>'question_text'),item->>'question_type',coalesce(item->'options','[]'::jsonb),coalesce((item->>'is_required')::boolean,false),nullif(btrim(item->>'section_title'),''),i,NULL) RETURNING id INTO question_id;
    inserted_ids:=array_append(inserted_ids,question_id); i:=i+1;
  END LOOP;
  i:=0;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'questions') LOOP
    IF item->'conditions' IS NOT NULL AND item->'conditions'<>'null'::jsonb THEN
      parent_index:=(item->'conditions'->>'on_question_index')::integer;
      IF parent_index<0 OR parent_index>=array_length(inserted_ids,1) OR parent_index=i THEN RAISE EXCEPTION 'invalid question condition' USING ERRCODE='22023'; END IF;
      UPDATE public.survey_questions SET conditions=jsonb_build_object('on_question_id',inserted_ids[parent_index+1],'on_value',item->'conditions'->>'on_value') WHERE id=inserted_ids[i+1];
    END IF; i:=i+1;
  END LOOP;
  RETURN survey_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_submit_survey_response(p_survey_id uuid,p_answers jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE survey public.surveys%ROWTYPE; actor public.users%ROWTYPE; response_id uuid; answer jsonb; question public.survey_questions%ROWTYPE; response_barangay uuid;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF NOT public.phase1_current_has_capability('survey.respond') OR jsonb_typeof(p_answers)<>'array' OR jsonb_array_length(p_answers) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'forbidden or invalid response' USING ERRCODE='42501'; END IF;
  SELECT * INTO survey FROM public.surveys WHERE id=p_survey_id FOR SHARE;
  IF survey.id IS NULL OR survey.status<>'published' OR (survey.opens_at IS NOT NULL AND survey.opens_at>now()) OR (survey.closes_at IS NOT NULL AND survey.closes_at<now()) THEN RAISE EXCEPTION 'survey is not open' USING ERRCODE='23514'; END IF;
  IF survey.target_barangay_id IS NOT NULL AND actor.role<>'volunteer' AND actor.barangay_id IS DISTINCT FROM survey.target_barangay_id THEN RAISE EXCEPTION 'survey is outside actor barangay' USING ERRCODE='42501'; END IF;
  response_barangay:=CASE WHEN actor.role='volunteer' THEN survey.target_barangay_id ELSE actor.barangay_id END;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_survey_id::text||':'||auth.uid()::text,0));
  IF survey.submission_type='once' AND EXISTS(SELECT 1 FROM public.survey_responses WHERE survey_id=p_survey_id AND respondent_id=auth.uid()) THEN RAISE EXCEPTION 'survey already answered' USING ERRCODE='23505'; END IF;
  INSERT INTO public.survey_responses(survey_id,respondent_id,barangay_id) VALUES(p_survey_id,auth.uid(),response_barangay) RETURNING id INTO response_id;
  FOR answer IN SELECT value FROM jsonb_array_elements(p_answers) LOOP
    SELECT * INTO question FROM public.survey_questions WHERE id=(answer->>'question_id')::uuid AND survey_id=p_survey_id;
    IF question.id IS NULL THEN RAISE EXCEPTION 'answer references a question outside this survey' USING ERRCODE='23514'; END IF;
    IF question.question_type IN ('multiple_choice','checkbox') AND answer->'answer_options' IS NOT NULL AND EXISTS(
      SELECT 1 FROM jsonb_array_elements_text(answer->'answer_options') AS selected(value) WHERE NOT(question.options ? selected.value)
    ) THEN RAISE EXCEPTION 'answer contains an invalid option' USING ERRCODE='23514'; END IF;
    INSERT INTO public.survey_answers(response_id,question_id,answer_text,answer_options)
    VALUES(response_id,question.id,nullif(answer->>'answer_text',''),CASE WHEN answer->'answer_options'='null'::jsonb THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(coalesce(answer->'answer_options','[]'::jsonb))) END);
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.survey_questions q WHERE q.survey_id=p_survey_id AND q.is_required AND NOT EXISTS(SELECT 1 FROM public.survey_answers a WHERE a.response_id=response_id AND a.question_id=q.id AND (nullif(btrim(a.answer_text),'') IS NOT NULL OR cardinality(a.answer_options)>0))) THEN RAISE EXCEPTION 'required answers are missing' USING ERRCODE='23514'; END IF;
  RETURN response_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_record_donation_distribution(p_donation_id uuid,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE donation public.donations%ROWTYPE; distributed numeric; requested numeric; new_id uuid;
BEGIN
  IF NOT public.phase1_current_has_capability('donation.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO donation FROM public.donations WHERE id=p_donation_id FOR UPDATE;
  IF donation.id IS NULL OR donation.archived_at IS NOT NULL THEN RAISE EXCEPTION 'donation unavailable' USING ERRCODE='23514'; END IF;
  requested:=(p_payload->>'quantity')::numeric; IF requested<=0 THEN RAISE EXCEPTION 'quantity must be positive' USING ERRCODE='22023'; END IF;
  SELECT coalesce(sum(quantity),0) INTO distributed FROM public.donation_distributions WHERE donation_id=p_donation_id AND voided_at IS NULL;
  IF distributed+requested>donation.quantity THEN RAISE EXCEPTION 'distribution exceeds remaining quantity' USING ERRCODE='23514'; END IF;
  INSERT INTO public.donation_distributions(donation_id,distributed_to,quantity,distribution_date,distribution_type,notes)
  VALUES(p_donation_id,btrim(p_payload->>'distributed_to'),requested,(p_payload->>'distribution_date')::date,p_payload->>'distribution_type',nullif(btrim(p_payload->>'notes'),'')) RETURNING id INTO new_id;
  INSERT INTO public.domain_correction_events(domain,entity_type,entity_id,event_type,actor_id,metadata) VALUES('donation','distribution',new_id,'recorded',auth.uid(),jsonb_build_object('donation_id',p_donation_id,'quantity',requested));
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_save_donation(p_donation_id uuid,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE current_row public.donations%ROWTYPE; saved_id uuid; distributed numeric; new_quantity numeric;
BEGIN
  IF NOT public.phase1_current_has_capability('donation.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  new_quantity:=(p_payload->>'quantity')::numeric;
  IF new_quantity<=0 THEN RAISE EXCEPTION 'quantity must be positive' USING ERRCODE='22023'; END IF;
  IF p_donation_id IS NULL THEN
    INSERT INTO public.donations(donor_name,donor_type,item_type,quantity,unit,received_date,program_id,barangay_id,notes,created_by)
    VALUES(btrim(p_payload->>'donor_name'),p_payload->>'donor_type',btrim(p_payload->>'item_type'),new_quantity,btrim(p_payload->>'unit'),(p_payload->>'received_date')::date,nullif(p_payload->>'program_id','')::uuid,nullif(p_payload->>'barangay_id','')::uuid,nullif(btrim(p_payload->>'notes'),''),auth.uid())
    RETURNING id INTO saved_id;
    INSERT INTO public.domain_correction_events(domain,entity_type,entity_id,event_type,actor_id) VALUES('donation','donation',saved_id,'recorded',auth.uid());
  ELSE
    SELECT * INTO current_row FROM public.donations WHERE id=p_donation_id FOR UPDATE;
    IF current_row.id IS NULL OR current_row.archived_at IS NOT NULL THEN RAISE EXCEPTION 'donation unavailable' USING ERRCODE='P0002'; END IF;
    SELECT coalesce(sum(quantity),0) INTO distributed FROM public.donation_distributions WHERE donation_id=p_donation_id AND voided_at IS NULL;
    IF new_quantity<distributed THEN RAISE EXCEPTION 'quantity cannot be below distributed inventory' USING ERRCODE='23514'; END IF;
    UPDATE public.donations SET donor_name=btrim(p_payload->>'donor_name'),donor_type=p_payload->>'donor_type',item_type=btrim(p_payload->>'item_type'),quantity=new_quantity,
      unit=btrim(p_payload->>'unit'),received_date=(p_payload->>'received_date')::date,program_id=nullif(p_payload->>'program_id','')::uuid,barangay_id=nullif(p_payload->>'barangay_id','')::uuid,
      notes=nullif(btrim(p_payload->>'notes'),''),updated_at=now() WHERE id=p_donation_id RETURNING id INTO saved_id;
    INSERT INTO public.domain_correction_events(domain,entity_type,entity_id,event_type,actor_id,metadata) VALUES('donation','donation',saved_id,'corrected',auth.uid(),jsonb_build_object('previous_quantity',current_row.quantity,'new_quantity',new_quantity));
  END IF;
  RETURN saved_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_create_impact_record(p_entity_type text,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE new_id uuid;
BEGIN
  IF NOT public.phase1_current_has_capability('impact.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF p_entity_type='indicator' THEN
    IF p_payload->>'indicator_type' NOT IN('beneficiaries_reached','families_served','trainings_conducted','materials_distributed','volunteer_hours','custom') OR (p_payload->>'value')::numeric<0 THEN RAISE EXCEPTION 'invalid indicator' USING ERRCODE='22023'; END IF;
    INSERT INTO public.impact_indicators(program_id,indicator_type,value,unit,recorded_date,notes,created_by)
    VALUES((p_payload->>'program_id')::uuid,p_payload->>'indicator_type',(p_payload->>'value')::numeric,btrim(p_payload->>'unit'),(p_payload->>'recorded_date')::date,nullif(btrim(p_payload->>'notes'),''),auth.uid()) RETURNING id INTO new_id;
  ELSIF p_entity_type='qualitative' THEN
    IF p_payload->>'type' NOT IN('testimonial','case_study','pre_post_narrative','observation') OR (nullif(btrim(p_payload->>'subject_name'),'') IS NOT NULL AND coalesce((p_payload->>'subject_consent_confirmed')::boolean,false) IS NOT TRUE) THEN RAISE EXCEPTION 'invalid or unconsented qualitative record' USING ERRCODE='22023'; END IF;
    INSERT INTO public.impact_qualitative(program_id,type,content,subject_name,subject_consent_confirmed,recorded_date,created_by)
    VALUES((p_payload->>'program_id')::uuid,p_payload->>'type',btrim(p_payload->>'content'),nullif(btrim(p_payload->>'subject_name'),''),coalesce((p_payload->>'subject_consent_confirmed')::boolean,false),(p_payload->>'recorded_date')::date,auth.uid()) RETURNING id INTO new_id;
  ELSIF p_entity_type='follow_up' THEN
    IF p_payload->>'followup_type' NOT IN('immediate','6_month','12_month') THEN RAISE EXCEPTION 'invalid follow-up type' USING ERRCODE='22023'; END IF;
    INSERT INTO public.follow_up_records(program_id,followup_type,status,scheduled_date,notes,created_by)
    VALUES((p_payload->>'program_id')::uuid,p_payload->>'followup_type','scheduled',(p_payload->>'scheduled_date')::date,nullif(btrim(p_payload->>'notes'),''),auth.uid()) RETURNING id INTO new_id;
  ELSE RAISE EXCEPTION 'invalid impact entity type' USING ERRCODE='22023'; END IF;
  INSERT INTO public.domain_correction_events(domain,entity_type,entity_id,event_type,actor_id) VALUES('impact',p_entity_type,new_id,'recorded',auth.uid());
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_transition_survey_status(p_survey_id uuid,p_expected_status text,p_status text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE survey public.surveys%ROWTYPE; new_version integer;
BEGIN
  IF NOT public.phase1_current_has_capability('survey.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO survey FROM public.surveys WHERE id=p_survey_id FOR UPDATE;
  IF survey.id IS NULL THEN RAISE EXCEPTION 'survey not found' USING ERRCODE='P0002'; END IF;
  IF survey.status IS DISTINCT FROM p_expected_status THEN RAISE EXCEPTION 'stale survey status' USING ERRCODE='40001'; END IF;
  IF NOT ((p_expected_status='draft' AND p_status='published') OR (p_expected_status='published' AND p_status='closed')) THEN RAISE EXCEPTION 'invalid survey transition' USING ERRCODE='23514'; END IF;
  IF p_status='published' AND NOT EXISTS(SELECT 1 FROM public.survey_questions WHERE survey_id=p_survey_id) THEN RAISE EXCEPTION 'survey requires questions' USING ERRCODE='23514'; END IF;
  UPDATE public.surveys SET status=p_status,published_at=CASE WHEN p_status='published' THEN now() ELSE published_at END,row_version=row_version+1,updated_at=now() WHERE id=p_survey_id RETURNING row_version INTO new_version;
  RETURN new_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_void_donation_record(p_entity_type text,p_entity_id uuid,p_parent_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
  IF NOT public.phase1_current_has_capability('donation.manage') OR length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'forbidden or missing reason' USING ERRCODE='42501'; END IF;
  IF p_entity_type='donation' THEN UPDATE public.donations SET archived_at=now(),archived_by=auth.uid(),archive_reason=btrim(p_reason),updated_at=now() WHERE id=p_entity_id AND archived_at IS NULL;
  ELSIF p_entity_type='distribution' THEN UPDATE public.donation_distributions SET voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason) WHERE id=p_entity_id AND donation_id=p_parent_id AND voided_at IS NULL;
  ELSE RAISE EXCEPTION 'invalid entity type' USING ERRCODE='22023'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'record unavailable or parent mismatch' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.domain_correction_events(domain,entity_type,entity_id,event_type,reason,actor_id,metadata) VALUES('donation',p_entity_type,p_entity_id,'voided',btrim(p_reason),auth.uid(),jsonb_build_object('parent_id',p_parent_id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_transition_follow_up(p_follow_up_id uuid,p_expected_status text,p_status text,p_notes text,p_completed_date date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE current_row public.follow_up_records%ROWTYPE; new_version integer; allowed boolean;
BEGIN
  IF NOT public.phase1_current_has_capability('impact.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO current_row FROM public.follow_up_records WHERE id=p_follow_up_id AND voided_at IS NULL FOR UPDATE;
  IF current_row.id IS NULL THEN RAISE EXCEPTION 'follow-up not found' USING ERRCODE='P0002'; END IF;
  IF current_row.status IS DISTINCT FROM p_expected_status THEN RAISE EXCEPTION 'stale follow-up status' USING ERRCODE='40001'; END IF;
  allowed:=p_expected_status=p_status OR (p_expected_status='scheduled' AND p_status IN('in_progress','overdue')) OR (p_expected_status='in_progress' AND p_status='completed') OR (p_expected_status='overdue' AND p_status IN('in_progress','completed'));
  IF NOT allowed OR (p_status='completed' AND p_completed_date IS NULL) THEN RAISE EXCEPTION 'invalid follow-up transition' USING ERRCODE='23514'; END IF;
  UPDATE public.follow_up_records SET status=p_status,notes=p_notes,completed_date=p_completed_date,row_version=row_version+1,updated_at=now() WHERE id=p_follow_up_id RETURNING row_version INTO new_version;
  INSERT INTO public.domain_correction_events(domain,entity_type,entity_id,event_type,actor_id,metadata) VALUES('impact','follow_up',p_follow_up_id,'status_changed',auth.uid(),jsonb_build_object('from',p_expected_status,'to',p_status));
  RETURN new_version;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.phase1_save_survey(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_submit_survey_response(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_record_donation_distribution(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_save_donation(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_create_impact_record(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_transition_survey_status(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_void_donation_record(text,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_transition_follow_up(uuid,text,text,text,date) TO authenticated;

COMMIT;
