#!/usr/bin/env node
// Reviewer calibration harness.
//
// Builds a small synthetic pack with seeded "good" and "bad" claims, runs the
// paged LLM reviewer over them, and reports per-category recall (did the
// reviewer catch the seeded failures?) plus false-positive rate (did it
// reject the seeded good claims?). Persists a structured calibration receipt
// to calibration/reviewer-profiles/<profile>/seeded-v1.{json,md}.
//
// Usage:
//   OLLAMA_HOST=http://127.0.0.1:11435 \
//   OLLAMA_INTERN_MODEL=hermes3:8b \
//   node scripts/reviewer-calibration.mjs [pack-out-dir] [--model <name>] [--two-pass] [--profile <name>] [--mode comparison-only] [--runs <n>]
//
// --profile <name>   Profile name used for receipt path and record lineage.
//                    If omitted, inferred from --model + --two-pass flag.
//                    Inference rule: take model family (before ':'), strip
//                    trailing version digits, append architecture suffix.
//                    Examples: hermes3:8b --two-pass -> hermes-two-pass
//                              mistral-nemo:12b --two-pass -> mistral-nemo-two-pass
//                              hermes3:8b (single) -> hermes-single-pass
//
// --mode comparison-only   Force status = comparison_only regardless of bars.
//                          Use for architectural side-runs not intended for
//                          production admission.
//
// --runs <n>         Run calibration N times. When n=1 (default), writes the
//                    existing single-run seeded-v1.{json,md} directly.
//                    When n>1, writes per-run receipts under
//                    calibration/reviewer-profiles/<profile>/runs/run-NNN.json
//                    and an aggregate seeded-v1.{json,md} at the profile root.
//                    The fixture is rebuilt from scratch each run (per-run isolation).
//
// The fixture pack is rebuilt on every run — it is purely a calibration
// surface, not research truth.

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  init,
  add as sectionAdd,
  triage,
  review as runReview,
  OllamaInternReviewer,
} from '../dist/index.js';

import {
  computeDecisionVocabBar,
  computePassFail,
  computeStatusLabel,
  buildReceiptMarkdown,
} from '../dist/calibration/receipt.js';

import { CalibrationReceiptSchema } from '../dist/calibration/receipt-schema.js';

import {
  aggregateReceipts,
  buildAggregateReceiptMarkdown,
} from '../dist/calibration/aggregate.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const RESEARCH_OS_VERSION = pkg.version;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_OUT = resolve(REPO_ROOT, 'tmp', 'reviewer-calibration');

// Parse args
const args = process.argv.slice(2);
const outDir = args[0] && !args[0].startsWith('--') ? args[0] : DEFAULT_OUT;
const isTwoPass = args.includes('--two-pass');
const mode = isTwoPass ? 'two-pass' : 'single';
const modelIdx = args.indexOf('--model');
const modelOverride = modelIdx >= 0 ? args[modelIdx + 1] : undefined;
const profileIdx = args.indexOf('--profile');
const profileArg = profileIdx >= 0 ? args[profileIdx + 1] : undefined;
const isComparisonOnly = args.includes('--mode') && args[args.indexOf('--mode') + 1] === 'comparison-only';
const runsIdx = args.indexOf('--runs');
const runsCount = runsIdx >= 0 ? Math.max(1, parseInt(args[runsIdx + 1], 10) || 1) : 1;

// Profile name inference: model family (before ':'), strip trailing digits,
// append architecture suffix. hermes3:8b + two-pass -> hermes-two-pass.
function inferProfileName(model, isTwoPass) {
  const family = (model ?? 'unknown').split(':')[0].replace(/\d+$/, '');
  const arch = isTwoPass ? 'two-pass' : 'single-pass';
  return `${family}-${arch}`;
}

const modelForInference = modelOverride ?? process.env['OLLAMA_INTERN_MODEL'] ?? 'hermes3:8b';
const profileName = profileArg ?? inferProfileName(modelForInference, isTwoPass);
const architecture = isTwoPass ? 'two-pass' : 'single-pass';

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

