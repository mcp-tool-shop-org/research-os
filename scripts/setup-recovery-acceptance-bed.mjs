// v0.9 Slice 3 — Recovery advisor acceptance bed.
//
// Builds a 5-section synthetic pack covering distinct failure shapes the
// recovery advisor must differentiate:
//
//   01-floor    accepted_claim_floor   (unwaiveable)
//   02-pubs     min_independent_publishers   (waiveable with alternatives)
//   03-noans    prose_error_no_answer_cluster   (gate passed, synthesis failed)
//   04-unrun    unrun
//   05-healthy  on-track, advisor must skip
//
// Run:  node scripts/setup-recovery-acceptance-bed.mjs
// Then: node dist/cli.js cowork handoff --pack <packPath>
// Then: node dist/cli.js recover pack --pack <packPath>

import { writeFile, mkdir, appendFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { init, add as sectionAdd } from '../dist/index.js';

const OUT_BED = 'E:/AI/research-os-recovery-acceptance/multi-failure-shape-pack';

function fullGate(args) {
  return {
    section_id: args.section_id,
    verdict: args.verdict,
    summary: args.summary ?? `fixture gate for ${args.section_id}`,
    checked_at: '2026-05-13T00:00:02.000Z',
    synthesis_eligible: args.synthesis_eligible,
    gate_results: [],
    failures: (args.failures ?? []).map((f) => ({
      family: f.family,
      check: f.check,
      status: 'fail',
      detail: f.detail ?? 'fixture',
      evidence: [],
      blocks_synthesis: true,
    })),
    warnings: [],
    waivers_applied: [],
    blocking_reasons: args.blocking_reasons ?? (args.synthesis_eligible ? [] : ['fixture-blocking']),
    claim_counts: {
      total: args.claim_counts?.total ?? 0,
      candidate: 0,
      with_evidence_excerpt: args.claim_counts?.with_evidence_excerpt ?? 0,
      with_source_hashes: args.claim_counts?.with_source_hashes ?? 0,
      with_scope: args.claim_counts?.with_scope ?? 0,
      with_not: args.claim_counts?.with_not ?? 0,
      universal_scope_null: 0,
      orphans: 0,
    },
    source_counts: {
      total: args.source_counts?.total ?? 0,
      primary: 0,
      secondary: 0,
      forum: 0,
      benchmark: 0,
      docs: args.source_counts?.docs ?? 0,
      unknown: 0,
      independent_publishers: args.source_counts?.independent_publishers ?? 0,
      failed_fetches: 0,
      section_primary: 0,
      section_independent_publishers: args.source_counts?.independent_publishers ?? 0,
    },
    contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
    freshness_summary: {
      policy_required: false,
      max_source_age_months: null,
      stale_source_policy: 'warn',
      stale_count: 0,
      unknown_date_count: args.source_counts?.total ?? 0,
    },
    scope_integrity_summary: {
      universal_claims: 0,
      scoped_claims: args.claim_counts?.total ?? 0,
      with_not_constraint: args.claim_counts?.total ?? 0,
      overgen_risks_total: 0,
      overgen_risks_blocking: 0,
    },
    next_actions: [],
  };
}

async function writeClaim(packPath, sectionId, srcId, i, asserts) {
  const cid = `clm_${srcId.slice(4)}_heuristic_${i}`;
  await appendFile(
    join(packPath, 'sections', sectionId, 'claims.jsonl'),
    JSON.stringify({
      claim_id: cid,
      section_id: sectionId,
      source_ids: [srcId],
      source_hashes: ['a'.repeat(64)],
      asserts,
      scope: 's',
      not: 'n',
      evidence_excerpt: asserts.slice(0, 80),
      evidence_location: null,
      confidence: 'medium',
      extractor: 'heuristic',
      extraction_method: 'heuristic_key_point',
      created_at: '2026-05-13T00:00:00.000Z',
      review_state: 'candidate',
    }) + '\n',
    'utf8',
  );
  return cid;
}

async function writeReview(packPath, sectionId, claimId, decision) {
  await appendFile(
    join(packPath, 'sections', sectionId, 'claim-reviews.jsonl'),
    JSON.stringify({
      claim_id: claimId,
      decision,
      reason: 'fixture',
      finding_ids: [],
      reviewer: 'heuristic',
      review_method: 'heuristic_field_and_grounding_checks',
      created_at: '2026-05-13T00:00:01.000Z',
    }) + '\n',
    'utf8',
  );
}

async function writeSourceCard(packPath, sectionId, srcId, publisher) {
  const dir = join(packPath, 'evidence', 'source-cards');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${srcId}.json`),
    JSON.stringify({
      source_id: srcId,
      receipt_id: `rcpt_${srcId.slice(4)}_1`,
      section_id: sectionId,
      url: `https://example.com/${srcId}`,
      final_url: `https://example.com/${srcId}`,
      fetched_at: '2026-05-13T00:00:00.000Z',
      publisher,
      published_at: null,
      title: `Title for ${srcId}`,
      source_type: 'docs',
      relevance: 'high',
      key_points: ['fixture'],
      limitations: [],
      asserts: 'fixture',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-13T00:00:00.000Z',
    }),
    'utf8',
  );
  await appendFile(
    join(packPath, 'sections', sectionId, 'sources.jsonl'),
    JSON.stringify({ source_id: srcId, added_at: '2026-05-13T00:00:00.000Z' }) + '\n',
    'utf8',
  );
  await appendFile(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    JSON.stringify({
      receipt_id: `rcpt_${srcId.slice(4)}_1`,
      source_id: srcId,
      section_id: sectionId,
      requested_url: `https://example.com/${srcId}`,
      final_url: `https://example.com/${srcId}`,
      status: 200,
      status_text: 'OK',
      content_type: 'text/html',
      fetched_at: '2026-05-13T00:00:00.000Z',
      byte_count: 100,
      sha256: createHash('sha256').update(srcId).digest('hex'),
      title: `Title for ${srcId}`,
      raw_text_path: `evidence/raw/${srcId}.html`,
      fetch_outcome: 'ok',
      fetch_error: null,
      extraction_outcome: 'ok',
      extraction_extractor: 'heuristic',
      extraction_error: null,
    }) + '\n',
    'utf8',
  );
}

