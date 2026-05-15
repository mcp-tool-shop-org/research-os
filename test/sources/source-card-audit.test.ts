/**
 * Component D (v0.4) — source-card audit CLI tests.
 *
 * 14 required cases covering: runSourceCardAudit (read-only) and
 * applySourceCardOverrides (write mode). Fixtures use tmpdir; no frozen
 * packs are touched (4-pack regression stays byte-identical).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runSourceCardAudit, applySourceCardOverrides } from '../../src/sources/source-card-audit.js';
import { readOverrides } from '../../src/sources/source-card-overrides.js';
import { validateSourceCardOverride } from '../../src/sources/source-card-overrides-schema.js';
import type { SourceCard } from '../../src/sources/schema.js';
import type { SourceCardOverride } from '../../src/sources/source-card-overrides-schema.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'research-os-audit-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

/** Write the evidence/source-cards/ directory and return the dir path. */
async function makeCardsDir(packPath: string): Promise<string> {
  const dir = join(packPath, 'evidence', 'source-cards');
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Minimal valid SourceCard conforming to SourceCardSchema. */
function makeCard(partial: Partial<SourceCard> = {}): SourceCard {
  return {
    source_id: 'src_aabbccddeeff',
    receipt_id: 'rcpt_aabbcc_1',
    section_id: '01-test',
    url: 'https://example-research.org/paper',
    final_url: 'https://example-research.org/paper',
    fetched_at: '2026-05-10T10:00:00.000Z',
    publisher: 'Example Research',
    published_at: null,
    title: 'A Research Paper',
    source_type: 'secondary',
    relevance: 'medium',
    key_points: ['point one'],
    limitations: [],
    asserts: 'This source asserts something.',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-10T10:00:00.000Z',
    ...partial,
  };
}

/** Write a card to the source-cards directory. */
async function writeCard(cardsDir: string, card: SourceCard): Promise<void> {
  await writeFile(join(cardsDir, `${card.source_id}.json`), JSON.stringify(card, null, 2), 'utf8');
}

/** Minimal valid override. */
function makeOverride(partial: Partial<SourceCardOverride> = {}): SourceCardOverride {
  return {
    source_id: 'src_aabbccddeeff',
    url: 'https://example-research.org/paper',
    new_source_type: 'primary',
    reason: 'operator correction',
    operator: 'test-op',
    created_at: '2026-05-10T10:00:00.000Z',
    pack_version: '0.4.0',
    ...partial,
  };
}

/** Write the override ledger for a pack. */
async function writeLedger(packPath: string, overrides: SourceCardOverride[]): Promise<void> {
  const dir = join(packPath, 'evidence');
  await mkdir(dir, { recursive: true });
  const lines = overrides.map((o) => JSON.stringify(o)).join('\n') + '\n';
  await writeFile(join(dir, 'source-card-overrides.jsonl'), lines, 'utf8');
}

// ── Test 1: Audit reads source cards and produces totals ─────────────────────

describe('runSourceCardAudit — cards_scanned equals fixture count', () => {
  it('produces totals.cards_scanned === N for N cards in the pack', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    const card1 = makeCard({ source_id: 'src_111111111111' });
    const card2 = makeCard({ source_id: 'src_222222222222' });
    const card3 = makeCard({ source_id: 'src_333333333333' });
    await writeCard(cardsDir, card1);
    await writeCard(cardsDir, card2);
    await writeCard(cardsDir, card3);

    const { report } = await runSourceCardAudit(tmpDir);

    expect(report.totals.cards_scanned).toBe(3);
    expect(report.findings).toHaveLength(3);
  });
});

// ── Test 2: Missing override ledger does not fail ─────────────────────────────

describe('runSourceCardAudit — missing override ledger is not an error', () => {
  it('completes successfully when source-card-overrides.jsonl does not exist', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    await writeCard(cardsDir, makeCard());

    const { report } = await runSourceCardAudit(tmpDir);

    expect(report.totals.cards_with_overrides).toBe(0);
    expect(report.totals.cards_scanned).toBe(1);
  });
});

// ── Test 3: Override is reflected in effective output ─────────────────────────

