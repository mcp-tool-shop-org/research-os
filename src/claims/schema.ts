import { z } from 'zod';

import { EXCERPT_ID_PATTERN } from '../sources/excerpts/schema.js';

export const ConfidenceSchema = z.enum(['low', 'medium', 'high']);

export const ClaimExtractorSchema = z.enum(['heuristic', 'ollama-intern']);

export const ReviewStateSchema = z.enum([
  'candidate',
  'gated',
  'reviewed',
  'rejected',
  'accepted',
]);

export const ClaimSchema = z.object({
  claim_id: z.string().regex(/^clm_[a-f0-9]{12}_(heuristic|ollama_intern)_\d+$/),
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  source_ids: z
    .array(z.string().regex(/^src_[a-f0-9]{12}$/))
    .min(1, 'every claim must reference at least one source_id'),
  source_hashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)),
  asserts: z.string().min(1),
  scope: z.string().nullable(),
  not: z.string().nullable(),
  // Span-first extraction: the model picks excerpt IDs from the deterministic
  // ledger; research-os copies the literal text into evidence_excerpt. Models
  // may interpret source spans; they may not author evidence spans.
  // Allowed empty for legacy claims that pre-date span-first extraction —
  // those should be re-extracted; new writes always populate at least one ID.
  evidence_excerpt_ids: z.array(z.string().regex(EXCERPT_ID_PATTERN)).default([]),
  evidence_excerpt: z.string().min(1),
  evidence_location: z.string().nullable(),
  confidence: ConfidenceSchema,
  extractor: ClaimExtractorSchema,
  extraction_method: z.string().min(1),
  created_at: z.string(),
  review_state: ReviewStateSchema,
});

export type Claim = z.infer<typeof ClaimSchema>;
