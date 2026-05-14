// Types for v0.9 Slice 2 — partial-pack synthesis.
//
// Partial-pack synthesis consumes Slice 1 section-synthesis.json artifacts and
// produces a pack-level readable artifact (partial-pack-synthesis.md + .json)
// without claiming the pack is freezable or publishable.
//
// Hard invariants:
//   - status is always 'partial_pack_synthesis' (not 'partial_synthesis').
//   - not_freezable_as_pack and not_publishable_as_pack are always true.
//   - included_sections and excluded_sections are both always present arrays.
//   - support_bundle references section paragraph IDs ("<section_id>:<p_id>"),
//     never raw claim IDs or source_card IDs.
//   - The drafter cannot reach claims.jsonl / reviews.jsonl / source cards.
//     Slice 1's section prose is the only generative substrate.

import type { ProseCallToolClient } from '../prose/types.js';

// Controlled exclusion reason enum — every excluded section MUST carry one of
// these reasons. New reasons are an additive vocabulary change; do not remove.
export const PARTIAL_PACK_EXCLUSION_REASONS = [
  'gate_blocked',
  'unrun',
  'repair_required',
  'prose_error',
  'no_section_synthesis',
  'brief_only',
] as const;

export type PartialPackExclusionReason = (typeof PARTIAL_PACK_EXCLUSION_REASONS)[number];

// Top-level status for the partial-pack artifact. Intentionally distinct from
// Slice 1's section-level `partial_synthesis` so operators can tell at a glance
// which scope they are looking at.
export const PARTIAL_PACK_STATUS = 'partial_pack_synthesis' as const;

// Pack-level paragraph roles. Same vocabulary as section prose so renderers
// can reuse labels; the drafter chooses a role for each pack-level paragraph.
export const PARTIAL_PACK_ROLES = [
  'answer',
  'evidence',
  'qualifier',
  'caveat',
  'implication',
] as const;

export type PartialPackRole = (typeof PARTIAL_PACK_ROLES)[number];

// Per-paragraph support bundle for the partial-pack artifact. Provenance is
// paragraph-to-paragraph: the bundle points BACK to specific section paragraphs
// inside section-synthesis.json files. Claim IDs are reachable transitively
// via those section artifacts but never appear directly here.
export interface PartialPackSupportBundle {
  section_ids: string[];
  // Format: "<section_id>:<paragraph_id>". The colon separator distinguishes
  // pack-level support from section-level support.
  section_paragraph_ids: string[];
  section_synthesis_paths: string[];
}

export interface PartialPackParagraph {
  paragraph_id: string;
  role: PartialPackRole;
  text: string;
  support_bundle: PartialPackSupportBundle;
}

// Description of an included section in the artifact JSON.
export interface PartialPackIncludedSection {
  section_id: string;
  section_purpose: string;
  section_synthesis_path: string;
  paragraph_count: number;
}

// Description of an excluded section. `reason` is constrained; `detail` names
// the specific failure mode (gate check name, proseError code, etc.).
export interface PartialPackExcludedSection {
  section_id: string;
  section_purpose: string;
  reason: PartialPackExclusionReason;
  detail: string;
}

// Source paragraph extracted from a section's section-synthesis.json. The
// drafter receives these as its only generative substrate; raw claims, source
// cards, or excerpts are not passed in.
export interface PartialPackSectionInput {
  section_id: string;
  section_purpose: string;
  section_synthesis_path: string;
  paragraphs: Array<{
    section_paragraph_id: string; // "<section_id>:<p_id>"
    role: string;
    text: string;
    verifier_decision: string;
  }>;
}

// Structured error returned when the classifier produces zero included
// sections. Analogous to Slice 1d's no_answer_cluster failure marker.
export interface PartialPackNoIncludedSectionsError {
  code: 'no_included_sections';
  message: string;
  excluded_sections: PartialPackExcludedSection[];
}

// Slice 2c — structural cross-section enforcement.
//
// The bundle planner deterministically selects which section paragraphs
// MUST support the answer paragraph when ≥2 sections are included. The
// drafter writes prose against this preselected set; the validator
// enforces that the model didn't add, omit, or substitute supports.
export interface RequiredAnswerBundle {
  role: 'answer';
  // Format: "<section_id>:<paragraph_id>". One entry per qualifying section,
  // selected via priority order (faithful answer-role → faithful evidence-role).
  required_section_paragraph_ids: string[];
  // Distinct section IDs covered by the bundle. Length must be ≥ 2 when the
  // bundle was constructed for a multi-section input.
  required_section_ids: string[];
}

