import { z } from 'zod';

export const PackVerdictSchema = z.enum([
  'ready_for_synthesis',
  'repair_required',
  'human_review_required',
  'blocked',
]);

export const HandoffModeSchema = z.enum([
  'repair_required',
  'synthesis_ready',
  'human_review_required',
  'unknown',
]);

export const OrphanClaimRowSchema = z.object({
  claim_id: z.string(),
  section_id: z.string(),
  reason: z.enum([
    'missing_source_card',
    'missing_source_hash',
    'missing_evidence_excerpt',
    'unresolvable_source_id',
  ]),
  details: z.string(),
  artifact_path: z.string(),
});

export const StaleSourceRowSchema = z.object({
  source_id: z.string(),
  section_id: z.string(),
  publisher: z.string().nullable(),
  reason: z.enum(['too_old', 'missing_date', 'unparseable_date']),
  details: z.string(),
  artifact_path: z.string(),
  policy: z.object({
    required: z.boolean(),
    max_source_age_months: z.number().int().nullable(),
    stale_source_policy: z.enum(['warn', 'fail']),
  }),
});

export const WeakSourceRowSchema = z.object({
  reason: z.enum([
    'source_cluster_monopoly',
    'low_independent_publishers',
    'missing_primary_source',
    'excessive_type_imbalance',
    'failed_fetches_reducing_floor',
  ]),
  section_id: z.string(),
  details: z.string(),
  evidence_ids: z.array(z.string()),
  artifact_path: z.string(),
});

export const UnresolvedContradictionRowSchema = z.object({
  contradiction_id: z.string(),
  section_id: z.string(),
  type: z.string(),
  severity: z.string(),
  status: z.string(),
  claim_ids: z.array(z.string()),
  artifact_path: z.string(),
});

export const ScopeWideningRiskRowSchema = z.object({
  reason: z.enum([
    'overgeneralization_finding',
    'scope_null_in_use',
    'missing_not_flagged',
    'contextual_to_universal_risk',
  ]),
  claim_id: z.string(),
  section_id: z.string(),
  details: z.string(),
  artifact_path: z.string(),
});

export const SourceDiversityGapRowSchema = z.object({
  reason: z.enum([
    'section_publisher_monopoly',
    'low_section_publisher_count',
    'cross_section_publisher_overlap',
    'section_has_no_sources',
  ]),
  section_id: z.string(),
  details: z.string(),
  evidence_ids: z.array(z.string()),
});

export const SynthesisReadinessRowSchema = z.object({
  section_id: z.string(),
  purpose: z.string(),
  status: z.string(),
  has_gate_run: z.boolean(),
  has_review_run: z.boolean(),
  gate_verdict: z.string().nullable(),
  synthesis_eligible: z.boolean(),
  candidate_claims: z.number().int().nonnegative(),
  accepted_claims: z.number().int().nonnegative(),
  repair_claims: z.number().int().nonnegative(),
  rejected_claims: z.number().int().nonnegative(),
  blocking_reasons: z.array(z.string()),
  cowork_handoff_mode: HandoffModeSchema,
  workspace_allowed: z.boolean(),
});

export const PackAuditPayloadSchema = z.object({
  pack_id: z.string(),
  pack_topic: z.string(),
  generated_at: z.string(),
  verdict: PackVerdictSchema,
  synthesis_allowed: z.boolean(),
  section_summaries: z.array(SynthesisReadinessRowSchema),
  claim_summary: z.object({
    total: z.number().int().nonnegative(),
    candidate: z.number().int().nonnegative(),
    accepted_for_synthesis: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    needs_repair: z.number().int().nonnegative(),
    no_review: z.number().int().nonnegative(),
    with_evidence_excerpt: z.number().int().nonnegative(),
    with_source_hashes: z.number().int().nonnegative(),
    scope_null: z.number().int().nonnegative(),
    not_null: z.number().int().nonnegative(),
    orphans: z.number().int().nonnegative(),
  }),
  source_summary: z.object({
    total: z.number().int().nonnegative(),
    primary: z.number().int().nonnegative(),
    secondary: z.number().int().nonnegative(),
    forum: z.number().int().nonnegative(),
    benchmark: z.number().int().nonnegative(),
    docs: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
    independent_publishers: z.number().int().nonnegative(),
    failed_fetches: z.number().int().nonnegative(),
    sections_with_sources: z.number().int().nonnegative(),
    sections_without_sources: z.number().int().nonnegative(),
  }),
  contradiction_summary: z.object({
    total: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    blocking: z.number().int().nonnegative(),
    reconciled: z.number().int().nonnegative(),
    preserved_deliberately: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    by_type: z.record(z.string(), z.number().int().nonnegative()),
    sections_with_clean_ledger: z.number().int().nonnegative(),
  }),
  review_summary: z.object({
    sections_with_review_run: z.number().int().nonnegative(),
    sections_without_review_run: z.number().int().nonnegative(),
    decision_counts: z.record(z.string(), z.number().int().nonnegative()),
    blocking_findings: z.number().int().nonnegative(),
  }),
  waiver_summary: z.object({
    total: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative(),
    by_family: z.record(z.string(), z.number().int().nonnegative()),
  }),
  readiness_summary: z.object({
    total_sections: z.number().int().nonnegative(),
    ready_sections: z.number().int().nonnegative(),
    repair_sections: z.number().int().nonnegative(),
    blocked_sections: z.number().int().nonnegative(),
    no_gate_sections: z.number().int().nonnegative(),
    no_review_sections: z.number().int().nonnegative(),
    cowork_handoff_mode: HandoffModeSchema,
    workspace_allowed: z.boolean(),
  }),
  audit_files: z.array(z.string()),
  blocking_reasons: z.array(z.string()),
  warnings: z.array(z.string()),
  next_actions: z.array(z.string()),
});

export type PackAuditPayload = z.infer<typeof PackAuditPayloadSchema>;