async function writeSynthesis(packPath, sectionId, content) {
  const dir = join(packPath, 'sections', sectionId, 'synthesis');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'section-synthesis.json'), JSON.stringify(content, null, 2), 'utf8');
}

// ── Main ───────────────────────────────────────────────────────────────────

const r = await init({
  topic: 'Multi-failure-shape recovery advisor acceptance bed',
  outDir: 'E:/AI/research-os-recovery-acceptance',
});
let packPath = r.packPath;
if (packPath !== OUT_BED) {
  await rm(OUT_BED, { recursive: true, force: true });
  await rename(packPath, OUT_BED);
  packPath = OUT_BED;
}
console.log('pack created at:', packPath);

for (const id of ['01-floor', '02-pubs', '03-noans', '04-unrun', '05-healthy']) {
  await sectionAdd({ id, purpose: `Purpose of ${id}: see scenario doc.`, packPath });
}

// ── 01-floor: accepted_claim_floor (zero accepted) ────────────────────────
await mkdir(join(packPath, 'audits'), { recursive: true });
await writeFile(
  join(packPath, 'audits', '01-floor-gate.json'),
  JSON.stringify(
    fullGate({
      section_id: '01-floor',
      verdict: 'blocked',
      synthesis_eligible: false,
      failures: [{ family: 'accepted_claim_floor', check: 'min_accepted_claims', detail: '0 accepted; min 3' }],
      blocking_reasons: ['accepted_claim_floor.min_accepted_claims: 0/3'],
    }),
    null,
    2,
  ),
  'utf8',
);

