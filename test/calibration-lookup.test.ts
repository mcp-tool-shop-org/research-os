import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReceiptForPack } from '../src/calibration/lookup.js';

// Minimal valid receipt that satisfies CalibrationReceiptSchema.
const VALID_RECEIPT = {
  schema_version: 1,
  profile_name: 'hermes-two-pass',
  status: 'trusted_baseline',
  model: 'hermes3:8b',
  architecture: 'two-pass',
  fixture: 'seeded-v1',
  fixture_total_claims: 18,
  fixture_good_claims: 5,
  fixture_bad_claims: 13,
  calibrated_at: '2026-05-10T00:00:00.000Z',
  research_os_version: '0.4.0',
  runtime_ms: 106_000,
  good_fp_count: 0,
  any_flag_recall: { matched: 10, total: 13, ratio: 0.769 },
  strict_recall: { matched: 5, total: 13, ratio: 0.385 },
  per_category_any_flag: {},
  per_category_strict: {},
  decision_vocabulary: {
    accepted_for_synthesis: 10,
    rejected: 3,
    needs_scope_repair: 1,
    needs_source_repair: 0,
    needs_contradiction_mapping: 0,
    needs_human_review: 0,
  },
  decisions_produced_count: 3,
  decision_vocab_bar: { architecture: 'two-pass', required: 3, produced: 3, passed: true },
  unreachable_decisions: ['needs_contradiction_mapping'],
  empty_or_malformed_responses: 0,
  pass_fail: {
    fp_ceiling: 'PASS',
    any_flag_recall_floor: 'PASS',
    per_category_any_flag_floor: 'PASS',
    strict_recall_floor: 'PASS',
    decision_vocab_completeness: 'PASS',
    latency_soft: 'PASS',
    latency_hard: 'PASS',
    empty_or_malformed: 'PASS',
    overall: 'PASS',
  },
  notes: [],
};

async function writeReceipt(packDir: string, profile: string, content: unknown): Promise<string> {
  const dir = join(packDir, 'calibration', 'reviewer-profiles', profile);
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'seeded-v1.json');
  await writeFile(path, JSON.stringify(content), 'utf8');
  return path;
}

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'ro-lookup-test-'));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

// --- Test 1: Pack-relative lookup ---
// Receipt is at <packDir>/calibration/..., loadReceiptForPack uses packDir (not cwd).
describe('loadReceiptForPack — pack-relative lookup', () => {
  it('returns calibration summary when receipt exists at pack-relative path', async () => {
    const packA = join(tmpRoot, 'pack-a');
    await mkdir(packA);
    await writeReceipt(packA, 'hermes-two-pass', VALID_RECEIPT);

    const summary = await loadReceiptForPack(packA, 'hermes-two-pass');
    expect(summary).not.toBeNull();
    expect(summary?.fixture).toBe('seeded-v1');
    // notes field encodes status/model/arch/overall
    expect(summary?.notes).toContain('trusted_baseline');
    expect(summary?.good_false_positive_rate).toContain('0/5');
  });
});

// --- Test 2: Cwd-irrelevance ---
// Receipt lives in pack-a; pack-b has no receipt.
// loadReceiptForPack(packA, ...) finds the receipt; loadReceiptForPack(packB, ...) returns null.
// Proves the function uses the explicit packDir argument, not process.cwd().
describe('loadReceiptForPack — cwd-irrelevance', () => {
  it('loads from the specified pack regardless of which pack has no receipt', async () => {
    const packA = join(tmpRoot, 'pack-a');
    const packB = join(tmpRoot, 'pack-b');
    await mkdir(packA);
    await mkdir(packB);
    await writeReceipt(packA, 'hermes-two-pass', VALID_RECEIPT);
    // packB intentionally has no calibration/ directory

    const fromA = await loadReceiptForPack(packA, 'hermes-two-pass');
    const fromB = await loadReceiptForPack(packB, 'hermes-two-pass');

    expect(fromA).not.toBeNull();
    expect(fromB).toBeNull();
  });
});

// --- Test 3: Invalid receipt fails visibly ---
// A JSON file at the correct path that fails schema validation must throw —
// NOT silently skip. Error message must include the receipt path.
describe('loadReceiptForPack — invalid receipt fails visibly', () => {
  it('throws with path in message when receipt has invalid schema', async () => {
    const packA = join(tmpRoot, 'pack-a');
    await mkdir(packA);
    // schema_version is missing; status is unknown; will fail Zod parse
    const invalid = { schema_version: 1, profile_name: 'hermes-two-pass', status: 'NOT_A_STATUS' };
    const receiptPath = await writeReceipt(packA, 'hermes-two-pass', invalid);

    await expect(loadReceiptForPack(packA, 'hermes-two-pass')).rejects.toThrow(
      receiptPath,
    );
  });

  it('throws with path in message when receipt contains malformed JSON', async () => {
    const packA = join(tmpRoot, 'pack-a');
    await mkdir(packA);
    const dir = join(packA, 'calibration', 'reviewer-profiles', 'hermes-two-pass');
    await mkdir(dir, { recursive: true });
    const receiptPath = join(dir, 'seeded-v1.json');
    await writeFile(receiptPath, '{ not valid json !!!', 'utf8');

    await expect(loadReceiptForPack(packA, 'hermes-two-pass')).rejects.toThrow(
      receiptPath,
    );
  });
});

// --- Test 4: Missing receipt is no-op ---
// If no receipt file exists, the function returns null and does NOT throw.
describe('loadReceiptForPack — missing receipt is no-op', () => {
  it('returns null when no receipt file exists at the expected path', async () => {
    const packA = join(tmpRoot, 'pack-a');
    await mkdir(packA);
    // no calibration/ directory at all

    const result = await loadReceiptForPack(packA, 'hermes-two-pass');
    expect(result).toBeNull();
  });
});
