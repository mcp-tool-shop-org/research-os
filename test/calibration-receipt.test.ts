import { describe, it, expect } from 'vitest';
import {
  computeDecisionVocabBar,
  computePassFail,
  computeStatusLabel,
  buildReceiptMarkdown,
  receiptToCalibrationSummary,
} from '../src/calibration/receipt.js';
import { ClaimReviewSchema } from '../src/review/schema.js';
import { CalibrationReceiptSchema as ReceiptSchema } from '../src/calibration/receipt-schema.js';

const baseReview = {
  claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
  decision: 'accepted_for_synthesis' as const,
  reason: 'No findings.',
  finding_ids: [],
  reviewer: 'heuristic' as const,
  review_method: 'heuristic_field_and_grounding_checks',
  created_at: '2026-05-10T00:00:00.000Z',
};

// --- 1. Schema compat: existing records without profile parse cleanly ---
describe('ClaimReviewSchema backward compat', () => {
  it('parses pre-v0.5 record without profile field', () => {
    expect(() => ClaimReviewSchema.parse(baseReview)).not.toThrow();
    const parsed = ClaimReviewSchema.parse(baseReview);
    expect(parsed.profile).toBeUndefined();
  });

  // 2. New records with profile field parse cleanly
  it('parses v0.5 record with profile field', () => {
    const withProfile = { ...baseReview, profile: 'hermes-two-pass' };
    const parsed = ClaimReviewSchema.parse(withProfile);
    expect(parsed.profile).toBe('hermes-two-pass');
  });

});

// --- 3. computeDecisionVocabBar — architecture-aware required threshold ---
describe('computeDecisionVocabBar', () => {
  it('requires 4 for single-pass', () => {
    const bar = computeDecisionVocabBar('single-pass', 4);
    expect(bar.required).toBe(4);
    expect(bar.produced).toBe(4);
    expect(bar.passed).toBe(true);
  });

  it('requires 3 for two-pass', () => {
    const bar = computeDecisionVocabBar('two-pass', 3);
    expect(bar.required).toBe(3);
    expect(bar.passed).toBe(true);
  });

  // 4. passed=true only when produced >= required
  it('fails when produced < required (single-pass 3/4)', () => {
    const bar = computeDecisionVocabBar('single-pass', 3);
    expect(bar.passed).toBe(false);
  });

  it('fails when produced < required (two-pass 2/3)', () => {
    const bar = computeDecisionVocabBar('two-pass', 2);
    expect(bar.passed).toBe(false);
  });

});

type PassFailInput = {
  good_fp_count: number;
  any_flag_recall: { matched: number; total: number; ratio: number };
  per_category_any_flag: Record<string, { matched: number; total: number; ratio: number }>;
  strict_recall: { matched: number; total: number; ratio: number };
  decision_vocab_bar: ReturnType<typeof computeDecisionVocabBar>;
  runtime_ms: number;
  empty_or_malformed_responses: number;
};

// Default inputs that produce a clean PASS. Override any field to test FAIL paths.
const defaultPassFailInput: PassFailInput = {
  good_fp_count: 0,
  any_flag_recall: { matched: 10, total: 13, ratio: 0.77 },
  per_category_any_flag: {
    scope_widening: { matched: 2, total: 3, ratio: 0.67 },
    unsupported_claim: { matched: 3, total: 3, ratio: 1.0 },
    definition_drift: { matched: 1, total: 2, ratio: 0.5 },
    temporal_mismatch: { matched: 1, total: 2, ratio: 0.5 },
    valid_but_low_value: { matched: 3, total: 3, ratio: 1.0 },
  },
  strict_recall: { matched: 5, total: 13, ratio: 0.38 },
  decision_vocab_bar: computeDecisionVocabBar('two-pass', 3),
  runtime_ms: 120_000,
  empty_or_malformed_responses: 0,
};

function makePassFail(overrides: Partial<PassFailInput> = {}) {
  return computePassFail({ ...defaultPassFailInput, ...overrides });
}

