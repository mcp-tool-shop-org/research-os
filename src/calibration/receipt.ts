import type {
  Architecture,
  CalibrationReceipt,
  DecisionVocabBar,
  PassFail,
  PerCategoryRecall,
  Recall,
  ReviewerOptions,
  StatusLabel,
} from './receipt-schema.js';

// Architecture-aware decision-vocab bar.
// single-pass: narrow_critic pass is absent, so model uses full 6-decision
// vocabulary. Bar: >= 4.
// two-pass: narrow_critic collapses needs_human_review into harder decisions,
// reducing diversity. Bar: >= 3 (F-49 resolution).
export function computeDecisionVocabBar(
  architecture: Architecture,
  decisionsProducedCount: number,
): DecisionVocabBar {
  const required = architecture === 'two-pass' ? 3 : 4;
  return {
    architecture,
    required,
    produced: decisionsProducedCount,
    passed: decisionsProducedCount >= required,
  };
}

// Per-category any-flag floor: seeded categories with total >= 2 must have
// ratio >= 0.50. Categories with fewer than 2 seeds are excluded (not enough
// signal to enforce a floor — e.g. a 1-seed category with 0 misses is fine).
function computePerCategoryFloor(perCategoryAnyFlag: PerCategoryRecall): 'PASS' | 'FAIL' {
  for (const [, recall] of Object.entries(perCategoryAnyFlag)) {
    if (recall.total >= 2 && recall.ratio < 0.5) return 'FAIL';
  }
  return 'PASS';
}

