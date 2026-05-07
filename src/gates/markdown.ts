import type { SectionGateResult } from './types.js';

const STATUS_GLYPH: Record<string, string> = {
  pass: '[PASS]',
  warn: '[WARN]',
  fail: '[FAIL]',
  pass_with_waiver: '[PASS+WAIVER]',
  warn_with_waiver: '[WARN+WAIVER]',
};

export function renderGateMarkdown(result: SectionGateResult): string {
  const lines: string[] = [];
  lines.push(`# Gate Result: ${result.section_id}`);
  lines.push('');
  lines.push(`**Verdict:** ${result.verdict.toUpperCase()}`);
  lines.push(`**Synthesis eligible:** ${result.synthesis_eligible ? 'yes' : 'no'}`);
  lines.push(`**Checked at:** ${result.checked_at}`);
  lines.push('');
  lines.push(`> ${result.summary}`);
  lines.push('');

  if (result.blocking_reasons.length > 0) {
    lines.push('## Blocking reasons');
    lines.push('');
    for (const r of result.blocking_reasons) {
      lines.push(`- ${r}`);
    }
    lines.push('');
  }

  lines.push('## Counts');
  lines.push('');
  lines.push(`- Claims: ${result.claim_counts.total} total, ${result.claim_counts.candidate} candidate, ${result.claim_counts.with_evidence_excerpt} with evidence excerpt, ${result.claim_counts.orphans} orphan`);
  lines.push(`- Sources: ${result.source_counts.total} total (${result.source_counts.primary} primary / ${result.source_counts.secondary} secondary / ${result.source_counts.docs} docs / ${result.source_counts.forum} forum / ${result.source_counts.benchmark} benchmark / ${result.source_counts.unknown} unknown), ${result.source_counts.independent_publishers} independent publishers, ${result.source_counts.failed_fetches} failed fetches`);
  lines.push(`- Contradictions: ${result.contradiction_counts.total} total (${result.contradiction_counts.unresolved} unresolved, ${result.contradiction_counts.blocking} high/blocking)`);
  lines.push(`- Scope integrity: ${result.scope_integrity_summary.scoped_claims} scoped, ${result.scope_integrity_summary.universal_claims} universal/untagged, ${result.scope_integrity_summary.with_not_constraint} with 'not' constraint, ${result.scope_integrity_summary.overgen_risks_total} overgeneralization risk(s) (${result.scope_integrity_summary.overgen_risks_blocking} blocking)`);
  lines.push(`- Freshness: policy ${result.freshness_summary.policy_required ? 'required' : 'not required'}, ${result.freshness_summary.stale_count} stale, ${result.freshness_summary.unknown_date_count} unknown date`);
  lines.push('');

  if (result.waivers_applied.length > 0) {
    lines.push('## Waivers applied');
    lines.push('');
    for (const w of result.waivers_applied) {
      lines.push(`### ${w.family}.${w.check}`);
      lines.push('');
      lines.push(`- **Original status:** ${w.original_status}`);
      lines.push(`- **New status:** ${w.new_status}`);
      lines.push(`- **Reason:** ${w.reason}`);
      lines.push(`- **Compensating controls:**`);
      for (const c of w.compensating_controls) {
        lines.push(`  - ${c}`);
      }
      lines.push('');
    }
  }

  lines.push('## Gate results');
  lines.push('');
  for (const r of result.gate_results) {
    const glyph = STATUS_GLYPH[r.status] ?? `[${r.status.toUpperCase()}]`;
    lines.push(`### ${glyph} ${r.family}.${r.check}`);
    lines.push('');
    lines.push(`${r.detail}`);
    lines.push('');
    lines.push(`*Blocks synthesis:* ${r.blocks_synthesis}`);
    if (r.evidence.length > 0) {
      lines.push('');
      lines.push(`*Evidence:* ${r.evidence.slice(0, 10).map((e) => `\`${e}\``).join(', ')}${r.evidence.length > 10 ? ` (+${r.evidence.length - 10} more)` : ''}`);
    }
    lines.push('');
  }

  if (result.next_actions.length > 0) {
    lines.push('## Next actions');
    lines.push('');
    for (const a of result.next_actions) {
      lines.push(`- ${a}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
