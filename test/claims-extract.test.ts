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

describe('claim extract (heuristic-only path, span-first)', () => {
  it('emits one candidate claim per key_point, each citing a real ledger excerpt id', async () => {
    await fixturePackWithSource([
      'First substantive key point.',
      'Second substantive key point.',
      'Third substantive key point.',
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
    expect(summary.excerptLedgersBuilt).toBe(1);

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
      expect(claim.evidence_excerpt_ids.length).toBeGreaterThanOrEqual(1);
      for (const id of claim.evidence_excerpt_ids) {
        expect(id).toMatch(/^ex_[a-f0-9]{12}_\d{3}$/);
      }
      // evidence_excerpt is filled by research-os from the ledger, not the extractor.
      expect(claim.evidence_excerpt.length).toBeGreaterThan(0);
    }
  });

  it('writes the excerpt ledger to evidence/excerpts/<source_id>.jsonl', async () => {
    await fixturePackWithSource(['One substantive point that is long enough.']);
    await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });
    const ledgerText = await readFile(
      join(packPath, 'evidence', 'excerpts', `${sourceId}.jsonl`),
      'utf8',
    );
    const lines = ledgerText.trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const e = JSON.parse(line);
      expect(e.excerpt_id).toMatch(/^ex_abcdef012345_\d{3}$/);
      expect(typeof e.text).toBe('string');
      expect(['raw_text', 'key_point']).toContain(e.origin);
    }
  });

  it('is idempotent — re-running with same extractor dedupes by claim_id', async () => {
    await fixturePackWithSource([
      'One key point that is long enough.',
      'Two distinct second point that is long enough.',
    ]);
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
    // Second run loads the existing ledger rather than rebuilding it.
    expect(second.excerptLedgersBuilt).toBe(0);
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
    await fixturePackWithSource([
      'key point one is long enough',
      'key point two is also long enough',
    ]);
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

  it('rejects claims whose excerpt IDs do not resolve in the ledger (ungrounded_excerpt)', async () => {
    await fixturePackWithSource(['real key point that exists in the source']);
    const liar = {
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
              // References an ID that is NOT in the ledger (this is what mistral-nemo's
              // paraphrase-as-quote behaviour collapses to under span-first).
              asserts: 'made-up assertion',
              scope: 'made up scope',
              not: null,
              evidence_excerpt_ids: ['ex_abcdef012345_999'],
              evidence_location: null,
              confidence: 'high' as const,
            },
            {
              asserts: 'a grounded claim',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_abcdef012345_001'],
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
      extractors: [liar],
    });
    expect(summary.claimsAdded).toBe(1);
    expect(summary.claimsRejectedUngrounded).toBe(1);
    expect(summary.claimsRejectedExcerptIdMissing).toBe(1);
  });

  it('rejects claims whose excerpt IDs are malformed (excerpt_id_malformed)', async () => {
    await fixturePackWithSource(['a real key point present in the source']);
    const malformer = {
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
              asserts: 'shape-violating claim',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['not_an_excerpt_id'],
              evidence_location: null,
              confidence: 'low' as const,
            },
          ],
        };
      },
    };
    const summary = await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [malformer],
    });
    expect(summary.claimsAdded).toBe(0);
    expect(summary.claimsRejectedUngrounded).toBe(1);
    expect(summary.claimsRejectedExcerptIdMalformed).toBe(1);
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
