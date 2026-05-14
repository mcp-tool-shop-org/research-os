// v0.9 Slice 2b — multi-section partial-pack acceptance bed setup.
//
// Builds a pack with:
//   - Section 01: copied from the Slice 1e prose-acceptance pack
//     (evidence custody in local-first workflows)
//   - Section 02: NEW section with different focal claims and different sources
//     (where cloud deep-research tools win on readability + operator burden)
//   - Section 03: deliberately blocked
//
// Section 01 prose is REUSED verbatim from the Slice 1e bed — the verifier
// already passed it as faithful and we want exact byte-equivalence with the
// section-level pipeline so Slice 2b's pack-level prose is the only variable.
//
// Section 02 fixture pre-bakes the upstream stages (claims, reviews, gate)
// exactly the way Slice 1e's Path B does. Then `research-os synth section`
// is run LIVE against Section 02 to produce real verifier-faithful prose
// for partial-pack synthesis to consume.
//
// Run:  node scripts/setup-partial-pack-multi-bed.mjs
// Then: node dist/cli.js synth section 02-cloud-readability-and-operator-burden --pack <packPath>
// Then: node dist/cli.js cowork handoff --pack <packPath>
// Then: node dist/cli.js synth pack --partial --pack <packPath>

import { copyFile, mkdir, readFile, readdir, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { init, add as sectionAdd } from '../dist/index.js';

const SOURCE_BED = 'E:/AI/research-os-prose-acceptance/local-first-evidence-custody-vs-cloud-deep-research';
const OUT_BED = 'E:/AI/research-os-partial-pack-acceptance/local-first-vs-cloud-readability-multi';

const SECTION_01 = '01-evidence-custody-local-first';
const SECTION_02 = '02-cloud-readability-and-operator-burden';
const SECTION_03 = '03-deliberately-blocked-section';

const SECTION_01_PURPOSE =
  'What does evidence custody require in a local-first research workflow, and where do cloud deep-research tools still produce better readable artifacts?';
const SECTION_02_PURPOSE =
  'Where do cloud deep-research tools still produce better readable artifacts than local-first workflows, and what is the operator burden gap that makes the cloud path faster to a usable artifact?';
const SECTION_03_PURPOSE =
  'Section deliberately added to exercise the partial-pack classifier\'s gate_blocked path; has zero accepted claims and must not produce prose.';

// ── Section 02 sources — real announcement pages for the four major cloud
// deep-research products. Hex prefixes are entirely distinct from Section 01.
//
// Caveat: the swarm flagged that openai.com/index/... and perplexity.ai/hub/...
// returned HTTP 403 to WebFetch from this environment; the page-text excerpts
// used here come from the WebSearch index, not direct HTML extraction. This is
// faithful for an acceptance-bed fixture but would need direct-fetch verification
// before being admitted to a published research-pack archive.
const SRC_OPENAI_DR    = 'src_a0a0b1b1c2c2'; // OpenAI Deep Research announcement
const SRC_CLAUDE_RES   = 'src_d3d3e4e4f5f5'; // Anthropic Claude Research announcement
const SRC_PERPLEXITY   = 'src_a6a6b7b7c8c8'; // Perplexity Deep Research announcement
const SRC_GEMINI_DR    = 'src_d9d9eaeafafb'; // Google Gemini Deep Research product

const SECTION_02_SOURCES = [
  {
    source_id: SRC_OPENAI_DR,
    url: 'https://openai.com/index/introducing-deep-research/',
    publisher: 'OpenAI',
    title: 'Introducing deep research',
    source_type: 'docs',
  },
  {
    source_id: SRC_CLAUDE_RES,
    url: 'https://claude.com/blog/research',
    publisher: 'Anthropic',
    title: 'Claude takes research to new places',
    source_type: 'docs',
  },
  {
    source_id: SRC_PERPLEXITY,
    url: 'https://www.perplexity.ai/hub/blog/introducing-perplexity-deep-research',
    publisher: 'Perplexity',
    title: 'Introducing Perplexity Deep Research',
    source_type: 'docs',
  },
  {
    source_id: SRC_GEMINI_DR,
    url: 'https://gemini.google/overview/deep-research/',
    publisher: 'Google',
    title: 'Gemini Deep Research — your personal research assistant',
    source_type: 'docs',
  },
];

// Section 02 claims — each backed by a real evidence excerpt the research
// swarm verified from the source page. Three claims per source × four
// sources = 12 claims, matching Section 01's structure.
//
// Provenance note: focal claim text is a tight paraphrase of the source
// page; evidence_excerpt is the verbatim or near-verbatim quote the swarm
// surfaced. Source URLs are real product/announcement pages.
const SECTION_02_CLAIMS = [
  // OpenAI Deep Research — comparative answer claim (cloud-vs-local output format)
  {
    claim_id: `clm_${SRC_OPENAI_DR.slice(4)}_heuristic_1`,
    source_ids: [SRC_OPENAI_DR],
    asserts:
      'Cloud deep-research tools like OpenAI Deep Research produce fully-cited written reports as their native output, while local-first research stacks emit structured claim records that require a separate operator-driven synthesis step to produce a readable artifact.',
    scope: 'comparative output format: cloud native prose with citations vs local-first structured claim records',
    not: 'document-discovery tools returning raw retrieved sources with no synthesis or citation pass',
    evidence_excerpt:
      'Every output is fully documented, with clear citations and a summary of its thinking, making it easy to reference and verify the information.',
  },
  {
    claim_id: `clm_${SRC_OPENAI_DR.slice(4)}_heuristic_2`,
    source_ids: [SRC_OPENAI_DR],
    asserts:
      'OpenAI Deep Research targets tens-of-minutes turnaround per query, doing in that time what would take a human research analyst many hours.',
    scope: 'cloud turnaround advantage over human-driven research workflows',
    not: 'sub-second factual lookups or multi-day archival research projects',
    evidence_excerpt:
      'a new agentic capability that conducts multi-step research on the internet for complex tasks, accomplishing in tens of minutes what would take a human many hours.',
  },
  {
    claim_id: `clm_${SRC_OPENAI_DR.slice(4)}_heuristic_3`,
    source_ids: [SRC_OPENAI_DR],
    asserts:
      'OpenAI Deep Research is prompt-driven and agentic: the operator gives a single prompt, then ChatGPT autonomously finds, analyzes, and synthesizes across hundreds of online sources.',
    scope: 'one-shot prompt-driven cloud synthesis hidden behind a single agent step',
    not: 'local pipelines that surface gather, extract, review, and gate stages to the operator',
    evidence_excerpt:
      'you give it a prompt, and ChatGPT will find, analyze, and synthesize hundreds of online sources to create a comprehensive report at the level of a research analyst.',
  },
  // Anthropic Claude Research
  {
    claim_id: `clm_${SRC_CLAUDE_RES.slice(4)}_heuristic_1`,
    source_ids: [SRC_CLAUDE_RES],
    asserts:
      'Anthropic Claude Research delivers thorough answers complete with easy-to-check citations, framing citation-verifiability as a first-class feature of the output.',
    scope: 'cloud research tools that ship citation-verifiability as a product feature',
    not: 'tools that ship prose-only outputs with no operator-checkable source trail',
    evidence_excerpt:
      'This approach delivers thorough answers, complete with easy-to-check citations so you can trust Claude\'s findings.',
  },
  {
    claim_id: `clm_${SRC_CLAUDE_RES.slice(4)}_heuristic_2`,
    source_ids: [SRC_CLAUDE_RES],
    asserts:
      'Claude Research delivers high-quality comprehensive answers in minutes for the multiple research tasks a knowledge worker faces during a workday.',
    scope: 'minute-scale cloud turnaround for repeated knowledge-work research queries',
    not: 'one-off or rare-query workflows where turnaround speed is not a feature requirement',
    evidence_excerpt:
      'Research delivers high-quality, comprehensive answers in minutes, making it practical for the multiple research tasks you tackle throughout your workday.',
  },
  // Anthropic Claude Research — comparative answer claim (operator-burden gap)
  {
    claim_id: `clm_${SRC_CLAUDE_RES.slice(4)}_heuristic_3`,
    source_ids: [SRC_CLAUDE_RES],
    asserts:
      'Cloud deep-research workflows like Claude Research reach a usable readable artifact through a single account-plus-toggle invocation, while local-first stacks require operators to install an MCP server, register reviewer profiles, manage local model memory, and chain a multi-stage CLI before any pack-level prose exists — this is the operator-burden gap that makes the cloud path faster to a usable artifact.',
    scope: 'comparative operator-side burden: cloud single-step invocation vs local-first multi-stage setup',
    not: 'repeat-query workflows where the operator has already configured the local stack and is skipping setup stages',
    evidence_excerpt:
      'Research is now available in early beta for Max, Team, and Enterprise plans in the United States, Japan, and Brazil. Simply toggle on the Research setting in chat.',
  },
  // Perplexity Deep Research
  {
    claim_id: `clm_${SRC_PERPLEXITY.slice(4)}_heuristic_1`,
    source_ids: [SRC_PERPLEXITY],
    asserts:
      'Perplexity Deep Research performs dozens of searches, reads hundreds of sources, and reasons through the material to autonomously deliver a comprehensive report.',
    scope: 'managed cloud research stacks where fetch / read / reason / synthesize is server-side',
    not: 'local-first pipelines where the operator owns each upstream stage explicitly',
    evidence_excerpt:
      'Perplexity performs dozens of searches, reads hundreds of sources, and reasons through the material to autonomously deliver a comprehensive report.',
  },
  {
    claim_id: `clm_${SRC_PERPLEXITY.slice(4)}_heuristic_2`,
    source_ids: [SRC_PERPLEXITY],
    asserts:
      'Perplexity Deep Research delivers an answer within roughly two to four minutes per query, compressing into minutes what a human expert would spend many hours on.',
    scope: 'reported minutes-scale turnaround for managed cloud deep-research queries',
    not: 'short factual queries under a minute or open-ended multi-day investigations',
    evidence_excerpt:
      'Deep Research takes question answering to the next level by spending 2-4 minutes doing the work it would take a human expert many hours to perform.',
  },
  {
    claim_id: `clm_${SRC_PERPLEXITY.slice(4)}_heuristic_3`,
    source_ids: [SRC_PERPLEXITY],
    asserts:
      'Perplexity Deep Research access is tiered by subscription: Pro subscribers get a high daily query volume while free users are capped at a limited number of answers per day.',
    scope: 'cloud research access tiering by paid subscription versus free-tier daily caps',
    not: 'unmetered local-first pipelines that depend only on the operator\'s own hardware',
    evidence_excerpt:
      'Pro subscribers receive a high volume of Deep Research queries, while non-subscribers will have access to a limited number of answers per day.',
  },
  // Google Gemini Deep Research
  {
    claim_id: `clm_${SRC_GEMINI_DR.slice(4)}_heuristic_1`,
    source_ids: [SRC_GEMINI_DR],
    asserts:
      'Gemini Deep Research generates multi-page reports in minutes, with the cloud product framing minute-scale turnaround as the headline benefit.',
    scope: 'cloud research products advertising minute-scale multi-page report generation',
    not: 'local-first synthesis CLIs that require an operator-driven post-pipeline rendering step',
    evidence_excerpt: 'create insightful multi-page reports in minutes',
  },
  {
    claim_id: `clm_${SRC_GEMINI_DR.slice(4)}_heuristic_2`,
    source_ids: [SRC_GEMINI_DR],
    asserts:
      'Gemini Deep Research offers an in-product transformation pipeline that converts the prose report into Audio Overviews, interactive Canvas content, and quizzes — readability affordances baked into the cloud product.',
    scope: 'cloud research products that bundle downstream readability transformations server-side',
    not: 'local-first stacks where audio or interactive renderings would require separate operator tooling',
    evidence_excerpt:
      'create insightful multi-page reports in minutes ... turning them into interactive content, quizzes, Audio Overviews',
  },
  {
    claim_id: `clm_${SRC_GEMINI_DR.slice(4)}_heuristic_3`,
    source_ids: [SRC_GEMINI_DR],
    asserts:
      'Gemini Deep Research is plan-gated to Google Workspace users and invoked by selecting Deep Research in the prompt bar, with no operator-side install or pipeline configuration.',
    scope: 'cloud research access via existing managed-workspace account plus prompt-bar selector',
    not: 'local-first stacks that require operator-side MCP server install and profile configuration',
    evidence_excerpt:
      'Available to Google Workspace users ... Just select Deep Research in the prompt bar to get started',
  },
];

function makeGateResult(sectionId, claimCount, sourceCount) {
  return {
    section_id: sectionId,
    verdict: 'pass',
    summary: `Fixture: ${claimCount} accepted claims, ${sourceCount} sources, ${sourceCount} independent publishers. All gate checks pass.`,
    checked_at: '2026-05-13T00:00:02.000Z',
    synthesis_eligible: true,
    gate_results: [],
    failures: [],
    warnings: [],
    waivers_applied: [],
    blocking_reasons: [],
    claim_counts: {
      total: claimCount, candidate: 0, with_evidence_excerpt: claimCount, with_source_hashes: claimCount,
      with_scope: claimCount, with_not: claimCount, universal_scope_null: 0, orphans: 0,
    },
    source_counts: {
      total: sourceCount, primary: 0, secondary: 2, forum: 0, benchmark: 0, docs: 2, unknown: 0,
      independent_publishers: sourceCount, failed_fetches: 0, section_primary: 0, section_independent_publishers: sourceCount,
    },
    contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
    freshness_summary: {
      policy_required: false, max_source_age_months: null, stale_source_policy: 'warn',
      stale_count: 0, unknown_date_count: sourceCount,
    },
    scope_integrity_summary: {
      universal_claims: 0, scoped_claims: claimCount, with_not_constraint: claimCount,
      overgen_risks_total: 0, overgen_risks_blocking: 0,
    },
    next_actions: [],
  };
}

function makeBlockedGateResult(sectionId) {
  return {
    section_id: sectionId,
    verdict: 'blocked',
    summary: 'Fixture: section deliberately blocked to exercise the partial-pack classifier\'s gate_blocked path.',
    checked_at: '2026-05-13T00:00:02.000Z',
    synthesis_eligible: false,
    gate_results: [],
    failures: [{
      family: 'accepted_claim_floor',
      check: 'min_accepted_claims',
      status: 'fail',
      detail: '0 accepted claims; minimum 3 required.',
      evidence: [],
      blocks_synthesis: true,
    }],
    warnings: [],
    waivers_applied: [],
    blocking_reasons: ['accepted_claim_floor.min_accepted_claims: 0 accepted; minimum 3 required.'],
    claim_counts: {
      total: 0, candidate: 0, with_evidence_excerpt: 0, with_source_hashes: 0,
      with_scope: 0, with_not: 0, universal_scope_null: 0, orphans: 0,
    },
    source_counts: {
      total: 0, primary: 0, secondary: 0, forum: 0, benchmark: 0, docs: 0, unknown: 0,
      independent_publishers: 0, failed_fetches: 0, section_primary: 0, section_independent_publishers: 0,
    },
    contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
    freshness_summary: {
      policy_required: false, max_source_age_months: null, stale_source_policy: 'warn',
      stale_count: 0, unknown_date_count: 0,
    },
    scope_integrity_summary: {
      universal_claims: 0, scoped_claims: 0, with_not_constraint: 0,
      overgen_risks_total: 0, overgen_risks_blocking: 0,
    },
    next_actions: [],
  };
}

async function copyDirRecursive(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(s, d);
    } else {
      const buf = await readFile(s);
      await writeFile(d, buf);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

// Initialize the new pack at OUT_BED's parent. `init` will create the pack dir
// from the topic. We instead want a fixed name, so we use init with a topic
// that produces a deterministic slug and then move if needed — but `init`
// already produces a slug-based dir. To get our exact name, we'll init with
// our intended topic and rename via post-step.
const r = await init({
  topic: 'local-first vs cloud readability — multi-section partial-pack acceptance bed',
  outDir: 'E:/AI/research-os-partial-pack-acceptance',
});
let packPath = r.packPath;
console.log('pack created at:', packPath);

// Rename to the locked OUT_BED path.
if (packPath !== OUT_BED) {
  const { rename, rm } = await import('node:fs/promises');
  await rm(OUT_BED, { recursive: true, force: true });
  await rename(packPath, OUT_BED);
  packPath = OUT_BED;
  console.log('pack renamed to:', packPath);
}

// Add Sections 01, 02, 03 to research.yaml.
await sectionAdd({ id: SECTION_01, purpose: SECTION_01_PURPOSE, packPath });
await sectionAdd({ id: SECTION_02, purpose: SECTION_02_PURPOSE, packPath });
await sectionAdd({ id: SECTION_03, purpose: SECTION_03_PURPOSE, packPath });
console.log('sections added: 01, 02, 03');

// ── Section 01: copy fixture artifacts from the Slice 1e source bed ───────────
console.log('copying Section 01 fixture from Slice 1e bed...');
const src01 = join(SOURCE_BED, 'sections', SECTION_01);
const dst01 = join(packPath, 'sections', SECTION_01);
await copyDirRecursive(src01, dst01);

// Copy Section 01's source cards (4 of them) to evidence/source-cards/.
const srcCards = join(SOURCE_BED, 'evidence', 'source-cards');
const dstCards = join(packPath, 'evidence', 'source-cards');
await mkdir(dstCards, { recursive: true });
const cardFiles = await readdir(srcCards);
for (const f of cardFiles) {
  const buf = await readFile(join(srcCards, f));
  await writeFile(join(dstCards, f), buf);
}

// Copy Section 01's fetch-log entries.
const srcFetch = join(SOURCE_BED, 'evidence', 'fetch-log.jsonl');
const dstFetch = join(packPath, 'evidence', 'fetch-log.jsonl');
await writeFile(dstFetch, await readFile(srcFetch));

// Copy Section 01's gate audit.
await mkdir(join(packPath, 'audits'), { recursive: true });
await writeFile(
  join(packPath, 'audits', `${SECTION_01}-gate.json`),
  await readFile(join(SOURCE_BED, 'audits', `${SECTION_01}-gate.json`)),
);

// ── Section 02: build fixture from scratch ────────────────────────────────────
console.log('building Section 02 fixture...');

for (const src of SECTION_02_SOURCES) {
  const card = {
    source_id: src.source_id,
    receipt_id: `rcpt_${src.source_id.slice(4)}_1`,
    section_id: SECTION_02,
    url: src.url,
    final_url: src.url,
    fetched_at: '2026-05-13T00:00:00.000Z',
    publisher: src.publisher,
    published_at: null,
    title: src.title,
    source_type: src.source_type,
    relevance: 'high',
    key_points: [],
    limitations: [],
    asserts: 'Cloud deep-research readability and operator burden in local-first stacks.',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-13T00:00:00.000Z',
  };
  await writeFile(join(dstCards, `${src.source_id}.json`), JSON.stringify(card, null, 2), 'utf8');

  await appendFile(
    join(packPath, 'sections', SECTION_02, 'sources.jsonl'),
    JSON.stringify({ source_id: src.source_id, added_at: '2026-05-13T00:00:00.000Z' }) + '\n',
    'utf8',
  );

  const sha = createHash('sha256').update(src.source_id).digest('hex');
  await appendFile(
    dstFetch,
    JSON.stringify({
      receipt_id: `rcpt_${src.source_id.slice(4)}_1`,
      source_id: src.source_id,
      section_id: SECTION_02,
      requested_url: src.url,
      final_url: src.url,
      status: 200,
      status_text: 'OK',
      content_type: 'text/html',
      fetched_at: '2026-05-13T00:00:00.000Z',
      byte_count: 12000,
      sha256: sha,
      title: src.title,
      raw_text_path: `evidence/raw/${src.source_id}.txt`,
      fetch_outcome: 'ok',
      fetch_error: null,
      extraction_outcome: 'ok',
      extraction_extractor: 'heuristic',
      extraction_error: null,
    }) + '\n',
    'utf8',
  );
}

for (const c of SECTION_02_CLAIMS) {
  // Use the explicit evidence_excerpt from the swarm-verified source page
  // when provided; fall back to first 120 chars of asserts otherwise.
  const excerpt = c.evidence_excerpt ?? c.asserts.slice(0, 120);
  await appendFile(
    join(packPath, 'sections', SECTION_02, 'claims.jsonl'),
    JSON.stringify({
      claim_id: c.claim_id,
      section_id: SECTION_02,
      source_ids: c.source_ids,
      source_hashes: ['a'.repeat(64)],
      asserts: c.asserts,
      scope: c.scope,
      not: c.not,
      evidence_excerpt: excerpt,
      evidence_location: null,
      confidence: 'high',
      extractor: 'heuristic',
      extraction_method: 'heuristic_key_point',
      created_at: '2026-05-13T00:00:01.000Z',
      review_state: 'candidate',
    }) + '\n',
    'utf8',
  );

  await appendFile(
    join(packPath, 'sections', SECTION_02, 'claim-reviews.jsonl'),
    JSON.stringify({
      claim_id: c.claim_id,
      decision: 'accepted_for_synthesis',
      reason: 'On-topic, well-scoped, directly addresses cloud readability advantages or operator burden gap.',
      finding_ids: [],
      reviewer: 'heuristic',
      review_method: 'heuristic_field_and_grounding_checks',
      created_at: '2026-05-13T00:00:02.000Z',
    }) + '\n',
    'utf8',
  );
}

await writeFile(
  join(packPath, 'audits', `${SECTION_02}-gate.json`),
  JSON.stringify(makeGateResult(SECTION_02, SECTION_02_CLAIMS.length, SECTION_02_SOURCES.length), null, 2),
  'utf8',
);

// ── Section 03: gate-blocked ──────────────────────────────────────────────────
await writeFile(
  join(packPath, 'audits', `${SECTION_03}-gate.json`),
  JSON.stringify(makeBlockedGateResult(SECTION_03), null, 2),
  'utf8',
);

console.log('\nbed ready at:', packPath);
console.log('\nNext steps:');
console.log(`  node dist/cli.js synth section ${SECTION_02} --pack "${packPath}"`);
console.log(`  node dist/cli.js cowork handoff --pack "${packPath}"`);
console.log(`  node dist/cli.js synth pack --partial --pack "${packPath}"`);
