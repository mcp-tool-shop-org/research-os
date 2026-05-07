#!/usr/bin/env node
// Reviewer calibration harness.
//
// Builds a small synthetic pack with seeded "good" and "bad" claims, runs the
// paged LLM reviewer over them, and reports per-category recall (did the
// reviewer catch the seeded failures?) plus false-positive rate (did it
// reject the seeded good claims?).
//
// Usage:
//   OLLAMA_HOST=http://127.0.0.1:11435 \
//   OLLAMA_INTERN_MODEL=hermes3:8b \
//   node scripts/reviewer-calibration.mjs [pack-out-dir]
//
// The fixture pack is rebuilt on every run — it is purely a calibration
// surface, not research truth.

import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  init,
  add as sectionAdd,
  triage,
  review as runReview,
  OllamaInternReviewer,
} from '../dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(__dirname, '..', 'tmp', 'reviewer-calibration');
// args: [outDir?] [mode?]  mode in {single, two-pass}; default single
const args = process.argv.slice(2);
const outDir = args[0] && !args[0].startsWith('--') ? args[0] : DEFAULT_OUT;
const mode = args.includes('--two-pass') ? 'two-pass' : 'single';

// Seeded claim authoring set. expected_categories[] is the ground truth.
// "good" claims have expected_categories = [].
const SEEDS = [
  // 5 good — well-scoped, narrow, single-source-bounded
  {
    label: 'good_1',
    asserts: 'Knowledge graphs use a graph-structured data model to represent entities and relationships.',
    scope: 'Wikipedia article on knowledge graphs published 2024.',
    not: 'Universal claim about all data systems; only the Wikipedia source is described.',
    expected_categories: [],
  },
  {
    label: 'good_2',
    asserts: 'In role-os rollouts, a code fix discovered post-publish ships in a patch before the next repo.',
    scope: 'role-os v0.1 rollout lockdown procedure documented in the project memory.',
    not: 'A universal publish policy across all repositories.',
    expected_categories: [],
  },
  {
    label: 'good_3',
    asserts: 'The PostgreSQL FTS5 module supports tokenizers including unicode61 and porter.',
    scope: 'SQLite FTS5 documentation, current as of 2024.',
    not: 'A claim about MySQL or Oracle full-text search.',
    expected_categories: [],
  },
  {
    label: 'good_4',
    asserts: 'A research-pack records a primary-source waiver as a first-class field with reason and compensating_controls.',
    scope: 'research-os v0.1 ResearchYamlSchema as defined in src/intake/schema.ts.',
    not: 'Implicit waivers or operator-side overrides.',
    expected_categories: [],
  },
  {
    label: 'good_5',
    asserts: 'ollama defaults num_ctx to 4096 tokens regardless of the underlying model context window.',
    scope: 'Observed against ollama 0.23.1 with hermes3:8b on a Windows 11 machine.',
    not: 'A claim about ollama on every platform or every model.',
    expected_categories: [],
  },

  // 3 scope_widening — narrow evidence, universal asserts
  {
    label: 'scope_widening_1',
    asserts: 'All knowledge graphs are used by all major search engines.',
    scope: 'Wikipedia article noting Google, Bing, and a few others use a knowledge graph.',
    not: null,
    expected_categories: ['scope_widening', 'overgeneralized_claim'],
  },
  {
    label: 'scope_widening_2',
    asserts: 'Every research-pack must always require a primary-source waiver in production.',
    scope: 'A single design-intent topic where the waiver was granted.',
    not: null,
    expected_categories: ['scope_widening', 'overgeneralized_claim'],
  },
  {
    label: 'scope_widening_3',
    asserts: 'Every LLM extractor benefits from paged windows on every input size.',
    scope: 'mistral-nemo timing out on 2149-line ledgers.',
    not: null,
    expected_categories: ['scope_widening', 'overgeneralized_claim'],
  },

  // 3 unsupported_claim — assertion does not follow from the cited evidence
  {
    label: 'unsupported_1',
    asserts: 'Knowledge graphs reduce SQL query latency by 60%.',
    scope: 'Wikipedia article on knowledge graphs.',
    not: null,
    expected_categories: ['unsupported_claim', 'recommendation_exceeds_evidence'],
  },
  {
    label: 'unsupported_2',
    asserts: 'research-os requires a paid license for production use.',
    scope: 'research-os v0.1 README which states MIT license.',
    not: null,
    expected_categories: ['unsupported_claim'],
  },
  {
    label: 'unsupported_3',
    asserts: 'hermes3:8b outperforms GPT-4 on adversarial reviewer tasks.',
    scope: 'Single dogfood run on a Windows 11 machine with no comparison test.',
    not: null,
    expected_categories: ['unsupported_claim', 'recommendation_exceeds_evidence'],
  },

  // 2 definition_drift — different meanings of the same term across claims
  {
    label: 'definition_drift_1',
    asserts: 'A research-pack is a single markdown file describing the topic.',
    scope: 'Confused operator note.',
    not: null,
    expected_categories: ['definition_drift', 'unsupported_claim'],
  },
  {
    label: 'definition_drift_2',
    asserts: 'A research-pack is the same as a Cowork handoff package.',
    scope: 'Conflated terminology in a discussion thread.',
    not: null,
    expected_categories: ['definition_drift'],
  },

  // 2 temporal_mismatch — current claim from an old source
  {
    label: 'temporal_mismatch_1',
    asserts: 'In 2026, ollama is the dominant local-LLM runtime on macOS.',
    scope: 'A 2022 forum post praising ollama.',
    not: null,
    expected_categories: ['temporal_mismatch'],
  },
  {
    label: 'temporal_mismatch_2',
    asserts: 'Current GPU memory pressure on the 5080 forces 4-bit quantization for hermes3.',
    scope: 'A 2018 tutorial on GPU quantization unrelated to the 5080 or hermes.',
    not: null,
    expected_categories: ['temporal_mismatch'],
  },

  // 3 valid_but_low_value — grounded but trivial / definitional / restating
  {
    label: 'low_value_1',
    asserts: 'A claim is an atomic propositional statement.',
    scope: 'research-os definition of claim.',
    not: 'Compound or nested propositions.',
    expected_categories: ['valid_but_low_value'],
  },
  {
    label: 'low_value_2',
    asserts: 'A source is a fetched URL with a recorded receipt.',
    scope: 'research-os definition of source.',
    not: 'Unfetched references.',
    expected_categories: ['valid_but_low_value'],
  },
  {
    label: 'low_value_3',
    asserts: 'A pack contains sections, and sections contain claims.',
    scope: 'research-os pack structure.',
    not: 'Standalone claims without sections.',
    expected_categories: ['valid_but_low_value'],
  },
];

