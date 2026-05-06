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
