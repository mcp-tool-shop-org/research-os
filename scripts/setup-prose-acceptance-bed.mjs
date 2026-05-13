// Path B fixture setup for Slice 1e prose acceptance.
// Creates a pack with 12 substantive on-topic claims, all accepted_for_synthesis.
// All IDs satisfy the production schema regexes:
//   claim_id: /^clm_[a-f0-9]{12}_(heuristic|ollama_intern)_\d+$/
//   source_id: /^src_[a-f0-9]{12}$/
//
// Run: node scripts/setup-prose-acceptance-bed.mjs
// Then: node dist/cli.js synth section 01-evidence-custody-local-first --pack <packPath>

import { writeFile, mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { init } from '../dist/intake/index.js';
import { add as sectionAdd } from '../dist/sections/index.js';
import { handoff as coworkHandoff } from '../dist/cowork/index.js';

const OUT_DIR = 'E:/AI/research-os-prose-acceptance';
const SECTION_ID = '01-evidence-custody-local-first';
const SECTION_PURPOSE =
  'What does evidence custody require in a local-first research workflow, and where do cloud deep-research tools still produce better readable artifacts?';

// IDs must satisfy /^src_[a-f0-9]{12}$/
const SRC_PROV   = 'src_a1b2c3d4e5f6';
const SRC_DVC    = 'src_b2c3d4e5f6a1';
const SRC_TURING = 'src_c3d4e5f6a1b2';
const SRC_CLOUD  = 'src_d4e5f6a1b2c3';

const SOURCES = [
  {
    source_id: SRC_PROV,
    url: 'https://www.w3.org/TR/prov-overview/',
    publisher: 'W3C',
    title: 'PROV-Overview: An Overview of the PROV Family of Documents',
    source_type: 'docs',
  },
  {
    source_id: SRC_DVC,
    url: 'https://dvc.org/doc/start',
    publisher: 'Iterative',
    title: 'Get Started with DVC — Data Version Control',
    source_type: 'docs',
  },
  {
    source_id: SRC_TURING,
    url: 'https://the-turing-way.netlify.app/reproducible-research/vcs',
    publisher: 'The Turing Way Community',
    title: 'The Turing Way — Version Control for Research',
    source_type: 'docs',
  },
  {
    source_id: SRC_CLOUD,
    url: 'https://openai.com/index/introducing-deep-research/',
    publisher: 'OpenAI',
    title: 'Introducing Deep Research',
    source_type: 'secondary',
  },
];

// IDs must satisfy /^clm_[a-f0-9]{12}_(heuristic|ollama_intern)_\d+$/
const CLAIMS = [
  {
    claim_id: `clm_${SRC_PROV.slice(4)}_heuristic_1`,
    source_ids: [SRC_PROV],
    asserts: 'PROV-DM requires that every provenance record identify the entity (artifact), activity (transformation), and agent (actor), establishing a verifiable chain from raw source to derived conclusion.',
    scope: 'evidence custody in research workflows requiring verifiable artifact chains',
    not: 'general-purpose data storage without provenance semantics',
  },
  {
    claim_id: `clm_${SRC_PROV.slice(4)}_heuristic_2`,
    source_ids: [SRC_PROV],
    asserts: "PROV's wasDerivedFrom relation creates an explicit machine-readable link between any derived artifact and its source, enabling programmatic audit of the full evidence chain.",
    scope: 'provenance record structure for derived artifacts in a local-first pipeline',
    not: 'informal citation or human-readable attribution alone',
  },
  {
    claim_id: `clm_${SRC_PROV.slice(4)}_heuristic_3`,
    source_ids: [SRC_PROV],
    asserts: 'PROV-O, the OWL serialization of PROV-DM, enables evidence custody records to be shared across organizations without prior coordination, directly supporting decentralized local-first research collaboration.',
    scope: 'interoperable provenance interchange for distributed local-first research teams',
    not: 'single-organization proprietary provenance formats incompatible with external audit',
  },
  {
    claim_id: `clm_${SRC_DVC.slice(4)}_heuristic_1`,
    source_ids: [SRC_DVC],
    asserts: 'DVC stores artifact checksums (MD5/SHA256) in lightweight text files committed to git, making the full provenance graph version-controlled at near-zero storage cost for large binary artifacts.',
    scope: 'artifact tracking in ML pipelines using git-native tooling for local-first evidence custody',
    not: 'full binary blob storage inside git history',
  },
  {
    claim_id: `clm_${SRC_DVC.slice(4)}_heuristic_2`,
    source_ids: [SRC_DVC],
    asserts: "DVC's run-cache stores the outputs of any recorded pipeline stage, enabling exact experiment reproduction by re-linking cached outputs rather than re-executing the full computation pipeline.",
    scope: 'deterministic reproducibility in ML experiment management via local content-addressed cache',
    not: 'approximate or statistical reproducibility where outputs may differ between runs',
  },
  {
    claim_id: `clm_${SRC_DVC.slice(4)}_heuristic_3`,
    source_ids: [SRC_DVC],
    asserts: "DVC's artifact tracking is local-first: the content-addressed cache lives on the operator's filesystem, with optional remote push to object storage for team sharing — the remote is a convenience, not a requirement for local operation.",
    scope: 'local-first workflow operation without mandatory cloud dependency',
    not: 'cloud-mandatory workflows where local operation requires network access or is degraded',
  },
  {
    claim_id: `clm_${SRC_TURING.slice(4)}_heuristic_1`,
    source_ids: [SRC_TURING],
    asserts: 'The Turing Way defines evidence custody as requiring three properties: version-controlled code, version-controlled data, and a documented reproducible execution environment — all three must be present for a workflow to be considered reproducible.',
    scope: 'minimum requirements for reproducible local-first research evidence custody',
    not: 'workflows that version code only but leave data and environment unversioned',
  },
  {
    claim_id: `clm_${SRC_TURING.slice(4)}_heuristic_2`,
    source_ids: [SRC_TURING],
    asserts: 'For reproducible research, The Turing Way recommends that all data transformations be captured in a pipeline definition file (Makefile, Snakemake, or DVC stage) rather than ad-hoc scripts, ensuring every step is auditable and rerunnable.',
    scope: 'explicit pipeline declaration as a core evidence-custody requirement in local-first research',
    not: 'implicit or undocumented transformation steps in Jupyter notebooks or shell one-liners',
  },
  {
    claim_id: `clm_${SRC_TURING.slice(4)}_heuristic_3`,
    source_ids: [SRC_TURING],
    asserts: 'Local-first research workflows require explicit provenance tooling to achieve the audit coverage that cloud pipelines provide by default through server-side logging; local operators must configure this coverage deliberately.',
    scope: 'operator responsibility for evidence custody configuration in local-first settings',
    not: 'automatic audit coverage without operator configuration or tooling setup',
  },
  {
    claim_id: `clm_${SRC_CLOUD.slice(4)}_heuristic_1`,
    source_ids: [SRC_CLOUD],
    asserts: 'Cloud deep-research tools (OpenAI Deep Research, Perplexity, Google Deep Research) produce synthesized prose summaries as their native output, whereas local extraction pipelines produce structured claim records that require a separate synthesis step to produce readable artifacts.',
    scope: 'output format comparison: cloud tools produce prose natively, local-first pipelines produce structured claims requiring synthesis',
    not: 'raw source retrieval tools that return document lists without synthesis',
  },
  {
    claim_id: `clm_${SRC_CLOUD.slice(4)}_heuristic_2`,
    source_ids: [SRC_CLOUD],
    asserts: 'For exploratory questions where the answer space is broad and the operator has not curated sources, cloud deep-research tools produce more readable artifacts faster than local-first pipelines because they apply pre-trained reading comprehension across large corpora without requiring per-source curation.',
    scope: 'cloud advantage for broad exploratory research with uncurated source sets',
    not: 'narrow domain questions where operator-curated local sources provide higher-precision evidence',
  },
  {
    claim_id: `clm_${SRC_CLOUD.slice(4)}_heuristic_3`,
    source_ids: [SRC_CLOUD],
    asserts: 'The primary custody tradeoff is verifiability: local-first pipelines maintain full source-level audit trails (which sources were fetched, which claims were accepted, which contradictions were logged), while cloud deep-research tools collapse that audit trail into opaque model outputs that cannot be independently verified.',
    scope: 'audit-trail custody gap as the fundamental local-first vs cloud tradeoff',
    not: 'secondary tradeoffs such as cost, query speed, or source coverage breadth',
  },
];

function makeGateResult(sectionId) {
  return {
    section_id: sectionId,
    verdict: 'pass',
    summary: 'Fixture: 12 accepted claims, 4 sources, 4 independent publishers. All gate checks pass.',
    checked_at: '2026-05-13T00:00:02.000Z',
    synthesis_eligible: true,
    gate_results: [],
    failures: [],
    warnings: [],
    waivers_applied: [],
    blocking_reasons: [],
    claim_counts: {
      total: 12, candidate: 0, with_evidence_excerpt: 12, with_source_hashes: 12,
      with_scope: 12, with_not: 12, universal_scope_null: 0, orphans: 0,
    },
    source_counts: {
      total: 4, primary: 0, secondary: 1, forum: 0, benchmark: 0, docs: 3, unknown: 0,
      independent_publishers: 4, failed_fetches: 0, section_primary: 0, section_independent_publishers: 4,
    },
    contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
    freshness_summary: {
      policy_required: false, max_source_age_months: null, stale_source_policy: 'warn',
      stale_count: 0, unknown_date_count: 4,
    },
    scope_integrity_summary: {
      universal_claims: 0, scoped_claims: 12, with_not_constraint: 12,
      overgen_risks_total: 0, overgen_risks_blocking: 0,
    },
    next_actions: [],
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const r = await init({ topic: 'local-first evidence custody vs cloud deep-research', outDir: OUT_DIR });
const packPath = r.packPath;
console.log('pack created at:', packPath);

await sectionAdd({ id: SECTION_ID, purpose: SECTION_PURPOSE, packPath });
console.log('section added:', SECTION_ID);

const cardDir = join(packPath, 'evidence', 'source-cards');
await mkdir(cardDir, { recursive: true });

for (const src of SOURCES) {
  const card = {
    source_id: src.source_id,
    receipt_id: `rcpt_${src.source_id.slice(4)}_1`,
    section_id: SECTION_ID,
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
    asserts: 'Evidence custody and reproducibility for local-first research workflows.',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-13T00:00:00.000Z',
  };
  await writeFile(join(cardDir, `${src.source_id}.json`), JSON.stringify(card, null, 2), 'utf8');

  await appendFile(
    join(packPath, 'sections', SECTION_ID, 'sources.jsonl'),
    JSON.stringify({ source_id: src.source_id, added_at: '2026-05-13T00:00:00.000Z' }) + '\n',
    'utf8',
  );

  const sha = createHash('sha256').update(src.source_id).digest('hex');
  await appendFile(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    JSON.stringify({
      receipt_id: `rcpt_${src.source_id.slice(4)}_1`,
      source_id: src.source_id,
      section_id: SECTION_ID,
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

for (const c of CLAIMS) {
  await appendFile(
    join(packPath, 'sections', SECTION_ID, 'claims.jsonl'),
    JSON.stringify({
      claim_id: c.claim_id,
      section_id: SECTION_ID,
      source_ids: c.source_ids,
      source_hashes: ['a'.repeat(64)],
      asserts: c.asserts,
      scope: c.scope,
      not: c.not,
      evidence_excerpt: c.asserts.slice(0, 120),
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
    join(packPath, 'sections', SECTION_ID, 'claim-reviews.jsonl'),
    JSON.stringify({
      claim_id: c.claim_id,
      decision: 'accepted_for_synthesis',
      reason: 'On-topic, well-scoped, directly addresses evidence custody or cloud comparison.',
      finding_ids: [],
      reviewer: 'heuristic',
      review_method: 'heuristic_field_and_grounding_checks',
      created_at: '2026-05-13T00:00:02.000Z',
    }) + '\n',
    'utf8',
  );
}

await mkdir(join(packPath, 'audits'), { recursive: true });
await writeFile(
  join(packPath, 'audits', `${SECTION_ID}-gate.json`),
  JSON.stringify(makeGateResult(SECTION_ID), null, 2),
  'utf8',
);

const ho = await coworkHandoff({ packPath });
console.log('handoff mode:', ho.mode);
console.log('acceptedCount:', ho.acceptedCount);
console.log('synthesisAllowed:', ho.synthesisAllowed);

console.log('\nPack path:', packPath);
console.log('\nNext step:');
console.log(`  node dist/cli.js synth section ${SECTION_ID} --pack "${packPath}"`);
