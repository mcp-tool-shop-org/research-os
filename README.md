# research-os

Local-first research control plane for gated source packs, claim truth, contradiction handling, and long-running AI synthesis.

## What it is

`research-os` is the orchestration layer that turns an open-ended topic into a **research-pack**: a structured local repo that Claude / Cowork / a swarm can work inside for hours without drifting, hallucinating, or flattening the investigation.

It is not a report generator. It is the operating environment for grounded research.

## The load-bearing laws

> **1. No synthesis before source truth.**
>
> **2. Fetch is evidence; extraction is interpretation.**
>
> **3. Models may interpret source spans; they may not author evidence spans.**

Law #3 means: when a claim cites source text, the LLM never authors that text. research-os builds a deterministic excerpt ledger from each source (paragraph + sentence chunking, stable IDs like `ex_<source_id_hex>_001`), the LLM picks excerpt IDs from that ledger, and research-os copies the literal text into the claim's `evidence_excerpt`. This eliminates the entire "paraphrase-as-quote" failure class — the model can't author quotes it can't actually source.

The umbrella term "hallucination" is replaced by six precise rejection categories — three at extraction time (mechanical) and three at review time (interpretive):

| When | Category | Meaning |
|------|----------|---------|
| extract | `excerpt_id_missing` | LLM picked an excerpt ID that isn't in the ledger |
| extract | `excerpt_id_malformed` | LLM returned a string that isn't a valid excerpt ID |
| extract | `extractor_invalid_json` | LLM didn't return parseable JSON |
| review | `unsupported_claim` | Claim isn't justified by its chosen excerpt(s) |
| review | `scope_missing` | Claim may be true but its scope is absent |
| review | `scope_widening` | Claim was promoted beyond the source's scope |

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
