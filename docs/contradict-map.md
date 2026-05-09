# `research-os contradict map` — Detector Selection (v0.3.0)

`contradict map` detects contradiction candidates among a section's candidate
claims. As of **v0.3.0**, the detector is an explicit operator choice via
`--detector <auto|heuristic|ollama-intern>`. The earlier env-var-driven pattern
(unset `OLLAMA_INTERN_MODEL` to "force heuristic") still works in `auto` mode,
but the flag is now the canonical surface and is environment-independent.

This is the chain-blocker fix earned by Experiment 3 Session 1 (XRPL pack):
narrow-topic documentation sections with high token overlap saturate the
ollama-intern detector's Jaccard prefilter and stall the LLM classification
path for 20+ minutes. The flag makes heuristic mode a first-class choice
operators can reach for without reaching into the environment.

---

## CLI surface

```
research-os contradict map <section> [--triaged-only] [--detector <mode>] [--pack <dir>]
```

### Flags

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `<section>` | yes | — | Section id, e.g. `01-token-surface-and-standards` |
| `--triaged-only` | no | `false` | Only consider claims that triage selected_for_review; reduces N² pair classification on dense sections |
| `--detector <mode>` | no | `auto` | Detector to use: `auto`, `heuristic`, `ollama-intern` |
| `--pack <dir>` | no | `cwd` | Path to the pack root |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success — `contradictions.md` written; `contradictions.jsonl` appended only if contradictions found |
| `2` | Refused — invalid `--detector` value, or `ollama-intern` requested with the configured model unavailable |

---

## Detector modes

The three modes are the public contract. `auto` is the default and preserves
v0.2.x behavior; `heuristic` and `ollama-intern` are explicit overrides.

### `auto` (default)

Uses the LLM detector when a configured Ollama model is available; falls
through to the heuristic detector when it is not. Mirrors the pre-v0.3.0
behavior. The mode chosen is announced visibly on every run — there are no
silent shifts.

### `heuristic`

Bypasses Ollama entirely. No model availability check, no LLM calls. Always
works. Always completes quickly (CPU-only token-overlap classification).

Use this for:

- Narrow-topic documentation sections where claims share vocabulary
  (e.g. "workflow," "json," "schema," "install," "node") and the
  ollama-intern detector's Jaccard prefilter passes a large fraction
  of the N×(N−1)/2 pairs for LLM classification — the symptom is a
  20+ minute stall with zero output.
- Any pack run on a rig without the configured Ollama model installed.
- Reproducible CI runs where LLM availability is not guaranteed.

### `ollama-intern`

Requires the configured Ollama model. If the model is unavailable, the
command exits with a visible failure rather than silently falling back. The
operator asked for LLM; the operator gets LLM or a refusal.

Use this when you specifically want LLM classification — typically for
wide-topic sections where claims span genuinely different domains and the
prefilter passes few pairs (so LLM calls complete in reasonable time).

### Invalid value

`--detector <anything else>` exits with code 2 and the standard option
validation error.

---

## Mode announcements

The CLI prints exactly one of these announcement strings as the first
output line of every `contradict map` run. Operators reading their CLI
output can verify which detector ran without spelunking ledgers.

| Mode | Outcome | Announcement |
|------|---------|--------------|
| `--detector heuristic` | always | `contradict map: using heuristic detector` |
| `--detector auto` | LLM chosen | `contradict map: using ollama-intern detector with model <model-name>` |
| `--detector auto` | heuristic fallback | `contradict map: ollama-intern unavailable; using heuristic detector` |
| `--detector ollama-intern` | model available | `contradict map: using ollama-intern detector with model <model-name>` |
| `--detector ollama-intern` | model unavailable | `contradict map: ollama-intern detector requested but model <model-name> is unavailable; aborting (use --detector heuristic to bypass)` (then exit 2) |

---

## Examples

**Heuristic for a narrow-topic section:**

```bash
research-os contradict map 01-token-surface-and-standards \
  --triaged-only \
  --detector heuristic
```

**Force LLM (refuses if model unavailable):**

```bash
research-os contradict map 03-survey \
  --triaged-only \
  --detector ollama-intern
```

**Default — env-var-driven:**

```bash
$env:OLLAMA_INTERN_MODEL = "hermes3:8b"
research-os contradict map 03-survey --triaged-only
```

---

## When to use which mode

The choice is structural, not stylistic.

- **Narrow-topic documentation sections** — `heuristic`. The ollama-intern
  detector's Jaccard prefilter passes a large fraction of pairs when claims
  share vocabulary, and LLM classification at that scale stalls. ComfyUI
  Sections 01–05 and the XRPL Section 01 (`01-token-surface-and-standards`)
  are the canonical anchors for this pattern.
- **Cross-domain sections with naturally divergent vocabulary** — `auto`
  (or `ollama-intern` if you want to fail rather than fall back). The
  prefilter passes fewer pairs because vocabulary overlap is low, so LLM
  calls complete in reasonable time.
- **CI / reproducibility / no-LLM rigs** — `heuristic`.

The operator-playbook in `research-packs` (and its mirror in this repo's
handbook) carries the canonical operator guidance.

---

## Why this exists

`contradict map` was the chain blocker for Experiment 3 Session 1 (XRPL
creator-token durability pack). Prior to v0.3.0, operators on rigs with
the default model installed had no environment-independent way to force
the heuristic detector — clearing `OLLAMA_INTERN_MODEL` worked only when
no default model was present. Once `hermes3:8b` was installed, the
clearing pattern silently stopped working: `auto` would re-acquire the
default and stall on narrow-topic sections.

The `--detector` flag closes that gap. The detector choice is now an
explicit input to the command, not a function of the surrounding shell
environment. The operator-playbook update that ships with v0.3.0
replaces the env-var-clearing workaround with `--detector heuristic` as
the canonical surface.

This is also the v0.3.0 release thesis: a clean public CLI flag is more
trustworthy than a state-dependent workaround. Releasing the flag makes
the operator surface independent of model-installation drift.

---

## What this does NOT do

- It does not change the schema of `contradictions.jsonl` or
  `contradictions.md`. The ledger is the same regardless of detector;
  only the source of truth differs.
- It does not change `contradict resolve` or the closure-ledger flow.
- It does not deprecate `OLLAMA_INTERN_MODEL`. The env var still
  controls which model the LLM detector uses when invoked. The flag
  only changes which detector runs, not the LLM detector's
  configuration.

---

## Related

- [`research-packs/docs/operator-playbook.md`](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md)
  — canonical operator guidance, including detector-selection rules.
- Handbook mirror: `https://mcp-tool-shop-org.github.io/research-os/handbook/operator-playbook/`.
- [`docs/roadmap.md`](roadmap.md) — Experiment 3 progress note.