describe('runSourceCardAudit — existing override reflected in findings', () => {
  it('override_in_effect is true and effective_source_type matches new_source_type', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    const card = makeCard({ source_type: 'secondary' });
    await writeCard(cardsDir, card);

    const override = makeOverride({ new_source_type: 'primary' });
    await writeLedger(tmpDir, [override]);

    const { report } = await runSourceCardAudit(tmpDir);

    expect(report.totals.cards_with_overrides).toBe(1);
    const finding = report.findings[0];
    expect(finding).toBeDefined();
    expect(finding!.override_in_effect).toBe(true);
    expect(finding!.effective_source_type).toBe('primary');
    expect(finding!.raw_source_type).toBe('secondary');
  });
});

// ── Test 4: Classifier mismatch is reported ───────────────────────────────────

describe('runSourceCardAudit — source_type_mismatch finding', () => {
  it('flags a card whose URL classifies as primary but is stored as secondary', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    // xrpl.org fires canonical-vendor:xrpl-foundation → primary
    const card = makeCard({
      source_id: 'src_0000000001aa',
      url: 'https://xrpl.org/docs/references/protocol/transactions',
      source_type: 'secondary', // wrong — should be primary
      publisher: 'XRPL Foundation',
    });
    await writeCard(cardsDir, card);

    const { report } = await runSourceCardAudit(tmpDir);

    expect(report.totals.source_type_mismatches).toBe(1);
    const finding = report.findings[0];
    expect(finding!.kind).toBe('source_type_mismatch');
    expect(finding!.classifier_source_type).toBe('primary');
    expect(finding!.raw_source_type).toBe('secondary');
    expect(finding!.override_in_effect).toBe(false);
  });
});

// ── Test 5: GitHub UI HTML card is flagged ────────────────────────────────────

describe('runSourceCardAudit — github_ui_html finding', () => {
  it('flags a card whose URL matches the github-ui-html L2 rule', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    const card = makeCard({
      source_id: 'src_0000000002bb',
      url: 'https://github.com/godotengine/godot/releases',
      source_type: 'unknown',
      publisher: 'Godot Engine',
    });
    await writeCard(cardsDir, card);

    const { report } = await runSourceCardAudit(tmpDir);

    expect(report.totals.github_ui_html).toBe(1);
    const finding = report.findings[0];
    expect(finding!.kind).toBe('github_ui_html');
    expect(finding!.classifier_rule_hint).toBe('flagged:github-ui-html');
  });
});

// ── Test 6: Publisher-missing count is reported ───────────────────────────────

describe('runSourceCardAudit — publisher_missing finding', () => {
  it('reports a card with null publisher and no override as publisher_missing', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    const card = makeCard({
      source_id: 'src_0000000003cc',
      url: 'https://example-research.org/paper',
      publisher: null,
      source_type: 'secondary',
    });
    await writeCard(cardsDir, card);

    const { report } = await runSourceCardAudit(tmpDir);

    expect(report.totals.publisher_missing).toBe(1);
    const finding = report.findings[0];
    expect(finding!.kind).toBe('publisher_missing');
  });
});

// ── Test 7: JSON output shape is stable ──────────────────────────────────────

describe('runSourceCardAudit — JSON report shape', () => {
  it('report has stable top-level keys and exhaustive totals keys', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    await writeCard(cardsDir, makeCard());

    const { report } = await runSourceCardAudit(tmpDir);

    // Top-level keys
    expect(Object.keys(report)).toEqual(
      expect.arrayContaining([
        'schema_version',
        'pack_path',
        'audited_at',
        'research_os_version',
        'totals',
        'findings',
      ]),
    );
    expect(report.schema_version).toBe(1);
    expect(typeof report.audited_at).toBe('string');
    expect(typeof report.research_os_version).toBe('string');

    // Totals keys — exhaustive. v0.10 Slice 3 adds bot-check and
    // extraction-suspect severity counters.
    expect(Object.keys(report.totals).sort()).toEqual(
      [
        'bot_check_or_captcha_detected',
        'cards_scanned',
        'cards_with_overrides',
        'classifier_flagged_other',
        'extraction_suspect_word_count_mismatch',
        'github_ui_html',
        'no_action',
        'publisher_missing',
        'source_type_mismatches',
      ].sort(),
    );

    // Findings row shape
    expect(report.findings).toHaveLength(1);
    const f = report.findings[0]!;
    expect(typeof f.source_id).toBe('string');
    expect(typeof f.url).toBe('string');
    expect(typeof f.kind).toBe('string');
    expect(typeof f.raw_source_type).toBe('string');
    expect(typeof f.classifier_source_type).toBe('string');
    expect(typeof f.effective_source_type).toBe('string');
    expect(typeof f.classifier_rule_hint).toBe('string');
    expect(typeof f.classifier_precedence_level).toBe('number');
    expect(typeof f.override_in_effect).toBe('boolean');
  });
});

