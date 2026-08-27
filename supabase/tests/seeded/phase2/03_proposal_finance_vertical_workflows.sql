BEGIN;
SELECT plan(43);

UPDATE public.phase2_component_runtime SET mode='synthetic',
 synthetic_user_ids=ARRAY[
  'f2200000-0000-4000-8000-000000000002'::uuid,'f2200000-0000-4000-8000-000000000003'::uuid,
  'f2200000-0000-4000-8000-000000000004'::uuid,'f2200000-0000-4000-8000-000000000005'::uuid],
 synthetic_entity_ids=CASE component
  WHEN 'proposals' THEN ARRAY['f3310000-0000-4000-8000-000000000001'::uuid]
  WHEN 'program_finance' THEN ARRAY['f3320000-0000-4000-8000-000000000001'::uuid]
  ELSE synthetic_entity_ids END
WHERE component IN('proposals','program_finance');
UPDATE public.phase2_cutover_state SET write_authority='v2',reconciliation_hash=repeat('c',64),reconciled_at=now(),
 changed_by='f2200000-0000-4000-8000-000000000002' WHERE component='proposals';
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000003',true);

SELECT ok(NOT has_function_privilege('authenticated','public.phase2_save_proposal_graph(uuid,integer,jsonb)','EXECUTE'),'legacy proposal graph RPC is retired');
SELECT ok(NOT has_function_privilege('authenticated','public.phase2_apply_proposal_action(uuid,text,integer,text,text[])','EXECUTE'),'legacy workflow RPC is retired');
SELECT ok(NOT has_function_privilege('authenticated','public.phase2_record_expenditure(uuid,jsonb)','EXECUTE'),'legacy expenditure RPC is retired');
SELECT is(public.phase2_calculate_beneficiary_estimate('synthetic_households','f2100000-0000-4000-8000-000000000001','f2300000-0000-4000-8000-000000000001','f27c0000-0000-4000-8000-000000000001')->>'schema','agape.beneficiary-estimate.v2','planning estimate uses the fixed aggregate contract');
SELECT ok((public.phase2_calculate_beneficiary_estimate('synthetic_households','f2100000-0000-4000-8000-000000000001',NULL,'f27c0000-0000-4000-8000-000000000001')->>'suppressed')::boolean,'suppressed planning cell has no count');
SELECT is(jsonb_array_length(public.phase2_get_proposal_catalog()->'sdgs'),17,'proposal catalog exposes the complete SDG set');
SELECT is(jsonb_array_length(public.phase2_list_beneficiary_evidence_options('f2100000-0000-4000-8000-000000000001')),1,'proposal planning lists the compatible completed aggregate snapshot');
SELECT ok(NOT (public.phase2_list_beneficiary_evidence_options('f2100000-0000-4000-8000-000000000001')->0 ? 'cells'),'evidence choices never expose aggregate cells or drill-through data');

CREATE TEMP TABLE packet15_proposal AS
 SELECT public.phase2_save_proposal_graph_v2(NULL,0,jsonb_build_object(
  'title','Synthetic Packet 15 Proposal','description','Structured synthetic proposal for executable workflow testing.',
  'origin_channel','paraya_internal','originating_partner_id',NULL,'responsible_officer_id','f2200000-0000-4000-8000-000000000003',
  'project_category_id','f3330000-0000-4000-8000-000000000001','starts_on','2026-10-01','ends_on','2026-10-15',
  'targets',jsonb_build_array(jsonb_build_object('barangay_id','f2100000-0000-4000-8000-000000000001','sitio_id','f2300000-0000-4000-8000-000000000001','is_lead',true)),
  'needs',jsonb_build_array(jsonb_build_object('need_id','f3300000-0000-4000-8000-000000000001','target_area_key','f2100000-0000-4000-8000-000000000001:f2300000-0000-4000-8000-000000000001','intended_coverage','partial','planned_beneficiary_count',12,'planned_beneficiary_percentage',NULL,'notes','Synthetic partial coverage')),
  'beneficiary_category_codes',jsonb_build_array('synthetic_households'),'final_beneficiary_count',12,
  'beneficiary_source_description','Reviewed synthetic manual planning register.',
  'beneficiary_estimates',jsonb_build_array(jsonb_build_object('category_code','synthetic_households','target_area_key','f2100000-0000-4000-8000-000000000001:f2300000-0000-4000-8000-000000000001','evidence_snapshot_id',NULL,'final_count',12,'manual_source_description','Reviewed synthetic manual planning register.','override_reason',NULL)),
  'sdg_numbers',jsonb_build_array(4,17),'zero_cash',false,'zero_cash_justification',NULL,
  'budget_items',jsonb_build_array(jsonb_build_object('category_id','f3340000-0000-4000-8000-000000000001','item_kind','cash','description','Synthetic workshop materials','quantity','10.000','unit','kit','unit_cost','100.00','in_kind_valuation',NULL,'notes',NULL,'sort_order',1)),
  'funding_sources',jsonb_build_array(jsonb_build_object('source_type','internal_dyci','source_state','expected','partner_id',NULL,'cash_value','1000.00','in_kind_value','0.00','notes',NULL))
 )) value;
