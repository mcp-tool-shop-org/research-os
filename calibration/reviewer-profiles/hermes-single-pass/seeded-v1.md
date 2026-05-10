# Calibration Receipt — hermes-single-pass

- **Model:** hermes3:8b
- **Architecture:** single-pass
- **Status:** comparison_only
- **Fixture:** seeded-v1 (18 claims = 5 good + 13 bad)
- **Calibrated at:** 2026-05-10T22:44:37.958Z
- **Research-OS version:** 0.4.0
- **Runtime:** 48.0 seconds

## Headline metrics

- FP: 0 / 5
- Any-flag recall: 11 / 13 (85%)
- Strict recall: 4 / 13 (31%)
- Decisions produced: 3 / 6

## PASS / FAIL

| Bar | Result |
|---|---|
| FP ceiling (≤1) | PASS |
| Any-flag recall (≥65%) | PASS |
| Per-category any-flag (≥50%) | PASS |
| Strict recall (≥20%) | PASS |
| Decision vocab (single-pass ≥ 4) | FAIL |
| Latency soft (≤10 min) | PASS |
| Latency hard (≤20 min) | PASS |
| Empty/malformed (=0) | PASS |
| **OVERALL** | **FAIL** |

## Per-category recall

| Category | Any-flag | Strict |
|---|---|---|
| scope_widening | 2/3 (67%) | 1/3 (33%) |
| unsupported_claim | 2/3 (67%) | 0/3 (0%) |
| definition_drift | 2/2 (100%) | 1/2 (50%) |
| temporal_mismatch | 2/2 (100%) | 1/2 (50%) |
| valid_but_low_value | 3/3 (100%) | 1/3 (33%) |

## Decision vocabulary

| Decision | Count |
|---|---:|
| accepted_for_synthesis | 13 |
| rejected | 0 |
| needs_scope_repair | 4 |
| needs_source_repair | 0 |
| needs_contradiction_mapping | 0 (unreachable from seeded-v1) |
| needs_human_review | 1 |

## Notes

- comparison_only: this run is a side-run for architectural comparison, not a production admission candidate
