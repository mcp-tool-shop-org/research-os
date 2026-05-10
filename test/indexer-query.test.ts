import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { build, query, IndexNotBuiltError } from '../src/indexer/index.js';

let workDir: string;
let packPath: string;

async function makePopulatedPack() {
  const r = await init({ topic: 'How does the indexer query behave end-to-end?', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: '01-test', purpose: 'probe', packPath });
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  // Add a sqlite source card for the query test
  const card = {
    source_id: 'src_aaaaaaaaaaaa',
    receipt_id: 'rcpt_aaaaaaaaaaaa_1',
    section_id: '01-test',
    url: 'https://sqlite.org/fts5.html',
    final_url: 'https://sqlite.org/fts5.html',
    fetched_at: '2026-05-06T22:00:00.000Z',
    publisher: 'sqlite.org',
    published_at: null,
    title: 'SQLite FTS5 Extension',
    source_type: 'secondary',
    relevance: 'unknown',
    key_points: ['FTS5 provides full-text search'],
    limitations: [],
    asserts: 'FTS5 provides full-text search functionality',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-06T22:00:00.000Z',
  };
  await writeFile(join(cardDir, `${card.source_id}.json`), JSON.stringify(card), 'utf8');
  await appendFile(
    join(packPath, 'sections', '01-test', 'sources.jsonl'),
    JSON.stringify({ source_id: card.source_id, added_at: '2026-05-06T22:00:01.000Z' }) + '\n',
    'utf8',
  );

  const receipt = {
    receipt_id: 'rcpt_aaaaaaaaaaaa_1',
    source_id: 'src_aaaaaaaaaaaa',
    section_id: '01-test',
    requested_url: 'https://sqlite.org/fts5.html',
    final_url: 'https://sqlite.org/fts5.html',
    status: 200,
    status_text: 'OK',
    content_type: 'text/html',
    fetched_at: '2026-05-06T22:00:00.000Z',
    byte_count: 100,
    sha256: createHash('sha256').update('src_aaaaaaaaaaaa').digest('hex'),
    title: 'SQLite FTS5',
    raw_text_path: 'evidence/raw/src_aaaaaaaaaaaa.html',
    fetch_outcome: 'ok',
    fetch_error: null,
    extraction_outcome: 'ok',
    extraction_extractor: 'heuristic',
    extraction_error: null,
  };
  await appendFile(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    JSON.stringify(receipt) + '\n',
    'utf8',
  );

  const claim = {
    claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
    section_id: '01-test',
    source_ids: ['src_aaaaaaaaaaaa'],
    source_hashes: ['a'.repeat(64)],
    asserts: 'FTS5 supports prefix queries and ranking',
    scope: 'SQLite FTS5 virtual table',
    not: 'general-purpose search engines',
    evidence_excerpt: 'literal text from FTS5 doc',
    evidence_location: null,
    confidence: 'medium',
    extractor: 'ollama-intern',
    extraction_method: 'ollama_intern_propositional',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
  };
  await appendFile(
    join(packPath, 'sections', '01-test', 'claims.jsonl'),
    JSON.stringify(claim) + '\n',
    'utf8',
  );

  // Gate (blocked verdict so we can search for blocking reasons)
  const gate = {
    section_id: '01-test',
    verdict: 'blocked',
    summary: 'Verdict: blocked. NOT synthesis-eligible.',
    checked_at: '2026-05-06T22:00:00.000Z',
    synthesis_eligible: false,
    gate_results: [],
    failures: [
      {
        family: 'source_floor',
        check: 'min_sources',
        status: 'fail',
        detail: 'Found 1 source card(s); minimum 8 required.',
        evidence: [],
        blocks_synthesis: true,
      },
    ],
    warnings: [],
    waivers_applied: [],
    blocking_reasons: ['source_floor.min_sources: Found 1 source card(s); minimum 8 required.'],
    claim_counts: { total: 1, candidate: 1, with_evidence_excerpt: 1, with_source_hashes: 1, with_scope: 1, with_not: 1, universal_scope_null: 0, orphans: 0 },
    source_counts: { total: 1, primary: 0, secondary: 1, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 1, failed_fetches: 0, section_primary: 0, section_independent_publishers: 1 },
    contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
    freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 0 },
    scope_integrity_summary: { universal_claims: 0, scoped_claims: 1, with_not_constraint: 1, overgen_risks_total: 0, overgen_risks_blocking: 0 },
    next_actions: [],
  };
  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(join(packPath, 'audits', '01-test-gate.json'), JSON.stringify(gate, null, 2), 'utf8');

  const finding = {
    finding_id: 'fnd_abcdef012345',
    section_id: '01-test',
    claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1'],
    source_ids: ['src_aaaaaaaaaaaa'],
    category: 'source_cluster_monopoly',
    severity: 'warn',
    summary: 'Section sources monopolized by sqlite.org',
    evidence: '',
    required_action: 'Add independent source',
    reviewer: 'heuristic',
    review_method: 'heuristic_field_and_grounding_checks',
    confidence: 'high',
    created_at: '2026-05-06T22:00:00.000Z',
  };
  await appendFile(
    join(packPath, 'audits', '01-test-findings.jsonl'),
    JSON.stringify(finding) + '\n',
    'utf8',
  );

  const contradiction = {
    contradiction_id: 'cnt_111111111111_heuristic',
    section_id: '01-test',
    claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1', 'clm_bbbbbbbbbbbb_heuristic_1'],
    source_ids: ['src_aaaaaaaaaaaa'],
    type: 'direct_conflict',
    summary: 'A and B disagree on indexing semantics',
    scope_analysis: '',
    overlap_assessment: 'fully_overlapping',
    severity: 'medium',
    confidence: 'low',
    detector: 'heuristic',
    detection_method: 'heuristic_similarity_negation',
    evidence: '',
    status: 'unresolved',
    created_at: '2026-05-06T22:00:00.000Z',
  };
  await appendFile(
    join(packPath, 'sections', '01-test', 'contradictions.jsonl'),
    JSON.stringify(contradiction) + '\n',
    'utf8',
  );

  await build({ packPath, all: true });
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-indexer-query-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('indexer.query', () => {
  it('returns claims matching the search term', async () => {
    await makePopulatedPack();
    const result = query({ packPath, term: 'prefix' });
    expect(result.totalHits).toBeGreaterThan(0);
    const claimHits = result.groupedByType['claim'] ?? [];
    expect(claimHits.length).toBeGreaterThan(0);
    expect(claimHits[0]?.section_id).toBe('01-test');
    expect(claimHits[0]?.artifact_path).toContain('sections/01-test/claims.jsonl');
  });

  it('returns gate failures matching blocking-reason text', async () => {
    await makePopulatedPack();
    const result = query({ packPath, term: 'min_sources' });
    expect(result.groupedByType['gate_result']?.length ?? 0).toBeGreaterThan(0);
  });

  it('returns review findings matching category text', async () => {
    await makePopulatedPack();
    const result = query({ packPath, term: 'source_cluster_monopoly' });
    expect(result.groupedByType['review_finding']?.length ?? 0).toBeGreaterThan(0);
    const hit = result.groupedByType['review_finding']![0];
    expect(hit.artifact_path).toContain('audits/01-test-findings.jsonl');
  });

  it('returns contradictions matching summary text', async () => {
    await makePopulatedPack();
    const result = query({ packPath, term: 'indexing' });
    expect(result.groupedByType['contradiction']?.length ?? 0).toBeGreaterThan(0);
  });

  it('respects --type filter', async () => {
    await makePopulatedPack();
    const result = query({ packPath, term: 'sqlite', recordType: 'source' });
    for (const h of result.hits) {
      expect(h.record_type).toBe('source');
    }
  });

  it('throws IndexNotBuiltError when querying before build', async () => {
    const r = await init({ topic: 'How does the indexer behave when the index is missing?', outDir: workDir });
    packPath = r.packPath;
    expect(() => query({ packPath, term: 'anything' })).toThrow(IndexNotBuiltError);
  });

  it('returns hits with snippets that highlight the matched term', async () => {
    await makePopulatedPack();
    const result = query({ packPath, term: 'FTS5' });
    expect(result.totalHits).toBeGreaterThan(0);
    expect(result.hits[0]?.snippet).toContain('<mark>');
  });
});