// ── 02-pubs: min_independent_publishers (3 claims, 1 publisher) ───────────
for (let i = 1; i <= 3; i++) {
  const cid = await writeClaim(packPath, '02-pubs', 'src_bbbbbbbbbbbb', i, `Pub-only claim ${i} about topic X.`);
  await writeReview(packPath, '02-pubs', cid, 'accepted_for_synthesis');
}
await writeSourceCard(packPath, '02-pubs', 'src_bbbbbbbbbbbb', 'OnlyPub');
await writeFile(
  join(packPath, 'audits', '02-pubs-gate.json'),
  JSON.stringify(
    fullGate({
      section_id: '02-pubs',
      verdict: 'blocked',
      synthesis_eligible: false,
      failures: [{ family: 'source_floor', check: 'independent_publishers', detail: '1/4 publishers' }],
      claim_counts: { total: 3, with_evidence_excerpt: 3, with_source_hashes: 3, with_scope: 3, with_not: 3 },
      source_counts: { total: 1, docs: 1, independent_publishers: 1 },
    }),
    null,
    2,
  ),
  'utf8',
);

// ── 03-noans: gate passes, but synthesis returns no_answer_cluster ────────
for (let i = 1; i <= 3; i++) {
  const cid = await writeClaim(
    packPath,
    '03-noans',
    'src_cccccccccccc',
    i,
    `Tangentially-related claim ${i} that does not answer the section purpose.`,
  );
  await writeReview(packPath, '03-noans', cid, 'accepted_for_synthesis');
}
await writeSourceCard(packPath, '03-noans', 'src_cccccccccccc', 'PubC');
await writeFile(
  join(packPath, 'audits', '03-noans-gate.json'),
  JSON.stringify(
    fullGate({
      section_id: '03-noans',
      verdict: 'pass',
      synthesis_eligible: true,
      claim_counts: { total: 3, with_evidence_excerpt: 3, with_source_hashes: 3, with_scope: 3, with_not: 3 },
      source_counts: { total: 1, docs: 1, independent_publishers: 1 },
    }),
    null,
    2,
  ),
  'utf8',
);
await writeSynthesis(packPath, '03-noans', {
  status: 'partial_synthesis',
  proseError: {
    code: 'no_answer_cluster',
    message: 'No accepted claim was assigned the answer role for the section purpose.',
    accepted_claim_count: 3,
    unused_count: 3,
    section_purpose: 'Purpose of 03-noans',
    unused_claims: [],
  },
});

// ── 04-unrun: section in research.yaml, no claims, no gate audit ──────────

// ── 05-healthy: 3 accepted, 1 publisher (but we'll mark gate pass for 05) ─
//
// For this fixture we simulate a section that satisfies the diagnose layer's
// healthy criteria. We set synthesis_eligible=true on the gate, faithful
// prose paragraphs, and let the cowork handoff classify accordingly.
for (let i = 1; i <= 3; i++) {
  const cid = await writeClaim(packPath, '05-healthy', 'src_dddddddddddd', i, `Healthy claim ${i} answers part of the section purpose.`);
  await writeReview(packPath, '05-healthy', cid, 'accepted_for_synthesis');
}
await writeSourceCard(packPath, '05-healthy', 'src_dddddddddddd', 'PubD');
await writeFile(
  join(packPath, 'audits', '05-healthy-gate.json'),
  JSON.stringify(
    fullGate({
      section_id: '05-healthy',
      verdict: 'pass',
      synthesis_eligible: true,
      claim_counts: { total: 3, with_evidence_excerpt: 3, with_source_hashes: 3, with_scope: 3, with_not: 3 },
      source_counts: { total: 1, docs: 1, independent_publishers: 1 },
    }),
    null,
    2,
  ),
  'utf8',
);
await writeSynthesis(packPath, '05-healthy', {
  status: 'partial_synthesis',
  prose: {
    paragraphs: [
      {
        paragraph_id: 'p1',
        role: 'answer',
        text: 'Healthy section answer paragraph.',
        verifier_decision: 'faithful',
        support_bundle: {
          claim_ids: ['clm_dddddddddddd_heuristic_1'],
          source_card_ids: ['src_dddddddddddd'],
          waiver_ids: [],
          thin_evidence: false,
        },
      },
    ],
  },
});

console.log('\nbed ready at:', packPath);
console.log('\nNext steps:');
console.log(`  node dist/cli.js cowork handoff --pack "${packPath}"`);
console.log(`  node dist/cli.js recover pack --pack "${packPath}"`);
