import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { handoff } from '../src/cowork/index.js';
import { CoworkHandoffPayloadSchema } from '../src/cowork/schema.js';
import { PackNotFoundError } from '../src/errors.js';

let workDir: string;
let packPath: string;

interface FixtureSpec {
  source?: { source_id: string; publisher: string; source_type?: string };
  claims?: Array<{ claim_id: string }>;
  reviews?: Array<{ claim_id: string; decision: string; created_at?: string }>;
  contradictions?: Array<{ severity?: 'low' | 'medium' | 'high' | 'blocking'; status?: 'unresolved' | 'reconciled' | 'preserved_deliberately' }>;
  gate?: { synthesis_eligible: boolean };
  promoteTo?: 'gated' | 'reviewed';
}

async function makeFixture(spec: FixtureSpec) {
  const r = await init({ topic: 'How does the cowork handoff render end-to-end?', outDir: workDir });
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
      source_type: spec.source.source_type ?? 'secondary',
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
    await appendFile(
      join(packPath, 'sections', '01-test', 'claims.jsonl'),
      JSON.stringify(claim) + '\n',
      'utf8',
    );
  }

  for (const r of spec.reviews ?? []) {
    const review = {
      claim_id: r.claim_id,
      decision: r.decision,
      reason: 'test',
      finding_ids: [],
      reviewer: 'heuristic',
      review_method: 'heuristic_field_and_grounding_checks',
      created_at: r.created_at ?? '2026-05-06T22:00:01.000Z',
    };
    await appendFile(
      join(packPath, 'sections', '01-test', 'claim-reviews.jsonl'),
      JSON.stringify(review) + '\n',
      'utf8',
    );
  }

  for (let i = 0; i < (spec.contradictions ?? []).length; i += 1) {
    const c = spec.contradictions![i]!;
    const contradiction = {
      contradiction_id: `cnt_${createHash('sha256').update(`c${i}`).digest('hex').slice(0, 12)}_heuristic`,
      section_id: '01-test',
      claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1', 'clm_bbbbbbbbbbbb_heuristic_1'],
      source_ids: [spec.source?.source_id ?? 'src_aaaaaaaaaaaa'],
      type: 'direct_conflict',
      summary: 'A vs B',
      scope_analysis: '',
      overlap_assessment: 'fully_overlapping',
      severity: c.severity ?? 'medium',
      confidence: 'low',
      detector: 'heuristic',
      detection_method: 'heuristic_similarity_negation',
      evidence: '',
      status: c.status ?? 'unresolved',
      created_at: '2026-05-06T22:00:00.000Z',
    };
    await appendFile(
      join(packPath, 'sections', '01-test', 'contradictions.jsonl'),
      JSON.stringify(contradiction) + '\n',
      'utf8',
    );
  }

  if (spec.gate) {
    const gate = {
      section_id: '01-test',
      verdict: spec.gate.synthesis_eligible ? 'pass' : 'blocked',
      summary: 'mock',
      checked_at: '2026-05-06T22:00:00.000Z',
      synthesis_eligible: spec.gate.synthesis_eligible,
      gate_results: [],
      failures: spec.gate.synthesis_eligible ? [] : [
        { family: 'source_floor', check: 'min_sources', status: 'fail', detail: 'too few', evidence: [], blocks_synthesis: true },
      ],
      warnings: [],
      waivers_applied: [],
      blocking_reasons: spec.gate.synthesis_eligible ? [] : ['source_floor.min_sources: too few'],
      claim_counts: { total: 0, candidate: 0, with_evidence_excerpt: 0, with_source_hashes: 0, with_scope: 0, with_not: 0, universal_scope_null: 0, orphans: 0 },
      source_counts: { total: 1, primary: 0, secondary: 1, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 1, failed_fetches: 0, section_primary: 0, section_independent_publishers: 1 },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 0 },
      scope_integrity_summary: { universal_claims: 0, scoped_claims: 0, with_not_constraint: 0, overgen_risks_total: 0, overgen_risks_blocking: 0 },
      next_actions: [],
    };
    await mkdir(join(packPath, 'audits'), { recursive: true });
    await writeFile(
      join(packPath, 'audits', '01-test-gate.json'),
      JSON.stringify(gate, null, 2),
      'utf8',
    );
  }
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-cowork-run-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('cowork.handoff (end-to-end)', () => {
  it('writes handoffs/cowork-handoff.json and handoffs/cowork-master.md', async () => {
    await makeFixture({});
    const result = await handoff({ packPath });
    expect(result.jsonPath.endsWith('cowork-handoff.json')).toBe(true);
    expect(result.markdownPath.endsWith('cowork-master.md')).toBe(true);
    const json = CoworkHandoffPayloadSchema.parse(
      JSON.parse(await readFile(result.jsonPath, 'utf8')),
    );
    expect(json.pack_id.length).toBeGreaterThan(0);
  });

  it('does not mutate the static template at prompts/cowork-master.md', async () => {
    await makeFixture({});
    const promptPath = join(packPath, 'prompts', 'cowork-master.md');
    const before = await readFile(promptPath, 'utf8');
    await handoff({ packPath });
    const after = await readFile(promptPath, 'utf8');
    expect(after).toBe(before);
  });

  it('reports mode=repair_required when no review has run on a section with claims', async () => {
    await makeFixture({
      source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' },
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' }],
      gate: { synthesis_eligible: false },
    });
    const result = await handoff({ packPath });
    expect(result.mode).toBe('repair_required');
    expect(result.synthesisAllowed).toBe(false);
  });

  it('reports mode=synthesis_ready when gate passes and every claim is accepted', async () => {
    await makeFixture({
      source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' },
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' }],
      reviews: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', decision: 'accepted_for_synthesis' }],
      gate: { synthesis_eligible: true },
    });
    const result = await handoff({ packPath });
    expect(result.mode).toBe('synthesis_ready');
    expect(result.synthesisAllowed).toBe(true);
  });

  it('reports mode=human_review_required for unresolved blocking contradictions', async () => {
    await makeFixture({
      source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' },
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' }],
      reviews: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', decision: 'accepted_for_synthesis' }],
      contradictions: [{ severity: 'blocking', status: 'unresolved' }],
      gate: { synthesis_eligible: true },
    });
    const result = await handoff({ packPath });
    expect(result.mode).toBe('human_review_required');
  });

  it('warns but does not fail when index is missing', async () => {
    await makeFixture({});
    const result = await handoff({ packPath });
    expect(result.warnings.some((w) => /index missing/i.test(w))).toBe(true);
  });

  it('preserves rejected claim ids separately from repair', async () => {
    await makeFixture({
      source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' },
      claims: [
        { claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' },
        { claim_id: 'clm_bbbbbbbbbbbb_heuristic_1' },
      ],
      reviews: [
        { claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', decision: 'rejected' },
        { claim_id: 'clm_bbbbbbbbbbbb_heuristic_1', decision: 'needs_source_repair' },
      ],
      gate: { synthesis_eligible: false },
    });
    const result = await handoff({ packPath });
    const json = JSON.parse(await readFile(result.jsonPath, 'utf8'));
    expect(json.blocked_claim_ids).toContain('clm_aaaaaaaaaaaa_heuristic_1');
    expect(json.repair_claim_ids).toContain('clm_bbbbbbbbbbbb_heuristic_1');
  });

  it('rejects when pack does not exist', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'research-os-cowork-empty-'));
    try {
      await expect(handoff({ packPath: empty })).rejects.toBeInstanceOf(PackNotFoundError);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('produces concrete recommended_next_actions referencing the right section', async () => {
    await makeFixture({
      source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' },
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' }],
      reviews: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', decision: 'needs_source_repair' }],
      gate: { synthesis_eligible: false },
    });
    const result = await handoff({ packPath });
    const json = JSON.parse(await readFile(result.jsonPath, 'utf8'));
    expect(json.recommended_next_actions.some((a: string) => a.includes('01-test'))).toBe(true);
  });
});
