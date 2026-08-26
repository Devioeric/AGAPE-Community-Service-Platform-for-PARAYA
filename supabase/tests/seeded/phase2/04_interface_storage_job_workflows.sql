BEGIN;
SELECT plan(24);

SELECT has_function('public','phase2_review_document',ARRAY['text','uuid','text','text'],'document review RPC exists');
SELECT has_function('public','phase2_claim_contact_email_outbox',ARRAY['integer','integer'],'atomic outbox claim exists');
SELECT has_function('public','phase2_finalize_contact_email',ARRAY['uuid','uuid','text','text'],'checked outbox finalizer exists');
SELECT has_function('public','phase2_list_program_finance_queue',ARRAY[]::text[],'program selector RPC exists');
SELECT ok(NOT has_function_privilege('public','phase2_claim_contact_email_outbox(integer,integer)','EXECUTE'),'PUBLIC cannot claim email');
SELECT ok(NOT has_function_privilege('anon','phase2_claim_contact_email_outbox(integer,integer)','EXECUTE'),'anon cannot claim email');
SELECT ok(NOT has_function_privilege('authenticated','phase2_claim_contact_email_outbox(integer,integer)','EXECUTE'),'authenticated cannot claim email');
SELECT ok(has_function_privilege('service_role','phase2_claim_contact_email_outbox(integer,integer)','EXECUTE'),'service role can claim email');

UPDATE public.phase2_component_runtime SET mode='synthetic',
 synthetic_user_ids=ARRAY['f2200000-0000-4000-8000-000000000002'::uuid,'f2200000-0000-4000-8000-000000000005'::uuid],
 synthetic_entity_ids=CASE component
  WHEN 'partners' THEN ARRAY['f3100000-0000-4000-8000-000000000001'::uuid]
  WHEN 'program_finance' THEN ARRAY['f3320000-0000-4000-8000-000000000001'::uuid]
  ELSE synthetic_entity_ids END
 WHERE component IN('partners','program_finance','external_contact_email');
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000002',true);

SELECT is((public.phase2_list_documents('partnership','f3100000-0000-4000-8000-000000000001'::uuid)->0->>'scanStatus'),'quarantined','document list is explicit and exposes review state');
SELECT is((public.phase2_review_document('partnership','f3130000-0000-4000-8000-000000000001'::uuid,'approve','Synthetic signature and metadata review')->>'scanStatus'),'approved','Director approves a quarantined target-bound document');
SELECT is((SELECT scan_status FROM public.partnership_documents WHERE id='f3130000-0000-4000-8000-000000000001'),'approved','approved status persists');
SELECT is((SELECT reviewed_by::text FROM public.partnership_documents WHERE id='f3130000-0000-4000-8000-000000000001'),'f2200000-0000-4000-8000-000000000002','document reviewer is recorded');
SELECT throws_ok($$SELECT public.phase2_review_document('partnership','f3130000-0000-4000-8000-000000000001','reject','Second review attempt')$$,'40001','document is already reviewed','review is single-transition and immutable in effect');

SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000005',true);
SELECT is(jsonb_array_length(public.phase2_list_program_finance_queue()),1,'Finance gets an allowlisted program selector');
SELECT ok((public.phase2_list_program_finance_queue()->0) ?& ARRAY['id','title','status','allocationStatus','cashTotal','inKindTotal'],'program selector has explicit fields');

SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claim.sub','',true);
INSERT INTO public.partner_contact_email_outbox(id,contact_id,template_key,template_version,payload,idempotency_key,status,next_attempt_at)
VALUES('f3500000-0000-4000-8000-000000000010','f3110000-0000-4000-8000-000000000001','partnership_renewal',1,
 '{"partner_name":"Synthetic External Organization","expires_on":"2026-12-31","days":30}',
 'synthetic-claim-010','queued',now()-interval '1 minute');

CREATE TEMP TABLE claimed_delivery AS SELECT public.phase2_claim_contact_email_outbox(25,300) AS payload;
SELECT is(jsonb_array_length((SELECT payload FROM claimed_delivery)),1,'worker atomically claims one eligible delivery');
SELECT is((SELECT status FROM public.partner_contact_email_outbox WHERE id='f3500000-0000-4000-8000-000000000010'),'sending','claimed row is sending');
SELECT ok((SELECT claim_token IS NOT NULL AND lease_expires_at>claimed_at FROM public.partner_contact_email_outbox WHERE id='f3500000-0000-4000-8000-000000000010'),'claim has an expiring opaque lease');
SELECT is(jsonb_array_length(public.phase2_claim_contact_email_outbox(25,300)),0,'skip-locked claim does not duplicate active leases');
SELECT throws_ok($$SELECT public.phase2_finalize_contact_email('f3500000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000000','sent',NULL)$$,'40001','delivery lease is missing, stale, or expired','stale token cannot finalize delivery');
SELECT is((public.phase2_finalize_contact_email('f3500000-0000-4000-8000-000000000010',
  (SELECT (payload->0->>'claimToken')::uuid FROM claimed_delivery),'sent',NULL)->>'status'),'sent','matching lease finalizes delivery');
SELECT is((SELECT count(*)::integer FROM public.partner_contact_email_events WHERE outbox_id='f3500000-0000-4000-8000-000000000010'),2,'claim and finalization append exactly two events');

UPDATE public.phase2_component_runtime SET mode='off',synthetic_user_ids='{}',synthetic_entity_ids='{}',updated_at=now();
UPDATE public.phase2_cutover_state SET write_authority='v1',reconciliation_hash=NULL,reconciled_at=NULL,changed_at=now();
SELECT is((SELECT count(*)::integer FROM public.phase2_component_runtime WHERE mode<>'off'),0,'all Phase 2 modes return off');
SELECT is((SELECT count(*)::integer FROM public.phase2_cutover_state WHERE write_authority<>'v1'),0,'all cutovers return V1');

SELECT * FROM finish();
ROLLBACK;
