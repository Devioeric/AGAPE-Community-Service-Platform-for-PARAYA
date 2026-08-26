BEGIN;
SELECT plan(23);

UPDATE public.phase2_component_runtime SET mode='synthetic',implementation_date='2026-01-01',retrospective_years=5,
 synthetic_user_ids=ARRAY['f2200000-0000-4000-8000-000000000004'::uuid],
 synthetic_entity_ids=(SELECT array_agg(id ORDER BY id) FROM public.historical_programs WHERE data_mode='synthetic')
WHERE component='historical_programs';
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000004',true);

SELECT throws_ok(
 $$SELECT public.phase2_transition_historical_program('f3200000-0000-4000-8000-000000000002', 'submit', 1, NULL, NULL)$$,
 '42501','invalid or ineligible submit transition','unknown-date history cannot leave draft'
);
SELECT is((public.phase2_get_historical_program('f3200000-0000-4000-8000-000000000001')->>'id')::uuid,'f3200000-0000-4000-8000-000000000001'::uuid,'authorized staff receive allowlisted historical detail');
SELECT is(public.phase2_historical_allowed_quality('f3200000-0000-4000-8000-000000000001'),'partial_verified','verified evidence cannot hide missing completeness fields');

CREATE TEMP TABLE packet14_program AS
 SELECT public.phase2_create_historical_program(jsonb_build_object(
  'title','Synthetic Complete Retrospective Program','summary','Aggregate synthetic program summary','category','education','date_precision','year',
  'starts_on','2023-01-01','ends_on','2023-12-31','beneficiary_count',30,'volunteer_count',8,'volunteer_hours','42.50','budget_total','1500.00','currency','PHP',
  'resources','Aggregate learning kits','historical_need_description','Aggregate learning access gap','outcomes','Aggregate participation improved','follow_up','Aggregate follow-up completed',
  'source_type','paper','source_notes','Reviewed synthetic source register','partner_ids',jsonb_build_array('f3100000-0000-4000-8000-000000000001'),
  'barangay_ids',jsonb_build_array('f2100000-0000-4000-8000-000000000001'),'need_ids',jsonb_build_array('f3300000-0000-4000-8000-000000000001'),
  'sdgs',jsonb_build_array(jsonb_build_object('number',4,'source','documented'),jsonb_build_object('number',17,'source','retrospective'))
 )) id;
SELECT ok((SELECT id IS NOT NULL FROM packet14_program),'complete historical draft graph is created atomically');
SELECT ok((SELECT id=ANY(synthetic_entity_ids) FROM public.phase2_component_runtime,packet14_program WHERE component='historical_programs'),'created synthetic root is added to the component allowlist');
SELECT is((SELECT count(*) FROM public.historical_program_versions v,packet14_program p WHERE v.historical_program_id=p.id),1::bigint,'creation freezes the initial graph version');
CREATE TEMP TABLE packet14_update AS SELECT public.phase2_update_historical_program_v2(
 (SELECT id FROM packet14_program),1,jsonb_build_object('summary','Corrected aggregate synthetic summary','sdgs',jsonb_build_array(jsonb_build_object('number',4,'source','documented')))
) value;
SELECT is((SELECT (value->>'rowVersion')::integer FROM packet14_update),2,'graph correction returns the next row version');
SELECT is((SELECT count(*) FROM public.historical_program_sdg_links l,packet14_program p WHERE l.historical_program_id=p.id),1::bigint,'graph correction replaces SDG junctions atomically');
SELECT is((public.phase2_transition_historical_program((SELECT id FROM packet14_program),'submit',2,NULL,NULL)->>'rowVersion')::integer,3,'submit is version checked');
SELECT throws_ok(
 $$SELECT public.phase2_transition_historical_program((SELECT id FROM packet14_program),'accept',3,'complete','Synthetic quality review')$$,
 '23514','quality exceeds the evidence-supported tier','reviewer cannot overstate evidence quality'
);
SELECT is((public.phase2_transition_historical_program((SELECT id FROM packet14_program),'accept',3,'partial_unverified','Synthetic quality review')->>'status'),'accepted','eligible record can be accepted with its supported quality');
SELECT is((public.phase2_get_historical_analytics()->>'schema'),'agape.historical-programs.aggregate.v2','quality analytics use the versioned aggregate contract');
SELECT is((public.phase2_get_historical_analytics()->'verifiedHistorical'->>'recordCount')::integer,1,'verified history remains separately counted');
SELECT is((public.phase2_get_historical_analytics()->'unverifiedHistorical'->>'recordCount')::integer,1,'unverified history remains separately counted');
SELECT is((SELECT count(DISTINCT classification_source) FROM public.historical_program_sdg_links WHERE historical_program_id='f3200000-0000-4000-8000-000000000001'),2::bigint,'documented and retrospective SDG sources remain distinct');

