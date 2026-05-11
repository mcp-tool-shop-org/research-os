---
title: Getting Started
description: Install research-os and run your first research-pack from init to freeze.
sidebar:
  order: 1
---

## Requirements

- **Node.js ≥ 20**
- **[Ollama](https://ollama.com/)** running locally — required for LLM extraction, triage, review, and discovery. Pull `hermes3:8b` as the default model.

## Install

```bash
npm install -g @mcptoolshop/research-os
```

Confirm with:

```bash
research-os --version
# 0.6.0
```

### From source (contributor option)

```bash
git clone https://github.com/mcp-tool-shop-org/research-os.git
cd research-os
npm install
npm run build
npm link   # makes `research-os` available on your PATH
```

## Environment

```bash
# Ollama host (default: localhost:11434)
export OLLAMA_HOST=localhost:11434

# Model override (default: hermes3:8b)
export OLLAMA_INTERN_MODEL=hermes3:8b
```

## Your first research-pack

### 1. Init

```bash
research-os init "How should X be structured for Y purpose?"
cd research-os-packs/my-pack   # or wherever the pack was created
```

### 2. Add sections

```bash
research-os section add 01-landscape --purpose "Map the current landscape"
research-os section add 02-architecture --purpose "Understand structural options"
```

Section IDs must match `NN-slug` format (e.g. `01-landscape`, `02-arch`).

### 3. Gather sources

```bash
# Gather specific sources you already know
research-os gather 01-landscape --url https://example.com/relevant-paper

# Or auto-discover candidates (leads only — not evidence until gathered)
research-os discover 01-landscape
research-os discover approve 01-landscape
research-os gather 01-landscape --urls-file sections/01-landscape/urls.approved.txt
```

### 4. Extract and triage claims

```bash
research-os claim extract 01-landscape      # extract claims from gathered sources
research-os claim triage 01-landscape       # deduplicate, cap per-source density
research-os claim audit-density 01-landscape  # optional: see extraction density stats
```

### 5. Map contradictions and gate

```bash
research-os contradict map 01-landscape     # detect tensions between claims
research-os gate 01-landscape               # verdict: pass/warn/fail + synthesis_eligible
```

The gate is the real switch — only `synthesis_eligible=true` sections can proceed.

### 6. Review

```bash
research-os review 01-landscape --two-pass-llm   # general + narrow_critic adversarial review
research-os review-promote 01-landscape           # promote calibrated profile to active state
```

### 7. Resolve contradictions (if any)

```bash
# Resolve a specific contradiction
research-os contradict resolve 01-landscape --id cnt_abc123 --status resolved --reason "..."

# Resolve all at once
research-os contradict resolve 01-landscape --all --status resolved --reason "..."
```

### 8. Build the pack-level view

```bash
research-os index build --all      # build SQLite index for querying
research-os cowork handoff         # render the cowork contract (repair_required or synthesis_ready)
research-os audit                  # aggregate pack-level rollups
```

### 9. Synthesis workspace

Only runs when `cowork handoff` reports `synthesis_ready`:

```bash
research-os synth workspace        # creates synthesis/cross-section-map.{json,md}
```

Then Cowork (or you) writes `synthesis/decision-brief.md`, `synthesis/working-report.md`, `synthesis/final-report.md`.

### 10. Freeze

```bash
research-os freeze
# → writes audits/freeze-receipt.json on success
# → writes audits/freeze-refusal.json with next_actions on failure
```

The freeze receipt fingerprints every canonical and synthesis artifact. If it passes, the research is locked and traceable. If it refuses, you get concrete repair instructions.

:::tip[Recovery]
For partial-failure scenarios — including freeze refusal recovery, gather failures, and review cascade — see the [Recovery runbook](/research-os/handbook/recovery/).
:::
