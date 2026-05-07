import type {
  OrphanClaimRow,
  PackAuditPayload,
  PackVerdict,
  ScopeWideningRiskRow,
  SourceDiversityGapRow,
  StaleSourceRow,
  UnresolvedContradictionRow,
  WeakSourceRow,
} from './types.js';

const VERDICT_GLYPH: Record<PackVerdict, string> = {
  ready_for_synthesis: '[READY FOR SYNTHESIS]',
  repair_required: '[REPAIR REQUIRED]',
  human_review_required: '[HUMAN REVIEW REQUIRED]',
  blocked: '[BLOCKED]',
};

const COMMON_LAW =
  '> Pack audit aggregates existing research truth. It does not create new truth, resolve failures, or hide section-level evidence. The canonical artifacts (claims, source-cards, fetch-log, gate/review JSON) are the source of authority — these rollups are pointers.';

export function renderPackAuditMarkdown(p: PackAuditPayload): string {
  const lines: string[] = [];
  lines.push(`# Pack Audit: ${p.pack_topic}`);
  lines.push('');
  lines.push(`**Pack ID:** \`${p.pack_id}\``);
  lines.push(`**Verdict:** ${VERDICT_GLYPH[p.verdict]} ${p.verdict}`);
  lines.push(`**Synthesis allowed:** ${p.synthesis_allowed ? 'yes' : 'no'}`);
  lines.push(`**Generated:** ${p.generated_at}`);
  lines.push(`**Cowork handoff mode:** ${p.readiness_summary.cowork_handoff_mode}`);
  lines.push(`**Workspace allowed:** ${p.readiness_summary.workspace_allowed ? 'yes' : 'no'}`);
  lines.push('');
  lines.push(COMMON_LAW);
  lines.push('');

  if (p.blocking_reasons.length > 0) {
    lines.push('## Blocking reasons');
    lines.push('');
    for (const r of p.blocking_reasons) lines.push(`- ${r}`);
    lines.push('');
  }

  lines.push('## Counts at a glance');
  lines.push('');
  lines.push(`- **Sections:** ${p.readiness_summary.total_sections} total — ${p.readiness_summary.ready_sections} ready, ${p.readiness_summary.repair_sections} in repair, ${p.readiness_summary.blocked_sections} blocked, ${p.readiness_summary.no_gate_sections} without gate, ${p.readiness_summary.no_review_sections} without review`);
  lines.push(`- **Claims:** ${p.claim_summary.total} total (${p.claim_summary.candidate} candidate; ${p.claim_summary.accepted_for_synthesis} accepted, ${p.claim_summary.needs_repair} repair, ${p.claim_summary.rejected} rejected, ${p.claim_summary.no_review} no_review, ${p.claim_summary.orphans} orphan)`);
  lines.push(`- **Sources:** ${p.source_summary.total} total (${p.source_summary.primary} primary, ${p.source_summary.secondary} secondary, ${p.source_summary.docs} docs, ${p.source_summary.forum} forum, ${p.source_summary.benchmark} benchmark, ${p.source_summary.unknown} unknown), ${p.source_summary.independent_publishers} publishers, ${p.source_summary.failed_fetches} failed fetches; ${p.source_summary.sections_with_sources}/${p.readiness_summary.total_sections} sections have at least one source`);
  lines.push(`- **Contradictions:** ${p.contradiction_summary.total} total (${p.contradiction_summary.unresolved} unresolved, ${p.contradiction_summary.blocking} high/blocking, ${p.contradiction_summary.reconciled} reconciled, ${p.contradiction_summary.preserved_deliberately} preserved_deliberately, ${p.contradiction_summary.rejected} rejected); ${p.contradiction_summary.sections_with_clean_ledger} sections have an empty contradiction ledger — *empty is not proof of completeness, only that the configured detector found nothing*`);
  lines.push(`- **Review:** ${p.review_summary.sections_with_review_run}/${p.readiness_summary.total_sections} sections have had \`research-os review\` run; ${p.review_summary.blocking_findings} blocking findings recorded`);
  lines.push(`- **Waivers:** ${p.waiver_summary.total} total (${p.waiver_summary.invalid} invalid)`);
  lines.push('');

  lines.push('## Section synthesis-readiness');
  lines.push('');
  lines.push('| Section | Status | Gate | Synthesis-eligible | Candidates | Accepted | Repair | Rejected |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of p.section_summaries) {
    lines.push(`| \`${r.section_id}\` | ${r.status} | ${r.gate_verdict ?? '—'} | ${r.synthesis_eligible ? 'yes' : 'no'} | ${r.candidate_claims} | ${r.accepted_claims} | ${r.repair_claims} | ${r.rejected_claims} |`);
  }
  lines.push('');

  lines.push('## Audit files (canonical pointers)');
  lines.push('');
  for (const f of p.audit_files) lines.push(`- \`${f}\``);
  lines.push('');

  lines.push('## Recommended next actions');
  lines.push('');
  if (p.next_actions.length === 0) {
    lines.push('_(none recommended)_');
  } else {
    let i = 1;
    for (const a of p.next_actions) {
      lines.push(`${i}. ${a}`);
      i += 1;
    }
  }
  lines.push('');

  if (p.warnings.length > 0) {
    lines.push('## Warnings (from audit generation)');
    lines.push('');
    for (const w of p.warnings) lines.push(`- ${w}`);
    lines.push('');
  }

  return lines.join('\n');
}

