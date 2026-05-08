# research-os

Local-first research control plane for gated source packs, claim truth, contradiction handling, and long-running AI synthesis.

## What it is

`research-os` is the orchestration layer that turns an open-ended topic into a **research-pack**: a structured local repo that Claude / Cowork / a swarm can work inside for hours without drifting, hallucinating, or flattening the investigation.

It is not a report generator. It is the operating environment for grounded research.

## The 16 load-bearing laws

| # | Law |
|---|-----|
| 1 | No synthesis before source truth. |
| 2 | Fetch is evidence; extraction is interpretation. |
| 3 | Models may interpret source spans; they may not author evidence spans. |
| 4 | Extraction may overproduce; synthesis may not inherit abundance. |
| 5 | Contradiction mapping surfaces tension; it does not resolve, synthesize, or decide which claim wins. |
| 6 | Gates decide whether a section is eligible for synthesis. They do not synthesize or hide failure. |
| 7 | Adversarial review judges research integrity. It does not synthesize or rewrite source truth. |
| 8 | Indexing makes research truth queryable. It does not create new truth or become the source of record. |
| 9 | Cowork handoff renders operational instructions from research truth. It does not create truth or bypass gates. |
| 10 | Synthesis workspace organizes accepted research truth for Cowork. It does not create synthesis or bypass handoff mode. |
| 11 | Pack audit aggregates existing research truth. It does not create new truth or hide section-level evidence. |
| 12 | Discovery proposes leads; only fetch produces evidence. |
| 13 | A reviewer is not trusted until seeded failures prove recall. |
| 14 | Claim abundance is not research quality. Claims must be triaged before they can compete for synthesis. |
| 15 | Freeze locks completed research truth. It does not complete unfinished research or convert repair state into evidence. |
| 16 | Waivers relax source constraints; they cannot manufacture evidence. |

**Law 3** — the LLM never authors evidence text. research-os builds a deterministic excerpt ledger (stable IDs like `ex_<source_id_hex>_001`); the LLM picks excerpt IDs; research-os copies the literal text. The "paraphrase-as-quote" failure class is structurally impossible.

**Law 14** — between extraction and review, `research-os claim triage` deduplicates, caps per-source contribution, and parks low-leverage candidates. Triage does NOT mutate `claims.jsonl`; parked claims remain on the canonical ledger.

## The v0.1 workflow chain

```
discover
→ gather
→ claim extract
→ claim triage
→ contradict map
→ gate
→ review
→ review-promote
→ index
→ cowork handoff
→ synth workspace
→ audit
→ freeze
```

Each step is a CLI command. Each step writes to append-only artifacts. No step synthesizes, resolves, or creates new truth — those invariants are enforced, not trusted. See [docs/dogfood-proof.md](docs/dogfood-proof.md) for the v0.1 proof that the chain holds end-to-end.

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
