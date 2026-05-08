---
title: research-os
description: Local-first research control plane for gated source packs, claim truth, contradiction handling, and long-running AI synthesis.
sidebar:
  order: 0
---

`research-os` turns an open-ended research question into a **research-pack**: a structured local repo where Claude, Cowork, or a swarm can work for hours without hallucinating, drifting, or flattening the investigation.

It is not a report generator. It is the operating environment for grounded research.

## The fundamental problem

Most "deep research" tools collapse to *search → summarize → pretty report*. The model never has to justify a claim to a source. The output sounds confident but can't be audited.

`research-os` refuses to work this way. Every claim must trace to a literal excerpt from a fetched source. Every section must pass a gate before synthesis runs. Contradictions are mapped, not smoothed over. The final freeze writes a sha256-fingerprinted receipt of every artifact.

## The load-bearing law

> **No synthesis before source truth.**

This one law drives everything else. The 16 laws in the [Laws](laws) page are enforcement consequences of this single principle.

## The research-pack

When you run `research-os init`, you get a `research-pack` — a directory with:

- `research.yaml` — pack config: topic, decision, audience, gate thresholds, source waiver policy, section list
- `sections/<id>/` — per-section workspaces: brief, sources, claims, contradictions, gates
- `evidence/` — fetch receipts, source cards, excerpt ledgers
- `synthesis/` — cross-section map, decision brief, working report, final report
- `audits/` — gate results, review findings, pack rollup
- `handoffs/` — cowork handoff contract and master prompt
- `audits/freeze-receipt.json` — proof the chain held end-to-end

## What makes it different

| Feature | research-os |
|---------|-------------|
| Source grounding | Every claim cites a literal excerpt ID from the excerpt ledger — model cannot author evidence text |
| Contradiction tracking | Detected, mapped, resolution-ledgered — never flattened |
| Gate enforcement | Section must be `synthesis_eligible` before downstream synthesis runs |
| Freeze integrity | sha256 fingerprint of every canonical artifact — unfinished research cannot masquerade as done |
| Dogfood proof | v0.1 was gated through its own pack before shipping |
