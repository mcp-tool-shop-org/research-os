import type { Architecture, CalibrationReceipt, PassFail, PerCategoryRecall, ReviewerOptions } from './receipt-schema.js';
import {
  AggregateCalibrationReceiptSchema,
  type AggregateCalibrationReceipt,
  type AggregateMetric,
  type AggregatePassFail,
  type PerCategoryAggregate,
} from './aggregate-receipt-schema.js';
import type { StatusLabel } from './receipt-schema.js';

// Compute median of a sorted or unsorted array.
// Throws on empty input — callers always have at least one run.
// For even-length arrays: mean of two middle values (float, not rounded).
// Integer-valued metrics (FP count, decisions) stay as floats here;
// the caller's bar comparisons (>= 3, === 0) work correctly on exact floats
// because the inputs are small integers.
export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median: empty array');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

// Aggregate a list of per-run scalar values into { median, min, max, values }.
// values preserves input order (run-001, run-002, ...) for traceability.
export function aggregateMetric(values: number[]): AggregateMetric {
  const m = median(values);
  return {
    median: m,
    min: Math.min(...values),
    max: Math.max(...values),
    values,
  };
}

// Aggregate per-run per-category recall objects.
// Each element of perRunBuckets is one run's PerCategoryRecall
// (Record<category, { matched, total, ratio }>).
// Returns PerCategoryAggregate: per-category median/min/max ratio + per-run ratios.
// total is taken from the first run that has the category (same across runs —
// SEEDS is static so category totals never change between runs).
export function aggregatePerCategoryRecall(
  perRunBuckets: PerCategoryRecall[],
): PerCategoryAggregate {
  const cats = new Set<string>();
  for (const run of perRunBuckets) {
    for (const cat of Object.keys(run)) cats.add(cat);
  }

  const result: PerCategoryAggregate = {};
  for (const cat of cats) {
    const ratios = perRunBuckets.map((run) => run[cat]?.ratio ?? 0);
    const total = perRunBuckets.find((run) => run[cat] !== undefined)?.[cat]?.total ?? 0;
    result[cat] = {
      median_ratio: median(ratios),
      min_ratio: Math.min(...ratios),
      max_ratio: Math.max(...ratios),
      total,
      per_run_ratios: ratios,
    };
  }
  return result;
}

// Aggregate per-run decision vocabulary count dicts.
// Each element is one run's decision_vocabulary (Record<decision, count>).
// Returns Record<decision, AggregateMetric> with median count per decision.
export function aggregateDecisionVocabulary(
  perRunDicts: Record<string, number>[],
): Record<string, AggregateMetric> {
  const decisions = new Set<string>();
  for (const run of perRunDicts) {
    for (const d of Object.keys(run)) decisions.add(d);
  }

  const result: Record<string, AggregateMetric> = {};
  for (const d of decisions) {
    const values = perRunDicts.map((run) => run[d] ?? 0);
    result[d] = aggregateMetric(values);
  }
  return result;
}

