import { z } from 'zod';

export const HandoffModeSchema = z.enum([
  'repair_required',
  'synthesis_ready',
  'human_review_required',
]);

export const IndexStatusSchema = z.enum(['present', 'missing']);

export const SectionStateSchema = z.object({
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  purpose: z.string(),
  status: z.string(),
  has_gate_run: z.boolean(),
  has_review_run: z.boolean(),
  gate_verdict: z.string().nullable(),
  synthesis_eligible: z.boolean(),
  accepted_claim_ids: z.array(z.string()),
  repair_claim_ids: z.array(z.string()),
  rejected_claim_ids: z.array(z.string()),
  candidate_claims_total: z.number().int().nonnegative(),
  unresolved_contradiction_ids: z.array(z.string()),
  blocking_reasons: z.array(z.string()),
  blocking_contradictions_unresolved: z.number().int().nonnegative(),
});

export const WaiverEntrySchema = z.object({
  scope: z.enum(['pack', 'gate']),
  family: z.string(),
  reason: z.string(),
  compensating_controls: z.array(z.string()),
  applied_to: z.string(),
});

export const GateVerdictEntrySchema = z.object({
  section_id: z.string(),
  verdict: z.string(),
  synthesis_eligible: z.boolean(),
});

export const ReviewDecisionCountSchema = z.object({
  section_id: z.string(),
  decision: z.string(),
  count: z.number().int().nonnegative(),
});

export const CoworkHandoffPayloadSchema = z.object({
  pack_id: z.string(),
  pack_topic: z.string(),
  generated_at: z.string(),
  mode: HandoffModeSchema,
  synthesis_allowed: z.boolean(),
  summary: z.string(),
  sections: z.array(SectionStateSchema),
  accepted_claim_ids: z.array(z.string()),
  repair_claim_ids: z.array(z.string()),
  blocked_claim_ids: z.array(z.string()),
  unresolved_contradiction_ids: z.array(z.string()),
  waivers: z.array(WaiverEntrySchema),
  gate_verdicts: z.array(GateVerdictEntrySchema),
  review_decisions: z.array(ReviewDecisionCountSchema),
  recommended_next_actions: z.array(z.string()),
  allowed_write_paths: z.array(z.string()),
  forbidden_actions: z.array(z.string()),
  index_status: IndexStatusSchema,
  warnings: z.array(z.string()),
});

export type CoworkHandoffPayload = z.infer<typeof CoworkHandoffPayloadSchema>;