function listOrEmpty<T>(items: T[], emptyMessage: string, render: (item: T) => string): string[] {
  if (items.length === 0) return ['', `_${emptyMessage}_`, ''];
  return items.map(render);
}

export function renderOrphanClaimsMarkdown(rows: OrphanClaimRow[]): string {
  const lines: string[] = [];
  lines.push('# Orphan claims');
  lines.push('');
  lines.push(COMMON_LAW);
  lines.push('');
  if (rows.length === 0) {
    lines.push('_No orphan claims detected. (A clean orphan-claims ledger is a precondition for synthesis, not a proof of completeness.)_');
    return lines.join('\n') + '\n';
  }
  lines.push('| Claim ID | Section | Reason | Details | Artifact |');
  lines.push('|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(`| \`${r.claim_id}\` | \`${r.section_id}\` | ${r.reason} | ${r.details.replace(/\|/g, '\\|')} | \`${r.artifact_path}\` |`);
  }
  lines.push('');
  return lines.join('\n');
}

export function renderStaleSourcesMarkdown(rows: StaleSourceRow[]): string {
  const lines: string[] = [];
  lines.push('# Stale sources');
  lines.push('');
  lines.push(COMMON_LAW);
  lines.push('');
  if (rows.length === 0) {
    lines.push('_No stale sources detected (or pack freshness policy not required)._');
    return lines.join('\n') + '\n';
  }
  lines.push('| Source | Section | Publisher | Reason | Policy | Details | Artifact |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(`| \`${r.source_id}\` | \`${r.section_id}\` | ${r.publisher ?? '—'} | ${r.reason} | ${r.policy.stale_source_policy}${r.policy.max_source_age_months !== null ? ` (max ${r.policy.max_source_age_months}mo)` : ''} | ${r.details.replace(/\|/g, '\\|')} | \`${r.artifact_path}\` |`);
  }
  lines.push('');
  return lines.join('\n');
}

export function renderWeakSourcesMarkdown(rows: WeakSourceRow[]): string {
  const lines: string[] = [];
  lines.push('# Weak sources');
  lines.push('');
  lines.push(COMMON_LAW);
  lines.push('');
  if (rows.length === 0) {
    lines.push('_No weak-source signals detected._');
    return lines.join('\n') + '\n';
  }
  for (const r of rows) {
    lines.push(`### \`${r.section_id}\`: ${r.reason}`);
    lines.push('');
    lines.push(`- **Details:** ${r.details}`);
    lines.push(`- **Evidence IDs:** ${r.evidence_ids.length === 0 ? '_(none)_' : r.evidence_ids.map((e) => `\`${e}\``).join(', ')}`);
    lines.push(`- **Artifact:** \`${r.artifact_path}\``);
    lines.push('');
  }
  return lines.join('\n');
}

