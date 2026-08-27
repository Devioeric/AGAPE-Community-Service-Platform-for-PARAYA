import { z } from "zod";

const id = z.string().uuid();
const shortText = z.string().trim().min(1).max(160);
const optionalText = z.string().trim().max(2000).nullable().optional();
const isoDate = z.string().date();
export const decimalStringSchema = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/, "Use a non-negative decimal with at most two decimal places");
export const quantityStringSchema = z.string().regex(/^(0|[1-9]\d{0,8})(\.\d{1,3})?$/, "Use a non-negative quantity with at most three decimal places");

export const partnerEntityTypeSchema = z.enum(["barangay", "dyci_office", "student_organization", "academic_department", "external_organization", "government_agency", "school", "faith_based", "other"]);
export const partnerCreateSchema = z.strictObject({
  name: shortText,
  legalName: shortText.nullable().optional(),
  type: partnerEntityTypeSchema,
  classification: z.enum(["internal", "external"]),
  roles: z.array(z.enum(["partner", "proponent"])).min(1).max(2),
  barangayId: id.nullable().optional(),
});
export const partnerUpdateSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  name: shortText.optional(), legalName: shortText.nullable().optional(), lifecycle: z.enum(["active", "inactive"]).optional(),
});
export const partnerContactSchema = z.strictObject({
  fullName: shortText, title: shortText.nullable().optional(), email: z.string().email().max(254).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(), preferredChannel: z.enum(["email", "phone", "manual"]),
  isPrimary: z.boolean().default(false), statusEmailOptIn: z.boolean().default(false), consentSource: z.string().trim().max(160).nullable().optional(),
  consentAt: z.string().datetime().nullable().optional(), activeFrom: isoDate, activeUntil: isoDate.nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.statusEmailOptIn && (!value.email || !value.consentSource || !value.consentAt)) ctx.addIssue({ code: "custom", message: "Email opt-in requires email and consent evidence" });
  if (value.activeUntil && value.activeUntil < value.activeFrom) ctx.addIssue({ code: "custom", message: "Active-until cannot precede active-from" });
});
export const partnerContactUpdateSchema = z.strictObject({
  expectedVersion: z.number().int().positive(), fullName: shortText.optional(), title: shortText.nullable().optional(),
  email: z.string().email().max(254).nullable().optional(), phone: z.string().trim().max(40).nullable().optional(),
  preferredChannel: z.enum(["email", "phone", "manual"]).optional(), isPrimary: z.boolean().optional(),
  statusEmailOptIn: z.boolean().optional(), consentSource: z.string().trim().max(160).nullable().optional(),
  consentAt: z.string().datetime().nullable().optional(), activeUntil: isoDate.nullable().optional(),
});
export const partnershipTermSchema = z.strictObject({
  expectedVersion: z.number().int().nonnegative(),
  startsOn: isoDate, expiresOn: isoDate.nullable().optional(), responsibleOfficerId: id,
  agreementDocumentId: id.nullable().optional(), agreementExceptionReason: z.string().trim().min(10).max(500).nullable().optional(),
  agreementExceptionDueOn: isoDate.nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.expiresOn && value.expiresOn < value.startsOn) ctx.addIssue({ code: "custom", message: "Expiration cannot precede start" });
  if (!!value.agreementExceptionReason !== !!value.agreementExceptionDueOn) ctx.addIssue({ code: "custom", message: "Agreement exception requires both reason and due date" });
});
export const partnershipTermTransitionSchema = z.strictObject({
  action: z.enum(["suspend", "resume", "end"]), expectedVersion: z.number().int().positive(),
  effectiveOn: isoDate, reason: z.string().trim().min(5).max(1000),
});
export const partnerMergeSchema = z.strictObject({
  targetPartnerId: id, expectedVersion: z.number().int().positive(), reason: z.string().trim().min(10).max(1000),
});
export const partnerNeedLinkSchema = z.strictObject({
  termId: id, needId: id, expectedTermVersion: z.number().int().positive(),
  coverage: z.enum(["unaddressed", "partial", "addressed"]), notes: z.string().trim().max(1000).nullable().optional(),
  evidenceType: z.enum(["program", "historical_program", "partner_document", "manual_note"]), evidenceId: id.nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.evidenceType === "manual_note" && value.evidenceId) ctx.addIssue({ code: "custom", message: "Manual evidence cannot name a record ID" });
  if (value.evidenceType !== "manual_note" && !value.evidenceId) ctx.addIssue({ code: "custom", message: "Selected evidence requires a record ID" });
});
export const partnerTypePolicySchema = z.strictObject({
  type: partnerEntityTypeSchema, agreementRequired: z.boolean(), effectiveFrom: isoDate,
});