// --- 5. Per-category any-flag floor ---
describe('computePassFail — per-category any-flag floor', () => {
  it('FAIL when a category with total >= 2 has ratio < 0.50', () => {
    const pf = computePassFail({
      good_fp_count: 0,
      any_flag_recall: { matched: 10, total: 13, ratio: 0.77 },
      per_category_any_flag: {
        definition_drift: { matched: 0, total: 2, ratio: 0.0 },
      },
      strict_recall: { matched: 5, total: 13, ratio: 0.38 },
      decision_vocab_bar: computeDecisionVocabBar('two-pass', 3),
      runtime_ms: 120_000,
      empty_or_malformed_responses: 0,
    });
    expect(pf.per_category_any_flag_floor).toBe('FAIL');
    expect(pf.overall).toBe('FAIL');
  });

  it('PASS when all categories with total >= 2 have ratio >= 0.50', () => {
    const pf = makePassFail();
    expect(pf.per_category_any_flag_floor).toBe('PASS');
  });

  it('ignores categories with total < 2 for floor check', () => {
    const pf = computePassFail({
      good_fp_count: 0,
      any_flag_recall: { matched: 10, total: 13, ratio: 0.77 },
      per_category_any_flag: {
        rare_category: { matched: 0, total: 1, ratio: 0.0 },
      },
      strict_recall: { matched: 5, total: 13, ratio: 0.38 },
      decision_vocab_bar: computeDecisionVocabBar('two-pass', 3),
      runtime_ms: 120_000,
      empty_or_malformed_responses: 0,
    });
    expect(pf.per_category_any_flag_floor).toBe('PASS');
  });
});

// --- 6. FP ceiling ---
describe('computePassFail — FP ceiling', () => {
  it('PASS when good_fp_count == 1 (at ceiling, not over)', () => {
    const pf = makePassFail({ good_fp_count: 1 });
    expect(pf.fp_ceiling).toBe('PASS');
  });

  it('FAIL when good_fp_count == 2 (over ceiling)', () => {
    const pf = makePassFail({ good_fp_count: 2 });
    expect(pf.fp_ceiling).toBe('FAIL');
    expect(pf.overall).toBe('FAIL');
  });

});

// --- 7. Latency soft is WARN, not FAIL ---
describe('computePassFail — latency', () => {
  it('latency_soft is WARN above 600s, not FAIL', () => {
    const pf = makePassFail({ runtime_ms: 700_000 });
    expect(pf.latency_soft).toBe('WARN');
    expect(pf.latency_hard).toBe('PASS');
    // WARN-only: overall should still PASS if all hard bars pass
    expect(pf.overall).toBe('PASS');
  });

  // 8. Latency hard FAIL above 1200s
  it('latency_hard FAIL above 1200s', () => {
    const pf = makePassFail({ runtime_ms: 1_500_000 });
    expect(pf.latency_hard).toBe('FAIL');
    expect(pf.overall).toBe('FAIL');
  });
});

// --- 9. Overall FAIL when any hard bar fails ---
describe('computePassFail — overall', () => {
  it('overall FAIL propagates from any_flag_recall_floor', () => {
    const pf = makePassFail({
      any_flag_recall: { matched: 7, total: 13, ratio: 0.54 },
    });
    expect(pf.any_flag_recall_floor).toBe('FAIL');
    expect(pf.overall).toBe('FAIL');
  });

  it('overall PASS when all hard bars pass', () => {
    const pf = makePassFail();
    expect(pf.overall).toBe('PASS');
  });

});

// --- 10-14. computeStatusLabel ---
describe('computeStatusLabel', () => {
  const baseInput = {
    profileName: 'hermes-two-pass',
    architecture: 'two-pass' as const,
    passFail: makePassFail(),
    goodFpCount: 0,
  };

  // 10. hermes two-pass + PASS + FP=0 => trusted_baseline
  it('trusted_baseline for canonical hermes two-pass with FP=0', () => {
    expect(computeStatusLabel(baseInput)).toBe('trusted_baseline');
  });

  // 11. non-baseline + PASS + FP=1 => conditional_pass
  it('conditional_pass for non-baseline with FP at ceiling', () => {
    expect(
      computeStatusLabel({
        profileName: 'mistral-nemo-two-pass',
        architecture: 'two-pass',
        passFail: makePassFail({ good_fp_count: 1 }),
        goodFpCount: 1,
      }),
    ).toBe('conditional_pass');
  });

  // 12. overall FAIL => failed
  it('failed when any hard bar fails', () => {
    const failedPf = makePassFail({ good_fp_count: 2 });
    expect(
      computeStatusLabel({ ...baseInput, passFail: failedPf, goodFpCount: 2 }),
    ).toBe('failed');
  });

  // 13. hermes single-pass => comparison_only (auto-assigned)
  it('comparison_only for hermes single-pass (auto)', () => {
    const singlePassPf = makePassFail({
      decision_vocab_bar: computeDecisionVocabBar('single-pass', 4),
    });
    expect(
      computeStatusLabel({
        profileName: 'hermes-single-pass',
        architecture: 'single-pass',
        passFail: singlePassPf,
        goodFpCount: 0,
      }),
    ).toBe('comparison_only');
  });

  // 14. explicit modeOverride => comparison_only regardless of other inputs
  it('comparison_only via modeOverride regardless of profile or bars', () => {
    expect(
      computeStatusLabel({ ...baseInput, modeOverride: 'comparison_only' }),
    ).toBe('comparison_only');
  });

  // Extra: hermes two-pass PASS but FP=1 => conditional_pass (not trusted_baseline)
  it('conditional_pass for hermes two-pass with FP=1 (at ceiling)', () => {
    expect(
      computeStatusLabel({
        profileName: 'hermes-two-pass',
        architecture: 'two-pass',
        passFail: makePassFail({ good_fp_count: 1 }),
        goodFpCount: 1,
      }),
    ).toBe('conditional_pass');
  });
});

