// Locked prompt templates for the prose synthesis plan → draft → verify pipeline.
//
// IMPORTANT: these templates are the source of truth for prose generation.
// If you change a template, change the associated drift-prevention test in
// the same commit and surface it in the closing report.
//
// prompt_version: 'section-prose-v2'

import type { AcceptedClaimInput, ProseRole, SourceCardMeta } from './types.js';

// Meta-opener phrases that signal the model is describing the artifact instead
// of answering the section purpose. Applied only to role=answer paragraphs.
// Stored lowercase; check is case-insensitive.
export const BANNED_OPENERS = [
  'this guide aims',
  'this section discusses',
  'this section provides',
  'this section explores',
  'this synthesis provides',
  'this synthesis explores',
  'this report explores',
  'this report provides',
  'this document',
  'in this section',
] as const;

// ── Planner ──────────────────────────────────────────────────────────────────
// One batch call: assign every accepted claim to exactly one role.

export const PLANNER_ROLES_ENUM = [
  'answer',
  'evidence',
  'qualifier',
  'caveat',
  'implication',
  'thin_evidence',
  'unused',
] as const;

// ollama_extract rejects top-level JSON arrays (its parse step requires an object).
// Wrap in { assignments: [...] } so the model returns an object the tool accepts.
export const PLANNER_RESULT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    assignments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim_id: { type: 'string' },
          role: { type: 'string', enum: [...PLANNER_ROLES_ENUM] },
          role_rationale: { type: 'string', minLength: 1 },
        },
        required: ['claim_id', 'role', 'role_rationale'],
        additionalProperties: false,
      },
    },
  },
  required: ['assignments'],
  additionalProperties: false,
};

export function renderPlannerPrompt(
  sectionPurpose: string,
  claims: AcceptedClaimInput[],
): string {
  const lines: string[] = [];
  lines.push('Section purpose:');
  lines.push(sectionPurpose);
  lines.push('');
  lines.push('Admission rule (read this before assigning roles):');
  lines.push('accepted_for_synthesis means a claim passed extraction, frame-bound relevance review, and gate');
  lines.push('scrutiny — it does NOT mean it helps answer THIS section\'s specific purpose. For each claim,');
  lines.push('ask: "Does this claim help answer the section purpose?" If yes → assign a prose role. If the');
  lines.push('claim is on-topic for its source but not for this section\'s question → assign role=unused.');
  lines.push('');
  lines.push('Assign each of the following accepted claims to exactly one role:');
  lines.push('- answer: DIRECTLY answers the section purpose (reserve for claims that address the question head-on)');
  lines.push('- evidence: provides facts or data that support the answer');
  lines.push('- qualifier: scopes or qualifies the answer (conditions, caveats about scope)');
  lines.push('- caveat: notes limitations, counterpoints, or known failure modes');
  lines.push('- implication: points to downstream consequences or recommended actions');
  lines.push('- thin_evidence: accepted but weak; use ONLY when confidence is low and not directly answering');
  lines.push('- unused: claim is accepted but does NOT help answer this section purpose — assign unused when');
  lines.push('  the claim content is unrelated to what the section purpose asks, even if the claim is true');
  lines.push('');
  lines.push('If no claim directly answers the section purpose, leave the answer slot empty — do NOT promote');
  lines.push('a tangential claim to answer just to fill it.');
  lines.push('');
  lines.push('Claims (id | asserts | scope | not):');
  for (const c of claims) {
    const scopeStr = c.scope ?? '(universal)';
    const notStr = c.not ?? '(none)';
    lines.push(`${c.claim_id} | ${c.asserts} | scope: ${scopeStr} | not: ${notStr}`);
  }
  lines.push('');
  lines.push('Return {"assignments": [...]} where every claim_id appears exactly once.');
  lines.push('Each assignment MUST include: claim_id, role, and role_rationale.');
  lines.push('role_rationale is REQUIRED — provide a one-sentence explanation of why this claim was assigned');
  lines.push('this role relative to the section purpose. Empty rationale is not accepted.');
  return lines.join('\n');
}

export const PLANNER_HINT =
  'Assign every claim to one role. Each entry needs claim_id, role, and role_rationale (required, non-empty). ' +
  'Use role=unused for accepted claims that do not help answer the section purpose. ' +
  'Return {"assignments":[...]} with one entry per claim.';

// ── Drafter ───────────────────────────────────────────────────────────────────
// One call per role cluster: generate one readable paragraph FROM claim text.

export const DRAFTER_RESULT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    paragraph: { type: 'string' },
  },
  required: ['paragraph'],
  additionalProperties: false,
};