export const legacyPartnerMappingSchema = z.strictObject({
  partnerId: id,
  responsibleOfficerId: id,
  expectedVersion: z.number().int().positive(),
  action: z.enum(["start_review", "approve", "sign_off"]),
  notes: z.string().trim().min(5).max(2000),
});

export const historicalProgramCreateSchema = z.strictObject({
  title: shortText, summary: optionalText, category: z.string().trim().min(1).max(80),
  datePrecision: z.enum(["exact", "month", "year", "unknown"]), startsOn: isoDate.nullable(), endsOn: isoDate.nullable().optional(),
  beneficiaryCount: z.number().int().nonnegative().nullable().optional(), volunteerCount: z.number().int().nonnegative().nullable().optional(),
  volunteerHours: decimalStringSchema.nullable().optional(), budgetTotal: decimalStringSchema.nullable().optional(), currency: z.literal("PHP").default("PHP"),
  resources: z.string().trim().max(2000).nullable().optional(), historicalNeedDescription: z.string().trim().max(2000).nullable().optional(),
  outcomes: z.string().trim().max(3000).nullable().optional(), followUp: z.string().trim().max(2000).nullable().optional(),
  sourceType: z.enum(["excel", "word", "pdf", "paper", "database", "other"]), sourceNotes: z.string().trim().max(1000).nullable().optional(),
  partnerIds: z.array(id).max(50).default([]), barangayIds: z.array(id).max(50).default([]), needIds: z.array(id).max(100).default([]),
  sdgs: z.array(z.strictObject({ number: z.number().int().min(1).max(17), source: z.enum(["documented", "retrospective"]) })).max(17).default([]),
}).superRefine((value, ctx) => {
  if (value.datePrecision === "unknown" && value.startsOn) ctx.addIssue({ code: "custom", message: "Unknown date precision cannot have a start date" });
  if (value.datePrecision !== "unknown" && !value.startsOn) ctx.addIssue({ code: "custom", message: "A start date is required for known date precision" });
  if (value.endsOn && value.startsOn && value.endsOn < value.startsOn) ctx.addIssue({ code: "custom", message: "End cannot precede start" });
});
export const historicalProgramUpdateSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  title: shortText.optional(), summary: optionalText, category: z.string().trim().min(1).max(80).optional(),
  datePrecision: z.enum(["exact", "month", "year", "unknown"]).optional(), startsOn: isoDate.nullable().optional(), endsOn: isoDate.nullable().optional(),
  beneficiaryCount: z.number().int().nonnegative().nullable().optional(), volunteerCount: z.number().int().nonnegative().nullable().optional(),
  volunteerHours: decimalStringSchema.nullable().optional(), budgetTotal: decimalStringSchema.nullable().optional(),
  resources: z.string().trim().max(2000).nullable().optional(), historicalNeedDescription: z.string().trim().max(2000).nullable().optional(),
  outcomes: z.string().trim().max(3000).nullable().optional(), followUp: z.string().trim().max(2000).nullable().optional(),
  sourceType: z.enum(["excel", "word", "pdf", "paper", "database", "other"]).optional(), sourceNotes: z.string().trim().max(1000).nullable().optional(),
  partnerIds: z.array(id).max(50).optional(), barangayIds: z.array(id).max(50).optional(), needIds: z.array(id).max(100).optional(),
  sdgs: z.array(z.strictObject({ number: z.number().int().min(1).max(17), source: z.enum(["documented", "retrospective"]) })).max(17).optional(),
}).superRefine((value, ctx) => {
  if (value.datePrecision === "unknown" && value.startsOn) ctx.addIssue({ code: "custom", message: "Unknown date precision cannot have a start date" });
  if (value.endsOn && value.startsOn && value.endsOn < value.startsOn) ctx.addIssue({ code: "custom", message: "End cannot precede start" });
});
export const historicalDuplicateResolutionSchema = z.strictObject({
  rowKey: z.string().trim().min(1).max(80), candidateId: id.nullable().optional(),
  outcome: z.enum(["link_existing", "distinct", "exclude"]), reason: z.string().trim().min(5).max(1000),
}).superRefine((value, ctx) => {
  if (value.outcome === "link_existing" && !value.candidateId) ctx.addIssue({ code: "custom", message: "Linking requires a selected candidate" });
  if (value.outcome !== "link_existing" && value.candidateId) ctx.addIssue({ code: "custom", message: "Only link-existing may select a candidate" });
});
export const historicalReviewSchema = z.strictObject({
  action: z.enum(["submit", "return", "accept", "archive"]), expectedVersion: z.number().int().positive(),
  quality: z.enum(["complete", "partial_verified", "partial_unverified", "unverified"]).optional(), remarks: z.string().trim().max(2000).optional(),
}).superRefine((value, ctx) => {
  if (["return", "accept", "archive"].includes(value.action) && !value.remarks) ctx.addIssue({ code: "custom", message: "Remarks are required for this action" });
  if (value.action === "accept" && !value.quality) ctx.addIssue({ code: "custom", message: "Accepted records require a quality label" });
});

