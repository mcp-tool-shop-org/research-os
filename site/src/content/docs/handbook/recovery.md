---
title: Recovery Runbook
description: Partial-failure recovery for review, gather, pack publish, index build, calibration, and freeze.
sidebar:
  order: 5
---

The long-running commands write to append-only ledgers and surface structured
errors when a seam fails. This page is the partial-failure runbook: which
seam failed, how to read what was written, and how to recover without
re-running the whole chain.

Each section is shaped:

- **Symptom** — what you see at the terminal or in artifacts.
- **Cause** — which seam failed, and what is durable.
- **Recover** — the command(s) to make forward progress.

---

## Review — cascade failure mid-section

**Symptom.** `research-os review <section>` exits with
`ReviewerCascadeFailedError` (code `REVIEWER_CASCADE_FAILED`,
`retryable: true`). The stderr line names each failed reviewer:
`Multi-pass review: every reviewer failed. <reviewer-name>: <reason> | ...`.

**Cause.** Every configured reviewer in the cascade failed on the same window
(e.g., Ollama daemon down, model not pulled, or transient timeout). Previously
written `review.json` records are append-only and durable; the failure is at
the current window boundary, not retroactive.

**Recover.**

```bash
# 1. Confirm the reviewer backend is live.
curl http://localhost:11434/api/version
ollama list   # confirm the configured model is present

# 2. Re-run the same command. Append-only records survive.
research-os review <section> --triaged-only --preset hermes-two-pass --profile hermes-two-pass
```

If the cascade names a specific reviewer (e.g., `ollama-intern`), inspect
that reviewer's reason field. The hint on `ReviewerCascadeFailedError` lists
the failed reviewers so you can target the root cause.

---

## Gather — one URL fails inside a multi-URL run

**Symptom.** `research-os gather <section>` reports `fetchedFailed > 0` in
its summary, or the run exits cleanly but the source-card directory is missing
entries for some URLs.

**Cause.** Stage B B-A-001 made gather partial-write-resilient. A
`fetchOnce` throw mid-loop now: (1) writes a synthetic failure receipt for
the failing URL, (2) flushes the accumulated source-id batch immediately so
prior successes become durable, and (3) continues with the next URL. The
batch flush no longer drops in-flight source-ids on mid-loop failure.

**Recover.** Inspect `evidence/fetch-log.jsonl` to find which URLs failed.
v0.10.0+ stamps a 5-value rollup status on every receipt (`gather_outcome`):

```bash
# Find URLs with non-ok rollup outcomes (v0.10.0+)
grep -E '"gather_outcome":"(fetch_failed|extraction_skipped|extraction_failed|bot_check_detected)"' \
  <pack>/evidence/fetch-log.jsonl

# Older packs (pre-v0.10): the more granular fetch_outcome / extraction state
grep -E '"fetch_outcome":"(network_error|http_error|too_large)"' \
  <pack>/evidence/fetch-log.jsonl
```

The 5-value `gather_outcome` enum: `ok` (fetched + text extracted),
`fetch_failed` (HTTP error, timeout, network failure, SSRF refusal),
`extraction_skipped` (fetched but extractor not applicable — PDF, binary),
`extraction_failed` (fetched but extractor errored mid-extraction),
`bot_check_detected` (fetched but R-003 marker+body-words signal fired).
Precedence (highest to lowest):
`fetch_failed > bot_check_detected > extraction_failed > extraction_skipped > ok`.

A `bot_check_detected` rollup at gather is informational; the source-card
audit's R-003 severity is authoritative for quarantine (see the
[source-card audit handbook page](/research-os/handbook/source-card-audit/)).
An `extraction_skipped` rollup is not a failure — PDF and binary content
types reach this state without an error. The progress line surfaces the
content type so the operator can distinguish at a glance:

```
· extraction_skipped (content_type=application/pdf; extractor not applicable) — receipt recorded for <url>
! fetch_failed (http_error HTTP 404) — receipt recorded for <url>
! bot_check_detected (marker:incapsula, body_words=5) — receipt recorded for <url>
```

Bullet prefix (`·`) is informational; exclamation prefix (`!`) is the operator
may want to address.

Then re-run gather with the failed URLs only — the same URL produces the
same source-id deterministically, so the existing source-card directory is
not duplicated:

```bash
research-os gather <section> --url <failed-url> --url <other-failed-url>
```

---

## Pack publish — verify-fail after write

**Symptom.** `research-os pack publish --to <path>` exits 2 with a
verify-pack-style error after writing to the target. The error mentions
`hash mismatch`, `freeze-receipt`, `final-report`, or a specific corrupted
artifact.

**Cause.** The post-write verification pass re-hashes the canonical artifacts
in the target and refuses if anything doesn't reproduce. This catches a
corrupted copy, a manifest that doesn't match the receipt sha256, or an
orphan-artifact violation. The target is left as-is so you can inspect.

**Recover.** Inspect the named file in the target. If the source pack is
clean (re-run `verify-pack.mjs` against it), publish with `--force` to
clear-and-replace:

```bash
# Verify the source pack first
node research-packs/scripts/verify-pack.mjs <source-pack>

# Re-publish with --force
research-os pack publish \
  --from <source-pack> \
  --to <target> \
  --force
```

:::caution[Destructive: `--force`]
`--force` clears and replaces the target package directory. Do not keep hand-authored files inside generated package output.
:::

Edit upstream artifacts (claims, sources, synthesis) or sibling files instead.
See [pack publish](/research-os/handbook/pack-publish/) for the full
admission contract.

