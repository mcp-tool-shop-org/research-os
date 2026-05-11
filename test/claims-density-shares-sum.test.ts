import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { auditDensity } from '../src/claims/index.js';

let workDir: string;
let packPath: string;

interface FixtureSource {
  source_id: string;
  publisher?: string | null;
  title?: string;
  raw_text: string;
}
interface FixtureClaim {
  claim_id: string;
  source_ids: string[];
  asserts: string;
  scope?: string | null;
  not?: string | null;
}

async function makeFixture(
  sources: FixtureSource[],
  claims: FixtureClaim[],
): Promise<void> {
  const result = await init({ topic: 'Density share-sum fixture pack', outDir: workDir });
  packPath = result.packPath;
  await sectionAdd({ id: '01-test', purpose: 'Density audit share-sum', packPath });

  await mkdir(join(packPath, 'evidence', 'source-cards'), { recursive: true });
  await mkdir(join(packPath, 'evidence', 'raw'), { recursive: true });
  for (const s of sources) {
    const card = {
      source_id: s.source_id,
      receipt_id: `rcpt_${s.source_id.replace(/^src_/, '')}_1700000000000`,
      section_id: '01-test',
      url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      fetched_at: '2026-05-06T22:00:00.000Z',
      publisher: s.publisher ?? 'p1',
      published_at: null,
      title: s.title ?? 'Generic source title',
      source_type: 'secondary',
      relevance: 'unknown',
      key_points: [],
      limitations: [],
      asserts: 'Source asserts something.',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-06T22:00:00.000Z',
    };
    await writeFile(
      join(packPath, 'evidence', 'source-cards', `${s.source_id}.json`),
      JSON.stringify(card),
      'utf8',
    );
    await writeFile(
      join(packPath, 'evidence', 'raw', `${s.source_id}.html`),
      s.raw_text,
      'utf8',
    );
    const receipt = {
      receipt_id: `rcpt_${s.source_id.replace(/^src_/, '')}_1700000000000`,
      source_id: s.source_id,
      section_id: '01-test',
      requested_url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      status: 200,
      status_text: 'OK',
      content_type: 'text/html',
      fetched_at: '2026-05-06T22:00:00.000Z',
      byte_count: s.raw_text.length,
      sha256: 'a'.repeat(64),
      title: s.title ?? 'Generic source title',
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
  for (const c of claims) {
    const claim = {
      claim_id: c.claim_id,
      section_id: '01-test',
      source_ids: c.source_ids,
      source_hashes: c.source_ids.map(() => 'a'.repeat(64)),
      asserts: c.asserts,
      scope: c.scope ?? null,
      not: c.not ?? null,
      evidence_excerpt_ids: [],
      evidence_excerpt: 'literal text',
      evidence_location: null,
      confidence: 'low',
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
  }
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-density-shares-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

// B-005 regression: share_of_section is now share of total claim-source
// attributions (not unique claim count). With multi-source claims, per-source
// shares must sum to exactly 1.0 ± epsilon.
describe('auditDensity — share_of_section sums to 1.0 (B-005)', () => {
  it('sums to 1.0 ± 1e-9 across sources when claims have multiple source_ids', async () => {
    const rawA = Array.from({ length: 500 }, (_, i) => `wa${i}`).join(' ');
    const rawB = Array.from({ length: 500 }, (_, i) => `wb${i}`).join(' ');
    const rawC = Array.from({ length: 500 }, (_, i) => `wc${i}`).join(' ');
    await makeFixture(
      [
        { source_id: 'src_aaaaaaaaaaaa', raw_text: rawA },
        { source_id: 'src_bbbbbbbbbbbb', raw_text: rawB },
        { source_id: 'src_cccccccccccc', raw_text: rawC },
      ],
      [
        // multi-source: cites A + B
        {
          claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
          source_ids: ['src_aaaaaaaaaaaa', 'src_bbbbbbbbbbbb'],
          asserts: 'multi-source claim 1',
        },
        // multi-source: cites B + C
        {
          claim_id: 'clm_bbbbbbbbbbbb_ollama_intern_1',
          source_ids: ['src_bbbbbbbbbbbb', 'src_cccccccccccc'],
          asserts: 'multi-source claim 2',
        },
        // single-source: cites A only
        {
          claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_2',
          source_ids: ['src_aaaaaaaaaaaa'],
          asserts: 'single-source claim 3',
        },
        // single-source: cites C only
        {
          claim_id: 'clm_cccccccccccc_ollama_intern_1',
          source_ids: ['src_cccccccccccc'],
          asserts: 'single-source claim 4',
        },
      ],
    );

    const { audit } = await auditDensity({ sectionId: '01-test', packPath });
    expect(audit.per_source).toHaveLength(3);
    const sum = audit.per_source.reduce((acc, s) => acc + s.share_of_section, 0);
    expect(sum).toBeCloseTo(1.0, 9);

    // Sanity: total attributions = 2+2+1+1 = 6.
    // A appears on claims 1, 3 → 2 attributions → 2/6 ≈ 0.333
    // B appears on claims 1, 2 → 2 attributions → 2/6 ≈ 0.333
    // C appears on claims 2, 4 → 2 attributions → 2/6 ≈ 0.333
    for (const s of audit.per_source) {
      expect(s.share_of_section).toBeCloseTo(2 / 6, 9);
    }
  });

  it('returns 0 share when no claims have any source_ids (defensive)', async () => {
    await makeFixture([], []);
    const { audit } = await auditDensity({ sectionId: '01-test', packPath });
    expect(audit.per_source).toEqual([]);
  });

  it('single-source claims: shares still sum to 1.0', async () => {
    const rawA = Array.from({ length: 100 }, (_, i) => `wa${i}`).join(' ');
    const rawB = Array.from({ length: 100 }, (_, i) => `wb${i}`).join(' ');
    await makeFixture(
      [
        { source_id: 'src_aaaaaaaaaaaa', raw_text: rawA },
        { source_id: 'src_bbbbbbbbbbbb', raw_text: rawB },
      ],
      [
        {
          claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
          source_ids: ['src_aaaaaaaaaaaa'],
          asserts: 'A1',
        },
        {
          claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_2',
          source_ids: ['src_aaaaaaaaaaaa'],
          asserts: 'A2',
        },
        {
          claim_id: 'clm_bbbbbbbbbbbb_ollama_intern_1',
          source_ids: ['src_bbbbbbbbbbbb'],
          asserts: 'B1',
        },
      ],
    );
    const { audit } = await auditDensity({ sectionId: '01-test', packPath });
    const sum = audit.per_source.reduce((acc, s) => acc + s.share_of_section, 0);
    expect(sum).toBeCloseTo(1.0, 9);
  });
});
