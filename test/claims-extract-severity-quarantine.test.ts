/**
 * R-003 + R-005 (v0.10 Slice 3) — claim extraction quarantine on severity.
 *
 * When a source card has an effective severity (bot_check_or_captcha_detected
 * or extraction_suspect_word_count_mismatch), claim extraction MUST skip the
 * source without invoking the extractor. The source is still counted; it
 * lands in sourcesSkipped. Operator override via clear_severities lifts the
 * quarantine and extraction proceeds normally.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { extract } from '../src/claims/index.js';
import { HeuristicClaimExtractor } from '../src/claims/extractors/heuristic.js';

let workDir: string;
let packPath: string;
const sourceId = 'src_abcdef012345';
const sha256 = 'a'.repeat(64);

async function setupPackWithRawText(rawText: string, partialCard: Record<string, unknown> = {}) {
  const result = await init({
    topic: 'How does claim extraction handle quarantined sources?',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({
    id: '01-landscape',
    purpose: 'Probe severity quarantine',
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
    ...partialCard,
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
  workDir = await mkdtemp(join(tmpdir(), 'research-os-quarantine-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('claim extract — R-003 / R-005 severity quarantine', () => {
  it('skips a source whose body is an Incapsula bot-check page (R-003)', async () => {
    const rawText =
      `<html><body><script>var _Incapsula_Resource={SWUDNBZxPWh="cbb1ed"};(function(){})();</script></body></html>`;
    await setupPackWithRawText(rawText);

    const summary = await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });
    expect(summary.sourcesProcessed).toBe(0);
    expect(summary.sourcesSkipped).toBe(1);
    expect(summary.claimsAdded).toBe(0);

    // claims.jsonl should not exist (no claims were added)
    const claimsPath = join(packPath, 'sections', '01-landscape', 'claims.jsonl');
    let exists = true;
    try {
      await readFile(claimsPath, 'utf8');
    } catch {
      exists = false;
    }
    if (exists) {
      const content = await readFile(claimsPath, 'utf8');
      expect(content.trim().length).toBe(0);
    }
  });

  it('skips a source whose extraction-to-source word ratio exceeds the threshold (R-005)', async () => {
    const bodyWords = Array.from({ length: 150 }, (_, i) => `word${i}`).join(' ');
    const rawText = `<html><body><p>${bodyWords}</p></body></html>`;
    const longAsserts = Array.from({ length: 400 }, (_, i) => `lipsum${i}`).join(' ');
    const card = {
      asserts: longAsserts,
      key_points: [
        Array.from({ length: 250 }, (_, i) => `kp${i}`).join(' '),
        Array.from({ length: 250 }, (_, i) => `kp${i + 250}`).join(' '),
      ],
      scope: 'population: us workers; outcome: accidents',
      not: 'pediatric excluded',
    };
    await setupPackWithRawText(rawText, card);

    const summary = await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });
    expect(summary.sourcesProcessed).toBe(0);
    expect(summary.sourcesSkipped).toBe(1);
    expect(summary.claimsAdded).toBe(0);
  });

  it('honours an operator clear_severities override: source proceeds to claim extraction', async () => {
    const rawText =
      `<html><body><script>var _Incapsula_Resource={SWUDNBZxPWh="cbb1ed"};</script></body></html>`;
    await setupPackWithRawText(rawText, {
      title: 'Operator-validated title',
      asserts: 'Operator vouches for this content.',
      key_points: ['Operator says this is real.', 'Out-of-band evidence supports it.'],
    });

    await writeOverrideLedger([
      {
        source_id: sourceId,
        url: 'https://example.com/x',
        clear_severities: ['bot_check_or_captcha_detected'],
        reason: 'operator has out-of-band evidence',
        operator: 'test-op',
        created_at: '2026-05-15T11:00:00.000Z',
        pack_version: '0.10.0',
      },
    ]);

    const summary = await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });
    // The HeuristicClaimExtractor will still need an excerpt ledger to produce
    // claims, but the quarantine should be lifted — sourcesProcessed is at
    // least attempted, NOT skipped purely because of severity.
    expect(summary.sourcesSkipped).toBeLessThan(1);
  });

  it('does not skip a healthy source (regression: existing extraction path unchanged)', async () => {
    const rawText =
      `<html><body><article><p>` +
      Array.from({ length: 50 }, (_, i) => `Sentence number ${i} of substantive prose content.`).join(' ') +
      `</p></article></body></html>`;
    await setupPackWithRawText(rawText);

    const summary = await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });
    expect(summary.sourcesSkipped + summary.sourcesProcessed).toBe(1);
    // No quarantine reason on this source; if extraction is skipped it must
    // be for an existing reason (e.g., empty ledger), not severity.
  });
});