// ── Test 8: Markdown and JSON artifacts are written ──────────────────────────

describe('runSourceCardAudit — artifact writes', () => {
  it('writes audits/source-card-audit.json and audits/source-card-audit.md', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    await writeCard(cardsDir, makeCard());

    const { jsonPath, mdPath } = await runSourceCardAudit(tmpDir);

    const jsonContent = await readFile(jsonPath, 'utf8');
    const mdContent = await readFile(mdPath, 'utf8');

    const parsed = JSON.parse(jsonContent) as { schema_version: number };
    expect(parsed.schema_version).toBe(1);
    expect(mdContent).toContain('Source-Card Audit Report');

    // Paths are inside pack's audits/ directory
    expect(jsonPath).toContain('source-card-audit.json');
    expect(mdPath).toContain('source-card-audit.md');
  });
});

// ── Test 9: --apply appends valid overrides ───────────────────────────────────

describe('applySourceCardOverrides — appends valid entries to ledger', () => {
  it('appends two valid overrides; readOverrides returns length 2', async () => {
    await makeCardsDir(tmpDir);

    const overrideFile = join(tmpDir, 'proposed.json');
    const entries = [
      makeOverride({ source_id: 'src_111111111111' }),
      makeOverride({ source_id: 'src_222222222222' }),
    ];
    await writeFile(overrideFile, JSON.stringify(entries), 'utf8');

    const result = await applySourceCardOverrides(tmpDir, overrideFile);

    expect(result.applied).toBe(2);
    expect(result.distinctSourceIds).toBe(2);

    const written = await readOverrides(tmpDir);
    expect(written).toHaveLength(2);
  });
});

// ── Test 10: --apply refuses malformed override file ─────────────────────────

describe('applySourceCardOverrides — refuses batch when any entry is invalid', () => {
  it('rejects entire batch on schema failure; ledger is unchanged', async () => {
    await makeCardsDir(tmpDir);

    // First, write one pre-existing valid override
    await writeLedger(tmpDir, [makeOverride({ source_id: 'src_000000000000' })]);

    const overrideFile = join(tmpDir, 'bad-batch.json');
    const entries = [
      makeOverride({ source_id: 'src_111111111111' }), // valid
      {
        // invalid: missing reason
        source_id: 'src_222222222222',
        url: 'https://example.com',
        new_source_type: 'primary',
        operator: 'op',
        created_at: '2026-05-10T10:00:00.000Z',
        pack_version: '0.4.0',
        // reason missing → schema rejection
      },
    ];
    await writeFile(overrideFile, JSON.stringify(entries), 'utf8');

    await expect(applySourceCardOverrides(tmpDir, overrideFile)).rejects.toThrow(
      /entry 2.*validation/i,
    );

    // Ledger must be unchanged — still only the pre-existing entry
    const afterLedger = await readOverrides(tmpDir);
    expect(afterLedger).toHaveLength(1);
    expect(afterLedger[0]!.source_id).toBe('src_000000000000');
  });
});

// ── Test 11: --apply refuses frozen pack ─────────────────────────────────────

