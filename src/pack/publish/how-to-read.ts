import type { PackManifest } from './schema.js';

export function generateHowToReadScaffold(manifest: PackManifest): string {
  const frozenDate = manifest.frozen_at.slice(0, 10);
  const contradictionNote =
    manifest.totals.preserved_contradiction_records != null
      ? `This pack has ${manifest.totals.preserved_contradiction_records} preserved contradiction records. ` +
        `These are not active blockers — freeze validated zero unresolved contradictions across all sections. ` +
        `The records are preserved for provenance in \`pack/sections/<id>/contradiction-resolutions.jsonl\`.`
      : 'This pack has no preserved contradiction records.';

  return `# How to read: ${manifest.name}

<!-- SCAFFOLD: Pre-filled with pack-specific metadata by \`research-os pack publish\`.
     Final prose is human-authored. Edit freely — this file is NOT covered by the freeze receipt. -->

**Pack:** \`${manifest.name}\`
**Topic:** ${manifest.topic}
**Frozen:** ${frozenDate}
**Accepted claims:** ${manifest.totals.accepted_claims} accepted claims across ${manifest.totals.sections} section${manifest.totals.sections !== 1 ? 's' : ''}

---

## What this pack answers

<!-- human-authored: describe what the synthesis delivers -->

## How the evidence is structured

<!-- human-authored: explain section breakdown, what each section investigated -->

## Interpreting claim IDs

Claims are referenced as \`[claim:clm_<hex>]\` in the synthesis prose. To look up a claim:

1. Open \`pack/sections/<section-id>/claims.jsonl\`
2. Find the entry with matching \`claim_id\`
3. The \`asserts\` field is the claim; \`evidence_excerpt\` is the literal source span

Accepted vs rejected: \`pack/sections/<section-id>/claim-reviews.jsonl\` — latest entry per \`claim_id\` wins.

## Preserved contradiction records

${contradictionNote}

## Verifying integrity

From this directory:

\`\`\`bash
node ../../scripts/verify-pack.mjs .
\`\`\`

Expected output: PASS with artifact count and receipt sha256.

See [\`../../docs/how-to-read-a-pack.md\`](../../docs/how-to-read-a-pack.md) for the general guide.
`;
}
