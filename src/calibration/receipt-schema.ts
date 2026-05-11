import { z } from 'zod';
import { ReviewerOptionsSchema } from '../review/reviewer-options-schema.js';
export { ReviewerOptionsSchema };
export type { ReviewerOptions } from '../review/reviewer-options-schema.js';

export const StatusLabelSchema = z.enum([
  'trusted_baseline',
  'conditional_pass',
  'failed',
  'comparison_only',
]);

export const ArchitectureSchema = z.enum(['single-pass', 'two-pass']);

export const RecallSchema = z.object({
  matched: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  ratio: z.number().min(0).max(1),
});

export const PerCategoryRecallSchema = z.record(z.string(), RecallSchema);

export const PassFailSchema = z.object({
  fp_ceiling: z.enum(['PASS', 'FAIL']),
  any_flag_recall_floor: z.enum(['PASS', 'FAIL']),
  per_category_any_flag_floor: z.enum(['PASS', 'FAIL']),
  strict_recall_floor: z.enum(['PASS', 'FAIL']),
  decision_vocab_completeness: z.enum(['PASS', 'FAIL']),
  latency_soft: z.enum(['PASS', 'WARN']),
  latency_hard: z.enum(['PASS', 'FAIL']),
  empty_or_malformed: z.enum(['PASS', 'FAIL']),
  overall: z.enum(['PASS', 'FAIL']),
});

export const DecisionVocabBarSchema = z.object({
  architecture: ArchitectureSchema,
  required: z.number().int().positive(),
  produced: z.number().int().nonnegative(),
  passed: z.boolean(),
});

// B-C-001: SUPPORTED_RECEIPT_VERSIONS is the canonical list of receipt schema
// versions this build can read. When v2 lands, append 2 here AND swap the
// z.literal(1) below for z.union([z.literal(1), z.literal(2)]) (and branch
// inside receiptToCalibrationSummary). The two changes land together; this
// constant is the single source of truth that lookup.ts wraps to throw a
// structured UnsupportedReceiptVersionError for unknown versions.
// Note: zod3 z.union requires >= 2 literals, so today the schema field is
// z.literal(1); the structural readiness comes from SUPPORTED_RECEIPT_VERSIONS
// + the lookup.ts wrapper (UnsupportedReceiptVersionError dispatch), not from
// a single-element union form. The list-based check in lookup.ts is the
// load-bearing forward-compat seam.
export const SUPPORTED_RECEIPT_VERSIONS = [1] as const;

// schema_version: 1 — additive-optional additions (Exp6 Session 2):
//   reviewer_options: optional sampling params used during this calibration run.
//   Absent = stochastic run (pre-v0.6 compat preserved). Present = keys explicitly set.
export const CalibrationReceiptSchema = z.object({
  schema_version: z.literal(1),
  profile_name: z.string(),
  status: StatusLabelSchema,
  model: z.string(),
  architecture: ArchitectureSchema,
  fixture: z.string(),
  fixture_total_claims: z.number().int().positive(),
  fixture_good_claims: z.number().int().nonnegative(),
  fixture_bad_claims: z.number().int().nonnegative(),
  calibrated_at: z.string(),
  research_os_version: z.string(),
  runtime_ms: z.number().int().nonnegative(),
  good_fp_count: z.number().int().nonnegative(),
  any_flag_recall: RecallSchema,
  strict_recall: RecallSchema,
  per_category_any_flag: PerCategoryRecallSchema,
  per_category_strict: PerCategoryRecallSchema,
  decision_vocabulary: z.record(z.string(), z.number().int().nonnegative()),
  decisions_produced_count: z.number().int().nonnegative(),
  decision_vocab_bar: DecisionVocabBarSchema,
  unreachable_decisions: z.array(z.string()),
  empty_or_malformed_responses: z.number().int().nonnegative(),
  pass_fail: PassFailSchema,
  notes: z.array(z.string()),
  reviewer_options: ReviewerOptionsSchema.optional(),
});

export type StatusLabel = z.infer<typeof StatusLabelSchema>;
export type Architecture = z.infer<typeof ArchitectureSchema>;
export type Recall = z.infer<typeof RecallSchema>;
export type PerCategoryRecall = z.infer<typeof PerCategoryRecallSchema>;
export type PassFail = z.infer<typeof PassFailSchema>;
export type DecisionVocabBar = z.infer<typeof DecisionVocabBarSchema>;
export type CalibrationReceipt = z.infer<typeof CalibrationReceiptSchema>;
