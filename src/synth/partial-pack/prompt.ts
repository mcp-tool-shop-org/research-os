// Prompt template + schemas for the partial-pack drafter.
//
// The drafter receives ONLY section prose paragraphs (text + role + section
// paragraph IDs) — it never reads raw claims, source cards, or excerpts.
// It returns pack-level paragraphs, each tagged with a role and a list of
// section_paragraph_ids it draws from.

import { BANNED_OPENERS } from '../prose/prompt.js';
import { PARTIAL_PACK_ROLES } from './types.js';
import type { PartialPackSectionInput, RequiredAnswerBundle } from './types.js';

export { BANNED_OPENERS };

// v1 -> v2 (Slice 2b): added natural-language CROSS-SECTION RULE + product
// reason. Hermes3:8b read the rule and still produced single-section answers
// on the multi-section bed.
//
// v2 -> v3 (Slice 2c): the contract changed materially. The drafter no
// longer chooses the answer paragraph's support bundle — the orchestrator
// preselects it deterministically via the bundle planner. The v2 prompt
// language stays as natural-language reinforcement, but the structural
// constraint is now enforced post-generation by a validator and a retry
// path. See `bundle-planner.ts`.
export const PARTIAL_PACK_PROMPT_VERSION = 'partial-pack-prose-v3';

export const PARTIAL_PACK_DRAFTER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    paragraphs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: [...PARTIAL_PACK_ROLES] },
          text: { type: 'string', minLength: 1 },
          section_paragraph_ids: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
          },
        },
        required: ['role', 'text', 'section_paragraph_ids'],
        additionalProperties: false,
      },
      minItems: 1,
    },
  },
  required: ['paragraphs'],
  additionalProperties: false,
};

export const PARTIAL_PACK_DRAFTER_HINT =
  'Write pack-level prose. Each paragraph has a role (answer/evidence/qualifier/caveat/implication), ' +
  'a text body of 2-5 sentences, and a list of section_paragraph_ids it draws from. The first ' +
  'paragraph MUST have role=answer. When a REQUIRED ANSWER SUPPORT BUNDLE is given, the answer ' +
  'paragraph MUST cite exactly those section_paragraph_ids — no omissions, no additions. ' +
  'Other paragraphs may draw from any included section. Do NOT invent claim citations. Do NOT add ' +
  'facts not present in the section paragraphs above.';

/**
 * Render the prompt body for the partial-pack drafter.
 *
 * `requiredAnswerBundle` is set by the orchestrator when ≥2 sections are
 * included; it identifies the section paragraphs the drafter MUST use as
 * the answer paragraph's support bundle. The structural constraint is
 * enforced post-generation by `validateAnswerBundle` in `bundle-planner.ts`;
 * the prompt's job here is to communicate the contract clearly and give
 * the model the substrate it needs.
 *
 * When `requiredAnswerBundle` is null (single-section input or v1/v2 callers),
 * the prompt falls back to the Slice 2 / Slice 2b behavior — the model picks
 * a single-section answer paragraph.
 *
 * `rejectionAddendum` is set on a retry call: it names the validator's
 * rejection reason so the model can see why the previous draft was rejected.
 */
