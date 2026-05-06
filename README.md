# research-os

Local-first research control plane for gated source packs, claim truth, contradiction handling, and long-running AI synthesis.

## What it is

`research-os` is the orchestration layer that turns an open-ended topic into a **research-pack**: a structured local repo that Claude / Cowork / a swarm can work inside for hours without drifting, hallucinating, or flattening the investigation.

It is not a report generator. It is the operating environment for grounded research.

## The load-bearing law

> **No synthesis before source truth.**

The lifecycle:

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

Most "deep research" tools collapse this to *search → summarize → pretty report*. `research-os` refuses to.

## Vocabulary

| Term | Meaning |
|------|---------|
| `research-os` | The control plane / CLI / gates / orchestration law (this repo) |
| `research-pack` | The generated repo artifact for one research effort |
| `research section` | A bounded unit of investigation inside a pack |
| `research receipt` | Proof a section passed source/claim/gate checks |

## Status

v0.1.0 — early development. Workflow chain under active build, dogfooded against a real research topic.

## License

MIT