// Compute aggregate PASS/FAIL bars from aggregated metrics.
//
// Advisor-locked rules (gospel):
//   FP ceiling:          median <= 1  AND  max <= 2
//   Any-flag recall:     median >= 0.65
//   Per-category:        median_ratio >= 0.50 for categories with total >= 2
//   Strict recall:       median >= 0.20
//   Decision vocab:      median >= required (architecture-aware: two-pass=3, single-pass=4)
//   Latency soft:        median <= 600_000 → WARN only, never FAIL
//   Latency hard:        every-run rule — max <= 1_200_000
//   Empty/malformed:     every-run rule — max === 0
export function computeAggregatePassFail(input: {
  good_fp_count: AggregateMetric;
  any_flag_recall_ratio: AggregateMetric;
  per_category_any_flag: PerCategoryAggregate;
  strict_recall_ratio: AggregateMetric;
  decisions_produced_count: AggregateMetric;
  architecture: Architecture;
  runtime_ms: AggregateMetric;
  empty_or_malformed_responses: AggregateMetric;
}): AggregatePassFail {
  const fp_ceiling: 'PASS' | 'FAIL' =
    input.good_fp_count.median <= 1 && input.good_fp_count.max <= 2 ? 'PASS' : 'FAIL';

  const any_flag_recall_floor: 'PASS' | 'FAIL' =
    input.any_flag_recall_ratio.median >= 0.65 ? 'PASS' : 'FAIL';

  let per_category_any_flag_floor: 'PASS' | 'FAIL' = 'PASS';
  for (const entry of Object.values(input.per_category_any_flag)) {
    if (entry.total >= 2 && entry.median_ratio < 0.5) {
      per_category_any_flag_floor = 'FAIL';
      break;
    }
  }

  const strict_recall_floor: 'PASS' | 'FAIL' =
    input.strict_recall_ratio.median >= 0.2 ? 'PASS' : 'FAIL';

  const dvRequired = input.architecture === 'two-pass' ? 3 : 4;
  const decision_vocab_completeness: 'PASS' | 'FAIL' =
    input.decisions_produced_count.median >= dvRequired ? 'PASS' : 'FAIL';

  // Latency soft: WARN-only signal — no FAIL contribution
  const latency_soft: 'PASS' | 'WARN' =
    input.runtime_ms.median <= 600_000 ? 'PASS' : 'WARN';

  // Latency hard: every-run rule — enforced via max
  const latency_hard: 'PASS' | 'FAIL' =
    input.runtime_ms.max <= 1_200_000 ? 'PASS' : 'FAIL';

  // Empty/malformed: every-run rule — enforced via max
  const empty_or_malformed: 'PASS' | 'FAIL' =
    input.empty_or_malformed_responses.max === 0 ? 'PASS' : 'FAIL';

  const hardBars: ('PASS' | 'FAIL')[] = [
    fp_ceiling,
    any_flag_recall_floor,
    per_category_any_flag_floor,
    strict_recall_floor,
    decision_vocab_completeness,
    latency_hard,
    empty_or_malformed,
  ];
  const overall: 'PASS' | 'FAIL' = hardBars.every((v) => v === 'PASS') ? 'PASS' : 'FAIL';

  return {
    fp_ceiling,
    any_flag_recall_floor,
    per_category_any_flag_floor,
    strict_recall_floor,
    decision_vocab_completeness,
    latency_soft,
    latency_hard,
    empty_or_malformed,
    overall,
  };
}

// Compute which hard bars FAILed in >= ceil(N/2) individual runs.
// A non-empty result means that bar was SYSTEMATICALLY unreliable —
// not just a one-run outlier that happened to median-pass.
// This is used by computeAggregateStatusLabel to prevent a profile from
// earning trusted_baseline when one bar failed in the majority of runs.
//
// Hard bars checked (latency_soft and overall are excluded):
//   fp_ceiling, any_flag_recall_floor, per_category_any_flag_floor,
//   strict_recall_floor, decision_vocab_completeness, latency_hard, empty_or_malformed
export function computeRecurringBarFailures(
  perRunPassFails: PassFail[],
  totalRuns: number,
): string[] {
  const threshold = Math.ceil(totalRuns / 2);
  const HARD_BARS: (keyof PassFail)[] = [
    'fp_ceiling',
    'any_flag_recall_floor',
    'per_category_any_flag_floor',
    'strict_recall_floor',
    'decision_vocab_completeness',
    'latency_hard',
    'empty_or_malformed',
  ];

  const recurring: string[] = [];
  for (const bar of HARD_BARS) {
    const failCount = perRunPassFails.filter((pf) => pf[bar] === 'FAIL').length;
    if (failCount >= threshold) recurring.push(bar);
  }
  return recurring;
}

