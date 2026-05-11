---
title: contradict map
description: Detect contradiction candidates among a section's claims, with an explicit choice between heuristic and LLM detectors.
sidebar:
  order: 11
---

`research-os contradict map` detects contradiction candidates among a section's
candidate claims. As of **v0.3.0**, the detector is an explicit operator
choice via `--detector <auto|heuristic|ollama-intern>`. The earlier
env-var-driven pattern still works in `auto` mode, but the flag is now the
canonical surface and is environment-independent.

---

## Quick use

Narrow-topic documentation section — heuristic, fast, no LLM:

```bash
research-os contradict map 01-token-surface-and-standards \
  --triaged-only \
  --detector heuristic
```

Default (env-var-driven) — LLM if `OLLAMA_INTERN_MODEL` is set and the model
is available, otherwise heuristic fallback:

```bash
research-os contradict map 03-survey --triaged-only
```

Force LLM (refuses if model unavailable):

```bash
research-os contradict map 03-survey \
  --triaged-only \
  --detector ollama-intern
```

---

## Flags

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `<section>` | yes | — | Section id, e.g. `01-token-surface-and-standards` |
| `--triaged-only` | no | `false` | Only consider claims that triage selected_for_review |
| `--detector <mode>` | no | `auto` | `auto`, `heuristic`, or `ollama-intern` |
| `--pack <dir>` | no | `cwd` | Path to the pack root |

Exit 0 on success. Exit 2 on invalid `--detector` value or on
`--detector ollama-intern` when the configured model is unavailable.

---

## Detector modes

### `auto` (default)

Uses the LLM detector when a configured Ollama model is available; falls
through to the heuristic detector when it is not. Mirrors pre-v0.3.0
behavior. The mode chosen is **announced visibly on every run** — there
are no silent shifts.

### `heuristic`

Bypasses Ollama entirely. No model availability check, no LLM calls.
Always works. Always completes quickly (CPU-only token-overlap
classification). Use this for narrow-topic documentation sections (the
ollama-intern detector's Jaccard prefilter saturates when claims share
vocabulary, stalling the LLM path for 20+ minutes), for any rig without
the configured model installed, and for reproducible CI runs.

### `ollama-intern`

Requires the configured Ollama model. If the model is unavailable, the
command exits with a visible failure rather than silently falling back.
The operator asked for LLM; the operator gets LLM or a refusal.

---

## Mode announcements

The CLI prints exactly one of these strings as the first line of every run.
Operators can verify which detector ran without spelunking ledgers.

| Mode | Outcome | Announcement |
|------|---------|--------------|
| `--detector heuristic` | always | `contradict map: using heuristic detector` |
| `--detector auto` | LLM chosen | `contradict map: using ollama-intern detector with model <model>` |
| `--detector auto` | heuristic fallback | `contradict map: ollama-intern unavailable; using heuristic detector` |
| `--detector ollama-intern` | model available | `contradict map: using ollama-intern detector with model <model>` |
| `--detector ollama-intern` | model unavailable | `contradict map: ollama-intern detector requested but model <model> is unavailable; aborting (use --detector heuristic to bypass)` |

---

## When to use which mode

The choice is structural, not stylistic.

- **Narrow-topic documentation sections** — `heuristic`. Claims share
  vocabulary ("workflow," "json," "schema," "install," "node"); the
  prefilter passes a large fraction of pairs and LLM classification stalls.
  ComfyUI Sections 01–05 and the XRPL Section 01 are the canonical anchors.
- **Cross-domain sections with naturally divergent vocabulary** — `auto`
  or `ollama-intern`. Lower vocabulary overlap means fewer pairs reach the
  LLM and classification completes in reasonable time.
- **CI / reproducibility / no-LLM rigs** — `heuristic`.

The full operator-selection rule lives in the
[Operator Playbook](/research-os/handbook/operator-playbook/) under
"Contradiction detection."

---

## Why this exists

`contradict map` was the chain blocker for Experiment 3 Session 1 (XRPL
creator-token durability pack). Prior to v0.3.0, there was no
environment-independent way to force the heuristic detector — clearing
`OLLAMA_INTERN_MODEL` worked only when no default model was installed.
Once `hermes3:8b` was installed, the clearing pattern silently stopped
working: `auto` would re-acquire the default and stall on narrow-topic
sections.

The `--detector` flag closes that gap. The detector choice is now an
explicit input to the command, not a function of the surrounding shell.

---

## What this does NOT do

- Does not change the schema of `contradictions.jsonl` or
  `contradictions.md`.
- Does not change `contradict resolve` or the closure-ledger flow.
- Does not deprecate `OLLAMA_INTERN_MODEL`. The env var still controls
  which model the LLM detector uses; the flag only chooses which
  detector runs.

---

## Related

- [`docs/contradict-map.md`](https://github.com/mcp-tool-shop-org/research-os/blob/master/docs/contradict-map.md)
  — full reference in the repo.
- [Operator Playbook](/research-os/handbook/operator-playbook/) — canonical
  operator guidance.
- [`research-packs/docs/operator-playbook.md`](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md)
  — canonical operator playbook in the archive monorepo.

:::tip[Recovery]
For partial-failure scenarios — including LLM-unavailable refusal modes — see the [Recovery runbook](/research-os/handbook/recovery/).
:::
