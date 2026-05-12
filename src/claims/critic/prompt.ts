// Phase 1b-b (v0.8.0): locked critic prompt for the extract-time section-evidence
// critic. The MCP critic adapter renders this template once per claim and ships
// the rendered text to ollama_extract; the model returns a four-label decision
// plus a one-sentence rationale.
//
// IMPORTANT: this file is the source of truth for the locked critic prompt.
// A drift-prevention test (`test/critic-prompt-drift.test.ts`) asserts that
// CRITIC_PROMPT_TEMPLATE matches the verbatim text below. If you need to
// change the prompt, change the test in the same commit and surface the
// change in your closing report — quiet paraphrases are forbidden.
//
// Template variables (rendered by renderCriticPrompt):
//   {section.purpose}   — section purpose string, always rendered.
//   {claim.asserts}     — the asserts string of the claim under review, always rendered.
//   {source.title}      — source title, line OMITTED when value is missing/empty.
//   {source.publisher}  — publisher name, line OMITTED when value is missing/empty.
//   {source.source_type} — source type string, line OMITTED when value is missing/empty.
//
// Missing values cause their entire line to be dropped from the rendered prompt
// (NOT rendered as `(none)` or with an empty colon — the surrounding structure
// shifts up). See the test suite for the substitution truth table.

export const CRITIC_PROMPT_TEMPLATE = `Section purpose:
{section.purpose}

Claim:
{claim.asserts}

Source title: {source.title}
Publisher: {source.publisher}
Source type: {source.source_type}

Decide whether this claim could be cited as evidence for the section purpose.

Return one label:
- supports_section: the claim directly helps answer the section purpose.
- off_topic: the claim is true or plausible but about a different subject.
- background_only: the claim is generally related but too broad or contextual to support synthesis.
- source_chrome: the claim describes website UI, platform boilerplate, navigation, arXivLabs text, license text, or other non-content chrome.

Do not mark a claim supports_section merely because it contains words related to research, evidence, openness, tooling, or reproducibility. It must help answer the section purpose.

Return one-sentence rationale explaining your label choice.`;

// The four canonical labels the critic may emit. Drives the JSON schema enum
// passed to ollama_extract and the routing logic in MCPCritic.
export const CRITIC_LABELS = [
  'supports_section',
  'off_topic',
  'background_only',
  'source_chrome',
] as const;

export type CriticLabel = (typeof CRITIC_LABELS)[number];

// Labels that mean "do not admit this claim into the section as evidence". When
// the critic returns any of these, the resulting persisted claim is marked
// frame_excluded:true and routed to the frame_excluded decision in review.
export const CRITIC_EXCLUSION_LABELS = [
  'off_topic',
  'background_only',
  'source_chrome',
] as const;

export type CriticExclusionLabel = (typeof CRITIC_EXCLUSION_LABELS)[number];

export function isExclusionLabel(label: string): label is CriticExclusionLabel {
  return (CRITIC_EXCLUSION_LABELS as readonly string[]).includes(label);
}

export interface CriticTemplateInputs {
  sectionPurpose: string;
  claimAsserts: string;
  sourceTitle?: string | null;
  sourcePublisher?: string | null;
  sourceType?: string | null;
}

function isPresent(v: string | null | undefined): v is string {
  if (typeof v !== 'string') return false;
  return v.trim().length > 0;
}

// Render the locked template with per-claim substitution. Optional source
// metadata: each `Source ...` line is dropped entirely when its value is
// missing or empty (never rendered as `Source title: (none)` or with an
// empty colon — the line just disappears and structure shifts up).
export function renderCriticPrompt(inputs: CriticTemplateInputs): string {
  const lines: string[] = [];
  lines.push('Section purpose:');
  lines.push(inputs.sectionPurpose);
  lines.push('');
  lines.push('Claim:');
  lines.push(inputs.claimAsserts);
  lines.push('');
  if (isPresent(inputs.sourceTitle)) lines.push(`Source title: ${inputs.sourceTitle.trim()}`);
  if (isPresent(inputs.sourcePublisher))
    lines.push(`Publisher: ${inputs.sourcePublisher.trim()}`);
  if (isPresent(inputs.sourceType))
    lines.push(`Source type: ${inputs.sourceType.trim()}`);
  // The static tail of the template. We hand-keep it byte-equal with the
  // template constant — the drift-prevention test asserts both contain it.
  lines.push('');
  lines.push('Decide whether this claim could be cited as evidence for the section purpose.');
  lines.push('');
  lines.push('Return one label:');
  lines.push('- supports_section: the claim directly helps answer the section purpose.');
  lines.push('- off_topic: the claim is true or plausible but about a different subject.');
  lines.push(
    '- background_only: the claim is generally related but too broad or contextual to support synthesis.',
  );
  lines.push(
    '- source_chrome: the claim describes website UI, platform boilerplate, navigation, arXivLabs text, license text, or other non-content chrome.',
  );
  lines.push('');
  lines.push(
    'Do not mark a claim supports_section merely because it contains words related to research, evidence, openness, tooling, or reproducibility. It must help answer the section purpose.',
  );
  lines.push('');
  lines.push('Return one-sentence rationale explaining your label choice.');
  return lines.join('\n');
}

// JSON schema we hand to ollama_extract. The model must return an object with
// `label` (one of the four canonical labels) and a one-sentence `rationale`.
// Zod parses this on receipt; the schema is the contract.
export const CRITIC_RESULT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    label: {
      type: 'string',
      enum: [...CRITIC_LABELS],
    },
    rationale: { type: 'string' },
  },
  required: ['label', 'rationale'],
};
