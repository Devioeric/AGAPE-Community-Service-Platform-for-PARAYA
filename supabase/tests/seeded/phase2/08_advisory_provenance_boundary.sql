BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT plan(10);

SELECT has_column('public','proposal_validation_links','provenance_kind','validation links classify provenance');
SELECT col_default_is('public','proposal_validation_links','provenance_kind','validation','ordinary links default to validation');
SELECT ok(NOT has_function_privilege('authenticated','public.recompute_community_validated(uuid)','EXECUTE'),'authenticated cannot invoke validation recomputation directly');

SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claim.sub','',true);

INSERT INTO public.project_proposals(
  id,title,rationale,barangay_id,status,created_by,community_validated
) VALUES (
  'f39a0000-0000-4000-8000-000000000001',
  'Synthetic advisory provenance boundary',
  'Synthetic proposal used only inside the rolled-back database test.',
  'f2100000-0000-4000-8000-000000000001',
  'draft',
  'f2200000-0000-4000-8000-000000000003',
  false
);

INSERT INTO public.proposal_validation_links(
  proposal_id,source_type,source_id,provenance_kind,rationale,linked_by
) VALUES
  ('f39a0000-0000-4000-8000-000000000001','community_need','f3300000-0000-4000-8000-000000000001','advisory_planning','Preserved from advisory recommendation '||repeat('a',64)||'; explicit human draft creation.','f2200000-0000-4000-8000-000000000003'),
  ('f39a0000-0000-4000-8000-000000000001','profiling_evidence_snapshot','f27c0000-0000-4000-8000-000000000001','advisory_planning','Preserved from advisory recommendation '||repeat('a',64)||'; explicit human draft creation.','f2200000-0000-4000-8000-000000000003');

SELECT isnt((SELECT count(*) FROM public.proposal_validation_links WHERE proposal_id='f39a0000-0000-4000-8000-000000000001' AND provenance_kind='advisory_planning'),0::bigint,'planning provenance is retained');
SELECT is((SELECT community_validated FROM public.project_proposals WHERE id='f39a0000-0000-4000-8000-000000000001'),false,'two advisory links do not complete human validation');

UPDATE public.proposal_validation_links
SET provenance_kind='validation', rationale='Officer reviewed the approved need as direct planning evidence.'
WHERE proposal_id='f39a0000-0000-4000-8000-000000000001'
  AND source_type='community_need';
SELECT is((SELECT community_validated FROM public.project_proposals WHERE id='f39a0000-0000-4000-8000-000000000001'),false,'one human-validation link is insufficient');

INSERT INTO public.proposal_validation_links(
  proposal_id,source_type,source_id,provenance_kind,rationale,linked_by
) VALUES (
  'f39a0000-0000-4000-8000-000000000001',
  'survey',
  'f39a0000-0000-4000-8000-000000000002',
  'validation',
  'Officer reviewed the supporting synthetic community survey.',
  'f2200000-0000-4000-8000-000000000003'
);
SELECT is((SELECT community_validated FROM public.project_proposals WHERE id='f39a0000-0000-4000-8000-000000000001'),true,'two human links including an approved same-barangay need complete validation');
SELECT ok((SELECT community_validated_at IS NOT NULL FROM public.project_proposals WHERE id='f39a0000-0000-4000-8000-000000000001'),'completed validation records its time');

DELETE FROM public.proposal_validation_links
WHERE proposal_id='f39a0000-0000-4000-8000-000000000001'
  AND source_type='survey';
SELECT is((SELECT community_validated FROM public.project_proposals WHERE id='f39a0000-0000-4000-8000-000000000001'),false,'removing qualifying evidence clears validation');
SELECT ok((SELECT community_validated_at IS NULL FROM public.project_proposals WHERE id='f39a0000-0000-4000-8000-000000000001'),'cleared validation removes the stale completion time');

SELECT * FROM finish();
ROLLBACK;
