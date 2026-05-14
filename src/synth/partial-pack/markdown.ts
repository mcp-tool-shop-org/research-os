// Render partial-pack-synthesis.md from the artifact JSON.
//
// Top block: callout-style disclosure (status, pack status, freezable=no,
// publishable=no, included/excluded counts).
//
// Body sections in order:
//   ## Answer / Synthesis paragraphs (role-grouped)
//   ## What this synthesis covers (included sections)
//   ## What this synthesis excludes (excluded sections with reasons)
//   ## Section evidence trail (one entry per included section)

import type {
  PartialPackArtifact,
  PartialPackCrossSectionAnswerSupportMissingError,
  PartialPackExcludedSection,
  PartialPackIncludedSection,
  PartialPackInsufficientCrossSectionCandidatesError,
  PartialPackNoIncludedSectionsError,
  PartialPackParagraph,
  PartialPackProseError,
} from './types.js';
import { renderRecoverySummaryMarkdown } from './recovery-embed.js';

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    answer: 'Answer',
    evidence: 'Evidence',
    qualifier: 'Qualifiers',
    caveat: 'Caveats',
    implication: 'Implications',
  };
  return labels[role] ?? role;
}

function exclusionReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    gate_blocked: 'Gate blocked',
    unrun: 'Unrun',
    repair_required: 'Repair required',
    prose_error: 'Prose error',
    no_section_synthesis: 'No section synthesis',
    brief_only: 'Brief only',
  };
  return labels[reason] ?? reason;
}

export interface PartialPackMarkdownInput {
  artifact: PartialPackArtifact;
}

export function renderPartialPackMarkdown(input: PartialPackMarkdownInput): string {
  const { artifact } = input;
  const lines: string[] = [];

  // ── Top callout ─────────────────────────────────────────────────────────
  lines.push(`> **Status:** ${artifact.status}`);
  lines.push(`> **Pack status:** ${artifact.pack_mode}`);
  lines.push(`> **Included sections:** ${artifact.included_sections.length}`);
  lines.push(`> **Excluded sections:** ${artifact.excluded_sections.length}`);
  lines.push('> **Freezable:** no');
  lines.push('> **Publishable:** no');
  lines.push('>');
  lines.push(
    '> This is a partial pack synthesis. It summarizes only sections with valid section-level prose.',
  );
  lines.push(
    '> Blocked, unrun, or failed sections are disclosed below and are not silently omitted. The pack is',
  );
  lines.push('> NOT freezable and NOT publishable.');
  lines.push('');

  // ── Header ──────────────────────────────────────────────────────────────
  lines.push('# Partial Pack Synthesis');
  lines.push('');
  lines.push(`**Pack:** ${artifact.pack_topic}`);
  lines.push(`**Pack ID:** \`${artifact.pack_id}\``);
  lines.push(`**Pack mode:** \`${artifact.pack_mode}\``);
  lines.push(`**Generated:** ${artifact.generated_at}`);
  lines.push(`**research-os version:** \`${artifact.research_os_version}\``);
  lines.push('');

  // ── Prose body (or proseError failure marker) ───────────────────────────
  if (artifact.proseError) {
    lines.push(...renderProseErrorBody(artifact.proseError));
  } else {
    lines.push(...renderProseBody(artifact.prose?.paragraphs ?? []));
  }

  // ── Coverage ────────────────────────────────────────────────────────────
  lines.push('## What this synthesis covers');
  lines.push('');
  lines.push(...renderIncludedList(artifact.included_sections));
  lines.push('');

  // ── Exclusions ──────────────────────────────────────────────────────────
  lines.push('## What this synthesis excludes');
  lines.push('');
  lines.push(...renderExcludedList(artifact.excluded_sections));
  lines.push('');

  // ── Section evidence trail ──────────────────────────────────────────────
  lines.push('## Section evidence trail');
  lines.push('');
  if (artifact.included_sections.length === 0) {
    lines.push('_None — no sections were included in this synthesis._');
  } else {
    for (const s of artifact.included_sections) {
      lines.push(`### ${s.section_id}`);
      lines.push('');
      lines.push(`- **Purpose:** ${s.section_purpose}`);
      lines.push(`- **Section synthesis:** \`${s.section_synthesis_path}\``);
      lines.push(`- **Faithful paragraphs:** ${s.paragraph_count}`);
      lines.push('');
    }
  }

  // ── Guardrails ──────────────────────────────────────────────────────────
  lines.push('## Guardrails');
  lines.push('');
  lines.push(
    '- This artifact synthesizes only sections with valid section-level prose; blocked, unrun, and failed sections are listed above.',
  );
  lines.push(
    '- Pack-level paragraphs cite section paragraph IDs (`<section_id>:<paragraph_id>`), never raw claim IDs.',
  );
  lines.push(
    '- The pack is **NOT** freezable as a whole and **NOT** publishable as a whole until every section is ready.',
  );
  lines.push(
    '- `research-os freeze` and `pack publish` continue to refuse this pack; this artifact does not change that.',
  );
  lines.push('');

  return lines.join('\n');
}

