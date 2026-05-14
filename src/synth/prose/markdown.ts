// Renders section-synthesis.md from a prose block + manifest context.
//
// Top block: callout-style disclosure (status, pack status, waivers, evidence notes).
// Body: prose paragraphs in role order with footnote-style support markers.
// Footnotes: claim IDs + source card IDs per paragraph.

import type { ProseBlock, ProseNoAnswerClusterError } from './types.js';

export interface SectionSynthesisMarkdownInput {
  sectionId: string;
  sectionPurpose: string;
  packMode: string;
  gateVerdict: string | null;
  waiversApplied: Array<{ scope: string; family: string; reason: string; applied_to: string }>;
  proseBlock: ProseBlock;
  generatedAt: string;
  researchOsVersion: string;
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    answer: 'Answer',
    evidence: 'Evidence',
    qualifier: 'Qualifiers',
    caveat: 'Caveats',
    implication: 'Implications',
    thin_evidence: 'Thin evidence (limited basis)',
  };
  return labels[role] ?? role;
}

export function renderSectionSynthesisMarkdown(
  input: SectionSynthesisMarkdownInput,
): string {
  const { sectionId, sectionPurpose, packMode, gateVerdict, waiversApplied, proseBlock } = input;
  const { paragraphs, disclosures } = proseBlock;

  const lines: string[] = [];

  // ── Top block callout ────────────────────────────────────────────────────
  lines.push('> **Status:** partial_synthesis');
  lines.push(`> **Pack status:** ${packMode}`);

  if (waiversApplied.length > 0) {
    const waiverSummaries = waiversApplied.map(
      (w) => `${w.scope}.${w.family} (applied to \`${w.applied_to}\`)`,
    );
    lines.push(`> **Waivers:** ${waiverSummaries.join('; ')}`);
  } else {
    lines.push('> **Waivers:** none');
  }

  if (disclosures.thin_evidence_paragraphs.length > 0) {
    lines.push(
      `> **Evidence notes:** paragraph(s) ${disclosures.thin_evidence_paragraphs.join(', ')} rely on thin evidence`,
    );
  }

  lines.push('>');
  lines.push(
    '> This is a partial section-scoped synthesis. The parent pack is in ' +
      `\`${packMode}\` mode. This artifact is NOT a pack-level synthesis and the pack is NOT freezable or publishable.`,
  );
  lines.push('');

  // ── Header ───────────────────────────────────────────────────────────────
  lines.push(`# Section Synthesis: \`${sectionId}\``);
  lines.push('');
  lines.push(`**Section purpose:** ${sectionPurpose}`);
  lines.push(`**Gate verdict:** ${gateVerdict ?? '_(no gate run recorded)_'}`);
  lines.push(`**Generated:** ${input.generatedAt}`);
  lines.push(`**research-os version:** \`${input.researchOsVersion}\``);
  lines.push('');

  if (paragraphs.length === 0) {
    lines.push(
      '_No prose paragraphs were generated — the MCP drafter was unable to produce verified output for any role cluster. Consult `section-brief.md` for the full evidence index._',
    );
    lines.push('');
    return lines.join('\n');
  }

  // ── Prose paragraphs ─────────────────────────────────────────────────────
  lines.push('## Synthesis');
  lines.push('');

  // Group consecutive same-role paragraphs under one heading.
  let lastRole = '';
  for (const p of paragraphs) {
    if (p.role !== lastRole) {
      lines.push(`### ${roleLabel(p.role)}`);
      lines.push('');
      lastRole = p.role;
    }

    const footnoteRef = `[^${p.paragraph_id}]`;
    lines.push(`${p.text}${footnoteRef}`);
    lines.push('');
  }

  // ── Footnotes (support markers) ──────────────────────────────────────────
  // Footnote body: claim IDs + source card IDs per paragraph.
  for (const p of paragraphs) {
    const claimList = p.support_bundle.claim_ids.map((id) => `\`${id}\``).join(', ');
    const srcList = p.support_bundle.source_card_ids.map((id) => `\`${id}\``).join(', ');
    const extras: string[] = [];
    if (p.support_bundle.thin_evidence) extras.push('thin evidence');
    if (p.verifier_decision !== 'faithful') extras.push(`verifier: ${p.verifier_decision}`);
    const extraStr = extras.length > 0 ? ` — _${extras.join(', ')}_` : '';
    lines.push(`[^${p.paragraph_id}]: **Claims:** ${claimList} | **Sources:** ${srcList}${extraStr}`);
  }
  lines.push('');

  // ── Disclosures ───────────────────────────────────────────────────────────
  if (waiversApplied.length > 0 || disclosures.thin_evidence_paragraphs.length > 0) {
    lines.push('## Disclosures');
    lines.push('');

    if (waiversApplied.length > 0) {
      lines.push('### Waivers');
      lines.push('');
      for (const w of waiversApplied) {
        lines.push(`- **${w.scope}.${w.family}** applied to \`${w.applied_to}\``);
        lines.push(`  - Reason: ${w.reason}`);
      }
      lines.push('');
    }

    if (disclosures.thin_evidence_paragraphs.length > 0) {
      lines.push('### Thin evidence');
      lines.push('');
      lines.push(
        `Paragraph(s) ${disclosures.thin_evidence_paragraphs.join(', ')} rely on thin evidence (single accepted claim with low confidence, or verification failed after retry). Treat these with additional scrutiny.`,
      );
      lines.push('');
    }
  }

  // ── Unused accepted claims ─────────────────────────────────────────────────
  if (disclosures.unused_claims.length > 0) {
    lines.push('## Unused accepted claims');
    lines.push('');
    lines.push(`${disclosures.unused_claims.length} accepted claim(s) passed gate review but were not used in this synthesis because they do not address the section purpose:`);
    lines.push('');
    for (const u of disclosures.unused_claims) {
      lines.push(`- \`${u.claim_id}\` — ${u.role_rationale}`);
    }
    lines.push('');
  }

  // ── Guardrails ────────────────────────────────────────────────────────────
  lines.push('## Guardrails');
  lines.push('');
  lines.push('- This artifact cites only `accepted_for_synthesis` claims from this section.');
  lines.push('- It does NOT speak for any other section in the pack.');
  lines.push('- It does NOT make the pack freezable or publishable.');
  lines.push('- `frame_excluded`, `rejected`, and `unreviewed` claims do not appear in any support bundle.');
  lines.push('- The JSON provenance layer (`section-synthesis.json` `.prose.paragraphs[*].support_bundle`) is the canonical traceability layer.');
  lines.push('');

  return lines.join('\n');
}

