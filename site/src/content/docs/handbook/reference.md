---
title: CLI Reference
description: Complete reference for all research-os commands and flags.
sidebar:
  order: 4
---

## Global options

```
research-os --version    # print version
research-os --help       # list commands
research-os help <cmd>   # help for a specific command
```

## Pack lifecycle commands

### `research-os init <topic>`

Create a new research-pack from a topic statement.

```bash
research-os init "How should X be structured?"
research-os init "..." --name my-pack   # custom directory name
```

Writes: `research.yaml`, pack template files, `CLAUDE.md`.

---

### `research-os section add <id>`

Add a section to the pack. ID must match `NN-slug`.

```bash
research-os section add 01-landscape --purpose "Map the current landscape"
```

---

### `research-os gather <section>`

Fetch sources and extract source cards.

```bash
research-os gather 01-landscape --url https://example.com/paper
research-os gather 01-landscape --urls-file urls.txt
```

Writes: `evidence/fetch-log.jsonl`, `sections/<id>/sources.jsonl`, excerpt ledgers.

---

### `research-os discover`

Propose candidate source URLs for a section. Results are leads, not evidence.

```bash
research-os discover 01-landscape           # propose candidates
research-os discover approve 01-landscape   # approve for gather
research-os discover reject 01-landscape --id <id>
research-os discover export 01-landscape    # write urls.approved.txt
```

**Relevance check (v0.11.0+ R-008).** `discover run` now fetches each candidate URL's HTML `<title>` (bounded: 64KB body, 5s timeout, 4-way concurrency) and computes keyword overlap against the discover query. Each candidate gains a `relevance` block on the ledger record:

```json
{
  "status": "verified" | "unverified" | "topic_mismatch",
  "fetched_title": "...",
  "query_keywords": ["..."],
  "matched_keywords": ["..."],
  "overlap_score": 0.43,
  "threshold": 0.2,
  "error": null,
  "checked_at": "..."
}
```

Default overlap threshold `0.2`. The CLI report renders a Relevance column and a warning banner with override hint when `topic_mismatch` candidates are present.

**Quarantine + override.** `discover approve <section> --top N` structurally excludes `topic_mismatch` candidates. `unverified` (network/fetch failure) is graceful — not quarantined. Operator override: `discover approve <section> --candidate <id>` admits a flagged candidate explicitly; the relevance verdict stays on the ledger record for audit. Mirrors R-003's `clear_severities[]` "name to clear" semantics — no new override-ledger file.

**Env opt-out.** `RESEARCH_OS_DISCOVER_RELEVANCE=0` disables the check for offline/air-gapped workflows or environments where the prior v0.10 behavior is preferred.

---

### `research-os claim extract <section>` (v0.12.0+ resume/progress)

Extract claims from gathered sources.

```bash
research-os claim extract 01-landscape
research-os claim extract 01-landscape --model hermes3:8b      # override model
research-os claim extract 01-landscape --resume                # v0.12.0 (R-015)
research-os claim extract 01-landscape --progress              # v0.12.0 (R-015)
research-os claim extract 01-landscape --resume --progress     # combined
```

All claims ship at `review_state: candidate`. Extraction never promotes.

**v0.12.0+ per-source completion ledger (R-015).** Every successful per-source extraction appends a record to `evidence/extract-completion.jsonl` (always-on; written regardless of flags). Failed extractions (TIER_TIMEOUT, MCP error, validation failure) and pre-extract gate skips (no card, severity quarantine, no excerpts) do NOT write — they re-attempt on the next run. Records carry `(source_id, section_id, completed_at, claim_count, extraction_attempt, research_os_version, duration_ms)`.

- **`--resume`** skips sources whose successful extraction is already in the ledger for THIS section. Same source in a different section is tracked independently (key is `section_id + source_id`).
- **`--progress`** emits per-source `[extract N/M] <src_id> starting...` / `done — K claims in Tms` / `failed — <reason> in Tms` lines to stderr. Stdout (canonical claims output) is byte-identical to the default path. Counter reflects post-resume-filter position.
- Combined: emits `[skip] <src_id> (already extracted at <ISO>)` for ledger-completed sources before the `[extract N/M]` lines for the remaining work.

Default behavior (no flags) is byte-identical to v0.11.0 except for the new always-on `evidence/extract-completion.jsonl` artifact.

---

### `research-os claim triage <section>`

Shape the candidate set before review: dedup, cap per-source density, park low-value.

```bash
research-os claim triage 01-landscape
research-os claim audit-density 01-landscape   # read-only density diagnostic
```

