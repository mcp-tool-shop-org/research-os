---
title: CLI Reference
description: Complete reference for all research-os commands and flags.
sidebar:
  order: 4
---

## Global options

```
research-os --version    # print version
research-os --help       # list commands
research-os help <cmd>   # help for a specific command
```

## Pack lifecycle commands

### `research-os init <topic>`

Create a new research-pack from a topic statement.

```bash
research-os init "How should X be structured?"
research-os init "..." --name my-pack   # custom directory name
```

Writes: `research.yaml`, pack template files, `CLAUDE.md`.

---

### `research-os section add <id>`

Add a section to the pack. ID must match `NN-slug`.

```bash
research-os section add 01-landscape --purpose "Map the current landscape"
```

---

### `research-os gather <section>`

Fetch sources and extract source cards.

```bash
research-os gather 01-landscape --url https://example.com/paper
research-os gather 01-landscape --urls-file urls.txt
```

Writes: `evidence/fetch-log.jsonl`, `sections/<id>/sources.jsonl`, excerpt ledgers.

---

### `research-os discover`

Propose candidate source URLs for a section. Results are leads, not evidence.

```bash
research-os discover 01-landscape           # propose candidates
research-os discover approve 01-landscape   # approve for gather
research-os discover reject 01-landscape --id <id>
research-os discover export 01-landscape    # write urls.approved.txt
```

---

### `research-os claim extract <section>`

Extract claims from gathered sources.

```bash
research-os claim extract 01-landscape
research-os claim extract 01-landscape --model hermes3:8b   # override model
```

All claims ship at `review_state: candidate`. Extraction never promotes.

---

### `research-os claim triage <section>`

Shape the candidate set before review: dedup, cap per-source density, park low-value.

```bash
research-os claim triage 01-landscape
research-os claim audit-density 01-landscape   # read-only density diagnostic
```

---

### `research-os contradict map <section>`

Detect tensions between candidate claims.

```bash
research-os contradict map 01-landscape
research-os contradict map 01-landscape --triaged-only   # only selected_for_review claims
research-os contradict map 01-landscape --detector heuristic   # bypass LLM (v0.3.0+)
```

`--detector <auto|heuristic|ollama-intern>` (v0.3.0+) chooses the
detector explicitly. Default `auto` preserves env-var-driven behavior;
`heuristic` always works without LLM; `ollama-intern` requires the
configured model and exits visibly if unavailable. Mode is announced
on every run. Full reference: [contradict map](/research-os/handbook/contradict-map/).

---

### `research-os contradict resolve <section>`

Record resolution decisions for detected contradictions.

```bash
research-os contradict resolve 01-landscape --id cnt_abc123 --status resolved --reason "..."
research-os contradict resolve 01-landscape --all --status resolved --reason "..."
```

Statuses: `resolved | preserved | rejected | unresolved`

---

### `research-os gate <section>`

Run the section gate engine.

```bash
research-os gate 01-landscape
```

Exits 0 if synthesis_eligible, exits 2 if not. Writes `audits/<section>-gate.{json,md}`.

Gate families: source_floor, claim_integrity, scope_integrity, freshness, contradiction, section_budget, waivers.

---

### `research-os review <section>`

Run the adversarial reviewer pass.

```bash
research-os review 01-landscape
research-os review 01-landscape --two-pass-llm          # general + narrow_critic passes
research-os review 01-landscape --model hermes3:8b      # model override
research-os review 01-landscape --triaged-only          # only triaged candidates
```

---

### `research-os review-promote <section>`

Promote a calibrated review profile to active state.

```bash
research-os review-promote 01-landscape
```

Until promoted, review runs are calibration evidence, not section truth.

---

### `research-os index`

Build and query the pack-local SQLite index.

```bash
research-os index build --all
research-os index build 01-landscape
research-os query "unresolved contradiction"
```

---

### `research-os cowork handoff`

Render the runtime Cowork contract from research truth.

```bash
research-os cowork handoff
```

Outputs: `handoffs/cowork-handoff.json`, `handoffs/cowork-master.md`.
Modes: `repair_required | synthesis_ready | human_review_required`.

---

### `research-os synth workspace`

Create the synthesis workspace (only when handoff mode = `synthesis_ready`).

```bash
research-os synth workspace
```

Writes: `synthesis/cross-section-map.{json,md}`. Refuses and exits 2 in repair mode.

---

### `research-os audit`

Aggregate pack-level audit rollups across all sections.

```bash
research-os audit
```

Writes 16 rollup files under `audits/`. Verdicts: `ready_for_synthesis | repair_required | human_review_required | blocked`.

---

### `research-os freeze`

Final integrity lock. Refuses unless every condition is met.

```bash
research-os freeze
```

Passes when: audit `ready_for_synthesis`, handoff `synthesis_ready`, all 5 synthesis files exist, final-report cites only accepted claim_ids, all active waivers disclosed, all canonical artifacts parse cleanly.

Writes: `audits/freeze-receipt.{json,md}` on pass. `audits/freeze-refusal.{json,md}` on fail.

---

### `research-os invalidate`

Archive artifacts produced under a superseded contract.

```bash
research-os invalidate extraction 01-landscape
research-os invalidate review 01-landscape
```

---

### `research-os pack publish`

Export a frozen research pack into the canonical `research-packs` archive format.
Derives the admission contract, copies all artifacts, and verifies the result — in one command.

```bash
research-os pack publish \
  --from ./research-os-packs/my-pack \
  --to ./research-packs/packages/my-pack
```

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--to <path>` | yes | — | Target package directory |
| `--from <path>` | no | cwd | Source frozen pack directory |
| `--operator-notes <text>` | no | `""` | Free-text notes written into `pack.manifest.json` |
| `--force` | no | false | `--force` clears and replaces the target package directory. Do not keep hand-authored files inside generated package output. |
| `--dry-run` | no | false | Derive manifest + README, print plan, write nothing |

| Exit code | Meaning |
|-----------|---------|
| 0 | Success — admission-contract PASS |
| 2 | Refused — pack or target failed a pre-condition; nothing written |

Full reference: [pack publish handbook page](/research-os/handbook/pack-publish/).

---

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | User error (bad input, pack not found) |
| 2 | Gate/freeze/synthesis blocked |

## Help topics

```
research-os help <topic>
```

Static topic content keyed by name. Topics: `recovery`, `pack-publish`, `review`, `gather`.