// Shared receipt fixture for markdown + summary tests
const baseReceipt = ReceiptSchema.parse({
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
    runtime_ms: 120_000,
    good_fp_count: 0,
    any_flag_recall: { matched: 10, total: 13, ratio: 0.769 },
    strict_recall: { matched: 5, total: 13, ratio: 0.385 },
    per_category_any_flag: {
      scope_widening: { matched: 2, total: 3, ratio: 0.667 },
      unsupported_claim: { matched: 3, total: 3, ratio: 1.0 },
    },
    per_category_strict: {
      scope_widening: { matched: 1, total: 3, ratio: 0.333 },
      unsupported_claim: { matched: 2, total: 3, ratio: 0.667 },
    },
    decision_vocabulary: {
      accepted_for_synthesis: 10,
      rejected: 5,
      needs_scope_repair: 3,
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
  });

// --- 15. Markdown receipt contains all required sections ---
describe('buildReceiptMarkdown', () => {
  it('contains all 6 required sections', () => {
    const md = buildReceiptMarkdown(baseReceipt);
    expect(md).toContain('# Calibration Receipt — hermes-two-pass');
    expect(md).toContain('## Headline metrics');
    expect(md).toContain('## PASS / FAIL');
    expect(md).toContain('## Per-category recall');
    expect(md).toContain('## Decision vocabulary');
    // Notes section is optional — rendered when notes array is non-empty
  });

  it('shows unreachable decision annotation', () => {
    const md = buildReceiptMarkdown(baseReceipt);
    expect(md).toContain('unreachable from seeded-v1');
  });

  it('renders notes section when notes are present', () => {
    const withNotes = { ...baseReceipt, notes: ['Test note'] };
    const md = buildReceiptMarkdown(withNotes);
    expect(md).toContain('## Notes');
    expect(md).toContain('Test note');
  });
});

// --- receiptToCalibrationSummary ---
describe('receiptToCalibrationSummary', () => {
  it('maps structured receipt to PromotionCalibrationSummary string fields', () => {
    const summary = receiptToCalibrationSummary(baseReceipt);
    expect(summary.fixture).toBe('seeded-v1');
    expect(summary.good_false_positive_rate).toContain('/5');
    expect(summary.bad_any_flag_recall).toContain('/13');
    expect(summary.notes).toContain('trusted_baseline');
  });
});

// --- Receipt JSON round-trip ---
describe('CalibrationReceiptSchema round-trip', () => {
  it('validates a well-formed receipt', () => {
    const data = {
      schema_version: 1,
      profile_name: 'mistral-nemo-two-pass',
      status: 'conditional_pass',
      model: 'mistral-nemo:12b',
      architecture: 'two-pass',
      fixture: 'seeded-v1',
      fixture_total_claims: 18,
      fixture_good_claims: 5,
      fixture_bad_claims: 13,
      calibrated_at: '2026-05-10T01:00:00.000Z',
      research_os_version: '0.4.0',
      runtime_ms: 152_000,
      good_fp_count: 1,
      any_flag_recall: { matched: 10, total: 13, ratio: 0.769 },
      strict_recall: { matched: 7, total: 13, ratio: 0.538 },
      per_category_any_flag: {},
      per_category_strict: {},
      decision_vocabulary: {
        accepted_for_synthesis: 8,
        rejected: 3,
        needs_scope_repair: 2,
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
      notes: ['1 FP on good_5'],
    };
    expect(() => ReceiptSchema.parse(data)).not.toThrow();
    const parsed = ReceiptSchema.parse(data);
    expect(parsed.status).toBe('conditional_pass');
    expect(parsed.good_fp_count).toBe(1);
  });
});
