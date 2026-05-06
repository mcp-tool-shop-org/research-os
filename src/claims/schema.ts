import { z } from 'zod';

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
  evidence_excerpt: z.string().min(1),
  evidence_location: z.string().nullable(),
  confidence: ConfidenceSchema,
  extractor: ClaimExtractorSchema,
  extraction_method: z.string().min(1),
  created_at: z.string(),
  review_state: ReviewStateSchema,
});

export type Claim = z.infer<typeof ClaimSchema>;