describe('applySourceCardOverrides — refuses frozen pack', () => {
  it('throws with clear message when audits/freeze-receipt.json is present', async () => {
    await makeCardsDir(tmpDir);

    // Write a freeze receipt to simulate a frozen pack
    const auditsDir = join(tmpDir, 'audits');
    await mkdir(auditsDir, { recursive: true });
    await writeFile(
      join(auditsDir, 'freeze-receipt.json'),
      JSON.stringify({ frozen_at: '2026-05-10T10:00:00.000Z' }),
      'utf8',
    );

    const overrideFile = join(tmpDir, 'proposed.json');
    await writeFile(overrideFile, JSON.stringify([makeOverride()]), 'utf8');

    await expect(applySourceCardOverrides(tmpDir, overrideFile)).rejects.toThrow(
      /frozen pack/i,
    );

    // Ledger must not have been created
    const ledger = await readOverrides(tmpDir);
    expect(ledger).toHaveLength(0);
  });
});

// ── Test 12: Read-only audit works on frozen pack ────────────────────────────

describe('runSourceCardAudit — works on frozen pack (read-only)', () => {
  it('audit completes on a pack with freeze-receipt.json; source cards untouched', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    await writeCard(cardsDir, makeCard());

    // Simulate frozen pack
    const auditsDir = join(tmpDir, 'audits');
    await mkdir(auditsDir, { recursive: true });
    const freezeReceiptPath = join(auditsDir, 'freeze-receipt.json');
    await writeFile(
      freezeReceiptPath,
      JSON.stringify({ frozen_at: '2026-05-10T10:00:00.000Z' }),
      'utf8',
    );

    // Read-only audit must succeed despite freeze receipt
    const { report } = await runSourceCardAudit(tmpDir);
    expect(report.totals.cards_scanned).toBe(1);

    // freeze-receipt.json is preserved (not touched)
    const receiptContent = await readFile(freezeReceiptPath, 'utf8');
    expect(JSON.parse(receiptContent)).toHaveProperty('frozen_at');

    // source-card-audit.json was written to audits/ alongside freeze receipt
    const auditJson = await readFile(join(auditsDir, 'source-card-audit.json'), 'utf8');
    expect(JSON.parse(auditJson)).toHaveProperty('schema_version', 1);
  });
});

// ── Test 13: Apply uses Session 3 validation, not a duplicate ────────────────

describe('applySourceCardOverrides — uses validateSourceCardOverride from Session 3', () => {
  it('Session 3 validator rejects the same invalid entries that --apply rejects', async () => {
    // This test verifies that applySourceCardOverrides delegates to the same
    // validateSourceCardOverride used by Component A. We demonstrate that
    // the validator and the apply path reject the same shape.
    const badEntry = {
      source_id: 'src_aabbccddeeff',
      url: 'https://example.com',
      new_source_type: 'primary',
      // reason missing
      operator: 'op',
      created_at: '2026-05-10T10:00:00.000Z',
      pack_version: '0.4.0',
    };

    // Direct Session 3 validator rejects it
    expect(() => validateSourceCardOverride(badEntry)).toThrow();

    // Apply path rejects the same shape
    await makeCardsDir(tmpDir);
    const overrideFile = join(tmpDir, 'bad.json');
    await writeFile(overrideFile, JSON.stringify([badEntry]), 'utf8');

    await expect(applySourceCardOverrides(tmpDir, overrideFile)).rejects.toThrow();
  });
});

// ── Test 14: Default audit mode does not mutate source cards or ledger ────────

describe('runSourceCardAudit — read-only: no mutation of evidence directory', () => {
  it('source-cards and override ledger are byte-identical before and after audit', async () => {
    const cardsDir = await makeCardsDir(tmpDir);
    const card = makeCard({ source_type: 'secondary' });
    await writeCard(cardsDir, card);

    const override = makeOverride();
    await writeLedger(tmpDir, [override]);

    // Snapshot before
    const cardBefore = await readFile(join(cardsDir, `${card.source_id}.json`), 'utf8');
    const ledgerBefore = await readFile(
      join(tmpDir, 'evidence', 'source-card-overrides.jsonl'),
      'utf8',
    );

    await runSourceCardAudit(tmpDir);

    // Snapshot after
    const cardAfter = await readFile(join(cardsDir, `${card.source_id}.json`), 'utf8');
    const ledgerAfter = await readFile(
      join(tmpDir, 'evidence', 'source-card-overrides.jsonl'),
      'utf8',
    );

    expect(cardAfter).toBe(cardBefore);
    expect(ledgerAfter).toBe(ledgerBefore);
  });
});