async function runCalibration(packPath, mode, modelOverride) {
  const general = new OllamaInternReviewer({
    claimsPerWindow: 10,
    mode: 'general',
    model: modelOverride,
  });
  const narrow = new OllamaInternReviewer({
    claimsPerWindow: 10,
    mode: 'narrow_critic',
    model: modelOverride,
  });
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

// Read decision vocabulary from claim-reviews.jsonl after the run.
// Returns counts per decision kind and the number of keys with non-zero count.
async function readDecisionVocabulary(packPath) {
  const reviewsPath = join(packPath, 'sections', '01-calibration', 'claim-reviews.jsonl');
  const allDecisions = [
    'accepted_for_synthesis',
    'rejected',
    'needs_scope_repair',
    'needs_source_repair',
    'needs_contradiction_mapping',
    'needs_human_review',
  ];
  const counts = Object.fromEntries(allDecisions.map((d) => [d, 0]));

  if (!existsSync(reviewsPath)) return { counts, producedCount: 0 };

  const text = await readFile(reviewsPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record.decision && counts[record.decision] !== undefined) {
        counts[record.decision] += 1;
      }
    } catch {
      // malformed line — skip
    }
  }
  const producedCount = allDecisions.filter((d) => counts[d] > 0).length;
  return { counts, producedCount };
}

// Compute per-category any-flag and strict recall from the SEEDS array and
// the findings index. Returns structured PerCategoryRecall records.
function computePerCategoryRecall(findingsByClaim) {
  // Group seeds by primary expected category (first in expected_categories).
  // Good claims (empty expected_categories) are excluded — they're FP tracking.
  const buckets = {};
  for (const seed of SEEDS) {
    if (seed.expected_categories.length === 0) continue;
    const primaryCat = seed.expected_categories[0];
    if (!buckets[primaryCat]) {
      buckets[primaryCat] = { anyFlagMatched: 0, strictMatched: 0, total: 0 };
    }
    const idx = SEEDS.indexOf(seed);
    const claim_id = `clm_${SOURCE_ID.replace(/^src_/, '')}_ollama_intern_${idx + 1}`;
    const fnds = findingsByClaim.get(claim_id) ?? [];
    const expectedSet = new Set(seed.expected_categories);

    buckets[primaryCat].total += 1;
    if (fnds.length > 0) buckets[primaryCat].anyFlagMatched += 1;
    if (fnds.some((f) => expectedSet.has(f.category))) buckets[primaryCat].strictMatched += 1;
  }

  const perCategoryAnyFlag = {};
  const perCategoryStrict = {};
  for (const [cat, b] of Object.entries(buckets)) {
    perCategoryAnyFlag[cat] = {
      matched: b.anyFlagMatched,
      total: b.total,
      ratio: b.total > 0 ? b.anyFlagMatched / b.total : 0,
    };
    perCategoryStrict[cat] = {
      matched: b.strictMatched,
      total: b.total,
      ratio: b.total > 0 ? b.strictMatched / b.total : 0,
    };
  }
  return { perCategoryAnyFlag, perCategoryStrict };
}

