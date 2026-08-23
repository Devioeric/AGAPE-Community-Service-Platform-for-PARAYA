BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT plan(10);

INSERT INTO auth.users(
 instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
 confirmation_token,email_change,email_change_token_new,recovery_token
) VALUES
 ('00000000-0000-0000-0000-000000000000','f2000000-0000-4000-8000-000000000001','authenticated','authenticated','synthetic-director@agape.invalid','',now(),'{}','{}',now(),now(),'','','',''),
 ('00000000-0000-0000-0000-000000000000','f2000000-0000-4000-8000-000000000002','authenticated','authenticated','synthetic-finance@agape.invalid','',now(),'{}','{}',now(),now(),'','','',''),
 ('00000000-0000-0000-0000-000000000000','f2000000-0000-4000-8000-000000000003','authenticated','authenticated','synthetic-finance-denied@agape.invalid','',now(),'{}','{}',now(),now(),'','','',''),
 ('00000000-0000-0000-0000-000000000000','f2000000-0000-4000-8000-000000000004','authenticated','authenticated','synthetic-admin@agape.invalid','',now(),'{}','{}',now(),now(),'','','',''),
 ('00000000-0000-0000-0000-000000000000','f2000000-0000-4000-8000-000000000005','authenticated','authenticated','synthetic-inactive@agape.invalid','',now(),'{}','{}',now(),now(),'','','','');

INSERT INTO public.users(id,email,full_name,role,status,is_active,permissions,is_synthetic_test) VALUES
 ('f2000000-0000-4000-8000-000000000001','synthetic-director@agape.invalid','Synthetic Director','paraya_director','active',true,'{}',true),
 ('f2000000-0000-4000-8000-000000000002','synthetic-finance@agape.invalid','Synthetic Finance','finance_officer','active',true,'{}',true),
 ('f2000000-0000-4000-8000-000000000003','synthetic-finance-denied@agape.invalid','Synthetic Finance Denied','finance_officer','active',true,'{"budgets":false}',true),
 ('f2000000-0000-4000-8000-000000000004','synthetic-admin@agape.invalid','Synthetic Admin','admin','active',true,'{}',true),
 ('f2000000-0000-4000-8000-000000000005','synthetic-inactive@agape.invalid','Synthetic Inactive','paraya_director','inactive',false,'{}',true);

UPDATE public.phase2_component_runtime
SET mode='synthetic',synthetic_user_ids=ARRAY[
 'f2000000-0000-4000-8000-000000000001'::uuid,
 'f2000000-0000-4000-8000-000000000002'::uuid,
 'f2000000-0000-4000-8000-000000000003'::uuid,
 'f2000000-0000-4000-8000-000000000004'::uuid
]
WHERE component='proposals';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000001',true);
SELECT ok(public.phase2_current_has_capability('proposal.decide'),'Director has the final proposal-decision capability');
SELECT ok(NOT public.phase2_current_has_capability('budget.review'),'Director cannot perform Finance clearance');
SELECT is(public.phase2_assert_actor_runtime('proposals'),'synthetic','allowlisted synthetic Director passes actor runtime');
SELECT throws_ok(
 $$SELECT public.phase2_assert_runtime('proposals',NULL)$$,
 '42501','A target-bound runtime check is required',
 'entity-bound operations fail when no target is supplied'
);
SELECT throws_ok(
 $$SELECT public.phase2_assert_runtime('proposals','f3000000-0000-4000-8000-000000000099'::uuid)$$,
 '42501','target is outside the active Phase 2 data mode',
 'synthetic actor cannot target an unknown or live proposal'
);

SELECT set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000002',true);
SELECT ok(public.phase2_current_has_capability('budget.review'),'Finance can review budgets');
SELECT ok(NOT public.phase2_current_has_capability('proposal.decide'),'Finance cannot approve or reject proposals');

SELECT set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000003',true);
SELECT ok(NOT public.phase2_current_has_capability('budget.review'),'deny-only budgets override removes Finance review');

SELECT set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000004',true);
SELECT ok(NOT public.phase2_current_has_capability('budget.read'),'System Admin has no operational budget access');

SELECT set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000005',true);
SELECT ok(NOT public.phase2_current_has_capability('proposal.decide'),'inactive accounts have no capability');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;

