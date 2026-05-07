import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { auditDensity } from '../src/claims/index.js';
import { ClaimDensityAuditSchema } from '../src/claims/density/schema.js';
import { PackNotFoundError, SectionNotFoundError } from '../src/errors.js';

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
  source_id: string;
  asserts: string;
  scope?: string | null;
  not?: string | null;
}

async function makeFixture(
  sources: FixtureSource[],
  claims: FixtureClaim[],
): Promise<void> {
  const result = await init({ topic: 'Density audit fixture pack', outDir: workDir });
  packPath = result.packPath;
  await sectionAdd({ id: '01-test', purpose: 'Density audit', packPath });

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
      source_ids: [c.source_id],
      source_hashes: ['a'.repeat(64)],
      asserts: c.asserts,
      scope: c.scope ?? null,
      not: c.not ?? null,
      evidence_excerpt_ids: ['ex_' + c.source_id.replace(/^src_/, '') + '_001'],
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
  workDir = await mkdtemp(join(tmpdir(), 'research-os-density-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('auditDensity', () => {
  it('rejects when pack does not exist', async () => {
    await expect(
      auditDensity({ sectionId: '01-test', packPath: join(workDir, 'nope') }),
    ).rejects.toBeInstanceOf(PackNotFoundError);
  });

  it('rejects when section does not exist', async () => {
    await makeFixture([], []);
    await expect(
      auditDensity({ sectionId: '99-no', packPath }),
    ).rejects.toBeInstanceOf(SectionNotFoundError);
  });

  it('returns an empty-but-valid audit when there are no claims', async () => {
    await makeFixture([], []);
    const { audit } = await auditDensity({ sectionId: '01-test', packPath });
    expect(audit.candidate_claim_count).toBe(0);
    expect(audit.per_source).toEqual([]);
    expect(audit.flags).toEqual([]);
    expect(audit.near_duplicate_clusters).toEqual([]);
    expect(() => ClaimDensityAuditSchema.parse(audit)).not.toThrow();
  });

  it('computes claims per 1k source words from raw text', async () => {
    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`).join(' ');
    await makeFixture(
      [{ source_id: 'src_aaaaaaaaaaaa', raw_text: words }],
      [
        { claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1', source_id: 'src_aaaaaaaaaaaa', asserts: 'a' },
        { claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_2', source_id: 'src_aaaaaaaaaaaa', asserts: 'b' },
      ],
    );
    const { audit } = await auditDensity({ sectionId: '01-test', packPath });
    expect(audit.per_source[0]?.source_word_count).toBe(1000);
    expect(audit.per_source[0]?.claims_per_1k_words).toBeCloseTo(2, 1);
  });

  it('flags source_dominance when one source carries >= 30 claims', async () => {
    const words = Array.from({ length: 2000 }, (_, i) => `word${i}`).join(' ');
    const fixtureClaims = Array.from({ length: 32 }, (_, i) => ({
      claim_id: `clm_aaaaaaaaaaaa_ollama_intern_${i + 1}`,
      source_id: 'src_aaaaaaaaaaaa',
      asserts: `unique assertion number ${i + 1} that is long enough to count.`,
    }));
    await makeFixture([{ source_id: 'src_aaaaaaaaaaaa', raw_text: words }], fixtureClaims);
    const { audit } = await auditDensity({ sectionId: '01-test', packPath });
    expect(audit.flags.some((f) => f.type === 'source_dominance')).toBe(true);
  });

  it('flags large_near_duplicate_cluster when 3+ claims share normalised asserts', async () => {
    const words = Array.from({ length: 500 }, (_, i) => `word${i}`).join(' ');
    await makeFixture(
      [{ source_id: 'src_aaaaaaaaaaaa', raw_text: words }],
      [
        { claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1', source_id: 'src_aaaaaaaaaaaa', asserts: 'A is B.' },
        { claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_2', source_id: 'src_aaaaaaaaaaaa', asserts: 'A IS B.' },
        { claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_3', source_id: 'src_aaaaaaaaaaaa', asserts: 'a is b!' },
      ],
    );
    const { audit } = await auditDensity({ sectionId: '01-test', packPath });
    expect(audit.near_duplicate_clusters).toHaveLength(1);
    expect(audit.near_duplicate_clusters[0]?.member_count).toBe(3);
    expect(audit.flags.some((f) => f.type === 'large_near_duplicate_cluster')).toBe(true);
  });

  it('writes audits/<section>-claim-density.{json,md}', async () => {
    await makeFixture(
      [{ source_id: 'src_aaaaaaaaaaaa', raw_text: 'small body' }],
      [
        { claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1', source_id: 'src_aaaaaaaaaaaa', asserts: 'A.' },
      ],
    );
    const { jsonPath, markdownPath } = await auditDensity({ sectionId: '01-test', packPath });
    expect(jsonPath).toContain('audits');
    expect(jsonPath.endsWith('-claim-density.json')).toBe(true);
    expect(markdownPath.endsWith('-claim-density.md')).toBe(true);
    const md = await readFile(markdownPath, 'utf8');
    expect(md).toContain('Claim density audit:');
  });

  it('counts weak_scope and generic_scope correctly', async () => {
    await makeFixture(
      [{ source_id: 'src_aaaaaaaaaaaa', title: 'Knowledge Graph Reasoning Patterns', raw_text: 'body of text words words' }],
      [
        // weak: scope null, not null, asserts > 40 chars
        {
          claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
          source_id: 'src_aaaaaaaaaaaa',
          asserts: 'A long substantive assertion that exceeds forty characters in length.',
        },
        // generic: scope mirrors title (knowledge graph)
        {
          claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_2',
          source_id: 'src_aaaaaaaaaaaa',
          asserts: 'Another assertion.',
          scope: 'knowledge graph reasoning',
        },
      ],
    );
    const { audit } = await auditDensity({ sectionId: '01-test', packPath });
    expect(audit.weak_scope_count).toBe(1);
    expect(audit.generic_scope_count).toBe(1);
  });
});
