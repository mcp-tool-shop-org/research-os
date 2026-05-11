import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReceiptForPack } from '../src/calibration/lookup.js';
import {
  CalibrationReceiptSchema,
  SUPPORTED_RECEIPT_VERSIONS,
} from '../src/calibration/receipt-schema.js';
import {
  SUPPORTED_AGGREGATE_RECEIPT_VERSIONS,
  AggregateCalibrationReceiptSchema,
} from '../src/calibration/aggregate-receipt-schema.js';
import { UnsupportedReceiptVersionError } from '../src/errors.js';

// B-C-001 regression: receipt schema_version is a discriminated union (today
// z.union([z.literal(1)]); v2 adds z.literal(2) alongside). Unknown versions
// must throw UnsupportedReceiptVersionError with code UNSUPPORTED_RECEIPT_VERSION
// and a hint listing the supported list.

// Minimal valid v1 receipt (mirrors test/calibration-lookup.test.ts fixture).
const VALID_V1_RECEIPT = {
  schema_version: 1 as const,
  profile_name: 'hermes-two-pass',
  status: 'trusted_baseline' as const,
  model: 'hermes3:8b',
  architecture: 'two-pass' as const,
  fixture: 'seeded-v1',
  fixture_total_claims: 18,
  fixture_good_claims: 5,
  fixture_bad_claims: 13,
  calibrated_at: '2026-05-10T00:00:00.000Z',
  research_os_version: '0.6.0',
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
  decision_vocab_bar: {
    architecture: 'two-pass' as const,
    required: 3,
    produced: 3,
    passed: true,
  },
  unreachable_decisions: ['needs_contradiction_mapping'],
  empty_or_malformed_responses: 0,
  pass_fail: {
    fp_ceiling: 'PASS' as const,
    any_flag_recall_floor: 'PASS' as const,
    per_category_any_flag_floor: 'PASS' as const,
    strict_recall_floor: 'PASS' as const,
    decision_vocab_completeness: 'PASS' as const,
    latency_soft: 'PASS' as const,
    latency_hard: 'PASS' as const,
    empty_or_malformed: 'PASS' as const,
    overall: 'PASS' as const,
  },
  notes: [],
};

async function writeReceipt(
  packDir: string,
  profile: string,
  content: unknown,
): Promise<string> {
  const dir = join(packDir, 'calibration', 'reviewer-profiles', profile);
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'seeded-v1.json');
  await writeFile(path, JSON.stringify(content), 'utf8');
  return path;
}

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'ro-bc001-test-'));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('B-C-001 — supported-versions constant', () => {
  it('exports SUPPORTED_RECEIPT_VERSIONS = [1]', () => {
    expect([...SUPPORTED_RECEIPT_VERSIONS]).toEqual([1]);
  });

  it('exports SUPPORTED_AGGREGATE_RECEIPT_VERSIONS = [1]', () => {
    expect([...SUPPORTED_AGGREGATE_RECEIPT_VERSIONS]).toEqual([1]);
  });
});

describe('B-C-001 — schema-level acceptance of v1 receipts', () => {
  it('CalibrationReceiptSchema parses a v1 receipt cleanly', () => {
    const result = CalibrationReceiptSchema.safeParse(VALID_V1_RECEIPT);
    expect(result.success).toBe(true);
  });

  it('CalibrationReceiptSchema rejects a hand-written v2 receipt at schema_version', () => {
    const v2 = { ...VALID_V1_RECEIPT, schema_version: 2 };
    const result = CalibrationReceiptSchema.safeParse(v2);
    expect(result.success).toBe(false);
    if (!result.success) {
      const offending = result.error.issues.find(
        (i) => i.path.length === 1 && i.path[0] === 'schema_version',
      );
      expect(offending).toBeDefined();
    }
  });

  it('AggregateCalibrationReceiptSchema rejects v2 schema_version at the field level', () => {
    // Construct a minimal-but-invalid v2-tagged aggregate; we don't care about
    // the other fields here — only that schema_version=2 fails the union.
    const v2agg = { schema_version: 2 };
    const result = AggregateCalibrationReceiptSchema.safeParse(v2agg);
    expect(result.success).toBe(false);
    if (!result.success) {
      const offending = result.error.issues.find(
        (i) => i.path.length === 1 && i.path[0] === 'schema_version',
      );
      expect(offending).toBeDefined();
    }
  });
});

describe('B-C-001 — UnsupportedReceiptVersionError shape', () => {
  it('carries code UNSUPPORTED_RECEIPT_VERSION and hint mentioning supported list', () => {
    const err = new UnsupportedReceiptVersionError([1], 2, '/tmp/r.json');
    expect(err.code).toBe('UNSUPPORTED_RECEIPT_VERSION');
    expect(err.hint).toBeDefined();
    expect(err.hint).toContain('1');
    expect(err.supportedVersions).toEqual([1]);
    expect(err.receivedVersion).toBe(2);
    expect(err.message).toContain('/tmp/r.json');
    expect(err.message).toContain('2');
  });
});

// End-to-end caller test: loadReceiptForPack -> receiptToCalibrationSummary
// is the real public READ path. The error must propagate out of it.
describe('B-C-001 — end-to-end through loadReceiptForPack', () => {
  it('parses a v1 receipt cleanly through the full public READ path', async () => {
    const pack = join(tmpRoot, 'pack-v1');
    await mkdir(pack);
    await writeReceipt(pack, 'hermes-two-pass', VALID_V1_RECEIPT);

    const summary = await loadReceiptForPack(pack, 'hermes-two-pass');
    expect(summary).not.toBeNull();
    expect(summary?.notes).toContain('trusted_baseline');
  });

  it('throws UnsupportedReceiptVersionError for a v2 receipt at the public READ path', async () => {
    const pack = join(tmpRoot, 'pack-v2');
    await mkdir(pack);
    const v2 = { ...VALID_V1_RECEIPT, schema_version: 2 };
    const receiptPath = await writeReceipt(pack, 'hermes-two-pass', v2);

    let thrown: unknown = null;
    try {
      await loadReceiptForPack(pack, 'hermes-two-pass');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(UnsupportedReceiptVersionError);
    const e = thrown as UnsupportedReceiptVersionError;
    expect(e.code).toBe('UNSUPPORTED_RECEIPT_VERSION');
    expect(e.receivedVersion).toBe(2);
    expect(e.message).toContain(receiptPath);
    expect(e.hint).toContain('1');
  });

  it('throws UnsupportedReceiptVersionError for a v99 receipt (future version)', async () => {
    const pack = join(tmpRoot, 'pack-v99');
    await mkdir(pack);
    const v99 = { ...VALID_V1_RECEIPT, schema_version: 99 };
    await writeReceipt(pack, 'hermes-two-pass', v99);

    let thrown: unknown = null;
    try {
      await loadReceiptForPack(pack, 'hermes-two-pass');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(UnsupportedReceiptVersionError);
    expect((thrown as UnsupportedReceiptVersionError).receivedVersion).toBe(99);
  });
});
