// Prompt template + schemas for the partial-pack drafter.
//
// The drafter receives ONLY section prose paragraphs (text + role + section
// paragraph IDs) — it never reads raw claims, source cards, or excerpts.
// It returns pack-level paragraphs, each tagged with a role and a list of
// section_paragraph_ids it draws from.

import { BANNED_OPENERS } from '../prose/prompt.js';
import { PARTIAL_PACK_ROLES } from './types.js';
import type { PartialPackSectionInput } from './types.js';

export { BANNED_OPENERS };

export const PARTIAL_PACK_PROMPT_VERSION = 'partial-pack-prose-v1';

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
  'paragraph MUST have role=answer and must directly answer the pack-level question. Do NOT invent ' +
  'claim citations. Do NOT add facts not present in the section paragraphs above.';

/**
 * Render the prompt body for the partial-pack drafter. The pack-level
 * "question" is derived from the included sections' purposes — the drafter
 * synthesizes across them rather than restating any single section.
 */
export function renderPartialPackPrompt(args: {
  packTopic: string;
  packMode: string;
  includedSections: PartialPackSectionInput[];
  excludedSections: Array<{ section_id: string; reason: string }>;
}): string {
  const { packTopic, packMode, includedSections, excludedSections } = args;
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
  lines.push('');
  lines.push('Return {"paragraphs": [...]} with each paragraph having: role, text, section_paragraph_ids.');
  return lines.join('\n');
}
