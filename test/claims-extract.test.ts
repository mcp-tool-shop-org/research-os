import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { extract } from '../src/claims/index.js';
import { HeuristicClaimExtractor } from '../src/claims/extractors/heuristic.js';
import { ClaimSchema } from '../src/claims/schema.js';
import {
  NoSourcesGatheredError,
  PackNotFoundError,
  SectionNotFoundError,
} from '../src/errors.js';

let workDir: string;
let packPath: string;

const sourceId = 'src_abcdef012345';
const sha256 = 'a'.repeat(64);

async function fixturePackWithSource(
  keyPoints: string[],
  rawText?: string,
) {
  const result = await init({
    topic: 'How does claim extraction handle real sources?',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({
    id: '01-landscape',
    purpose: 'Probe claim extraction',
    packPath,
  });
  const effectiveRawText =
    rawText ??
    `<html><body>${keyPoints.map((kp) => `<p>${kp}</p>`).join('')}</body></html>`;
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  const card = {
    source_id: sourceId,
    receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1700000000000`,
    section_id: '01-landscape',
    url: 'https://example.com/x',
    final_url: 'https://example.com/x',
    fetched_at: '2026-05-06T22:00:00.000Z',
    publisher: 'Example Pub',
    published_at: null,
    title: 'Example Source',
    source_type: 'secondary',
    relevance: 'unknown',
    key_points: keyPoints,
    limitations: [],
    asserts: 'Source headline assertion',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-06T22:00:00.000Z',
  };
  await writeFile(join(cardDir, `${sourceId}.json`), JSON.stringify(card), 'utf8');

  const rawDir = join(packPath, 'evidence', 'raw');
  await mkdir(rawDir, { recursive: true });
  await writeFile(join(rawDir, `${sourceId}.html`), effectiveRawText, 'utf8');

  const receipt = {
    receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1700000000000`,
    source_id: sourceId,
    section_id: '01-landscape',
    requested_url: 'https://example.com/x',
    final_url: 'https://example.com/x',
    status: 200,
    status_text: 'OK',
    content_type: 'text/html',
    fetched_at: '2026-05-06T22:00:00.000Z',
    byte_count: effectiveRawText.length,
    sha256,
    title: 'Example Source',
    raw_text_path: `evidence/raw/${sourceId}.html`,
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

  await appendFile(
    join(packPath, 'sections', '01-landscape', 'sources.jsonl'),
    JSON.stringify({ source_id: sourceId, added_at: '2026-05-06T22:00:01.000Z' }) + '\n',
    'utf8',
  );
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-claims-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('claim extract (heuristic-only path)', () => {
  it('emits one candidate claim per source-card key_point with shallow tags', async () => {
    await fixturePackWithSource([
      'First key point',
      'Second key point',
      'Third key point',
    ]);
    const summary = await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });
    expect(summary.extractor).toBe('heuristic');
    expect(summary.extractionMethod).toBe('heuristic_key_point');
    expect(summary.sourcesProcessed).toBe(1);
    expect(summary.claimsAdded).toBe(3);

    const claimsText = await readFile(
      join(packPath, 'sections', '01-landscape', 'claims.jsonl'),
      'utf8',
    );
    const lines = claimsText.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      const claim = ClaimSchema.parse(JSON.parse(line));
      expect(claim.review_state).toBe('candidate');
      expect(claim.scope).toBeNull();
      expect(claim.not).toBeNull();
      expect(claim.extractor).toBe('heuristic');
      expect(claim.extraction_method).toBe('heuristic_key_point');
      expect(claim.source_ids).toEqual([sourceId]);
      expect(claim.source_hashes).toEqual([sha256]);
      expect(claim.confidence).toBe('low');
    }
  });

  it('is idempotent — re-running with same extractor dedupes by claim_id', async () => {
    await fixturePackWithSource(['One key point that is long enough', 'Two distinct second point that is long enough']);
    const first = await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });
    expect(first.claimsAdded).toBe(2);

    const second = await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });
    expect(second.claimsAdded).toBe(0);
    expect(second.claimsDeduped).toBe(2);
  });

  it('rejects when section has no gathered sources', async () => {
    const result = await init({
      topic: 'Empty pack for negative test',
      outDir: workDir,
    });
    packPath = result.packPath;
    await sectionAdd({
      id: '01-landscape',
      purpose: 'Empty section',
      packPath,
    });
    await expect(
      extract({
        sectionId: '01-landscape',
        packPath,
        extractors: [new HeuristicClaimExtractor()],
      }),
    ).rejects.toBeInstanceOf(NoSourcesGatheredError);
  });

  it('rejects when pack does not exist', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'research-os-claims-empty-'));
    try {
      await expect(
        extract({
          sectionId: '01-landscape',
          packPath: empty,
          extractors: [new HeuristicClaimExtractor()],
        }),
      ).rejects.toBeInstanceOf(PackNotFoundError);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('rejects when section does not exist', async () => {
    await fixturePackWithSource(['key point of meaningful length']);
    await expect(
      extract({
        sectionId: '99-not-real',
        packPath,
        extractors: [new HeuristicClaimExtractor()],
      }),
    ).rejects.toBeInstanceOf(SectionNotFoundError);
  });

  it('does not promote review_state — every emitted claim is candidate', async () => {
    await fixturePackWithSource(['key point one is long enough', 'key point two is also long enough']);
    await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });
    const text = await readFile(
      join(packPath, 'sections', '01-landscape', 'claims.jsonl'),
      'utf8',
    );
    for (const line of text.trim().split('\n').filter(Boolean)) {
      expect(JSON.parse(line).review_state).toBe('candidate');
    }
  });

  it('rejects claims whose evidence_excerpt is not in the raw text (anti-hallucination)', async () => {
    await fixturePackWithSource(['real key point that exists in the source']);
    const hallucinator = {
      name: 'ollama-intern' as const,
      async available() {
        return true;
      },
      async extract() {
        return {
          ok: true as const,
          method: 'ollama_intern_propositional',
          claims: [
            {
              asserts: 'made-up assertion',
              scope: 'made up scope',
              not: null,
              evidence_excerpt: 'This text is fabricated and never appeared in the source whatsoever',
              evidence_location: null,
              confidence: 'high' as const,
            },
            {
              asserts: 'a grounded claim',
              scope: null,
              not: null,
              evidence_excerpt: 'real key point that exists',
              evidence_location: null,
              confidence: 'medium' as const,
            },
          ],
        };
      },
    };
    const summary = await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [hallucinator],
    });
    expect(summary.claimsAdded).toBe(1);
    expect(summary.claimsRejectedUngrounded).toBe(1);
  });

  it('falls back from ollama-intern to heuristic when ollama is unavailable', async () => {
    await fixturePackWithSource(['key point of meaningful length']);
    const ollamaUnavail = {
      name: 'ollama-intern' as const,
      async available() {
        return false;
      },
      async extract() {
        throw new Error('should not be called when unavailable');
      },
    };
    const summary = await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [ollamaUnavail, new HeuristicClaimExtractor()],
    });
    expect(summary.extractor).toBe('heuristic');
    expect(summary.claimsAdded).toBe(1);
  });
});
