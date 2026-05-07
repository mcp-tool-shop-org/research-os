import { z } from 'zod';

export const SectionAcceptedSummarySchema = z.object({
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  purpose: z.string(),
  status: z.string(),
  accepted_claim_ids: z.array(z.string()),
  excluded_reason: z.string().nullable(),
});

export const ClaimClusterSchema = z.object({
  cluster_id: z.string(),
  shared_source_ids: z.array(z.string()),
  member_claim_ids: z.array(z.string()).min(1),
  spans_sections: z.array(z.string()),
});

export const SharedSourceSchema = z.object({
  source_id: z.string(),
  publisher: z.string().nullable(),
  source_type: z.string(),
  used_by_claim_ids: z.array(z.string()),
  spans_sections: z.array(z.string()),
});

export const ScopeOverlapSchema = z.object({
  claim_a: z.string(),
  claim_b: z.string(),
  scope_a: z.string().nullable(),
  scope_b: z.string().nullable(),
  jaccard: z.number().min(0).max(1),
  cross_section: z.boolean(),
  warning: z.string(),
});

export const CrossSectionContradictionRefSchema = z.object({
  contradiction_id: z.string(),
  claim_ids: z.array(z.string()),
  sections: z.array(z.string()),
  type: z.string(),
  severity: z.string(),
  status: z.string(),
});

export const WaiverDependencySchema = z.object({
  scope: z.enum(['pack', 'gate']),
  family: z.string(),
  reason: z.string(),
  compensating_controls: z.array(z.string()),
  applied_to: z.string(),
  must_disclose_in: z.enum(['decision-brief.md', 'final-report.md', 'both']),
});

export const AllowedSynthesisInputSchema = z.object({
  claim_id: z.string(),
  section_id: z.string(),
  artifact_path: z.string(),
  asserts: z.string(),
  scope: z.string().nullable(),
  not: z.string().nullable(),
  source_ids: z.array(z.string()),
});

export const ForbiddenInputSchema = z.object({
  claim_id: z.string(),
  section_id: z.string(),
  decision: z.string(),
  reason: z.string(),
});

export const CrossSectionMapSchema = z.object({
  pack_id: z.string(),
  pack_topic: z.string(),
  pack_decision: z.string(),
  generated_at: z.string(),
  accepted_claim_ids: z.array(z.string()),
  sections: z.array(SectionAcceptedSummarySchema),
  claim_clusters: z.array(ClaimClusterSchema),
  shared_sources: z.array(SharedSourceSchema),
  scope_overlaps: z.array(ScopeOverlapSchema),
  cross_section_contradictions: z.array(CrossSectionContradictionRefSchema),
  waiver_dependencies: z.array(WaiverDependencySchema),
  open_questions: z.array(z.string()),
  allowed_synthesis_inputs: z.array(AllowedSynthesisInputSchema),
  forbidden_inputs: z.array(ForbiddenInputSchema),
});

export type CrossSectionMap = z.infer<typeof CrossSectionMapSchema>;