SELECT ok((SELECT (value->>'id')::uuid IS NOT NULL FROM packet15_proposal),'proposal graph is created atomically');
SELECT ok((SELECT (value->>'id')::uuid=ANY(synthetic_entity_ids) FROM packet15_proposal,public.phase2_component_runtime WHERE component='proposals'),'new synthetic proposal root is allowlisted');
SELECT is((SELECT (value->>'rowVersion')::integer FROM packet15_proposal),1,'proposal create returns its row version');
SELECT is((SELECT public.phase2_proposal_required_warnings((value->>'id')::uuid) FROM packet15_proposal),ARRAY['manual_beneficiary_source']::text[],'trusted rules derive the manual-estimate warning');
SELECT throws_ok(
 $$SELECT public.phase2_apply_proposal_action_v2((SELECT (value->>'id')::uuid FROM packet15_proposal),'submit',1,NULL,'{}')$$,
 '23514','warning acknowledgements do not match current trusted warnings','submission cannot omit a current warning'
);
SELECT is((SELECT public.phase2_apply_proposal_action_v2((value->>'id')::uuid,'submit',1,NULL,ARRAY['manual_beneficiary_source'])->>'status' FROM packet15_proposal),'submitted','acknowledged complete graph submits');
SELECT is((SELECT r.status FROM public.proposal_budget_revisions r JOIN packet15_proposal p ON r.proposal_id=(p.value->>'id')::uuid),'submitted','submission freezes the active budget');
SELECT ok((SELECT r.frozen_snapshot IS NOT NULL AND r.canonical_hash=encode(extensions.digest(convert_to(r.frozen_snapshot::text,'UTF8'),'sha256'),'hex') FROM public.proposal_budget_revisions r JOIN packet15_proposal p ON r.proposal_id=(p.value->>'id')::uuid),'budget hash reproduces from exact canonical JSON');
SELECT throws_ok(
 $$UPDATE public.proposal_budget_items SET description='forged' WHERE revision_id=(SELECT r.id FROM public.proposal_budget_revisions r,packet15_proposal p WHERE r.proposal_id=(p.value->>'id')::uuid)$$,
 '42501','budget revision children are immutable after submission','submitted budget children cannot be changed'
);
SELECT is((SELECT public.phase2_apply_proposal_action_v2((value->>'id')::uuid,'pass_pre_screening',2,NULL,'{}')->>'status' FROM packet15_proposal),'pre_screening','human pre-screening starts');
SELECT is((SELECT public.phase2_apply_proposal_action_v2((value->>'id')::uuid,'pass_pre_screening',3,NULL,'{}')->>'status' FROM packet15_proposal),'evidence_review','human pre-screening completes');
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000004',true);
SELECT is((SELECT public.phase2_apply_proposal_action_v2((value->>'id')::uuid,'confirm_evidence',4,NULL,'{}')->>'status' FROM packet15_proposal),'finance_review','Researcher confirms evidence review');
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000005',true);
SELECT ok((SELECT (public.phase2_get_finance_proposal((value->>'id')::uuid)#>>'{budget,reconciled}')::boolean FROM packet15_proposal),'Finance receives a reconciled allowlisted budget DTO');
SELECT is((SELECT public.phase2_apply_proposal_action_v2((value->>'id')::uuid,'finance_clear',5,'Synthetic Finance clearance','{}')->>'status' FROM packet15_proposal),'director_review','Finance clearance advances only to Director review');
SELECT throws_ok(
 $$SELECT public.phase2_apply_proposal_action_v2((SELECT (value->>'id')::uuid FROM packet15_proposal),'director_approve',6,'Synthetic final approval','{}')$$,
 '42501','invalid Director decision','Finance cannot make the final decision'
);
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000002',true);
SELECT is((SELECT public.phase2_apply_proposal_action_v2((value->>'id')::uuid,'director_approve',6,'Synthetic Director approval','{}')->>'status' FROM packet15_proposal),'approved','Director alone approves the proposal');
SELECT ok((SELECT EXISTS(SELECT 1 FROM public.proposal_versions v WHERE v.proposal_id=(p.value->>'id')::uuid AND v.reason='final_decision'
 AND v.canonical_hash=encode(extensions.digest(convert_to(v.snapshot::text,'UTF8'),'sha256'),'hex')) FROM packet15_proposal p),'final proposal snapshot hash is reproducible');

SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000003',true);
CREATE TEMP TABLE packet15_handoff AS SELECT public.phase2_handoff_proposal_v2((value->>'id')::uuid,7) value FROM packet15_proposal;
SELECT ok((SELECT (value->>'programId')::uuid IS NOT NULL FROM packet15_handoff),'approved frozen snapshots hand off to one program');
SELECT is((SELECT public.phase2_handoff_proposal_v2((p.value->>'id')::uuid,7)->>'programId' FROM packet15_proposal p),(SELECT value->>'programId' FROM packet15_handoff),'handoff retry returns the same program');
SELECT ok((SELECT (value->>'programId')::uuid=ANY(synthetic_entity_ids) FROM packet15_handoff,public.phase2_component_runtime WHERE component='program_finance'),'handed-off synthetic program is allowlisted');

CREATE TEMP TABLE packet15_allocation AS SELECT public.phase2_prepare_program_allocation((h.value->>'programId')::uuid,1,jsonb_build_object(
 'reason','Synthetic allocation revision','items',jsonb_build_array(jsonb_build_object('source_item_id',NULL,'category_id','f3340000-0000-4000-8000-000000000001','kind','cash','description','Revised synthetic allocation','allocated_amount','1500.00','sort_order',1)))) value FROM packet15_handoff h;
SELECT is((SELECT value->>'status' FROM packet15_allocation),'draft','Associate prepares a new allocation revision');
SELECT is((SELECT public.phase2_apply_program_allocation_action((h.value->>'programId')::uuid,(a.value->>'id')::uuid,'submit',1,NULL)->>'status' FROM packet15_handoff h,packet15_allocation a),'submitted','allocation is submitted without Finance editing');
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000005',true);
SELECT is((SELECT public.phase2_apply_program_allocation_action((h.value->>'programId')::uuid,(a.value->>'id')::uuid,'activate',2,'Synthetic Finance verification')->>'status' FROM packet15_handoff h,packet15_allocation a),'active','Finance activates the frozen allocation');
SELECT is((SELECT count(*) FROM public.program_budget_revisions r,packet15_handoff h WHERE r.program_id=(h.value->>'programId')::uuid AND r.status='superseded'),1::bigint,'previous allocation is superseded, not rewritten');

SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000003',true);
SELECT throws_ok(
 $$SELECT public.phase2_record_expenditure_v2((SELECT (value->>'programId')::uuid FROM packet15_handoff),jsonb_build_object('budget_item_id',(SELECT i.id FROM public.program_budget_items i,packet15_allocation a WHERE i.revision_id=(a.value->>'id')::uuid),'amount','1600.00','spent_on','2026-10-02','payee_label','Synthetic supplier','description','Visible synthetic variance','receipt_document_id',NULL,'receipt_exception_reason','Synthetic receipt exception','variance_explanation',NULL))$$,
 '23514','visible overspending requires a variance explanation','overspending without explanation is rejected'
);
CREATE TEMP TABLE packet15_expenditure AS SELECT public.phase2_record_expenditure_v2((h.value->>'programId')::uuid,jsonb_build_object(
 'budget_item_id',(SELECT i.id FROM public.program_budget_items i WHERE i.revision_id=(a.value->>'id')::uuid),'amount','1600.00','spent_on','2026-10-02','payee_label','Synthetic supplier','description','Visible synthetic variance','receipt_document_id',NULL,'receipt_exception_reason','Synthetic receipt exception','variance_explanation','Synthetic approved overspending variance')) value FROM packet15_handoff h,packet15_allocation a;
SELECT is((SELECT value->>'status' FROM packet15_expenditure),'pending','explained variance is recorded as pending');
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000005',true);
SELECT lives_ok($$SELECT public.phase2_review_expenditure((SELECT (value->>'programId')::uuid FROM packet15_handoff),(SELECT (value->>'id')::uuid FROM packet15_expenditure),'verify',1,'Synthetic Finance verification')$$,'Finance verifies without editing the expenditure');
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000003',true);
CREATE TEMP TABLE packet15_liquidation AS SELECT public.phase2_create_liquidation_v2((h.value->>'programId')::uuid,
 jsonb_build_object('period_start','2026-10-01','period_end','2026-10-15','narrative','Synthetic liquidation narrative.','exception_notes',NULL),
 ARRAY[(e.value->>'id')::uuid]) value FROM packet15_handoff h,packet15_expenditure e;
SELECT is((SELECT value->>'status' FROM packet15_liquidation),'draft','strict liquidation is created from explicit expenditures');
SELECT is((SELECT public.phase2_update_liquidation((h.value->>'programId')::uuid,(l.value->>'id')::uuid,1,
 jsonb_build_object('period_start','2026-10-01','period_end','2026-10-15','narrative','Corrected synthetic liquidation narrative.','exception_notes',NULL),ARRAY[(e.value->>'id')::uuid])->>'rowVersion'
 FROM packet15_handoff h,packet15_liquidation l,packet15_expenditure e),'2','draft liquidation correction is versioned');
SELECT is((SELECT public.phase2_apply_liquidation_action_v2((h.value->>'programId')::uuid,(l.value->>'id')::uuid,'submit',2,NULL)->>'status' FROM packet15_handoff h,packet15_liquidation l),'submitted','preparer submits liquidation');
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000005',true);
SELECT is((SELECT public.phase2_apply_liquidation_action_v2((h.value->>'programId')::uuid,(l.value->>'id')::uuid,'verify',3,'Synthetic liquidation verification')->>'status' FROM packet15_handoff h,packet15_liquidation l),'verified','Finance verifies liquidation without editing figures');
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000003',true);
SELECT throws_ok(
 $$SELECT public.phase2_create_liquidation_v2((SELECT (value->>'programId')::uuid FROM packet15_handoff),jsonb_build_object('period_start','2026-10-01','period_end','2026-10-15','narrative','Overlapping synthetic liquidation.','exception_notes',NULL),ARRAY[(SELECT (value->>'id')::uuid FROM packet15_expenditure)])$$,
 '23505','an expenditure is already claimed by another liquidation','active liquidation claims cannot overlap'
);
SELECT ok((SELECT (public.phase2_get_program_finance((value->>'programId')::uuid)#>>'{totals,variance}')::numeric>0 FROM packet15_handoff),'Finance DTO exposes visible overspending variance');
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000005',true);
SELECT throws_ok(
 $$SELECT public.phase2_record_expenditure_v2((SELECT (value->>'programId')::uuid FROM packet15_handoff),jsonb_build_object('budget_item_id',(SELECT i.id FROM public.program_budget_items i,packet15_allocation a WHERE i.revision_id=(a.value->>'id')::uuid),'amount','1.00','spent_on','2026-10-03','payee_label',NULL,'description','Forbidden Finance edit','receipt_document_id',NULL,'receipt_exception_reason','Synthetic receipt exception','variance_explanation','Synthetic variance explanation'))$$,
 '42501','forbidden','Finance cannot record or edit expenditure figures'
);
SELECT ok((SELECT count(*)>=9 FROM public.program_finance_events e,packet15_handoff h WHERE e.program_id=(h.value->>'programId')::uuid),'allocation, expenditure, and liquidation transitions append durable events');

SELECT * FROM finish();
ROLLBACK;