// Assign aggregate status label.
//
// Advisor-locked predicates (priority order):
//   1. comparison_only — explicit mode flag OR single-pass Hermes (regardless of pass/fail)
//   2. failed          — aggregate pass_fail.overall === FAIL
//   3. trusted_baseline — Hermes two-pass AND aggregate PASS AND median(FP) === 0
//                         AND recurring_bar_failures.length === 0
//      The recurring-failure check prevents a profile from earning trusted_baseline
//      when any hard bar FAILed in >= ceil(N/2) runs even if the median still passed.
//      Intent: "one lucky median cannot mask systemic bar weakness."
//   4. conditional_pass — fallthrough (passes but doesn't earn trusted_baseline)
//      Mistral two-pass is capped at conditional_pass regardless of aggregate result.
export function computeAggregateStatusLabel(input: {
  profileName: string;
  architecture: Architecture;
  aggregatePassFail: AggregatePassFail;
  medianGoodFpCount: number;
  recurringBarFailures: string[];
  modeOverride?: 'comparison_only';
}): StatusLabel {
  if (input.modeOverride === 'comparison_only') return 'comparison_only';

  if (input.architecture === 'single-pass' && /hermes/i.test(input.profileName)) {
    return 'comparison_only';
  }

  if (input.aggregatePassFail.overall === 'FAIL') return 'failed';

  const isHermesTwoPass =
    /hermes/i.test(input.profileName) && input.architecture === 'two-pass';
  if (
    isHermesTwoPass &&
    input.medianGoodFpCount === 0 &&
    input.recurringBarFailures.length === 0
  ) {
    return 'trusted_baseline';
  }

  return 'conditional_pass';
}

// Aggregate N single-run receipts into one AggregateCalibrationReceipt.
// All receipts must be from the same profile/model/architecture.
// opts.runFiles: relative paths for each run (e.g. 'runs/run-001.json').
// opts.modeOverride: forward 'comparison_only' to status-label predicate.
// opts.aggregatedAt: ISO timestamp (defaults to now).
// opts.reviewerOptions: reviewer sampling options stamped on each per-run receipt.
//   Captured once at harness startup and reused across all N runs. The aggregate
//   carries the same object so consumers can reproduce the exact invocation.
export function aggregateReceipts(
  runs: CalibrationReceipt[],
  opts: {
    runFiles: string[];
    modeOverride?: 'comparison_only';
    aggregatedAt?: string;
    reviewerOptions?: ReviewerOptions;
  },
): AggregateCalibrationReceipt {
  if (runs.length === 0) throw new Error('aggregateReceipts: no runs provided');
  const first = runs[0];

  const fpMetric = aggregateMetric(runs.map((r) => r.good_fp_count));
  const anyFlagRatioMetric = aggregateMetric(runs.map((r) => r.any_flag_recall.ratio));
  const strictRatioMetric = aggregateMetric(runs.map((r) => r.strict_recall.ratio));
  const decisionsMetric = aggregateMetric(runs.map((r) => r.decisions_produced_count));
  const runtimeMetric = aggregateMetric(runs.map((r) => r.runtime_ms));
  const emptyOrMalformedMetric = aggregateMetric(
    runs.map((r) => r.empty_or_malformed_responses),
  );

  const perCatAnyFlag = aggregatePerCategoryRecall(runs.map((r) => r.per_category_any_flag));
  const perCatStrict = aggregatePerCategoryRecall(runs.map((r) => r.per_category_strict));
  const decisionVocab = aggregateDecisionVocabulary(runs.map((r) => r.decision_vocabulary));

  const dvRequired = first.architecture === 'two-pass' ? 3 : 4;
  const decisionVocabBar = {
    architecture: first.architecture,
    required: dvRequired,
    median_produced: decisionsMetric.median,
    passed: decisionsMetric.median >= dvRequired,
  };

  const aggregatePassFail = computeAggregatePassFail({
    good_fp_count: fpMetric,
    any_flag_recall_ratio: anyFlagRatioMetric,
    per_category_any_flag: perCatAnyFlag,
    strict_recall_ratio: strictRatioMetric,
    decisions_produced_count: decisionsMetric,
    architecture: first.architecture,
    runtime_ms: runtimeMetric,
    empty_or_malformed_responses: emptyOrMalformedMetric,
  });

  const recurringBarFailures = computeRecurringBarFailures(
    runs.map((r) => r.pass_fail),
    runs.length,
  );

  const status = computeAggregateStatusLabel({
    profileName: first.profile_name,
    architecture: first.architecture,
    aggregatePassFail,
    medianGoodFpCount: fpMetric.median,
    recurringBarFailures,
    modeOverride: opts.modeOverride,
  });

  const notes: string[] = [];
  if (aggregatePassFail.latency_soft === 'WARN') {
    notes.push(
      `Latency warning: median ${(runtimeMetric.median / 1000).toFixed(1)}s exceeds soft limit of 600s`,
    );
  }
  if (fpMetric.median > 0) {
    notes.push(`FP at ceiling: median ${fpMetric.median} false positive(s) on good claims`);
  }
  if (recurringBarFailures.length > 0) {
    notes.push(`Recurring bar failures (>= ceil(N/2) runs): ${recurringBarFailures.join(', ')}`);
  }
  if (status === 'comparison_only') {
    notes.push(
      'comparison_only: architectural side-run, not a production admission candidate',
    );
  }
  if (status === 'conditional_pass') {
    notes.push('conditional_pass: passes all bars but carries a production caution');
  }

  return AggregateCalibrationReceiptSchema.parse({
    schema_version: 1,
    receipt_kind: 'aggregate',
    profile_name: first.profile_name,
    status,
    model: first.model,
    architecture: first.architecture,
    fixture: first.fixture,
    fixture_total_claims: first.fixture_total_claims,
    fixture_good_claims: first.fixture_good_claims,
    fixture_bad_claims: first.fixture_bad_claims,
    runs_count: runs.length,
    run_files: opts.runFiles,
    aggregated_at: opts.aggregatedAt ?? new Date().toISOString(),
    research_os_version: first.research_os_version,
    good_fp_count: fpMetric,
    any_flag_recall_ratio: anyFlagRatioMetric,
    strict_recall_ratio: strictRatioMetric,
    decisions_produced_count: decisionsMetric,
    runtime_ms: runtimeMetric,
    empty_or_malformed_responses: emptyOrMalformedMetric,
    per_category_any_flag: perCatAnyFlag,
    per_category_strict: perCatStrict,
    decision_vocabulary: decisionVocab,
    decision_vocab_bar: decisionVocabBar,
    unreachable_decisions: first.unreachable_decisions,
    pass_fail: aggregatePassFail,
    recurring_bar_failures: recurringBarFailures,
    notes,
    ...(opts.reviewerOptions && Object.keys(opts.reviewerOptions).length > 0 && {
      reviewer_options: opts.reviewerOptions,
    }),
  });
}