export const proposalTargetSchema = z.strictObject({ barangayId: id, sitioId: id.nullable().optional(), isLead: z.boolean() });
export const proposalNeedSchema = z.strictObject({ needId: id, targetAreaKey: z.string().trim().min(1).max(100), intendedCoverage: z.enum(["full", "partial"]), plannedBeneficiaryCount: z.number().int().positive().nullable().optional(), plannedBeneficiaryPercentage: z.number().min(0).max(100).nullable().optional(), notes: z.string().trim().max(500).nullable().optional() });
export const proposalBudgetItemSchema = z.strictObject({ categoryId: id, kind: z.enum(["cash", "in_kind"]), description: z.string().trim().min(1).max(500), quantity: quantityStringSchema, unit: z.string().trim().min(1).max(40), unitCost: decimalStringSchema, inKindValuation: decimalStringSchema.nullable().optional(), notes: z.string().trim().max(500).nullable().optional(), sortOrder: z.number().int().min(0).max(10000) });
export const proposalFundingSourceSchema = z.strictObject({ type: z.enum(["internal_dyci", "external", "cash_donation", "in_kind_donation", "partner_contribution", "other"]), state: z.enum(["expected", "confirmed"]), partnerId: id.nullable().optional(), cashValue: decimalStringSchema, inKindValue: decimalStringSchema, notes: z.string().trim().max(500).nullable().optional() });
export const proposalBeneficiaryEstimateSchema = z.strictObject({
  categoryCode: z.string().trim().min(1).max(80), targetAreaKey: z.string().trim().min(1).max(100),
  evidenceSnapshotId: id.nullable().optional(), finalCount: z.number().int().positive(),
  manualSourceDescription: z.string().trim().min(10).max(500).nullable().optional(),
  overrideReason: z.string().trim().min(10).max(1000).nullable().optional(),
}).superRefine((value, ctx) => {
  if (!value.evidenceSnapshotId && !value.manualSourceDescription) ctx.addIssue({ code: "custom", message: "Manual estimates require a source description" });
  if (value.evidenceSnapshotId && value.manualSourceDescription) ctx.addIssue({ code: "custom", message: "Planning-cube estimates cannot include a manual source" });
});
export const proposalDraftGraphSchema = z.strictObject({
  title: shortText, description: z.string().trim().min(1).max(5000), originChannel: z.enum(["paraya_internal", "partner_document", "barangay_referral"]),
  originatingPartnerId: id.nullable().optional(), responsibleOfficerId: id, projectCategoryId: id,
  startsOn: isoDate, endsOn: isoDate, targets: z.array(proposalTargetSchema).min(1).max(100), needs: z.array(proposalNeedSchema).min(1).max(100),
  beneficiaryCategoryCodes: z.array(z.string().trim().min(1).max(80)).min(1).max(30), finalBeneficiaryCount: z.number().int().positive(),
  beneficiarySourceDescription: z.string().trim().min(10).max(500), sdgNumbers: z.array(z.number().int().min(1).max(17)).min(1).max(17),
  beneficiaryEstimates: z.array(proposalBeneficiaryEstimateSchema).max(100).default([]),
  zeroCash: z.boolean(), zeroCashJustification: z.string().trim().max(500).nullable().optional(), budgetItems: z.array(proposalBudgetItemSchema).min(1).max(500),
  fundingSources: z.array(proposalFundingSourceSchema).max(100), expectedVersion: z.number().int().nonnegative().optional(),
}).superRefine((value, ctx) => {
  if (value.originChannel !== "paraya_internal" && !value.originatingPartnerId) ctx.addIssue({ code: "custom", message: "Non-internal origins require a Partner/Proponent" });
  if (value.endsOn < value.startsOn) ctx.addIssue({ code: "custom", message: "End cannot precede start" });
  if (value.targets.filter((target) => target.isLead).length !== 1) ctx.addIssue({ code: "custom", message: "Exactly one lead target is required" });
  const seen = new Set<string>();
  for (const target of value.targets) {
    const key = `${target.barangayId}:${target.sitioId ?? "all"}`;
    if (seen.has(key)) ctx.addIssue({ code: "custom", message: "Duplicate target area" });
    seen.add(key);
    if (target.sitioId && seen.has(`${target.barangayId}:all`)) ctx.addIssue({ code: "custom", message: "Barangay-wide and sitio targets cannot coexist" });
    if (!target.sitioId && Array.from(seen).some((candidate) => candidate.startsWith(`${target.barangayId}:`) && candidate !== key)) ctx.addIssue({ code: "custom", message: "Barangay-wide and sitio targets cannot coexist" });
  }
  if (value.zeroCash && !value.zeroCashJustification) ctx.addIssue({ code: "custom", message: "Zero-cash proposals require a justification" });
  if (value.zeroCash && value.budgetItems.some((item) => item.kind === "cash" && item.unitCost !== "0" && item.unitCost !== "0.00")) ctx.addIssue({ code: "custom", message: "Zero-cash proposals cannot contain cash items" });
  if (value.zeroCash && !value.budgetItems.some((item) => item.kind === "in_kind")) ctx.addIssue({ code: "custom", message: "Zero-cash proposals require an in-kind item" });
  if (!value.zeroCash && !value.budgetItems.some((item) => item.kind === "cash")) ctx.addIssue({ code: "custom", message: "Cash proposals require a cash item" });
  for (const source of value.fundingSources) {
    if (source.type === "partner_contribution" && !source.partnerId) ctx.addIssue({ code: "custom", message: "Partner contributions require a Partner" });
  }
});
export type ProposalDraftGraphInput = z.infer<typeof proposalDraftGraphSchema>;
export function toProposalGraphRpcPayload(value: ProposalDraftGraphInput) {
  return {
    title: value.title, description: value.description, origin_channel: value.originChannel,
    originating_partner_id: value.originatingPartnerId ?? null, responsible_officer_id: value.responsibleOfficerId,
    project_category_id: value.projectCategoryId, starts_on: value.startsOn, ends_on: value.endsOn,
    targets: value.targets.map((item) => ({ barangay_id: item.barangayId, sitio_id: item.sitioId ?? null, is_lead: item.isLead })),
    needs: value.needs.map((item) => ({ need_id: item.needId, target_area_key: item.targetAreaKey, intended_coverage: item.intendedCoverage,
      planned_beneficiary_count: item.plannedBeneficiaryCount ?? null, planned_beneficiary_percentage: item.plannedBeneficiaryPercentage ?? null, notes: item.notes ?? null })),
    beneficiary_category_codes: value.beneficiaryCategoryCodes, final_beneficiary_count: value.finalBeneficiaryCount,
    beneficiary_source_description: value.beneficiarySourceDescription, sdg_numbers: value.sdgNumbers,
    beneficiary_estimates: value.beneficiaryEstimates.map((item) => ({ category_code: item.categoryCode,
      target_area_key: item.targetAreaKey, evidence_snapshot_id: item.evidenceSnapshotId ?? null, final_count: item.finalCount,
      manual_source_description: item.manualSourceDescription ?? null, override_reason: item.overrideReason ?? null })),
    zero_cash: value.zeroCash, zero_cash_justification: value.zeroCashJustification ?? null,
    budget_items: value.budgetItems.map((item) => ({ category_id: item.categoryId, item_kind: item.kind, description: item.description,
      quantity: item.quantity, unit: item.unit, unit_cost: item.unitCost, in_kind_valuation: item.inKindValuation ?? null,
      notes: item.notes ?? null, sort_order: item.sortOrder })),
    funding_sources: value.fundingSources.map((item) => ({ source_type: item.type, source_state: item.state, partner_id: item.partnerId ?? null,
      cash_value: item.cashValue, in_kind_value: item.inKindValue, notes: item.notes ?? null })),
  };
}
export const proposalWorkflowSchema = z.strictObject({ action: z.enum(["submit", "pass_pre_screening", "confirm_evidence", "request_revision", "finance_clear", "finance_return", "director_approve", "director_reject"]), expectedVersion: z.number().int().positive(), remarks: z.string().trim().max(2000).optional(), acknowledgedWarningCodes: z.array(z.string().trim().regex(/^[a-z][a-z0-9_]{0,79}$/)).max(100).default([]) }).superRefine((value, ctx) => {
  if (value.action !== "submit" && value.acknowledgedWarningCodes.length) ctx.addIssue({ code: "custom", message: "Warnings are acknowledged only during submission" });
});