// Render the no-answer-cluster failure marker for section-synthesis.md.
export function renderNoAnswerClusterMarker(
  err: ProseNoAnswerClusterError,
  sectionPurpose: string,
): string {
  const lines: string[] = [];
  lines.push('> **Status:** generation_failed');
  lines.push('> **Error code:** no_answer_cluster');
  lines.push('>');
  lines.push('> No accepted claim directly answers the section purpose. The planner declined to');
  lines.push('> produce off-topic prose. This is the correct outcome — consult `section-brief.md`');
  lines.push('> for the full evidence index and consider sourcing on-topic evidence.');
  lines.push('');
  lines.push(`**Section purpose:** ${sectionPurpose}`);
  lines.push(`**Accepted claims:** ${err.accepted_claim_count} (${err.unused_count} assigned unused)`);
  lines.push('');
  if (err.unused_claims.length > 0) {
    lines.push('## Unused accepted claims');
    lines.push('');
    lines.push(`${err.unused_claims.length} of ${err.accepted_claim_count} accepted claim(s) assigned role=unused:`);
    lines.push('');
    for (const u of err.unused_claims) {
      lines.push(`- \`${u.claim_id}\` — ${u.role_rationale}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// Build the prose block's compact representation suitable for disclosure in the
// section-brief (a few lines noting that prose was generated, not the full text).
export function renderProseSummaryForBrief(paragraphCount: number, sectionId: string): string {
  if (paragraphCount === 0) {
    return `_Prose synthesis attempted but produced no verified paragraphs. See \`section-brief.md\` for the evidence index._`;
  }
  return (
    `Prose synthesis generated ${paragraphCount} paragraph(s) into ` +
    `\`sections/${sectionId}/synthesis/section-synthesis.md\`. ` +
    `Paragraph-level provenance is in \`section-synthesis.json\` under \`.prose.paragraphs\`.`
  );
}
