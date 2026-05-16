/**
 * R-013 — source-card audit --apply --rebuild-cards integration tests
 * (v0.12 Slice 2).
 *
 * Closes the C2 + C3 architectural-trap pair surfaced by the
 * operator-aloneness DST gate v0.3 run:
 *
 *   C2: buildCard() bakes overrides during gather only; post-audit
 *       override-apply requires manual re-gather to materialize the
 *       override into the persisted card JSON.
 *
 *   C3: heuristic reviewer reads raw card.source_type (not
 *       getEffectiveSourceType()) so unbaked overrides still penalize
 *       the claim until the operator does a full re-gather.
 *
 * The combined trap stalls the operator: audit --apply reports
 * "applied", subsequent reviewer-style raw reads keep penalizing,
 * there's no in-band signal that the operator must re-gather.
 *
 * R-013 solves the producer side of the trap (rebuild raw to match
 * effective) without touching the reviewer's raw-read pattern. The
 * rebuild routes through the SAME buildCard() function gather uses,
 * with current overrides applied, on the cached body — no re-fetch.
 *
 * Defense-floor invariant (load-bearing): rebuild MUST NOT silently
 * strip severities. R-003 / R-005 / R-009 still fire on the cached
 * body during rebuild; only explicit clear_severities[] in an override
 * removes a severity at audit-time consumption.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, appendFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  rebuildSourceCards,
  readRebuildLedger,
  rebuildLedgerPath,
  RebuildLedgerRecordSchema,
} from '../src/sources/rebuild-ledger.js';
import {
  runSourceCardAudit,
  applySourceCardOverrides,
} from '../src/sources/source-card-audit.js';
import type { SourceCard, FetchReceipt } from '../src/sources/schema.js';
import type { SourceCardOverride } from '../src/sources/source-card-overrides-schema.js';
import { ResearchOSError } from '../src/errors.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'research-os-r013-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ─── helpers (mirror test/sources/source-card-audit-severities.test.ts) ─────

async function makeCardsDir(packPath: string): Promise<string> {
  const dir = join(packPath, 'evidence', 'source-cards');
  await mkdir(dir, { recursive: true });
  return dir;
}

function makeCard(partial: Partial<SourceCard> = {}): SourceCard {
  return {
    source_id: 'src_aabbccddeeff',
    receipt_id: 'rcpt_aabbcc_1',
    section_id: '01-test',
    url: 'https://example.com/p',
    final_url: 'https://example.com/p',
    fetched_at: '2026-05-16T10:00:00.000Z',
    publisher: null,
    published_at: null,
    title: 'A Title',
    source_type: 'unknown',
    relevance: 'medium',
    key_points: ['point one'],
    limitations: [],
    asserts: 'It asserts.',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-16T10:00:00.000Z',
    ...partial,
  };
}

async function writeCard(cardsDir: string, card: SourceCard): Promise<void> {
  await writeFile(
    join(cardsDir, `${card.source_id}.json`),
    JSON.stringify(card, null, 2),
    'utf8',
  );
}

async function writeRawText(
  packPath: string,
  sourceId: string,
  rawText: string,
  ext = '.html',
): Promise<string> {
  const rawDir = join(packPath, 'evidence', 'raw');
  await mkdir(rawDir, { recursive: true });
  const rel = `evidence/raw/${sourceId}${ext}`;
  await writeFile(join(packPath, rel), rawText, 'utf8');
  return rel;
}

async function appendReceipt(packPath: string, receipt: FetchReceipt): Promise<void> {
  await mkdir(join(packPath, 'evidence'), { recursive: true });
  await appendFile(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    JSON.stringify(receipt) + '\n',
    'utf8',
  );
}

function makeReceipt(partial: Partial<FetchReceipt> = {}): FetchReceipt {
  return {
    receipt_id: 'rcpt_aabbcc_1',
    source_id: 'src_aabbccddeeff',
    section_id: '01-test',
    requested_url: 'https://example.com/p',
    final_url: 'https://example.com/p',
    status: 200,
    status_text: 'OK',
    content_type: 'text/html',
    fetched_at: '2026-05-16T10:00:00.000Z',
    byte_count: 1024,
    sha256: 'a'.repeat(64),
    title: 'A Title',
    raw_text_path: null,
    fetch_outcome: 'ok',
    fetch_error: null,
    extraction_outcome: 'ok',
    extraction_extractor: 'heuristic',
    extraction_error: null,
    ...partial,
  };
}

async function writeLedger(
  packPath: string,
  overrides: SourceCardOverride[],
): Promise<void> {
  const dir = join(packPath, 'evidence');
  await mkdir(dir, { recursive: true });
  const lines = overrides.map((o) => JSON.stringify(o)).join('\n') + '\n';
  await writeFile(join(dir, 'source-card-overrides.jsonl'), lines, 'utf8');
}

async function setupCardWithBody(
  cardOverrides: Partial<SourceCard> = {},
  rawText = '<html><body>plain content</body></html>',
): Promise<SourceCard> {
  const cardsDir = await makeCardsDir(tmpDir);
  const card = makeCard(cardOverrides);
  await writeCard(cardsDir, card);
  const rawTextPath = await writeRawText(tmpDir, card.source_id, rawText);
  await appendReceipt(
    tmpDir,
    makeReceipt({
      source_id: card.source_id,
      receipt_id: card.receipt_id,
      requested_url: card.url,
      final_url: card.final_url,
      content_type: 'text/html',
      raw_text_path: rawTextPath,
      byte_count: rawText.length,
    }),
  );
  return card;
}

async function readCardFromDisk(sourceId: string): Promise<SourceCard> {
  const raw = await readFile(
    join(tmpDir, 'evidence', 'source-cards', `${sourceId}.json`),
    'utf8',
  );
  return JSON.parse(raw) as SourceCard;
}

// ─── Test 1: C2 closure positive — rebuild materializes overrides into raw ──

describe('R-013 — C2 closure (rebuild materializes overrides into raw card JSON)', () => {
  it('rebuilds source_type from "unknown" to override-effective value', async () => {
    const card = await setupCardWithBody({ source_type: 'unknown', publisher: null });

    await writeLedger(tmpDir, [
      {
        source_id: card.source_id,
        url: card.url,
        new_source_type: 'primary',
        reason: 'operator confirmed primary source',
        operator: 'r013-test',
        created_at: '2026-05-16T11:00:00.000Z',
        pack_version: '0.12.0',
      },
    ]);

    const before = await readCardFromDisk(card.source_id);
    expect(before.source_type).toBe('unknown');

    const result = await rebuildSourceCards({ packPath: tmpDir });
    expect(result.changed).toBe(1);
    expect(result.unchanged).toBe(0);

    const after = await readCardFromDisk(card.source_id);
    expect(after.source_type).toBe('primary');
  });

  it('rebuilds publisher from null to override-effective value', async () => {
    const card = await setupCardWithBody({ source_type: 'secondary', publisher: null });

    await writeLedger(tmpDir, [
      {
        source_id: card.source_id,
        url: card.url,
        new_publisher: 'Example Publisher',
        reason: 'operator filled in publisher',
        operator: 'r013-test',
        created_at: '2026-05-16T11:00:00.000Z',
        pack_version: '0.12.0',
      },
    ]);

    await rebuildSourceCards({ packPath: tmpDir });
    const after = await readCardFromDisk(card.source_id);
    expect(after.publisher).toBe('Example Publisher');
  });
});

// ─── Test 2: C3 closure positive — reviewer reads correct raw value ─────────

describe('R-013 — C3 closure (reviewer-style raw read sees rebuilt value)', () => {
  it('a consumer that reads card.source_type directly (no getEffectiveSourceType call) sees the rebuilt value', async () => {
    const card = await setupCardWithBody({ source_type: 'unknown', publisher: null });

    await writeLedger(tmpDir, [
      {
        source_id: card.source_id,
        url: card.url,
        new_source_type: 'primary',
        reason: 'reviewer-style read should reflect this',
        operator: 'r013-test',
        created_at: '2026-05-16T11:00:00.000Z',
        pack_version: '0.12.0',
      },
    ]);

    await rebuildSourceCards({ packPath: tmpDir });

    // Direct raw read — mimics the reviewer's source_quality_problem rule
    // pattern (reads card.source_type as a literal string, no override lookup).
    const reviewerView = await readCardFromDisk(card.source_id);
    expect(reviewerView.source_type).toBe('primary');
    // The whole point of R-013: no second-source override consultation needed
    // for the reviewer-style raw read to be correct.
  });
});

// ─── Test 3: defense-floor preservation #1 — R-009 still fires ──────────────

describe('R-013 — defense-floor preservation: R-009 source_identity_mismatch still fires during rebuild', () => {
  it('rebuild ledger event.after.severities includes source_identity_mismatch when card.title disagrees with fetched HTML <title>', async () => {
    const rawText =
      `<html><head><title>Workplace Injuries Spike After Daylight Saving Time</title></head>` +
      `<body><p>The article explores accident data following springtime DST transitions.</p></body></html>`;
    const card = await setupCardWithBody(
      {
        title: 'Rats clonidine morphine analgesia respiratory depression',
        source_type: 'unknown',
      },
      rawText,
    );

    const result = await rebuildSourceCards({ packPath: tmpDir });
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    const afterSevs = event.after.severities.map((s) => s.severity);
    expect(afterSevs).toContain('source_identity_mismatch');

    // And a subsequent audit run still surfaces it (defense floor preserved
    // end-to-end, not just in the rebuild ledger).
    const { report } = await runSourceCardAudit(tmpDir);
    const finding = report.findings.find((f) => f.source_id === card.source_id);
    expect(finding).toBeDefined();
    expect(report.totals.source_identity_mismatch).toBeGreaterThanOrEqual(1);
  });
});

// ─── Test 4: defense-floor preservation #2 — R-003 still fires ──────────────

describe('R-013 — defense-floor preservation: R-003 bot_check_or_captcha_detected still fires during rebuild', () => {
  it('rebuild ledger event.after.severities includes bot_check_or_captcha_detected on an Incapsula body', async () => {
    const rawText =
      `<html><body><script>var _Incapsula_Resource={SWUDNBZxPWh="cbb1ed"};(function(){})();</script></body></html>`;
    const card = await setupCardWithBody(
      {
        title: 'Confabulated COVID-19 mental health study',
        source_type: 'secondary',
      },
      rawText,
    );

    const result = await rebuildSourceCards({ packPath: tmpDir });
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    const afterSevs = event.after.severities.map((s) => s.severity);
    expect(afterSevs).toContain('bot_check_or_captcha_detected');

    const { report } = await runSourceCardAudit(tmpDir);
    const finding = report.findings.find((f) => f.source_id === card.source_id);
    expect(finding!.kind).toBe('bot_check_or_captcha_detected');
  });
});

// ─── Test 5: defense-floor preservation #3 — no HTTP ────────────────────────

describe('R-013 — defense-floor preservation: no HTTP requests during rebuild', () => {
  it('does not invoke global fetch during a rebuild pass over multiple cards', async () => {
    const cardsDir = await makeCardsDir(tmpDir);

    for (let i = 0; i < 5; i++) {
      const sid = `src_${i.toString(16).padStart(2, '0').repeat(6)}`;
      const card = makeCard({
        source_id: sid,
        receipt_id: `rcpt_${i.toString().padStart(2, '0')}_1`,
        url: `https://example.com/p${i}`,
        final_url: `https://example.com/p${i}`,
        title: `Title ${i}`,
      });
      await writeCard(cardsDir, card);
      const rawPath = await writeRawText(tmpDir, sid, `<html><body>card ${i}</body></html>`);
      await appendReceipt(
        tmpDir,
        makeReceipt({
          source_id: sid,
          receipt_id: card.receipt_id,
          requested_url: card.url,
          final_url: card.final_url,
          raw_text_path: rawPath,
          byte_count: 64,
        }),
      );
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      await rebuildSourceCards({ packPath: tmpDir });
      expect(fetchSpy).toHaveBeenCalledTimes(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

// ─── Test 6: clear_severities[] override semantics honored ──────────────────

describe('R-013 — clear_severities[] semantics preserved by rebuild', () => {
  it('rebuild does NOT silently strip severities; clearing happens at audit-time consumption via override', async () => {
    const rawText =
      `<html><body><script>var _Incapsula_Resource={SWUDNBZxPWh="cbb1ed"};(function(){})();</script></body></html>`;
    const card = await setupCardWithBody(
      { title: 'Confabulated card', source_type: 'secondary' },
      rawText,
    );

    await writeLedger(tmpDir, [
      {
        source_id: card.source_id,
        url: card.url,
        clear_severities: ['bot_check_or_captcha_detected'],
        reason: 'operator confirms fetch was legitimate',
        operator: 'r013-test',
        created_at: '2026-05-16T11:00:00.000Z',
        pack_version: '0.12.0',
      },
    ]);

    const result = await rebuildSourceCards({ packPath: tmpDir });
    const event = result.events[0]!;
    // Rebuild captures the RAW severities pre-clear; the clearing happens
    // at audit-time consumption via getEffectiveSeverities. This is the
    // "no silent strip" invariant — rebuild reports what the body actually
    // signals.
    const afterSevs = event.after.severities.map((s) => s.severity);
    expect(afterSevs).toContain('bot_check_or_captcha_detected');

    // The override IS honored at audit-time: the cleared severity is
    // absent from the effective audit finding.
    const { report } = await runSourceCardAudit(tmpDir);
    const finding = report.findings.find((f) => f.source_id === card.source_id);
    expect(finding!.severities ?? []).toHaveLength(0);
    expect(report.totals.bot_check_or_captcha_detected).toBe(0);
  });

  it('a severity NOT in clear_severities[] is preserved through rebuild AND audit', async () => {
    const rawText =
      `<html><head><title>Workplace Injuries Spike After Daylight Saving Time</title></head>` +
      `<body><script>var _Incapsula_Resource={SWUDNBZxPWh="cbb1ed"};</script></body></html>`;
    const card = await setupCardWithBody(
      {
        title: 'Rats clonidine morphine analgesia respiratory depression',
        source_type: 'unknown',
      },
      rawText,
    );

    // Clear ONLY bot_check; identity mismatch must remain
    await writeLedger(tmpDir, [
      {
        source_id: card.source_id,
        url: card.url,
        clear_severities: ['bot_check_or_captcha_detected'],
        reason: 'operator clears bot-check only',
        operator: 'r013-test',
        created_at: '2026-05-16T11:00:00.000Z',
        pack_version: '0.12.0',
      },
    ]);

    await rebuildSourceCards({ packPath: tmpDir });
    const { report } = await runSourceCardAudit(tmpDir);
    const finding = report.findings.find((f) => f.source_id === card.source_id);
    const severityNames = (finding!.severities ?? []).map((s) => s.severity);
    expect(severityNames).toContain('source_identity_mismatch');
    expect(severityNames).not.toContain('bot_check_or_captcha_detected');
  });
});

// ─── Test 7: audit-trail discipline — every rebuild logs ────────────────────

describe('R-013 — audit-trail discipline: every rebuild writes a ledger entry', () => {
  it('writes exactly one entry to evidence/source-card-rebuilds.jsonl per card', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    for (let i = 0; i < 3; i++) {
      const sid = `src_${i.toString(16).padStart(2, '0').repeat(6)}`;
      const card = makeCard({
        source_id: sid,
        receipt_id: `rcpt_${i.toString().padStart(2, '0')}_1`,
        url: `https://example.com/p${i}`,
        final_url: `https://example.com/p${i}`,
      });
      await writeCard(cardsDir, card);
      const rawPath = await writeRawText(
        tmpDir,
        sid,
        `<html><body>card ${i}</body></html>`,
      );
      await appendReceipt(
        tmpDir,
        makeReceipt({
          source_id: sid,
          receipt_id: card.receipt_id,
          requested_url: card.url,
          final_url: card.final_url,
          raw_text_path: rawPath,
          byte_count: 64,
        }),
      );
    }

    await rebuildSourceCards({ packPath: tmpDir });
    const records = await readRebuildLedger(tmpDir);
    expect(records).toHaveLength(3);
    for (const rec of records) {
      // Schema validation — ensures every required field is present.
      RebuildLedgerRecordSchema.parse(rec);
      expect(rec.rebuilt_by).toBe('operator');
      expect(rec.research_os_version).toBeDefined();
      expect(typeof rec.rebuild_id).toBe('string');
    }
  });
});

// ─── Test 8: idempotency ────────────────────────────────────────────────────

describe('R-013 — idempotency: repeated rebuilds with no override change are byte-stable', () => {
  it('second + third invocations write changed_fields=[] and leave card files byte-identical', async () => {
    const card = await setupCardWithBody({ source_type: 'unknown' });

    await writeLedger(tmpDir, [
      {
        source_id: card.source_id,
        url: card.url,
        new_source_type: 'primary',
        reason: 'first apply',
        operator: 'r013-test',
        created_at: '2026-05-16T11:00:00.000Z',
        pack_version: '0.12.0',
      },
    ]);

    // Run 1 — card.source_type flips from unknown → primary
    const r1 = await rebuildSourceCards({ packPath: tmpDir });
    expect(r1.events[0]!.changed_fields).toContain('source_type');
    expect(r1.changed).toBe(1);
    const bytesAfterRun1 = await readFile(
      join(tmpDir, 'evidence', 'source-cards', `${card.source_id}.json`),
      'utf8',
    );

    // Run 2 — nothing changes
    const r2 = await rebuildSourceCards({ packPath: tmpDir });
    expect(r2.events[0]!.changed_fields).toEqual([]);
    expect(r2.changed).toBe(0);
    expect(r2.unchanged).toBe(1);
    const bytesAfterRun2 = await readFile(
      join(tmpDir, 'evidence', 'source-cards', `${card.source_id}.json`),
      'utf8',
    );
    expect(bytesAfterRun2).toBe(bytesAfterRun1);

    // Run 3 — same idempotent fixed point
    const r3 = await rebuildSourceCards({ packPath: tmpDir });
    expect(r3.events[0]!.changed_fields).toEqual([]);
    expect(r3.changed).toBe(0);
    const bytesAfterRun3 = await readFile(
      join(tmpDir, 'evidence', 'source-cards', `${card.source_id}.json`),
      'utf8',
    );
    expect(bytesAfterRun3).toBe(bytesAfterRun2);

    // Ledger accumulates: 1 entry per run
    const records = await readRebuildLedger(tmpDir);
    expect(records).toHaveLength(3);
  });
});

// ─── Test 9: default --apply --from (no --rebuild-cards) leaves raw alone ───

describe('R-013 — default applySourceCardOverrides (no rebuild) leaves card raw fields unchanged', () => {
  it('audit --apply --from without --rebuild-cards is byte-identical to v0.11 + R-012 baseline behavior', async () => {
    const card = await setupCardWithBody({ source_type: 'unknown', publisher: null });

    const overrideFile = join(tmpDir, 'override.json');
    await writeFile(
      overrideFile,
      JSON.stringify([
        {
          source_id: card.source_id,
          url: card.url,
          new_source_type: 'primary',
          new_publisher: 'Example Publisher',
          reason: 'apply only — no rebuild',
          operator: 'r013-test',
          created_at: '2026-05-16T11:00:00.000Z',
          pack_version: '0.12.0',
        },
      ]),
      'utf8',
    );

    const bytesBefore = await readFile(
      join(tmpDir, 'evidence', 'source-cards', `${card.source_id}.json`),
      'utf8',
    );

    // Call applySourceCardOverrides directly (the existing public API,
    // unchanged behavior). NO rebuild side-effect.
    const result = await applySourceCardOverrides(tmpDir, overrideFile);
    expect(result.applied).toBe(1);

    const bytesAfter = await readFile(
      join(tmpDir, 'evidence', 'source-cards', `${card.source_id}.json`),
      'utf8',
    );
    expect(bytesAfter).toBe(bytesBefore);

    // And no rebuild ledger was created.
    expect(existsSync(rebuildLedgerPath(tmpDir))).toBe(false);
  });
});

// ─── Test 10: --rebuild-cards without --from rebuilds from current ledger ──

describe('R-013 — rebuildSourceCards without a new override file uses current ledger state', () => {
  it('rebuilds all cards using the existing ledger when no new overrides are provided', async () => {
    const card = await setupCardWithBody({ source_type: 'unknown' });

    // Override pre-exists in the ledger (perhaps from an earlier apply).
    await writeLedger(tmpDir, [
      {
        source_id: card.source_id,
        url: card.url,
        new_source_type: 'primary',
        reason: 'pre-existing ledger entry',
        operator: 'r013-test',
        created_at: '2026-05-16T11:00:00.000Z',
        pack_version: '0.12.0',
      },
    ]);

    // rebuildSourceCards called with NO override argument; reads current ledger.
    const result = await rebuildSourceCards({ packPath: tmpDir });
    expect(result.changed).toBe(1);

    const after = await readCardFromDisk(card.source_id);
    expect(after.source_type).toBe('primary');
  });
});

// ─── Test 11: frozen-pack refusal ───────────────────────────────────────────

describe('R-013 — frozen-pack refusal', () => {
  it('throws ResearchOSError when audits/freeze-receipt.json is present', async () => {
    await setupCardWithBody();
    await mkdir(join(tmpDir, 'audits'), { recursive: true });
    await writeFile(
      join(tmpDir, 'audits', 'freeze-receipt.json'),
      JSON.stringify({ frozen_at: '2026-05-16T12:00:00Z' }),
      'utf8',
    );

    await expect(rebuildSourceCards({ packPath: tmpDir })).rejects.toBeInstanceOf(
      ResearchOSError,
    );
  });
});

// ─── Test 12: ExtractionResult reconstruction round-trip ────────────────────

describe('R-013 — rebuild round-trip via buildCard preserves non-override-affected fields', () => {
  it('title / asserts / key_points / limitations / scope / not / relevance are byte-identical after rebuild with no override', async () => {
    const card = await setupCardWithBody({
      source_type: 'secondary',
      publisher: 'Example',
      title: 'A meaningful research title about a domain',
      relevance: 'high',
      key_points: ['kp1', 'kp2', 'kp3'],
      limitations: ['lim1'],
      asserts: 'A specific assert string with content.',
      scope: 'population: adults; outcome: x',
      not: 'children excluded',
    });

    await rebuildSourceCards({ packPath: tmpDir });
    const after = await readCardFromDisk(card.source_id);
    expect(after.title).toBe(card.title);
    expect(after.asserts).toBe(card.asserts);
    expect(after.key_points).toEqual(card.key_points);
    expect(after.limitations).toEqual(card.limitations);
    expect(after.scope).toBe(card.scope);
    expect(after.not).toBe(card.not);
    expect(after.relevance).toBe(card.relevance);
    expect(after.publisher).toBe(card.publisher);
    expect(after.source_type).toBe(card.source_type);
  });
});

// ─── Test 13: card with no fetch receipt is skipped, no ledger entry ────────

describe('R-013 — cards without a fetch receipt are skipped', () => {
  it('does not throw and does not write a ledger entry for a card lacking a receipt', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    const card = makeCard();
    await writeCard(cardsDir, card);
    // NO appendReceipt — card has no fetch-log entry.

    const result = await rebuildSourceCards({ packPath: tmpDir });
    expect(result.skipped).toBe(1);
    expect(result.changed).toBe(0);
    expect(result.unchanged).toBe(0);
    expect(result.events).toHaveLength(0);
    expect(existsSync(rebuildLedgerPath(tmpDir))).toBe(false);
  });
});
