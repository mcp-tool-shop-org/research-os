import type { PackManifest } from './schema.js';

// Port of research-packs/scripts/summarize-pack.mjs generateReadme() to TypeScript.
// Must produce identical output — verified by the dogfood test.

function extractSummary(markdown: string): string {
  const lines = markdown.split('\n');
  let inSummary = false;
  const summaryLines: string[] = [];
  for (const line of lines) {
    if (/^## Summary\s*$/.test(line)) { inSummary = true; continue; }
    if (inSummary && /^## /.test(line)) break;
    if (inSummary) summaryLines.push(line);
  }
  return summaryLines.join('\n').trim();
}

export function generateReadme(manifest: PackManifest, finalReport: string): string {
  const m = manifest;
  const frozenDate = m.frozen_at.slice(0, 10);
  const summary = extractSummary(finalReport);

  const sectionTable = m.sections
    .map((s) => `| ${s.id} | ${s.accepted_claims} | ${s.gate} | ${s.synthesis_eligible ? 'yes' : 'no'} |`)
    .join('\n');

  const totalsLine =
    m.totals.preserved_contradiction_records != null
      ? `Preserved contradiction records: ${m.totals.preserved_contradiction_records}`
      : `${m.totals.unresolved_contradictions} unresolved contradictions`;

  const operatorSection = m.operator_notes
    ? `\n---\n\n## Operator notes\n\n${m.operator_notes}\n`
    : '';

  return `# ${m.name}

**Topic:** ${m.topic}

**Frozen:** ${frozenDate} | **research-os version:** ${m.research_os_version} | **Accepted claims:** ${m.totals.accepted_claims} across ${m.totals.sections} sections

---

## Executive summary

${summary}

---

## Sections

| Section | Accepted claims | Gate | Synthesis eligible |
|---------|-----------------|------|-------------------|
${sectionTable}

**Totals:** ${m.totals.accepted_claims} accepted, ${m.totals.dispositioned} dispositioned, ${totalsLine}

---

## How to read this pack

This package is part of the [\`research-packs\`](../../README.md) archive.

- **Lane 1 (synthesis):** You are here. See [\`synthesis/final-report.md\`](synthesis/final-report.md) for the full citation-clean prose.
- **Lane 2 (evidence):** [\`pack/\`](pack/) — full frozen ledgers, source cards, excerpts, claim reviews, gate results, and \`audits/freeze-receipt.json\`.
- **Lane 3 (method):** [\`../../docs/\`](../../docs/) — artifact contract, how-to-read, source quality notes.

To verify this pack's integrity: \`node ../../scripts/verify-pack.mjs .\` from this directory.

See [\`docs/how-to-read-this.md\`](docs/how-to-read-this.md) for pack-specific reading notes.${operatorSection}`;
}
