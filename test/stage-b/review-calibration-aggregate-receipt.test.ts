// B-CAL-001 regression: the shipped calibration receipts at
// calibration/reviewer-profiles/<profile>/seeded-v1.json are AGGREGATE
// (receipt_kind:'aggregate'), but loadReceiptForPack parsed strictly with the
// SINGLE-RUN CalibrationReceiptSchema and threw CALIBRATION_RECEIPT_MALFORMED
// on a VALID aggregate — hard-aborting `review promote` auto-population.
//
// FIX: discriminate on receipt_kind before choosing a schema. When 'aggregate',
// validate with AggregateCalibrationReceiptSchema and map each AggregateMetric's
// .median onto the PromotionCalibrationSummary shape.
//
// Both halves:
//   - FIX PRESENT: an AGGREGATE receipt at the canonical path loads to a
//     non-null summary (no throw); medians are reflected in the summary strings.
//   - HAPPY PATH PRESERVED: a SINGLE-RUN receipt at the same path still loads
//     cleanly (the existing reader path is unchanged).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReceiptForPack } from '../../src/calibration/lookup.js';
import { UnsupportedReceiptVersionError } from '../../src/errors.js';

// A minimal valid AGGREGATE receipt (receipt_kind:'aggregate') mirroring the
// shipped hermes-two-pass seeded-v1.json shape.
const AGGREGATE_RECEIPT = {
  schema_version: 1,
  receipt_kind: 'aggregate',
  profile_name: 'hermes-two-pass',
  status: 'conditional_pass',
  model: 'hermes3:8b',
  architecture: 'two-pass',
  fixture: 'seeded-v1',
  fixture_total_claims: 18,
  fixture_good_claims: 5,
  fixture_bad_claims: 13,
  runs_count: 3,
  run_files: ['runs/run-001.json', 'runs/run-002.json', 'runs/run-003.json'],
  aggregated_at: '2026-05-10T22:37:42.174Z',
  research_os_version: '0.4.0',
  good_fp_count: { median: 0, min: 0, max: 0, values: [0, 0, 0] },
  any_flag_recall_ratio: { median: 0.6923, min: 0.46, max: 0.84, values: [0.84, 0.6923, 0.46] },
  strict_recall_ratio: { median: 0.3846, min: 0.15, max: 0.3846, values: [0.3846, 0.3846, 0.15] },
  decisions_produced_count: { median: 2, min: 2, max: 3, values: [3, 2, 2] },
  runtime_ms: { median: 69410, min: 46198, max: 112004, values: [112004, 46198, 69410] },
  empty_or_malformed_responses: { median: 0, min: 0, max: 0, values: [0, 0, 0] },
  per_category_any_flag: {
    unsupported_claim: {
      median_ratio: 0.6666,
      min_ratio: 0.6666,
      max_ratio: 1,
      total: 3,
      per_run_ratios: [0.6666, 0.6666, 1],
    },
  },
  per_category_strict: {},
  decision_vocabulary: {
    accepted_for_synthesis: { median: 15, min: 11, max: 15, values: [11, 15, 15] },
  },
  decision_vocab_bar: { architecture: 'two-pass', required: 3, median_produced: 2, passed: false },
  unreachable_decisions: ['needs_contradiction_mapping'],
  pass_fail: {
    fp_ceiling: 'PASS',
    any_flag_recall_floor: 'PASS',
    per_category_any_flag_floor: 'PASS',
    strict_recall_floor: 'PASS',
    decision_vocab_completeness: 'FAIL',
    latency_soft: 'PASS',
    latency_hard: 'PASS',
    empty_or_malformed: 'PASS',
    overall: 'FAIL',
  },
  recurring_bar_failures: ['decision_vocab_completeness'],
  notes: [],
};

// A minimal valid SINGLE-RUN receipt (no receipt_kind) — proves the existing
// reader path still works after the discriminator.
const SINGLE_RUN_RECEIPT = {
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
  tmpRoot = await mkdtemp(join(tmpdir(), 'ro-stageb-cal-'));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('B-CAL-001 — aggregate receipt at the canonical seeded-v1.json path loads', () => {
  it('FIX PRESENT: an AGGREGATE receipt loads to a non-null summary (no throw)', async () => {
    const pack = join(tmpRoot, 'pack-agg');
    await mkdir(pack);
    await writeReceipt(pack, 'hermes-two-pass', AGGREGATE_RECEIPT);

    const summary = await loadReceiptForPack(pack, 'hermes-two-pass');
    expect(summary).not.toBeNull();
    expect(summary?.fixture).toBe('seeded-v1');
    // FP median 0 of 5 good claims.
    expect(summary?.good_false_positive_rate).toContain('0/5');
    // any-flag recall median 0.6923 -> 69%.
    expect(summary?.bad_any_flag_recall).toContain('69%');
    // unsupported_claim median_ratio 0.6666 -> 67% of 3 = 2/3.
    expect(summary?.unsupported_claim_recall).toContain('2/3');
    // notes flag the aggregate provenance.
    expect(summary?.notes).toContain('aggregate of 3 runs');
  });

  it('FIX PRESENT: an aggregate receipt with an unsupported schema_version throws UnsupportedReceiptVersionError', async () => {
    const pack = join(tmpRoot, 'pack-agg-v2');
    await mkdir(pack);
    await writeReceipt(pack, 'hermes-two-pass', { ...AGGREGATE_RECEIPT, schema_version: 2 });

    await expect(loadReceiptForPack(pack, 'hermes-two-pass')).rejects.toBeInstanceOf(
      UnsupportedReceiptVersionError,
    );
  });

  it('HAPPY PATH PRESERVED: a SINGLE-RUN receipt at the same path still loads cleanly', async () => {
    const pack = join(tmpRoot, 'pack-single');
    await mkdir(pack);
    await writeReceipt(pack, 'hermes-two-pass', SINGLE_RUN_RECEIPT);

    const summary = await loadReceiptForPack(pack, 'hermes-two-pass');
    expect(summary).not.toBeNull();
    expect(summary?.notes).toContain('trusted_baseline');
    expect(summary?.good_false_positive_rate).toContain('0/5');
  });
});
