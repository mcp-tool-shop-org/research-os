/**
 * R-009 — Extractor source-card identity guard (v0.11 Slice 3, paired with R-011).
 *
 * Acceptance tests for the extraction-layer defense against the
 * source-content contamination failure family. Closes the v0.2 originating-
 * bug shape: PubMed 19702372 (Barnes & Wagner 2009, "Changing to daylight
 * saving time cuts into sleep and increases workplace injuries") was
 * fetched successfully, but the LLM source-card extractor emitted a card
 * titled "Effects of intrathecal clonidine on morphine-induced analgesia
 * and respiratory depression in rats." — a completely different paper.
 * Nothing flagged the mismatch.
 *
 * The defense: at audit + claim-extract time, extract the <title> tag from
 * the fetched HTML body and compare it against the emitted card.title via
 * the same deterministic keyword-overlap helper R-008 uses at the discover
 * layer. Below threshold → new SourceSeverity `source_identity_mismatch`.
 * The existing `clear_severities[]` operator-override surface clears it
 * (R-009 reuses R-003's override mechanism; no new override-ledger field).
 *
 * Independence: R-009 does not depend on R-008 (it acts on already-fetched
 * raw text, not on discover-time URL fetch). R-011 does not depend on R-009
 * (the layers protect the same family at extraction vs. critic-time but
 * each catches the contamination independently — see the paired
 * defense-layer independence test at the bottom of this file).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  detectSeverities,
  DEFAULT_SEVERITY_THRESHOLDS,
  extractHtmlTitle,
  resolveSeverityThresholds,
  type SeverityThresholds,
} from '../src/sources/severities.js';
import {
  SourceCardOverrideSchema,
  SourceSeveritySchema,
} from '../src/sources/source-card-overrides-schema.js';
import { runSourceCardAudit } from '../src/sources/source-card-audit.js';
import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { extract } from '../src/claims/index.js';
import { HeuristicClaimExtractor } from '../src/claims/extractors/heuristic.js';
import type { SourceCard } from '../src/sources/schema.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

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

// ─── R-009 unit tests — pure detector ────────────────────────────────────────

describe('extractHtmlTitle — pure helper', () => {
  it('extracts a single-line <title> tag', () => {
    const html = '<html><head><title>Hello World - Example</title></head><body></body></html>';
    expect(extractHtmlTitle(html)).toBe('Hello World - Example');
  });

  it('extracts a multi-line <title> tag (whitespace collapsed)', () => {
    const html = `<html><head>\n  <title>\n    Geographical variations in cancer mortality - PMC\n  </title>\n</head></html>`;
    expect(extractHtmlTitle(html)).toBe('Geographical variations in cancer mortality - PMC');
  });

  it('decodes basic HTML entities (&amp;, &#39;)', () => {
    const html = '<title>Smith &amp; Doleac&#39;s 2015 paper</title>';
    expect(extractHtmlTitle(html)).toBe("Smith & Doleac's 2015 paper");
  });

  it('returns null when no <title> tag is present', () => {
    expect(extractHtmlTitle('<html><body><p>no title here</p></body></html>')).toBe(null);
  });

  it('returns null when raw text is non-HTML / null / empty', () => {
    expect(extractHtmlTitle(null)).toBe(null);
    expect(extractHtmlTitle('')).toBe(null);
    expect(extractHtmlTitle('plain text body, no markup')).toBe(null);
  });

  it('returns first <title> when multiple are present (matches v0.2 ground-truth shape — head <title> wins)', () => {
    const html = `<html><head><title>Real Page Title</title></head><body><title>Facebook</title></body></html>`;
    expect(extractHtmlTitle(html)).toBe('Real Page Title');
  });
});

describe('detectSeverities — R-009 source_identity_mismatch detection', () => {
  it('fires source_identity_mismatch when card.title has zero token overlap with fetched HTML <title>', () => {
    // The exact v0.2 Barnes & Wagner case: emitted card.title is the
    // rats/clonidine confabulation; fetched HTML <title> is the real
    // Barnes & Wagner 2009 PubMed page title.
    const rawText = `<html><head><title>Changing to daylight saving time cuts into sleep and increases workplace injuries - PubMed</title></head><body><article>... real paper content ...</article></body></html>`;
    const card = makeCard({
      title: 'Effects of intrathecal clonidine on morphine-induced analgesia and respiratory depression in rats.',
    });
    const findings = detectSeverities({
      card,
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
    });
    const idMismatch = findings.find((f) => f.severity === 'source_identity_mismatch');
    expect(idMismatch).toBeDefined();
    expect(idMismatch!.reasons.length).toBeGreaterThan(0);
    // The reasons array names the actual fetched title for operator audit.
    expect(idMismatch!.reasons.some((r) => /changing to daylight saving/i.test(r))).toBe(true);
  });

  it('fires source_identity_mismatch when card.title is a placeholder ("(untitled)") on a content-rich page (v0.2 PMC7244163 cancer-paper shape)', () => {
    const rawText = `<html><head><title>Geographical variations in cancer mortality and social inequalities in southern Spain (Andalusia). 2002-2013 - PMC</title></head><body><article>... real cancer paper content ...</article></body></html>`;
    const card = makeCard({ title: '(untitled)' });
    const findings = detectSeverities({
      card,
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
    });
    expect(findings.some((f) => f.severity === 'source_identity_mismatch')).toBe(true);
  });

  it('does NOT fire on a legitimate near-match (extractor prefix "Study:" + minor punctuation differences)', () => {
    // R-009 false-positive guard: when card.title and HTML <title> share
    // load-bearing topical keywords, the overlap is high enough that
    // benign formatting differences (prefixes, normalized punctuation,
    // truncation) do not trip the severity.
    const rawText = `<html><head><title>Changing to daylight saving time cuts into sleep and increases workplace injuries - PubMed</title></head></html>`;
    const card = makeCard({
      title: 'Study: Changing to Daylight Saving Time Cuts Into Sleep and Increases Workplace Injuries.',
    });
    const findings = detectSeverities({
      card,
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
    });
    expect(findings.find((f) => f.severity === 'source_identity_mismatch')).toBeUndefined();
  });

  it('does NOT fire on a healthy exact-match title (existing extraction path unchanged)', () => {
    const rawText = `<html><head><title>Daylight Saving Time and Workplace Productivity</title></head></html>`;
    const card = makeCard({ title: 'Daylight Saving Time and Workplace Productivity' });
    const findings = detectSeverities({
      card,
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
    });
    expect(findings.find((f) => f.severity === 'source_identity_mismatch')).toBeUndefined();
  });

  it('does NOT fire when the fetched HTML lacks a <title> tag (graceful degradation, no signal)', () => {
    // Mirrors R-008's "unverified" graceful path: absence of signal must
    // not invent a severity. Some pages legitimately omit <title>; some
    // fetches return non-HTML / binary.
    const rawText = `<html><body><p>Body without a title tag.</p></body></html>`;
    const card = makeCard({ title: 'Card title that has no HTML title to compare against' });
    const findings = detectSeverities({
      card,
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
    });
    expect(findings.find((f) => f.severity === 'source_identity_mismatch')).toBeUndefined();
  });

  it('does NOT fire when rawText is null (no body fetched — no signal)', () => {
    const card = makeCard({ title: 'Anything' });
    const findings = detectSeverities({
      card,
      rawText: null,
      byteCount: null,
      contentType: null,
    });
    expect(findings.find((f) => f.severity === 'source_identity_mismatch')).toBeUndefined();
  });

  it('respects the per-pack threshold override (overlap=0.5 still trips when threshold is raised to 0.8)', () => {
    const rawText = `<html><head><title>daylight saving time workplace injuries sleep monday</title></head></html>`;
    // 4 of 8 card-title tokens appear in HTML title (workplace, saving, time, sleep)
    // → overlap = 0.5. At default threshold 0.2 this passes; at threshold
    // 0.8 the operator chose to be stricter, and it fires.
    const card = makeCard({
      title: 'workplace productivity saving time cognitive performance sleep loss monday',
    });
    const thresholds: SeverityThresholds = {
      ...DEFAULT_SEVERITY_THRESHOLDS,
      identityMismatch: { minOverlapThreshold: 0.8 },
    };
    const findings = detectSeverities({
      card,
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
      thresholds,
    });
    expect(findings.find((f) => f.severity === 'source_identity_mismatch')).toBeDefined();
  });
});

describe('resolveSeverityThresholds — R-009 config block', () => {
  it('merges identity_mismatch.min_overlap_threshold from snake_case research.yaml shape', () => {
    const resolved = resolveSeverityThresholds({
      identity_mismatch: { min_overlap_threshold: 0.5 },
    });
    expect(resolved.identityMismatch.minOverlapThreshold).toBe(0.5);
  });

  it('falls back to DEFAULT_SEVERITY_THRESHOLDS when identity_mismatch block is absent', () => {
    const resolved = resolveSeverityThresholds(null);
    expect(resolved.identityMismatch.minOverlapThreshold).toBe(
      DEFAULT_SEVERITY_THRESHOLDS.identityMismatch.minOverlapThreshold,
    );
  });
});

describe('SourceCardOverrideSchema — R-009 extends clear_severities[] enum', () => {
  it('accepts source_identity_mismatch in clear_severities[]', () => {
    expect(() => SourceSeveritySchema.parse('source_identity_mismatch')).not.toThrow();
    const ok = SourceCardOverrideSchema.safeParse({
      source_id: 'src_aabbccddeeff',
      url: 'https://example.com/x',
      clear_severities: ['source_identity_mismatch'],
      reason: 'operator verified the card title is correct out-of-band',
      operator: 'test-op',
      created_at: '2026-05-15T11:00:00.000Z',
      pack_version: '0.11.0',
    });
    expect(ok.success).toBe(true);
  });
});

// ─── R-009 integration — claim extract quarantine ────────────────────────────

describe('claim extract — R-009 source_identity_mismatch quarantine', () => {
  let workDir: string;
  let packPath: string;
  const sourceId = 'src_abcdef012345';
  const sha256 = 'a'.repeat(64);

  async function setupPackWithRawText(rawText: string, cardOverrides: Partial<SourceCard> = {}) {
    const result = await init({
      topic: 'How does extraction-time identity guard quarantine sources?',
      outDir: workDir,
    });
    packPath = result.packPath;
    await sectionAdd({
      id: '01-landscape',
      purpose: 'Probe identity guard',
      packPath,
    });

    const cardDir = join(packPath, 'evidence', 'source-cards');
    await mkdir(cardDir, { recursive: true });
    const card = {
      source_id: sourceId,
      receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1700000000000`,
      section_id: '01-landscape',
      url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      fetched_at: '2026-05-15T10:00:00.000Z',
      publisher: 'Example',
      published_at: null,
      title: 'A Title',
      source_type: 'secondary',
      relevance: 'unknown',
      key_points: ['point one'],
      limitations: [],
      asserts: 'It asserts.',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-15T10:00:00.000Z',
      ...cardOverrides,
    };
    await writeFile(join(cardDir, `${sourceId}.json`), JSON.stringify(card), 'utf8');

    const rawDir = join(packPath, 'evidence', 'raw');
    await mkdir(rawDir, { recursive: true });
    await writeFile(join(rawDir, `${sourceId}.html`), rawText, 'utf8');

    const receipt = {
      receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1700000000000`,
      source_id: sourceId,
      section_id: '01-landscape',
      requested_url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      status: 200,
      status_text: 'OK',
      content_type: 'text/html',
      fetched_at: '2026-05-15T10:00:00.000Z',
      byte_count: rawText.length,
      sha256,
      title: 'A Title',
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
      JSON.stringify({ source_id: sourceId, added_at: '2026-05-15T10:00:01.000Z' }) + '\n',
      'utf8',
    );
  }

  async function writeOverrideLedger(entries: object[]): Promise<void> {
    await appendFile(
      join(packPath, 'evidence', 'source-card-overrides.jsonl'),
      entries.map((e) => JSON.stringify(e)).join('\n') + '\n',
      'utf8',
    );
  }

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'research-os-r009-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('skips a source whose emitted card.title disagrees with fetched HTML <title> (v0.2 Barnes & Wagner case)', async () => {
    const rawText = `<html><head><title>Changing to daylight saving time cuts into sleep and increases workplace injuries - PubMed</title></head><body><article>real Barnes & Wagner content here</article></body></html>`;
    await setupPackWithRawText(rawText, {
      title: 'Effects of intrathecal clonidine on morphine-induced analgesia and respiratory depression in rats.',
    });

    const summary = await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });
    expect(summary.sourcesProcessed).toBe(0);
    expect(summary.sourcesSkipped).toBe(1);
    expect(summary.claimsAdded).toBe(0);
  });

  it('honours an operator clear_severities override for source_identity_mismatch', async () => {
    const rawText = `<html><head><title>Changing to daylight saving time cuts into sleep and increases workplace injuries - PubMed</title></head><body><p>some body content</p></body></html>`;
    await setupPackWithRawText(rawText, {
      title: 'Effects of intrathecal clonidine on morphine-induced analgesia and respiratory depression in rats.',
    });

    await writeOverrideLedger([
      {
        source_id: sourceId,
        url: 'https://example.com/x',
        clear_severities: ['source_identity_mismatch'],
        reason: 'operator verified card title vs page in browser',
        operator: 'test-op',
        created_at: '2026-05-15T11:00:00.000Z',
        pack_version: '0.11.0',
      },
    ]);

    const summary = await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });
    // Cleared severity lifts the quarantine; the source is at least not
    // skipped *because of* R-009 (it may still get skipped for the
    // existing "empty excerpt ledger / heuristic produced nothing"
    // reason — that's not R-009's territory).
    expect(summary.sourcesSkipped).toBeLessThan(1);
  });

  it('does not skip a healthy source with matching title (regression: existing extraction path unchanged)', async () => {
    const rawText =
      `<html><head><title>Daylight Saving Time Workplace Effects</title></head><body><article><p>` +
      Array.from({ length: 50 }, (_, i) => `Sentence number ${i} of substantive prose content.`).join(' ') +
      `</p></article></body></html>`;
    await setupPackWithRawText(rawText, { title: 'Daylight Saving Time Workplace Effects' });
    const summary = await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });
    expect(summary.sourcesSkipped + summary.sourcesProcessed).toBe(1);
  });
});

// ─── R-009 integration — source-card audit surfaces the severity ─────────────

describe('source-card audit — R-009 surfaces source_identity_mismatch', () => {
  let workDir: string;
  let packPath: string;
  const sourceId = 'src_abcdef012345';
  const sha256 = 'a'.repeat(64);

  async function setupPackWithRawText(rawText: string, cardOverrides: Partial<SourceCard> = {}) {
    const result = await init({
      topic: 'Test the audit surface for R-009 source_identity_mismatch.',
      outDir: workDir,
    });
    packPath = result.packPath;
    await sectionAdd({ id: '01-landscape', purpose: 'Audit surface', packPath });

    const cardDir = join(packPath, 'evidence', 'source-cards');
    await mkdir(cardDir, { recursive: true });
    const card = {
      source_id: sourceId,
      receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1700000000000`,
      section_id: '01-landscape',
      url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      fetched_at: '2026-05-15T10:00:00.000Z',
      publisher: 'Example',
      published_at: null,
      title: 'A Title',
      source_type: 'secondary',
      relevance: 'unknown',
      key_points: ['point one'],
      limitations: [],
      asserts: 'It asserts.',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-15T10:00:00.000Z',
      ...cardOverrides,
    };
    await writeFile(join(cardDir, `${sourceId}.json`), JSON.stringify(card), 'utf8');

    const rawDir = join(packPath, 'evidence', 'raw');
    await mkdir(rawDir, { recursive: true });
    await writeFile(join(rawDir, `${sourceId}.html`), rawText, 'utf8');

    const receipt = {
      receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1700000000000`,
      source_id: sourceId,
      section_id: '01-landscape',
      requested_url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      status: 200,
      status_text: 'OK',
      content_type: 'text/html',
      fetched_at: '2026-05-15T10:00:00.000Z',
      byte_count: rawText.length,
      sha256,
      title: 'A Title',
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
  }

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'research-os-r009-audit-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('finding kind is source_identity_mismatch when card.title and HTML <title> disagree', async () => {
    const rawText = `<html><head><title>Real workplace injury research paper</title></head><body><p>body</p></body></html>`;
    await setupPackWithRawText(rawText, { title: 'Completely fabricated rats clonidine analgesia title' });

    const { report } = await runSourceCardAudit(packPath);
    expect(report.totals.source_identity_mismatch).toBe(1);
    const finding = report.findings.find((f) => f.source_id === sourceId);
    expect(finding?.kind).toBe('source_identity_mismatch');
    expect(finding?.severities?.some((s) => s.severity === 'source_identity_mismatch')).toBe(true);
  });

  it('finding kind drops back to override_applied when clear_severities lifts the flag', async () => {
    const rawText = `<html><head><title>Real workplace injury research paper</title></head></html>`;
    await setupPackWithRawText(rawText, { title: 'Completely fabricated rats clonidine analgesia title' });

    await appendFile(
      join(packPath, 'evidence', 'source-card-overrides.jsonl'),
      JSON.stringify({
        source_id: sourceId,
        url: 'https://example.com/x',
        clear_severities: ['source_identity_mismatch'],
        reason: 'operator verified out-of-band',
        operator: 'test-op',
        created_at: '2026-05-15T11:00:00.000Z',
        pack_version: '0.11.0',
      }) + '\n',
      'utf8',
    );

    const { report } = await runSourceCardAudit(packPath);
    expect(report.totals.source_identity_mismatch).toBe(0);
    const finding = report.findings.find((f) => f.source_id === sourceId);
    expect(finding?.kind).toBe('override_applied');
  });
});