export function renderPartialPackPrompt(args: {
  packTopic: string;
  packMode: string;
  includedSections: PartialPackSectionInput[];
  excludedSections: Array<{ section_id: string; reason: string }>;
  requiredAnswerBundle?: RequiredAnswerBundle | null;
  rejectionAddendum?: string | null;
}): string {
  const {
    packTopic,
    packMode,
    includedSections,
    excludedSections,
    requiredAnswerBundle = null,
    rejectionAddendum = null,
  } = args;
  const lines: string[] = [];

  lines.push('Pack topic:');
  lines.push(packTopic);
  lines.push('');
  lines.push(`Pack mode: ${packMode}`);
  lines.push('');
  lines.push('You are drafting a PARTIAL pack-level synthesis. The pack is not freezable and not');
  lines.push('publishable. Some sections are excluded; you must NOT speak for them. Your prose');
  lines.push('synthesizes across the INCLUDED sections only.');
  lines.push('');
  lines.push('Do not merely restate the strongest included section. The purpose of');
  lines.push('partial-pack synthesis is to combine what the included sections');
  lines.push('collectively establish while disclosing what excluded sections prevent');
  lines.push('us from claiming.');
  lines.push('');
  lines.push('Included sections (these are the ONLY allowed sources of assertion):');
  for (const section of includedSections) {
    lines.push(`### ${section.section_id} — ${section.section_purpose}`);
    for (const p of section.paragraphs) {
      lines.push(`[${p.section_paragraph_id}] (role=${p.role}) ${p.text}`);
    }
    lines.push('');
  }

  if (excludedSections.length > 0) {
    lines.push('Excluded sections (DO NOT speak for these; they are listed only so you know what is');
    lines.push('outside this synthesis):');
    for (const e of excludedSections) {
      lines.push(`- ${e.section_id} (reason=${e.reason})`);
    }
    lines.push('');
  }

  // ── REQUIRED ANSWER SUPPORT BUNDLE (v3) ────────────────────────────────
  // This block is the load-bearing structural contract. When the orchestrator
  // preselects a cross-section bundle, the drafter writes prose against that
  // exact set — no additions, no omissions.
  if (requiredAnswerBundle !== null) {
    lines.push('===== REQUIRED ANSWER SUPPORT BUNDLE =====');
    lines.push('The answer paragraph MUST use EXACTLY this required support bundle:');
    for (const spid of requiredAnswerBundle.required_section_paragraph_ids) {
      lines.push(`  - ${spid}`);
    }
    lines.push('');
    lines.push('Contract for the answer paragraph (non-negotiable):');
    lines.push('- Do NOT omit any of the required support IDs above.');
    lines.push('- Do NOT add support IDs beyond the required set.');
    lines.push('- Every assertion in the answer paragraph MUST be traceable to material in those');
    lines.push('  specific section paragraphs.');
    lines.push('- You may quote, paraphrase, or combine claims FROM those paragraphs, but the');
    lines.push('  answer paragraph must visibly synthesize across all of them, not restate one.');
    lines.push('');
    lines.push('Other paragraphs (evidence / qualifier / caveat / implication) follow the general');
    lines.push('partial-pack rules below and MAY draw from any included section as appropriate.');
    lines.push('==========================================');
    lines.push('');
  }

  // Retry addendum: tell the model exactly why the previous draft was
  // rejected. The orchestrator passes this on the second attempt.
  if (rejectionAddendum !== null && rejectionAddendum.length > 0) {
    lines.push('===== RETRY ADDENDUM =====');
    lines.push('Your previous draft was rejected. Reason:');
    lines.push(`  ${rejectionAddendum}`);
    lines.push('The required support bundle above is non-negotiable. Use exactly those supports');
    lines.push('on the answer paragraph. Do not omit. Do not add extras.');
    lines.push('==========================');
    lines.push('');
  }

  lines.push('Rules:');
  lines.push('- Write FROM the section paragraphs above — not from general knowledge.');
  lines.push('- Do not introduce any assertion not present in the section paragraphs.');
  lines.push('- Preserve scope / not-constraints carried in section paragraphs; do not widen.');
  lines.push('- Cite section paragraphs by their section_paragraph_id (e.g. "01-evidence-custody:p1").');
  lines.push('- Do not invent or modify section_paragraph_ids. Use only the ones provided.');
  lines.push('- Do not assert pack readiness; the pack is NOT freezable or publishable.');
  lines.push('');
  lines.push('Paragraph contract:');
  lines.push('- 3-6 paragraphs total. The FIRST paragraph MUST have role=answer and must answer');
  lines.push('  the pack-level question directly. Subsequent paragraphs use other roles as needed.');
  lines.push('- Each paragraph is 2-5 sentences.');
  lines.push('- ANSWER RULE: the first sentence of the answer paragraph MUST state the answer.');
  lines.push('  Do NOT begin with meta-preamble such as "This synthesis provides", "This report');
  lines.push('  explores", "This document describes", or "In this section". Write the answer itself,');
  lines.push('  not about the answer.');
  lines.push('- CROSS-SECTION RULE: When more than one section is included, the answer paragraph MUST');
  lines.push('  draw support from at least two included sections. A single-section answer paragraph');
  lines.push('  is allowed only when exactly one section is included.');
  lines.push('');
  lines.push('Return {"paragraphs": [...]} with each paragraph having: role, text, section_paragraph_ids.');
  return lines.join('\n');
}
