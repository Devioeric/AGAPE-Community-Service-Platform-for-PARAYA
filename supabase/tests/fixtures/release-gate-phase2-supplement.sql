-- Phase 2 supplement. Apply only after release-gate-phase1.sql on the full scope.
-- It deliberately leaves every component off and both cutovers at V1.

-- The disposable fixture is loaded by the trusted local database owner. Clear
-- any ambient PostgREST actor claims before inserting frozen workflow states;
-- authenticated application actors must use the reviewed transition RPCs.
SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT set_config('request.jwt.claim.sub','',false);

UPDATE public.partner_entities
SET data_mode='synthetic'
WHERE barangay_id IN('f2100000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000002')
   OR source_key IN('legacy-user:f2200000-0000-4000-8000-000000000013','legacy-user:f2200000-0000-4000-8000-000000000014','legacy-user:f2200000-0000-4000-8000-000000000015');

INSERT INTO public.partner_entities(id,code,name,entity_type,classification,source_kind,source_key,data_mode,created_by) VALUES
 ('f3100000-0000-4000-8000-000000000001','SYN-PTR-001','Synthetic External Organization','external_organization','external','native','synthetic:external','synthetic','f2200000-0000-4000-8000-000000000003'),
 ('f3100000-0000-4000-8000-000000000002','SYN-PTR-002','Synthetic Government Agency','government_agency','external','native','synthetic:government','synthetic','f2200000-0000-4000-8000-000000000003'),
 ('f3100000-0000-4000-8000-000000000003','SYN-PTR-003','Synthetic School','school','external','native','synthetic:school','synthetic','f2200000-0000-4000-8000-000000000003'),
 ('f3100000-0000-4000-8000-000000000004','SYN-PTR-004','Synthetic Faith Community','faith_based','external','native','synthetic:faith','synthetic','f2200000-0000-4000-8000-000000000003'),
 ('f3100000-0000-4000-8000-000000000005','SYN-PTR-005','Synthetic Other Entity','other','external','native','synthetic:other','synthetic','f2200000-0000-4000-8000-000000000003'),
 ('f3100000-0000-4000-8000-000000000006','LIVE-PTR-CANARY','Live Classification Canary','other','external','native','canary:live','live','f2200000-0000-4000-8000-000000000003'),
 ('f3100000-0000-4000-8000-00000000000b','SYN-PTR-011','Synthetic External Duplicate Candidate','external_organization','external','native','synthetic:external-duplicate','synthetic','f2200000-0000-4000-8000-000000000003')
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.partner_entities(id,code,name,entity_type,classification,barangay_id,source_kind,source_key,data_mode,created_by) VALUES
 ('f3100000-0000-4000-8000-000000000007','SYN-PTR-007','Synthetic Barangay Partner','barangay','external','f2100000-0000-4000-8000-000000000001','barangay_backfill','barangay:f2100000-0000-4000-8000-000000000001','synthetic','f2200000-0000-4000-8000-000000000003'),
 ('f3100000-0000-4000-8000-000000000008','SYN-PTR-008','Synthetic DYCI Office','dyci_office','internal',NULL,'legacy_account','legacy-user:f2200000-0000-4000-8000-000000000013','synthetic','f2200000-0000-4000-8000-000000000003'),
 ('f3100000-0000-4000-8000-000000000009','SYN-PTR-009','Synthetic Student Organization','student_organization','internal',NULL,'legacy_account','legacy-user:f2200000-0000-4000-8000-000000000014','synthetic','f2200000-0000-4000-8000-000000000003'),
 ('f3100000-0000-4000-8000-00000000000a','SYN-PTR-010','Synthetic Academic Department','academic_department','internal',NULL,'legacy_account','legacy-user:f2200000-0000-4000-8000-000000000015','synthetic','f2200000-0000-4000-8000-000000000003'),
 ('f3100000-0000-4000-8000-00000000000c','SYN-PTR-012','Synthetic Second Barangay Partner','barangay','external','f2100000-0000-4000-8000-000000000002','barangay_backfill','barangay:f2100000-0000-4000-8000-000000000002','synthetic','f2200000-0000-4000-8000-000000000003')
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.partner_entity_roles(partner_id,role,created_by)
SELECT id,r.role,'f2200000-0000-4000-8000-000000000003' FROM public.partner_entities
CROSS JOIN (VALUES('partner'),('proponent')) r(role)
WHERE data_mode='synthetic' ON CONFLICT DO NOTHING;

