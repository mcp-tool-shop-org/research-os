import { z } from 'zod';

// Discovery proposes leads. A lead is NOT evidence. A lead becomes evidence
// only after fetch receipt + source card + excerpt ledger + claim extraction.
//
// The boundary is enforced structurally: discovery writes to its own
// per-section ledger and produces an `urls.approved.txt` file for `gather`
// to consume. `gather` is unaware of how URLs were proposed; it just fetches
// and emits receipts. If a discovered URL doesn't fetch, the operator sees a
// failed receipt — exactly as if they'd typed the URL themselves.

export const DiscoveryCandidateStatusSchema = z.enum([
  'candidate',
  'approved',
  'rejected',
]);

export const SourceTypeGuessSchema = z.enum([
  'primary',
  'docs',
  'paper',
  'standard',
  'article',
  'forum',
  'benchmark',
  'unknown',
]);

/**
 * v0.11 Slice 2 — R-008 admission-layer relevance check.
 * Status values:
 *   - 'verified': title fetched at discover time; keyword overlap with the
 *     discover query was at or above threshold.
 *   - 'unverified': title fetch failed (network, non-HTML, no title tag, or
 *     check disabled). No signal either way — graceful degradation.
 *   - 'topic_mismatch': title fetched; keyword overlap was below threshold.
 *     R-008's defense fires here. Quarantined from `approve --top N` by
 *     default; explicit `approve --candidate <id>` is the operator override.
 */
export const RelevanceStatusSchema = z.enum([
  'verified',
  'unverified',
  'topic_mismatch',
]);

export const RelevanceCheckSchema = z.object({
  status: RelevanceStatusSchema,
  fetched_title: z.string().nullable(),
  query_keywords: z.array(z.string()),
  matched_keywords: z.array(z.string()),
  overlap_score: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1),
  error: z.string().nullable(),
  checked_at: z.string(),
});

export const DiscoveryCandidateSchema = z.object({
  candidate_id: z.string().regex(/^disc_[a-f0-9]{12}$/),
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  url: z.string().url(),
  title: z.string().min(1),
  publisher: z.string().nullable(),
  source_type_guess: SourceTypeGuessSchema,
  why_relevant: z.string().min(1),
  // The free-text query that produced this candidate (for traceability).
  query: z.string().min(1),
  // Lower rank = more central. Stable per-(query, provider) ordering.
  rank: z.number().int().positive(),
  discovered_at: z.string(),
  // 'candidate' | 'approved' | 'rejected'. Append-only: new entries with
  // same candidate_id supersede older ones; the latest entry's status wins.
  status: DiscoveryCandidateStatusSchema,
  discovered_by: z.string().min(1),
  reason: z.string().nullable().default(null),
  // v0.11 Slice 2 (R-008): admission-layer relevance check. Null when the
  // check was disabled or omitted (back-compat with v0.10 ledgers — pre-R-008
  // candidate records parse cleanly).
  relevance: RelevanceCheckSchema.nullable().optional().default(null),
});

export const DiscoverySummarySchema = z.object({
  summary_id: z.string().regex(/^disum_[0-9]+_[a-z0-9-]+$/),
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  ran_at: z.string(),
  research_os_version: z.string(),
  query: z.string().min(1),
  provider: z.string().min(1),
  candidates_proposed: z.number().int().nonnegative(),
  candidates_validated: z.number().int().nonnegative(),
  candidates_rejected_invalid_url: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});

export type DiscoveryCandidate = z.infer<typeof DiscoveryCandidateSchema>;
export type DiscoveryCandidateStatus = z.infer<typeof DiscoveryCandidateStatusSchema>;
export type SourceTypeGuess = z.infer<typeof SourceTypeGuessSchema>;
export type DiscoverySummary = z.infer<typeof DiscoverySummarySchema>;
export type RelevanceStatus = z.infer<typeof RelevanceStatusSchema>;
export type RelevanceCheck = z.infer<typeof RelevanceCheckSchema>;