export function renderUnresolvedContradictionsMarkdown(rows: UnresolvedContradictionRow[]): string {
  const lines: string[] = [];
  lines.push('# Unresolved contradictions');
  lines.push('');
  lines.push(COMMON_LAW);
  lines.push('');
  if (rows.length === 0) {
    lines.push('_No unresolved contradictions recorded across the pack. **A clean contradiction ledger is not proof of completeness — it means the configured detector found nothing of tension.** Adversarial review and Cowork synthesis must continue to challenge claims._');
    return lines.join('\n') + '\n';
  }
  lines.push('| Contradiction | Section | Type | Severity | Status | Claims | Artifact |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(`| \`${r.contradiction_id}\` | \`${r.section_id}\` | ${r.type} | ${r.severity} | ${r.status} | ${r.claim_ids.map((c) => `\`${c}\``).join(', ')} | \`${r.artifact_path}\` |`);
  }
  lines.push('');
  return lines.join('\n');
}

export function renderScopeWideningRisksMarkdown(rows: ScopeWideningRiskRow[]): string {
  const lines: string[] = [];
  lines.push('# Scope-widening risks');
  lines.push('');
  lines.push(COMMON_LAW);
  lines.push('');
  if (rows.length === 0) {
    lines.push('_No scope-widening risks detected at audit time. Synthesis must still preserve every claim\'s scope verbatim._');
    return lines.join('\n') + '\n';
  }
  lines.push('| Claim | Section | Reason | Details | Artifact |');
  lines.push('|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(`| \`${r.claim_id}\` | \`${r.section_id}\` | ${r.reason} | ${r.details.replace(/\|/g, '\\|')} | \`${r.artifact_path}\` |`);
  }
  lines.push('');
  return lines.join('\n');
}

export function renderSourceDiversityGapsMarkdown(rows: SourceDiversityGapRow[]): string {
  const lines: string[] = [];
  lines.push('# Source-diversity gaps');
  lines.push('');
  lines.push(COMMON_LAW);
  lines.push('');
  if (rows.length === 0) {
    lines.push('_No source-diversity gaps detected._');
    return lines.join('\n') + '\n';
  }
  for (const r of rows) {
    lines.push(`### \`${r.section_id}\`: ${r.reason}`);
    lines.push('');
    lines.push(`- **Details:** ${r.details}`);
    lines.push(`- **Evidence IDs:** ${r.evidence_ids.length === 0 ? '_(none)_' : r.evidence_ids.map((e) => `\`${e}\``).join(', ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function renderSynthesisReadinessMarkdown(p: PackAuditPayload): string {
  const lines: string[] = [];
  lines.push('# Synthesis readiness');
  lines.push('');
  lines.push(COMMON_LAW);
  lines.push('');
  lines.push(`**Pack verdict:** ${VERDICT_GLYPH[p.verdict]} ${p.verdict}`);
  lines.push(`**Synthesis allowed:** ${p.synthesis_allowed ? 'yes' : 'no'}`);
  lines.push(`**Cowork handoff mode:** ${p.readiness_summary.cowork_handoff_mode}`);
  lines.push(`**Workspace allowed:** ${p.readiness_summary.workspace_allowed ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('## Section detail');
  lines.push('');
  lines.push('| Section | Status | Gate | Eligible | Candidates | Accepted | Repair | Rejected | Blocking reasons |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of p.section_summaries) {
    const blocking = r.blocking_reasons.length === 0 ? '_(none)_' : r.blocking_reasons.map((b) => b.replace(/\|/g, '\\|')).join('<br>');
    lines.push(`| \`${r.section_id}\` | ${r.status} | ${r.gate_verdict ?? '—'} | ${r.synthesis_eligible ? 'yes' : 'no'} | ${r.candidate_claims} | ${r.accepted_claims} | ${r.repair_claims} | ${r.rejected_claims} | ${blocking} |`);
  }
  lines.push('');
  lines.push('## Recommended next actions');
  lines.push('');
  let i = 1;
  for (const a of p.next_actions) {
    lines.push(`${i}. ${a}`);
    i += 1;
  }
  lines.push('');
  return lines.join('\n');
}
