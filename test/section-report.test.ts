import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { reportSection } from '../src/section_report/index.js';
import { SectionReportSchema } from '../src/section_report/schema.js';
import { PackNotFoundError, SectionNotFoundError } from '../src/errors.js';

let workDir: string;
let packPath: string;

async function setupPack() {
  const r = await init({ topic: 'Section report fixture pack', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: '01-test', purpose: 'reports', packPath });
}

async function plantSource(sourceId: string, publisher: string, rawText: string) {
  await mkdir(join(packPath, 'evidence', 'source-cards'), { recursive: true });
  await mkdir(join(packPath, 'evidence', 'raw'), { recursive: true });
  const card = {
    source_id: sourceId,
    receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1`,
    section_id: '01-test',
    url: 'https://example.com/x',
    final_url: 'https://example.com/x',
    fetched_at: '2026-05-06T22:00:00.000Z',
    publisher,
    published_at: null,
    title: 'Source title',
    source_type: 'secondary',
    relevance: 'unknown',
    key_points: [],
    limitations: [],
    asserts: 'Source asserts',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-06T22:00:00.000Z',
  };
  await writeFile(join(packPath, 'evidence', 'source-cards', `${sourceId}.json`), JSON.stringify(card), 'utf8');
  await writeFile(join(packPath, 'evidence', 'raw', `${sourceId}.html`), rawText, 'utf8');
  const receipt = {
    receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1`,
    source_id: sourceId,
    section_id: '01-test',
    requested_url: 'https://example.com/x',
    final_url: 'https://example.com/x',
    status: 200,
    status_text: 'OK',
    content_type: 'text/html',
    fetched_at: '2026-05-06T22:00:00.000Z',
    byte_count: rawText.length,
    sha256: 'a'.repeat(64),
    title: 'Source title',
    raw_text_path: `evidence/raw/${sourceId}.html`,
    fetch_outcome: 'ok',
    fetch_error: null,
    extraction_outcome: 'ok',
    extraction_extractor: 'heuristic',
    extraction_error: null,
  };
  await appendFile(join(packPath, 'evidence', 'fetch-log.jsonl'), JSON.stringify(receipt) + '\n', 'utf8');
  await appendFile(
    join(packPath, 'sections', '01-test', 'sources.jsonl'),
    JSON.stringify({ source_id: sourceId, added_at: '2026-05-06T22:00:01.000Z' }) + '\n',
    'utf8',
  );
}