INSERT INTO public.partner_contacts(id,partner_id,full_name,title,email,preferred_channel,is_primary,status_email_opt_in,consent_source,consent_at,active_from,created_by) VALUES
 ('f3110000-0000-4000-8000-000000000001','f3100000-0000-4000-8000-000000000001','Synthetic Primary Contact','Coordinator','contact@release-gate.invalid','email',true,true,'synthetic fixture','2026-01-01T00:00:00Z','2026-01-01','f2200000-0000-4000-8000-000000000003'),
 ('f3110000-0000-4000-8000-000000000002','f3100000-0000-4000-8000-000000000001','Synthetic Former Contact','Former Coordinator','former-contact@release-gate.invalid','email',false,false,NULL,NULL,'2025-01-01','f2200000-0000-4000-8000-000000000003')
ON CONFLICT(id) DO NOTHING;
UPDATE public.partner_contacts SET active_until='2025-12-31' WHERE id='f3110000-0000-4000-8000-000000000002' AND active_until IS NULL;

INSERT INTO public.partnership_terms(id,partner_id,status,starts_on,expires_on,responsible_officer_id,agreement_exception_reason,agreement_exception_due_on,created_by) VALUES
 ('f3120000-0000-4000-8000-000000000001','f3100000-0000-4000-8000-000000000001','proposed','2026-01-01','2026-12-31','f2200000-0000-4000-8000-000000000003','Synthetic document pending','2026-02-01','f2200000-0000-4000-8000-000000000003') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.partnership_documents(id,partner_id,term_id,document_type,original_name,storage_path,sha256,mime_type,size_bytes,scan_status,uploaded_by) VALUES
 ('f3130000-0000-4000-8000-000000000001','f3100000-0000-4000-8000-000000000001','f3120000-0000-4000-8000-000000000001','agreement','synthetic-agreement.pdf','f3100000-0000-4000-8000-000000000001/'||repeat('3',64)||'.pdf',repeat('3',64),'application/pdf',128,'quarantined','f2200000-0000-4000-8000-000000000003') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.partnership_events(id,partner_id,term_id,event_type,actor_id,reason,snapshot) VALUES
 ('f3140000-0000-4000-8000-000000000001','f3100000-0000-4000-8000-000000000001','f3120000-0000-4000-8000-000000000001','created','f2200000-0000-4000-8000-000000000003','Synthetic fixture','{"data_mode":"synthetic"}') ON CONFLICT(id) DO NOTHING;

INSERT INTO public.legacy_account_partner_mappings(legacy_user_id,partner_id,responsible_officer_id,reconciliation_status,proposal_count,program_count,pending_work_count,row_version) VALUES
 ('f2200000-0000-4000-8000-000000000013','f3100000-0000-4000-8000-000000000008','f2200000-0000-4000-8000-000000000003','in_review',0,0,0,2),
 ('f2200000-0000-4000-8000-000000000014','f3100000-0000-4000-8000-000000000009','f2200000-0000-4000-8000-000000000003','in_review',0,0,0,2),
 ('f2200000-0000-4000-8000-000000000015','f3100000-0000-4000-8000-00000000000a','f2200000-0000-4000-8000-000000000003','in_review',0,0,0,2)
ON CONFLICT(legacy_user_id) DO NOTHING;
UPDATE public.legacy_account_partner_mappings m SET responsible_officer_id='f2200000-0000-4000-8000-000000000003',reconciliation_status='in_review',row_version=2
FROM public.partner_entities p WHERE p.id=m.partner_id AND p.data_mode='synthetic';