// Stable key order for reviewer_options rendering (matches single-run receipt).
const REVIEWER_OPTIONS_KEY_ORDER = [
  'num_ctx',
  'temperature',
  'seed',
  'top_p',
  'top_k',
  'repeat_penalty',
] as const;

function buildReviewerOptionsSection(opts: AggregateCalibrationReceipt['reviewer_options']): string {
  if (!opts) return '';
  const lines = REVIEWER_OPTIONS_KEY_ORDER
    .filter((k) => opts[k] !== undefined)
    .map((k) => `- ${k}: ${opts[k]}`);
  if (lines.length === 0) return '';
  return `\n## Reviewer options\n\n${lines.join('\n')}\n`;
}

// Render the aggregate calibration receipt as compact Markdown.
// Operator proof artifact — no prose.
export function buildAggregateReceiptMarkdown(r: AggregateCalibrationReceipt): string {
  const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;
  const secRounded = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  const af = r.any_flag_recall_ratio;
  const sr = r.strict_recall_ratio;
  const fp = r.good_fp_count;
  const dec = r.decisions_produced_count;
  const rt = r.runtime_ms;
  const pf = r.pass_fail;
  const bar = r.decision_vocab_bar;

  const runFileList =
    r.run_files.length > 0
      ? `${r.run_files[0]} … ${r.run_files[r.run_files.length - 1]}`
      : '(none)';

  const perCatAnyFlagRows = Object.entries(r.per_category_any_flag)
    .map(([cat, entry]) => {
      const st = r.per_category_strict[cat];
      return (
        `| ${cat} | ${pct(entry.median_ratio)} | ${pct(entry.min_ratio)}–${pct(entry.max_ratio)} | ${entry.total} |` +
        (st
          ? ` ${pct(st.median_ratio)} | ${pct(st.min_ratio)}–${pct(st.max_ratio)} |`
          : ' — | — |')
      );
    })
    .join('\n');

  const ALL_DECISIONS = [
    'accepted_for_synthesis',
    'rejected',
    'needs_scope_repair',
    'needs_source_repair',
    'needs_contradiction_mapping',
    'needs_human_review',
  ];
  const dvRows = ALL_DECISIONS.map((d) => {
    const metric = r.decision_vocabulary[d];
    const unreachable = r.unreachable_decisions.includes(d)
      ? ` (unreachable from ${r.fixture})`
      : '';
    if (!metric) return `| ${d} | — | — |${unreachable}`;
    return `| ${d} | ${metric.median.toFixed(1)} | ${metric.min}–${metric.max}${unreachable} |`;
  }).join('\n');

  // Per-run summary table — pulled from run_files labels for clarity
  const perRunRows = r.any_flag_recall_ratio.values
    .map((afr, i) => {
      const fp_i = r.good_fp_count.values[i] ?? '?';
      const sr_i = r.strict_recall_ratio.values[i] ?? '?';
      const dec_i = r.decisions_produced_count.values[i] ?? '?';
      const rt_i = r.runtime_ms.values[i] ?? '?';
      return `| ${i + 1} | ${fp_i}/${r.fixture_good_claims} | ${typeof afr === 'number' ? pct(afr) : '?'} | ${typeof sr_i === 'number' ? pct(sr_i) : '?'} | ${dec_i}/6 | ${typeof rt_i === 'number' ? secRounded(rt_i) : '?'} |`;
    })
    .join('\n');

  const recurringSection =
    r.recurring_bar_failures.length > 0
      ? r.recurring_bar_failures.map((b) => `- ${b}`).join('\n')
      : 'None.';

  const notesSection =
    r.notes.length > 0 ? `\n## Notes\n\n${r.notes.map((n) => `- ${n}`).join('\n')}\n` : '';

  const reviewerOptionsSection = buildReviewerOptionsSection(r.reviewer_options);

  return `# Calibration Receipt — ${r.profile_name} (aggregate, N=${r.runs_count} runs)

- **Model:** ${r.model}
- **Architecture:** ${r.architecture}
- **Status:** ${r.status}
- **Fixture:** ${r.fixture} (${r.fixture_total_claims} claims = ${r.fixture_good_claims} good + ${r.fixture_bad_claims} bad)
- **Aggregated at:** ${r.aggregated_at}
- **Research-OS version:** ${r.research_os_version}
- **Run count:** ${r.runs_count}
- **Run files:** ${runFileList}
${reviewerOptionsSection}
## Headline metrics (median across runs)

- FP: median ${fp.median} / ${r.fixture_good_claims} (range ${fp.min}–${fp.max})
- Any-flag recall: median ${pct(af.median)} (range ${pct(af.min)}–${pct(af.max)})
- Strict recall: median ${pct(sr.median)} (range ${pct(sr.min)}–${pct(sr.max)})
- Decisions produced: median ${dec.median} / 6 (range ${dec.min}–${dec.max})

## PASS / FAIL (aggregate)

| Bar | Rule | Result |
|---|---|---|
| FP ceiling | median=${fp.median}, max=${fp.max} (median ≤1 AND max ≤2) | ${pf.fp_ceiling} |
| Any-flag recall | median=${pct(af.median)} (≥65%) | ${pf.any_flag_recall_floor} |
| Per-category any-flag | median ≥50% per cat (see below) | ${pf.per_category_any_flag_floor} |
| Strict recall | median=${pct(sr.median)} (≥20%) | ${pf.strict_recall_floor} |
| Decision vocab | median=${dec.median} / 6 (${bar.architecture} ≥${bar.required}) | ${pf.decision_vocab_completeness} |
| Latency soft | median=${secRounded(rt.median)} (≤600s, WARN only) | ${pf.latency_soft} |
| Latency hard | max=${secRounded(rt.max)} (every run ≤1200s) | ${pf.latency_hard} |
| Empty/malformed | max=${r.empty_or_malformed_responses.max} (every run =0) | ${pf.empty_or_malformed} |
| **OVERALL** | | **${pf.overall}** |

## Recurring hard-bar failures

${recurringSection}

## Per-category recall (median across runs)

| Category | Any-flag median | Any-flag range | Total | Strict median | Strict range |
|---|---|---|---|---|---|
${perCatAnyFlagRows}

## Decision vocabulary (median count across runs)

| Decision | Median | Range |
|---|---|---|
${dvRows}

## Per-run summary

| Run | FP | Any-flag | Strict | Decisions | Runtime |
|---|---|---|---|---|---|
${perRunRows}
${notesSection}`;
}
