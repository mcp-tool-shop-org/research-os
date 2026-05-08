---
title: The 16 Laws
description: The load-bearing laws that govern every research-os operation.
sidebar:
  order: 2
---

These laws are not conventions or guidelines — they are enforced by the system. Each one was earned by a specific failure mode discovered during development.

## The laws

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

## Key laws explained

### Law 3 — No authoring evidence

When a claim cites source text, the LLM never writes that text. research-os builds a deterministic excerpt ledger (paragraph + sentence chunks, stable IDs like `ex_<source_id_hex>_001`). The LLM picks excerpt IDs from the ledger; research-os copies the literal text into the claim's `evidence_excerpt`.

This eliminates the "paraphrase-as-quote" failure class entirely — the model cannot author quotes it cannot actually source.

The six precise rejection categories (replacing the umbrella term "hallucination"):

| Stage | Category | Meaning |
|-------|----------|---------|
| extract | `excerpt_id_missing` | LLM picked an ID not in the ledger |
| extract | `excerpt_id_malformed` | LLM returned a malformed ID |
| extract | `extractor_invalid_json` | LLM output was not parseable JSON |
| review | `unsupported_claim` | Claim not justified by chosen excerpt(s) |
| review | `scope_missing` | Claim scope absent |
| review | `scope_widening` | Claim promoted beyond source scope |

### Law 4 — Triage before synthesis

Extraction may produce hundreds of candidate claims per source. The triage step (`research-os claim triage`) sits between extraction and review:

- Parks duplicates (collapses normalized-asserts clusters, keeps highest quality)
- Parks overdense-source contributions (per-source cap by quality rank)
- Parks weak-scope candidates (scope=null AND not=null on substantive asserts)
- Parks low-value claims (asserts below min-char floor)
- Routes recoverable claims to `needs_scope_repair`

Triage NEVER mutates `claims.jsonl` — parked claims remain on the canonical ledger as research truth.

### Law 13 — Reviewer calibration

Review confidence is earned by calibration, not by model output. Every reviewer prompt/model/config change reports per-category recall against a seeded fixture:

- Good-claim false-flag rate
- Bad-claim total recall
- Per-category recall for `unsupported_claim`, `scope_widening`, `definition_drift`, `temporal_mismatch`, `valid_but_low_value`

The architectural response to insufficient single-pass recall is two-pass review (`--two-pass-llm`): a general adversarial prompt followed by a narrow critic that aggressively attacks the four highest-risk categories.

### Law 16 — Waivers cannot manufacture evidence

A primary-source waiver may convert a source-type failure to `pass_with_waiver`. It may not reduce the accepted-claim count or distinct-source count required for synthesis.

Hard floors (non-waivable): `min_accepted_claims=3`, `min_accepted_sources=2`, `waiver_allowed=false` for the floor check.

## How laws are earned

Each law traces to a specific failure:

- **Law 3** — LLMs presented with raw source text + "quote exactly" prompts produced paraphrases indistinguishable from quotes. Structural fix: take evidence authoring away from the LLM entirely.
- **Law 13** — hermes3:8b achieved 0/3 recall on `unsupported_claim` in first-pass calibration. Measurable evidence that single-pass review at this model strength is too lenient.
- **Law 16** — dogfood pack Section Completion Run found waivers permitting synthesis_eligible=true on sections with zero or one accepted claim.

See [docs/dogfood-proof.md](https://github.com/mcp-tool-shop-org/research-os/blob/master/docs/dogfood-proof.md) for the full arc of findings.