async function reportRecallAndBuildReceipt(packPath, summary, runtimeMs) {
  const findingsPath = join(packPath, 'audits', '01-calibration-findings.jsonl');
  const text = existsSync(findingsPath) ? await readFile(findingsPath, 'utf8') : '';
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

  // Console output (unchanged from before)
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

  // Compute any-flag recall
  let anyFlagBadCaught = 0;
  let badTotal = 0;
  for (const seed of SEEDS) {
    const claim_id = `clm_${SOURCE_ID.replace(/^src_/, '')}_ollama_intern_${SEEDS.indexOf(seed) + 1}`;
    if (seed.expected_categories.length === 0) continue;
    badTotal += 1;
    const fnds = findingsByClaim.get(claim_id) ?? [];
    if (fnds.length > 0) anyFlagBadCaught += 1;
  }
  const goodFpCount = (buckets.good ?? { falseFlag: 0 }).falseFlag;
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

  let strictBadCaught = 0;
  for (const [cat, b] of Object.entries(buckets)) if (cat !== 'good') strictBadCaught += b.caught;

  console.log('\n=== headline calibration ===');
  console.log(`good-claim false-flag rate:    ${goodFpCount}/${goodTotal} (${goodTotal > 0 ? ((goodFpCount / goodTotal) * 100).toFixed(0) : 0}%)`);
  console.log(`bad-claim any-flag recall:     ${anyFlagBadCaught}/${badTotal} (${badTotal > 0 ? ((anyFlagBadCaught / badTotal) * 100).toFixed(0) : 0}%)`);
  console.log(`bad-claim strict-cat recall:   ${strictBadCaught}/${badTotal} (${badTotal > 0 ? ((strictBadCaught / badTotal) * 100).toFixed(0) : 0}%)`);

  // Structured metrics for receipt
  const { perCategoryAnyFlag, perCategoryStrict } = computePerCategoryRecall(findingsByClaim);
  const { counts: decisionVocabulary, producedCount: decisionsProducedCount } =
    await readDecisionVocabulary(packPath);

  const anyFlagRecall = {
    matched: anyFlagBadCaught,
    total: badTotal,
    ratio: badTotal > 0 ? anyFlagBadCaught / badTotal : 0,
  };
  const strictRecall = {
    matched: strictBadCaught,
    total: badTotal,
    ratio: badTotal > 0 ? strictBadCaught / badTotal : 0,
  };

  const decisionVocabBar = computeDecisionVocabBar(architecture, decisionsProducedCount);

  // empty_or_malformed_responses: the reviewer already handles failures
  // gracefully (no crash, no silent skips — all claims get a decision record).
  // For seeded-v1, this is 0 by construction. Future sessions requiring deeper
  // HTTP/parse-level instrumentation should add a counter to OllamaInternReviewer.
  const emptyOrMalformed = 0;

  const passFail = computePassFail({
    good_fp_count: goodFpCount,
    any_flag_recall: anyFlagRecall,
    per_category_any_flag: perCategoryAnyFlag,
    strict_recall: strictRecall,
    decision_vocab_bar: decisionVocabBar,
    runtime_ms: runtimeMs,
    empty_or_malformed_responses: emptyOrMalformed,
  });

  const modeOverride = isComparisonOnly ? 'comparison_only' : undefined;
  const status = computeStatusLabel({
    profileName,
    architecture,
    passFail,
    goodFpCount,
    modeOverride,
  });

  console.log(`\n=== decision vocabulary (from claim-reviews.jsonl) ===`);
  for (const [d, n] of Object.entries(decisionVocabulary)) {
    console.log(`  ${d.padEnd(35)} ${n}`);
  }
  console.log(`  Produced (non-zero): ${decisionsProducedCount}/6`);
  console.log(`  Decision vocab bar:  ${decisionVocabBar.passed ? 'PASS' : 'FAIL'} (${architecture} requires >= ${decisionVocabBar.required})`);

  console.log(`\n=== PASS/FAIL ===`);
  for (const [bar, result] of Object.entries(passFail)) {
    console.log(`  ${bar.padEnd(35)} ${result}`);
  }
  console.log(`\n  Status: ${status}`);
  console.log(`  Profile: ${profileName}`);
  console.log(`  Runtime: ${(runtimeMs / 1000).toFixed(1)}s`);

  // For seeded-v1, needs_contradiction_mapping is unreachable because there
  // are no unmapped_contradiction seeds. Hardcoded per advisor lock.
  const unreachableDecisions = ['needs_contradiction_mapping'];

  const goodClaims = SEEDS.filter((s) => s.expected_categories.length === 0).length;
  const badClaims = SEEDS.length - goodClaims;

  const notes = [];
  if (passFail.latency_soft === 'WARN') {
    notes.push(`Latency warning: ${(runtimeMs / 1000).toFixed(1)}s exceeds soft limit of 600s`);
  }
  if (goodFpCount > 0) {
    notes.push(`${goodFpCount} false positive(s) on good claims — see per-seed output for details`);
  }
  if (status === 'comparison_only') {
    notes.push(`comparison_only: this run is a side-run for architectural comparison, not a production admission candidate`);
  }
  if (status === 'conditional_pass') {
    notes.push(`conditional_pass: passes all bars but carries a production caution (check FP count and notes)`);
  }

  const receipt = CalibrationReceiptSchema.parse({
    schema_version: 1,
    profile_name: profileName,
    status,
    model: modelForInference,
    architecture,
    fixture: 'seeded-v1',
    fixture_total_claims: SEEDS.length,
    fixture_good_claims: goodClaims,
    fixture_bad_claims: badClaims,
    calibrated_at: new Date().toISOString(),
    research_os_version: RESEARCH_OS_VERSION,
    runtime_ms: runtimeMs,
    good_fp_count: goodFpCount,
    any_flag_recall: anyFlagRecall,
    strict_recall: strictRecall,
    per_category_any_flag: perCategoryAnyFlag,
    per_category_strict: perCategoryStrict,
    decision_vocabulary: decisionVocabulary,
    decisions_produced_count: decisionsProducedCount,
    decision_vocab_bar: decisionVocabBar,
    unreachable_decisions: unreachableDecisions,
    empty_or_malformed_responses: emptyOrMalformed,
    pass_fail: passFail,
    notes,
  });

  return receipt;
}