export const beneficiaryEstimateRequestSchema = z.strictObject({ categoryCode: z.string().trim().min(1).max(80), barangayId: id, sitioId: id.nullable().optional(), evidenceSnapshotId: id });
export const beneficiaryEvidenceOptionsQuerySchema = z.strictObject({ barangayId: id });

export const programAllocationItemSchema = z.strictObject({
  sourceItemId: id.nullable().optional(), categoryId: id, kind: z.enum(["cash", "in_kind"]),
  description: z.string().trim().min(1).max(500), allocatedAmount: decimalStringSchema,
  sortOrder: z.number().int().min(0).max(10000),
}).refine((value) => value.allocatedAmount !== "0" && value.allocatedAmount !== "0.0" && value.allocatedAmount !== "0.00", { message: "Allocation amount must be positive", path: ["allocatedAmount"] });
export const programAllocationPrepareSchema = z.strictObject({
  expectedActiveVersion: z.number().int().positive(), reason: z.string().trim().min(5).max(1000),
  items: z.array(programAllocationItemSchema).min(1).max(500),
});
export const programAllocationActionSchema = z.strictObject({
  action: z.enum(["submit", "return", "activate"]), expectedVersion: z.number().int().positive(),
  reason: z.string().trim().max(1000).optional(),
}).superRefine((value, ctx) => {
  if (value.action === "return" && (!value.reason || value.reason.length < 5)) ctx.addIssue({ code: "custom", message: "A return reason is required" });
});

