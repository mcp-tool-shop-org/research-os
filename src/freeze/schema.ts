import { z } from 'zod';

export const ArtifactHashSchema = z.object({
  path: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative(),
});

export const IntegrityCheckSchema = z.object({
  name: z.string().min(1),
  passed: z.boolean(),
  detail: z.string(),
});

export const FreezeReceiptPayloadSchema = z.object({
  pack_id: z.string(),
  pack_topic: z.string(),
  frozen_at: z.string(),
  verdict: z.literal('frozen'),
  pack_audit_hash: z.string().regex(/^[a-f0-9]{64}$/),
  handoff_hash: z.string().regex(/^[a-f0-9]{64}$/),
  synthesis_hashes: z.array(ArtifactHashSchema),
  canonical_artifact_hashes: z.array(ArtifactHashSchema),
  accepted_claim_ids: z.array(z.string()),
  cited_claim_ids: z.array(z.string()),
  uncited_accepted_claim_ids: z.array(z.string()),
  unresolved_contradictions: z.array(
    z.object({
      contradiction_id: z.string(),
      section_id: z.string(),
      type: z.string(),
      severity: z.string(),
      status: z.string(),
      disclosed_in: z.array(z.string()),
    }),
  ),
  waivers_disclosed: z.array(
    z.object({
      family: z.string(),
      applied_to: z.string(),
      reason: z.string(),
      compensating_controls: z.array(z.string()),
      disclosed_in: z.array(z.string()),
    }),
  ),
  sections: z.array(
    z.object({
      section_id: z.string(),
      status: z.string(),
      accepted_claims: z.number().int().nonnegative(),
      sources: z.number().int().nonnegative(),
      contradictions: z.number().int().nonnegative(),
    }),
  ),
  source_count: z.number().int().nonnegative(),
  claim_count: z.number().int().nonnegative(),
  contradiction_count: z.number().int().nonnegative(),
  review_finding_count: z.number().int().nonnegative(),
  gate_result_count: z.number().int().nonnegative(),
  integrity_checks: z.array(IntegrityCheckSchema),
});

export const FreezeRefusalPayloadSchema = z.object({
  pack_id: z.string(),
  pack_topic: z.string(),
  checked_at: z.string(),
  verdict: z.literal('refused'),
  reasons: z.array(z.string()),
  blocking_reasons: z.array(z.string()),
  missing_artifacts: z.array(z.string()),
  invalid_artifacts: z.array(z.object({ path: z.string(), error: z.string() })),
  next_actions: z.array(z.string()),
  would_freeze: z.literal(false),
});

export type FreezeReceiptPayload = z.infer<typeof FreezeReceiptPayloadSchema>;
export type FreezeRefusalPayload = z.infer<typeof FreezeRefusalPayloadSchema>;
