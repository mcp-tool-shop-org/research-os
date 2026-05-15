/**
 * R-003 + R-005 (v0.10 Slice 3) — source-card audit severity integration tests.
 *
 * runSourceCardAudit gains the ability to detect bot-check/CAPTCHA pages
 * (R-003) and word-count-ratio hallucination patterns (R-005). The audit
 * reads fetch-log.jsonl to find the latest receipt per source_id, opens
 * the raw text body when present, and runs detectSeverities. Findings
 * elevate the `kind` field above the existing classifier-precedence chain
 * and surface a `severities[]` array with reasons[] for each signal that
 * fired. Operator override via clear_severities clears the kind back to
 * existing precedence.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runSourceCardAudit } from '../../src/sources/source-card-audit.js';
import type { SourceCard, FetchReceipt } from '../../src/sources/schema.js';
import type { SourceCardOverride } from '../../src/sources/source-card-overrides-schema.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'research-os-audit-sev-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

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
    fetched_at: '2026-05-15T10:00:00.000Z',
    publisher: 'Example',
    published_at: null,
    title: 'A Title',
    source_type: 'secondary',
    relevance: 'medium',
    key_points: ['point one'],
    limitations: [],
    asserts: 'It asserts.',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-15T10:00:00.000Z',
    ...partial,
  };
}

async function writeCard(cardsDir: string, card: SourceCard): Promise<void> {
  await writeFile(join(cardsDir, `${card.source_id}.json`), JSON.stringify(card, null, 2), 'utf8');
}

async function writeRawText(packPath: string, sourceId: string, rawText: string, ext = '.html'): Promise<string> {
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
    fetched_at: '2026-05-15T10:00:00.000Z',
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

async function writeLedger(packPath: string, overrides: SourceCardOverride[]): Promise<void> {
  const dir = join(packPath, 'evidence');
  await mkdir(dir, { recursive: true });
  const lines = overrides.map((o) => JSON.stringify(o)).join('\n') + '\n';
  await writeFile(join(dir, 'source-card-overrides.jsonl'), lines, 'utf8');
}

// ─── Audit surfaces R-003 finding kind ───────────────────────────────────────

describe('runSourceCardAudit — bot_check_or_captcha_detected finding', () => {
  it('flags a card whose raw body is an Incapsula bot-check page', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    const card = makeCard();
    await writeCard(cardsDir, card);

    const rawText =
      `<html><body><script>var _Incapsula_Resource={SWUDNBZxPWh="cbb1ed"};(function(){})();</script></body></html>`;
    const rawTextPath = await writeRawText(tmpDir, card.source_id, rawText);
    await appendReceipt(
      tmpDir,
      makeReceipt({ raw_text_path: rawTextPath, byte_count: rawText.length }),
    );

    const { report } = await runSourceCardAudit(tmpDir);
    const finding = report.findings[0]!;
    expect(finding.kind).toBe('bot_check_or_captcha_detected');
    expect(report.totals.bot_check_or_captcha_detected).toBe(1);
    expect(finding.severities).toBeDefined();
    const bot = finding.severities!.find((s) => s.severity === 'bot_check_or_captcha_detected');
    expect(bot).toBeDefined();
    expect(bot!.reasons.some((r) => /marker:_incapsula_resource/i.test(r))).toBe(true);
  });
});

// ─── Audit surfaces R-005 finding kind ───────────────────────────────────────

describe('runSourceCardAudit — extraction_suspect_word_count_mismatch finding', () => {
  it('flags a card whose extracted text vastly exceeds the body word count', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    const bodyWords = Array.from({ length: 150 }, (_, i) => `word${i}`).join(' ');
    const rawText = `<html><body><p>${bodyWords}</p></body></html>`;
    const longAsserts = Array.from({ length: 400 }, (_, i) => `lipsum${i}`).join(' ');
    const card = makeCard({
      asserts: longAsserts,
      key_points: [
        Array.from({ length: 250 }, (_, i) => `kp${i}`).join(' '),
        Array.from({ length: 250 }, (_, i) => `kp${i + 250}`).join(' '),
      ],
      scope: 'population: us workers; outcome: accidents',
      not: 'pediatric excluded',
    });
    await writeCard(cardsDir, card);

    const rawTextPath = await writeRawText(tmpDir, card.source_id, rawText);
    await appendReceipt(
      tmpDir,
      makeReceipt({ raw_text_path: rawTextPath, byte_count: rawText.length }),
    );

    const { report } = await runSourceCardAudit(tmpDir);
    const finding = report.findings[0]!;
    expect(finding.kind).toBe('extraction_suspect_word_count_mismatch');
    expect(report.totals.extraction_suspect_word_count_mismatch).toBe(1);
    const ratio = finding.severities!.find(
      (s) => s.severity === 'extraction_suspect_word_count_mismatch',
    );
    expect(ratio).toBeDefined();
    expect(ratio!.reasons.some((r) => /body_words=/i.test(r))).toBe(true);
  });
});

// ─── R-003 + R-005 both fire on one card (APA replay) ────────────────────────

describe('runSourceCardAudit — both severities fire on the APA Incapsula replay card', () => {
  it('records both severities; kind defaults to the higher-priority bot_check_or_captcha_detected', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    const rawText =
      `<html><body><script>var _Incapsula_Resource={SWUDNBZxPWh="cbb1ed"};(function(){})();</script></body></html>`;
    const longAsserts = Array.from({ length: 400 }, (_, i) => `confab${i}`).join(' ');
    const longKp = Array.from({ length: 250 }, (_, i) => `kp${i}`).join(' ');
    const card = makeCard({
      title: 'Confabulated COVID-19 Bangladesh mental health study',
      asserts: longAsserts,
      key_points: [longKp, longKp],
      scope: 'population: bangladesh workers; outcome: workplace accidents',
      not: 'pediatric excluded',
    });
    await writeCard(cardsDir, card);

    const rawTextPath = await writeRawText(tmpDir, card.source_id, rawText);
    await appendReceipt(
      tmpDir,
      makeReceipt({ raw_text_path: rawTextPath, byte_count: rawText.length }),
    );

    const { report } = await runSourceCardAudit(tmpDir);
    const finding = report.findings[0]!;
    expect(finding.kind).toBe('bot_check_or_captcha_detected');
    expect(report.totals.bot_check_or_captcha_detected).toBe(1);
    expect(report.totals.extraction_suspect_word_count_mismatch).toBe(1);
    const severityNames = (finding.severities ?? []).map((s) => s.severity).sort();
    expect(severityNames).toEqual(
      ['bot_check_or_captcha_detected', 'extraction_suspect_word_count_mismatch'].sort(),
    );
  });
});

// ─── Operator override clears the severity ───────────────────────────────────

describe('runSourceCardAudit — clear_severities override removes the kind', () => {
  it('a clear_severities override on the source_id falls through to override_applied / no_action', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    const card = makeCard();
    await writeCard(cardsDir, card);

    const rawText =
      `<html><body><script>var _Incapsula_Resource={SWUDNBZxPWh="cbb1ed"};</script></body></html>`;
    const rawTextPath = await writeRawText(tmpDir, card.source_id, rawText);
    await appendReceipt(
      tmpDir,
      makeReceipt({ raw_text_path: rawTextPath, byte_count: rawText.length }),
    );

    await writeLedger(tmpDir, [
      {
        source_id: card.source_id,
        url: card.url,
        clear_severities: ['bot_check_or_captcha_detected'],
        reason: 'operator has out-of-band evidence the fetch is legitimate',
        operator: 'test-op',
        created_at: '2026-05-15T11:00:00.000Z',
        pack_version: '0.10.0',
      },
    ]);

    const { report } = await runSourceCardAudit(tmpDir);
    const finding = report.findings[0]!;
    expect(finding.kind).not.toBe('bot_check_or_captcha_detected');
    expect(report.totals.bot_check_or_captcha_detected).toBe(0);
    // Override has applied — effective severities for this card is empty.
    expect(finding.severities ?? []).toHaveLength(0);
    expect(finding.override_in_effect).toBe(true);
  });
});

// ─── Audit is read-only — does not mutate cards or ledger ───────────────────

describe('runSourceCardAudit — severity detection is read-only', () => {
  it('does not modify source cards or the override ledger when reporting severities', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    const card = makeCard();
    await writeCard(cardsDir, card);

    const rawText =
      `<html><body><script>var _Incapsula_Resource={SWUDNBZxPWh="cbb1ed"};</script></body></html>`;
    const rawTextPath = await writeRawText(tmpDir, card.source_id, rawText);
    await appendReceipt(
      tmpDir,
      makeReceipt({ raw_text_path: rawTextPath, byte_count: rawText.length }),
    );

    const { readFile } = await import('node:fs/promises');
    const cardBefore = await readFile(join(cardsDir, `${card.source_id}.json`), 'utf8');
    const rawBefore = await readFile(join(tmpDir, rawTextPath), 'utf8');

    await runSourceCardAudit(tmpDir);

    const cardAfter = await readFile(join(cardsDir, `${card.source_id}.json`), 'utf8');
    const rawAfter = await readFile(join(tmpDir, rawTextPath), 'utf8');
    expect(cardAfter).toBe(cardBefore);
    expect(rawAfter).toBe(rawBefore);
  });
});

// ─── Configurable thresholds via research.yaml ───────────────────────────────

describe('runSourceCardAudit — thresholds configurable via research.yaml audit block', () => {
  it('honours per-pack severity thresholds in research.yaml', async () => {
    const cardsDir = await makeCardsDir(tmpDir);

    // 80 body words, 200 extracted words, ratio = 2.5
    // Default would NOT fire (default body threshold = 200 yes, but extracted threshold 800 not met).
    // Tight pack thresholds will fire: maxSourceWords=100, minExtractedWords=150, minRatio=2.
    const bodyWords = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
    const rawText = `<html><body><p>${bodyWords}</p></body></html>`;
    const asserts = Array.from({ length: 200 }, (_, i) => `lipsum${i}`).join(' ');
    const card = makeCard({ asserts, key_points: [] });
    await writeCard(cardsDir, card);

    const rawTextPath = await writeRawText(tmpDir, card.source_id, rawText);
    await appendReceipt(
      tmpDir,
      makeReceipt({ raw_text_path: rawTextPath, byte_count: rawText.length }),
    );

    // Sanity: with default thresholds, no R-005 firing
    const { report: defaultReport } = await runSourceCardAudit(tmpDir);
    expect(defaultReport.totals.extraction_suspect_word_count_mismatch).toBe(0);

    // Write a research.yaml with tight thresholds
    const researchYaml =
      `research_os_version: "0.10.0"\n` +
      `created_at: "2026-05-15T10:00:00.000Z"\n` +
      `topic: "Threshold configuration test for v0.10 Slice 3"\n` +
      `audit:\n` +
      `  severity_thresholds:\n` +
      `    extraction_word_count_ratio:\n` +
      `      max_source_words: 100\n` +
      `      min_extracted_words: 150\n` +
      `      min_ratio: 2\n`;
    await writeFile(join(tmpDir, 'research.yaml'), researchYaml, 'utf8');

    const { report: tightReport } = await runSourceCardAudit(tmpDir);
    expect(tightReport.totals.extraction_suspect_word_count_mismatch).toBe(1);
    expect(tightReport.findings[0]!.kind).toBe('extraction_suspect_word_count_mismatch');
  });
});

// ─── No receipt / no raw_text → severity detection gracefully degrades ──────

describe('runSourceCardAudit — missing raw text does not crash', () => {
  it('completes the audit when receipt has raw_text_path=null (no severity computed)', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    const card = makeCard();
    await writeCard(cardsDir, card);

    // Receipt exists but raw_text_path is null (e.g., binary content)
    await appendReceipt(tmpDir, makeReceipt({ raw_text_path: null, byte_count: 100_000 }));

    const { report } = await runSourceCardAudit(tmpDir);
    expect(report.totals.cards_scanned).toBe(1);
    expect(report.totals.bot_check_or_captcha_detected).toBe(0);
    expect(report.totals.extraction_suspect_word_count_mismatch).toBe(0);
  });
});