function renderProseBody(paragraphs: PartialPackParagraph[]): string[] {
  const lines: string[] = [];
  if (paragraphs.length === 0) {
    lines.push('## Answer');
    lines.push('');
    lines.push('_No prose paragraphs were generated. Consult excluded sections below._');
    lines.push('');
    return lines;
  }

  // Group consecutive same-role paragraphs under one heading. The first
  // paragraph is the answer; subsequent ones use other roles.
  let lastRole = '';
  for (const p of paragraphs) {
    if (p.role !== lastRole) {
      lines.push(`## ${roleLabel(p.role)}`);
      lines.push('');
      lastRole = p.role;
    }
    const footnoteRef = `[^${p.paragraph_id}]`;
    lines.push(`${p.text}${footnoteRef}`);
    lines.push('');
  }

  // Footnotes: section paragraph IDs (NOT claim IDs).
  for (const p of paragraphs) {
    const refs = p.support_bundle.section_paragraph_ids.map((id) => `\`${id}\``).join(', ');
    lines.push(`[^${p.paragraph_id}]: **Section paragraphs:** ${refs}`);
  }
  lines.push('');
  return lines;
}

function renderIncludedList(included: PartialPackIncludedSection[]): string[] {
  if (included.length === 0) {
    return ['_None._'];
  }
  const lines: string[] = [];
  for (const s of included) {
    lines.push(`- **${s.section_id}** — ${s.section_purpose}`);
    lines.push(`  - Section synthesis: \`${s.section_synthesis_path}\``);
    lines.push(`  - Faithful paragraphs: ${s.paragraph_count}`);
  }
  return lines;
}

function renderExcludedList(excluded: PartialPackExcludedSection[]): string[] {
  if (excluded.length === 0) {
    return ['_None._'];
  }
  // Slice 3b — one block per excluded section in research.yaml order, with
  // embedded recovery_summary right under the "Why excluded" line so the
  // operator sees "what's blocked + what to do next" in the same place.
  // Older format (group by reason) is retired: the recovery block is
  // per-section guidance, so each section needs its own heading.
  const lines: string[] = [];
  for (const e of excluded) {
    lines.push(`### ${e.section_id}`);
    lines.push('');
    lines.push(`_${e.section_purpose}_`);
    lines.push('');
    lines.push(
      `**Why excluded:** \`${e.reason}\` (${exclusionReasonLabel(e.reason)}) — ${e.detail}`,
    );
    lines.push('');
    if (e.recovery_summary) {
      lines.push(...renderRecoverySummaryMarkdown(e.recovery_summary));
    }
  }
  return lines;
}

