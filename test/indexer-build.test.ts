import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { build, indexDbPath } from '../src/indexer/index.js';
import { PackNotFoundError } from '../src/errors.js';

let workDir: string;
let packPath: string;

interface Spec {
  sources?: Array<{ source_id: string; publisher: string; source_type?: string }>;
  claims?: Array<{ claim_id: string; source_ids?: string[]; asserts?: string }>;
  contradictions?: Array<{ contradiction_id: string }>;
  withGate?: boolean;
  withReview?: boolean;
}

async function fixture(spec: Spec) {
  const r = await init({ topic: 'How does the indexer behave end-to-end?', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: '01-test', purpose: 'probe', packPath });

  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  for (const s of spec.sources ?? []) {
    const card = {
      source_id: s.source_id,
      receipt_id: `rcpt_${s.source_id.replace(/^src_/, '')}_1`,
      section_id: '01-test',
      url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      fetched_at: '2026-05-06T22:00:00.000Z',
      publisher: s.publisher,
      published_at: '2025-12-01T00:00:00.000Z',
      title: `Title ${s.source_id}`,
      source_type: s.source_type ?? 'secondary',
      relevance: 'unknown',
      key_points: [`keypoint about ${s.source_id}`],
      limitations: [],
      asserts: `${s.source_id} asserts something searchable`,
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-06T22:00:00.000Z',
    };
    await writeFile(join(cardDir, `${s.source_id}.json`), JSON.stringify(card), 'utf8');
    await appendFile(
      join(packPath, 'sections', '01-test', 'sources.jsonl'),
      JSON.stringify({ source_id: s.source_id, added_at: '2026-05-06T22:00:01.000Z' }) + '\n',
      'utf8',
    );
    const receipt = {
      receipt_id: `rcpt_${s.source_id.replace(/^src_/, '')}_1`,
      source_id: s.source_id,
      section_id: '01-test',
      requested_url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      status: 200,
      status_text: 'OK',
      content_type: 'text/html',
      fetched_at: '2026-05-06T22:00:00.000Z',
      byte_count: 100,
      sha256: createHash('sha256').update(s.source_id).digest('hex'),
      title: `Title ${s.source_id}`,
      raw_text_path: `evidence/raw/${s.source_id}.html`,
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
  }

  for (const c of spec.claims ?? []) {
    const claim = {
      claim_id: c.claim_id,
      section_id: '01-test',
      source_ids: c.source_ids ?? ['src_aaaaaaaaaaaa'],
      source_hashes: ['a'.repeat(64)],
      asserts: c.asserts ?? 'something searchable about the claim',
      scope: 'narrow scope',
      not: 'broad scope',
      evidence_excerpt: 'literal evidence text',
      evidence_location: null,
      confidence: 'low',
      extractor: 'heuristic',
      extraction_method: 'heuristic_key_point',
      created_at: '2026-05-06T22:00:00.000Z',
      review_state: 'candidate',
    };
    await appendFile(
      join(packPath, 'sections', '01-test', 'claims.jsonl'),
      JSON.stringify(claim) + '\n',
      'utf8',
    );
  }

  for (const c of spec.contradictions ?? []) {
    const contradiction = {
      contradiction_id: c.contradiction_id,
      section_id: '01-test',
      claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1', 'clm_bbbbbbbbbbbb_heuristic_1'],
      source_ids: ['src_aaaaaaaaaaaa'],
      type: 'direct_conflict',
      summary: 'A says X, B says not-X under same scope',
      scope_analysis: '',
      overlap_assessment: 'fully_overlapping',
      severity: 'medium',
      confidence: 'low',
      detector: 'heuristic',
      detection_method: 'heuristic_similarity_negation',
      evidence: 'token overlap',
      status: 'unresolved',
      created_at: '2026-05-06T22:00:00.000Z',
    };
    await appendFile(
      join(packPath, 'sections', '01-test', 'contradictions.jsonl'),
      JSON.stringify(contradiction) + '\n',
      'utf8',
    );
  }

  if (spec.withGate) {
    const gate = {
      section_id: '01-test',
      verdict: 'blocked',
      summary: 'Verdict: blocked. NOT synthesis-eligible. 1 failures; 0 warnings; no waivers.',
      checked_at: '2026-05-06T22:00:00.000Z',
      synthesis_eligible: false,
      gate_results: [],
      failures: [
        {
          family: 'source_floor',
          check: 'min_sources',
          status: 'fail',
          detail: 'Found 1 source card(s); minimum 8 required.',
          evidence: ['src_aaaaaaaaaaaa'],
          blocks_synthesis: true,
        },
      ],
      warnings: [],
      waivers_applied: [],
      blocking_reasons: ['source_floor.min_sources: Found 1 source card(s); minimum 8 required.'],
      claim_counts: { total: 0, candidate: 0, with_evidence_excerpt: 0, with_source_hashes: 0, with_scope: 0, with_not: 0, universal_scope_null: 0, orphans: 0 },
      source_counts: { total: 1, primary: 0, secondary: 1, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 1, failed_fetches: 0 },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 0 },
      scope_integrity_summary: { universal_claims: 0, scoped_claims: 0, with_not_constraint: 0, overgen_risks_total: 0, overgen_risks_blocking: 0 },
      next_actions: ['Run `research-os gather` with additional URLs to reach the minimum source count.'],
    };
    await mkdir(join(packPath, 'audits'), { recursive: true });
    await writeFile(
      join(packPath, 'audits', '01-test-gate.json'),
      JSON.stringify(gate, null, 2),
      'utf8',
    );
  }

  if (spec.withReview) {
    const finding = {
      finding_id: 'fnd_abcdef012345',
      section_id: '01-test',
      claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1'],
      source_ids: ['src_aaaaaaaaaaaa'],
      category: 'source_cluster_monopoly',
      severity: 'warn',
      summary: 'Section sources monopolized by one publisher',
      evidence: '',
      required_action: 'Add independent source',
      reviewer: 'heuristic',
      review_method: 'heuristic_field_and_grounding_checks',
      confidence: 'high',
      created_at: '2026-05-06T22:00:00.000Z',
    };
    await mkdir(join(packPath, 'audits'), { recursive: true });
    await appendFile(
      join(packPath, 'audits', '01-test-findings.jsonl'),
      JSON.stringify(finding) + '\n',
      'utf8',
    );
    const claimReview = {
      claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
      decision: 'needs_source_repair',
      reason: 'Findings: source_cluster_monopoly (warn).',
      finding_ids: ['fnd_abcdef012345'],
      reviewer: 'heuristic',
      review_method: 'heuristic_field_and_grounding_checks',
      created_at: '2026-05-06T22:00:00.000Z',
    };
    await appendFile(
      join(packPath, 'sections', '01-test', 'claim-reviews.jsonl'),
      JSON.stringify(claimReview) + '\n',
      'utf8',
    );
  }
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-indexer-build-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('indexer.build', () => {
  it('builds the SQLite index at .research-os/index.sqlite with all expected tables', async () => {
    await fixture({
      sources: [{ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' }],
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', source_ids: ['src_aaaaaaaaaaaa'] }],
    });
    const summary = await build({ packPath, all: true });
    expect(summary.dbPath.endsWith('index.sqlite')).toBe(true);
    expect(summary.sectionsIndexed).toBe(1);
    expect(summary.sources).toBe(1);
    expect(summary.claims).toBe(1);
    expect(existsSync(indexDbPath(packPath))).toBe(true);

    const db = new Database(indexDbPath(packPath), { readonly: true });
    try {
      const tables = db
        .prepare(`SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name`)
        .all() as Array<{ name: string }>;
      const names = new Set(tables.map((t) => t.name));
      for (const expected of [
        'sections',
        'sources',
        'claims',
        'contradictions',
        'review_findings',
        'claim_reviews',
        'gate_results',
        'fetch_receipts',
        'artifacts',
      ]) {
        expect(names.has(expected), `missing table ${expected}`).toBe(true);
      }
    } finally {
      db.close();
    }
  });

  it('writes .research-os/.gitignore on first build', async () => {
    await fixture({ sources: [{ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' }] });
    await build({ packPath, all: true });
    const gi = await readFile(join(packPath, '.research-os', '.gitignore'), 'utf8');
    expect(gi).toContain('*');
  });

  it('does not mutate canonical artifacts', async () => {
    await fixture({
      sources: [{ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' }],
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', source_ids: ['src_aaaaaaaaaaaa'] }],
      contradictions: [{ contradiction_id: 'cnt_111111111111_heuristic' }],
      withGate: true,
      withReview: true,
    });
    const beforeFiles = await Promise.all([
      readFile(join(packPath, 'sections', '01-test', 'claims.jsonl'), 'utf8'),
      readFile(join(packPath, 'sections', '01-test', 'contradictions.jsonl'), 'utf8'),
      readFile(join(packPath, 'sections', '01-test', 'sources.jsonl'), 'utf8'),
      readFile(join(packPath, 'sections', '01-test', 'claim-reviews.jsonl'), 'utf8'),
      readFile(join(packPath, 'audits', '01-test-findings.jsonl'), 'utf8'),
      readFile(join(packPath, 'audits', '01-test-gate.json'), 'utf8'),
      readFile(join(packPath, 'evidence', 'fetch-log.jsonl'), 'utf8'),
    ]);
    await build({ packPath, all: true });
    const afterFiles = await Promise.all([
      readFile(join(packPath, 'sections', '01-test', 'claims.jsonl'), 'utf8'),
      readFile(join(packPath, 'sections', '01-test', 'contradictions.jsonl'), 'utf8'),
      readFile(join(packPath, 'sections', '01-test', 'sources.jsonl'), 'utf8'),
      readFile(join(packPath, 'sections', '01-test', 'claim-reviews.jsonl'), 'utf8'),
      readFile(join(packPath, 'audits', '01-test-findings.jsonl'), 'utf8'),
      readFile(join(packPath, 'audits', '01-test-gate.json'), 'utf8'),
      readFile(join(packPath, 'evidence', 'fetch-log.jsonl'), 'utf8'),
    ]);
    for (let i = 0; i < beforeFiles.length; i += 1) {
      expect(afterFiles[i], `artifact ${i}`).toBe(beforeFiles[i]);
    }
  });

  it('is idempotent — rebuilding produces the same row counts', async () => {
    await fixture({
      sources: [{ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' }],
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', source_ids: ['src_aaaaaaaaaaaa'] }],
    });
    const a = await build({ packPath, all: true });
    const b = await build({ packPath, all: true });
    expect(b.sources).toBe(a.sources);
    expect(b.claims).toBe(a.claims);
    expect(b.sectionsIndexed).toBe(a.sectionsIndexed);
  });

  it('handles a section with no claims/contradictions/review honestly', async () => {
    await fixture({
      sources: [{ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' }],
    });
    const summary = await build({ packPath, all: true });
    expect(summary.claims).toBe(0);
    expect(summary.contradictions).toBe(0);
    expect(summary.reviewFindings).toBe(0);
  });

  it('refuses to build when pack does not exist', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'research-os-indexer-empty-'));
    try {
      await expect(build({ packPath: empty, all: true })).rejects.toBeInstanceOf(PackNotFoundError);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('fails loudly on malformed JSONL (zod validation)', async () => {
    await fixture({});
    await writeFile(
      join(packPath, 'sections', '01-test', 'claims.jsonl'),
      '{"not_a_claim": true}\n',
      'utf8',
    );
    await expect(build({ packPath, all: true })).rejects.toThrow();
  });

  it('clears stale rows for a section when re-indexed with a smaller artifact set', async () => {
    await fixture({
      sources: [{ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' }],
      claims: [
        { claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', source_ids: ['src_aaaaaaaaaaaa'] },
        { claim_id: 'clm_aaaaaaaaaaaa_heuristic_2', source_ids: ['src_aaaaaaaaaaaa'] },
      ],
    });
    let summary = await build({ packPath, all: true });
    expect(summary.claims).toBe(2);

    // Rewrite claims.jsonl with only one claim
    await writeFile(
      join(packPath, 'sections', '01-test', 'claims.jsonl'),
      JSON.stringify({
        claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
        section_id: '01-test',
        source_ids: ['src_aaaaaaaaaaaa'],
        source_hashes: ['a'.repeat(64)],
        asserts: 'something',
        scope: 'narrow',
        not: 'broad',
        evidence_excerpt: 'literal evidence text',
        evidence_location: null,
        confidence: 'low',
        extractor: 'heuristic',
        extraction_method: 'heuristic_key_point',
        created_at: '2026-05-06T22:00:00.000Z',
        review_state: 'candidate',
      }) + '\n',
      'utf8',
    );
    summary = await build({ packPath, all: true });
    expect(summary.claims).toBe(1);
  });
});