export function renderDrafterPrompt(
  sectionPurpose: string,
  role: ProseRole,
  claims: AcceptedClaimInput[],
  sourceCards: SourceCardMeta[],
): string {
  const lines: string[] = [];
  lines.push('Section purpose:');
  lines.push(sectionPurpose);
  lines.push('');
  lines.push(`Role of this paragraph: ${role}`);
  lines.push('');
  lines.push('Write ONE readable prose paragraph that synthesizes the following accepted claims.');
  lines.push('');
  lines.push('Accepted claims (these are the ONLY allowed source of assertions):');
  for (const c of claims) {
    lines.push(`[${c.claim_id}] ${c.asserts}`);
    if (c.scope) lines.push(`  Scope: ${c.scope}`);
    if (c.not) lines.push(`  Not: ${c.not}`);
  }
  if (sourceCards.length > 0) {
    lines.push('');
    lines.push('Source context (for attribution only — do NOT introduce facts from these sources');
    lines.push('unless those facts are already stated in the accepted claims above):');
    for (const s of sourceCards) {
      const pub = s.publisher ? ` (${s.publisher}, ${s.source_type})` : ` (${s.source_type})`;
      const title = s.title ?? s.url;
      lines.push(`[${s.source_id}] ${title}${pub}`);
    }
  }
  lines.push('');
  lines.push('Rules:');
  lines.push('- Write FROM the claim text above — not from general knowledge or the source text.');
  lines.push('- Do not introduce any assertion not present in the accepted claims.');
  lines.push('- Do not invent or modify claim IDs. Refer only to the claims provided.');
  lines.push('- Preserve scope and not-constraints; do not widen any claim.');
  if (role === 'answer') {
    lines.push('- ANSWER RULE: The first sentence MUST directly state the answer to the section purpose.');
    lines.push('- Do NOT begin with meta-preamble such as "This guide aims", "This section discusses",');
    lines.push('  "This synthesis provides", "This report explores", or any phrase that describes the');
    lines.push('  artifact rather than delivering the content. Write the answer itself, not about the answer.');
  } else if (role === 'thin_evidence') {
    lines.push('- This cluster has thin evidence; write conservatively and note the limited basis.');
  }
  lines.push('- Write exactly one paragraph (2-5 sentences). Return it in the `paragraph` field.');
  return lines.join('\n');
}

export const DRAFTER_HINT =
  'Write one prose paragraph synthesizing only the provided accepted claims. ' +
  'Do not introduce facts not in the claims. Return the paragraph text in the `paragraph` field.';

// ── Verifier ─────────────────────────────────────────────────────────────────
// One call per drafted paragraph: check faithfulness to its support cluster.

export const VERIFIER_DECISIONS_ENUM = [
  'faithful',
  'unsupported_connective',
  'omits_critical_qualifier',
] as const;

export const VERIFIER_RESULT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: [...VERIFIER_DECISIONS_ENUM] },
    rationale: { type: 'string' },
  },
  required: ['decision', 'rationale'],
  additionalProperties: false,
};

export function renderVerifierPrompt(
  sectionPurpose: string,
  role: ProseRole,
  paragraph: string,
  claims: AcceptedClaimInput[],
): string {
  const lines: string[] = [];
  lines.push('Section purpose:');
  lines.push(sectionPurpose);
  lines.push('');
  lines.push(`Paragraph role: ${role}`);
  lines.push('');
  lines.push('Paragraph to verify:');
  lines.push(paragraph);
  lines.push('');
  lines.push('Support claims (the ONLY valid factual basis for this paragraph):');
  for (const c of claims) {
    lines.push(`[${c.claim_id}] ${c.asserts}`);
    if (c.scope) lines.push(`  Scope: ${c.scope}`);
    if (c.not) lines.push(`  Not: ${c.not}`);
  }
  lines.push('');
  lines.push('Does this paragraph faithfully reflect ONLY what its support claims say?');
  lines.push('');
  lines.push('Return one decision:');
  lines.push('- faithful: every proposition in the paragraph is directly supported by at least one claim above.');
  lines.push('- unsupported_connective: the paragraph contains at least one proposition or assertion not present in any support claim.');
  lines.push('- omits_critical_qualifier: the paragraph drops a scope or not-constraint that is present in the support claims, potentially widening the claim.');
  lines.push('');
  lines.push('IMPORTANT: a proposition cannot be blessed merely because it could be inferred from source material.');
  lines.push('It must be present in the support claim set. When in doubt, return unsupported_connective.');
  lines.push('');
  lines.push('Return a one-sentence rationale explaining your decision.');
  return lines.join('\n');
}

export const VERIFIER_HINT =
  'Check whether the paragraph is fully supported by the listed claims. ' +
  'Return faithful, unsupported_connective, or omits_critical_qualifier, plus a one-sentence rationale.';

export const PROSE_PROMPT_VERSION = 'section-prose-v3';
