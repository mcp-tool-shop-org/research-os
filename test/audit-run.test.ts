import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { audit } from '../src/audit/index.js';
import { PackAuditPayloadSchema } from '../src/audit/schema.js';
import { PackNotFoundError } from '../src/errors.js';

let workDir: string;
let packPath: string;

interface Spec {
  source?: { source_id: string; publisher: string };
  claims?: Array<{ claim_id: string }>;
  reviews?: Array<{ claim_id: string; decision: string }>;
  withGate?: { synthesis_eligible: boolean };
}

async function makeFixture(spec: Spec) {
  const r = await init({ topic: 'How does the pack audit behave on full fixtures?', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: '01-test', purpose: 'probe', packPath });

  if (spec.source) {
    const cardDir = join(packPath, 'evidence', 'source-cards');
    await mkdir(cardDir, { recursive: true });
    const card = {
      source_id: spec.source.source_id,
      receipt_id: `rcpt_${spec.source.source_id.replace(/^src_/, '')}_1`,
      section_id: '01-test',
      url: 'https://example.com',
      final_url: 'https://example.com',
      fetched_at: '2026-05-06T22:00:00.000Z',
      publisher: spec.source.publisher,
      published_at: null,
      title: 'T',
      source_type: 'secondary',
      relevance: 'unknown',
      key_points: [],
      limitations: [],
      asserts: 'A',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-06T22:00:00.000Z',
    };
    await writeFile(join(cardDir, `${spec.source.source_id}.json`), JSON.stringify(card), 'utf8');
    await appendFile(
      join(packPath, 'sections', '01-test', 'sources.jsonl'),
      JSON.stringify({ source_id: spec.source.source_id, added_at: '2026-05-06T22:00:01.000Z' }) + '\n',
      'utf8',
    );
    await appendFile(
      join(packPath, 'evidence', 'fetch-log.jsonl'),
      JSON.stringify({
        receipt_id: `rcpt_${spec.source.source_id.replace(/^src_/, '')}_1`,
        source_id: spec.source.source_id,
        section_id: '01-test',
        requested_url: 'https://example.com',
        final_url: 'https://example.com',
        status: 200,
        status_text: 'OK',
        content_type: 'text/html',
        fetched_at: '2026-05-06T22:00:00.000Z',
        byte_count: 100,
        sha256: createHash('sha256').update(spec.source.source_id).digest('hex'),
        title: 'T',
        raw_text_path: null,
        fetch_outcome: 'ok',
        fetch_error: null,
        extraction_outcome: 'ok',
        extraction_extractor: 'heuristic',
        extraction_error: null,
      }) + '\n',
      'utf8',
    );
  }

  for (const c of spec.claims ?? []) {
    const claim = {
      claim_id: c.claim_id,
      section_id: '01-test',
      source_ids: [spec.source?.source_id ?? 'src_aaaaaaaaaaaa'],
      source_hashes: ['a'.repeat(64)],
      asserts: 'something',
      scope: 'narrow',
      not: 'broad',
      evidence_excerpt: 'literal',
      evidence_location: null,
      confidence: 'low',
      extractor: 'heuristic',
      extraction_method: 'heuristic_key_point',
      created_at: '2026-05-06T22:00:00.000Z',
      review_state: 'candidate',
    };
    await appendFile(join(packPath, 'sections', '01-test', 'claims.jsonl'), JSON.stringify(claim) + '\n', 'utf8');
  }

  for (const r of spec.reviews ?? []) {
    const review = {
      claim_id: r.claim_id,
      decision: r.decision,
      reason: 'test',
      finding_ids: [],
      reviewer: 'heuristic',
      review_method: 'heuristic_field_and_grounding_checks',
      created_at: '2026-05-06T22:00:01.000Z',
    };
    await appendFile(join(packPath, 'sections', '01-test', 'claim-reviews.jsonl'), JSON.stringify(review) + '\n', 'utf8');
  }

  if (spec.withGate) {
    const gate = {
      section_id: '01-test',
      verdict: spec.withGate.synthesis_eligible ? 'pass' : 'blocked',
      summary: 'mock',
      checked_at: '2026-05-06T22:00:00.000Z',
      synthesis_eligible: spec.withGate.synthesis_eligible,
      gate_results: [],
      failures: spec.withGate.synthesis_eligible ? [] : [{ family: 'source_floor', check: 'min_sources', status: 'fail', detail: 'too few', evidence: [], blocks_synthesis: true }],
      warnings: [],
      waivers_applied: [],
      blocking_reasons: spec.withGate.synthesis_eligible ? [] : ['source_floor.min_sources: too few'],
      claim_counts: { total: 1, candidate: 1, with_evidence_excerpt: 1, with_source_hashes: 1, with_scope: 1, with_not: 1, universal_scope_null: 0, orphans: 0 },
      source_counts: { total: 1, primary: 0, secondary: 1, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 1, failed_fetches: 0, section_primary: 0, section_independent_publishers: 1 },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 0 },
      scope_integrity_summary: { universal_claims: 0, scoped_claims: 1, with_not_constraint: 1, overgen_risks_total: 0, overgen_risks_blocking: 0 },
      next_actions: [],
    };
    await mkdir(join(packPath, 'audits'), { recursive: true });
    await writeFile(join(packPath, 'audits', '01-test-gate.json'), JSON.stringify(gate, null, 2), 'utf8');
  }
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-audit-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('audit (end-to-end)', () => {
  it('writes the full audit set (16 files) under audits/', async () => {
    await makeFixture({});
    const result = await audit({ packPath });
    expect(result.filesWritten).toHaveLength(16);
    for (const expected of [
      'audits/pack-audit.json',
      'audits/pack-audit.md',
      'audits/orphan-claims.json',
      'audits/orphan-claims.md',
      'audits/stale-sources.json',
      'audits/stale-sources.md',
      'audits/weak-sources.json',
      'audits/weak-sources.md',
      'audits/unresolved-contradictions.json',
      'audits/unresolved-contradictions.md',
      'audits/scope-widening-risks.json',
      'audits/scope-widening-risks.md',
      'audits/source-diversity-gaps.json',
      'audits/source-diversity-gaps.md',
      'audits/synthesis-readiness.json',
      'audits/synthesis-readiness.md',
    ]) {
      expect(existsSync(join(packPath, expected)), `missing ${expected}`).toBe(true);
    }
  });

  it('produces blocked when no section has a gate result on file', async () => {
    await makeFixture({});
    const result = await audit({ packPath });
    expect(result.verdict).toBe('blocked');
    expect(result.synthesisAllowed).toBe(false);
  });

  it('produces repair_required when one section is gate-blocked', async () => {
    await makeFixture({
      source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' },
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' }],
      reviews: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', decision: 'needs_source_repair' }],
      withGate: { synthesis_eligible: false },
    });
    const result = await audit({ packPath });
    expect(result.verdict).toBe('repair_required');
    expect(result.blockingReasons.some((b) => b.includes('source_floor'))).toBe(true);
  });

  it('produces ready_for_synthesis when every section is fully ready', async () => {
    await makeFixture({
      source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' },
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' }],
      reviews: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', decision: 'accepted_for_synthesis' }],
      withGate: { synthesis_eligible: true },
    });
    const result = await audit({ packPath });
    expect(result.verdict).toBe('ready_for_synthesis');
    expect(result.synthesisAllowed).toBe(true);
  });

  it('does not mutate canonical artifacts', async () => {
    await makeFixture({
      source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' },
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' }],
      reviews: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', decision: 'needs_source_repair' }],
      withGate: { synthesis_eligible: false },
    });
    const beforeFiles = await Promise.all([
      readFile(join(packPath, 'sections', '01-test', 'claims.jsonl'), 'utf8'),
      readFile(join(packPath, 'sections', '01-test', 'claim-reviews.jsonl'), 'utf8'),
      readFile(join(packPath, 'sections', '01-test', 'sources.jsonl'), 'utf8'),
      readFile(join(packPath, 'audits', '01-test-gate.json'), 'utf8'),
      readFile(join(packPath, 'evidence', 'fetch-log.jsonl'), 'utf8'),
    ]);
    await audit({ packPath });
    const afterFiles = await Promise.all([
      readFile(join(packPath, 'sections', '01-test', 'claims.jsonl'), 'utf8'),
      readFile(join(packPath, 'sections', '01-test', 'claim-reviews.jsonl'), 'utf8'),
      readFile(join(packPath, 'sections', '01-test', 'sources.jsonl'), 'utf8'),
      readFile(join(packPath, 'audits', '01-test-gate.json'), 'utf8'),
      readFile(join(packPath, 'evidence', 'fetch-log.jsonl'), 'utf8'),
    ]);
    for (let i = 0; i < beforeFiles.length; i += 1) {
      expect(afterFiles[i], `artifact ${i}`).toBe(beforeFiles[i]);
    }
  });

  it('is idempotent — re-running produces the same verdict and same row counts', async () => {
    await makeFixture({
      source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' },
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' }],
      reviews: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', decision: 'needs_source_repair' }],
      withGate: { synthesis_eligible: false },
    });
    const a = await audit({ packPath });
    const b = await audit({ packPath });
    expect(b.verdict).toBe(a.verdict);
    expect(b.orphans).toBe(a.orphans);
    expect(b.weakSources).toBe(a.weakSources);
    expect(b.staleSources).toBe(a.staleSources);
  });

  it('rejects when pack does not exist', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'research-os-audit-empty-'));
    try {
      await expect(audit({ packPath: empty })).rejects.toBeInstanceOf(PackNotFoundError);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('pack-audit.json schema-validates', async () => {
    await makeFixture({});
    await audit({ packPath });
    const json = JSON.parse(await readFile(join(packPath, 'audits', 'pack-audit.json'), 'utf8'));
    expect(() => PackAuditPayloadSchema.parse(json)).not.toThrow();
  });

  it('pack-audit.md preserves canonical artifact paths', async () => {
    await makeFixture({});
    await audit({ packPath });
    const md = await readFile(join(packPath, 'audits', 'pack-audit.md'), 'utf8');
    expect(md).toContain('audits/pack-audit.json');
    expect(md).toContain('audits/orphan-claims');
  });

  it('unresolved-contradictions.md discloses "not proof of completeness" when ledger is clean', async () => {
    await makeFixture({});
    await audit({ packPath });
    const md = await readFile(join(packPath, 'audits', 'unresolved-contradictions.md'), 'utf8');
    expect(md).toContain('not proof of completeness');
  });
});
