# Calibration Receipt — hermes-two-pass (aggregate, N=3 runs)

- **Model:** hermes3:8b
- **Architecture:** two-pass
- **Status:** failed
- **Fixture:** seeded-v1 (18 claims = 5 good + 13 bad)
- **Aggregated at:** 2026-05-10T22:37:42.174Z
- **Research-OS version:** 0.4.0
- **Run count:** 3
- **Run files:** runs/run-001.json … runs/run-003.json

## Headline metrics (median across runs)

- FP: median 0 / 5 (range 0–0)
- Any-flag recall: median 62% (range 46%–85%)
- Strict recall: median 38% (range 15%–38%)
- Decisions produced: median 2 / 6 (range 2–3)

## PASS / FAIL (aggregate)

| Bar | Rule | Result |
|---|---|---|
| FP ceiling | median=0, max=0 (median ≤1 AND max ≤2) | PASS |
| Any-flag recall | median=62% (≥65%) | FAIL |
| Per-category any-flag | median ≥50% per cat (see below) | FAIL |
| Strict recall | median=38% (≥20%) | PASS |
| Decision vocab | median=2 / 6 (two-pass ≥3) | FAIL |
| Latency soft | median=69.4s (≤600s, WARN only) | PASS |
| Latency hard | max=112.0s (every run ≤1200s) | PASS |
| Empty/malformed | max=0 (every run =0) | PASS |
| **OVERALL** | | **FAIL** |

## Recurring hard-bar failures

- any_flag_recall_floor
- per_category_any_flag_floor
- decision_vocab_completeness

## Per-category recall (median across runs)

| Category | Any-flag median | Any-flag range | Total | Strict median | Strict range |
|---|---|---|---|---|---|
| scope_widening | 33% | 33%–100% | 3 | 33% | 33%–67% |
| unsupported_claim | 67% | 67%–100% | 3 | 0% | 0%–0% |
| definition_drift | 50% | 50%–100% | 2 | 0% | 0%–0% |
| temporal_mismatch | 50% | 50%–50% | 2 | 50% | 50%–50% |
| valid_but_low_value | 100% | 0%–100% | 3 | 67% | 0%–100% |

## Decision vocabulary (median count across runs)

| Decision | Median | Range |
|---|---|---|
| accepted_for_synthesis | 15.0 | 11–15 |
| rejected | 0.0 | 0–0 |
| needs_scope_repair | 3.0 | 3–5 |
| needs_source_repair | 0.0 | 0–0 |
| needs_contradiction_mapping | 0.0 | 0–0 (unreachable from seeded-v1) |
| needs_human_review | 0.0 | 0–2 |

## Per-run summary

| Run | FP | Any-flag | Strict | Decisions | Runtime |
|---|---|---|---|---|---|
| 1 | 0/5 | 85% | 38% | 3/6 | 112.0s |
| 2 | 0/5 | 62% | 38% | 2/6 | 46.2s |
| 3 | 0/5 | 46% | 15% | 2/6 | 69.4s |

## Notes

- Recurring bar failures (>= ceil(N/2) runs): any_flag_recall_floor, per_category_any_flag_floor, decision_vocab_completeness
