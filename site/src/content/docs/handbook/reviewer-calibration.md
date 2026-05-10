---
title: Reviewer Calibration
description: How to calibrate a reviewer profile against the seeded-v1 fixture, interpret status labels, and enable auto-population of calibration_summary in review-promote.
sidebar:
  order: 7
---

v0.5 makes reviewer trust inspectable. A reviewer profile is not trusted because
it ran; it is trusted because seeded failures prove its recall, false-positive
rate, decision coverage, and limits.

---

## What a calibration receipt is

A calibration receipt is a Zod-validated JSON file (`seeded-v1.json`) plus an
operator-readable Markdown sibling (`seeded-v1.md`). They are written by the
calibration harness and live at:

```
calibration/reviewer-profiles/<profile-name>/seeded-v1.{json,md}
```

The receipt records:

- The model and architecture used
- Per-category recall (any-flag + strict) across 5 failure categories
- PASS/FAIL against 7 hard bars and 1 soft bar
- A four-valued status label (see below)
- Honest disclosure of which decisions the fixture cannot test

---

## Running the calibration harness

From the `research-os` repo root:

```bash
# Quick single-run (local check — backward-compat behavior)
node scripts/reviewer-calibration.mjs --model hermes3:8b --two-pass --profile hermes-two-pass

# Canonical 3-run aggregate (production evidence — use this for admission decisions)
node scripts/reviewer-calibration.mjs --model hermes3:8b --two-pass --profile hermes-two-pass --runs 3

# Single-pass — architectural comparison only
node scripts/reviewer-calibration.mjs --model hermes3:8b --profile hermes-single-pass --mode comparison-only

# Different model, two-pass, 3-run aggregate
node scripts/reviewer-calibration.mjs --model mistral-nemo:12b --two-pass --profile mistral-nemo-two-pass --runs 3
```

When `--runs <n>` is specified (n ≥ 2), the harness:

1. Rebuilds the fixture from scratch on each run (per-run isolation).
2. Writes per-run receipts to `<profile>/runs/run-001.json` … `run-00N.json`.
3. Aggregates across runs using median-based PASS/FAIL bars.
4. Writes the aggregate receipt to `<profile>/seeded-v1.{json,md}`.

When `--runs 1` (or omitted), the harness writes the single-run receipt directly
to `<profile>/seeded-v1.{json,md}` — no `runs/` subdirectory is created.

### When to use single-run vs multi-run

| Mode | When to use |
|---|---|
| `--runs 1` (default) | Quick local check; iterating on a new profile; comparison experiments |
| `--runs 3+` | Canonical admission evidence; any receipt you plan to ship or commit |

**The per-category any-flag floor (≥50% per category) is unreliable at N=1** because
1–2 seeds per category makes a single missed claim determinative. Multi-run median
aggregation absorbs this variance without lowering the bar (F-50 stabilization).

---

## Status labels

| Label | Meaning |
|---|---|
| `trusted_baseline` | Canonical Hermes two-pass + aggregate PASS + median FP = 0 + no recurring bar failures. The reference profile. |
| `conditional_pass` | Aggregate passes all bars but carries explicit caution (FP at ceiling, non-Hermes model, or recurring-failure demotion). |
| `failed` | Any hard aggregate bar fails. Not admitted. |
| `comparison_only` | Explicit `--mode comparison-only`, or single-pass Hermes (auto-assigned). Architectural comparison only — does NOT vouch for production. |

**`trusted_baseline` ≠ `conditional_pass`.** Do not treat them as interchangeable.

**Mistral (`mistral-nemo-two-pass`) is NOT promoted to `trusted_baseline`** regardless
of aggregate outcome. It carries `conditional_pass` as the honest ceiling for a
non-reference model.

### Recurring-failure demotion

An aggregate receipt may carry a `recurring_bar_failures` list. If any hard bar
FAILed in ≥ ⌈N/2⌉ individual runs, that bar appears in this list — even if the
median across all runs happened to pass.

