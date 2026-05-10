import { describe, it, expect } from 'vitest';
import {
  median,
  aggregateMetric,
  aggregatePerCategoryRecall,
  aggregateDecisionVocabulary,
  computeAggregatePassFail,
  computeRecurringBarFailures,
  computeAggregateStatusLabel,
  aggregateReceipts,
} from '../src/calibration/aggregate.js';
import { AggregateCalibrationReceiptSchema } from '../src/calibration/aggregate-receipt-schema.js';
import type { CalibrationReceipt, PassFail } from '../src/calibration/receipt-schema.js';

// -----------------------------------------------------------------------
// Test 1: median([]) throws
// -----------------------------------------------------------------------
describe('median — empty array', () => {
  it('throws on empty input', () => {
    expect(() => median([])).toThrow('median: empty array');
  });
});

// -----------------------------------------------------------------------
// Test 2: median([3]) returns 3 (single element)
// -----------------------------------------------------------------------
describe('median — single element', () => {
  it('returns the single value unchanged', () => {
    expect(median([3])).toBe(3);
  });
});

// -----------------------------------------------------------------------
// Test 3: median([1, 2, 3]) = 2 (odd N, middle element)
// -----------------------------------------------------------------------
describe('median — odd N', () => {
  it('returns middle element when N is odd', () => {
    expect(median([1, 2, 3])).toBe(2);
    // Input order must not matter — sort before selecting
    expect(median([3, 1, 2])).toBe(2);
  });
});

