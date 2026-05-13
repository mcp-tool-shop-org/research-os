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

// Run input for the partial-pack drafter pipeline (after classification).
export interface PartialPackRunInput {
  packId: string;
  packTopic: string;
  packMode: string;
  includedSections: PartialPackSectionInput[];
  excludedSections: PartialPackExcludedSection[];
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
  prose: {
    paragraphs: PartialPackParagraph[];
  } | null;
  proseError?: PartialPackNoIncludedSectionsError;
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