async function plantClaim(claimId: string, sourceId: string, asserts: string) {
  const claim = {
    claim_id: claimId,
    section_id: '01-test',
    source_ids: [sourceId],
    source_hashes: ['a'.repeat(64)],
    asserts,
    scope: null,
    not: null,
    evidence_excerpt_ids: [`ex_${sourceId.replace(/^src_/, '')}_001`],
    evidence_excerpt: 'literal',
    evidence_location: null,
    confidence: 'low',
    extractor: 'ollama-intern',
    extraction_method: 'ollama_intern_propositional',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
  };
  await appendFile(join(packPath, 'sections', '01-test', 'claims.jsonl'), JSON.stringify(claim) + '\n', 'utf8');
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-secrep-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('reportSection', () => {
  it('rejects when pack does not exist', async () => {
    await expect(
      reportSection({ sectionId: '01-test', packPath: join(workDir, 'nope') }),
    ).rejects.toBeInstanceOf(PackNotFoundError);
  });

  it('rejects when section does not exist', async () => {
    await setupPack();
    await expect(
      reportSection({ sectionId: '99-no', packPath }),
    ).rejects.toBeInstanceOf(SectionNotFoundError);
  });

  it('produces a valid empty report when nothing has been gathered yet', async () => {
    await setupPack();
    const { report, jsonPath, markdownPath } = await reportSection({ sectionId: '01-test', packPath });
    expect(() => SectionReportSchema.parse(report)).not.toThrow();
    expect(report.sources.fetched_ok).toBe(0);
    expect(report.extraction.candidate_claims).toBe(0);
    expect(report.review.reviewed).toBe(false);
    expect(report.acceptance.acceptance_ratio).toBe(0);
    const md = await readFile(markdownPath, 'utf8');
    expect(md).toContain('Section 01-test');
    expect(md).toContain('## Acceptance');
    expect(jsonPath.endsWith('-section-report.json')).toBe(true);
  });

  it('rolls up sources, claims, and the acceptance ratio', async () => {
    await setupPack();
    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`).join(' ');
    await plantSource('src_aaaaaaaaaaaa', 'PubA', words);
    await plantClaim('clm_aaaaaaaaaaaa_ollama_intern_1', 'src_aaaaaaaaaaaa', 'A.');
    await plantClaim('clm_aaaaaaaaaaaa_ollama_intern_2', 'src_aaaaaaaaaaaa', 'B.');
    // Only one of the two claims has an accepted review.
    const review = {
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      decision: 'accepted_for_synthesis',
      reason: 'ok',
      finding_ids: [],
      reviewer: 'heuristic',
      review_method: 'heuristic_field_and_grounding_checks',
      created_at: '2026-05-06T22:30:00.000Z',
    };
    await appendFile(
      join(packPath, 'sections', '01-test', 'claim-reviews.jsonl'),
      JSON.stringify(review) + '\n',
      'utf8',
    );
    const { report } = await reportSection({ sectionId: '01-test', packPath });
    expect(report.sources.fetched_ok).toBe(1);
    expect(report.sources.publishers).toEqual(['PubA']);
    expect(report.extraction.candidate_claims).toBe(2);
    expect(report.review.reviewed).toBe(true);
    expect(report.review.accepted_for_synthesis).toBe(1);
    expect(report.acceptance.candidate_claims).toBe(2);
    expect(report.acceptance.accepted_for_synthesis).toBe(1);
    expect(report.acceptance.acceptance_ratio).toBeCloseTo(0.5, 5);
    expect(report.acceptance.accepted_per_source).toBeCloseTo(1, 5);
    // 1 accepted / 1000 words → 1.0 per 1k.
    expect(report.acceptance.accepted_per_1k_words).toBeCloseTo(1, 1);
    expect(report.acceptance.synthesis_ready).toBe(false);
  });

  it('reads excerpt-page metrics from the claim-extract receipt when present', async () => {
    await setupPack();
    await plantSource('src_aaaaaaaaaaaa', 'PubA', 'short body');
    await plantClaim('clm_aaaaaaaaaaaa_ollama_intern_1', 'src_aaaaaaaaaaaa', 'A.');
    await mkdir(join(packPath, 'audits'), { recursive: true });
    const receipt = {
      receipt_id: 'cle_1_01-test',
      section_id: '01-test',
      extracted_at: '2026-05-06T22:00:00.000Z',
      research_os_version: '0.1.0',
      extractor: 'ollama-intern',
      extraction_method: 'ollama_intern_propositional_paged',
      sources_processed: 1,
      sources_skipped: 0,
      sources_failed: 0,
      excerpt_ledgers_built: 7,
      claims_added: 1,
      claims_deduped: 0,
      claims_rejected_ungrounded: 2,
      claims_rejected_excerpt_id_missing: 1,
      claims_rejected_excerpt_id_malformed: 1,
      failures: [
        { source_id: 'src_aaaaaaaaaaaa', reason: 'Ollama response was not valid JSON', kind: 'extractor_invalid_json' },
      ],
    };
    await writeFile(
      join(packPath, 'audits', '01-test-claim-extract.json'),
      JSON.stringify(receipt),
      'utf8',
    );
    const { report } = await reportSection({ sectionId: '01-test', packPath });
    expect(report.extraction.excerpt_pages_processed).toBe(7);
    expect(report.extraction.excerpt_id_failures).toBe(2);
    expect(report.extraction.malformed_extractor_outputs).toBe(1);
  });
});