---

### `research-os claim rescue <section>` (v0.12.0+ R-012)

Post-extraction rescue of `source_content_mismatch`-excluded claims that have ≥2 on-topic peers from the same source body. Closes the v0.3 over-trim case where R-011's 20% vocab-overlap precheck structurally excluded high-quality secondary-source moderator claims (e.g., Healthline's "western-edge crash spike" moderator at 11% overlap while the same source body produced 4 accepted on-topic claims).

```bash
research-os claim rescue 01-landscape                 # interactive (default)
research-os claim rescue 01-landscape --llm           # invoke LLM rescue critic only (no operator prompt)
research-os claim rescue 01-landscape --operator      # operator decides on each eligible claim
```

Three-stage sequential pipeline runs inside the extract loop AND at this post-extraction surface:

1. **Deterministic eligibility gate** — `non_excluded_on_topic_peers >= 2` from the same source body. Claims without enough peers get `rescue_status = ineligible_for_rescue` and stay excluded.
2. **LLM rescue critic** — eligible claims go to the rescue critic with peer-bundle context; the critic emits `rescued_by_llm` (with operator-readable `rescue_reason` + new `rescue_scope`/`rescue_boundary` constraints) or `not_rescued`.
3. **Operator decision** — for claims the LLM declined (or when the LLM is unavailable / opted-out), the operator CLI presents the claim + peers + critic decision and prompts for `accept` (operator-authored `rescue_scope` + `rescue_boundary`) / `decline` / `skip`.

Closed `FrameRescueStatus` enum (5 values): `not_rescued | rescued_by_llm | rescued_by_operator | operator_declined | ineligible_for_rescue`.

**Hard invariant: rescues that flip `frame_excluded: true → false` are WITNESSED** in the append-only `evidence/claim-frame-rescues.jsonl` ledger with `rescue_scope` + `rescue_boundary` metadata. The original claim's `scope` and `not` fields are NEVER rewritten by rescue — rescue metadata lives separately. The hard gate (`non_excluded_on_topic_peers >= 2`) is enforced at three layers in code (extractor, operator CLI, pure gate) so rescue cannot silently bypass it.

---

### `research-os claim repair-scope <section>` (v0.10.0+; v0.11.0 boundary alignment)

Repair claims whose `scope` field arrived `null` from extraction. Append-only ledger at `evidence/claim-scope-repairs.jsonl`; canonical `claims.jsonl` rows carry the latest `applied_scope` (and, in v0.11.0+, the latest `applied_not` for substantive claims).

```bash
research-os claim repair-scope 01-landscape                 # interactive (default)
research-os claim repair-scope 01-landscape --auto          # templated heuristic, no prompt
research-os claim repair-scope 01-landscape --interactive   # explicit interactive
```

Interactive mode (default) prompts on each proposal with `accept` / `edit` / `skip` / `quit`. `--auto` applies a templated heuristic — `"per <publisher> <source_type>, on <section_purpose>"` — without prompting. Graceful degradation when publisher or source_type is unknown.

**v0.11.0+ boundary alignment (R-007).** When BOTH `scope` AND `not` are null on a substantive claim at repair time, the engine now populates a templated boundary alongside the scope template:

```
not generalizing outside <publisher>'s <source_type> context
  → not generalizing outside <publisher>'s findings           (publisher only)
  → not generalizing outside <source_type>                    (source_type only)
  → not generalizing outside the <section_purpose_short> scope (graceful fallback)
```

Asymmetric (`scope=null, not=set`) claims keep their operator-authored boundary unchanged — R-007 does NOT widen into the reverse-asymmetric case. The ledger records `proposed_not` and `applied_not` alongside the scope fields; interactive mode shows `Proposed not:` and prompts for `new not (blank to keep proposed)` only when boundary repair applies. This closes the v0.2 stuck-loop where `claim triage` re-classified `--auto`-repaired claims as `needs_scope_repair` because triage requires both fields populated.

Running repair-scope twice on the same claim preserves both records (Law 15 append-only). Skip-with-reason writes a ledger record with `applied_scope=null, operator_confirmed=false`.

