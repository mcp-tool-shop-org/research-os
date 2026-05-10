# Calibration Receipt — mistral-nemo-two-pass

- **Model:** mistral-nemo:12b
- **Architecture:** two-pass
- **Status:** failed
- **Fixture:** seeded-v1 (18 claims = 5 good + 13 bad)
- **Calibrated at:** 2026-05-10T19:59:32.796Z
- **Research-OS version:** 0.4.0
- **Runtime:** 103.2 seconds

## Headline metrics

- FP: 2 / 5
- Any-flag recall: 9 / 13 (69%)
- Strict recall: 6 / 13 (46%)
- Decisions produced: 5 / 6

## PASS / FAIL

| Bar | Result |
|---|---|
| FP ceiling (≤1) | FAIL |
| Any-flag recall (≥65%) | PASS |
| Per-category any-flag (≥50%) | FAIL |
| Strict recall (≥20%) | PASS |
| Decision vocab (two-pass ≥ 3) | PASS |
| Latency soft (≤10 min) | PASS |
| Latency hard (≤20 min) | PASS |
| Empty/malformed (=0) | PASS |
| **OVERALL** | **FAIL** |

## Per-category recall

| Category | Any-flag | Strict |
|---|---|---|
| scope_widening | 2/3 (67%) | 1/3 (33%) |
| unsupported_claim | 2/3 (67%) | 0/3 (0%) |
| definition_drift | 2/2 (100%) | 2/2 (100%) |
| temporal_mismatch | 2/2 (100%) | 2/2 (100%) |
| valid_but_low_value | 1/3 (33%) | 1/3 (33%) |

## Decision vocabulary

| Decision | Count |
|---|---:|
| accepted_for_synthesis | 11 |
| rejected | 1 |
| needs_scope_repair | 3 |
| needs_source_repair | 2 |
| needs_contradiction_mapping | 0 (unreachable from seeded-v1) |
| needs_human_review | 1 |

## Notes

- 2 false positive(s) on good claims — see per-seed output for details
