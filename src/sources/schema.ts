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
  fetch_outcome: z.enum(['ok', 'http_error', 'network_error']),
  fetch_error: z.string().nullable(),
  extraction_outcome: z.enum(['ok', 'failed', 'skipped']),
  extraction_extractor: ExtractorNameSchema.nullable(),
  extraction_error: z.string().nullable(),
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
});

export type FetchReceipt = z.infer<typeof FetchReceiptSchema>;
export type SourceCard = z.infer<typeof SourceCardSchema>;
