/**
 * v0.7.1 — gate honors effective publisher / source_type via the override ledger.
 *
 * Regression target: src/gates/checks/source-floor.ts previously read
 * card.publisher / card.source_type directly. Now it consults
 * getEffectivePublisher / getEffectiveSourceType so operator-applied
 * source-card overrides (via `source-card audit --apply`) flow through to
 * min_independent_publishers / primary_sources_required.
 *
 * Backward compat is also asserted: an existing fixture WITHOUT an override
 * ledger produces the same gate result before and after the fix.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import { readFile } from 'node:fs/promises';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { gate } from '../src/gates/index.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';
import {
  checkSourceFloor,
} from '../src/gates/checks/index.js';
import type { GateInput } from '../src/gates/types.js';
import type { SourceCard } from '../src/sources/schema.js';
import type { SourceCardOverride } from '../src/sources/source-card-overrides-schema.js';

let workDir: string;
let packPath: string;

function makeSource(overrides: Partial<SourceCard>): SourceCard {
  return {
    source_id: 'src_aaaaaaaaaaaa',
    receipt_id: 'rcpt_aaaaaaaaaaaa_1',
    section_id: '01-test',
    url: 'https://example.com/x',
    final_url: 'https://example.com/x',
    fetched_at: '2026-05-06T22:00:00.000Z',
    publisher: 'Example Pub',
    published_at: '2025-12-01T00:00:00.000Z',
    title: 'A',
    source_type: 'secondary',
    relevance: 'unknown',
    key_points: [],
    limitations: [],
    asserts: 'A',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-06T22:00:00.000Z',
    ...overrides,
  };
}

function makeOverride(p: Partial<SourceCardOverride> & { source_id: string; url: string }): SourceCardOverride {
  return {
    source_id: p.source_id,
    url: p.url,
    reason: 'test override',
    operator: 'test-operator',
    created_at: '2026-05-11T10:00:00.000Z',
    pack_version: '0.7.1',
    ...p,
  } as SourceCardOverride;
}

function makeResearchWithMin(minPublishers: number) {
  return ResearchYamlSchema.parse({
    research_os_version: '0.1.0',
    created_at: '2026-05-06T22:00:00.000Z',
    topic: 'How does effective-publisher gate behave?',
    sections: [
      {
        id: '01-test',
        purpose: 'Probe',
        max_time_minutes: 45,
        min_sources: 1,
        primary_sources_required: 0,
        contradictions_required: false,
        status: 'draft',
      },
    ],
    gates: {
      source_floor: {
        min_sources: 1,
        min_independent_publishers: minPublishers,
        primary_sources_required: 0,
        primary_source_waiver_allowed: true,
      },
    },
  });
}

function makeInput(overrides: Partial<GateInput>): GateInput {
  const research = overrides.research ?? makeResearchWithMin(4);
  return {
    research,
    section: research.sections[0]!,
    claims: overrides.claims ?? [],
    candidateClaims: overrides.candidateClaims ?? overrides.claims ?? [],
    sources: overrides.sources ?? [],
    receipts: overrides.receipts ?? [],
    contradictions: overrides.contradictions ?? [],
    claimReviews: overrides.claimReviews ?? [],
    overrides: overrides.overrides,
  };
}

// ── Unit-level: checkSourceFloor with effective publisher ────────────────────

describe('checkSourceFloor — effective publisher (unit)', () => {
  it('reproduces the fresh-pack failure shape: 3 cards with null publisher + 1 with raw publisher, gate FAILS at min=4', () => {
    const sources: SourceCard[] = [
      makeSource({ source_id: 'src_aaaaaaaaaaaa', publisher: null, url: 'https://dvc.org/' }),
      makeSource({ source_id: 'src_bbbbbbbbbbbb', publisher: null, url: 'https://the-turing-way.netlify.app/' }),
      makeSource({ source_id: 'src_cccccccccccc', publisher: null, url: 'https://arxiv.org/abs/2001.04451' }),
      makeSource({ source_id: 'src_dddddddddddd', publisher: 'W3C', url: 'https://www.w3.org/TR/prov-overview/' }),
    ];
    const result = checkSourceFloor(makeInput({ sources, research: makeResearchWithMin(4) }));
    const pub = result.find((r) => r.check === 'min_independent_publishers');
    expect(pub?.status).toBe('fail');
    expect(pub?.detail).toContain('1 independent publisher(s)');
  });

  it('with the same 4 cards + 3 publisher overrides, gate PASSES at min=4 (override-aware count = 4)', () => {
    const sources: SourceCard[] = [
      makeSource({ source_id: 'src_aaaaaaaaaaaa', publisher: null, url: 'https://dvc.org/' }),
      makeSource({ source_id: 'src_bbbbbbbbbbbb', publisher: null, url: 'https://the-turing-way.netlify.app/' }),
      makeSource({ source_id: 'src_cccccccccccc', publisher: null, url: 'https://arxiv.org/abs/2001.04451' }),
      makeSource({ source_id: 'src_dddddddddddd', publisher: 'W3C', url: 'https://www.w3.org/TR/prov-overview/' }),
    ];
    const ledger: SourceCardOverride[] = [
      makeOverride({ source_id: 'src_aaaaaaaaaaaa', url: 'https://dvc.org/', new_publisher: 'DVC' }),
      makeOverride({ source_id: 'src_bbbbbbbbbbbb', url: 'https://the-turing-way.netlify.app/', new_publisher: 'The Turing Way' }),
      makeOverride({ source_id: 'src_cccccccccccc', url: 'https://arxiv.org/abs/2001.04451', new_publisher: 'arXiv.org' }),
    ];
    const result = checkSourceFloor(
      makeInput({ sources, overrides: ledger, research: makeResearchWithMin(4) }),
    );
    const pub = result.find((r) => r.check === 'min_independent_publishers');
    expect(pub?.status).toBe('pass');
    expect(pub?.detail).toContain('4 independent publisher(s)');
  });

  it('null-effective publishers (no raw, no override) remain excluded from the count', () => {
    const sources: SourceCard[] = [
      makeSource({ source_id: 'src_aaaaaaaaaaaa', publisher: null }),
      makeSource({ source_id: 'src_bbbbbbbbbbbb', publisher: null }),
      makeSource({ source_id: 'src_cccccccccccc', publisher: 'p1' }),
    ];
    const result = checkSourceFloor(makeInput({ sources, research: makeResearchWithMin(2) }));
    const pub = result.find((r) => r.check === 'min_independent_publishers');
    expect(pub?.status).toBe('fail');
    expect(pub?.detail).toContain('1 independent publisher(s)');
  });

  it('source-type override "docs → primary" is honored by primary_sources_required', () => {
    const research = ResearchYamlSchema.parse({
      research_os_version: '0.1.0',
      created_at: '2026-05-06T22:00:00.000Z',
      topic: 'How does source_type override flow through the gate?',
      sections: [
        {
          id: '01-test',
          purpose: 'Probe',
          max_time_minutes: 45,
          min_sources: 1,
          primary_sources_required: 1,
          contradictions_required: false,
          status: 'draft',
        },
      ],
      gates: {
        source_floor: {
          min_sources: 1,
          min_independent_publishers: 1,
          primary_sources_required: 1,
          primary_source_waiver_allowed: true,
        },
      },
    });
    const sources: SourceCard[] = [
      makeSource({
        source_id: 'src_aaaaaaaaaaaa',
        publisher: 'arXiv.org',
        source_type: 'docs',
        url: 'https://arxiv.org/abs/2001.04451',
      }),
    ];
    // Without overrides: primary_sources_required FAILS (0 primaries).
    const before = checkSourceFloor(makeInput({ sources, research }));
    expect(before.find((r) => r.check === 'primary_sources_required')?.status).toBe('fail');

    // With override docs → primary: PASSES.
    const ledger: SourceCardOverride[] = [
      makeOverride({
        source_id: 'src_aaaaaaaaaaaa',
        url: 'https://arxiv.org/abs/2001.04451',
        new_source_type: 'primary',
      }),
    ];
    const after = checkSourceFloor(makeInput({ sources, overrides: ledger, research }));
    expect(after.find((r) => r.check === 'primary_sources_required')?.status).toBe('pass');
  });

  it('backward-compat: empty/missing overrides ledger produces identical result to no-overrides input', () => {
    const sources: SourceCard[] = [
      makeSource({ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' }),
      makeSource({ source_id: 'src_bbbbbbbbbbbb', publisher: 'p2' }),
    ];
    const noLedger = checkSourceFloor(makeInput({ sources, research: makeResearchWithMin(2) }));
    const emptyLedger = checkSourceFloor(
      makeInput({ sources, overrides: [], research: makeResearchWithMin(2) }),
    );
    expect(noLedger).toEqual(emptyLedger);
  });
});

// ── Integration-level: gate() runner reads overrides from disk ───────────────

async function writeMinimalPack(): Promise<void> {
  const r = await init({
    topic: 'How does the gate read source-card overrides off disk?',
    outDir: workDir,
  });
  packPath = r.packPath;
  await sectionAdd({ id: '01-test', purpose: 'Probe override flow at the gate runner', packPath });

  // Raise min_independent_publishers to 4 on the pack-level gate config.
  const yamlPath = join(packPath, 'research.yaml');
  const research = ResearchYamlSchema.parse(yamlParse(await readFile(yamlPath, 'utf8')));
  research.gates.source_floor.min_sources = 1;
  research.gates.source_floor.min_independent_publishers = 4;
  research.gates.source_floor.primary_sources_required = 0;
  research.sections[0]!.min_sources = 1;
  research.sections[0]!.primary_sources_required = 0;
  await writeFile(yamlPath, yamlStringify(research, { lineWidth: 0 }), 'utf8');

  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  const writeCard = async (sid: string, publisher: string | null, url: string): Promise<void> => {
    await writeFile(
      join(cardDir, `${sid}.json`),
      JSON.stringify(
        makeSource({
          source_id: sid,
          publisher,
          url,
          final_url: url,
          receipt_id: `rcpt_${sid.replace(/^src_/, '')}_1`,
        }),
      ),
      'utf8',
    );
    await appendFile(
      join(packPath, 'evidence', 'fetch-log.jsonl'),
      JSON.stringify({
        receipt_id: `rcpt_${sid.replace(/^src_/, '')}_1`,
        source_id: sid,
        section_id: '01-test',
        requested_url: url,
        final_url: url,
        status: 200,
        status_text: 'OK',
        content_type: 'text/html',
        fetched_at: '2026-05-06T22:00:00.000Z',
        byte_count: 100,
        sha256: createHash('sha256').update(sid).digest('hex'),
        title: 'X',
        raw_text_path: `evidence/raw/${sid}.html`,
        fetch_outcome: 'ok',
        fetch_error: null,
        extraction_outcome: 'ok',
        extraction_extractor: 'heuristic',
        extraction_error: null,
      }) + '\n',
      'utf8',
    );
  };

  await writeCard('src_aaaaaaaaaaaa', null, 'https://dvc.org/');
  await writeCard('src_bbbbbbbbbbbb', null, 'https://the-turing-way.netlify.app/');
  await writeCard('src_cccccccccccc', null, 'https://arxiv.org/abs/2001.04451');
  await writeCard('src_dddddddddddd', 'W3C', 'https://www.w3.org/TR/prov-overview/');
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-eff-pub-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('gate (runner) — effective publisher via override ledger on disk', () => {
  it('without overrides file: gate counts 1 publisher and the min=4 check fails', async () => {
    await writeMinimalPack();
    const result = await gate({ sectionId: '01-test', packPath });
    const pub = result.gate_results.find((r) => r.check === 'min_independent_publishers');
    expect(pub?.status).toBe('fail');
    expect(pub?.detail).toContain('1 independent publisher(s)');
    expect(result.source_counts.independent_publishers).toBe(1);
  });

  it('with override ledger on disk: gate counts 4 publishers and PASSES', async () => {
    await writeMinimalPack();
    const ledger = [
      makeOverride({ source_id: 'src_aaaaaaaaaaaa', url: 'https://dvc.org/', new_publisher: 'DVC' }),
      makeOverride({
        source_id: 'src_bbbbbbbbbbbb',
        url: 'https://the-turing-way.netlify.app/',
        new_publisher: 'The Turing Way',
      }),
      makeOverride({
        source_id: 'src_cccccccccccc',
        url: 'https://arxiv.org/abs/2001.04451',
        new_publisher: 'arXiv.org',
      }),
    ];
    const ledgerPath = join(packPath, 'evidence', 'source-card-overrides.jsonl');
    await writeFile(
      ledgerPath,
      ledger.map((o) => JSON.stringify(o)).join('\n') + '\n',
      'utf8',
    );
    const result = await gate({ sectionId: '01-test', packPath });
    const pub = result.gate_results.find((r) => r.check === 'min_independent_publishers');
    expect(pub?.status).toBe('pass');
    expect(pub?.detail).toContain('4 independent publisher(s)');
    expect(result.source_counts.independent_publishers).toBe(4);
  });
});