Mode flags are mutually exclusive; the engine requires a `prompter` for interactive mode (protects against silent fall-through where auto-mode runs because the prompter wasn't wired).

The recover advisor surfaces `repair_claim_scope` as the rank-1 action when the gate blocks on `accepted_claim_floor` and at least 3 claims are in `needs_repair_claims`; below that threshold the legacy `add_on_topic_sources` ranking is preserved (repair alone cannot clear the floor).

---

### `research-os contradict map <section>`

Detect tensions between candidate claims.

```bash
research-os contradict map 01-landscape
research-os contradict map 01-landscape --triaged-only   # only selected_for_review claims
research-os contradict map 01-landscape --detector heuristic   # bypass LLM (v0.3.0+)
```

`--detector <auto|heuristic|ollama-intern>` (v0.3.0+) chooses the
detector explicitly. Default `auto` preserves env-var-driven behavior;
`heuristic` always works without LLM; `ollama-intern` requires the
configured model and exits visibly if unavailable. Mode is announced
on every run. Full reference: [contradict map](/research-os/handbook/contradict-map/).

---

### `research-os contradict resolve <section>`

Record resolution decisions for detected contradictions.

```bash
research-os contradict resolve 01-landscape --id cnt_abc123 --status resolved --reason "..."
research-os contradict resolve 01-landscape --all --status resolved --reason "..."
```

Statuses: `resolved | preserved | rejected | unresolved`

---

### `research-os gate <section>`

Run the section gate engine.

```bash
research-os gate 01-landscape
```

Exits 0 if synthesis_eligible, exits 2 if not. Writes `audits/<section>-gate.{json,md}`.

Gate families: source_floor, claim_integrity, scope_integrity, freshness, contradiction, section_budget, waivers.

---

### `research-os review <section>`

Run the adversarial reviewer pass.

```bash
research-os review 01-landscape
research-os review 01-landscape --two-pass-llm          # general + narrow_critic passes
research-os review 01-landscape --model hermes3:8b      # model override
research-os review 01-landscape --triaged-only          # only triaged candidates
```

---

### `research-os review-promote <section>`

Promote a calibrated review profile to active state.

```bash
research-os review-promote 01-landscape
```

Until promoted, review runs are calibration evidence, not section truth.

---

### `research-os index`

Build and query the pack-local SQLite index.

```bash
research-os index build --all
research-os index build 01-landscape
research-os query "unresolved contradiction"
```

---

### `research-os cowork handoff`

Render the runtime Cowork contract from research truth.

```bash
research-os cowork handoff
```

Outputs: `handoffs/cowork-handoff.json`, `handoffs/cowork-master.md`.
Modes: `repair_required | synthesis_ready | human_review_required`.

---

### `research-os synth workspace`

Create the synthesis workspace (only when handoff mode = `synthesis_ready`).

```bash
research-os synth workspace
```

Writes: `synthesis/cross-section-map.{json,md}`. Refuses and exits 2 in repair mode.

---

### `research-os audit`

Aggregate pack-level audit rollups across all sections.

```bash
research-os audit
```

Writes 16 rollup files under `audits/`. Verdicts: `ready_for_synthesis | repair_required | human_review_required | blocked`.

---

### `research-os freeze`

Final integrity lock. Refuses unless every condition is met.

```bash
research-os freeze
```

Passes when: audit `ready_for_synthesis`, handoff `synthesis_ready`, all 5 synthesis files exist, final-report cites only accepted claim_ids, all active waivers disclosed, all canonical artifacts parse cleanly.

Writes: `audits/freeze-receipt.{json,md}` on pass. `audits/freeze-refusal.{json,md}` on fail.

---

### `research-os invalidate`

Archive artifacts produced under a superseded contract.

```bash
research-os invalidate extraction 01-landscape
research-os invalidate review 01-landscape
```

---

### `research-os pack publish`

Export a frozen research pack into the canonical `research-packs` archive format.
Derives the admission contract, copies all artifacts, and verifies the result — in one command.

```bash
research-os pack publish \
  --from ./research-os-packs/my-pack \
  --to ./research-packs/packages/my-pack
```

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--to <path>` | yes | — | Target package directory |
| `--from <path>` | no | cwd | Source frozen pack directory |
| `--operator-notes <text>` | no | `""` | Free-text notes written into `pack.manifest.json` |
| `--force` | no | false | `--force` clears and replaces the target package directory. Do not keep hand-authored files inside generated package output. |
| `--dry-run` | no | false | Derive manifest + README, print plan, write nothing |

| Exit code | Meaning |
|-----------|---------|
| 0 | Success — admission-contract PASS |
| 2 | Refused — pack or target failed a pre-condition; nothing written |

Full reference: [pack publish handbook page](/research-os/handbook/pack-publish/).

---

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | User error (bad input, pack not found) |
| 2 | Gate/freeze/synthesis blocked |

## Help topics

```
research-os help <topic>
```

Static topic content keyed by name. Topics: `recovery`, `pack-publish`, `review`, `gather`.