async function persistReceipt(receipt) {
  const { buildReceiptMarkdown: buildMd } = await import('../dist/calibration/receipt.js');
  const profileDir = join(REPO_ROOT, 'calibration', 'reviewer-profiles', receipt.profile_name);
  await mkdir(profileDir, { recursive: true });

  const jsonPath = join(profileDir, 'seeded-v1.json');
  const mdPath = join(profileDir, 'seeded-v1.md');

  await writeFile(jsonPath, JSON.stringify(receipt, null, 2), 'utf8');
  await writeFile(mdPath, buildReceiptMarkdown(receipt), 'utf8');

  console.log(`\n=== receipt persisted ===`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  MD:   ${mdPath}`);
}

(async () => {
  console.log(`Mode: ${mode} | Profile: ${profileName} | Model: ${modelForInference} | Runs: ${runsCount}`);
  if (isComparisonOnly) console.log(`Status override: comparison-only`);

  if (runsCount === 1) {
    // Single-run mode — existing behavior, no runs/ subdirectory.
    const startMs = Date.now();
    console.log(`Building fixture at: ${outDir}`);
    const packPath = await buildFixturePack();
    console.log(`Fixture built. Running paged LLM review (${mode})...`);
    const summary = await runCalibration(packPath, mode, modelOverride);
    const runtimeMs = Date.now() - startMs;
    const receipt = await reportRecallAndBuildReceipt(packPath, summary, runtimeMs);
    await persistReceipt(receipt);
    return;
  }

  // Multi-run mode — rebuild fixture per run (isolation), collect per-run receipts,
  // then aggregate and write seeded-v1.{json,md} with aggregate shape.
  const runReceipts = [];
  const profileDir = join(REPO_ROOT, 'calibration', 'reviewer-profiles', profileName);
  const runsDir = join(profileDir, 'runs');
  await mkdir(runsDir, { recursive: true });

  for (let i = 0; i < runsCount; i++) {
    const runNum = i + 1;
    console.log(`\n=== Run ${runNum} of ${runsCount} ===`);
    console.log(`Building fixture at: ${outDir} (fresh rebuild for isolation)`);
    const runStartMs = Date.now();
    const packPath = await buildFixturePack();
    console.log(`Fixture built. Running paged LLM review (${mode})...`);
    const summary = await runCalibration(packPath, mode, modelOverride);
    const runtimeMs = Date.now() - runStartMs;

    const receipt = await reportRecallAndBuildReceipt(packPath, summary, runtimeMs);

    const runFile = join(runsDir, `run-${String(runNum).padStart(3, '0')}.json`);
    await writeFile(runFile, JSON.stringify(receipt, null, 2), 'utf8');
    console.log(`  Per-run receipt: ${runFile}`);
    runReceipts.push(receipt);
  }

  console.log(`\n=== Aggregating ${runsCount} runs ===`);
  const runFiles = runReceipts.map((_, i) =>
    `runs/run-${String(i + 1).padStart(3, '0')}.json`,
  );
  const aggregate = aggregateReceipts(runReceipts, {
    runFiles,
    modeOverride: isComparisonOnly ? 'comparison_only' : undefined,
  });

  await mkdir(profileDir, { recursive: true });
  const jsonPath = join(profileDir, 'seeded-v1.json');
  const mdPath = join(profileDir, 'seeded-v1.md');
  await writeFile(jsonPath, JSON.stringify(aggregate, null, 2), 'utf8');
  await writeFile(mdPath, buildAggregateReceiptMarkdown(aggregate), 'utf8');

  console.log(`\n=== aggregate receipt persisted ===`);
  console.log(`  Status:   ${aggregate.status}`);
  console.log(`  Runs:     ${aggregate.runs_count}`);
  console.log(`  Overall:  ${aggregate.pass_fail.overall}`);
  console.log(`  Recurring failures: ${aggregate.recurring_bar_failures.join(', ') || 'none'}`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  MD:   ${mdPath}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
