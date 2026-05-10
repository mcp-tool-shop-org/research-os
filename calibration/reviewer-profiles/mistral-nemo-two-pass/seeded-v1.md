# Calibration Receipt — mistral-nemo-two-pass (aggregate, N=3 runs)

- **Model:** mistral-nemo:12b
- **Architecture:** two-pass
- **Status:** conditional_pass
- **Fixture:** seeded-v1 (18 claims = 5 good + 13 bad)
- **Aggregated at:** 2026-05-10T22:43:34.529Z
- **Research-OS version:** 0.4.0
- **Run count:** 3
- **Run files:** runs/run-001.json … runs/run-003.json

## Headline metrics (median across runs)

- FP: median 1 / 5 (range 0–2)
- Any-flag recall: median 69% (range 69%–77%)
- Strict recall: median 38% (range 31%–46%)
- Decisions produced: median 4 / 6 (range 4–4)

## PASS / FAIL (aggregate)

| Bar | Rule | Result |
|---|---|---|
| FP ceiling | median=1, max=2 (median ≤1 AND max ≤2) | PASS |
| Any-flag recall | median=69% (≥65%) | PASS |
| Per-category any-flag | median ≥50% per cat (see below) | PASS |
| Strict recall | median=38% (≥20%) | PASS |
| Decision vocab | median=4 / 6 (two-pass ≥3) | PASS |
| Latency soft | median=90.1s (≤600s, WARN only) | PASS |
| Latency hard | max=159.1s (every run ≤1200s) | PASS |
| Empty/malformed | max=0 (every run =0) | PASS |
| **OVERALL** | | **PASS** |

## Recurring hard-bar failures

None.

## Per-category recall (median across runs)

| Category | Any-flag median | Any-flag range | Total | Strict median | Strict range |
|---|---|---|---|---|---|
| scope_widening | 67% | 67%–100% | 3 | 67% | 33%–67% |
| unsupported_claim | 67% | 67%–67% | 3 | 0% | 0%–0% |
| definition_drift | 50% | 50%–50% | 2 | 0% | 0%–50% |
| temporal_mismatch | 100% | 100%–100% | 2 | 100% | 100%–100% |
| valid_but_low_value | 67% | 67%–67% | 3 | 33% | 0%–67% |

## Decision vocabulary (median count across runs)

| Decision | Median | Range |
|---|---|---|
| accepted_for_synthesis | 12.0 | 11–13 |
| rejected | 0.0 | 0–0 |
| needs_scope_repair | 4.0 | 2–4 |
| needs_source_repair | 1.0 | 1–2 |
| needs_contradiction_mapping | 0.0 | 0–0 (unreachable from seeded-v1) |
| needs_human_review | 1.0 | 1–2 |

## Per-run summary

| Run | FP | Any-flag | Strict | Decisions | Runtime |
|---|---|---|---|---|---|
| 1 | 2/5 | 77% | 46% | 4/6 | 159.1s |
| 2 | 0/5 | 69% | 38% | 4/6 | 90.1s |
| 3 | 1/5 | 69% | 31% | 4/6 | 83.6s |

## Notes

- FP at ceiling: median 1 false positive(s) on good claims
- conditional_pass: passes all bars but carries a production caution
