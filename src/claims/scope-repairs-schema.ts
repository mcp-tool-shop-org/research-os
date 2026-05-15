/**
 * v0.10 Slice 2 — R-001: claim-scope-repairs ledger schema.
 *
 * Append-only ledger at evidence/claim-scope-repairs.jsonl.
 * Each record captures one scope-repair decision per claim: what the
 * heuristic proposed, what got applied, who approved it, when.
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
  operator_confirmed: z.boolean(),
  reason: z.string().nullable(),
  operator: z.string().min(1),
  research_os_version: z.string().min(1),
});

export type ScopeRepair = z.infer<typeof ScopeRepairSchema>;

export function validateScopeRepair(input: unknown): ScopeRepair {
  return ScopeRepairSchema.parse(input);
}
