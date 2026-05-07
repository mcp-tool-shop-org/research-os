import { z } from 'zod';

// Excerpts are deterministic source spans owned by research-os.
// Models may interpret excerpts; they may not author them.
//
// Excerpt ID format: ex_<source_id_hex_12>_<3-digit_index>
//   e.g. ex_abcdef012345_001
export const EXCERPT_ID_PATTERN = /^ex_[a-f0-9]{12}_\d{3,}$/;

export const ExcerptOriginSchema = z.enum(['raw_text', 'key_point']);

export const ExcerptSchema = z.object({
  excerpt_id: z.string().regex(EXCERPT_ID_PATTERN),
  source_id: z.string().regex(/^src_[a-f0-9]{12}$/),
  source_hash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  text: z.string().min(1),
  location_hint: z.string().nullable(),
  char_start: z.number().int().nonnegative(),
  char_end: z.number().int().nonnegative(),
  origin: ExcerptOriginSchema,
  created_at: z.string(),
});

export type Excerpt = z.infer<typeof ExcerptSchema>;
export type ExcerptOrigin = z.infer<typeof ExcerptOriginSchema>;