INSERT INTO public.historical_programs(id,code,title,summary,category,date_precision,starts_on,beneficiary_count,source_type,status,quality,created_by,data_mode) VALUES
 ('f3200000-0000-4000-8000-000000000001','SYN-HIST-001','Synthetic Verified History','Aggregate-only synthetic history.','education','year','2024-01-01',20,'paper','accepted','partial_verified','f2200000-0000-4000-8000-000000000004','synthetic'),
 ('f3200000-0000-4000-8000-000000000002','SYN-HIST-002','Synthetic Unverified History',NULL,'health','unknown',NULL,NULL,'other','draft','unverified','f2200000-0000-4000-8000-000000000004','synthetic'),
 ('f3200000-0000-4000-8000-000000000003','LIVE-HIST-CANARY','Live History Canary',NULL,'other','unknown',NULL,NULL,'other','draft','unverified','f2200000-0000-4000-8000-000000000004','live')
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.historical_program_versions(id,historical_program_id,version_number,snapshot,canonical_hash,reason,created_by) VALUES
 ('f3210000-0000-4000-8000-000000000001','f3200000-0000-4000-8000-000000000001',1,'{"code":"SYN-HIST-001"}',repeat('4',64),'synthetic fixture','f2200000-0000-4000-8000-000000000004') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.historical_program_events(id,historical_program_id,action,to_status,quality,remarks,actor_id) VALUES
 ('f3220000-0000-4000-8000-000000000001','f3200000-0000-4000-8000-000000000001','accepted','accepted','partial_verified','Synthetic review','f2200000-0000-4000-8000-000000000004') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.historical_program_sdg_links(historical_program_id,sdg_number,classification_source) VALUES
 ('f3200000-0000-4000-8000-000000000001',4,'documented'),('f3200000-0000-4000-8000-000000000001',17,'retrospective') ON CONFLICT DO NOTHING;