---

## Index build — malformed JSONL or source-card file

**Symptom.** `research-os index build` completes but stderr shows structured
warnings: `malformed_jsonl` (path, 1-based line number, reason),
`malformed_source_card` (path, reason), or `section_index_failed` (section
id, reason).

**Cause.** Stage B B-A-002 made the indexer per-record-resilient. One
malformed JSONL tail line or one bad `evidence/source-cards/*.json` no
longer crashes the entire build. `tryReadJsonl` is wrapped per-line,
`readSourceCards` is wrapped per-file, and `indexSection` is wrapped per-
section. Healthy records still index.

**Recover.** Locate the named file + line, fix or truncate, then rebuild:

```bash
# Find malformed tail line (warnings include 1-based line number)
sed -n '<N>p' <pack>/<reported-path>

# Truncate trailing malformed line if it is the last line
head -n <N-1> <pack>/<reported-path> > <pack>/<reported-path>.fixed
mv <pack>/<reported-path>.fixed <pack>/<reported-path>

# Rebuild — idempotent
rm .research-os/index.sqlite   # only required on SCHEMA_VERSION bump (see known-limitations)
research-os index build --all
```

---

## Calibration — one run of `--runs N` fails

**Symptom.** `node scripts/reviewer-calibration.mjs --runs 3 ...` writes
per-run receipts to `<profile>/runs/run-NNN.json` but exits before the
aggregate receipt is produced, or the aggregate disagrees with one specific
run.

**Cause.** Each run is independent and writes its receipt before moving to
the next. The aggregate `seeded-v1.{json,md}` is written only after all
runs complete; partial-progress runs are durable on disk. Recurring-failure
detection in the aggregate (median-based PASS/FAIL bars) intentionally
demotes profiles that fail a majority of runs.

**Recover.** Inspect the per-run receipts to find the failing run, then
either re-run only the failing run (advanced) or re-run the whole `--runs N`
batch (canonical):

```bash
# Inspect per-run receipts
ls calibration/reviewer-profiles/<profile>/runs/

# Re-run the full batch — receipts overwrite the prior run-NNN.json
node scripts/reviewer-calibration.mjs \
  --model hermes3:8b --two-pass --runs 3 \
  --profile <profile>
```

A `failed` aggregate verdict is information, not an error — research-os
refuses to trust a reviewer profile when repeated seeded failures do not
support trust (Law 13). The `hermes-two-pass-deterministic=failed` canonical
receipt is the mechanism working, not a bug.

---

## Freeze — refusal with stable `reason_code`

**Symptom.** `research-os freeze` exits 2 and writes
`audits/freeze-refusal.{json,md}` (instead of `freeze-receipt.{json,md}`).
The refusal carries `reasons[]` prose and a `reason_records[]` array with
stable codes (Stage B B-C-003).

**Cause.** Freeze is the final integrity lock (Law 15). It refuses unless
every condition is met: audit `ready_for_synthesis`, handoff
`synthesis_ready`, all five synthesis files exist, final-report cites only
accepted claim_ids, all active waivers disclosed, all canonical artifacts
parse cleanly.

**Recover.** Read the `reason_records[]` array — each record has a stable
`reason_code` and a `reason_message`. The CLI surfaces a generated
`next_actions` list keyed off the codes (no substring matching). Common
recovery paths:

| `reason_code` | Recovery |
|---|---|
| `FREEZE_PACK_AUDIT_NOT_READY` | Re-run `research-os audit`; address blockers it surfaces |
| `FREEZE_HANDOFF_NOT_READY` | Re-run `research-os cowork handoff` after audit clears |
| `FREEZE_FINAL_REPORT_NO_CITATIONS` | Add citations to `synthesis/final-report.md` |
| `FREEZE_UNKNOWN_CLAIM_CITED` | Remove or correct the cited claim id |
| `FREEZE_UNACCEPTED_CITED` | Cite only claims accepted by review (Law 7) |
| `FREEZE_REPAIR_CLAIM_CITED` | Re-review or remove citation to the repair-state claim |
| `FREEZE_UNRESOLVED_CONTRADICTION_UNDISCLOSED` | Resolve via `contradict resolve` or disclose in synthesis |
| `FREEZE_WAIVER_UNDISCLOSED` | Disclose active waivers in `synthesis/decision-brief.md` |
| `FREEZE_MISSING_GATE` | Run `research-os gate <section>` for each section |
| `FREEZE_MISSING_REQUIRED_ARTIFACT` | Re-run the upstream command that produces the missing artifact |
| `FREEZE_MISSING_SYNTHESIS_ARTIFACT` | Run `research-os synth workspace` (requires handoff `synthesis_ready`) |
| `FREEZE_MALFORMED_ARTIFACT` | Repair the named artifact and re-run freeze |

After recovery, re-run `research-os freeze`. The refusal artifact is
overwritten by the next run; the receipt artifact is written only on PASS.

---

## Related pages

- [CLI Reference](/research-os/handbook/reference/) — full command surface.
- [Known limitations](/research-os/handbook/known-limitations/) — v1.0 disclosed gaps.
- [pack publish](/research-os/handbook/pack-publish/) — admission contract + refusal cases.
- [Reviewer calibration](/research-os/handbook/reviewer-calibration/) — multi-run receipts, status labels.
- [Workflow chain](/research-os/handbook/workflow/) — the 16-step chain from discover to freeze.
