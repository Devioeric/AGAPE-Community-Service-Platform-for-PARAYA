BEGIN;
SELECT plan(16);

UPDATE public.phase2_component_runtime SET mode='synthetic',
 synthetic_user_ids=ARRAY['f2200000-0000-4000-8000-000000000002'::uuid],
 synthetic_entity_ids=(SELECT array_agg(id ORDER BY id) FROM public.partner_entities WHERE data_mode='synthetic')
WHERE component='partners';
UPDATE public.phase2_cutover_state SET write_authority='v2',reconciliation_hash=repeat('a',64),reconciled_at=now(),changed_by='f2200000-0000-4000-8000-000000000002'
WHERE component='partners';
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000002',true);

CREATE TEMP TABLE packet13_contact AS
 SELECT public.phase2_add_partner_contact('f3100000-0000-4000-8000-000000000001',
  '{"full_name":"Synthetic Replacement Primary","email":"replacement@release-gate.invalid","preferred_channel":"email","is_primary":true,"status_email_opt_in":false,"active_from":"2026-01-01"}'::jsonb) id;
SELECT is((SELECT count(*) FROM public.partner_contacts WHERE partner_id='f3100000-0000-4000-8000-000000000001' AND is_primary AND active_until IS NULL),1::bigint,'primary contact transition remains unique');
SELECT is((SELECT public.phase2_update_partner_contact('f3100000-0000-4000-8000-000000000001',id,1,'{"title":"Updated Coordinator"}'::jsonb) FROM packet13_contact),2,'contact update returns the next version');

SELECT is(public.phase2_transition_partnership_term('f3100000-0000-4000-8000-000000000001','f3120000-0000-4000-8000-000000000001',1,'end','2026-08-26','Synthetic relationship correction'),2,'term end is version checked');
CREATE TEMP TABLE packet13_term AS
 SELECT public.phase2_renew_partnership_term('f3100000-0000-4000-8000-000000000001',0,
  '{"starts_on":"2026-09-01","expires_on":"2027-08-31","responsible_officer_id":"f2200000-0000-4000-8000-000000000003","agreement_exception_reason":"Synthetic Director exception for gate testing","agreement_exception_due_on":"2026-12-31"}'::jsonb) id;
SELECT ok((SELECT id IS NOT NULL FROM packet13_term),'renewal creates a successor under the Partner lock');
SELECT is((SELECT public.phase2_transition_partnership_term('f3100000-0000-4000-8000-000000000001',id,1,'suspend','2026-09-02','Synthetic temporary suspension') FROM packet13_term),2,'active term can be suspended');
SELECT is((SELECT public.phase2_transition_partnership_term('f3100000-0000-4000-8000-000000000001',id,2,'resume','2026-09-03','Synthetic reviewed resumption') FROM packet13_term),3,'suspended term can be resumed');
SELECT ok((SELECT public.phase2_upsert_partnership_need('f3100000-0000-4000-8000-000000000001',id,'f3300000-0000-4000-8000-000000000001',3,'partial','Synthetic aggregate evidence note','manual_note',NULL) IS NOT NULL FROM packet13_term),'approved need linkage is term and evidence bound');
SELECT lives_ok($$SELECT public.phase2_configure_partner_type_policy('external_organization',true,current_date)$$,'Partner type policy change is prospective and audited');
SELECT is(public.phase2_merge_partner('f3100000-0000-4000-8000-00000000000b','f3100000-0000-4000-8000-000000000001',1,'Synthetic reviewed duplicate merge'),2,'compatible Partner merge is version checked');

SELECT lives_ok($$SELECT public.phase2_reconcile_legacy_partner_mapping_v2('f2200000-0000-4000-8000-000000000013','f3100000-0000-4000-8000-000000000008','f2200000-0000-4000-8000-000000000003',2,'start_review','Synthetic mapping review')$$,'legacy mapping review starts');
SELECT lives_ok($$SELECT public.phase2_reconcile_legacy_partner_mapping_v2('f2200000-0000-4000-8000-000000000013','f3100000-0000-4000-8000-000000000008','f2200000-0000-4000-8000-000000000003',3,'approve','Synthetic mapping approved')$$,'legacy mapping is approved after review');
CREATE TEMP TABLE packet13_mapping AS
 SELECT public.phase2_reconcile_legacy_partner_mapping_v2('f2200000-0000-4000-8000-000000000013','f3100000-0000-4000-8000-000000000008','f2200000-0000-4000-8000-000000000003',4,'sign_off','Synthetic mapping signed off') value;
SELECT ok((SELECT u.is_active AND m.reconciliation_status='signed_off' AND m.auth_suspension_status='requested' FROM public.users u JOIN public.legacy_account_partner_mappings m ON m.legacy_user_id=u.id WHERE u.id='f2200000-0000-4000-8000-000000000013'),'sign-off leaves application account active until Auth succeeds');
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claim.sub','',true);
SELECT lives_ok($$SELECT public.phase2_finalize_legacy_auth_suspension('f2200000-0000-4000-8000-000000000002','f2200000-0000-4000-8000-000000000013',(SELECT (value->>'suspensionRequestId')::uuid FROM packet13_mapping),false,'synthetic_auth_failure')$$,'failed Auth suspension is durably recorded');
SELECT ok((SELECT u.is_active AND m.reconciliation_status='signed_off' AND m.auth_suspension_status='failed' FROM public.users u JOIN public.legacy_account_partner_mappings m ON m.legacy_user_id=u.id WHERE u.id='f2200000-0000-4000-8000-000000000013'),'failed Auth suspension does not falsely deactivate the app account');
SELECT lives_ok($$SELECT public.phase2_finalize_legacy_auth_suspension('f2200000-0000-4000-8000-000000000002','f2200000-0000-4000-8000-000000000013',(SELECT (value->>'suspensionRequestId')::uuid FROM packet13_mapping),true,NULL)$$,'successful Auth suspension finalizes the application account');
SELECT ok((SELECT NOT u.is_active AND u.status='suspended' AND m.reconciliation_status='suspended' AND m.auth_suspension_status='completed' FROM public.users u JOIN public.legacy_account_partner_mappings m ON m.legacy_user_id=u.id WHERE u.id='f2200000-0000-4000-8000-000000000013'),'completed suspension aligns Auth-request and application state');

SELECT * FROM finish();
ROLLBACK;
