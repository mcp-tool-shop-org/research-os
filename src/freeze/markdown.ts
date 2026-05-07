import type { FreezeReceiptPayload, FreezeRefusalPayload } from './types.js';

export function renderFreezeReceiptMarkdown(p: FreezeReceiptPayload): string {
  const lines: string[] = [];
  lines.push(`# Freeze Receipt: ${p.pack_topic}`);
  lines.push('');
  lines.push(`**Verdict:** [FROZEN]`);
  lines.push(`**Pack ID:** \`${p.pack_id}\``);
  lines.push(`**Frozen at:** ${p.frozen_at}`);
  lines.push('');
  lines.push(
    '> Freeze locks completed research truth. Every artifact below carries a sha256 fingerprint. The pack is now immutable evidence; any further mutation invalidates the receipt.',
  );
  lines.push('');

  lines.push('## Counts');
  lines.push('');
  lines.push(`- **Sources:** ${p.source_count}`);
  lines.push(`- **Claims:** ${p.claim_count}`);
  lines.push(`- **Contradictions:** ${p.contradiction_count}`);
  lines.push(`- **Review findings:** ${p.review_finding_count}`);
  lines.push(`- **Gate results:** ${p.gate_result_count}`);
  lines.push('');

  lines.push('## Sections');
  lines.push('');
  lines.push('| Section | Status | Accepted claims | Sources | Contradictions |');
  lines.push('|---|---|---|---|---|');
  for (const s of p.sections) {
    lines.push(`| \`${s.section_id}\` | ${s.status} | ${s.accepted_claims} | ${s.sources} | ${s.contradictions} |`);
  }
  lines.push('');

  lines.push('## Citation coverage');
  lines.push('');
  lines.push(`- **Accepted claims:** ${p.accepted_claim_ids.length}`);
  lines.push(`- **Cited in synthesis:** ${p.cited_claim_ids.length}`);
  lines.push(`- **Uncited accepted (informational):** ${p.uncited_accepted_claim_ids.length}`);
  if (p.uncited_accepted_claim_ids.length > 0) {
    lines.push('');
    lines.push('Uncited accepted claim_ids (preserved for future synthesis):');
    for (const cid of p.uncited_accepted_claim_ids) lines.push(`- \`${cid}\``);
  }
  lines.push('');

  lines.push('## Unresolved contradictions disclosed');
  lines.push('');
  if (p.unresolved_contradictions.length === 0) {
    lines.push('_None._');
  } else {
    for (const c of p.unresolved_contradictions) {
      lines.push(`- \`${c.contradiction_id}\` (\`${c.section_id}\`, ${c.type}, ${c.severity}) — disclosed in ${c.disclosed_in.map((d) => `\`${d}\``).join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## Waivers disclosed');
  lines.push('');
  if (p.waivers_disclosed.length === 0) {
    lines.push('_None active._');
  } else {
    for (const w of p.waivers_disclosed) {
      lines.push(`- **${w.family}.${w.applied_to}** — disclosed in ${w.disclosed_in.map((d) => `\`${d}\``).join(', ')}`);
      lines.push(`  - Reason: ${w.reason}`);
      for (const cc of w.compensating_controls) lines.push(`  - Compensating: ${cc}`);
    }
  }
  lines.push('');

  lines.push('## Integrity checks');
  lines.push('');
  for (const c of p.integrity_checks) {
    const glyph = c.passed ? '[PASS]' : '[FAIL]';
    lines.push(`- ${glyph} **${c.name}** — ${c.detail}`);
  }
  lines.push('');

  lines.push('## Synthesis fingerprints');
  lines.push('');
  lines.push('| Path | Bytes | sha256 |');
  lines.push('|---|---|---|');
  for (const h of p.synthesis_hashes) {
    lines.push(`| \`${h.path}\` | ${h.bytes} | \`${h.sha256.slice(0, 16)}…\` |`);
  }
  lines.push('');

  lines.push('## Canonical artifact fingerprints');
  lines.push('');
  lines.push(`Total: ${p.canonical_artifact_hashes.length} files`);
  lines.push('');
  lines.push('| Path | Bytes | sha256 |');
  lines.push('|---|---|---|');
  for (const h of p.canonical_artifact_hashes) {
    lines.push(`| \`${h.path}\` | ${h.bytes} | \`${h.sha256.slice(0, 16)}…\` |`);
  }
  lines.push('');

  return lines.join('\n');
}

export function renderFreezeRefusalMarkdown(p: FreezeRefusalPayload): string {
  const lines: string[] = [];
  lines.push(`# Freeze Refusal: ${p.pack_topic}`);
  lines.push('');
  lines.push(`**Verdict:** [REFUSED]`);
  lines.push(`**Pack ID:** \`${p.pack_id}\``);
  lines.push(`**Checked at:** ${p.checked_at}`);
  lines.push(`**Would freeze:** no`);
  lines.push('');
  lines.push(
    '> Freeze locks completed research truth. It does not complete unfinished research, excuse missing synthesis, or convert repair state into evidence. The conditions below were not met; the pack remains active.',
  );
  lines.push('');

  if (p.blocking_reasons.length > 0) {
    lines.push('## Blocking reasons');
    lines.push('');
    for (const r of p.blocking_reasons) lines.push(`- ${r}`);
    lines.push('');
  }

  if (p.reasons.length > 0) {
    lines.push('## All reasons');
    lines.push('');
    for (const r of p.reasons) lines.push(`- ${r}`);
    lines.push('');
  }

  if (p.missing_artifacts.length > 0) {
    lines.push('## Missing artifacts');
    lines.push('');
    for (const a of p.missing_artifacts) lines.push(`- \`${a}\``);
    lines.push('');
  }

  if (p.invalid_artifacts.length > 0) {
    lines.push('## Invalid artifacts');
    lines.push('');
    for (const ia of p.invalid_artifacts) lines.push(`- \`${ia.path}\` — ${ia.error}`);
    lines.push('');
  }

  if (p.next_actions.length > 0) {
    lines.push('## Next actions');
    lines.push('');
    let i = 1;
    for (const a of p.next_actions) {
      lines.push(`${i}. ${a}`);
      i += 1;
    }
    lines.push('');
  }

  return lines.join('\n');
}