function renderProseErrorBody(err: PartialPackProseError): string[] {
  switch (err.code) {
    case 'no_included_sections':
      return renderNoIncludedSectionsBody(err);
    case 'insufficient_cross_section_candidates':
      return renderInsufficientCandidatesBody(err);
    case 'cross_section_answer_support_missing':
      return renderCrossSectionSupportMissingBody(err);
    default:
      // Unknown error shape — defensive fallback.
      return [
        '> **Generation status:** generation_failed',
        '> **Error code:** unknown',
        '>',
        '> An unrecognized prose-error code was emitted by the partial-pack orchestrator.',
        '',
        '## Generation failed',
        '',
        '',
      ];
  }
}

function renderNoIncludedSectionsBody(err: PartialPackNoIncludedSectionsError): string[] {
  const lines: string[] = [];
  lines.push('> **Generation status:** generation_failed');
  lines.push('> **Error code:** no_included_sections');
  lines.push('>');
  lines.push(
    '> No section has valid section-level prose. Partial-pack synthesis cannot generate without at least one',
  );
  lines.push(
    '> included section. The excluded sections (with reasons) are listed below; resolve the blockers there',
  );
  lines.push(
    '> and re-run section synthesis before attempting partial-pack synthesis again.',
  );
  lines.push('');
  lines.push('## Generation failed');
  lines.push('');
  lines.push(err.message);
  lines.push('');
  return lines;
}

function renderInsufficientCandidatesBody(
  err: PartialPackInsufficientCrossSectionCandidatesError,
): string[] {
  const lines: string[] = [];
  lines.push('> **Generation status:** generation_failed');
  lines.push('> **Error code:** insufficient_cross_section_candidates');
  lines.push('>');
  lines.push(
    '> The pack has ≥2 included sections, but fewer than 2 of them have at least one faithful',
  );
  lines.push(
    '> answer-role or evidence-role paragraph available. The cross-section answer bundle cannot',
  );
  lines.push(
    '> be constructed deterministically. Resolve the source-side gap (run or repair section',
  );
  lines.push(
    '> synthesis for the missing sections) and re-run partial-pack synthesis.',
  );
  lines.push('');
  lines.push('## Generation failed');
  lines.push('');
  lines.push(err.message);
  lines.push('');
  lines.push('### Candidate pool');
  lines.push('');
  for (const c of err.candidate_pool) {
    const marker = c.qualified ? '✓' : '✗';
    lines.push(`- ${marker} **${c.section_id}** — ${c.reason}`);
  }
  lines.push('');
  return lines;
}

function renderCrossSectionSupportMissingBody(
  err: PartialPackCrossSectionAnswerSupportMissingError,
): string[] {
  const lines: string[] = [];
  lines.push('> **Generation status:** generation_failed');
  lines.push('> **Error code:** cross_section_answer_support_missing');
  lines.push('>');
  lines.push(
    '> The drafter produced an answer paragraph whose support bundle violates the cross-section',
  );
  lines.push(
    '> contract on both the initial call and the one allowed retry. Partial-pack synthesis refuses',
  );
  lines.push(
    '> to admit the off-spec output. Inspect the drafter prompt, the section paragraph substrate,',
  );
  lines.push(
    '> or the drafter model selection before re-running.',
  );
  lines.push('');
  lines.push('## Generation failed');
  lines.push('');
  lines.push(err.message);
  lines.push('');
  lines.push('### Required answer support bundle');
  lines.push('');
  for (const spid of err.required_section_paragraph_ids) {
    lines.push(`- \`${spid}\``);
  }
  lines.push('');
  lines.push('### Observed answer support bundle (final attempt)');
  lines.push('');
  if (err.observed_section_paragraph_ids.length === 0) {
    lines.push('_None._');
  } else {
    for (const spid of err.observed_section_paragraph_ids) {
      lines.push(`- \`${spid}\``);
    }
  }
  lines.push('');
  lines.push(`### Final validation reason`);
  lines.push('');
  lines.push(err.final_reason);
  lines.push('');
  return lines;
}