A non-empty `recurring_bar_failures` demotes a Hermes two-pass result from
`trusted_baseline` to `conditional_pass`. The intent: one lucky median cannot mask
a bar that was systematically unreliable across most runs.

Example: 3 runs where `decision_vocab_completeness` FAILed in runs 1 and 2 but
PASSed in run 3 (median = PASS). The recurring-failure check catches this as
2/3 ≥ ⌈3/2⌉ = 2 — the bar goes into `recurring_bar_failures` and the profile is
`conditional_pass`, not `trusted_baseline`.

**When `recurring_bar_failures` is non-empty:** inspect the per-run receipts in
`runs/` to see which runs caused the failures, and whether it is a fixture-scale
sampling issue or a genuine model reliability problem.

---

## Hard bars (all must PASS for overall PASS)

| Bar | Threshold |
|---|---|
| FP ceiling | ≤ 1/5 good claims falsely flagged |
| Any-flag recall | ≥ 65% of bad claims receive any finding |
| Per-category any-flag | Each category with ≥ 2 seeds must have ≥ 50% any-flag recall |
| Strict recall | ≥ 20% of bad claims matched with expected category |
| Decision vocab | ≥ 4/6 (single-pass) or ≥ 3/6 (two-pass) unique decisions produced |
| Latency hard | ≤ 20 min total runtime |
| Empty/malformed | 0 malformed LLM responses |

Latency soft (≤ 10 min) is WARN-only — never blocks overall PASS.

### Architecture-aware decision bar

The two-pass bar is lower (3/6 vs 4/6) because `narrow_critic` severity escalation
collapses the `needs_human_review` path into harder decisions. Two-pass profiles
structurally produce narrower decision vocabularies — the bar reflects that.

---

## Canonical receipts (v0.5.0)

Three receipts ship with v0.5.0 under `calibration/reviewer-profiles/`:

| Profile | Model | Architecture | Status |
|---|---|---|---|
| `hermes-two-pass` | hermes3:8b | two-pass | `failed` (aggregate, 3 runs) — see CHANGELOG |
| `mistral-nemo-two-pass` | mistral-nemo:12b | two-pass | `conditional_pass` (aggregate, 3 runs) |
| `hermes-single-pass` | hermes3:8b | single-pass | `comparison_only` |

The `hermes-single-pass` receipt is `comparison_only` (auto-assigned via `--mode comparison-only`).
It illuminates the marginal contribution of `narrow_critic` vs single-pass architecture.
It does **not** vouch for production use.

---

## Limit: `needs_contradiction_mapping` is unreachable

The `seeded-v1` fixture does not seed `unmapped_contradiction` findings, so
`needs_contradiction_mapping` can never appear in any calibration run output.
Every receipt's `unreachable_decisions` array discloses this honestly.

This means a profile's decision-vocabulary coverage of `needs_contradiction_mapping`
cannot be measured against this fixture. Fixture expansion is deferred to v0.6.

---

## Auto-population in `review-promote`

When `review-promote` is called without explicit `--calibration-*` flags, it
checks for a receipt at `<pack>/calibration/reviewer-profiles/<profile>/seeded-v1.json`
and auto-populates `calibration_summary` in `review-active.json`.

The lookup is **pack-relative** — it uses the `--pack <dir>` argument, not the
terminal's current working directory.

**Canonical vs pack-copy:** the canonical receipts live in the `research-os` repo.
Packs carry their own copy at `<pack>/calibration/...`. To enable auto-population
in a pack, copy the relevant receipt into the pack directory.

**Invalid-receipt fail behavior:** if a receipt is present but fails JSON parse
or Zod schema validation, `review-promote` fails with:

```
research-os: Invalid calibration receipt at <path>: <reason>
```

Do not delete the receipt to silence this — fix the receipt content.
