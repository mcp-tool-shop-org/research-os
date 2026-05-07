import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { gate } from '../src/gates/index.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';
import { SectionGateResultSchema } from '../src/gates/schema.js';
import { PackNotFoundError, SectionNotFoundError } from '../src/errors.js';

let workDir: string;
let packPath: string;

interface FixtureSpec {
  sources?: Array<{
    source_id: string;
    publisher: string;
    source_type?: 'primary' | 'secondary' | 'forum' | 'benchmark' | 'docs' | 'unknown';
    published_at?: string | null;
  }>;
  receipts?: Array<{
    source_id: string;
    fetch_outcome?: 'ok' | 'http_error' | 'network_error';
    sha256?: string;
  }>;
  claims?: Array<{
    claim_id: string;
    source_ids?: string[];
    source_hashes?: string[];
    scope?: string | null;
    not?: string | null;
    asserts?: string;
    review_state?: 'candidate' | 'rejected' | 'accepted';
  }>;
  contradictions?: Array<{
    contradiction_id: string;
    type?: 'direct_conflict' | 'overgeneralization_risk' | 'scope_conflict' | 'temporal_conflict' | 'definition_conflict' | 'evidence_conflict';
    severity?: 'low' | 'medium' | 'high' | 'blocking';
    status?: 'unresolved' | 'reconciled' | 'preserved_deliberately' | 'rejected';
    claim_ids?: string[];
  }>;
  claimReviews?: Array<{
    claim_id: string;
    decision?: 'accepted_for_synthesis' | 'rejected' | 'needs_scope_repair' | 'needs_source_repair' | 'needs_contradiction_mapping' | 'needs_human_review';
    created_at?: string;
  }>;
  patchResearch?: (yaml: ReturnType<typeof ResearchYamlSchema.parse>) => void;
}

