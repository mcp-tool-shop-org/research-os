# Inside a research-pack

You are operating inside a `research-pack` produced by `research-os`. This is **not** a code repository. It is a gated evidence base for long-running research.

## The load-bearing law

> **No synthesis before source truth.**

You may not write claims that are not backed by an entry in the source ledger. You may not invent citations. You may not paraphrase past the evidence. Unresolved contradictions stay unresolved — they are not "smoothed over."

## The lifecycle

```
intake
→ section plan
→ source gather
→ source-card validation
→ claim extraction
→ claim gate
→ contradiction gate
→ section brief
→ adversarial review
→ repo-knowledge index
→ cowork handoff
→ cross-section synthesis
→ freeze
```

Each stage produces structured artifacts. Do not skip stages. Do not collapse stages. Do not write final-report prose before contradictions are mapped.

## Where things live

| Path | What it is |
|------|------------|
| `research.yaml` | Pack-level config: topic, decision, audience, gates, waivers, section list |
| `sections/<id>/` | Per-section workspace (brief, sources, claims, contradictions, gates) |
| `evidence/source-cards/` | One JSON file per source with structured metadata |
| `evidence/citation-ledger.jsonl` | Append-only log of citations referenced anywhere in the pack |
| `evidence/fetch-log.jsonl` | Append-only log of every source-fetch attempt |
| `synthesis/` | Cross-section workspace (only after all sections are gated and reviewed) |
| `audits/` | Output of gate runs and adversarial reviews |
| `prompts/cowork-master.md` | The handoff contract for long-running synthesis |
| `prompts/section-worker.md` | The contract for section-runner agents |
| `prompts/adversarial-reviewer.md` | The contract for the reviewer pass |

## Hard rules inside this pack

- Every claim references a `source_id` from the source ledger.
- Citing a source not in `evidence/source-cards/` is a hard error.
- Contradictions must be recorded in `sections/<id>/contradictions.md`, not flattened.
- Section budgets in `research.yaml` are real. Extension requires concrete evidence (contradicting primary source, missing data, stale source set).
- The `primary_source_waiver` in `research.yaml` is a first-class field, not a workaround. If primary sources are unavailable, set the waiver with explicit `compensating_controls`.

## What "done" looks like

- All sections at `frozen` status.
- Zero orphan claims (`audits/orphan-claims.md` empty or absent).
- Zero stale sources beyond policy (`audits/stale-sources.md` empty or absent).
- Zero unresolved contradictions, OR every unresolved contradiction is documented as deliberately preserved in `synthesis/decision-brief.md`.
- A freeze receipt in `audits/freeze-receipt.json`.

If any of those conditions are not met, the pack is not done — regardless of how good the prose looks.
