# Changelog

All notable changes to `research-os` are documented here.

## [0.1.0] — Unreleased

### Added
- Initial scaffold matching mcp-tool-shop conventions
- `research-os init <topic>` — Link 1 of the workflow chain
- `research.yaml` schema with intake fields, gate config, and primary-source waiver model
- Pack template with prompt contracts (`cowork-master.md`, `section-worker.md`, `adversarial-reviewer.md`)
- Pack-local `CLAUDE.md` operating instructions
- `research-os section add <id>` — Link 2 of the workflow chain
- Per-section folder scaffold: `brief.md`, `sources.jsonl`, `claims.jsonl`, `contradictions.md`, `gates.yaml`, `open_questions.md`
- `gates.yaml` schema for per-section budget and source/contradiction requirements; inherits pack-level defaults with per-section overrides
- Section id format enforcement (`NN-slug`) and duplicate-id rejection
- `research-os gather <section>` — Link 3 of the workflow chain
- Direct-fetch acquisition layer: every fetch attempt produces a persistent `FetchReceipt` (URL, final URL, status, content-type, sha256, byte count, title, raw text path) appended to `evidence/fetch-log.jsonl`
- `SourceCard` schema separating fetched truth from extracted interpretation, with the `asserts` / `scope` / `not` triple to prevent contextual claims from being promoted into universal rules
- Extractor adapter interface: `HeuristicExtractor` (cheerio-based, always available) + `OllamaInternExtractor` (local Ollama HTTP, runtime-detected, never required for end users)
- Failed fetches still write receipts but do not write source cards; failed extractions write a receipt with `extraction_outcome: failed` plus the error, no fake card
- Load-bearing law added: **fetch is evidence; extraction is interpretation**
- `research-os claim extract <section>` — Link 4 of the workflow chain
- `Claim` schema (zod): `claim_id` / `source_ids` / `source_hashes` / `asserts` / `scope` / `not` / `evidence_excerpt` / `evidence_location` / `confidence` / `extractor` / `extraction_method` / `created_at` / `review_state`. Every emitted claim ships at `review_state: candidate` — extraction never promotes
- `HeuristicClaimExtractor`: one candidate claim per source-card `key_point` with `extraction_method: heuristic_key_point`, `scope: null`, `not: null`, `confidence: low` — labelled honestly as shallow
- `OllamaInternClaimExtractor`: 3-7 propositional claims per source via local Ollama HTTP, each with its own `asserts` / `scope` / `not` triple grounded in a literal `evidence_excerpt`. Falls back to heuristic when unavailable
- `OLLAMA_HOST` host normalization: bare `127.0.0.1:11434` and `localhost:11434` are accepted alongside fully-qualified URLs; trailing slashes stripped
- Re-runs of `claim extract` are idempotent — claim_ids dedupe by `clm_<source-hash>_<extractor>_<index>`
- `NoSourcesGatheredError` when claim extraction is invoked on an empty section
- 26 new tests (79 total)
- `research-os contradict map <section>` — Link 5 of the workflow chain
- `Contradiction` schema (zod) with six tension types: `direct_conflict` / `scope_conflict` / `temporal_conflict` / `definition_conflict` / `evidence_conflict` / `overgeneralization_risk`. Severity, confidence, scope_analysis, overlap_assessment, status (always `unresolved` at write), detector, detection_method
- Pair-wise comparison of `review_state: candidate` claims within a single section. Section-scoped only; cross-section mapping is a later link
- `HeuristicContradictionDetector`: scope-aware similarity + negation matching. Surfaces direct_conflict (token overlap + negation mismatch + overlapping/unknown scope) and overgeneralization_risk (asymmetric scope-tagging on claims that share substantive tokens). Conservative thresholds; only low/medium confidence
- `OllamaInternContradictionDetector`: pair-wise LLM classification across all six tension types with explicit "none" path; falls back cleanly when unavailable
- Stable `contradiction_id` = `cnt_<sha256(sorted_claim_pair)>_<detector>` — deterministic and dedup-friendly across re-runs
- Markdown view written to `sections/<id>/contradictions.md` is regenerated each run; honest "0 candidates detected" when nothing fires; ledger appended to `sections/<id>/contradictions.jsonl`
- Load-bearing law added: **contradiction mapping surfaces tension; it does not resolve, synthesize, or decide which claim wins**