const SOURCE_ID = 'src_aaaaaaaaaaaa';
const SOURCE_HASH = 'a'.repeat(64);

async function buildFixturePack() {
  if (existsSync(outDir)) await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const result = await init({
    topic: 'Reviewer calibration fixture for paged LLM review',
    outDir,
    name: 'fixture',
  });
  const packPath = result.packPath;
  await sectionAdd({
    id: '01-calibration',
    purpose: 'Reviewer calibration with seeded good and bad claims.',
    packPath,
  });

  // One synthetic source. Raw text must contain (a) the deterministic
  // excerpt-ledger lines we will use as evidence, and (b) enough surrounding
  // material that the reviewer cannot trivially detect issues from raw text
  // alone — only from the asserts/scope/not triple.
  const sentences = [
    'Knowledge graphs use a graph-structured data model to represent entities and relationships, often as nodes and edges.',
    'Wikipedia articles describe how Google and Bing apply knowledge graphs to power some semantic search features.',
    'In role-os rollouts, code fixes discovered after publish ship in a patch release before the next repository continues development.',
    'The PostgreSQL FTS5 module supports tokenizers including unicode61 and porter; ranking uses bm25 by default.',
    'A research-pack records a primary-source waiver as a first-class field, with both reason and compensating_controls captured.',
    'Ollama version 0.23.1 was observed to default num_ctx to 4096 tokens for the hermes3:8b model on a Windows 11 machine.',
    'A claim, in research-os terminology, is an atomic propositional statement extracted from a source under the span-first contract.',
    'A source, in research-os terminology, is a fetched URL with a recorded fetch receipt and an attached source card.',
    'A pack contains sections, and sections contain claims; this structural relationship is fixed in the v0.1 schema.',
    'In 2018 GPU quantization tutorials focused on Pascal and Volta architectures, well before consumer 50-series cards were available.',
    'A 2022 forum post praised ollama for ease of installation, but did not compare it to llama.cpp, lmstudio, or other runtimes.',
  ];
  const rawText = sentences.join(' ');

  await mkdir(join(packPath, 'evidence', 'source-cards'), { recursive: true });
  await mkdir(join(packPath, 'evidence', 'raw'), { recursive: true });
  await mkdir(join(packPath, 'evidence', 'excerpts'), { recursive: true });

  const card = {
    source_id: SOURCE_ID,
    receipt_id: `rcpt_${SOURCE_ID.replace(/^src_/, '')}_1`,
    section_id: '01-calibration',
    url: 'https://example.com/calibration',
    final_url: 'https://example.com/calibration',
    fetched_at: '2026-05-06T22:00:00.000Z',
    publisher: 'CalibrationFixture',
    published_at: null,
    title: 'Calibration source',
    source_type: 'secondary',
    relevance: 'unknown',
    key_points: [],
    limitations: [],
    asserts: 'Mixed-content fixture for reviewer calibration.',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-06T22:00:00.000Z',
  };
  await writeFile(
    join(packPath, 'evidence', 'source-cards', `${SOURCE_ID}.json`),
    JSON.stringify(card),
    'utf8',
  );
  await writeFile(join(packPath, 'evidence', 'raw', `${SOURCE_ID}.html`), rawText, 'utf8');

  const receipt = {
    receipt_id: `rcpt_${SOURCE_ID.replace(/^src_/, '')}_1`,
    source_id: SOURCE_ID,
    section_id: '01-calibration',
    requested_url: 'https://example.com/calibration',
    final_url: 'https://example.com/calibration',
    status: 200,
    status_text: 'OK',
    content_type: 'text/html',
    fetched_at: '2026-05-06T22:00:00.000Z',
    byte_count: rawText.length,
    sha256: SOURCE_HASH,
    title: 'Calibration source',
    raw_text_path: `evidence/raw/${SOURCE_ID}.html`,
    fetch_outcome: 'ok',
    fetch_error: null,
    extraction_outcome: 'ok',
    extraction_extractor: 'heuristic',
    extraction_error: null,
  };
  await writeFile(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    JSON.stringify(receipt) + '\n',
    'utf8',
  );

  // One excerpt per sentence, deterministic IDs.
  let cursor = 0;
  const excerpts = sentences.map((text, i) => {
    const id = `ex_${SOURCE_ID.replace(/^src_/, '')}_${String(i + 1).padStart(3, '0')}`;
    const e = {
      excerpt_id: id,
      source_id: SOURCE_ID,
      source_hash: SOURCE_HASH,
      text,
      location_hint: `paragraph ${i + 1}`,
      char_start: cursor,
      char_end: cursor + text.length,
      origin: 'raw_text',
      created_at: '2026-05-06T22:00:00.000Z',
    };
    cursor += text.length + 1;
    return e;
  });
  await writeFile(
    join(packPath, 'evidence', 'excerpts', `${SOURCE_ID}.jsonl`),
    excerpts.map((e) => JSON.stringify(e)).join('\n') + '\n',
    'utf8',
  );

  // Each seeded claim cites excerpt 1 (always present in raw text). The
  // reviewer's job is to attack the asserts/scope/not triple itself, not
  // the grounding (which is structurally OK by construction).
  const sectionClaimsPath = join(packPath, 'sections', '01-calibration', 'claims.jsonl');
  const sectionSourcesPath = join(packPath, 'sections', '01-calibration', 'sources.jsonl');
  await writeFile(
    sectionSourcesPath,
    JSON.stringify({ source_id: SOURCE_ID, added_at: '2026-05-06T22:00:01.000Z' }) + '\n',
    'utf8',
  );
  const claimLines = SEEDS.map((seed, i) => {
    const claim_id = `clm_${SOURCE_ID.replace(/^src_/, '')}_ollama_intern_${i + 1}`;
    return JSON.stringify({
      claim_id,
      section_id: '01-calibration',
      source_ids: [SOURCE_ID],
      source_hashes: [SOURCE_HASH],
      asserts: seed.asserts,
      scope: seed.scope,
      not: seed.not,
      evidence_excerpt_ids: ['ex_' + SOURCE_ID.replace(/^src_/, '') + '_001'],
      evidence_excerpt: excerpts[0].text,
      evidence_location: 'paragraph 1',
      confidence: 'medium',
      extractor: 'ollama-intern',
      extraction_method: 'ollama_intern_propositional',
      created_at: '2026-05-06T22:00:00.000Z',
      review_state: 'candidate',
    });
  });
  await writeFile(sectionClaimsPath, claimLines.join('\n') + '\n', 'utf8');

  // Run triage so --triaged-only is meaningful, then review.
  await triage({ sectionId: '01-calibration', packPath, perSourceCap: 30 });
  return packPath;
}

