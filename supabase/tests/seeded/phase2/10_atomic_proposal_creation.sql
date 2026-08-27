BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT plan(16);

SELECT ok(
  has_function_privilege('authenticated','public.proposal_create_draft_graph(jsonb,jsonb,jsonb)','EXECUTE'),
  'authenticated may execute the reviewed proposal creation RPC'
);
SELECT ok(
  NOT has_function_privilege('anon','public.proposal_create_draft_graph(jsonb,jsonb,jsonb)','EXECUTE'),
  'anon cannot execute proposal creation'
);
SELECT is((
  SELECT count(*) FROM pg_proc p
  WHERE p.oid='public.proposal_create_draft_graph(jsonb,jsonb,jsonb)'::regprocedure
    AND EXISTS(
      SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) privilege
      WHERE privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
    )
),0::bigint,'PUBLIC cannot execute proposal creation');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000003',true);

CREATE TEMP TABLE atomic_created_proposal(result jsonb);
INSERT INTO atomic_created_proposal
SELECT public.proposal_create_draft_graph(
  '{"title":"Synthetic atomic proposal","rationale":"Synthetic proposal created as one governed graph.","objectives":"Synthetic bounded objective","target_beneficiaries":"Synthetic aggregate category","expected_beneficiary_count":10,"expected_output":"Synthetic bounded output","timeline_start":"2026-08-01","timeline_end":"2026-08-31","budget":1000,"barangay_id":"f2100000-0000-4000-8000-000000000001","is_income_generating":false,"informed_by_proposals":[]}',
  '[{"sdg_number":4,"indicator":"Synthetic education indicator"},{"sdg_number":17,"indicator":null}]',
  '{"need_id":"f3300000-0000-4000-8000-000000000001","evidence_snapshot_id":"f27c0000-0000-4000-8000-000000000001","recommendation_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
);
RESET ROLE;

SELECT is((SELECT result->>'status' FROM atomic_created_proposal),'draft','RPC returns a draft');
SELECT is((SELECT (result#>>'{recommendationProvenance,linkCount}')::integer FROM atomic_created_proposal),2,'RPC reports both provenance links');
SELECT is((SELECT count(*) FROM public.project_proposals WHERE id=(SELECT (result->>'id')::uuid FROM atomic_created_proposal)),1::bigint,'one proposal parent is created');
SELECT is((SELECT count(*) FROM public.proposal_sdg_alignment WHERE proposal_id=(SELECT (result->>'id')::uuid FROM atomic_created_proposal)),2::bigint,'all SDG alignments are created');
SELECT is((SELECT count(*) FROM public.proposal_validation_links WHERE proposal_id=(SELECT (result->>'id')::uuid FROM atomic_created_proposal) AND provenance_kind='advisory_planning'),2::bigint,'verified recommendation provenance is created');
SELECT is((SELECT community_validated FROM public.project_proposals WHERE id=(SELECT (result->>'id')::uuid FROM atomic_created_proposal)),false,'advisory provenance does not complete human validation');
SELECT is((SELECT count(*) FROM public.audit_logs WHERE action='proposal.draft.created' AND resource_id=(SELECT result->>'id' FROM atomic_created_proposal)),1::bigint,'one durable creation audit is written');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000003',true);
SELECT throws_ok(
  $$SELECT public.proposal_create_draft_graph(
    '{"title":"Invalid graph","rationale":"Unknown graph fields must fail.","unknown":"blocked"}',
    '[]',NULL
  )$$,
  '22023','invalid proposal fields','unknown proposal keys are rejected'
);
SELECT throws_ok(
  $$SELECT public.proposal_create_draft_graph(
    '{"title":"Invalid SDG graph","rationale":"Duplicate SDG values must fail."}',
    '[{"sdg_number":4,"indicator":null},{"sdg_number":4,"indicator":null}]',NULL
  )$$,
  '22023','invalid SDG alignments','duplicate SDG values are rejected'
);
SELECT throws_ok(
  $$SELECT public.proposal_create_draft_graph(
    '{"title":"Invalid provenance","rationale":"Cross barangay provenance must fail.","barangay_id":"f2100000-0000-4000-8000-000000000002"}',
    '[]',
    '{"need_id":"f3300000-0000-4000-8000-000000000001","evidence_snapshot_id":null,"recommendation_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
  )$$,
  '23503','recommendation need is not approved for the proposal barangay','cross-barangay recommendation provenance is rejected'
);
SELECT is((SELECT count(*) FROM public.project_proposals WHERE title IN ('Invalid graph','Invalid SDG graph','Invalid provenance')),0::bigint,'failed graph requests create no proposal parent');

SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000021',true);
SELECT throws_ok(
  $$SELECT public.proposal_create_draft_graph(
    '{"title":"Denied proposal","rationale":"Deny overrides must be enforced in SQL."}',
    '[]',NULL
  )$$,
  '42501','forbidden','deny-only proposal override is enforced by the RPC'
);
SELECT is((SELECT count(*) FROM public.project_proposals WHERE title='Denied proposal'),0::bigint,'denied creation leaves no proposal row');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
