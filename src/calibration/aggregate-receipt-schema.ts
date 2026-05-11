import { z } from 'zod';
import { StatusLabelSchema, ArchitectureSchema, ReviewerOptionsSchema } from './receipt-schema.js';

export const AggregateMetricSchema = z.object({
  median: z.number(),
  min: z.number(),
  max: z.number(),
  values: z.array(z.number()), // per-run values in run order (run-001, run-002, ...)
});

export const PerCategoryAggregateEntrySchema = z.object({
  median_ratio: z.number().min(0).max(1),
  min_ratio: z.number().min(0).max(1),
  max_ratio: z.number().min(0).max(1),
  total: z.number().int().nonnegative(), // seed count — same across all runs
  per_run_ratios: z.array(z.number()),
});

export const PerCategoryAggregateSchema = z.record(z.string(), PerCategoryAggregateEntrySchema);

export const AggregatePassFailSchema = z.object({
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

export const AggregateDecisionVocabBarSchema = z.object({
  architecture: ArchitectureSchema,
  required: z.number().int().positive(),
  median_produced: z.number(), // float — median of per-run decisions_produced_count
  passed: z.boolean(),
});

// B-C-001: SUPPORTED_AGGREGATE_RECEIPT_VERSIONS is the canonical list of
// aggregate-receipt schema versions this build can read. When v2 lands,
// append 2 here AND swap the z.literal(1) below for
// z.union([z.literal(1), z.literal(2)]) (and branch inside the aggregate
// reader). Zod3's z.union requires >= 2 literals, so today the schema field
// remains z.literal(1); forward-compat dispatch lives in the consumer
// wrapper, not in the schema alone.
export const SUPPORTED_AGGREGATE_RECEIPT_VERSIONS = [1] as const;

export const AggregateCalibrationReceiptSchema = z.object({
  schema_version: z.literal(1),
  receipt_kind: z.literal('aggregate'), // discriminates from single-run receipt
  profile_name: z.string(),
  status: StatusLabelSchema,
  model: z.string(),
  architecture: ArchitectureSchema,
  fixture: z.string(),
  fixture_total_claims: z.number().int().positive(),
  fixture_good_claims: z.number().int().nonnegative(),
  fixture_bad_claims: z.number().int().nonnegative(),
  runs_count: z.number().int().min(2),
  run_files: z.array(z.string()), // relative paths: runs/run-001.json, etc.
  aggregated_at: z.string(), // ISO 8601
  research_os_version: z.string(),

  // Aggregate metrics — median + min + max + per-run values in run order
  good_fp_count: AggregateMetricSchema,
  any_flag_recall_ratio: AggregateMetricSchema,
  strict_recall_ratio: AggregateMetricSchema,
  decisions_produced_count: AggregateMetricSchema,
  runtime_ms: AggregateMetricSchema,
  empty_or_malformed_responses: AggregateMetricSchema,

  per_category_any_flag: PerCategoryAggregateSchema,
  per_category_strict: PerCategoryAggregateSchema,

  // Decision vocabulary — union of all decisions seen across runs, median count each
  decision_vocabulary: z.record(z.string(), AggregateMetricSchema),
  decision_vocab_bar: AggregateDecisionVocabBarSchema,
  unreachable_decisions: z.array(z.string()),

  pass_fail: AggregatePassFailSchema,
  // Bars that FAILed in >= ceil(runs_count/2) individual runs.
  // Non-empty list demotes trusted_baseline to conditional_pass.
  recurring_bar_failures: z.array(z.string()),

  notes: z.array(z.string()),

  // schema_version: 1 — additive-optional (Exp6 Session 2):
  //   Same options object stamped on every per-run receipt. Absent = stochastic run.
  reviewer_options: ReviewerOptionsSchema.optional(),
});

export type AggregateMetric = z.infer<typeof AggregateMetricSchema>;
export type PerCategoryAggregateEntry = z.infer<typeof PerCategoryAggregateEntrySchema>;
export type PerCategoryAggregate = z.infer<typeof PerCategoryAggregateSchema>;
export type AggregatePassFail = z.infer<typeof AggregatePassFailSchema>;
export type AggregateDecisionVocabBar = z.infer<typeof AggregateDecisionVocabBarSchema>;
export type AggregateCalibrationReceipt = z.infer<typeof AggregateCalibrationReceiptSchema>;
