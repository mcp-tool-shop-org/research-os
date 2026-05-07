import type { CrossSectionMap } from './types.js';

export function renderCrossSectionMapMarkdown(map: CrossSectionMap): string {
  const lines: string[] = [];
  lines.push(`# Cross-Section Map: ${map.pack_topic}`);
  lines.push('');
  lines.push(`**Pack ID:** \`${map.pack_id}\``);
  lines.push(`**Pack decision:** ${map.pack_decision || '_(no decision recorded in research.yaml)_'}`);
  lines.push(`**Generated:** ${map.generated_at}`);
  lines.push(`**Accepted claims:** ${map.accepted_claim_ids.length}`);
  lines.push('');
  lines.push(
    '> This map points at canonical artifacts. It does not synthesize. It does not infer across claims. Use it as a routing layer when drafting `decision-brief.md` and `working-report.md`. The pack is the source of authority.',
  );
  lines.push('');

  lines.push('## Accepted claims by section');
  lines.push('');
  for (const s of map.sections) {
    if (s.accepted_claim_ids.length === 0) {
      lines.push(`### \`${s.section_id}\` — excluded`);
      lines.push('');
      lines.push(`- **Purpose:** ${s.purpose}`);
      lines.push(`- **Status:** ${s.status}`);
      lines.push(`- **Excluded reason:** ${s.excluded_reason ?? '_(no reason recorded)_'}`);
      lines.push('');
    } else {
      lines.push(`### \`${s.section_id}\` — ${s.accepted_claim_ids.length} accepted claim(s)`);
      lines.push('');
      lines.push(`- **Purpose:** ${s.purpose}`);
      lines.push(`- **Status:** ${s.status}`);
      lines.push('- **Accepted claims:**');
      for (const cid of s.accepted_claim_ids) {
        lines.push(`  - \`${cid}\``);
      }
      lines.push('');
    }
  }

  lines.push('## Shared source relationships');
  lines.push('');
  if (map.shared_sources.length === 0) {
    lines.push('_No sources are shared across multiple accepted claims or sections._');
  } else {
    for (const s of map.shared_sources) {
      lines.push(`- \`${s.source_id}\` (publisher: ${s.publisher ?? 'unknown'}, type: ${s.source_type})`);
      lines.push(`  - Used by: ${s.used_by_claim_ids.map((c) => `\`${c}\``).join(', ')}`);
      lines.push(`  - Spans sections: ${s.spans_sections.map((s) => `\`${s}\``).join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## Claim clusters (shared sources within an accepted set)');
  lines.push('');
  if (map.claim_clusters.length === 0) {
    lines.push('_No clusters detected._');
  } else {
    for (const c of map.claim_clusters) {
      lines.push(`### Cluster \`${c.cluster_id}\``);
      lines.push('');
      lines.push(`- **Members:** ${c.member_claim_ids.map((m) => `\`${m}\``).join(', ')}`);
      lines.push(`- **Spans sections:** ${c.spans_sections.map((s) => `\`${s}\``).join(', ')}`);
      lines.push(`- **Shared source IDs:** ${c.shared_source_ids.length === 0 ? '(singleton)' : c.shared_source_ids.map((s) => `\`${s}\``).join(', ')}`);
      lines.push('');
    }
  }

  lines.push('## Scope overlap warnings');
  lines.push('');
  if (map.scope_overlaps.length === 0) {
    lines.push('_No scope overlaps above the configured threshold._');
  } else {
    for (const o of map.scope_overlaps) {
      lines.push(`- \`${o.claim_a}\` ↔ \`${o.claim_b}\` (jaccard ${o.jaccard}, ${o.cross_section ? 'cross-section' : 'in-section'})`);
      lines.push(`  - Scope A: ${o.scope_a}`);
      lines.push(`  - Scope B: ${o.scope_b}`);
      lines.push(`  - Warning: ${o.warning}`);
    }
  }
  lines.push('');

  lines.push('## Cross-section contradictions (must be preserved)');
  lines.push('');
  if (map.cross_section_contradictions.length === 0) {
    lines.push('_None recorded._');
  } else {
    for (const c of map.cross_section_contradictions) {
      lines.push(`- \`${c.contradiction_id}\` — type: ${c.type}, severity: ${c.severity}, status: ${c.status}`);
      lines.push(`  - Claims: ${c.claim_ids.map((id) => `\`${id}\``).join(', ')}`);
      lines.push(`  - Sections: ${c.sections.map((s) => `\`${s}\``).join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## Waivers (must be disclosed in any synthesis output)');
  lines.push('');
  if (map.waiver_dependencies.length === 0) {
    lines.push('_None active._');
  } else {
    for (const w of map.waiver_dependencies) {
      lines.push(`- **${w.scope}.${w.family}** applied to \`${w.applied_to}\` — disclose in: ${w.must_disclose_in}`);
      lines.push(`  - Reason: ${w.reason || '_(empty — INVALID)_'}`);
      if (w.compensating_controls.length === 0) {
        lines.push('  - Compensating controls: _(none — INVALID)_');
      } else {
        for (const cc of w.compensating_controls) lines.push(`  - Compensating: ${cc}`);
      }
    }
  }
  lines.push('');

  lines.push('## Sections excluded from synthesis');
  lines.push('');
  const excluded = map.sections.filter((s) => s.excluded_reason !== null);
  if (excluded.length === 0) {
    lines.push('_All sections contributed accepted claims._');
  } else {
    for (const s of excluded) {
      lines.push(`- \`${s.section_id}\`: ${s.excluded_reason}`);
    }
  }
  lines.push('');

  lines.push('## Useful index queries');
  lines.push('');
  lines.push('- `research-os query "<scope-term>"` — pull claims by scope tag');
  lines.push('- `research-os query "<source-id>" --type claim` — claims that cite a specific source');
  lines.push('- `research-os query "blocking" --type gate_result` — re-confirm no blocking gate failures before drafting');
  lines.push('- `research-os query "unresolved" --type contradiction` — re-confirm cross-section contradictions are still tracked');
  lines.push('');

  lines.push('## Forbidden inputs');
  lines.push('');
  if (map.forbidden_inputs.length === 0) {
    lines.push('_All claims in the pack are accepted for synthesis._');
  } else {
    lines.push('Synthesis must not cite any of the following claims:');
    lines.push('');
    for (const f of map.forbidden_inputs) {
      lines.push(`- \`${f.claim_id}\` (\`${f.section_id}\`, decision=${f.decision}): ${f.reason}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

const COMMON_GUARDRAILS = [
  '- **Cite only `claim_id` values listed in `synthesis/cross-section-map.json` under `allowed_synthesis_inputs[]`.**',
  '- **Do not introduce facts not present in the cited claims.**',
  '- **Do not flatten unresolved contradictions; preserve them by name.**',
  '- **Do not widen any claim\'s `scope`; restate it verbatim where the claim is invoked.**',
  '- **Disclose every active waiver from `waiver_dependencies[]`.**',
  '- **Do not cite any claim listed under `forbidden_inputs[]`.**',
];

export function renderDecisionBrief(map: CrossSectionMap): string {
  const lines: string[] = [];
  lines.push('# Decision Brief');
  lines.push('');
  lines.push(`**Pack:** ${map.pack_topic}`);
  lines.push(`**Pack ID:** \`${map.pack_id}\``);
  lines.push(`**Decision question:** ${map.pack_decision || '_(no decision recorded in research.yaml)_'}`);
  lines.push('');
  lines.push('> **Guardrails (enforced at freeze time):**');
  for (const g of COMMON_GUARDRAILS) lines.push(`> ${g}`);
  lines.push('> - **Recommendation must cite at least one accepted claim_id.**');
  lines.push('');
  lines.push('## Recommendation');
  lines.push('');
  lines.push('_(empty — Cowork or operator writes here. Cite accepted_claim_ids inline as `[clm_...]`.)_');
  lines.push('');
  lines.push('## Evidence cited');
  lines.push('');
  lines.push('_(empty — list the accepted_claim_ids you actually cited above.)_');
  lines.push('');
  lines.push('## Unresolved contradictions preserved');
  lines.push('');
  if (map.cross_section_contradictions.length === 0) {
    lines.push('_None._');
  } else {
    for (const c of map.cross_section_contradictions) {
      lines.push(`- \`${c.contradiction_id}\` — ${c.type}, severity ${c.severity}`);
    }
  }
  lines.push('');
  lines.push('## Waivers disclosed');
  lines.push('');
  if (map.waiver_dependencies.length === 0) {
    lines.push('_None active._');
  } else {
    for (const w of map.waiver_dependencies) {
      lines.push(`- **${w.scope}.${w.family}** — ${w.reason}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

export function renderWorkingReport(map: CrossSectionMap): string {
  const lines: string[] = [];
  lines.push('# Working Report');
  lines.push('');
  lines.push(`**Pack:** ${map.pack_topic}`);
  lines.push(`**Pack ID:** \`${map.pack_id}\``);
  lines.push('');
  lines.push('> **Guardrails:**');
  lines.push('> - This is the working synthesis area. Drafts here are not final.');
  for (const g of COMMON_GUARDRAILS) lines.push(`> ${g}`);
  lines.push('> - **Every paragraph must cite at least one accepted_claim_id (inline `[clm_...]`).**');
  lines.push('> - **Unresolved contradictions must remain visible in the prose, not summarized away.**');
  lines.push('');
  lines.push('## Working synthesis');
  lines.push('');
  lines.push('_(empty — Cowork drafts here.)_');
  lines.push('');
  return lines.join('\n');
}

export function renderFinalReport(map: CrossSectionMap): string {
  const lines: string[] = [];
  lines.push('# Final Report');
  lines.push('');
  lines.push(`**Pack:** ${map.pack_topic}`);
  lines.push(`**Pack ID:** \`${map.pack_id}\``);
  lines.push(`**Decision question:** ${map.pack_decision || '_(no decision recorded in research.yaml)_'}`);
  lines.push('');
  lines.push('> **Guardrails (locked area):**');
  lines.push('> - This file cannot be considered complete until the freeze step (Link 12) verifies citation coverage and claim-id existence.');
  lines.push('> - Until then, treat this as a draft. Do not promote it externally.');
  for (const g of COMMON_GUARDRAILS) lines.push(`> ${g}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('_(empty — Cowork or operator writes here.)_');
  lines.push('');
  lines.push('## Body');
  lines.push('');
  lines.push('_(empty — Cowork or operator writes here.)_');
  lines.push('');
  lines.push('## Limitations and unresolved tensions');
  lines.push('');
  if (map.cross_section_contradictions.length === 0) {
    lines.push('_(empty — Cowork must list anything that the evidence base could not resolve.)_');
  } else {
    for (const c of map.cross_section_contradictions) {
      lines.push(`- \`${c.contradiction_id}\` — ${c.type}, severity ${c.severity}, status ${c.status}`);
    }
  }
  lines.push('');
  lines.push('## Waivers disclosed');
  lines.push('');
  if (map.waiver_dependencies.length === 0) {
    lines.push('_None active._');
  } else {
    for (const w of map.waiver_dependencies) {
      lines.push(`- **${w.scope}.${w.family}** applied to \`${w.applied_to}\` — ${w.reason}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}
