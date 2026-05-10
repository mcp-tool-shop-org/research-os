# Calibration Receipt — hermes-two-pass

- **Model:** hermes3:8b
- **Architecture:** two-pass
- **Status:** failed
- **Fixture:** seeded-v1 (18 claims = 5 good + 13 bad)
- **Calibrated at:** 2026-05-10T19:54:16.182Z
- **Research-OS version:** 0.4.0
- **Runtime:** 69.1 seconds

## Headline metrics

- FP: 0 / 5
- Any-flag recall: 10 / 13 (77%)
- Strict recall: 6 / 13 (46%)
- Decisions produced: 2 / 6

## PASS / FAIL

| Bar | Result |
|---|---|
| FP ceiling (≤1) | PASS |
| Any-flag recall (≥65%) | PASS |
| Per-category any-flag (≥50%) | PASS |
| Strict recall (≥20%) | PASS |
| Decision vocab (two-pass ≥ 3) | FAIL |
| Latency soft (≤10 min) | PASS |
| Latency hard (≤20 min) | PASS |
| Empty/malformed (=0) | PASS |
| **OVERALL** | **FAIL** |

## Per-category recall

| Category | Any-flag | Strict |
|---|---|---|
| scope_widening | 2/3 (67%) | 2/3 (67%) |
| unsupported_claim | 2/3 (67%) | 0/3 (0%) |
| definition_drift | 2/2 (100%) | 1/2 (50%) |
| temporal_mismatch | 1/2 (50%) | 0/2 (0%) |
| valid_but_low_value | 3/3 (100%) | 3/3 (100%) |

## Decision vocabulary

| Decision | Count |
|---|---:|
| accepted_for_synthesis | 14 |
| rejected | 0 |
| needs_scope_repair | 4 |
| needs_source_repair | 0 |
| needs_contradiction_mapping | 0 (unreachable from seeded-v1) |
| needs_human_review | 0 |
