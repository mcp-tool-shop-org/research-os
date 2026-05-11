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

// B-C-003: stable freeze-refusal reason codes. Each refusal reason a freeze
// run emits MUST be tagged with one of these codes so consumers (next-actions
// derivation, future MCP/CLI rendering) can switch on a stable enum instead
// of substring-matching prose. New codes are append-only; renaming is a
// breaking change to consumers.
export const FreezeReasonCodeSchema = z.enum([
  'FREEZE_FINAL_REPORT_NO_CITATIONS',
  'FREEZE_UNKNOWN_CLAIM_CITED',
  'FREEZE_UNRESOLVED_CONTRADICTION_UNDISCLOSED',
  'FREEZE_WAIVER_UNDISCLOSED',
  'FREEZE_REPAIR_CLAIM_CITED',
  'FREEZE_UNACCEPTED_CITED',
  'FREEZE_MISSING_GATE',
  'FREEZE_MISSING_REQUIRED_ARTIFACT',
  'FREEZE_MISSING_SYNTHESIS_ARTIFACT',
  'FREEZE_MALFORMED_ARTIFACT',
  'FREEZE_PACK_AUDIT_NOT_READY',
  'FREEZE_HANDOFF_NOT_READY',
]);

export type FreezeReasonCode = z.infer<typeof FreezeReasonCodeSchema>;

// B-C-003: refusal-reason record carrying both structured `reason_code` and
// prose `reason` message. The field is optional on read so legacy v0.6
// refusal payloads (which lack reason_code) parse cleanly; new writes always
// set it. Codes are surfaced through buildRefusalNextActions for stable
// downstream consumer dispatch.
export const FreezeRefusalReasonSchema = z.object({
  reason_code: FreezeReasonCodeSchema.optional(),
  reason: z.string(),
  blocking: z.boolean(),
});

export type FreezeRefusalReason = z.infer<typeof FreezeRefusalReasonSchema>;

export const FreezeRefusalPayloadSchema = z.object({
  pack_id: z.string(),
  pack_topic: z.string(),
  checked_at: z.string(),
  verdict: z.literal('refused'),
  // Prose lists — preserved verbatim for backward compatibility (downstream
  // dashboards that render legacy refusal payloads continue to work).
  reasons: z.array(z.string()),
  blocking_reasons: z.array(z.string()),
  // B-C-003: structured records keyed by reason_code, mirrored from `reasons`
  // and `blocking_reasons`. Optional with default [] so legacy refusal
  // payloads (no reason_codes) round-trip cleanly.
  reason_records: z.array(FreezeRefusalReasonSchema).optional().default([]),
  missing_artifacts: z.array(z.string()),
  invalid_artifacts: z.array(z.object({ path: z.string(), error: z.string() })),
  next_actions: z.array(z.string()),
  would_freeze: z.literal(false),
});

export type FreezeReceiptPayload = z.infer<typeof FreezeReceiptPayloadSchema>;
export type FreezeRefusalPayload = z.infer<typeof FreezeRefusalPayloadSchema>;