export function computePassFail(input: {
  good_fp_count: number;
  any_flag_recall: Recall;
  per_category_any_flag: PerCategoryRecall;
  strict_recall: Recall;
  decision_vocab_bar: DecisionVocabBar;
  runtime_ms: number;
  empty_or_malformed_responses: number;
}): PassFail {
  const fp_ceiling = input.good_fp_count <= 1 ? 'PASS' : 'FAIL';
  const any_flag_recall_floor = input.any_flag_recall.ratio >= 0.65 ? 'PASS' : 'FAIL';
  const per_category_any_flag_floor = computePerCategoryFloor(input.per_category_any_flag);
  const strict_recall_floor = input.strict_recall.ratio >= 0.2 ? 'PASS' : 'FAIL';
  const decision_vocab_completeness = input.decision_vocab_bar.passed ? 'PASS' : 'FAIL';
  // Latency soft: warn-only, never FAIL
  const latency_soft = input.runtime_ms <= 600_000 ? 'PASS' : 'WARN';
  const latency_hard = input.runtime_ms <= 1_200_000 ? 'PASS' : 'FAIL';
  const empty_or_malformed = input.empty_or_malformed_responses === 0 ? 'PASS' : 'FAIL';

  const hardBars: Array<'PASS' | 'FAIL'> = [
    fp_ceiling,
    any_flag_recall_floor,
    per_category_any_flag_floor,
    strict_recall_floor,
    decision_vocab_completeness,
    latency_hard,
    empty_or_malformed,
  ];
  const overall = hardBars.every((v) => v === 'PASS') ? 'PASS' : 'FAIL';

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

// Status-label assignment (advisor-locked predicates).
//
// Priority order:
//   1. comparison_only — explicit flag OR single-pass Hermes (architectural side-run)
//   2. failed          — any hard bar FAIL
//   3. trusted_baseline — canonical Hermes two-pass with PASS + FP=0
//   4. conditional_pass — everything else that passes bars
//
// trusted_baseline encodes the canonical Hermes two-pass admission: the profile
// is a named Hermes model run in two-pass architecture, all bars pass, and FP=0.
// Hermes family is detected by case-insensitive substring match on profile name.
//
// conditional_pass is the admission status for non-baseline profiles that pass
// all hard bars but carry a caution (FP at ceiling, non-hermes model, etc.).
// mistral-nemo:12b two-pass = conditional_pass (FP=1, passes recalibrated bars).
export function computeStatusLabel(input: {
  profileName: string;
  architecture: Architecture;
  passFail: PassFail;
  goodFpCount: number;
  modeOverride?: 'comparison_only';
}): StatusLabel {
  // comparison_only: explicit operator flag
  if (input.modeOverride === 'comparison_only') return 'comparison_only';

  // comparison_only: single-pass Hermes is an architectural side-run by design
  // (the canonical profile is two-pass; single-pass exists only for comparison)
  if (input.architecture === 'single-pass' && /hermes/i.test(input.profileName)) {
    return 'comparison_only';
  }

  // failed: any hard bar fails (latency_soft is WARN-only, never blocks)
  if (input.passFail.overall === 'FAIL') return 'failed';

  // trusted_baseline: canonical Hermes two-pass profile with perfect FP
  // Predicate: profile name contains "hermes" (case-insensitive) AND
  //            architecture is two-pass AND all bars pass AND FP = 0
  const isHermesTwoPass =
    /hermes/i.test(input.profileName) && input.architecture === 'two-pass';
  if (isHermesTwoPass && input.goodFpCount === 0) return 'trusted_baseline';

  // conditional_pass: passes all bars but carries caution
  // (FP at ceiling, non-baseline profile, or non-hermes model)
  return 'conditional_pass';
}

// Map a receipt to the PromotionCalibrationSummary string shape used by
// review-active.json. Called by the review-promote CLI when auto-populating
// calibration_summary from a persisted receipt.
export function receiptToCalibrationSummary(receipt: CalibrationReceipt): {
  fixture: string | null;
  good_false_positive_rate: string | null;
  bad_any_flag_recall: string | null;
  strict_category_recall: string | null;
  unsupported_claim_recall: string | null;
  notes: string | null;
} {
  const fp = receipt.good_fp_count;
  const fpTotal = receipt.fixture_good_claims;
  const fpPct = fpTotal > 0 ? Math.round((fp / fpTotal) * 100) : 0;

  const af = receipt.any_flag_recall;
  const sr = receipt.strict_recall;
  const unsupported = receipt.per_category_any_flag['unsupported_claim'];

  return {
    fixture: receipt.fixture,
    good_false_positive_rate: `${fp}/${fpTotal} (${fpPct}%)`,
    bad_any_flag_recall: `${af.matched}/${af.total} (${Math.round(af.ratio * 100)}%)`,
    strict_category_recall: `${sr.matched}/${sr.total} (${Math.round(sr.ratio * 100)}%)`,
    unsupported_claim_recall: unsupported
      ? `${unsupported.matched}/${unsupported.total} (${Math.round(unsupported.ratio * 100)}%)`
      : null,
    notes: `status=${receipt.status} model=${receipt.model} arch=${receipt.architecture} overall=${receipt.pass_fail.overall} decisions=${receipt.decisions_produced_count}/6`,
  };
}

// Stable key order for reviewer_options rendering.
// Keys are rendered only when explicitly set (omitted keys stay absent).
const REVIEWER_OPTIONS_KEY_ORDER: (keyof ReviewerOptions)[] = [
  'num_ctx',
  'temperature',
  'seed',
  'top_p',
  'top_k',
  'repeat_penalty',
];

// Render a "Reviewer options" section when reviewer_options is present and non-empty.
// Returns empty string when absent or empty (absence IS the disclosure for stochastic runs).
function buildReviewerOptionsSection(opts: ReviewerOptions | undefined): string {
  if (!opts) return '';
  const lines = REVIEWER_OPTIONS_KEY_ORDER
    .filter((k) => opts[k] !== undefined)
    .map((k) => `- ${k}: ${opts[k]}`);
  if (lines.length === 0) return '';
  return `\n## Reviewer options\n\n${lines.join('\n')}\n`;
}

// Render a compact Markdown receipt. Operator proof artifact — no prose.
export function buildReceiptMarkdown(r: CalibrationReceipt): string {
  const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;
  const runtimeSec = (r.runtime_ms / 1000).toFixed(1);

  const perCatRows = Object.entries(r.per_category_any_flag)
    .map(([cat, af]) => {
      const st = r.per_category_strict[cat] ?? { matched: 0, total: af.total, ratio: 0 };
      return `| ${cat} | ${af.matched}/${af.total} (${pct(af.ratio)}) | ${st.matched}/${st.total} (${pct(st.ratio)}) |`;
    })
    .join('\n');

  const dvRows = [
    'accepted_for_synthesis',
    'rejected',
    'needs_scope_repair',
    'needs_source_repair',
    'needs_contradiction_mapping',
    'needs_human_review',
  ]
    .map((d) => {
      const count = r.decision_vocabulary[d] ?? 0;
      const unreachable = r.unreachable_decisions.includes(d) ? ` (unreachable from ${r.fixture})` : '';
      return `| ${d} | ${count}${unreachable} |`;
    })
    .join('\n');

  const pf = r.pass_fail;
  const bar = r.decision_vocab_bar;

  const notesSection =
    r.notes.length > 0 ? `\n## Notes\n\n${r.notes.map((n) => `- ${n}`).join('\n')}\n` : '';

  const reviewerOptionsSection = buildReviewerOptionsSection(r.reviewer_options);

  return `# Calibration Receipt — ${r.profile_name}

- **Model:** ${r.model}
- **Architecture:** ${r.architecture}
- **Status:** ${r.status}
- **Fixture:** ${r.fixture} (${r.fixture_total_claims} claims = ${r.fixture_good_claims} good + ${r.fixture_bad_claims} bad)
- **Calibrated at:** ${r.calibrated_at}
- **Research-OS version:** ${r.research_os_version}
- **Runtime:** ${runtimeSec} seconds
${reviewerOptionsSection}
## Headline metrics

- FP: ${r.good_fp_count} / ${r.fixture_good_claims}
- Any-flag recall: ${r.any_flag_recall.matched} / ${r.any_flag_recall.total} (${pct(r.any_flag_recall.ratio)})
- Strict recall: ${r.strict_recall.matched} / ${r.strict_recall.total} (${pct(r.strict_recall.ratio)})
- Decisions produced: ${r.decisions_produced_count} / 6

## PASS / FAIL

| Bar | Result |
|---|---|
| FP ceiling (≤1) | ${pf.fp_ceiling} |
| Any-flag recall (≥65%) | ${pf.any_flag_recall_floor} |
| Per-category any-flag (≥50%) | ${pf.per_category_any_flag_floor} |
| Strict recall (≥20%) | ${pf.strict_recall_floor} |
| Decision vocab (${bar.architecture} ≥ ${bar.required}) | ${pf.decision_vocab_completeness} |
| Latency soft (≤10 min) | ${pf.latency_soft} |
| Latency hard (≤20 min) | ${pf.latency_hard} |
| Empty/malformed (=0) | ${pf.empty_or_malformed} |
| **OVERALL** | **${pf.overall}** |

## Per-category recall

| Category | Any-flag | Strict |
|---|---|---|
${perCatRows}

## Decision vocabulary

| Decision | Count |
|---|---:|
${dvRows}
${notesSection}`;
}
