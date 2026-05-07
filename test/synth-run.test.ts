import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { handoff as coworkHandoff } from '../src/cowork/index.js';
import { workspace } from '../src/synth/index.js';
import { CrossSectionMapSchema } from '../src/synth/schema.js';
import { HandoffNotFoundError, PackNotFoundError } from '../src/errors.js';

let workDir: string;
let packPath: string;

interface Spec {
  source?: { source_id: string; publisher: string };
  claims?: Array<{ claim_id: string; scope?: string | null }>;
  reviews?: Array<{ claim_id: string; decision: string }>;
  withGate?: { synthesis_eligible: boolean };
  promoteTo?: 'gated' | 'reviewed';
}

async function makeFixture(spec: Spec) {
  const r = await init({
    topic: 'How does the synthesis workspace behave end-to-end across modes?',
    outDir: workDir,
  });
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
        raw_text_path: `evidence/raw/${spec.source.source_id}.html`,
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
      scope: c.scope === undefined ? 'narrow' : c.scope,
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
      created_at: '2026-05-06T22:00:01.000Z',
    };
    await appendFile(
      join(packPath, 'sections', '01-test', 'claim-reviews.jsonl'),
      JSON.stringify(review) + '\n',
      'utf8',
    );
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
      source_counts: { total: 1, primary: 0, secondary: 1, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 1, failed_fetches: 0 },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 0 },
      scope_integrity_summary: { universal_claims: 0, scoped_claims: 1, with_not_constraint: 1, overgen_risks_total: 0, overgen_risks_blocking: 0 },
      next_actions: [],
    };
    await mkdir(join(packPath, 'audits'), { recursive: true });
    await writeFile(join(packPath, 'audits', '01-test-gate.json'), JSON.stringify(gate, null, 2), 'utf8');
  }

  if (spec.promoteTo) {
    const yamlPath = join(packPath, 'research.yaml');
    const text = await readFile(yamlPath, 'utf8');
    const { parse, stringify } = await import('yaml');
    const { ResearchYamlSchema } = await import('../src/intake/schema.js');
    const research = ResearchYamlSchema.parse(parse(text));
    research.sections[0]!.status = spec.promoteTo;
    await writeFile(yamlPath, stringify(research, { lineWidth: 0 }), 'utf8');
  }
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-synth-run-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('synth.workspace (end-to-end)', () => {
  it('refuses when handoff mode is repair_required', async () => {
    await makeFixture({
      source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' },
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' }],
      reviews: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', decision: 'needs_source_repair' }],
      withGate: { synthesis_eligible: false },
    });
    await coworkHandoff({ packPath });
    const result = await workspace({ packPath });
    expect(result.refused).toBe(true);
    expect(result.mode).toBe('repair_required');
    expect(result.refusalReason).toContain('repair_required');
    expect(existsSync(join(packPath, 'synthesis', 'cross-section-map.json'))).toBe(false);
    expect(existsSync(join(packPath, 'synthesis', 'final-report.md'))).toBe(false);
  });

  it('refuses when handoff is missing', async () => {
    await makeFixture({});
    await expect(workspace({ packPath })).rejects.toBeInstanceOf(HandoffNotFoundError);
  });

  it('rejects when pack does not exist', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'research-os-synth-empty-'));
    try {
      await expect(workspace({ packPath: empty })).rejects.toBeInstanceOf(PackNotFoundError);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('creates the workspace when handoff mode is synthesis_ready', async () => {
    await makeFixture({
      source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' },
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' }],
      reviews: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', decision: 'accepted_for_synthesis' }],
      withGate: { synthesis_eligible: true },
      promoteTo: 'gated',
    });
    await coworkHandoff({ packPath });
    const result = await workspace({ packPath });
    expect(result.refused).toBe(false);
    expect(result.mode).toBe('synthesis_ready');
    expect(result.acceptedClaims).toBe(1);
    expect(existsSync(join(packPath, 'synthesis', 'cross-section-map.json'))).toBe(true);
    expect(existsSync(join(packPath, 'synthesis', 'cross-section-map.md'))).toBe(true);
    expect(existsSync(join(packPath, 'synthesis', 'decision-brief.md'))).toBe(true);
    expect(existsSync(join(packPath, 'synthesis', 'working-report.md'))).toBe(true);
    expect(existsSync(join(packPath, 'synthesis', 'final-report.md'))).toBe(true);

    const map = CrossSectionMapSchema.parse(
      JSON.parse(await readFile(join(packPath, 'synthesis', 'cross-section-map.json'), 'utf8')),
    );
    expect(map.accepted_claim_ids).toContain('clm_aaaaaaaaaaaa_heuristic_1');
  });

  it('does not mutate the handoff file', async () => {
    await makeFixture({
      source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' },
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' }],
      reviews: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', decision: 'accepted_for_synthesis' }],
      withGate: { synthesis_eligible: true },
      promoteTo: 'gated',
    });
    await coworkHandoff({ packPath });
    const handoffPath = join(packPath, 'handoffs', 'cowork-handoff.json');
    const before = await readFile(handoffPath, 'utf8');
    await workspace({ packPath });
    const after = await readFile(handoffPath, 'utf8');
    expect(after).toBe(before);
  });

  it('does not mutate claims.jsonl', async () => {
    await makeFixture({
      source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' },
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' }],
      reviews: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', decision: 'accepted_for_synthesis' }],
      withGate: { synthesis_eligible: true },
      promoteTo: 'gated',
    });
    await coworkHandoff({ packPath });
    const claimsPath = join(packPath, 'sections', '01-test', 'claims.jsonl');
    const before = await readFile(claimsPath, 'utf8');
    await workspace({ packPath });
    const after = await readFile(claimsPath, 'utf8');
    expect(after).toBe(before);
  });

  it('preserves Cowork drafts on re-run (does not overwrite working-report.md if present)', async () => {
    await makeFixture({
      source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' },
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' }],
      reviews: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', decision: 'accepted_for_synthesis' }],
      withGate: { synthesis_eligible: true },
      promoteTo: 'gated',
    });
    await coworkHandoff({ packPath });
    await workspace({ packPath });
    // Cowork modifies the working-report
    const workingPath = join(packPath, 'synthesis', 'working-report.md');
    await writeFile(workingPath, '# Working Report\n\nCowork added this content.\n', 'utf8');
    // Re-run workspace
    await workspace({ packPath });
    const after = await readFile(workingPath, 'utf8');
    expect(after).toContain('Cowork added this content');
  });

  it('regenerates cross-section-map.* on every run', async () => {
    await makeFixture({
      source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' },
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' }],
      reviews: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', decision: 'accepted_for_synthesis' }],
      withGate: { synthesis_eligible: true },
      promoteTo: 'gated',
    });
    await coworkHandoff({ packPath });
    await workspace({ packPath });
    const mapPath = join(packPath, 'synthesis', 'cross-section-map.json');
    const beforeJson = JSON.parse(await readFile(mapPath, 'utf8'));
    // Manually corrupt the map
    await writeFile(mapPath, '{"corrupted": true}', 'utf8');
    await workspace({ packPath });
    const afterJson = JSON.parse(await readFile(mapPath, 'utf8'));
    expect(afterJson.corrupted).toBeUndefined();
    expect(afterJson.pack_id).toBe(beforeJson.pack_id);
    expect(afterJson.accepted_claim_ids).toEqual(beforeJson.accepted_claim_ids);
  });

  it('rendered markdown carries enforced citation guardrails on writable files', async () => {
    await makeFixture({
      source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' },
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' }],
      reviews: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', decision: 'accepted_for_synthesis' }],
      withGate: { synthesis_eligible: true },
      promoteTo: 'gated',
    });
    await coworkHandoff({ packPath });
    await workspace({ packPath });
    const decisionBrief = await readFile(join(packPath, 'synthesis', 'decision-brief.md'), 'utf8');
    expect(decisionBrief).toContain('Cite only `claim_id`');
    expect(decisionBrief).toContain('Do not flatten unresolved contradictions');
    expect(decisionBrief).toContain('Do not widen any claim');

    const finalReport = await readFile(join(packPath, 'synthesis', 'final-report.md'), 'utf8');
    expect(finalReport).toContain('cannot be considered complete until the freeze step');
  });

  it('cross-section-map.md lists accepted claims and shared sources', async () => {
    await makeFixture({
      source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' },
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' }],
      reviews: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', decision: 'accepted_for_synthesis' }],
      withGate: { synthesis_eligible: true },
      promoteTo: 'gated',
    });
    await coworkHandoff({ packPath });
    await workspace({ packPath });
    const md = await readFile(join(packPath, 'synthesis', 'cross-section-map.md'), 'utf8');
    expect(md).toContain('# Cross-Section Map');
    expect(md).toContain('clm_aaaaaaaaaaaa_heuristic_1');
    expect(md).toContain('Accepted claims by section');
  });
});