INSERT INTO public.historical_program_partner_links(historical_program_id,partner_id) VALUES
 ('f3200000-0000-4000-8000-000000000001','f3100000-0000-4000-8000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.historical_program_barangay_links(historical_program_id,barangay_id) VALUES
 ('f3200000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.historical_program_documents(id,historical_program_id,original_name,storage_path,sha256,mime_type,size_bytes,scan_status,uploaded_by) VALUES
 ('f3270000-0000-4000-8000-000000000001','f3200000-0000-4000-8000-000000000001','synthetic-source.pdf','f3200000-0000-4000-8000-000000000001/'||repeat('9',64)||'.pdf',repeat('9',64),'application/pdf',128,'risk_accepted','f2200000-0000-4000-8000-000000000004') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.historical_program_import_batches(id,file_hash,template_version,status,row_count,error_count,created_by,data_mode) VALUES
 ('f3230000-0000-4000-8000-000000000001',repeat('5',64),'phase2.synthetic.v1','ready',1,0,'f2200000-0000-4000-8000-000000000004','synthetic') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.historical_program_import_rows(id,batch_id,row_key,sanitized_data,errors) VALUES
 ('f3240000-0000-4000-8000-000000000001','f3230000-0000-4000-8000-000000000001','SYN-HIST-ROW-1','{"title":"Synthetic staged history"}','[]') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.historical_program_duplicate_decisions(id,batch_id,row_key,candidate_program_id,outcome,decided_by,decided_at,reason) VALUES
 ('f3250000-0000-4000-8000-000000000001','f3230000-0000-4000-8000-000000000001','SYN-HIST-ROW-1','f3200000-0000-4000-8000-000000000001','distinct','f2200000-0000-4000-8000-000000000004',now(),'Synthetic distinct decision') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.historical_program_import_resolutions(id,batch_id,import_row_id,outcome,reason,decided_by) VALUES
 ('f3260000-0000-4000-8000-000000000001','f3230000-0000-4000-8000-000000000001','f3240000-0000-4000-8000-000000000001','distinct','Synthetic distinct decision','f2200000-0000-4000-8000-000000000004') ON CONFLICT(id) DO NOTHING;

INSERT INTO public.community_needs(id,barangay_id,submitted_by,category,need_description,priority_score,source,sitio,approval_status,approved_by,approved_at) VALUES
 ('f3300000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','f2200000-0000-4000-8000-000000000007','education','Synthetic learning need: aggregate planning evidence.',4,'household_profile','Synthetic Sitio North','approved','f2200000-0000-4000-8000-000000000006',now()) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.project_proposals(id,title,rationale,objectives,target_beneficiaries,expected_output,barangay_id,timeline_start,timeline_end,budget,status,created_by,finance_clearance) VALUES
 ('f3310000-0000-4000-8000-000000000001','Synthetic Structured Proposal','Synthetic rationale.','Synthetic objective.','Synthetic aggregate category',10,'f2100000-0000-4000-8000-000000000001','2026-06-01','2026-06-30',1000,'approved','f2200000-0000-4000-8000-000000000003',true) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.programs(id,proposal_id,title,description,barangay_id,start_date,end_date,status,budget_allocated,budget_spent,created_by,phase2_data_mode,phase2_responsible_officer_id) VALUES
 ('f3320000-0000-4000-8000-000000000001','f3310000-0000-4000-8000-000000000001','Synthetic Operational Program','Synthetic program.','f2100000-0000-4000-8000-000000000001','2026-06-01','2026-06-30','planning',1000,0,'f2200000-0000-4000-8000-000000000003','synthetic','f2200000-0000-4000-8000-000000000003') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.proposal_project_categories(id,code,label,created_by) VALUES('f3330000-0000-4000-8000-000000000001','synthetic_category','Synthetic Category','f2200000-0000-4000-8000-000000000002') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.budget_categories(id,code,label,created_by) VALUES('f3340000-0000-4000-8000-000000000001','synthetic_cash','Synthetic Cash','f2200000-0000-4000-8000-000000000002') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.proposal_beneficiary_categories(code,label,predicate_version,predicate_definition,created_by) VALUES('synthetic_households','Synthetic Households','synthetic-v1','{"dimension":"sex","key":"not_stated","scope":"barangay"}','f2200000-0000-4000-8000-000000000002') ON CONFLICT(code) DO UPDATE SET predicate_version=excluded.predicate_version,predicate_definition=excluded.predicate_definition;
INSERT INTO public.proposal_v2_profiles(proposal_id,workflow_status,origin_channel,originating_partner_id,responsible_officer_id,project_category_id,starts_on,ends_on,data_mode) VALUES
 ('f3310000-0000-4000-8000-000000000001','approved','partner_document','f3100000-0000-4000-8000-000000000001','f2200000-0000-4000-8000-000000000003','f3330000-0000-4000-8000-000000000001','2026-06-01','2026-06-30','synthetic')
ON CONFLICT(proposal_id) DO UPDATE SET data_mode='synthetic';
INSERT INTO public.proposal_target_areas(id,proposal_id,barangay_id,sitio_id,is_lead) VALUES
 ('f3350000-0000-4000-8000-000000000001','f3310000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','f2300000-0000-4000-8000-000000000001',true) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.proposal_need_links_v2(id,proposal_id,need_id,target_area_id,intended_coverage,planned_beneficiary_count,need_snapshot,submission_snapshot_at) VALUES
 ('f3360000-0000-4000-8000-000000000001','f3310000-0000-4000-8000-000000000001','f3300000-0000-4000-8000-000000000001','f3350000-0000-4000-8000-000000000001','partial',10,'{"title":"Synthetic learning need","status":"approved"}',now()) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.proposal_beneficiary_estimates(id,proposal_id,category_code,target_area_id,evidence_snapshot_id,calculated_count,is_suppressed,final_count,source_metadata,as_of_date) VALUES
 ('f3370000-0000-4000-8000-000000000001','f3310000-0000-4000-8000-000000000001','synthetic_households','f3350000-0000-4000-8000-000000000001','f27c0000-0000-4000-8000-000000000001',10,false,10,'{"source":"synthetic"}','2025-10-31') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.proposal_budget_revisions(id,proposal_id,revision_number,status,cash_total,in_kind_total,row_version,created_by) VALUES
 ('f3380000-0000-4000-8000-000000000001','f3310000-0000-4000-8000-000000000001',1,'draft',1000,0,1,'f2200000-0000-4000-8000-000000000003') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.proposal_budget_items(id,revision_id,category_id,item_kind,description,quantity,unit,unit_cost,sort_order) VALUES
 ('f3390000-0000-4000-8000-000000000001','f3380000-0000-4000-8000-000000000001','f3340000-0000-4000-8000-000000000001','cash','Synthetic materials',10,'kit',100,1) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.proposal_budget_funding_sources(id,revision_id,source_type,source_state,cash_value,in_kind_value) VALUES
 ('f33a0000-0000-4000-8000-000000000001','f3380000-0000-4000-8000-000000000001','internal_dyci','confirmed',1000,0) ON CONFLICT(id) DO NOTHING;
UPDATE public.proposal_budget_revisions SET status='cleared',canonical_hash=repeat('6',64),
 submitted_by='f2200000-0000-4000-8000-000000000003',submitted_at=now(),
 cleared_by='f2200000-0000-4000-8000-000000000005',cleared_at=now(),
 frozen_snapshot='{"revision":{"cash_total":"1000.00","in_kind_total":"0.00"},"items":[{"id":"f3390000-0000-4000-8000-000000000001","category_id":"f3340000-0000-4000-8000-000000000001","item_kind":"cash","description":"Synthetic materials","amount":"1000.00","sort_order":1}],"funding":[{"id":"f33a0000-0000-4000-8000-000000000001","source_type":"internal_dyci","cash_value":"1000.00"}]}'::jsonb
 WHERE id='f3380000-0000-4000-8000-000000000001' AND status='draft';
INSERT INTO public.proposal_versions(id,proposal_id,version_number,reason,snapshot,canonical_hash,created_by,budget_revision_id) VALUES
 ('f33b0000-0000-4000-8000-000000000001','f3310000-0000-4000-8000-000000000001',1,'final_decision','{"title":"Synthetic Structured Proposal"}',repeat('7',64),'f2200000-0000-4000-8000-000000000002','f3380000-0000-4000-8000-000000000001') ON CONFLICT(id) DO NOTHING;
UPDATE public.proposal_v2_profiles SET active_version_id='f33b0000-0000-4000-8000-000000000001',active_budget_revision_id='f3380000-0000-4000-8000-000000000001' WHERE proposal_id='f3310000-0000-4000-8000-000000000001';
INSERT INTO public.proposal_workflow_events_v2(id,proposal_id,action,from_status,to_status,proposal_version_id,budget_revision_id,actor_id) VALUES
 ('f33c0000-0000-4000-8000-000000000001','f3310000-0000-4000-8000-000000000001','approved','director_review','approved','f33b0000-0000-4000-8000-000000000001','f3380000-0000-4000-8000-000000000001','f2200000-0000-4000-8000-000000000002') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.proposal_sdg_alignment(proposal_id,sdg_number,indicator) VALUES('f3310000-0000-4000-8000-000000000001',4,'Synthetic indicator') ON CONFLICT DO NOTHING;

INSERT INTO public.program_handoffs(id,proposal_id,proposal_version_id,budget_revision_id,program_id,handed_off_by) VALUES
 ('f3400000-0000-4000-8000-000000000001','f3310000-0000-4000-8000-000000000001','f33b0000-0000-4000-8000-000000000001','f3380000-0000-4000-8000-000000000001','f3320000-0000-4000-8000-000000000001','f2200000-0000-4000-8000-000000000003') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.program_budget_revisions(id,program_id,revision_number,status,source_proposal_budget_revision_id,cash_total,in_kind_total,created_by) VALUES
 ('f3410000-0000-4000-8000-000000000001','f3320000-0000-4000-8000-000000000001',1,'active','f3380000-0000-4000-8000-000000000001',1000,0,'f2200000-0000-4000-8000-000000000003') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.program_budget_items(id,revision_id,source_proposal_item_id,category_id,item_kind,description,allocated_amount,sort_order) VALUES
 ('f3420000-0000-4000-8000-000000000001','f3410000-0000-4000-8000-000000000001','f3390000-0000-4000-8000-000000000001','f3340000-0000-4000-8000-000000000001','cash','Synthetic allocation',1000,1) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.program_financial_documents(id,program_id,document_type,original_name,storage_path,sha256,mime_type,size_bytes,scan_status,uploaded_by) VALUES
 ('f3430000-0000-4000-8000-000000000001','f3320000-0000-4000-8000-000000000001','receipt','synthetic-receipt.pdf','f3320000-0000-4000-8000-000000000001/'||repeat('8',64)||'.pdf',repeat('8',64),'application/pdf',128,'risk_accepted','f2200000-0000-4000-8000-000000000003') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.program_expenditures(id,program_id,budget_item_id,amount,spent_on,description,status,receipt_document_id,row_version,recorded_by,reviewed_by,reviewed_at) VALUES
 ('f3440000-0000-4000-8000-000000000001','f3320000-0000-4000-8000-000000000001','f3420000-0000-4000-8000-000000000001',400,'2026-06-10','Synthetic expenditure','verified','f3430000-0000-4000-8000-000000000001',1,'f2200000-0000-4000-8000-000000000003','f2200000-0000-4000-8000-000000000005',now()) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.liquidation_submissions(id,program_id,revision_number,status,total_submitted,summary,row_version,prepared_by,reviewed_by,reviewed_at) VALUES
 ('f3450000-0000-4000-8000-000000000001','f3320000-0000-4000-8000-000000000001',1,'verified',400,'{"summary":"Synthetic liquidation"}',1,'f2200000-0000-4000-8000-000000000003','f2200000-0000-4000-8000-000000000005',now()) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.liquidation_expenditures(liquidation_id,expenditure_id,amount_snapshot) VALUES
 ('f3450000-0000-4000-8000-000000000001','f3440000-0000-4000-8000-000000000001',400) ON CONFLICT DO NOTHING;
INSERT INTO public.program_finance_events(id,program_id,expenditure_id,liquidation_id,action,to_status,reason,actor_id) VALUES
 ('f3460000-0000-4000-8000-000000000001','f3320000-0000-4000-8000-000000000001','f3440000-0000-4000-8000-000000000001','f3450000-0000-4000-8000-000000000001','verified','verified','Synthetic fixture','f2200000-0000-4000-8000-000000000005') ON CONFLICT(id) DO NOTHING;

INSERT INTO public.partner_contact_email_outbox(id,contact_id,template_key,template_version,payload,idempotency_key,status) VALUES
 ('f3500000-0000-4000-8000-000000000001','f3110000-0000-4000-8000-000000000001','synthetic_status',1,'{"partnerCode":"SYN-PTR-001"}','synthetic-outbox-001','suppressed'),
 ('f3500000-0000-4000-8000-000000000002','f3110000-0000-4000-8000-000000000001','synthetic_status',1,'{"partnerCode":"SYN-PTR-001"}','synthetic-outbox-retained','suppressed')
 ON CONFLICT(id) DO NOTHING;
INSERT INTO public.partnership_reminder_deliveries(id,term_id,threshold_days,recipient_user_id,channel,delivery_key) VALUES
 ('f3510000-0000-4000-8000-000000000001','f3120000-0000-4000-8000-000000000001',60,'f2200000-0000-4000-8000-000000000003','in_app','synthetic-reminder-001') ON CONFLICT(id) DO NOTHING;

UPDATE public.phase2_component_runtime SET mode='off',synthetic_user_ids='{}',synthetic_entity_ids='{}',updated_at=now();
UPDATE public.phase2_cutover_state SET write_authority='v1',reconciliation_hash=NULL,reconciled_at=NULL,changed_at=now();
