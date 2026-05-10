import { z } from 'zod';

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
});

export type StatusLabel = z.infer<typeof StatusLabelSchema>;
export type Architecture = z.infer<typeof ArchitectureSchema>;
export type Recall = z.infer<typeof RecallSchema>;
export type PerCategoryRecall = z.infer<typeof PerCategoryRecallSchema>;
export type PassFail = z.infer<typeof PassFailSchema>;
export type DecisionVocabBar = z.infer<typeof DecisionVocabBarSchema>;
export type CalibrationReceipt = z.infer<typeof CalibrationReceiptSchema>;
