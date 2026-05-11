import { z } from 'zod';

export const GateFamilySchema = z.enum([
  'source_floor',
  'claim_integrity',
  'scope_integrity',
  'freshness',
  'contradiction',
  'section_budget',
  'waivers',
  'accepted_claim_floor',
]);

export const GateCheckStatusSchema = z.enum([
  'pass',
  'warn',
  'fail',
  'pass_with_waiver',
  'warn_with_waiver',
]);

export const VerdictSchema = z.enum(['pass', 'warn', 'fail', 'blocked']);

export const GateCheckResultSchema = z.object({
  family: GateFamilySchema,
  check: z.string().min(1),
  status: GateCheckStatusSchema,
  detail: z.string(),
  evidence: z.array(z.string()),
  blocks_synthesis: z.boolean(),
});

export const WaiverApplicationSchema = z.object({
  family: GateFamilySchema,
  check: z.string().min(1),
  reason: z.string().min(1),
  compensating_controls: z.array(z.string()),
  original_status: GateCheckStatusSchema,
  new_status: GateCheckStatusSchema,
});

export const SectionGateResultSchema = z.object({
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  verdict: VerdictSchema,
  summary: z.string(),
  checked_at: z.string(),
  synthesis_eligible: z.boolean(),
  gate_results: z.array(GateCheckResultSchema),
  failures: z.array(GateCheckResultSchema),
  warnings: z.array(GateCheckResultSchema),
  waivers_applied: z.array(WaiverApplicationSchema),
  blocking_reasons: z.array(z.string()),
  claim_counts: z.object({
    total: z.number().int().nonnegative(),
    candidate: z.number().int().nonnegative(),
    with_evidence_excerpt: z.number().int().nonnegative(),
    with_source_hashes: z.number().int().nonnegative(),
    with_scope: z.number().int().nonnegative(),
    with_not: z.number().int().nonnegative(),
    universal_scope_null: z.number().int().nonnegative(),
    orphans: z.number().int().nonnegative(),
  }),
  source_counts: z.object({
    total: z.number().int().nonnegative(),
    primary: z.number().int().nonnegative(),
    secondary: z.number().int().nonnegative(),
    forum: z.number().int().nonnegative(),
    benchmark: z.number().int().nonnegative(),
    docs: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
    independent_publishers: z.number().int().nonnegative(),
    failed_fetches: z.number().int().nonnegative(),
    section_primary: z.number().int().nonnegative().optional().default(0),
    section_independent_publishers: z.number().int().nonnegative().optional().default(0),
  }),
  contradiction_counts: z.object({
    total: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    blocking: z.number().int().nonnegative(),
    by_type: z.record(z.string(), z.number().int().nonnegative()),
  }),
  freshness_summary: z.object({
    policy_required: z.boolean(),
    max_source_age_months: z.number().int().nullable(),
    stale_source_policy: z.enum(['warn', 'fail']),
    stale_count: z.number().int().nonnegative(),
    unknown_date_count: z.number().int().nonnegative(),
  }),
  scope_integrity_summary: z.object({
    universal_claims: z.number().int().nonnegative(),
    scoped_claims: z.number().int().nonnegative(),
    with_not_constraint: z.number().int().nonnegative(),
    overgen_risks_total: z.number().int().nonnegative(),
    overgen_risks_blocking: z.number().int().nonnegative(),
  }),
  next_actions: z.array(z.string()),
  // B-C-005: per-line malformed-JSONL warnings collected while reading gate
  // inputs. Additive-optional (.default([])) so pre-B-C-005 gate JSONs parse
  // cleanly. Mirrors the src/audit/run.ts skip-malformed pattern. Named
  // `malformed_jsonl_warnings` to avoid colliding with the existing
  // `warnings: GateCheckResult[]` (gate-check warn-status results).
  malformed_jsonl_warnings: z
    .array(
      z.object({
        path: z.string(),
        line: z.number().int().nonnegative(),
        reason: z.string(),
      }),
    )
    .optional()
    .default([]),
});

export type SectionGateResult = z.infer<typeof SectionGateResultSchema>;
