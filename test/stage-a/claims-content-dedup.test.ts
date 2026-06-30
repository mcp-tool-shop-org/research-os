/**
 * A-CLAIMS-003 regression — content-level dedup against existing claims.
 *
 * claim_id encodes a per-run writtenIndex; the existing dedup is claim_id-only.
 * A non-resume re-extract therefore appends a content-duplicate claim under a
 * fresh id. The fix dedups on the normalized `asserts` text against claims
 * already persisted for the section.
 *
 * INVARIANT (both halves proven, single extract() run):
 *   (bad)  a draft whose normalized asserts already exists on disk under a
 *          DIFFERENT claim_id is deduped (claimsDeduped += 1, NOT appended).
 *   (good) a draft with novel asserts is appended (claimsAdded += 1).
 *
 * To exercise the on-disk path without the one-shot pre-mcp rename moving the
 * seed file away, we pre-create BOTH claims.jsonl and its
 * `.pre-mcp-2026-05-11` sentinel so preserveLegacyClaimsJsonlIfNeeded takes
 * the "already migrated — leave in place" branch.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { extract } from '../../src/claims/index.js';
import { ClaimSchema } from '../../src/claims/schema.js';
import type {
  ClaimExtractionInput,
  ClaimExtractionResult,
  ClaimExtractorAdapter,
  DraftClaim,
} from '../../src/claims/types.js';

const sourceId = 'src_abcdef012345';
const sha256 = 'a'.repeat(64);

let workDir: string;
let packPath: string;

// Stub extractor that returns a fixed draft set, regardless of input. Lets us
// control the exact `asserts` text the dedup layer sees.
class StubExtractor implements ClaimExtractorAdapter {
  readonly name = 'ollama-intern' as const;
  constructor(private readonly drafts: DraftClaim[]) {}
  async available(): Promise<boolean> {
    return true;
  }
  async extract(_input: ClaimExtractionInput): Promise<ClaimExtractionResult> {
    return { ok: true, claims: this.drafts, method: 'mcp_ollama_extract' };
  }
}

function draft(asserts: string, excerptId: string): DraftClaim {
  return {
    asserts,
    scope: null,
    not: null,
    evidence_excerpt_ids: [excerptId],
    evidence_location: null,
    confidence: 'high',
    frame_excluded: false,
  };
}

async function fixturePack(keyPoints: string[]): Promise<void> {
  const result = await init({
    topic: 'How does content dedup work?',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({ id: '01-landscape', purpose: 'Probe dedup', packPath });
  const rawText = `<html><body>${keyPoints
    .map((kp) => `<p>${kp}</p>`)
    .join('')}</body></html>`;
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  await writeFile(
    join(cardDir, `${sourceId}.json`),
    JSON.stringify({
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
    }),
    'utf8',
  );
  const rawDir = join(packPath, 'evidence', 'raw');
  await mkdir(rawDir, { recursive: true });
  await writeFile(join(rawDir, `${sourceId}.html`), rawText, 'utf8');
  await appendFile(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    JSON.stringify({
      receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1700000000000`,
      source_id: sourceId,
      section_id: '01-landscape',
      requested_url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      status: 200,
      status_text: 'OK',
      content_type: 'text/html',
      fetched_at: '2026-05-06T22:00:00.000Z',
      byte_count: rawText.length,
      sha256,
      title: 'Example Source',
      raw_text_path: `evidence/raw/${sourceId}.html`,
      fetch_outcome: 'ok',
      fetch_error: null,
      extraction_outcome: 'ok',
      extraction_extractor: 'heuristic',
      extraction_error: null,
    }) + '\n',
    'utf8',
  );
  await appendFile(
    join(packPath, 'sections', '01-landscape', 'sources.jsonl'),
    JSON.stringify({ source_id: sourceId, added_at: '2026-05-06T22:00:01.000Z' }) + '\n',
    'utf8',
  );
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-content-dedup-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('A-CLAIMS-003 — content-level dedup against existing claims', () => {
  it('dedups a content-duplicate (different claim_id, same asserts) and appends a novel one', async () => {
    await fixturePack(['First substantive key point here.', 'Second distinct key point here.']);

    // Seed an existing claim on disk under an id the re-extract will NOT mint.
    // The mismatched index (writtenIndex starts at 0 → id _1 on the new run)
    // guarantees the claim_id-only dedup can't catch the duplicate — only the
    // content-level dedup can.
    const existingClaim = ClaimSchema.parse({
      claim_id: `clm_${sourceId.replace(/^src_/, '')}_ollama_intern_99`,
      section_id: '01-landscape',
      source_ids: [sourceId],
      source_hashes: [sha256],
      asserts: 'First substantive key point here.',
      scope: null,
      not: null,
      evidence_excerpt_ids: [`ex_${sourceId.replace(/^src_/, '')}_001`],
      evidence_excerpt: 'evidence body',
      evidence_location: null,
      confidence: 'high',
      extractor: 'ollama-intern',
      extraction_method: 'mcp_ollama_extract',
      created_at: '2026-05-15T10:00:00.000Z',
      review_state: 'candidate',
      frame_excluded: false,
    });
    const claimsPath = join(packPath, 'sections', '01-landscape', 'claims.jsonl');
    await writeFile(claimsPath, JSON.stringify(existingClaim) + '\n', 'utf8');
    // Pre-mcp sentinel so the preservation step leaves claims.jsonl in place.
    await writeFile(claimsPath + '.pre-mcp-2026-05-11', '', 'utf8');

    // The extractor returns: a content-DUPLICATE of the seed (mismatched id)
    // plus a NOVEL claim. We must dedup the first and append the second.
    const realExcerptId = `ex_${sourceId.replace(/^src_/, '')}_001`;
    const summary = await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [
        new StubExtractor([
          // duplicate asserts (whitespace/case-normalized to the seed)
          draft('  first substantive KEY point here.  ', realExcerptId),
          // novel asserts
          draft('Second distinct key point here.', realExcerptId),
        ]),
      ],
    });

    // bad half: the content-duplicate was deduped, not appended.
    expect(summary.claimsDeduped).toBe(1);
    // good half: the novel claim was appended.
    expect(summary.claimsAdded).toBe(1);

    const lines = (await readFile(claimsPath, 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => ClaimSchema.parse(JSON.parse(l)));
    // Seed (1) + novel (1) = 2 distinct asserts; NO content duplicate persisted.
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const assertCounts = new Map<string, number>();
    for (const c of lines) {
      const k = norm(c.asserts);
      assertCounts.set(k, (assertCounts.get(k) ?? 0) + 1);
    }
    expect(assertCounts.get('first substantive key point here.')).toBe(1);
    expect(assertCounts.get('second distinct key point here.')).toBe(1);
    expect(lines).toHaveLength(2);
  });
});