// -----------------------------------------------------------------------
// Test 4: median([1, 2, 3, 4]) = 2.5 (even N, mean of two middles)
// -----------------------------------------------------------------------
describe('median — even N', () => {
  it('returns mean of two middle values when N is even', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    // Unsorted input
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

// -----------------------------------------------------------------------
// Test 5: aggregateMetric shape + values preserved in input order
// -----------------------------------------------------------------------
describe('aggregateMetric', () => {
  it('returns correct median/min/max and preserves input-order values', () => {
    const result = aggregateMetric([5, 3, 7]);
    expect(result.median).toBe(5);
    expect(result.min).toBe(3);
    expect(result.max).toBe(7);
    // values must be in INPUT order (run-001=5, run-002=3, run-003=7), not sorted
    expect(result.values).toEqual([5, 3, 7]);
  });
});

// -----------------------------------------------------------------------
// Test 6: aggregatePerCategoryRecall — 3 runs, median per category
// -----------------------------------------------------------------------
describe('aggregatePerCategoryRecall', () => {
  it('computes median/min/max ratio per category across 3 runs', () => {
    const run1 = {
      scope_widening: { matched: 2, total: 3, ratio: 2 / 3 },
      unsupported_claim: { matched: 1, total: 3, ratio: 1 / 3 },
    };
    const run2 = {
      scope_widening: { matched: 3, total: 3, ratio: 1 },
      unsupported_claim: { matched: 2, total: 3, ratio: 2 / 3 },
    };
    const run3 = {
      scope_widening: { matched: 2, total: 3, ratio: 2 / 3 },
      unsupported_claim: { matched: 3, total: 3, ratio: 1 },
    };

    const result = aggregatePerCategoryRecall([run1, run2, run3]);

    // scope_widening: ratios = [2/3, 1, 2/3] → sorted [2/3, 2/3, 1] → median = 2/3
    expect(result['scope_widening'].median_ratio).toBeCloseTo(2 / 3);
    expect(result['scope_widening'].min_ratio).toBeCloseTo(2 / 3);
    expect(result['scope_widening'].max_ratio).toBe(1);
    expect(result['scope_widening'].total).toBe(3);
    expect(result['scope_widening'].per_run_ratios).toHaveLength(3);

    // unsupported_claim: ratios = [1/3, 2/3, 1] → median = 2/3
    expect(result['unsupported_claim'].median_ratio).toBeCloseTo(2 / 3);
    expect(result['unsupported_claim'].min_ratio).toBeCloseTo(1 / 3);
    expect(result['unsupported_claim'].max_ratio).toBe(1);
  });
});

// -----------------------------------------------------------------------
// Test 7: aggregateDecisionVocabulary — 3 runs, median count per decision
// -----------------------------------------------------------------------
describe('aggregateDecisionVocabulary', () => {
  it('computes aggregate metric per decision across 3 runs', () => {
    const run1 = { accepted_for_synthesis: 10, rejected: 2, needs_scope_repair: 1 };
    const run2 = { accepted_for_synthesis: 12, rejected: 0, needs_scope_repair: 3 };
    const run3 = { accepted_for_synthesis: 11, rejected: 1, needs_scope_repair: 2 };

    const result = aggregateDecisionVocabulary([run1, run2, run3]);

    // accepted_for_synthesis: [10,12,11] → sorted [10,11,12] → median=11
    expect(result['accepted_for_synthesis'].median).toBe(11);
    expect(result['accepted_for_synthesis'].min).toBe(10);
    expect(result['accepted_for_synthesis'].max).toBe(12);

    // rejected: [2,0,1] → sorted [0,1,2] → median=1
    expect(result['rejected'].median).toBe(1);

    // needs_scope_repair: [1,3,2] → median=2
    expect(result['needs_scope_repair'].median).toBe(2);
  });
});

// -----------------------------------------------------------------------
// Test 8: computeAggregatePassFail — FP at ceiling PASS (median=1, max=2)
//          AND FP FAIL when median=2
// -----------------------------------------------------------------------
describe('computeAggregatePassFail — FP ceiling rule', () => {
  const BASE_INPUT = {
    good_fp_count: { median: 0, min: 0, max: 0, values: [0, 0, 0] },
    any_flag_recall_ratio: { median: 0.77, min: 0.70, max: 0.85, values: [0.77, 0.70, 0.85] },
    per_category_any_flag: {
      scope_widening: { median_ratio: 0.67, min_ratio: 0.67, max_ratio: 1, total: 3, per_run_ratios: [0.67, 0.67, 1] },
    },
    strict_recall_ratio: { median: 0.38, min: 0.30, max: 0.46, values: [0.38, 0.30, 0.46] },
    decisions_produced_count: { median: 3, min: 3, max: 4, values: [3, 3, 4] },
    architecture: 'two-pass' as const,
    runtime_ms: { median: 106_000, min: 90_000, max: 120_000, values: [106_000, 90_000, 120_000] },
    empty_or_malformed_responses: { median: 0, min: 0, max: 0, values: [0, 0, 0] },
  };

  it('PASS when FP median=1 and max=2 (at ceiling)', () => {
    const result = computeAggregatePassFail({
      ...BASE_INPUT,
      good_fp_count: { median: 1, min: 0, max: 2, values: [0, 2, 1] },
    });
    expect(result.fp_ceiling).toBe('PASS');
  });

  it('FAIL when FP median=2 (over ceiling)', () => {
    const result = computeAggregatePassFail({
      ...BASE_INPUT,
      good_fp_count: { median: 2, min: 1, max: 3, values: [1, 2, 3] },
    });
    expect(result.fp_ceiling).toBe('FAIL');
    expect(result.overall).toBe('FAIL');
  });

  it('FAIL when FP median<=1 but max=3 (max rule violated)', () => {
    const result = computeAggregatePassFail({
      ...BASE_INPUT,
      good_fp_count: { median: 1, min: 0, max: 3, values: [0, 1, 3] },
    });
    expect(result.fp_ceiling).toBe('FAIL');
  });
});

// -----------------------------------------------------------------------
// Test 9: computeAggregatePassFail — latency_hard FAIL if any run > 1_200_000
// -----------------------------------------------------------------------
describe('computeAggregatePassFail — latency hard every-run rule', () => {
  it('FAILs latency_hard when any single run exceeds 1_200_000 ms', () => {
    const result = computeAggregatePassFail({
      good_fp_count: { median: 0, min: 0, max: 0, values: [0, 0, 0] },
      any_flag_recall_ratio: { median: 0.77, min: 0.77, max: 0.77, values: [0.77, 0.77, 0.77] },
      per_category_any_flag: {},
      strict_recall_ratio: { median: 0.38, min: 0.38, max: 0.38, values: [0.38, 0.38, 0.38] },
      decisions_produced_count: { median: 3, min: 3, max: 3, values: [3, 3, 3] },
      architecture: 'two-pass' as const,
      // max exceeds hard limit
      runtime_ms: { median: 900_000, min: 100_000, max: 1_500_000, values: [100_000, 900_000, 1_500_000] },
      empty_or_malformed_responses: { median: 0, min: 0, max: 0, values: [0, 0, 0] },
    });
    expect(result.latency_hard).toBe('FAIL');
    expect(result.overall).toBe('FAIL');
  });

  it('PASS latency_hard when all runs are within 1_200_000 ms', () => {
    const result = computeAggregatePassFail({
      good_fp_count: { median: 0, min: 0, max: 0, values: [0, 0, 0] },
      any_flag_recall_ratio: { median: 0.77, min: 0.77, max: 0.77, values: [0.77, 0.77, 0.77] },
      per_category_any_flag: {},
      strict_recall_ratio: { median: 0.38, min: 0.38, max: 0.38, values: [0.38, 0.38, 0.38] },
      decisions_produced_count: { median: 3, min: 3, max: 3, values: [3, 3, 3] },
      architecture: 'two-pass' as const,
      runtime_ms: { median: 106_000, min: 90_000, max: 120_000, values: [90_000, 106_000, 120_000] },
      empty_or_malformed_responses: { median: 0, min: 0, max: 0, values: [0, 0, 0] },
    });
    expect(result.latency_hard).toBe('PASS');
  });
});

// -----------------------------------------------------------------------
// Test 10: computeAggregatePassFail — empty/malformed every-run rule
// -----------------------------------------------------------------------
describe('computeAggregatePassFail — empty/malformed every-run rule', () => {
  it('FAILs empty_or_malformed when any single run has count > 0', () => {
    const result = computeAggregatePassFail({
      good_fp_count: { median: 0, min: 0, max: 0, values: [0, 0, 0] },
      any_flag_recall_ratio: { median: 0.77, min: 0.77, max: 0.77, values: [0.77, 0.77, 0.77] },
      per_category_any_flag: {},
      strict_recall_ratio: { median: 0.38, min: 0.38, max: 0.38, values: [0.38, 0.38, 0.38] },
      decisions_produced_count: { median: 3, min: 3, max: 3, values: [3, 3, 3] },
      architecture: 'two-pass' as const,
      runtime_ms: { median: 106_000, min: 106_000, max: 106_000, values: [106_000, 106_000, 106_000] },
      // run-002 had 1 empty response
      empty_or_malformed_responses: { median: 0, min: 0, max: 1, values: [0, 1, 0] },
    });
    expect(result.empty_or_malformed).toBe('FAIL');
    expect(result.overall).toBe('FAIL');
  });
});

// -----------------------------------------------------------------------
// Test 11: computeRecurringBarFailures — bar fails 2/3 → in recurring list
// -----------------------------------------------------------------------
describe('computeRecurringBarFailures', () => {
  it('includes bars that FAILed in >= ceil(N/2) runs', () => {
    // N=3, threshold=ceil(3/2)=2
    const perRunPassFails: PassFail[] = [
      {
        fp_ceiling: 'PASS',
        any_flag_recall_floor: 'FAIL', // fail in run-1
        per_category_any_flag_floor: 'PASS',
        strict_recall_floor: 'PASS',
        decision_vocab_completeness: 'FAIL', // fail in run-1
        latency_soft: 'PASS',
        latency_hard: 'PASS',
        empty_or_malformed: 'PASS',
        overall: 'FAIL',
      },
      {
        fp_ceiling: 'PASS',
        any_flag_recall_floor: 'FAIL', // fail in run-2 (recurring: 2/3)
        per_category_any_flag_floor: 'PASS',
        strict_recall_floor: 'PASS',
        decision_vocab_completeness: 'PASS', // only failed once
        latency_soft: 'PASS',
        latency_hard: 'PASS',
        empty_or_malformed: 'PASS',
        overall: 'FAIL',
      },
      {
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
    ];

    const recurring = computeRecurringBarFailures(perRunPassFails, 3);
    expect(recurring).toContain('any_flag_recall_floor'); // failed 2/3 — recurring
    expect(recurring).not.toContain('decision_vocab_completeness'); // failed 1/3 — not recurring
    expect(recurring).not.toContain('fp_ceiling');
  });
});

// -----------------------------------------------------------------------
// Test 12: computeAggregateStatusLabel — trusted_baseline (ideal case)
// -----------------------------------------------------------------------
describe('computeAggregateStatusLabel — trusted_baseline', () => {
  it('returns trusted_baseline for Hermes two-pass with PASS + FP=0 + no recurring failures', () => {
    const passFail: { overall: 'PASS' | 'FAIL' } & Record<string, 'PASS' | 'FAIL' | 'WARN'> = {
      fp_ceiling: 'PASS',
      any_flag_recall_floor: 'PASS',
      per_category_any_flag_floor: 'PASS',
      strict_recall_floor: 'PASS',
      decision_vocab_completeness: 'PASS',
      latency_soft: 'PASS',
      latency_hard: 'PASS',
      empty_or_malformed: 'PASS',
      overall: 'PASS',
    };

    const status = computeAggregateStatusLabel({
      profileName: 'hermes-two-pass',
      architecture: 'two-pass',
      aggregatePassFail: passFail as ReturnType<typeof computeAggregatePassFail>,
      medianGoodFpCount: 0,
      recurringBarFailures: [],
    });

    expect(status).toBe('trusted_baseline');
  });
});

// -----------------------------------------------------------------------
// Test 13: computeAggregateStatusLabel — recurring failure demotes to conditional_pass
// -----------------------------------------------------------------------
describe('computeAggregateStatusLabel — recurring failure demotion', () => {
  it('demotes from trusted_baseline to conditional_pass when any bar has recurring failure', () => {
    const passFail = {
      fp_ceiling: 'PASS',
      any_flag_recall_floor: 'PASS',
      per_category_any_flag_floor: 'PASS',
      strict_recall_floor: 'PASS',
      decision_vocab_completeness: 'PASS',
      latency_soft: 'PASS',
      latency_hard: 'PASS',
      empty_or_malformed: 'PASS',
      overall: 'PASS',
    } as ReturnType<typeof computeAggregatePassFail>;

    const status = computeAggregateStatusLabel({
      profileName: 'hermes-two-pass',
      architecture: 'two-pass',
      aggregatePassFail: passFail,
      medianGoodFpCount: 0,
      // decision_vocab_completeness failed in 2/3 runs — demotion kicks in
      recurringBarFailures: ['decision_vocab_completeness'],
    });

    expect(status).toBe('conditional_pass');
  });
});

// -----------------------------------------------------------------------
// Test 14: computeAggregateStatusLabel — conditional_pass for non-baseline
// -----------------------------------------------------------------------
describe('computeAggregateStatusLabel — conditional_pass paths', () => {
  const PASS_PF = {
    fp_ceiling: 'PASS',
    any_flag_recall_floor: 'PASS',
    per_category_any_flag_floor: 'PASS',
    strict_recall_floor: 'PASS',
    decision_vocab_completeness: 'PASS',
    latency_soft: 'PASS',
    latency_hard: 'PASS',
    empty_or_malformed: 'PASS',
    overall: 'PASS',
  } as ReturnType<typeof computeAggregatePassFail>;

  it('returns conditional_pass when FP median=1 (Hermes two-pass at ceiling)', () => {
    const status = computeAggregateStatusLabel({
      profileName: 'hermes-two-pass',
      architecture: 'two-pass',
      aggregatePassFail: PASS_PF,
      medianGoodFpCount: 1, // FP at ceiling — not 0, so no trusted_baseline
      recurringBarFailures: [],
    });
    expect(status).toBe('conditional_pass');
  });

  it('returns conditional_pass for non-Hermes profile (Mistral) that passes all bars', () => {
    const status = computeAggregateStatusLabel({
      profileName: 'mistral-nemo-two-pass',
      architecture: 'two-pass',
      aggregatePassFail: PASS_PF,
      medianGoodFpCount: 0,
      recurringBarFailures: [],
    });
    expect(status).toBe('conditional_pass');
  });

  it('returns comparison_only for single-pass Hermes regardless of pass/fail', () => {
    const failPf = { ...PASS_PF, overall: 'FAIL' as const };
    const status = computeAggregateStatusLabel({
      profileName: 'hermes-single-pass',
      architecture: 'single-pass',
      aggregatePassFail: failPf,
      medianGoodFpCount: 0,
      recurringBarFailures: [],
    });
    expect(status).toBe('comparison_only');
  });
});

// -----------------------------------------------------------------------
// Test 15: aggregateReceipts — round-trip 3 sample receipts → Zod validates
// -----------------------------------------------------------------------
describe('aggregateReceipts — round-trip Zod validation', () => {
  // Minimal valid single-run receipt shape
  const makeRunReceipt = (runIndex: number): CalibrationReceipt => ({
    schema_version: 1,
    profile_name: 'hermes-two-pass',
    status: 'trusted_baseline',
    model: 'hermes3:8b',
    architecture: 'two-pass',
    fixture: 'seeded-v1',
    fixture_total_claims: 18,
    fixture_good_claims: 5,
    fixture_bad_claims: 13,
    calibrated_at: `2026-05-10T0${runIndex}:00:00.000Z`,
    research_os_version: '0.4.0',
    runtime_ms: 100_000 + runIndex * 10_000,
    good_fp_count: 0,
    any_flag_recall: { matched: 10, total: 13, ratio: 10 / 13 },
    strict_recall: { matched: 5, total: 13, ratio: 5 / 13 },
    per_category_any_flag: {
      scope_widening: { matched: 2, total: 3, ratio: 2 / 3 },
      unsupported_claim: { matched: 2 + (runIndex % 2), total: 3, ratio: (2 + (runIndex % 2)) / 3 },
    },
    per_category_strict: {
      scope_widening: { matched: 2, total: 3, ratio: 2 / 3 },
      unsupported_claim: { matched: 0, total: 3, ratio: 0 },
    },
    decision_vocabulary: {
      accepted_for_synthesis: 14,
      rejected: 0,
      needs_scope_repair: 4,
      needs_source_repair: 0,
      needs_contradiction_mapping: 0,
      needs_human_review: 0,
    },
    decisions_produced_count: 2,
    decision_vocab_bar: { architecture: 'two-pass', required: 3, produced: 2, passed: false },
    unreachable_decisions: ['needs_contradiction_mapping'],
    empty_or_malformed_responses: 0,
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
    notes: [],
  });

  it('produces a Zod-valid aggregate receipt from 3 sample runs', () => {
    const runs = [makeRunReceipt(1), makeRunReceipt(2), makeRunReceipt(3)];
    const aggregate = aggregateReceipts(runs, {
      runFiles: ['runs/run-001.json', 'runs/run-002.json', 'runs/run-003.json'],
      aggregatedAt: '2026-05-10T12:00:00.000Z',
    });

    // Must not throw on Zod parse
    expect(() => AggregateCalibrationReceiptSchema.parse(aggregate)).not.toThrow();

    // Spot-check aggregate fields
    expect(aggregate.receipt_kind).toBe('aggregate');
    expect(aggregate.runs_count).toBe(3);
    expect(aggregate.run_files).toHaveLength(3);
    expect(aggregate.profile_name).toBe('hermes-two-pass');
    expect(aggregate.good_fp_count.median).toBe(0);
    expect(aggregate.good_fp_count.values).toHaveLength(3);
    expect(aggregate.recurring_bar_failures).toContain('decision_vocab_completeness');
    // All 3 runs failed decision_vocab — recurring (3/3 >= ceil(3/2)=2)
    expect(aggregate.pass_fail.overall).toBe('FAIL');
    expect(aggregate.status).toBe('failed');
  });
});
