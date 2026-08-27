BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT plan(13);

SELECT ok(
  has_function_privilege('authenticated','public.proposal_create_validation_event(uuid,text,date,text,jsonb)','EXECUTE'),
  'authenticated may execute the reviewed validation RPC'
);
SELECT ok(
  NOT has_function_privilege('anon','public.proposal_create_validation_event(uuid,text,date,text,jsonb)','EXECUTE'),
  'anon cannot execute validation creation'
);
SELECT is((
  SELECT count(*) FROM pg_proc p
  WHERE p.oid='public.proposal_create_validation_event(uuid,text,date,text,jsonb)'::regprocedure
    AND EXISTS(
      SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) privilege
      WHERE privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
    )
),0::bigint,'PUBLIC cannot execute validation creation');

SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claim.sub','',true);
INSERT INTO public.project_proposals(
  id,title,rationale,barangay_id,status,created_by
) VALUES (
  'f39b0000-0000-4000-8000-000000000001',
  'Synthetic atomic validation proposal',
  'Synthetic proposal used only inside a rolled-back database test.',
  'f2100000-0000-4000-8000-000000000001',
  'draft',
  'f2200000-0000-4000-8000-000000000003'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000007',true);
SELECT lives_ok(
  $$SELECT public.proposal_create_validation_event(
    'f39b0000-0000-4000-8000-000000000001',
    'consultation',
    current_date,
    'Synthetic community validation with the required bounded summary.',
    '[{"name":"Synthetic Resident One","role":"participant","present":true},{"name":"Synthetic Resident Two","role":"participant","present":true},{"name":"Synthetic Resident Three","role":null,"present":true}]'
  )$$,
  'same-barangay Secretary records one atomic validation event'
);
RESET ROLE;

SELECT is((SELECT count(*) FROM public.proposal_validations WHERE proposal_id='f39b0000-0000-4000-8000-000000000001'),1::bigint,'one validation event is created');
SELECT is((SELECT count(*) FROM public.proposal_validation_stakeholders s JOIN public.proposal_validations v ON v.id=s.validation_id WHERE v.proposal_id='f39b0000-0000-4000-8000-000000000001'),3::bigint,'all stakeholders are created');
SELECT is((SELECT count(*) FROM public.audit_logs WHERE action='proposal.validation.recorded' AND metadata->>'proposal_id'='f39b0000-0000-4000-8000-000000000001'),1::bigint,'one durable audit event is written');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000007',true);
SELECT throws_ok(
  $$SELECT public.proposal_create_validation_event(
    'f39b0000-0000-4000-8000-000000000001','consultation',current_date,
    'Synthetic invalid request cannot partially create an event.',
    '[{"name":"A","role":null,"present":true},{"name":"Valid Person","role":null,"present":true},{"name":"Third Person","role":null,"present":true}]'
  )$$,
  '22023','invalid validation stakeholder entry','invalid stakeholder data is rejected'
);
SELECT throws_ok(
  $$SELECT public.proposal_create_validation_event(
    'f39b0000-0000-4000-8000-000000000001','consultation',current_date,
    'Synthetic unknown fields cannot enter the governed validation graph.',
    '[{"name":"Person One","role":null,"present":true,"unknown":"blocked"},{"name":"Person Two","role":null,"present":true},{"name":"Person Three","role":null,"present":true}]'
  )$$,
  '22023','invalid validation stakeholder entry','unknown stakeholder keys are rejected'
);
RESET ROLE;

SELECT is((SELECT count(*) FROM public.proposal_validations WHERE proposal_id='f39b0000-0000-4000-8000-000000000001'),1::bigint,'failed requests create no partial validation event');
SELECT is((SELECT count(*) FROM public.proposal_validation_stakeholders s JOIN public.proposal_validations v ON v.id=s.validation_id WHERE v.proposal_id='f39b0000-0000-4000-8000-000000000001'),3::bigint,'failed requests create no partial stakeholders');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000009',true);
SELECT throws_ok(
  $$SELECT public.proposal_create_validation_event(
    'f39b0000-0000-4000-8000-000000000001','consultation',current_date,
    'Synthetic volunteer cannot record proposal validation evidence.',
    '[{"name":"Person One","role":null,"present":true},{"name":"Person Two","role":null,"present":true},{"name":"Person Three","role":null,"present":true}]'
  )$$,
  '42501','forbidden','role without capability is rejected'
);
RESET ROLE;

SELECT is((SELECT count(*) FROM public.proposal_validations WHERE proposal_id='f39b0000-0000-4000-8000-000000000001'),1::bigint,'unauthorized request creates no event');

SELECT * FROM finish();
ROLLBACK;
