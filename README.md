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
>
> **4. Extraction may overproduce; synthesis may not inherit abundance.**

Law #4 means: between extraction and review there is a formal triage pass (`research-os claim triage`) that deduplicates, caps per-source contribution, and parks low-leverage candidates. Triage does NOT mutate `claims.jsonl` — parked claims remain on the canonical ledger as research truth, simply excluded from the next review pass via an append-only triage ledger. The reviewer keeps its job (interpretive judgement); triage absorbs the garbage-compaction load that paged extraction can produce.

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

## Install

**Requirements:** Node.js ≥ 20.

```bash
# From source (v0.1.0 is not yet published to npm)
git clone https://github.com/mcp-tool-shop-org/research-os.git
cd research-os
npm install
npm run build
npm link   # makes `research-os` available on your PATH
```

## Quick start

```bash
# Create a new research-pack
research-os init "How should X be structured?"

# Add a section
research-os section add 01-landscape --purpose "Map the current landscape"

# Gather a source
research-os gather 01-landscape --url https://example.com/paper

# Run the full chain
research-os claim extract 01-landscape
research-os claim triage 01-landscape
research-os contradict map 01-landscape
research-os gate 01-landscape
research-os review 01-landscape --two-pass-llm
research-os review-promote 01-landscape
research-os cowork handoff
research-os audit
research-os freeze
```

**Requires [ollama-intern-mcp](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) running locally** for LLM extraction, triage, review, and discovery. Set `OLLAMA_HOST` if Ollama is not on the default `localhost:11434`.

## Vocabulary

| Term | Meaning |
|------|---------|
| `research-os` | The control plane / CLI / gates / orchestration law (this repo) |
| `research-pack` | The generated repo artifact for one research effort |
| `research section` | A bounded unit of investigation inside a pack |
| `research receipt` | Proof a section passed source/claim/gate checks |

## Security

`research-os` is a local-first CLI. It reads and writes files within the research-pack directory you point it at, and (when using `gather`) issues outbound HTTP requests to fetch source URLs you provide. It does not: run a server, accept inbound connections, store credentials, or send telemetry. No secrets are written to pack artifacts. See [SECURITY.md](SECURITY.md) for the vulnerability reporting policy.

## Status

v0.1.0 — dogfood-proven. The full workflow chain (discover → gather → claims → contradictions → gate → review → audit → handoff → synthesis → freeze) shipped and was gated through its own research-pack. See [docs/dogfood-proof.md](docs/dogfood-proof.md) for the proof artifact.

## License

MIT