CREATE TEMP TABLE packet14_batch AS SELECT (public.phase2_stage_historical_import(
 repeat('b',64),'agape.historical-programs.v2.1',jsonb_build_array(jsonb_build_object(
  'row_key','SYN-IMPORT-DUPLICATE','errors','[]'::jsonb,'data',jsonb_build_object(
   'title','Synthetic Verified History','summary','Aggregate duplicate candidate','category','education','date_precision','year','starts_on','2024-01-01','ends_on',NULL,
   'beneficiary_count',20,'volunteer_count',4,'volunteer_hours','12.00','budget_total','500.00','currency','PHP','resources','Aggregate kits',
   'historical_need_description','Aggregate need','outcomes','Aggregate outcome','follow_up','Aggregate follow-up','source_type','paper','source_notes','Synthetic source',
   'partner_codes',jsonb_build_array('SYN-PTR-001'),'barangay_codes',jsonb_build_array('SYN-PTR-007'),
   'need_ids',jsonb_build_array('f3300000-0000-4000-8000-000000000001'),'sdgs',jsonb_build_array(jsonb_build_object('number',4,'source','documented'))
  )
 )),NULL
)->>'batchId')::uuid id;
SELECT is((SELECT status FROM public.historical_program_import_batches b,packet14_batch x WHERE b.id=x.id),'needs_correction','duplicate import waits for an explicit decision');
SELECT ok((SELECT jsonb_array_length(public.phase2_get_historical_import_batch(id)->'rows'->0->'candidates')>0 FROM packet14_batch),'batch detail exposes allowlisted duplicate comparisons');
SELECT is((public.phase2_resolve_historical_duplicate_v2((SELECT id FROM packet14_batch),'SYN-IMPORT-DUPLICATE',NULL,'distinct','Synthetic records are distinct')->>'status'),'ready','one row-level decision resolves every candidate comparison');
SELECT is((SELECT count(*) FROM public.historical_program_import_resolutions x,packet14_batch b WHERE x.batch_id=b.id),1::bigint,'exactly one effective resolution is retained per row');
CREATE TEMP TABLE packet14_commit AS SELECT public.phase2_commit_historical_import((SELECT id FROM packet14_batch)) value;
SELECT is((SELECT (value->>'created')::integer FROM packet14_commit),1,'ready import commits one draft atomically');
SELECT ok((public.phase2_commit_historical_import((SELECT id FROM packet14_batch))->>'idempotent')::boolean,'commit retry returns the retained result');
SELECT ok((SELECT r.sanitized_data IS NULL AND r.row_key LIKE 'purged-%' FROM public.historical_program_import_rows r,packet14_batch b WHERE r.batch_id=b.id),'committed staged payload and row key are purged');
SELECT is((SELECT count(*) FROM public.historical_program_import_resolutions x,packet14_batch b WHERE x.batch_id=b.id),1::bigint,'immutable duplicate resolution survives staged-data purge');

SELECT * FROM finish();
ROLLBACK;