async function makeFixture(spec: FixtureSpec) {
  const result = await init({
    topic: 'How does the gate engine handle complete fixtures?',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({
    id: '01-test',
    purpose: 'Probe gates',
    packPath,
  });

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
      published_at: s.published_at ?? '2025-12-01T00:00:00.000Z',
      title: 'Sample',
      source_type: s.source_type ?? 'secondary',
      relevance: 'unknown',
      key_points: [],
      limitations: [],
      asserts: 'Sample',
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
  }

  for (const r of spec.receipts ?? spec.sources ?? []) {
    const sid = 'source_id' in r ? r.source_id : (r as { source_id: string }).source_id;
    const fetchOutcome = ('fetch_outcome' in r ? r.fetch_outcome : null) ?? 'ok';
    const sha = ('sha256' in r ? r.sha256 : null) ?? createHash('sha256').update(sid).digest('hex');
    const receipt = {
      receipt_id: `rcpt_${sid.replace(/^src_/, '')}_1`,
      source_id: sid,
      section_id: '01-test',
      requested_url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      status: fetchOutcome === 'ok' ? 200 : 404,
      status_text: 'X',
      content_type: 'text/html',
      fetched_at: '2026-05-06T22:00:00.000Z',
      byte_count: 100,
      sha256: fetchOutcome === 'ok' ? sha : null,
      title: 'X',
      raw_text_path: fetchOutcome === 'ok' ? `evidence/raw/${sid}.html` : null,
      fetch_outcome: fetchOutcome,
      fetch_error: fetchOutcome === 'ok' ? null : 'mocked',
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
      source_hashes: c.source_hashes ?? ['a'.repeat(64)],
      asserts: c.asserts ?? 'something',
      scope: c.scope ?? 'narrow scope',
      not: c.not ?? 'broad scope',
      evidence_excerpt: 'literal text',
      evidence_location: null,
      confidence: 'low',
      extractor: 'heuristic',
      extraction_method: 'heuristic_key_point',
      created_at: '2026-05-06T22:00:00.000Z',
      review_state: c.review_state ?? 'candidate',
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
      claim_ids: c.claim_ids ?? ['clm_aaaaaaaaaaaa_heuristic_1', 'clm_bbbbbbbbbbbb_heuristic_1'],
      source_ids: ['src_aaaaaaaaaaaa'],
      type: c.type ?? 'direct_conflict',
      summary: 'mock',
      scope_analysis: '',
      overlap_assessment: 'partially_overlapping',
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

  for (const r of spec.claimReviews ?? []) {
    const review = {
      claim_id: r.claim_id,
      decision: r.decision ?? 'accepted_for_synthesis',
      reason: 'fixture',
      finding_ids: [],
      reviewer: 'heuristic',
      review_method: 'heuristic_key_point',
      created_at: r.created_at ?? '2026-05-06T22:00:00.000Z',
    };
    await appendFile(
      join(packPath, 'sections', '01-test', 'claim-reviews.jsonl'),
      JSON.stringify(review) + '\n',
      'utf8',
    );
  }

  if (spec.patchResearch) {
    const path = join(packPath, 'research.yaml');
    const research = ResearchYamlSchema.parse(yamlParse(await readFile(path, 'utf8')));
    spec.patchResearch(research);
    await writeFile(path, yamlStringify(research, { lineWidth: 0 }), 'utf8');
  }
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-gate-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('gate (end-to-end)', () => {
  it('produces a passing verdict when all gates pass and section becomes synthesis-eligible', async () => {
    await makeFixture({
      sources: Array.from({ length: 8 }, (_, i) => ({
        source_id: `src_${String(i).padStart(12, '0').replace(/[^a-f0-9]/g, '0')}`,
        publisher: `pub-${i % 4}`,
        source_type: i < 2 ? 'primary' : 'secondary',
      })),
      claims: [
        { claim_id: 'clm_000000000000_heuristic_1', source_ids: ['src_000000000000'] },
        { claim_id: 'clm_000000000000_heuristic_2', source_ids: ['src_000000000001'], not: 'broad scope' },
        { claim_id: 'clm_000000000001_heuristic_1', source_ids: ['src_000000000001'] },
      ],
      claimReviews: [
        { claim_id: 'clm_000000000000_heuristic_1', decision: 'accepted_for_synthesis' },
        { claim_id: 'clm_000000000000_heuristic_2', decision: 'accepted_for_synthesis' },
        { claim_id: 'clm_000000000001_heuristic_1', decision: 'accepted_for_synthesis' },
      ],
      patchResearch: (r) => {
        r.gates.source_floor.min_sources = 4;
        r.gates.source_floor.min_independent_publishers = 2;
        r.gates.source_floor.primary_sources_required = 1;
        r.freshness.required = false;
        r.gates.freshness.required_for_current_topics = false;
      },
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.synthesis_eligible).toBe(true);
    expect(['pass', 'warn']).toContain(result.verdict);
    expect(result.failures).toHaveLength(0);
  });

  it('blocks on source floor failure', async () => {
    await makeFixture({
      sources: [
        { source_id: 'src_aaaaaaaaaaaa', publisher: 'p1', source_type: 'secondary' },
      ],
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', source_ids: ['src_aaaaaaaaaaaa'] }],
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.verdict).toBe('blocked');
    expect(result.synthesis_eligible).toBe(false);
    expect(result.blocking_reasons.some((r) => r.includes('min_sources'))).toBe(true);
  });

  it('applies a complete primary-source waiver and converts the failure', async () => {
    await makeFixture({
      sources: Array.from({ length: 8 }, (_, i) => ({
        source_id: `src_${String(i).padStart(12, '0').replace(/[^a-f0-9]/g, '0')}`,
        publisher: `pub-${i % 4}`,
        source_type: 'secondary',
      })),
      claims: [{ claim_id: 'clm_000000000000_heuristic_1', source_ids: ['src_000000000000'] }],
      patchResearch: (r) => {
        r.gates.source_floor.min_sources = 4;
        r.gates.source_floor.min_independent_publishers = 2;
        r.gates.source_floor.primary_sources_required = 2;
        r.primary_source_waiver = {
          status: 'granted',
          reason: 'Design-intent research without public primary sources.',
          compensating_controls: ['Adversarial review required.', 'Triple-source secondary corroboration.'],
        };
        r.freshness.required = false;
      },
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.waivers_applied).toHaveLength(1);
    const conv = result.gate_results.find((r) => r.check === 'primary_sources_required');
    expect(conv?.status).toBe('pass_with_waiver');
    expect(conv?.blocks_synthesis).toBe(false);
  });

  it('rejects waiver missing reason and lets the failure stand', async () => {
    await makeFixture({
      sources: Array.from({ length: 8 }, (_, i) => ({
        source_id: `src_${String(i).padStart(12, '0').replace(/[^a-f0-9]/g, '0')}`,
        publisher: `pub-${i}`,
        source_type: 'secondary',
      })),
      claims: [{ claim_id: 'clm_000000000000_heuristic_1', source_ids: ['src_000000000000'] }],
      patchResearch: (r) => {
        r.gates.source_floor.min_sources = 4;
        r.gates.source_floor.primary_sources_required = 2;
        r.primary_source_waiver = { status: 'granted', reason: '', compensating_controls: ['x'] };
        r.freshness.required = false;
      },
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.failures.some((f) => f.check === 'primary_source_waiver_reason_required')).toBe(true);
    expect(result.synthesis_eligible).toBe(false);
  });

  it('blocks on orphan claim', async () => {
    await makeFixture({
      sources: Array.from({ length: 4 }, (_, i) => ({
        source_id: `src_${String(i).padStart(12, '0').replace(/[^a-f0-9]/g, '0')}`,
        publisher: `pub-${i}`,
        source_type: i === 0 ? 'primary' : 'secondary',
      })),
      claims: [
        { claim_id: 'clm_000000000000_heuristic_1', source_ids: ['src_999999999999'] },
      ],
      patchResearch: (r) => {
        r.gates.source_floor.min_sources = 4;
        r.gates.source_floor.min_independent_publishers = 2;
        r.gates.source_floor.primary_sources_required = 1;
        r.freshness.required = false;
      },
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.synthesis_eligible).toBe(false);
    expect(result.failures.some((f) => f.check === 'no_orphan_claims')).toBe(true);
  });

  it('blocks on missing source_hashes', async () => {
    await makeFixture({
      sources: Array.from({ length: 4 }, (_, i) => ({
        source_id: `src_${String(i).padStart(12, '0').replace(/[^a-f0-9]/g, '0')}`,
        publisher: `pub-${i}`,
        source_type: i === 0 ? 'primary' : 'secondary',
      })),
      claims: [
        { claim_id: 'clm_000000000000_heuristic_1', source_ids: ['src_000000000000'], source_hashes: [] },
      ],
      patchResearch: (r) => {
        r.gates.source_floor.min_sources = 4;
        r.gates.source_floor.min_independent_publishers = 2;
        r.gates.source_floor.primary_sources_required = 1;
        r.freshness.required = false;
      },
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.failures.some((f) => f.check === 'source_hashes_present')).toBe(true);
    expect(result.synthesis_eligible).toBe(false);
  });

  it('blocks on high-severity unresolved overgeneralization_risk', async () => {
    await makeFixture({
      sources: Array.from({ length: 4 }, (_, i) => ({
        source_id: `src_${String(i).padStart(12, '0').replace(/[^a-f0-9]/g, '0')}`,
        publisher: `pub-${i}`,
        source_type: i === 0 ? 'primary' : 'secondary',
      })),
      claims: [
        { claim_id: 'clm_000000000000_heuristic_1', source_ids: ['src_000000000000'] },
        { claim_id: 'clm_000000000001_heuristic_1', source_ids: ['src_000000000001'] },
      ],
      contradictions: [
        {
          contradiction_id: 'cnt_111111111111_heuristic',
          type: 'overgeneralization_risk',
          severity: 'high',
          claim_ids: ['clm_000000000000_heuristic_1', 'clm_000000000001_heuristic_1'],
        },
      ],
      patchResearch: (r) => {
        r.gates.source_floor.min_sources = 4;
        r.gates.source_floor.min_independent_publishers = 2;
        r.gates.source_floor.primary_sources_required = 1;
        r.freshness.required = false;
      },
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.synthesis_eligible).toBe(false);
    expect(result.failures.some((f) => f.check === 'no_blocking_overgeneralization')).toBe(true);
  });

  it('warns on low-severity overgeneralization without blocking', async () => {
    await makeFixture({
      sources: Array.from({ length: 4 }, (_, i) => ({
        source_id: `src_${String(i).padStart(12, '0').replace(/[^a-f0-9]/g, '0')}`,
        publisher: `pub-${i}`,
        source_type: i === 0 ? 'primary' : 'secondary',
      })),
      claims: [
        { claim_id: 'clm_000000000000_heuristic_1', source_ids: ['src_000000000000'] },
        { claim_id: 'clm_000000000001_heuristic_1', source_ids: ['src_000000000001'] },
        { claim_id: 'clm_000000000002_heuristic_1', source_ids: ['src_000000000002'] },
      ],
      claimReviews: [
        { claim_id: 'clm_000000000000_heuristic_1', decision: 'accepted_for_synthesis' },
        { claim_id: 'clm_000000000001_heuristic_1', decision: 'accepted_for_synthesis' },
        { claim_id: 'clm_000000000002_heuristic_1', decision: 'accepted_for_synthesis' },
      ],
      contradictions: [
        {
          contradiction_id: 'cnt_222222222222_heuristic',
          type: 'overgeneralization_risk',
          severity: 'low',
          claim_ids: ['clm_000000000000_heuristic_1', 'clm_000000000001_heuristic_1'],
        },
      ],
      patchResearch: (r) => {
        r.gates.source_floor.min_sources = 4;
        r.gates.source_floor.min_independent_publishers = 2;
        r.gates.source_floor.primary_sources_required = 1;
        r.freshness.required = false;
      },
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.synthesis_eligible).toBe(true);
    expect(result.warnings.some((w) => w.check === 'low_severity_overgeneralization')).toBe(true);
  });

  it('writes audit json + md and updates section status to gated when synthesis-eligible', async () => {
    await makeFixture({
      sources: Array.from({ length: 4 }, (_, i) => ({
        source_id: `src_${String(i).padStart(12, '0').replace(/[^a-f0-9]/g, '0')}`,
        publisher: `pub-${i}`,
        source_type: i === 0 ? 'primary' : 'secondary',
      })),
      claims: [
        { claim_id: 'clm_000000000000_heuristic_1', source_ids: ['src_000000000000'] },
        { claim_id: 'clm_000000000001_heuristic_1', source_ids: ['src_000000000001'] },
        { claim_id: 'clm_000000000002_heuristic_1', source_ids: ['src_000000000002'] },
      ],
      claimReviews: [
        { claim_id: 'clm_000000000000_heuristic_1', decision: 'accepted_for_synthesis' },
        { claim_id: 'clm_000000000001_heuristic_1', decision: 'accepted_for_synthesis' },
        { claim_id: 'clm_000000000002_heuristic_1', decision: 'accepted_for_synthesis' },
      ],
      patchResearch: (r) => {
        r.gates.source_floor.min_sources = 4;
        r.gates.source_floor.min_independent_publishers = 2;
        r.gates.source_floor.primary_sources_required = 1;
        r.freshness.required = false;
      },
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.synthesis_eligible).toBe(true);

    const auditJson = await readFile(join(packPath, 'audits', '01-test-gate.json'), 'utf8');
    const parsed = SectionGateResultSchema.parse(JSON.parse(auditJson));
    expect(parsed.section_id).toBe('01-test');

    const md = await readFile(join(packPath, 'audits', '01-test-gate.md'), 'utf8');
    expect(md).toContain('Gate Result: 01-test');
    expect(md).toContain('Synthesis eligible:** yes');

    const updatedYaml = ResearchYamlSchema.parse(
      yamlParse(await readFile(join(packPath, 'research.yaml'), 'utf8')),
    );
    expect(updatedYaml.sections.find((s) => s.id === '01-test')?.status).toBe('gated');
  });

  it('does not promote section status when not synthesis-eligible', async () => {
    await makeFixture({
      sources: [{ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' }],
      claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', source_ids: ['src_aaaaaaaaaaaa'] }],
    });
    await gate({ sectionId: '01-test', packPath });
    const updatedYaml = ResearchYamlSchema.parse(
      yamlParse(await readFile(join(packPath, 'research.yaml'), 'utf8')),
    );
    expect(updatedYaml.sections.find((s) => s.id === '01-test')?.status).toBe('draft');
  });

  it('refuses malformed JSONL', async () => {
    await makeFixture({});
    await writeFile(
      join(packPath, 'sections', '01-test', 'claims.jsonl'),
      '{"not_a_claim": true}\n',
      'utf8',
    );
    await expect(gate({ sectionId: '01-test', packPath })).rejects.toThrow();
  });

  it('rejects when section is missing', async () => {
    await makeFixture({});
    await expect(gate({ sectionId: '99-not-real', packPath })).rejects.toBeInstanceOf(SectionNotFoundError);
  });

  it('rejects when pack is missing', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'research-os-gate-empty-'));
    try {
      await expect(gate({ sectionId: '01-test', packPath: empty })).rejects.toBeInstanceOf(PackNotFoundError);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // accepted_claim_floor — negative cases
  // All must produce synthesis_eligible=false with the floor violation message.
  // Waivers cannot bypass these failures.
  // -------------------------------------------------------------------------

  it('floor: 0 accepted claims, no waiver → synthesis_eligible=false', async () => {
    await makeFixture({
      sources: Array.from({ length: 4 }, (_, i) => ({
        source_id: `src_${String(i).padStart(12, '0').replace(/[^a-f0-9]/g, '0')}`,
        publisher: `pub-${i}`,
        source_type: i === 0 ? 'primary' : 'secondary',
      })),
      claims: [
        { claim_id: 'clm_000000000000_heuristic_1', source_ids: ['src_000000000000'] },
        { claim_id: 'clm_000000000001_heuristic_1', source_ids: ['src_000000000001'] },
        { claim_id: 'clm_000000000002_heuristic_1', source_ids: ['src_000000000002'] },
      ],
      claimReviews: [],
      patchResearch: (r) => {
        r.gates.source_floor.min_sources = 4;
        r.gates.source_floor.min_independent_publishers = 2;
        r.gates.source_floor.primary_sources_required = 1;
        r.freshness.required = false;
        r.gates.freshness.required_for_current_topics = false;
      },
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.synthesis_eligible).toBe(false);
    const floorCheck = result.gate_results.find((r) => r.check === 'min_accepted_claims_and_sources');
    expect(floorCheck?.status).toBe('fail');
    expect(floorCheck?.detail).toContain('Waivers cannot bypass evidence existence');
  });

  it('floor: 0 accepted claims, primary-source waiver active → synthesis_eligible=false', async () => {
    await makeFixture({
      sources: Array.from({ length: 4 }, (_, i) => ({
        source_id: `src_${String(i).padStart(12, '0').replace(/[^a-f0-9]/g, '0')}`,
        publisher: `pub-${i}`,
        source_type: 'secondary',
      })),
      claims: [
        { claim_id: 'clm_000000000000_heuristic_1', source_ids: ['src_000000000000'] },
        { claim_id: 'clm_000000000001_heuristic_1', source_ids: ['src_000000000001'] },
        { claim_id: 'clm_000000000002_heuristic_1', source_ids: ['src_000000000002'] },
      ],
      claimReviews: [],
      patchResearch: (r) => {
        r.gates.source_floor.min_sources = 4;
        r.gates.source_floor.min_independent_publishers = 2;
        r.gates.source_floor.primary_sources_required = 2;
        r.primary_source_waiver = {
          status: 'granted',
          reason: 'No primary sources available for this topic.',
          compensating_controls: ['Adversarial review required.'],
        };
        r.freshness.required = false;
        r.gates.freshness.required_for_current_topics = false;
      },
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.synthesis_eligible).toBe(false);
    const floorCheck = result.gate_results.find((r) => r.check === 'min_accepted_claims_and_sources');
    expect(floorCheck?.status).toBe('fail');
    expect(floorCheck?.detail).toContain('Waivers cannot bypass evidence existence');
  });

  it('floor: 1 accepted claim, primary-source waiver active → synthesis_eligible=false', async () => {
    await makeFixture({
      sources: Array.from({ length: 4 }, (_, i) => ({
        source_id: `src_${String(i).padStart(12, '0').replace(/[^a-f0-9]/g, '0')}`,
        publisher: `pub-${i}`,
        source_type: 'secondary',
      })),
      claims: [
        { claim_id: 'clm_000000000000_heuristic_1', source_ids: ['src_000000000000'] },
        { claim_id: 'clm_000000000001_heuristic_1', source_ids: ['src_000000000001'] },
        { claim_id: 'clm_000000000002_heuristic_1', source_ids: ['src_000000000002'] },
      ],
      claimReviews: [
        { claim_id: 'clm_000000000000_heuristic_1', decision: 'accepted_for_synthesis' },
      ],
      patchResearch: (r) => {
        r.gates.source_floor.min_sources = 4;
        r.gates.source_floor.min_independent_publishers = 2;
        r.gates.source_floor.primary_sources_required = 2;
        r.primary_source_waiver = {
          status: 'granted',
          reason: 'No primary sources available for this topic.',
          compensating_controls: ['Adversarial review required.'],
        };
        r.freshness.required = false;
        r.gates.freshness.required_for_current_topics = false;
      },
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.synthesis_eligible).toBe(false);
    const floorCheck = result.gate_results.find((r) => r.check === 'min_accepted_claims_and_sources');
    expect(floorCheck?.status).toBe('fail');
    expect(floorCheck?.detail).toContain('1 accepted claims from 1 sources');
    expect(floorCheck?.detail).toContain('Waivers cannot bypass evidence existence');
  });

  it('floor: 2 accepted claims, primary-source waiver active → synthesis_eligible=false', async () => {
    await makeFixture({
      sources: Array.from({ length: 4 }, (_, i) => ({
        source_id: `src_${String(i).padStart(12, '0').replace(/[^a-f0-9]/g, '0')}`,
        publisher: `pub-${i}`,
        source_type: 'secondary',
      })),
      claims: [
        { claim_id: 'clm_000000000000_heuristic_1', source_ids: ['src_000000000000'] },
        { claim_id: 'clm_000000000001_heuristic_1', source_ids: ['src_000000000001'] },
        { claim_id: 'clm_000000000002_heuristic_1', source_ids: ['src_000000000002'] },
      ],
      claimReviews: [
        { claim_id: 'clm_000000000000_heuristic_1', decision: 'accepted_for_synthesis' },
        { claim_id: 'clm_000000000001_heuristic_1', decision: 'accepted_for_synthesis' },
      ],
      patchResearch: (r) => {
        r.gates.source_floor.min_sources = 4;
        r.gates.source_floor.min_independent_publishers = 2;
        r.gates.source_floor.primary_sources_required = 2;
        r.primary_source_waiver = {
          status: 'granted',
          reason: 'No primary sources available for this topic.',
          compensating_controls: ['Adversarial review required.'],
        };
        r.freshness.required = false;
        r.gates.freshness.required_for_current_topics = false;
      },
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.synthesis_eligible).toBe(false);
    const floorCheck = result.gate_results.find((r) => r.check === 'min_accepted_claims_and_sources');
    expect(floorCheck?.status).toBe('fail');
    expect(floorCheck?.detail).toContain('2 accepted claims from 2 sources');
    expect(floorCheck?.detail).toContain('Waivers cannot bypass evidence existence');
  });

  it('floor: 3 accepted claims from single source, primary-source waiver active → synthesis_eligible=false', async () => {
    await makeFixture({
      sources: Array.from({ length: 4 }, (_, i) => ({
        source_id: `src_${String(i).padStart(12, '0').replace(/[^a-f0-9]/g, '0')}`,
        publisher: `pub-${i}`,
        source_type: 'secondary',
      })),
      claims: [
        { claim_id: 'clm_000000000000_heuristic_1', source_ids: ['src_000000000000'] },
        { claim_id: 'clm_000000000000_heuristic_2', source_ids: ['src_000000000000'] },
        { claim_id: 'clm_000000000000_heuristic_3', source_ids: ['src_000000000000'] },
      ],
      claimReviews: [
        { claim_id: 'clm_000000000000_heuristic_1', decision: 'accepted_for_synthesis' },
        { claim_id: 'clm_000000000000_heuristic_2', decision: 'accepted_for_synthesis' },
        { claim_id: 'clm_000000000000_heuristic_3', decision: 'accepted_for_synthesis' },
      ],
      patchResearch: (r) => {
        r.gates.source_floor.min_sources = 4;
        r.gates.source_floor.min_independent_publishers = 2;
        r.gates.source_floor.primary_sources_required = 2;
        r.primary_source_waiver = {
          status: 'granted',
          reason: 'No primary sources available for this topic.',
          compensating_controls: ['Adversarial review required.'],
        };
        r.freshness.required = false;
        r.gates.freshness.required_for_current_topics = false;
      },
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.synthesis_eligible).toBe(false);
    const floorCheck = result.gate_results.find((r) => r.check === 'min_accepted_claims_and_sources');
    expect(floorCheck?.status).toBe('fail');
    expect(floorCheck?.detail).toContain('3 accepted claims from 1 sources');
    expect(floorCheck?.detail).toContain('Waivers cannot bypass evidence existence');
  });

  // -------------------------------------------------------------------------
  // accepted_claim_floor — positive cases
  // All must produce synthesis_eligible=true with the floor passing.
  // -------------------------------------------------------------------------

  it('floor: 3 accepted claims from 2 sources, no waiver → synthesis_eligible=true', async () => {
    await makeFixture({
      sources: Array.from({ length: 4 }, (_, i) => ({
        source_id: `src_${String(i).padStart(12, '0').replace(/[^a-f0-9]/g, '0')}`,
        publisher: `pub-${i}`,
        source_type: i === 0 ? 'primary' : 'secondary',
      })),
      claims: [
        { claim_id: 'clm_000000000000_heuristic_1', source_ids: ['src_000000000000'] },
        { claim_id: 'clm_000000000000_heuristic_2', source_ids: ['src_000000000001'] },
        { claim_id: 'clm_000000000001_heuristic_1', source_ids: ['src_000000000001'] },
      ],
      claimReviews: [
        { claim_id: 'clm_000000000000_heuristic_1', decision: 'accepted_for_synthesis' },
        { claim_id: 'clm_000000000000_heuristic_2', decision: 'accepted_for_synthesis' },
        { claim_id: 'clm_000000000001_heuristic_1', decision: 'accepted_for_synthesis' },
      ],
      patchResearch: (r) => {
        r.gates.source_floor.min_sources = 4;
        r.gates.source_floor.min_independent_publishers = 2;
        r.gates.source_floor.primary_sources_required = 1;
        r.freshness.required = false;
        r.gates.freshness.required_for_current_topics = false;
      },
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.synthesis_eligible).toBe(true);
    const floorCheck = result.gate_results.find((r) => r.check === 'min_accepted_claims_and_sources');
    expect(floorCheck?.status).toBe('pass');
  });

  it('floor: 3 accepted claims from 2 sources, primary-source waiver active → synthesis_eligible=true', async () => {
    await makeFixture({
      sources: Array.from({ length: 4 }, (_, i) => ({
        source_id: `src_${String(i).padStart(12, '0').replace(/[^a-f0-9]/g, '0')}`,
        publisher: `pub-${i}`,
        source_type: 'secondary',
      })),
      claims: [
        { claim_id: 'clm_000000000000_heuristic_1', source_ids: ['src_000000000000'] },
        { claim_id: 'clm_000000000000_heuristic_2', source_ids: ['src_000000000001'] },
        { claim_id: 'clm_000000000001_heuristic_1', source_ids: ['src_000000000001'] },
      ],
      claimReviews: [
        { claim_id: 'clm_000000000000_heuristic_1', decision: 'accepted_for_synthesis' },
        { claim_id: 'clm_000000000000_heuristic_2', decision: 'accepted_for_synthesis' },
        { claim_id: 'clm_000000000001_heuristic_1', decision: 'accepted_for_synthesis' },
      ],
      patchResearch: (r) => {
        r.gates.source_floor.min_sources = 4;
        r.gates.source_floor.min_independent_publishers = 2;
        r.gates.source_floor.primary_sources_required = 2;
        r.primary_source_waiver = {
          status: 'granted',
          reason: 'No primary sources available for this topic.',
          compensating_controls: ['Adversarial review required.'],
        };
        r.freshness.required = false;
        r.gates.freshness.required_for_current_topics = false;
      },
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.synthesis_eligible).toBe(true);
    const floorCheck = result.gate_results.find((r) => r.check === 'min_accepted_claims_and_sources');
    expect(floorCheck?.status).toBe('pass');
  });

  it('floor: 21 accepted claims from 7 sources (Section 06 shape) → synthesis_eligible=true', async () => {
    const sources = Array.from({ length: 7 }, (_, i) => ({
      source_id: `src_${i.toString(16).padStart(12, '0')}`,
      publisher: `pub-${i % 5}`,
      source_type: i === 0 ? ('primary' as const) : ('secondary' as const),
    }));
    const claims = sources.flatMap((s) =>
      [1, 2, 3].map((n) => ({
        claim_id: `clm_${s.source_id.replace('src_', '')}_heuristic_${n}`,
        source_ids: [s.source_id],
      })),
    );
    const claimReviews = claims.map((c) => ({
      claim_id: c.claim_id,
      decision: 'accepted_for_synthesis' as const,
    }));
    await makeFixture({
      sources,
      claims,
      claimReviews,
      patchResearch: (r) => {
        r.gates.source_floor.min_sources = 7;
        r.gates.source_floor.min_independent_publishers = 4;
        r.gates.source_floor.primary_sources_required = 1;
        r.freshness.required = false;
        r.gates.freshness.required_for_current_topics = false;
      },
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.synthesis_eligible).toBe(true);
    const floorCheck = result.gate_results.find((r) => r.check === 'min_accepted_claims_and_sources');
    expect(floorCheck?.status).toBe('pass');
    expect(floorCheck?.detail).toContain('21 accepted claims from 7 distinct sources');
  });

  it('a clean section with no contradictions remains synthesis-eligible if other gates pass', async () => {
    await makeFixture({
      sources: Array.from({ length: 4 }, (_, i) => ({
        source_id: `src_${String(i).padStart(12, '0').replace(/[^a-f0-9]/g, '0')}`,
        publisher: `pub-${i}`,
        source_type: i === 0 ? 'primary' : 'secondary',
      })),
      claims: [
        { claim_id: 'clm_000000000000_heuristic_1', source_ids: ['src_000000000000'] },
        { claim_id: 'clm_000000000001_heuristic_1', source_ids: ['src_000000000001'] },
        { claim_id: 'clm_000000000002_heuristic_1', source_ids: ['src_000000000002'] },
      ],
      claimReviews: [
        { claim_id: 'clm_000000000000_heuristic_1', decision: 'accepted_for_synthesis' },
        { claim_id: 'clm_000000000001_heuristic_1', decision: 'accepted_for_synthesis' },
        { claim_id: 'clm_000000000002_heuristic_1', decision: 'accepted_for_synthesis' },
      ],
      contradictions: [],
      patchResearch: (r) => {
        r.gates.source_floor.min_sources = 4;
        r.gates.source_floor.min_independent_publishers = 2;
        r.gates.source_floor.primary_sources_required = 1;
        r.gates.contradiction.required = false;
        r.freshness.required = false;
      },
    });
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.synthesis_eligible).toBe(true);
  });
});
