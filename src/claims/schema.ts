import { z } from 'zod';

import { EXCERPT_ID_PATTERN } from '../sources/excerpts/schema.js';
import { FRAME_RESCUE_STATUSES } from './critic/rescue-eligibility.js';

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
  //
  // The schema enum carries FOUR values; the critic model only ever returns
  // three (off_topic / background_only / source_chrome — see
  // CRITIC_EXCLUSION_LABELS in src/claims/critic/prompt.ts). The fourth value
  // — critic_unavailable — is a SYSTEM-STATE label set by the extractor when
  // the critic call itself fails (transport, parse, invalid label, empty
  // rationale, or timeout). The model never outputs it. The safe default
  // when topicality cannot be determined is to EXCLUDE the claim, not to
  // admit it — admitting on critic failure lets off-topic content leak in
  // labelled "on-topic" purely because the critic crashed.
  frame_excluded: z.boolean().optional().default(false),
  // v0.11 Slice 3 (R-011) — extends the enum with source_content_mismatch
  // for the deterministic precheck firing path. See FRAME_EXCLUSION_REASONS
  // in src/claims/critic/prompt.ts for the canonical source of truth.
  frame_exclusion_reason: z
    .enum([
      'off_topic',
      'background_only',
      'source_chrome',
      'critic_unavailable',
      'source_content_mismatch',
    ])
    .optional(),
  frame_exclusion_rationale: z.string().optional(),

  // v0.12 Slice 1 (R-012) — rescue path for source_content_mismatch
  // exclusions. See src/claims/critic/rescue-eligibility.ts for the
  // closed FrameRescueStatus enum + the eligibility-gate predicate.
  //
  // rescue_status is the closed enum. ABSENT on claims that never
  // entered the rescue path (e.g., frame_excluded=false from the start,
  // or excluded with a reason other than source_content_mismatch); set
  // for every source_content_mismatch claim after the R-012 stage runs.
  //
  // rescue_eligibility_check captures peer_count + threshold + passed,
  // so operators can see why a rescue was or wasn't possible without
  // re-running the gate.
  //
  // rescue_boundary is the explicit scope constraint that downstream
  // synthesis MUST honor when citing this claim. Set ONLY on rescues
  // (rescue_status=rescued_by_llm or rescued_by_operator). The
  // ORIGINAL claim.scope and claim.not fields are NEVER rewritten by
  // R-012 — they stay intact as the source's literal grounding;
  // rescue_boundary carries the rescuer-supplied constraint.
  rescue_status: z
    .enum([...FRAME_RESCUE_STATUSES] as [string, ...string[]])
    .optional(),
  rescue_eligibility_check: z
    .object({
      peer_count: z.number().int().nonnegative(),
      threshold: z.number().int().positive(),
      passed: z.boolean(),
    })
    .optional(),
  rescue_boundary: z.string().optional(),
});

export type Claim = z.infer<typeof ClaimSchema>;