async function runCalibration(packPath, mode) {
  const general = new OllamaInternReviewer({ claimsPerWindow: 10, mode: 'general' });
  const narrow = new OllamaInternReviewer({ claimsPerWindow: 10, mode: 'narrow_critic' });
  if (!(await general.available())) {
    console.error('LLM reviewer unavailable. Aborting.');
    process.exit(2);
  }
  if (mode === 'two-pass') {
    const summary = await runReview({
      sectionId: '01-calibration',
      packPath,
      reviewers: [general, narrow],
      triagedOnly: true,
      multiPass: true,
    });
    return summary;
  }
  const summary = await runReview({
    sectionId: '01-calibration',
    packPath,
    reviewers: [general],
    triagedOnly: true,
  });
  return summary;
}

async function reportRecall(packPath, summary) {
  const findingsPath = join(packPath, 'audits', '01-calibration-findings.jsonl');
  const fs = await import('node:fs/promises');
  const text = existsSync(findingsPath) ? await fs.readFile(findingsPath, 'utf8') : '';
  const findings = text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  const findingsByClaim = new Map();
  for (const f of findings) {
    for (const cid of f.claim_ids) {
      const arr = findingsByClaim.get(cid) ?? [];
      arr.push(f);
      findingsByClaim.set(cid, arr);
    }
  }

  console.log('\n=== reviewer calibration ===');
  console.log(`Reviewer:           ${summary.reviewer}`);
  console.log(`Method:             ${summary.reviewMethod}`);
  console.log(`Candidate claims:   ${summary.candidateClaims}`);
  console.log(`Findings produced:  ${findings.length}`);
  console.log('');

  const buckets = {};
  for (const seed of SEEDS) {
    const expected = seed.expected_categories;
    const isGood = expected.length === 0;
    const claim_id = `clm_${SOURCE_ID.replace(/^src_/, '')}_ollama_intern_${SEEDS.indexOf(seed) + 1}`;
    const fnds = findingsByClaim.get(claim_id) ?? [];
    const bucket = isGood ? 'good' : expected[0];
    if (!buckets[bucket]) buckets[bucket] = { total: 0, caught: 0, falseFlag: 0 };
    buckets[bucket].total += 1;
    const flagged = fnds.some((f) => f.severity === 'block' || f.severity === 'warn');
    if (isGood) {
      if (flagged) buckets[bucket].falseFlag += 1;
    } else {
      const expectedSet = new Set(expected);
      const matched = fnds.some((f) => expectedSet.has(f.category));
      if (matched) buckets[bucket].caught += 1;
    }
    const summary_str = isGood
      ? flagged
        ? 'GOOD claim wrongly flagged'
        : 'GOOD claim cleanly accepted'
      : fnds.length === 0
        ? 'BAD claim MISSED'
        : `BAD claim flagged via [${fnds.map((f) => f.category).join(', ')}]`;
    console.log(`  ${seed.label.padEnd(22)} expect=${(expected.join('|') || '(none)').padEnd(40)} → ${summary_str}`);
  }

  // Compute any-flag recall: how many bad claims received ANY finding,
  // regardless of whether the LLM picked the expected category. Hermes-class
  // models often know something is wrong but mislabel — strict-category
  // recall undercounts; any-flag recall is the upper bound on "the reviewer
  // saw a problem".
  let anyFlagBadCaught = 0;
  let badTotal = 0;
  for (const seed of SEEDS) {
    const claim_id = `clm_${SOURCE_ID.replace(/^src_/, '')}_ollama_intern_${SEEDS.indexOf(seed) + 1}`;
    if (seed.expected_categories.length === 0) continue;
    badTotal += 1;
    const fnds = findingsByClaim.get(claim_id) ?? [];
    if (fnds.length > 0) anyFlagBadCaught += 1;
  }
  const goodFalseFlag = (buckets.good ?? { falseFlag: 0 }).falseFlag;
  const goodTotal = (buckets.good ?? { total: 0 }).total;

  console.log('\n=== bucket summary (strict category match) ===');
  console.log('| Category               | Total | Caught | FalseFlag | Recall |');
  console.log('|------------------------|-------|--------|-----------|--------|');
  for (const [cat, b] of Object.entries(buckets)) {
    const recall =
      cat === 'good'
        ? `${b.total - b.falseFlag}/${b.total} (${(((b.total - b.falseFlag) / b.total) * 100).toFixed(0)}% clean)`
        : `${b.caught}/${b.total} (${((b.caught / b.total) * 100).toFixed(0)}%)`;
    console.log(
      `| ${cat.padEnd(22)} | ${String(b.total).padEnd(5)} | ${String(b.caught).padEnd(6)} | ${String(b.falseFlag).padEnd(9)} | ${recall} |`,
    );
  }
  console.log('\n=== headline calibration ===');
  console.log(`good-claim false-flag rate:    ${goodFalseFlag}/${goodTotal} (${goodTotal > 0 ? ((goodFalseFlag / goodTotal) * 100).toFixed(0) : 0}%)`);
  console.log(`bad-claim any-flag recall:     ${anyFlagBadCaught}/${badTotal} (${badTotal > 0 ? ((anyFlagBadCaught / badTotal) * 100).toFixed(0) : 0}%)`);
  let strictBadCaught = 0;
  for (const [cat, b] of Object.entries(buckets)) if (cat !== 'good') strictBadCaught += b.caught;
  console.log(`bad-claim strict-cat recall:   ${strictBadCaught}/${badTotal} (${badTotal > 0 ? ((strictBadCaught / badTotal) * 100).toFixed(0) : 0}%)`);
}

(async () => {
  console.log(`Building fixture at: ${outDir}`);
  console.log(`Mode: ${mode}`);
  const packPath = await buildFixturePack();
  console.log(`Fixture built. Running paged LLM review (${mode})...`);
  const summary = await runCalibration(packPath, mode);
  await reportRecall(packPath, summary);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
