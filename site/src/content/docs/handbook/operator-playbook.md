---
title: Operator Playbook
description: Operating doctrine for running research packs to freeze — source format preferences, discovery fallbacks, contradiction-detector selection, and model-env discipline.
sidebar:
  order: 5
---

This page mirrors the canonical external-domain operator playbook, earned by running v1 Experiment 1 (ComfyUI workflow durability) across 11 sessions and 8 sections to freeze.

**Canonical source:** [`research-packs/docs/operator-playbook.md`](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md) — update there first; this page mirrors the key rules.

---

## Source format preferences

### Avoid GitHub UI HTML

GitHub release pages, issue list pages, and wiki pages fetch at HTTP 200 but deliver JavaScript-rendered chrome. Use instead:

- `raw.githubusercontent.com/<owner>/<repo>/master/<file>` — raw file content
- `api.github.com/repos/<owner>/<repo>/releases?per_page=20` — JSON release metadata
- `api.github.com/search/issues?q=repo:<Owner>/<Repo>+keyword&per_page=20` — keyword-filtered issues (see below)
- `docs.<project>.org/` — server-rendered documentation pages

### `/issues?q=` silently ignores the `q=` parameter

The GitHub Issues endpoint drops the `q=` keyword filter silently. Use the search API:

```
api.github.com/search/issues?q=repo:Owner/Repo+keyword1+keyword2&per_page=20
```

The search endpoint returns `{total_count, items}`, not a plain array.

### `llms.txt` aggregate sources produce expected source_dominance

Projects that publish `llms.txt` bundle their full documentation as one file. Expect 50%+ of extracted claims from a single URL; the triage `parked_overdense_source` cap handles this correctly.

---

## Discovery

### Operator-staged URLs over LLM discovery for code-repository topics

LLM-based discovery has high hallucination rates for code-repository topics. The reliable path:

1. Verify URLs manually against canonical project documentation before gather.
2. Stage them in `urls.operator-staged.txt` in the section directory.
3. Bypass `research-os discover run` for this class of topic.

---

## Contradiction detection

### Heuristic detector is the standard for narrow-topic documentation sections

On narrow-topic sections (all claims share vocabulary like "workflow," "json," "schema"), the ollama-intern detector stalls after 5+ minutes with zero output. Force the heuristic detector:

```powershell
# PowerShell
Remove-Item Env:OLLAMA_INTERN_MODEL -ErrorAction SilentlyContinue
research-os contradict map <section> --triaged-only
```

The heuristic detector completes in seconds and correctly finds zero contradictions on orthogonal claim sets.

---

## Model environment discipline

Set `OLLAMA_INTERN_MODEL` explicitly via PowerShell before every LLM-dependent command:

```powershell
$env:OLLAMA_INTERN_MODEL = "hermes3:8b"
research-os claim extract <section>
research-os review <section> --triaged-only --preset hermes-two-pass --profile hermes-two-pass
```

**Why PowerShell, not Bash env-prefix:** On Windows, `VAR=value command` fails due to shell dispatch. Set via `$env:` assignment instead.

---

## Publisher-null interpretation

`publisher: null` is non-deterministic — not a quality signal. The same domain returns populated and null publisher fields across sessions with no stable pattern. Set `min_independent_publishers: 0` in pack gate config when publisher extraction is unreliable.

---

## Community-distribution tier

Public community galleries (OpenArt, CivitAI, Comfy Workflows) are JavaScript-rendered single-page applications or payment-walled. The research-os fetch layer has no JavaScript execution context. Use GitHub Search API issues to capture user-reported evidence about community distribution behavior instead.

---

## Session junk claims

If session 1 gathered bad sources (GitHub UI HTML), their claims remain in `claims.jsonl` and contaminate the contradiction pool. Consider `research-os invalidate <section> --source <bad_source_id>` before running `contradict map`, or use the sampling protocol to bulk-classify junk×quality false positives.
