/**
 * B-CLAIMS-001 (Stage B proactive hardening) — partial-window failure must
 * NOT be silently swallowed.
 *
 * Before the fix: MCPClaimExtractor.extract() pushed each window failure to
 * `pageErrors` and `continue`d, but only consulted `pageErrors` when
 * pagesOk === 0. A partial-window failure (>=1 window ok, others
 * TIER_TIMEOUT / transport / parse) returned ok:true with NO field carrying
 * the per-window errors. extract.ts then marked the source 'processed', wrote
 * a completion-ledger entry, and `--resume` permanently skipped re-extraction
 * — the dropped windows' claims were never recovered or surfaced.
 *
 * After the fix: the ok:true result carries `windowsFailed` (+ `pageErrors`);
 * extract.ts folds it into the summary + receipt AND withholds the
 * completion-ledger entry so the source re-attempts on --resume.
 *
 * Both halves proven:
 *  - GAP HANDLED: a partial-window failure surfaces windowsFailed + a failure
 *    entry and writes NO completion-ledger record.
 *  - HAPPY PATH: a clean ok:true extraction (no windowsFailed) still writes the
 *    completion-ledger record and reports windowsFailed === 0.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { extract } from '../../src/claims/index.js';
import { readExtractCompletionLedger } from '../../src/claims/extract-completion-ledger.js';
import type {
  ClaimExtractionInput,
  ClaimExtractionResult,
  ClaimExtractorAdapter,
} from '../../src/claims/types.js';

let workDir: string;
let packPath: string;

const SECTION_ID = '01-stageb';
const SOURCE_ID = 'src_abcdef012345';

async function buildPack(): Promise<void> {
  const result = await init({
    topic: 'B-CLAIMS-001 partial-window-failure fixture',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({ id: SECTION_ID, purpose: 'Stage B partial window bed', packPath });

  const sha = SOURCE_ID.replace(/^src_/, '').padEnd(64, 'a');
  const rcptId = `rcpt_${SOURCE_ID.replace(/^src_/, '')}_1700000000000`;
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  const card = {
    source_id: SOURCE_ID,
    receipt_id: rcptId,
    section_id: SECTION_ID,
    url: 'https://example.com/x',
    final_url: 'https://example.com/x',
    fetched_at: '2026-06-29T03:00:00.000Z',
    publisher: 'Example Pub',
    published_at: null,
    title: 'Example Source',
    source_type: 'secondary',
    relevance: 'unknown',
    key_points: ['A substantive first key point about the topic at hand.'],
    limitations: [],
    asserts: 'Source headline assertion',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-06-29T03:00:00.000Z',
  };
  await writeFile(join(cardDir, `${SOURCE_ID}.json`), JSON.stringify(card), 'utf8');

  const rawDir = join(packPath, 'evidence', 'raw');
  await mkdir(rawDir, { recursive: true });
  const rawText =
    '<html><body><p>A substantive first key point about the topic at hand.</p></body></html>';
  await writeFile(join(rawDir, `${SOURCE_ID}.html`), rawText, 'utf8');

  const receipt = {
    receipt_id: rcptId,
    source_id: SOURCE_ID,
    section_id: SECTION_ID,
    requested_url: 'https://example.com/x',
    final_url: 'https://example.com/x',
    status: 200,
    status_text: 'OK',
    content_type: 'text/html',
    fetched_at: '2026-06-29T03:00:00.000Z',
    byte_count: rawText.length,
    sha256: sha,
    title: 'Example Source',
    raw_text_path: `evidence/raw/${SOURCE_ID}.html`,
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
    join(packPath, 'sections', SECTION_ID, 'sources.jsonl'),
    JSON.stringify({ source_id: SOURCE_ID, added_at: '2026-06-29T03:00:01.000Z' }) + '\n',
    'utf8',
  );
}

// A controllable adapter: emits one valid draft (citing the first real ledger
// excerpt id supplied to it) and optionally reports a partial-window failure.
class ProgrammableExtractor implements ClaimExtractorAdapter {
  readonly name = 'ollama-intern' as const;
  constructor(private readonly windowsFailed: number) {}
  async available(): Promise<boolean> {
    return true;
  }
  async extract(input: ClaimExtractionInput): Promise<ClaimExtractionResult> {
    const firstId = input.excerpts[0]!.excerpt_id;
    const out: ClaimExtractionResult = {
      ok: true,
      claims: [
        {
          asserts: 'The recovered window claim asserts something substantive.',
          scope: null,
          not: null,
          evidence_excerpt_ids: [firstId],
          evidence_location: null,
          confidence: 'high',
        },
      ],
      method: 'mcp_ollama_extract_paged',
    };
    if (this.windowsFailed > 0) {
      out.windowsFailed = this.windowsFailed;
      out.pageErrors = Array.from(
        { length: this.windowsFailed },
        (_v, i) => `TIER_TIMEOUT on window ${i + 1}`,
      );
    }
    return out;
  }
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-stageb-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('B-CLAIMS-001 — partial-window failure surfacing + ledger withhold', () => {
  it('GAP HANDLED: a partial-window failure surfaces windowsFailed and writes NO completion-ledger entry (so --resume re-attempts)', async () => {
    await buildPack();
    const summary = await extract({
      sectionId: SECTION_ID,
      packPath,
      extractors: [new ProgrammableExtractor(1)],
    });

    // The source still produced at least one claim (ok:true), so it's counted
    // processed — but the partial-window failure must be surfaced.
    expect(summary.sourcesProcessed).toBe(1);
    expect(summary.windowsFailed).toBe(1);
    // A failure entry is recorded so the operator sees the dropped window.
    expect(summary.failures.some((f) => /partial window failure/.test(f.reason))).toBe(true);

    // LOAD-BEARING: no completion-ledger entry, so --resume re-attempts and the
    // dropped window's claims can be recovered.
    const ledger = await readExtractCompletionLedger(packPath);
    expect(ledger.filter((r) => r.source_id === SOURCE_ID && r.section_id === SECTION_ID)).toHaveLength(0);
  });

  it('HAPPY PATH: a clean ok:true extraction (no windowsFailed) still writes the completion-ledger entry and reports windowsFailed === 0', async () => {
    await buildPack();
    const summary = await extract({
      sectionId: SECTION_ID,
      packPath,
      extractors: [new ProgrammableExtractor(0)],
    });

    expect(summary.sourcesProcessed).toBe(1);
    expect(summary.windowsFailed).toBe(0);
    expect(summary.failures.some((f) => /partial window failure/.test(f.reason))).toBe(false);

    const ledger = await readExtractCompletionLedger(packPath);
    expect(
      ledger.filter((r) => r.source_id === SOURCE_ID && r.section_id === SECTION_ID),
    ).toHaveLength(1);

    // Receipt carries the additive field, set to 0 on a clean run.
    const receiptText = await import('node:fs/promises').then((m) =>
      m.readFile(join(packPath, 'audits', `${SECTION_ID}-claim-extract.json`), 'utf8'),
    );
    const receipt = JSON.parse(receiptText) as { windows_failed?: number };
    expect(receipt.windows_failed).toBe(0);
  });
});