export const programExpenditureSchema = z.strictObject({ budgetItemId: id, amount: decimalStringSchema, spentOn: isoDate, payeeLabel: z.string().trim().max(160).nullable().optional(), description: z.string().trim().min(1).max(500), receiptDocumentId: id.nullable().optional(), receiptExceptionReason: z.string().trim().min(10).max(500).nullable().optional(), varianceExplanation: z.string().trim().min(10).max(1000).nullable().optional() }).superRefine((value, ctx) => {
  if (!value.receiptDocumentId && !value.receiptExceptionReason) ctx.addIssue({ code: "custom", message: "A cash expenditure requires receipt evidence or an exception reason" });
});
export const expenditureReviewSchema = z.strictObject({ action: z.enum(["verify", "return"]), expectedVersion: z.number().int().positive(), reason: z.string().trim().max(1000).default("") }).superRefine((value, ctx) => {
  if (value.action === "return" && value.reason.length < 5) ctx.addIssue({ code: "custom", message: "A return reason is required" });
});
export const expenditureCorrectionSchema = z.strictObject({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(5).max(1000), replacement: programExpenditureSchema });
export const expenditureVoidSchema = z.strictObject({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(5).max(1000) });
export const liquidationSummarySchema = z.strictObject({ periodStart: isoDate, periodEnd: isoDate, narrative: z.string().trim().min(10).max(2000), exceptionNotes: z.string().trim().max(1000).nullable().optional() }).refine((value) => value.periodEnd >= value.periodStart, { message: "Period end cannot precede period start", path: ["periodEnd"] });
export const liquidationCreateSchema = z.strictObject({ summary: liquidationSummarySchema, expenditureIds: z.array(id).min(1).max(1000) });
export const liquidationUpdateSchema = liquidationCreateSchema.extend({ expectedVersion: z.number().int().positive() });
export const liquidationActionSchema = z.strictObject({ action: z.enum(["submit", "return", "verify", "void"]), expectedVersion: z.number().int().positive(), remarks: z.string().trim().max(2000).optional() }).superRefine((value, ctx) => { if (["return", "verify", "void"].includes(value.action) && !value.remarks) ctx.addIssue({ code: "custom", message: "Remarks are required" }); });

export function parseStrict<T>(schema: z.ZodType<T>, input: unknown): { ok: true; data: T } | { ok: false; issues: string[] } {
  const result = schema.safeParse(input);
  return result.success ? { ok: true, data: result.data } : { ok: false, issues: result.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`) };
}
