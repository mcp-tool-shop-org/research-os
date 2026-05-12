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
  // Phase 1 (v0.8.0): when the MCP extractor's ollama_extract frame_alignment
  // judges the source off-topic for the section purpose, every claim emitted in
  // that window is marked frame_excluded so downstream gates/triage can filter
  // without re-asking the model. Optional + defaults to false for back-compat
  // with claims written before the MCP migration.
  //
  // Phase 1b-b (v0.8.0): the per-claim section-evidence critic is the
  // ENFORCEMENT layer. When the critic returns a label other than
  // supports_section (off_topic / background_only / source_chrome), the
  // emitted claim is marked frame_excluded:true and carries the reason +
  // rationale below. Extract's window-level frame_alignment is telemetry only
  // — the critic decides admission. Both fields are present only when
  // frame_excluded === true; legacy claims without them parse cleanly.
  frame_excluded: z.boolean().optional().default(false),
  frame_exclusion_reason: z
    .enum(['off_topic', 'background_only', 'source_chrome'])
    .optional(),
  frame_exclusion_rationale: z.string().optional(),
});

export type Claim = z.infer<typeof ClaimSchema>;
