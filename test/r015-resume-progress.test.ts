/**
 * R-015 acceptance tests — `claim extract --resume / --progress` (v0.12 Slice 4).
 *
 * Each test builds a real pack via init() + sectionAdd() + a fixture helper
 * that writes N source cards + N raw bodies + N fetch receipts + a sources.jsonl
 * with N entries. The HeuristicClaimExtractor extracts span-first claims from
 * the key_points so no MCP traffic is required.
 *
 * Coverage:
 *   R-015.1 — --progress emits stderr lines + stdout unchanged
 *   R-015.2 — --resume skips ledger-completed sources
 *   R-015.3 — --resume preserves partial-failure recovery
 *   R-015.4 — Completion ledger shape (schema parse + monotonic attempt counter)
 *   R-015.5 — --resume + --progress interaction
 *   R-015.6 — Default behavior unchanged (ledger always written; no flags = no progress)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { extract } from '../src/claims/index.js';
import { HeuristicClaimExtractor } from '../src/claims/extractors/heuristic.js';
import {
  ExtractCompletionRecordSchema,
  extractCompletionLedgerPath,
  readExtractCompletionLedger,
  appendExtractCompletionRecord,
} from '../src/claims/extract-completion-ledger.js';

let workDir: string;
let packPath: string;

const SECTION_ID = '01-r015';

// 12-hex source IDs — stable across the test so the ledger keying lines up.
const SOURCE_IDS = [
  'src_aaaaaaaaaaaa',
  'src_bbbbbbbbbbbb',
  'src_cccccccccccc',
  'src_dddddddddddd',
  'src_eeeeeeeeeeee',
];

async function writeSource(sourceId: string, keyPoint: string): Promise<void> {
  const sha = sourceId.replace(/^src_/, '').padEnd(64, 'a');
  const rcptId = `rcpt_${sourceId.replace(/^src_/, '')}_1700000000000`;
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  const card = {
    source_id: sourceId,
    receipt_id: rcptId,
    section_id: SECTION_ID,
    url: `https://example.com/${sourceId}`,
    final_url: `https://example.com/${sourceId}`,
    fetched_at: '2026-05-16T03:00:00.000Z',
    publisher: 'Example Pub',
    published_at: null,
    title: `Source ${sourceId}`,
    source_type: 'secondary',
    relevance: 'unknown',
    key_points: [keyPoint],
    limitations: [],
    asserts: `${keyPoint} assertion`,
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-16T03:00:00.000Z',
  };
  await writeFile(join(cardDir, `${sourceId}.json`), JSON.stringify(card), 'utf8');

  const rawDir = join(packPath, 'evidence', 'raw');
  await mkdir(rawDir, { recursive: true });
  const rawText = `<html><body><p>${keyPoint}</p></body></html>`;
  await writeFile(join(rawDir, `${sourceId}.html`), rawText, 'utf8');

  const receipt = {
    receipt_id: rcptId,
    source_id: sourceId,
    section_id: SECTION_ID,
    requested_url: `https://example.com/${sourceId}`,
    final_url: `https://example.com/${sourceId}`,
    status: 200,
    status_text: 'OK',
    content_type: 'text/html',
    fetched_at: '2026-05-16T03:00:00.000Z',
    byte_count: rawText.length,
    sha256: sha,
    title: `Source ${sourceId}`,
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
    join(packPath, 'sections', SECTION_ID, 'sources.jsonl'),
    JSON.stringify({ source_id: sourceId, added_at: '2026-05-16T03:00:01.000Z' }) + '\n',
    'utf8',
  );
}

async function buildFiveSourcePack(): Promise<void> {
  const result = await init({
    topic: 'R-015 resume/progress fixture for slice 4 acceptance tests',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({
    id: SECTION_ID,
    purpose: 'R-015 acceptance bed',
    packPath,
  });
  for (let i = 0; i < 5; i += 1) {
    await writeSource(SOURCE_IDS[i]!, `Substantive key point number ${i + 1}.`);
  }
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-r015-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('R-015 — claim extract --resume / --progress (v0.12 Slice 4)', () => {
  it('R-015.1: --progress emits stderr lines; stdout (canonical output) unchanged', async () => {
    await buildFiveSourcePack();

    const captured: string[] = [];
    const summary = await extract({
      sectionId: SECTION_ID,
      packPath,
      extractors: [new HeuristicClaimExtractor()],
      progress: true,
      progressStream: (line) => captured.push(line),
    });

    expect(summary.sourcesProcessed).toBe(5);
    // 5 "starting" + 5 "done" lines = 10 progress entries
    const starting = captured.filter((l) => l.includes('starting'));
    const done = captured.filter((l) => l.includes('done'));
    expect(starting).toHaveLength(5);
    expect(done).toHaveLength(5);
    // Each done line carries claim count + elapsed ms
    for (const d of done) {
      expect(d).toMatch(/\d+ claims in \d+ms/);
    }
    // Counter pattern [extract N/5] present
    expect(captured.some((l) => l.includes('[extract 1/5]'))).toBe(true);
    expect(captured.some((l) => l.includes('[extract 5/5]'))).toBe(true);

    // Canonical claims.jsonl output identical to the no-progress run.
    const claimsTextWithProgress = await readFile(
      join(packPath, 'sections', SECTION_ID, 'claims.jsonl'),
      'utf8',
    );

    // Re-run on a fresh pack without --progress to compare.
    const work2 = await mkdtemp(join(tmpdir(), 'research-os-r015-no-progress-'));
    const init2 = await init({
      topic: 'R-015 resume/progress fixture for slice 4 acceptance tests',
      outDir: work2,
    });
    const pack2 = init2.packPath;
    const savePack = packPath;
    packPath = pack2;
    await sectionAdd({
      id: SECTION_ID,
      purpose: 'R-015 acceptance bed',
      packPath: pack2,
    });
    for (let i = 0; i < 5; i += 1) {
      await writeSource(SOURCE_IDS[i]!, `Substantive key point number ${i + 1}.`);
    }
    packPath = savePack;

    const captured2: string[] = [];
    await extract({
      sectionId: SECTION_ID,
      packPath: pack2,
      extractors: [new HeuristicClaimExtractor()],
      progressStream: (line) => captured2.push(line),
    });
    expect(captured2).toHaveLength(0);

    const claimsTextNoProgress = await readFile(
      join(pack2, 'sections', SECTION_ID, 'claims.jsonl'),
      'utf8',
    );

    // Strip created_at + the auto-generated claim_id timestamps from both
    // sides (they're wall-clock dependent), then compare. Everything else
    // — asserts, scope, evidence_excerpt_ids, source_ids — must be
    // byte-identical across the two runs.
    const strip = (s: string): string[] =>
      s
        .trim()
        .split('\n')
        .map((line) => {
          const obj = JSON.parse(line);
          delete obj.created_at;
          return JSON.stringify(obj);
        })
        .sort();
    expect(strip(claimsTextWithProgress)).toEqual(strip(claimsTextNoProgress));

    await rm(work2, { recursive: true, force: true });
  });

  it('R-015.2: --resume skips ledger-completed sources; remaining sources processed normally', async () => {
    await buildFiveSourcePack();

    // Pre-seed the ledger with completions for SOURCE_IDS[0] and SOURCE_IDS[1].
    await appendExtractCompletionRecord(packPath, {
      source_id: SOURCE_IDS[0]!,
      section_id: SECTION_ID,
      completed_at: '2026-05-16T03:18:12.000Z',
      claim_count: 1,
      extraction_attempt: 1,
      research_os_version: '0.11.0',
      duration_ms: 5000,
    });
    await appendExtractCompletionRecord(packPath, {
      source_id: SOURCE_IDS[1]!,
      section_id: SECTION_ID,
      completed_at: '2026-05-16T03:18:13.000Z',
      claim_count: 1,
      extraction_attempt: 1,
      research_os_version: '0.11.0',
      duration_ms: 5000,
    });

    const summary = await extract({
      sectionId: SECTION_ID,
      packPath,
      extractors: [new HeuristicClaimExtractor()],
      resume: true,
    });

    // 2 pre-completed sources skipped via resume; remaining 3 processed.
    expect(summary.sourcesSkippedByResume).toBe(2);
    expect(summary.sourcesProcessed).toBe(3);

    // After the run, the ledger has all 5 unique (section, source) pairs
    // — 2 pre-seeded + 3 newly written.
    const ledger = await readExtractCompletionLedger(packPath);
    const completedIds = new Set(ledger.map((r) => r.source_id));
    expect(completedIds.size).toBe(5);
    for (const sid of SOURCE_IDS) expect(completedIds.has(sid)).toBe(true);
  });

  it('R-015.3: --resume preserves partial-failure recovery (failed sources are re-attempted)', async () => {
    await buildFiveSourcePack();

    // Pre-seed the ledger: 2 completed. SOURCE_IDS[2] was attempted-but-failed
    // (NOT in the ledger), SOURCE_IDS[3] + SOURCE_IDS[4] were not yet attempted.
    await appendExtractCompletionRecord(packPath, {
      source_id: SOURCE_IDS[0]!,
      section_id: SECTION_ID,
      completed_at: '2026-05-16T03:20:00.000Z',
      claim_count: 1,
      extraction_attempt: 1,
      research_os_version: '0.11.0',
      duration_ms: 4000,
    });
    await appendExtractCompletionRecord(packPath, {
      source_id: SOURCE_IDS[1]!,
      section_id: SECTION_ID,
      completed_at: '2026-05-16T03:20:01.000Z',
      claim_count: 1,
      extraction_attempt: 1,
      research_os_version: '0.11.0',
      duration_ms: 4000,
    });

    // Resume run with all 5 sources extractable (heuristic always succeeds
    // on well-formed key_points). 2 skipped by resume; 3 processed (one of
    // which is the previously-failed source[2]).
    const summary = await extract({
      sectionId: SECTION_ID,
      packPath,
      extractors: [new HeuristicClaimExtractor()],
      resume: true,
    });

    expect(summary.sourcesSkippedByResume).toBe(2);
    expect(summary.sourcesProcessed).toBe(3);

    // After this run: 2 original + 3 newly completed = 5 ledger entries
    // for this section. All 5 source IDs covered.
    const ledger = await readExtractCompletionLedger(packPath);
    const sectionLedger = ledger.filter((r) => r.section_id === SECTION_ID);
    expect(sectionLedger).toHaveLength(5);
  });

  it('R-015.4: Completion ledger entries parse against Zod schema; extraction_attempt monotonically increments per source', async () => {
    await buildFiveSourcePack();

    // First extract run — should add 5 ledger entries, each with attempt=1.
    await extract({
      sectionId: SECTION_ID,
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });
    let ledger = await readExtractCompletionLedger(packPath);
    expect(ledger).toHaveLength(5);
    for (const r of ledger) {
      // Zod schema parse confirms required-field shape
      expect(() => ExtractCompletionRecordSchema.parse(r)).not.toThrow();
      expect(r.extraction_attempt).toBe(1);
      expect(r.section_id).toBe(SECTION_ID);
      expect(r.research_os_version.length).toBeGreaterThan(0);
      expect(r.duration_ms).toBeGreaterThanOrEqual(0);
    }

    // Second extract run (no --resume, no --progress) — all 5 sources get
    // re-extracted (claims deduped against existing claims.jsonl, ledger
    // gets 5 new entries with attempt=2).
    await extract({
      sectionId: SECTION_ID,
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });
    ledger = await readExtractCompletionLedger(packPath);
    expect(ledger).toHaveLength(10);

    // Group by source_id; verify monotonic attempt counter (1, 2).
    const bySource = new Map<string, number[]>();
    for (const r of ledger) {
      const arr = bySource.get(r.source_id) ?? [];
      arr.push(r.extraction_attempt);
      bySource.set(r.source_id, arr);
    }
    for (const sid of SOURCE_IDS) {
      const attempts = bySource.get(sid) ?? [];
      expect(attempts.sort()).toEqual([1, 2]);
    }
  });

  it('R-015.5: --resume + --progress emits [skip] for completed; [extract N/M] for processed; counter reflects post-skip position', async () => {
    await buildFiveSourcePack();

    // Pre-seed 2 completions
    await appendExtractCompletionRecord(packPath, {
      source_id: SOURCE_IDS[0]!,
      section_id: SECTION_ID,
      completed_at: '2026-05-16T03:30:00.000Z',
      claim_count: 1,
      extraction_attempt: 1,
      research_os_version: '0.11.0',
      duration_ms: 5000,
    });
    await appendExtractCompletionRecord(packPath, {
      source_id: SOURCE_IDS[2]!,
      section_id: SECTION_ID,
      completed_at: '2026-05-16T03:30:01.000Z',
      claim_count: 1,
      extraction_attempt: 1,
      research_os_version: '0.11.0',
      duration_ms: 5000,
    });

    const captured: string[] = [];
    const summary = await extract({
      sectionId: SECTION_ID,
      packPath,
      extractors: [new HeuristicClaimExtractor()],
      resume: true,
      progress: true,
      progressStream: (line) => captured.push(line),
    });

    expect(summary.sourcesSkippedByResume).toBe(2);
    expect(summary.sourcesProcessed).toBe(3);

    // 2 skip lines + 3 starting + 3 done = 8 progress entries
    const skips = captured.filter((l) => l.startsWith('[skip]'));
    const starts = captured.filter((l) => l.includes('starting'));
    const dones = captured.filter((l) => l.includes('done'));
    expect(skips).toHaveLength(2);
    expect(starts).toHaveLength(3);
    expect(dones).toHaveLength(3);

    // Skip lines mention "already extracted at <timestamp>"
    for (const s of skips) {
      expect(s).toMatch(/already extracted at/);
    }

    // Counter pattern is /M where M is the post-resume-filter total (3),
    // NOT the original list (5).
    expect(captured.some((l) => l.includes('[extract 1/3]'))).toBe(true);
    expect(captured.some((l) => l.includes('[extract 3/3]'))).toBe(true);
    expect(captured.some((l) => l.includes('[extract 4/3]'))).toBe(false);
    expect(captured.some((l) => l.includes('[extract 1/5]'))).toBe(false);
  });

  it('R-015.6: Default behavior (no flags) — completion ledger always written; no progress stderr emitted', async () => {
    await buildFiveSourcePack();

    // No ledger file before the run
    expect(existsSync(extractCompletionLedgerPath(packPath))).toBe(false);

    const captured: string[] = [];
    const summary = await extract({
      sectionId: SECTION_ID,
      packPath,
      extractors: [new HeuristicClaimExtractor()],
      progressStream: (line) => captured.push(line),
    });

    // No progress emitted because progress flag was not set
    expect(captured).toHaveLength(0);
    // No resume skipping
    expect(summary.sourcesSkippedByResume).toBe(0);
    expect(summary.sourcesProcessed).toBe(5);

    // Ledger written for all 5 successful extractions
    const ledger = await readExtractCompletionLedger(packPath);
    expect(ledger).toHaveLength(5);
    const completedIds = new Set(ledger.map((r) => r.source_id));
    for (const sid of SOURCE_IDS) expect(completedIds.has(sid)).toBe(true);
  });
});