// Emitted when the classifier produces ≥2 included sections but fewer than
// 2 of them have at least one faithful answer-role or evidence-role
// paragraph. The bundle planner refuses to construct a one-section bundle
// in the multi-section case — that's the failure shape this code surfaces.
export interface PartialPackInsufficientCrossSectionCandidatesError {
  code: 'insufficient_cross_section_candidates';
  message: string;
  // Per-section qualification record so operators can see which sections
  // qualified and why the others did not.
  candidate_pool: Array<{
    section_id: string;
    qualified: boolean;
    reason: string;
  }>;
}

// Emitted when the validator rejects the drafter's answer-paragraph support
// bundle on both the initial call and the one allowed retry. The drafter
// either omitted, added, or substituted required supports relative to the
// bundle planner's preselection.
export interface PartialPackCrossSectionAnswerSupportMissingError {
  code: 'cross_section_answer_support_missing';
  message: string;
  required_section_paragraph_ids: string[];
  observed_section_paragraph_ids: string[];
  // The validator's reason on the final (post-retry) failure.
  final_reason: string;
}

// Run input for the partial-pack drafter pipeline (after classification).
// `requiredAnswerBundle` is non-null whenever the orchestrator decided this
// is a multi-section run and the bundle planner produced a viable bundle;
// it is null when only one section is included (Slice 2's single-section
// behavior remains unchanged).
export interface PartialPackRunInput {
  packId: string;
  packTopic: string;
  packMode: string;
  includedSections: PartialPackSectionInput[];
  excludedSections: PartialPackExcludedSection[];
  requiredAnswerBundle: RequiredAnswerBundle | null;
  client: ProseCallToolClient;
  model?: string;
}

// Drafter result — the model returns one or more paragraphs, each with a role
// and the section paragraph IDs it draws from.
export type PartialPackDraftResult =
  | {
      ok: true;
      paragraphs: Array<{
        role: PartialPackRole;
        text: string;
        section_paragraph_ids: string[];
      }>;
    }
  | { ok: false; error: string };

// Final orchestrator result.
export type PartialPackRunResult =
  | {
      ok: true;
      paragraphs: PartialPackParagraph[];
      generatedAt: string;
    }
  | {
      ok: false;
      error: string;
      noIncludedSections?: PartialPackNoIncludedSectionsError;
    };

// Discriminated union of all prose-error shapes the partial-pack pipeline
// can emit. Each carries enough structured detail for operators to
// understand the failure mode without re-running the pipeline.
export type PartialPackProseError =
  | PartialPackNoIncludedSectionsError
  | PartialPackInsufficientCrossSectionCandidatesError
  | PartialPackCrossSectionAnswerSupportMissingError;

// Top-level artifact shape written to partial-pack-synthesis.json.
export interface PartialPackArtifact {
  status: typeof PARTIAL_PACK_STATUS;
  scope: 'pack';
  pack_id: string;
  pack_topic: string;
  pack_mode: string;
  not_freezable_as_pack: true;
  not_publishable_as_pack: true;
  included_sections: PartialPackIncludedSection[];
  excluded_sections: PartialPackExcludedSection[];
  source_section_syntheses: string[];
  // Bundle planner output for the answer paragraph (null in single-section
  // mode where no bundle is constructed).
  required_answer_bundle: RequiredAnswerBundle | null;
  prose: {
    paragraphs: PartialPackParagraph[];
  } | null;
  proseError?: PartialPackProseError;
  generated_at: string;
  research_os_version: string;
}

// CLI / library options.
export interface PartialPackOptions {
  packPath?: string;
  // Test hook: inject a fake MCP client.
  mcpClient?: ProseCallToolClient;
  // CLI sets this true; tests inject a client instead.
  spawnMcpClient?: boolean;
  // Model hint forwarded to MCP calls.
  proseModel?: string;
}

// Summary returned by the orchestrator for CLI rendering.
export interface PartialPackSummary {
  packPath: string;
  packMode: string;
  notFreezableAsPack: true;
  notPublishableAsPack: true;
  includedCount: number;
  excludedCount: number;
  paragraphCount: number;
  jsonPath: string;
  markdownPath: string;
  proseGenerated: boolean;
  proseError: string | null;
}
