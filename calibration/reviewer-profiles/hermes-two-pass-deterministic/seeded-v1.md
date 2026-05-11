# Calibration Receipt — hermes-two-pass-deterministic (aggregate, N=3 runs)

- **Model:** hermes3:8b
- **Architecture:** two-pass
- **Status:** failed
- **Fixture:** seeded-v1 (18 claims = 5 good + 13 bad)
- **Aggregated at:** 2026-05-11T00:03:36.266Z
- **Research-OS version:** 0.5.0
- **Run count:** 3
- **Run files:** runs/run-001.json … runs/run-003.json

## Reviewer options

- temperature: 0
- seed: 7

## Headline metrics (median across runs)

- FP: median 0 / 5 (range 0–0)
- Any-flag recall: median 77% (range 77%–77%)
- Strict recall: median 46% (range 46%–46%)
- Decisions produced: median 2 / 6 (range 2–2)

## PASS / FAIL (aggregate)

| Bar | Rule | Result |
|---|---|---|
| FP ceiling | median=0, max=0 (median ≤1 AND max ≤2) | PASS |
| Any-flag recall | median=77% (≥65%) | PASS |
| Per-category any-flag | median ≥50% per cat (see below) | FAIL |
| Strict recall | median=46% (≥20%) | PASS |
| Decision vocab | median=2 / 6 (two-pass ≥3) | FAIL |
| Latency soft | median=72.9s (≤600s, WARN only) | PASS |
| Latency hard | max=73.1s (every run ≤1200s) | PASS |
| Empty/malformed | max=0 (every run =0) | PASS |
| **OVERALL** | | **FAIL** |

## Recurring hard-bar failures

- per_category_any_flag_floor
- decision_vocab_completeness

## Per-category recall (median across runs)

| Category | Any-flag median | Any-flag range | Total | Strict median | Strict range |
|---|---|---|---|---|---|
| scope_widening | 33% | 33%–33% | 3 | 33% | 33%–33% |
| unsupported_claim | 67% | 67%–67% | 3 | 0% | 0%–0% |
| definition_drift | 100% | 100%–100% | 2 | 50% | 50%–50% |
| temporal_mismatch | 100% | 100%–100% | 2 | 50% | 50%–50% |
| valid_but_low_value | 100% | 100%–100% | 3 | 100% | 100%–100% |

## Decision vocabulary (median count across runs)

| Decision | Median | Range |
|---|---|---|
| accepted_for_synthesis | 15.0 | 15–15 |
| rejected | 0.0 | 0–0 |
| needs_scope_repair | 3.0 | 3–3 |
| needs_source_repair | 0.0 | 0–0 |
| needs_contradiction_mapping | 0.0 | 0–0 (unreachable from seeded-v1) |
| needs_human_review | 0.0 | 0–0 |

## Per-run summary

| Run | FP | Any-flag | Strict | Decisions | Runtime |
|---|---|---|---|---|---|
| 1 | 0/5 | 77% | 46% | 2/6 | 73.1s |
| 2 | 0/5 | 77% | 46% | 2/6 | 72.6s |
| 3 | 0/5 | 77% | 46% | 2/6 | 72.9s |

## Notes

- Recurring bar failures (>= ceil(N/2) runs): per_category_any_flag_floor, decision_vocab_completeness
