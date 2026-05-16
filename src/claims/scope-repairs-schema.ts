/**
 * v0.10 Slice 2 — R-001: claim-scope-repairs ledger schema.
 * v0.11 Slice 1 — R-007: extended with proposed_not + applied_not so the
 *   ledger records boundary repairs alongside scope repairs when the claim
 *   originally had `not === null`. Both new fields are optional for
 *   frozen-pack back-compat — v0.10.0 ledger records (which lack these
 *   fields) continue to parse cleanly.
 *
 * Append-only ledger at evidence/claim-scope-repairs.jsonl.
 * Each record captures one scope-repair decision per claim: what the
 * heuristic proposed for scope (and, when applicable, boundary), what got
 * applied to each field, who approved it, when.
 *
 * Mirrors the v0.4 source-card-overrides-schema.ts shape — both are
 * audit-trail ledgers for an operator surface that mutates a "canonical"
 * file (claims.jsonl / source-cards/*.json) at write time.
 *
 * Latest-applied-scope wins on the claim row; the ledger preserves the
 * full history. Running repair-scope twice on the same claim produces
 * two ledger records — neither is destroyed.
 */
import { z } from 'zod';

export const ScopeRepairModeSchema = z.enum(['auto', 'interactive']);

export const ScopeRepairSchema = z.object({
  claim_id: z.string().regex(/^clm_[a-f0-9]{12}_(heuristic|ollama_intern)_\d+$/),
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  repaired_at: z
    .string()
    .refine((v) => Number.isFinite(Date.parse(v)), {
      message: 'repaired_at must be a valid ISO 8601 timestamp',
    }),
  mode: ScopeRepairModeSchema,
  source_signals: z.array(z.string().min(1)),
  proposed_scope: z.string().min(1),
  // applied_scope is null on operator-skip; non-null on auto/accept/edit.
  applied_scope: z.string().min(1).nullable(),
  // R-007: proposed boundary text the engine computed for this claim.
  // Always populated on v0.11+ records when the candidate-set entry path
  // ran. Optional for v0.10.0 back-compat (records written before R-007
  // do not have this field).
  proposed_not: z.string().min(1).optional(),
  // R-007: boundary applied to the claim row. Null when the claim already
  // had `not` set at repair time (boundary preserved, no mutation) or when
  // the operator skipped. Non-null when the engine filled `not` because
  // claim.not was null at repair time. Optional for v0.10.0 back-compat.
  applied_not: z.string().min(1).nullable().optional(),
  operator_confirmed: z.boolean(),
  reason: z.string().nullable(),
  operator: z.string().min(1),
  research_os_version: z.string().min(1),
});

export type ScopeRepair = z.infer<typeof ScopeRepairSchema>;

export function validateScopeRepair(input: unknown): ScopeRepair {
  return ScopeRepairSchema.parse(input);
}
