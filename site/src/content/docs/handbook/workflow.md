---
title: The Workflow Chain
description: Step-by-step guide to the research-os workflow chain from init to freeze.
sidebar:
  order: 3
---

The research-os workflow chain is the product. Every step writes append-only artifacts. No step synthesizes, resolves, or creates new truth — those invariants are enforced, not trusted.

## The full chain

```
discover
→ gather
→ claim extract
→ claim triage
→ contradict map
→ contradict resolve (if needed)
→ gate
→ review
→ review-promote
→ index build
→ cowork handoff
→ synth workspace
→ audit
→ freeze
```

## Truth layers

Each step in the chain creates a distinct truth layer. No layer reaches back and modifies a prior layer.

| Layer | What it produces | What it never does |
|-------|-----------------|-------------------|
| Discover | Candidate URL leads | Does not create evidence |
| Gather | Fetch receipts, source cards, excerpt ledgers | Does not extract claims |
| Extract | Candidate claims (review_state=candidate) | Does not promote claims |
| Triage | Triage decisions (append-only ledger) | Does not mutate claims.jsonl |
| Contradict | Contradiction detections (append-only) | Does not resolve or decide |
| Gate | Synthesis eligibility verdict | Does not synthesize or hide failure |
| Review | Adversarial findings and per-claim decisions | Does not mutate claims.jsonl |
| Index | SQLite acceleration layer | Does not create new truth |
| Cowork handoff | Runtime contract for Cowork | Does not create truth |
| Synth workspace | Cross-section map, workspace scaffolding | Does not write synthesis prose |
| Audit | Pack-level rollup verdicts | Does not resolve failures |
| Freeze | Receipt + integrity lock | Does not complete unfinished research |

## The gate as the critical checkpoint

The gate is the dividing line between "research in progress" and "eligible for synthesis."

A section passes the gate when:
1. Source floor met (or waived with reason + compensating controls)
2. Claim integrity: no orphan claims, all source hashes present
3. No unresolved blocking contradictions
4. Accepted-claim floor met: ≥ 3 accepted claims, ≥ 2 distinct sources (non-waivable)
5. No blocking overgeneralization risks

`synthesis_eligible: true` is the actual switch. A `warn` gate verdict with `synthesis_eligible=true` means the section has issues but can still contribute to synthesis.

## Append-only ledgers and closure ledgers

Several steps produce **closure ledgers** — append-only files that record resolution decisions against a base ledger:

| Base ledger | Closure ledger |
|-------------|----------------|
| `contradictions.jsonl` | `contradiction-resolutions.jsonl` |
| `claim-reviews.jsonl` | `claim-synthesis-dispositions.jsonl` |

Every pack-level reader (gate, review, audit, cowork, freeze) reads base + closure with **latest-status-wins** semantics. Diverging effective views produce split-brain truth at pack seams — this is enforced by the integration patterns earned during dogfood.

## Freeze conditions

The freeze is all-or-nothing. It passes only when ALL conditions hold:

1. Pack audit verdict = `ready_for_synthesis`
2. Cowork handoff mode = `synthesis_ready`
3. All 5 synthesis files exist and are non-empty
4. `final-report.md` cites only accepted claim_ids via `[claim:clm_...]` references
5. Unresolved cross-section contradictions disclosed in decision-brief or final-report
6. Every active waiver disclosed by id
7. Every section has a gate result on file
8. All canonical artifacts parse cleanly

On pass: writes `audits/freeze-receipt.json` with sha256 fingerprints of every artifact.
On fail: writes `audits/freeze-refusal.json` with `next_actions[]` — concrete repair instructions.

The freeze receipt is the proof. A pack without a freeze receipt is not done.

## Working with repair mode

If `cowork handoff` returns `repair_required`, the pack has active blockers:

```bash
research-os cowork handoff    # see blocking_reasons
research-os audit             # see which sections are failing and why
```

Common repair paths:
- **Active repair claims** (`needs_scope_repair`, `needs_source_repair`): fix scope/sources, re-run review, re-promote
- **Active unresolved contradictions**: run `contradict resolve` with an appropriate status
- **Gate failures**: run `gate <section>` after fixing the underlying issues — see `next_actions[]` in the gate report
- **Accepted-claim floor failures**: gather more sources, re-extract, re-review until ≥ 3 accepted claims from ≥ 2 sources

:::tip[Recovery]
For partial-failure scenarios across the chain — gather, review cascade, index build, calibration, and freeze refusal — see the [Recovery runbook](/research-os/handbook/recovery/).
:::
