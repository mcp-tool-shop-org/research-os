import { z } from 'zod';

export const SourceTypeSchema = z.enum([
  'primary',
  'secondary',
  'forum',
  'benchmark',
  'docs',
  'unknown',
]);

export const RelevanceSchema = z.enum(['high', 'medium', 'low', 'unknown']);

export const ExtractorNameSchema = z.enum(['heuristic', 'ollama-intern']);

/**
 * v0.10 Slice 4 (R-004) — operator-facing rollup status for the gather pipeline.
 *
 * Replaces the conflated `"Failed (ok HTTP 200)"` progress phrasing observed
 * in operator-aloneness DST gate v0.1 (2026-05-15). The 5 values distinguish
 * outcomes that the legacy `fetch_outcome × extraction_outcome` cross product
 * could only express ambiguously:
 *
 *   - ok                 : fetched + text extracted successfully
 *   - fetch_failed       : HTTP error, timeout, network failure, SSRF refusal
 *   - extraction_skipped : fetched, extraction layer not applicable (PDF, binary)
 *   - extraction_failed  : fetched, extractor errored mid-extraction
 *   - bot_check_detected : fetched, R-003 marker+body-words signal fired at gather
 *
 * Precedence (highest to lowest):
 *   fetch_failed > bot_check_detected > extraction_failed > extraction_skipped > ok
 */
export const GatherOutcomeSchema = z.enum([
  'ok',
  'fetch_failed',
  'extraction_skipped',
  'extraction_failed',
  'bot_check_detected',
]);

export const FetchReceiptSchema = z.object({
  receipt_id: z.string().regex(/^rcpt_[a-z0-9]+_\d+$/),
  source_id: z.string().regex(/^src_[a-f0-9]{12}$/),
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  requested_url: z.string().url(),
  final_url: z.string().url().nullable(),
  status: z.number().int().nullable(),
  status_text: z.string().nullable(),
  content_type: z.string().nullable(),
  fetched_at: z.string(),
  byte_count: z.number().int().nonnegative().nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  title: z.string().nullable(),
  raw_text_path: z.string().nullable(),
  fetch_outcome: z.enum(['ok', 'http_error', 'network_error', 'too_large']),
  fetch_error: z.string().nullable(),
  extraction_outcome: z.enum(['ok', 'failed', 'skipped']),
  extraction_extractor: ExtractorNameSchema.nullable(),
  extraction_error: z.string().nullable(),
  /**
   * v0.10 Slice 3 — millisecond wall-clock duration of the fetchImpl call.
   * Optional for back-compat with pre-v0.10 receipts; fetchOnce always
   * populates it on new fetches. Used by source-card severity detection
   * to identify CDN fast-challenge bot-check responses.
   */
  fetch_duration_ms: z.number().int().nonnegative().nullable().optional(),
  /**
   * v0.10 Slice 4 — operator-facing 5-value rollup status. Optional for
   * back-compat with pre-v0.10 receipts; gather() always populates it on
   * new fetches. See GatherOutcomeSchema for the value semantics.
   */
  gather_outcome: GatherOutcomeSchema.optional(),
});

export const SourceCardSchema = z.object({
  source_id: z.string().regex(/^src_[a-f0-9]{12}$/),
  receipt_id: z.string().regex(/^rcpt_[a-z0-9]+_\d+$/),
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  url: z.string().url(),
  final_url: z.string().url().nullable(),
  fetched_at: z.string(),
  publisher: z.string().nullable(),
  published_at: z.string().nullable(),
  title: z.string().min(1),
  source_type: SourceTypeSchema,
  relevance: RelevanceSchema,
  key_points: z.array(z.string()),
  limitations: z.array(z.string()),
  asserts: z.string().min(1),
  scope: z.string().nullable(),
  not: z.string().nullable(),
  extracted_by: ExtractorNameSchema,
  extracted_at: z.string(),
  /** Rule that classified the URL. Added by Component B (v0.4). Optional for back-compat with pre-v0.4 cards. */
  rule_hint: z.string().optional(),
  /** Precedence level of the rule that fired (2–6). Optional for back-compat with pre-v0.4 cards. */
  precedence_level: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]).optional(),
});

export type FetchReceipt = z.infer<typeof FetchReceiptSchema>;
export type SourceCard = z.infer<typeof SourceCardSchema>;
