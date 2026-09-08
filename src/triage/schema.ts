import { z } from 'zod';

// Triage is the deterministic / semi-deterministic shaping pass between
// extraction and review. It does NOT mutate claims.jsonl. Triage decisions
// live in their own append-only ledger and downstream commands (contradict,
// review) can opt into reading only the selected_for_review subset via
// --triaged-only.
//
// Law #13 (the law this module enforces):
//   Extraction may overproduce; synthesis may not inherit abundance.
//   Claim abundance is not research quality. Claims must be triaged before
//   they can compete for synthesis.

export const TriageDecisionSchema = z.enum([
  // Passes triage and is forwarded to review.
  'selected_for_review',
  // Parked: kept on the canonical ledger as research truth, but not advanced.
  'parked_duplicate',
  'parked_overdense_source',
  'parked_weak_scope',
  'parked_low_value',
  // Routed for repair before re-triage.
  'needs_scope_repair',
  'needs_human_review',
]);

export const ClaimTriageSchema = z.object({
  triage_id: z.string().regex(/^tri_[a-f0-9]{12}$/),
  claim_id: z.string().regex(/^clm_[a-f0-9]{12}_(heuristic|ollama_intern)_\d+$/),
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  decision: TriageDecisionSchema,
  reason: z.string().min(1),
  // Rank among selected_for_review claims (1 = highest priority). null for
  // any non-selected decision.
  rank: z.number().int().positive().nullable(),
  // Quality score [0..1] used to sort. Stable. Higher = better.
  quality_score: z.number().min(0).max(1),
  triage_method: z.string().min(1),
  created_at: z.string(),
});

export const TriageSummarySchema = z.object({
  summary_id: z.string().regex(/^tris_[0-9]+_[a-z0-9-]+$/),
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  triaged_at: z.string(),
  research_os_version: z.string(),
  triage_method: z.string(),
  candidate_claims: z.number().int().nonnegative(),
  decisions: z.partialRecord(TriageDecisionSchema, z.number().int().nonnegative()),
  per_source_cap: z.number().int().positive(),
  duplicate_clusters_collapsed: z.number().int().nonnegative(),
  selected_count: z.number().int().nonnegative(),
  selected_per_source: z.array(
    z.object({
      source_id: z.string().regex(/^src_[a-f0-9]{12}$/),
      selected: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
  ),
  // B-TRIAGE-001: per-line malformed-JSONL warnings collected while reading
  // claims.jsonl during triage. Additive-optional (.default([])) so pre-B-TRIAGE-001
  // triage summaries parse cleanly. Mirrors the gate run's `malformed_jsonl_warnings`
  // (B-C-005) skip-with-warning collector — without it a corrupt claim line is
  // dropped from the review queue and candidate_claims undercounts with no signal.
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

export type TriageDecision = z.infer<typeof TriageDecisionSchema>;
export type ClaimTriage = z.infer<typeof ClaimTriageSchema>;
export type TriageSummary = z.infer<typeof TriageSummarySchema>;
