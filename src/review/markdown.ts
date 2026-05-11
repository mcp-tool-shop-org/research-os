import type { ReviewSnapshot } from './schema.js';
import type { ReviewerOptions } from './reviewer-options-schema.js';

const SEVERITY_GLYPH: Record<string, string> = {
  info: '[INFO]',
  warn: '[WARN]',
  block: '[BLOCK]',
};

const DECISION_GLYPH: Record<string, string> = {
  accepted_for_synthesis: '[ACCEPTED]',
  rejected: '[REJECTED]',
  needs_scope_repair: '[NEEDS-SCOPE-REPAIR]',
  needs_source_repair: '[NEEDS-SOURCE-REPAIR]',
  needs_contradiction_mapping: '[NEEDS-CONTRADICTION-MAPPING]',
  needs_human_review: '[NEEDS-HUMAN-REVIEW]',
};

export function renderReviewMarkdown(snapshot: ReviewSnapshot): string {
  const lines: string[] = [];
  lines.push(`# Adversarial Review: ${snapshot.section_id}`);
  lines.push('');
  lines.push(`**Reviewer:** ${snapshot.reviewer} (${snapshot.review_method})`);
  lines.push(`**Reviewed at:** ${snapshot.reviewed_at}`);
  lines.push(`**Candidate claims:** ${snapshot.candidate_claims}`);
  lines.push(`**Findings:** ${snapshot.findings.length} (block: ${snapshot.severity_counts.block ?? 0}, warn: ${snapshot.severity_counts.warn ?? 0}, info: ${snapshot.severity_counts.info ?? 0})`);
  lines.push(`**LLM findings rejected (ungrounded):** ${snapshot.llm_findings_rejected_ungrounded}`);
  lines.push('');

  lines.push('> Adversarial review judges research integrity. It does not synthesize, rewrite source truth, or erase extraction history. Decisions below are review truth — claims.jsonl is unchanged.');
  lines.push('');

  const opts = snapshot.reviewer_options as ReviewerOptions | undefined;
  if (opts && Object.keys(opts).length > 0) {
    lines.push('## Reviewer options');
    lines.push('');
    const KEY_ORDER = ['num_ctx', 'temperature', 'seed', 'top_p', 'top_k', 'repeat_penalty'] as const;
    for (const key of KEY_ORDER) {
      if (opts[key] !== undefined) lines.push(`- ${key}: ${opts[key]}`);
    }
    lines.push('');
  }

  lines.push('## Effective decisions');
  lines.push('');
  const decisions = snapshot.decision_counts;
  for (const d of [
    'rejected',
    'needs_contradiction_mapping',
    'needs_source_repair',
    'needs_scope_repair',
    'needs_human_review',
    'accepted_for_synthesis',
  ]) {
    const n = decisions[d as keyof typeof decisions] ?? 0;
    if (n > 0) lines.push(`- ${DECISION_GLYPH[d] ?? d}: ${n}`);
  }
  if (snapshot.findings.length === 0) {
    lines.push('');
    lines.push('No findings produced. A clean review is not proof of completeness — it means the configured reviewer found nothing of integrity concern.');
  }
  lines.push('');

  if (snapshot.findings.length > 0) {
    lines.push('## Findings');
    lines.push('');
    for (const f of snapshot.findings) {
      const glyph = SEVERITY_GLYPH[f.severity] ?? `[${f.severity.toUpperCase()}]`;
      lines.push(`### ${glyph} ${f.category} (${f.finding_id})`);
      lines.push('');
      lines.push(f.summary);
      lines.push('');
      lines.push(`- **Claim IDs:** ${f.claim_ids.map((c) => `\`${c}\``).join(', ') || '(none)'}`);
      lines.push(`- **Source IDs:** ${f.source_ids.map((s) => `\`${s}\``).join(', ') || '(none)'}`);
      lines.push(`- **Required action:** ${f.required_action || '(unspecified)'}`);
      lines.push(`- **Reviewer:** ${f.reviewer} (${f.review_method})`);
      lines.push(`- **Confidence:** ${f.confidence}`);
      if (f.evidence) lines.push(`- **Evidence:** ${f.evidence}`);
      lines.push('');
    }
  }

  if (snapshot.claim_reviews.length > 0) {
    lines.push('## Claim review decisions');
    lines.push('');
    for (const r of snapshot.claim_reviews) {
      const glyph = DECISION_GLYPH[r.decision] ?? `[${r.decision.toUpperCase()}]`;
      lines.push(`### ${glyph} \`${r.claim_id}\``);
      lines.push('');
      lines.push(`${r.reason}`);
      if (r.finding_ids.length > 0) {
        lines.push('');
        lines.push(`Cites findings: ${r.finding_ids.map((id) => `\`${id}\``).join(', ')}.`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
