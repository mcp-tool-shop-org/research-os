<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/research-os/readme.png" alt="research-os" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/research-os/releases/tag/v0.13.0"><img src="https://img.shields.io/badge/version-0.13.0-blue" alt="version 0.13.0"></a>
  <a href="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-brightgreen" alt="Node ≥20">
  <a href="https://mcp-tool-shop-org.github.io/research-os/handbook/"><img src="https://img.shields.io/badge/handbook-live-purple" alt="Handbook"></a>
</p>

# research-os

`research-os` turns research from a generated document into a frozen evidence pack. It preserves source truth, separates claims from synthesis, forces readiness through gates, records reviewer and waiver decisions, and publishes a package whose claims can be traced and verified.

It does not ask you to trust the model. It gives you the machinery to decide whether the model, the sources, and the synthesis earned trust.

## What it is

`research-os` is the control plane between "I want to research X" and a frozen, claim-traceable evidence base. It separates discovery leads from fetch evidence, raw extraction from triaged claims, contradiction detection from contradiction resolution, and review decisions from synthesis dispositions. Every step writes to an append-only ledger; every readiness verdict is computed from those ledgers, not asserted.

It is not a report generator. It is not an LLM-orchestration framework. It does not write your synthesis for you. It enforces the conditions under which synthesis can begin.

Frozen packs are archived in [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) — live, with four packages spanning the six closed dogfood experiments. See [`docs/roadmap.md`](docs/roadmap.md) for the v1.0 path.

v0.1 has been pressure-tested in two dogfood arcs. The first — research-os researching its own spec — found seven correctness gaps before the v0.1.0 release, each requiring a real code fix and earning a law or integration pattern. The second (v1 Experiment 1: ComfyUI workflow durability, 11 sessions, a domain with no vocabulary overlap with research-os) closed 2026-05-09: pack frozen, archive live, Pattern 2 enforcement completed via commit `22b5dba`. The v0.1 proof trail lives in [`docs/dogfood-proof.md`](docs/dogfood-proof.md); the Experiment 1 proof lives in [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md). Live handbook: <https://mcp-tool-shop-org.github.io/research-os/handbook/>.

## Install

**Requirements:** Node.js ≥ 20.

```bash
npm install -g @mcptoolshop/research-os
```

For contributors building from source:

```bash
git clone https://github.com/mcp-tool-shop-org/research-os.git
cd research-os
npm install
npm run build
npm link
```

## Quick start

```bash
# Create a new research-pack
research-os init "How should X be structured?"

# Add a section
research-os section add 01-landscape --purpose "Map the current landscape"

# Discover and approve sources, then gather
research-os discover run 01-landscape
research-os discover approve 01-landscape --top 8
research-os gather 01-landscape --approved

# Run the per-section chain
research-os claim extract 01-landscape
research-os claim audit-density 01-landscape
research-os claim triage 01-landscape
research-os contradict map 01-landscape --triaged-only
research-os review 01-landscape --triaged-only --preset hermes-two-pass --profile hermes-two-pass
research-os review-promote 01-landscape --profile hermes-two-pass
research-os gate 01-landscape
research-os section report 01-landscape

# Pack-level finish
research-os audit
research-os index build --all
research-os cowork handoff
research-os synth workspace   # only if handoff returned synthesis_ready
research-os freeze

# Export to the research-packs archive
research-os pack publish \
  --to <research-packs>/packages/<name>
```

> **Note on `freeze` output.** `research-os freeze` operates silently while it walks every canonical artifact and computes content hashes — there is no incremental progress for this command. On large packs it can run for tens of seconds before printing anything. When it finishes it prints a single verdict block (`PASS` / `REFUSED` plus the receipt path). Do not interpret the gap as a hang.

> **`--force` warning.** `--force` clears and replaces the target package directory. Do not keep hand-authored files inside generated package output. Edit upstream artifacts (claims, sources, synthesis) or sibling files instead. Full admission contract + refusal cases: [`docs/pack-publish.md`](docs/pack-publish.md).

**For a real worked example**, see the dogfood pack at `research-os-packs/research-os-spec/` — every artifact, every receipt, every disposition, every freeze fingerprint, all on disk in append-only ledgers. That pack is what produced `docs/dogfood-proof.md`.

**Requires [`ollama-intern-mcp@^2.4.0`](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) running locally** for LLM extraction, triage, review, and discovery. The MCP server is discovered via the `OLLAMA_INTERN_MCP_BIN` env var or PATH. Default model is `hermes3:8b`; override with `OLLAMA_INTERN_MODEL=<model>` (or per-call `--model <name>`). Set `OLLAMA_HOST` if Ollama is not on the default `localhost:11434`.

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
→ claim audit-density
→ claim triage
→ contradict map
→ contradict resolve
→ review
→ review-promote
→ gate
→ section report
→ audit
→ index build
→ cowork handoff
→ synth workspace
→ freeze
```

Each step is a CLI command. Each step writes to append-only artifacts. No step synthesizes, resolves, or creates new truth — those invariants are enforced, not trusted. Review accepts/rejects/requests-repair on candidate claims; gate consumes those review decisions to compute `synthesis_eligible`; freeze is the final integrity lock that refuses to mark a pack done unless every layer agrees. See [docs/dogfood-proof.md](docs/dogfood-proof.md) for the v0.1 proof that the chain holds end-to-end.

This is the structural alternative to *search → summarize → pretty report*. The chain is the product.

## Vocabulary

| Term | Meaning |
|------|---------|
| `research-os` | The control plane / CLI / gates / orchestration law (this repo) |
| `research-pack` | The generated repo artifact for one research effort |
| `research section` | A bounded unit of investigation inside a pack |
| `research receipt` | Proof a section passed source/claim/gate checks |

## Security

`research-os` is a local-first CLI. It reads and writes files within the research-pack directory you point it at, and (when using `gather`) issues outbound HTTP requests to fetch source URLs you provide. It does not: run a server, accept inbound connections, store credentials, or send telemetry. No secrets are written to pack artifacts. See [SECURITY.md](SECURITY.md) for the vulnerability reporting policy.

## Reviewer calibration

v0.5.0 makes reviewer calibration durable. A reviewer profile is not trusted because
it ran once; it earns a status through structured seeded-failure receipts and
multi-run aggregation. v0.6.0 adds deterministic reviewer options to the production
review path and calibration harness.

**No profile is currently admitted as `trusted_baseline`.** The canonical receipts
in the repo show `hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`,
`hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`. This is
intentional: trust is earned through repeated seeded-failure evidence, not assumed.
The `hermes-two-pass-deterministic` receipt has a structural model-capability gap
(2/6 decision types produced; requires 3/6) that is not a variance problem.

Calibration receipts live at `calibration/reviewer-profiles/<profile>/seeded-v1.{json,md}`.
Each receipt records PASS/FAIL against seven bars, four status labels
(`trusted_baseline`, `conditional_pass`, `failed`, `comparison_only`), and
honestly discloses what the fixture cannot test (`needs_contradiction_mapping`
is unreachable from `seeded-v1`). See [CHANGELOG.md](CHANGELOG.md).

```bash
# Single-run calibration (quick local check)
node scripts/reviewer-calibration.mjs --model hermes3:8b --two-pass --profile hermes-two-pass

# Multi-run aggregate calibration (canonical evidence — 3 runs, median-based PASS/FAIL)
node scripts/reviewer-calibration.mjs --model hermes3:8b --two-pass --profile hermes-two-pass --runs 3

# Deterministic multi-run calibration (temperature + seed explicit in receipt)
node scripts/reviewer-calibration.mjs --model hermes3:8b --two-pass \
  --temperature 0 --seed 7 --runs 3 --profile hermes-two-pass-deterministic

# Promote a section's review — auto-populates calibration_summary from pack-relative receipt
research-os review-promote 01-section --pack <pack> --profile hermes-two-pass
```

When `--runs <n>` is used, per-run receipts are written to `<profile>/runs/run-NNN.json`
and an aggregate receipt (with median-based bars and recurring-failure detection) is written
to `<profile>/seeded-v1.{json,md}`. The aggregate receipt carries `receipt_kind: 'aggregate'`
to discriminate from single-run receipts. Single-run mode (`--runs 1` or omitted) preserves
the existing direct-write behavior.

**Deterministic reviewer profiles** — use `review_profiles.<name>.reviewer_options` in
`research.yaml` to carry `temperature`, `seed`, and other Ollama sampling parameters
into every `OllamaInternReviewer` construction in the production review path. The
`hermes-two-pass-deterministic` profile ships as a built-in example. See
[`docs/experiment-6-proof.md`](docs/experiment-6-proof.md) and the
[reviewer calibration handbook page](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).

## New in v0.13.0 — Finalization-Blocker Triage Arc (R-019 + R-020 D-only + R-021)

v0.13.0 closes the v0.13 finalization-blocker triage arc opened after the v0.4 rerun against `@mcptoolshop/research-os@0.12.1` returned **PASS_WITH_CONDITIONS, not authorization-grade**, via Path D (multi-blocker triage arc, distinct from Path C named-patch). Three independent finalization blockers at three different pipeline layers; three independent named knobs that, together, unblock synth prose finalization + no_answer_cluster recovery surface + contradict-map auto-mode. The defense floor and coverage-recovery surfaces from v0.10 / v0.11 / v0.12 / v0.12.1 remain intact; no closed-enum changes; no breaking surface changes.

> **v0.4 rerun proves synthetic acceptance can validate plumbing while live replay falsifies the target mechanism.**
> **v0.13 addresses finalization runtime control: R-019 unblocks the inner MCP tier-budget layer; R-020 surfaces honest no_answer_cluster refusal with recovery actions; R-021 unblocks the contradict-map auto-mode RPC layer.**

The v0.5 operator-aloneness gate fires against published v0.13.0 in a separate session. Admissibility Slice 1 remains **not authorized** until v0.5 PASS.

### What you can run

```sh
# R-019 — inner MCP tier-budget override now reaches the underlying control point
#         (requires ollama-intern-mcp@>=2.6.0 for the override to land in the inner mechanism)
research-os synth section <id> --planner-timeout-ms 30000
RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=30000 research-os synth section <id>

# R-021 — contradict-map auto-mode hang-timeout + heuristic fall-through
research-os contradict map <id> --detector auto \
  --auto-mode-pair-timeout-ms 90000 \
  --auto-mode-fall-through-after-n-timeouts 5
RESEARCH_OS_CONTRADICT_AUTO_PAIR_TIMEOUT_MS=90000 \
RESEARCH_OS_CONTRADICT_AUTO_FALL_THROUGH_AFTER_N=5 \
  research-os contradict map <id> --detector auto
```

### What's new

**R-019 — inner MCP tier-budget client wire-up.** R-018's `--planner-timeout-ms <N>` flag (and `RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS` env var) now threads through planner / drafter / verifier into `ollama_extract.tier_budget_ms_override`, reaching `runWithTimeoutAndFallback` at `ollama-intern-mcp/src/guardrails/timeouts.ts:61`. The inner per-tier timeout mechanism that produced the v0.4 rerun's `elapsed=15018ms budget=15000ms` failure now honors the operator's budget directly. The R-018 wrapper is retained as outer hard-rail against unresolved-promise hangs (the orthogonal failure mode wrappers can actually catch). Requires `ollama-intern-mcp@>=2.6.0`; older versions silently ignore the new schema field (R-018 wrapper still works at its original layer — graceful degradation).

**R-020 (D-only) — `no_answer_cluster` recovery surface.** When the planner declines to assign role=answer to any accepted claim, the failure now surfaces inline `recovery_actions[]` (`narrow_section_purpose` + `add_on_topic_sources`) in `section-synthesis.json`, a rendered `## Recovery actions` markdown block in `section-synthesis.md` (with action_id heading + why text + fenced command_hint code block), and a single-line stderr hint (`[synth] no_answer_cluster — see section-synthesis.md "Recovery actions" block for actionable steps`). The action list is a single source of truth shared with the action-graph recovery path; no drift between standalone-command and inline-failure-body paths. **R-020's planner prompt tune (A-half) was attempted and reverted** — iter-1 produced silent-wrong synthesis (LLM fabricated null-effect answers from positive-effect claims on adversarial fixtures; verifier blessed the inverted negation as `faithful`); iter-2's HARD GUARDRAIL did not override the hallucination. Per the operator's one-iteration rule, prompt and 3 v3-pinned test files were reverted; `PROSE_PROMPT_VERSION` stays at `section-prose-v3`. The doctrine ratchet earned: structural live replay can pass while synthesized content is silent-wrong; manual prose inspection on adversarial fixtures is required to catch negation / scope / predicate inversion.

**R-021 — contradict-map auto-mode hang-timeout + heuristic fall-through + visible progress.** New `--auto-mode-pair-timeout-ms <N>` (default 90000; lowered from the pre-R-021 hardcoded 120s after gate-measured warm hermes3:8b on v0.4 fixture: min 6.2s, median 8.4s, max 8.8s → 90s default has ≥81s headroom). New `--auto-mode-fall-through-after-n-timeouts <N>` (default 5; consecutive-failure threshold for automatic heuristic fall-through; successful `type:none` classifications reset the counter). Matching env vars. New stdout start line (`auto-mode engaged: N candidate pairs; per-pair timeout=Xms; fall-through-after=Y`) emitted on every invocation — always visible, survives non-TTY contexts. Forced-emit stderr fall-through trigger event bypasses TTY-gating / `--progress` because the operator must see the mode-switch. New `## Auto-mode fall-through` markdown block in `contradictions.md` when the threshold trips. Heuristic re-runs on unprocessed pairs only (no duplicate re-classification of pairs LLM already completed).

### Architectural note

R-019 crosses the research-os ↔ ollama-intern-mcp boundary. Research-os passes `tier_budget_ms_override` in the `ollama_extract` schema; ollama-intern-mcp v2.6.0 honors it at the inner guardrail. The plumbing was already there; v2.6.0 supplied the client-side entry point; v0.13.0 supplies the research-os-side client wire-up. R-018's Promise.race wrapper is retained because it guards against an orthogonal failure mode (unresolved-promise hangs — wrappers can catch those; structured `isError:true` payloads at an inner budget the wrapper cannot reach is R-019's territory).

R-021 is research-os-only. Contradict-map auto-mode does NOT route through ollama-intern-mcp — it calls Ollama HTTP `/api/chat` directly. No MCP transport in chain; no `tier_budget_ms_override` plumbing; no R-018 wrapper. The four-hard-laws kickoff protocol caught a misframe in the R-021 kickoff before any patch code was written: the kickoff said "MCP RPC layer"; Phase A read phase falsified it.

### Defense floor preserved

R-019 + R-020 D-only + R-021 are operator-knob additions, not architectural changes. R-002 through R-018 surfaces all untouched. `accepted_claim_floor` remains unwaiveable. Closed enums unchanged (`FailureShape` at 9; `RECOVERY_ACTIONS` at 8; `REGENERATION_REASONS` at 3; `PLANNER_TIMEOUT_SOURCES` at 3; `POLICY_KEYWORDS` at 8; `POLICY_RELEVANT_SOURCE_TYPES` at 1). AI recovery advisor prompt template untouched. MCP architecture extended additively. R-010 fallback-cause regex shape preserved.

Frozen-pack regression byte-identical against v0.3.3 baselines for all four frozen packs — **eighteenth consecutive release** where this holds. 1542 → 1630 vitest passing (+88 across the three slices; 4 skipped — live-replay tests gated on rig env vars).

### What v0.13.0 does NOT claim

- v1 readiness.
- v0.5 operator-aloneness gate verdict. v0.5 fires against `@mcptoolshop/research-os@0.13.0` in a separate session; v0.13.0 is the prerequisite for finalization-grade, not the proof.
- Admissibility Slice 1. Gated on v0.5 PASS.
- Deferred v0.13.x candidates (F-2 R-009 audit↔extract divergence; F-3 cowork-handoff staleness; F-4 R-017 POLICY_KEYWORDS narrowness; A-1 + A-2 architect-side findings folded into v0.5 gate-scaffolding prep).

See [CHANGELOG.md](CHANGELOG.md) for the full release entry.

## Previously: v0.12.1 — Synth Planner Timeout Override (Path C Patch)

v0.12.1 was a single-repair patch on top of v0.12.0. It shipped R-018 only — a research-os-side wrapper timeout on synth prose MCP `callTool` calls, controlled by an operator-discoverable CLI flag (`--planner-timeout-ms <N>` on `synth section` and `synth workspace`) and matching env var (`RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=<N>`). Precedence: CLI flag > env var > default (15000ms). Default behavior is preserved byte-identical to v0.12.0.

The release exists because the v0.4 operator-aloneness gate against `@mcptoolshop/research-os@0.12.0` returned **PASS_WITH_CONDITIONS, not authorization-grade** (`operator_aloneness_dst_v0.4`). The v0.11 defense floor held under live load; all six v0.12 coverage-recovery surfaces fired and carried the operator; sealed envelope coverage reached PASS thresholds (4/5 SUPPORTED + 1 PARTIAL must-include; 2/3 SUPPORTED + 1 PARTIAL moderators; 0/3 traps; 0/5 material failures triggered); contamination markers were all HARMLESS. The single failure mode was finalization: synth prose hit `TIER_TIMEOUT` reproducibly at ~15010ms vs the 15s Instant-tier budget with no documented operator override. Section briefs were envelope-compliant; the pack just couldn't reach freeze.

**Path C disposition** (new pattern earned at v0.4): when Session B identifies a single named failure mechanism with an explicit patch path AND envelope coverage is at PASS thresholds AND defense floor preserved AND contamination HARMLESS, the disposition is — ship the patch, rerun the same operator path against the patched version, re-grade. No envelope re-authoring. No human rater. No v0.13 architectural arc.

> **v0.4 proves coverage-grade Research-OS at the section-brief level.**
> **v0.12.1 must prove finalization-grade by removing the single planner-timeout bottleneck without weakening the defense floor.**

### What you can run

```sh
research-os synth section <id> --planner-timeout-ms 30000
                                          # Raise planner budget for finalization (R-018)
RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=30000 research-os synth section <id>
                                          # Equivalent env-var path (R-018)
```

The active budget surfaces in `section-synthesis.json` (`planner_timeout_ms` always populated + `planner_timeout_overridden_by` present only on override), ProseBlock metadata, and stderr (`[synth] planner_timeout_ms=N source=… section=<id>` emitted before prose generation). `synth section --help` documents the flag, default, upper bound (600000ms safety rail), and env-var alternative. Invalid values (negative, zero, non-numeric, unit-suffixed strings, > 600000) fail clearly with a non-zero exit code naming the surface + offending value. No silent fallback.

### Architectural note

The 15000ms budget the v0.4 gate hit lives in `ollama-intern-mcp` (`profiles.ts:58`, `DEV_RTX5080_TIMEOUTS.instant`), NOT research-os. Pre-R-018 research-os enforced no planner timeout — the timeout fired server-side in ollama-intern-mcp's tier policy. R-018's resolution introduces research-os's own authority over the budget via a `Promise.race` wrapper around the MCP `callTool`, defaulting to the de-facto observed Instant-tier number (15000ms) so default behavior is preserved. R-018's wrapper produces `TIER_TIMEOUT`-shaped errors that match the R-010 `classifyFallbackCause` regex (`/elapsed=(\d+)ms/` + `/budget=(\d+)ms/`), preserving downstream AI-advisor visibility on default-path runs.

### Defense floor preserved

R-018 is a thin operator-knob patch, not an architectural change. R-002 / R-003 / R-005 / R-007 / R-008 / R-009 / R-010 / R-011 / R-012 / R-013 / R-014 / R-015 / R-016 / R-017 all untouched. `accepted_claim_floor` remains unwaiveable. Closed enums unchanged (`FailureShape` at 9; `RECOVERY_ACTIONS` at 8; `REGENERATION_REASONS` at 3; `POLICY_KEYWORDS` at 8; `POLICY_RELEVANT_SOURCE_TYPES` at 1). AI recovery advisor prompt template untouched. MCP architecture unchanged — `ollama-intern-mcp@^2.4.0` carries through. R-018 adds `PLANNER_TIMEOUT_SOURCES` (3) as new operator-bookkeeping vocabulary distinct from any gate-routing enum.

Frozen-pack regression byte-identical against v0.3.3 baselines for all four frozen packs — **sixteenth consecutive release** where this holds. 1542 → 1586 vitest passing (+44 R-018 acceptance tests).

### What v0.12.1 does NOT claim

- v1 readiness.
- v0.4 operator-aloneness gate rerun verdict. v0.4 reruns against `@mcptoolshop/research-os@0.12.1` in a separate session; v0.12.1 is the prerequisite for finalization-grade, not the proof.
- Admissibility Slice 1. Gated on v0.4 rerun PASS — the v0.4 doctrine ratchet (defense-grade aloneness PROVEN; coverage-grade aloneness SUBSTANTIVELY PROVEN at section-brief level; finalization-grade pending v0.12.1) remains the locked test.
- v0.13 candidates (F-2 R-009 audit↔extract divergence; F-3 cowork-handoff staleness; F-4 R-017 POLICY_KEYWORDS narrowness). Independent of finalization.

See [CHANGELOG.md](CHANGELOG.md) for the full release entry.

## Previously: v0.12.0 — Coverage-Recovery Release

v0.12.0 closes the v0.3 operator-aloneness gate findings surfaced 2026-05-16 (`operator_aloneness_dst_v0.3`, PASS_WITH_CONDITIONS but not authorization-grade). Six named findings across four slices: three architectural repairs that close the v0.4-blocking coverage gaps (R-012, R-013, R-014), and three ergonomic closures that improve the operator surface the v0.4 gate will exercise (R-015, R-016, R-017). v0.3 did not fail because defenses regressed — all five v0.11 defense surfaces fired exactly as designed, produced a clean honest synthesis with zero silent-wrong content, and the pack froze on real-but-narrow evidence. It failed because the same defenses, working correctly, trimmed load-bearing primary-source coverage out of the accepted-claim base. The doctrine ratchet earned at v0.3:

> **v0.11 made the system safe enough to avoid silent-wrong synthesis.**
> **v0.12 makes it more capable of recovering coverage without weakening those defenses.**

The thesis: **conservative defenses can prevent silent-wrong synthesis, but they can also starve the pack of necessary coverage.** v0.12 is the coverage-recovery answer. The v0.11 defense floor stays unchanged — every R-007 through R-011 surface still fires. v0.12 adds lawful, witnessed recovery paths on top.

### What you can run

```sh
research-os claim rescue <section-id> [--llm | --operator]
                                              # NEW: post-extraction rescue of frame-excluded
                                              # source_content_mismatch claims with peer evidence (R-012)
research-os source-card audit --apply --from <file> --rebuild-cards
                                              # NEW: overrides materialize into persisted card raw JSON
                                              # without re-fetching (closes C2+C3 architectural trap) (R-013)
research-os recover pack --regenerate-action-graph
                                              # NEW: re-runs advisor against current state when
                                              # recovery artifact has gone stale (R-014)
research-os claim extract <section-id> [--resume] [--progress]
                                              # NEW: per-source resume + stderr progress lines (R-015)
```

### The three architectural repairs (v0.4-blocking floor)

```
extract critic  →  R-012  source_content_mismatch claims with ≥2 on-topic peers from same source
                    ↓     become rescue-eligible; LLM critic rescues or operator decides via
                    ↓     `claim rescue` CLI; append-only evidence/claim-frame-rescues.jsonl ledger
                    ↓     witnesses every state change; original claim.scope/not NEVER rewritten
source-card     →  R-013  audit --apply --rebuild-cards routes persisted cards through SAME
                    ↓     buildCard() gather uses; raw card.source_type == effective post-rebuild;
                    ↓     reviewer reads pass; no HTTP, no re-fetch; defense floor preserved
                    ↓     (R-003/R-005/R-009 still fire during rebuild on cached bodies)
recover advisor →  R-014  needs_repair_claims partitioned into scope_repair_blocked +
                    ↓     source_repair_blocked; v0.3 regression replay (0 scope + 5 source) now
                    ↓     recommends add_on_topic_sources (the actual unblock), NOT repair_claim_scope;
                    ↓     --regenerate-action-graph with SHA-256 input_state_hash freshness detection
```

### The three ergonomic closures (v0.4-gate-experience improvements)

```
claim extract    →  R-015  always-on evidence/extract-completion.jsonl ledger (NEW persistent
                    ↓     artifact); --resume skips ledger-completed sources (failed re-attempted);
                    ↓     --progress emits per-source [extract N/M] stderr lines; canonical stdout
                    ↓     unchanged; default behavior byte-identical except for the new ledger
override docs    →  R-016  examples/source-card-override.example.json shipped in tarball with
                    ↓     2 realistic entries (effective_source_type-only + clear_severities);
                    ↓     converts C1 schema-discovery-by-runtime-error from operator-friction
                    ↓     to TRIVIAL
policy coverage  →  R-017  audits/missing-policy-sources.{json,md} informational pack-level audit;
                    ↓     fires when policy keyword in research.yaml topic+decision AND zero
                    ↓     docs sources; honors R-013 rebuild via getEffectiveSourceType;
                    ↓     INFORMATIONAL ONLY — never affects verdict/freeze/pack-publish
```

### Law boundary

Pack-law forbiddings preserved. `accepted_claim_floor` remains unwaiveable. The closed `FailureShape` enum is unchanged at nine values. `RECOVERY_ACTIONS` enum unchanged at 8 values — no new advisor actions; R-014's distinct-shape heuristic widens routing of existing actions. AI recovery advisor prompt template untouched (new `EvidenceState` fields are observable in persisted JSON but NOT rendered in the prompt). Recovery verifier rules unchanged. MCP architecture unchanged — `ollama-intern-mcp@^2.4.0` carries through; no MCP call shape change on extract. R-017's warning is informational and does NOT affect gate verdict, freeze receipt, or pack-publish. All v0.10 + v0.11 defenses preserved; the defense floor is the floor and v0.12 builds on top.

Frozen-pack regression byte-identical against v0.3.3 baselines for all four frozen packs — **fifteenth consecutive release** where this holds (v0.4 → v0.5 → v0.6 → v0.7 → v0.8 → v0.9 → v0.10 → v0.11 → v0.12).

### What v0.12.0 does NOT claim

- v1 readiness.
- v0.4 operator-aloneness gate verdict. v0.4 runs against npm `@mcptoolshop/research-os@0.12.0` in a separate session.
- Admissibility Slice 1. Gated on v0.4 PASS — the v0.3 doctrine ratchet (defense-grade aloneness PROVEN; coverage-grade aloneness NOT yet) remains the locked test.
- A win over cloud-based research tools.
- A complete trusted reviewer calibration model.

v0.12.0 is the prerequisite for v0.4 of the operator-aloneness gate, not the proof.

See [CHANGELOG.md](CHANGELOG.md) and the operator-facing override example at [`examples/source-card-override.example.json`](examples/source-card-override.example.json).

## Previously: v0.11.0 — Second Operator-Aloneness Repair Release

v0.11.0 closed the v0.2 operator-aloneness gate failure conditions: scope/boundary repair alignment (R-007), discover-time URL relevance check (R-008), paired source-content contamination defense at extraction and frame-critic layers (R-009 + R-011), and recover advisor fallback-cause visibility (R-010). The three-layer source-content guard (R-008 at admission + R-009 at extraction + R-011 at frame critic) lands here. See [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md).

## Previously: v0.10.0 — Operator-Aloneness Repair Release

v0.10.0 closed the v0.1 operator-aloneness gate failure conditions surfaced 2026-05-15 (`operator_aloneness_dst_v0.1`, FAIL): recovery routing alignment (R-002), scope-repair CLI (R-001), paired source-card audit hardening (R-003 + R-005), and honest gather status (R-004). See [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md).

## Previously: v0.9.0 — Product Artifact Arc

v0.9.0 turned the v0.8 evidence spine into operator-useful artifacts: section-level prose synthesis (`synth section`), partial-pack synthesis (`synth pack --partial`), and the lawful recovery advisor (`recover pack`). See [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md).

## Previously: v0.8.0 — Architecture Recovery

v0.8.0 reconnected research-os to its declared local-LLM substrate (`ollama-intern-mcp@^2.4.0`) for claim extraction, added frame-bound section-relevance enforcement, and added section-scoped evidence-citation synthesis for gate-eligible sections in repair-required packs. See [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md).

## Status

**v0.11.0 — Second Operator-Aloneness Repair Release** — published to npm as `@mcptoolshop/research-os@0.11.0`, 2026-05-15. v0.11.0 closes the v0.2 operator-aloneness gate failure conditions (`operator_aloneness_dst_v0.2`, PASS_WITH_CONDITIONS not authorization-grade on 2026-05-15) through a 4-slice repair arc covering 5 named findings. **R-007** (scope/boundary repair alignment): `claim repair-scope --auto` now fills BOTH `scope` AND `not` when both are null on a substantive claim at repair time — closes the v0.2 stuck-loop where the v0.10 R-001 close filled only `scope` and `claim triage` re-classified the repaired claims as `needs_scope_repair`. Templated boundary mirrors the scope template's degradation shape. Append-only ledger now records `applied_not` alongside `applied_scope`. **R-008** (discover hallucinated URL defense): `discover run` now fetches each candidate URL's `<title>` (bounded: 64KB body, 5s timeout, 4-way concurrency) and computes deterministic keyword overlap against the discover query. Each candidate gains a `relevance` block (`verified | unverified | topic_mismatch`); `approve --top N` quarantines `topic_mismatch`; operator override via `approve --candidate <id>`. Closes the v0.2 case where `llm-heuristic` returned 3 real PMC URLs pointing to entirely unrelated cancer/biochem/HIV-lymphoma papers. **R-009** (extractor identity guard): new source-card severity `source_identity_mismatch` (HARD FAIL) when extractor-emitted `card.title` disagrees with fetched HTML `<title>`. Closes the v0.2 "rats and clonidine" confabulation case. Reuses R-008's overlap helper; override via `clear_severities[]`. **R-011** (frame critic source-content precheck): new frame-exclusion reason `source_content_mismatch`. Frame critic now computes a source-content signature once per source and runs a deterministic precheck before the LLM critic call; below threshold short-circuits the LLM call and marks `frame_excluded: true`. Closes the v0.2 case where 11 cancer-paper-derived claims with DST-framed text were admitted by the LLM critic. **R-010** (recover MD fallback visibility): new `FALLBACK_CAUSES` closed enum (`tier_timeout | mcp_error | retry_exhausted`) + optional `FallbackTiming { elapsed_ms, budget_ms }` on `prose_error` metadata; recover MD gains "Why the AI advisor fell back" section + top-callout cause summary. Closes the v0.2 invisible-TIER_TIMEOUT-in-JSON-only gap. **Three-layer source-content contamination guard now complete** (R-008 admission + R-009 extraction + R-011 critic) with verified defense-layer independence. **Requires `ollama-intern-mcp@^2.4.0`** (unchanged from v0.8.0). 1448/1448 vitest passing (1344 → 1448, +104 tests across the arc). **All four frozen packs verify-pack byte-identically against v0.3.3 baselines** (eleventh consecutive release). **Not a v1 release. Not a v0.3 operator-aloneness gate verdict** — v0.3 runs against this npm version in a separate session. Admissibility doctrine work is gated on v0.3 PASS. See [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md) and [CHANGELOG.md](CHANGELOG.md).

**v0.10.0 — Operator-Aloneness Repair Release** — published to npm as `@mcptoolshop/research-os@0.10.0`, 2026-05-15. v0.10.0 closes the v0.1 operator-aloneness gate failure conditions (`operator_aloneness_dst_v0.1`, FAIL on 2026-05-15) through a 4-slice repair arc. **R-001** (`research-os claim repair-scope <section> [--auto | --interactive]`): new CLI to fix claims whose `scope` field arrived `null` from extraction; append-only `evidence/claim-scope-repairs.jsonl` ledger; new `repair_claim_scope` action in `RECOVERY_ACTIONS` (closed enum grows 7 → 8); advisor surfaces it as rank-1 on `accepted_claim_floor` when ≥3 claims are in `needs_repair_claims`. **R-002** (recovery routing): the diagnose layer now reads `gate.json:blocking_reasons[]` as the authoritative routing surface before falling back to the legacy `failures[].check` lookup — gate-blocking signals win over downstream signals like `source_card_classification_gap`. **R-003 + R-005** (source-card audit hardening, paired): new severities `bot_check_or_captcha_detected` (HARD FAIL — compound signal: markers + body-shape) and `extraction_suspect_word_count_mismatch` (WARN AND QUARANTINE — body ≤200 words AND extracted ≥800 words AND ratio ≥4). Operator override via new `clear_severities[]` field on the v0.4 override-ledger schema. Optional `audit.severity_thresholds` block in `research.yaml` for per-pack tuning. **R-004** (honest `gather_outcome`): 5-value enum on `FetchReceipt` (`ok | fetch_failed | extraction_skipped | extraction_failed | bot_check_detected`); the v0.1 confused phrase `"Failed (ok HTTP 200)"` is gone. See [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md) and [CHANGELOG.md](CHANGELOG.md).

**v0.9.0 — Product Artifact Arc** — published to npm as `@mcptoolshop/research-os@0.9.0`, 2026-05-14. v0.9.0 turns the v0.8 evidence spine into operator-useful artifacts. Section-level prose synthesis (`research-os synth section <id>`) produces readable Markdown with paragraph-level support bundles pointing to accepted claims. Partial-pack synthesis (`research-os synth pack --partial`) consumes section prose (never raw claims) and discloses excluded sections with structured reasons; a deterministic bundle planner preselects required cross-section support when ≥2 sections are included. Lawful recovery advisor (`research-os recover pack`) produces operator guidance for blocked sections using a four-layer architecture — deterministic diagnosis + lawful action graph + AI advice + verifier — with three advisor paths (`ai_with_verifier_pass` / `ai_with_retry_pass` / `deterministic_fallback`) and closed enums for nine failure shapes and seven recovery actions. Recovery guidance is embedded in `partial-pack-synthesis.{md,json}` under each excluded section via a compact projection from the canonical recovery object — single source of truth between standalone and embedded surfaces; a discriminated-union `recovery_unavailable` state surfaces engine-failure cases explicitly (no silent skips). Freeze and publish semantics are unchanged: readable partial artifacts do not make an incomplete pack freezable or publishable. `accepted_claim_floor` remains unwaiveable; the recovery advisor refuses to recommend `apply_waiver` for unwaiveable failures. **Requires `ollama-intern-mcp@^2.4.0`** (unchanged from v0.8.0). 1266/1266 vitest passing (1013 → 1266, +253 tests across the arc). **All four frozen packs verify-pack byte-identically against v0.3.3 baselines** (sixth consecutive release). **Not a v1 release.** v0.9.0 makes the artifact layer real; v1 readiness, fresh-pack operator-aloneness, a trusted reviewer model, and a cloud-baseline win claim are explicitly not shipped. See [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md) and [CHANGELOG.md](CHANGELOG.md).

**v0.8.0 — Architecture Recovery + Frame-Bound Topicality** — published to npm as `@mcptoolshop/research-os@0.8.0`, 2026-05-12. v0.8.0 is an architecture recovery release: research-os now uses `ollama-intern-mcp@^2.4.0` as the local evidence-worker substrate for claim extraction (previously the README declared the dependency but the code had internal direct-Ollama stubs bypassing it since the v0.1 scaffold — v0.8.0 closes that drift). Adds: MCP client substrate (`OLLAMA_INTERN_MCP_BIN` env + PATH discovery + StdioClientTransport lifecycle); per-claim section-evidence critic via `ollama_extract` with 4-label schema (`supports_section` / `off_topic` / `background_only` / `source_chrome`); new `ReviewDecision` `frame_excluded` (review skips LLM for excluded claims, emits synthetic ClaimReview); `ClaimSchema` gains `frame_excluded` + `frame_exclusion_reason` (4-value enum including `critic_unavailable` for system-state failures) + `frame_exclusion_rationale`; section-scoped evidence synthesis via `synth section <id>` for gate-eligible sections in repair-required packs (evidence-citation index — claim ID → assertion → evidence excerpt → source URL — NOT narrative prose); gate honors source-card override ledger via `getEffectivePublisher` / `getEffectiveSourceType` (absorbed v0.7.1 target); `DEFAULT_WINDOW_CHARS` default 5000 → 3000 (sized for hermes3:8b at 8K workhorse context under `dev-rtx5080` profile); soft-fail policy on critic call inverted (any of 5 failure modes — transport / parse / invalid label / empty rationale / timeout — defaults to `frame_excluded: true` with `critic_unavailable` reason, not admission); promotion semantics: `frame_excluded` claims do not block section promotion; cowork handoff surfaces `frame_excluded` as own bucket separate from accepted / repair / rejected. **Requires `ollama-intern-mcp@^2.4.0`**. 1013/1013 vitest passing (901 → 1013, +112 tests). **All four frozen packs verify-pack byte-identically against v0.3.3 baselines.** **Not a v1 release** — v1 readiness work continues; see [`docs/roadmap.md`](docs/roadmap.md). See [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md) and [CHANGELOG.md](CHANGELOG.md).

**v0.7.0 — Dogfood Swarm Hardening** — published to npm as `@mcptoolshop/research-os@0.7.0`, 2026-05-11. A four-stage dogfood swarm (bug/security, proactive resilience, operator humanization, presentation polish) ran against the v0.6.0 tree. v0.7.0 ships the hardening: safer gather (per-URL try/catch + per-exception flush preserve in-flight source IDs on partial failure); resilient indexer (per-record / per-file / per-section skip-and-warn on malformed JSONL); structured recovery errors (12 ResearchOSError subclasses with handbook pointers); progress feedback (`--no-progress` / `--progress` flags with TTY auto-detect across review / gather / contradict-map / pack-publish); operator-facing actionability fixes (`pack publish --force` canonical destructive-replace sentence anchored across 8 surfaces with regression test; `IndexNotBuiltError` command-text typo fixed and command-text registry test added; per-error handbook pointer retrofit on 12 ResearchOSError subclasses); supply-chain hygiene (CI action SHA-pinning + `permissions: contents: read` default-deny; Dependabot `/site` + `github-actions` ecosystem coverage); two new handbook pages (`recovery.md`, `known-limitations.md`); presentation polish (canonical sentence regression, sidebar reorder, `:::caution` callouts on destructive actions). 901/901 vitest passing (713 → 901, +188 tests). **All four frozen packs verify-pack byte-identically against v0.3.3 baselines.** **Not a v1 release** — v1 readiness work continues; see [`docs/roadmap.md`](docs/roadmap.md) and [`docs/dogfood-swarm-proof.md`](docs/dogfood-swarm-proof.md). See [`docs/release-notes/v0.7.0.md`](docs/release-notes/v0.7.0.md) and [CHANGELOG.md](CHANGELOG.md).

**v0.6.0** — published to npm as `@mcptoolshop/research-os@0.6.0`, 2026-05-10. v0.6.0 closes Experiment 6 with reviewer-trust evidence: research-os can now produce a reproducible, attributable canonical-model baseline. Ships: deterministic reviewer options on the production review path (`review_profiles.<name>.reviewer_options` in `research.yaml`); gate schema backward compatibility for pre-v0.3.3 frozen artifacts (F-53); review output discloses sampling conditions directly on `review.json` and `review.md` (F-54); canonical deterministic aggregate receipt committed (`hermes-two-pass-deterministic`, `temperature:0, seed:7`). **No trusted baseline admitted.** `hermes-two-pass-deterministic=failed` (structural model-capability gap in decision vocabulary, not variance). **Hermes is not promoted to `trusted_baseline`.** The win is the mechanism, not a passing receipt. No gate, freeze, or synthesis-law changes. All four frozen packs verify-pack byte-identically. 713/713 vitest passing. See [CHANGELOG.md](CHANGELOG.md) and [`docs/experiment-6-proof.md`](docs/experiment-6-proof.md).

**v0.5.0** — published to npm as `@mcptoolshop/research-os@0.5.0`, 2026-05-10. v0.5.0 makes reviewer calibration durable. A reviewer profile is not trusted because it ran once; it earns a status through structured seeded-failure receipts and multi-run aggregation. Ships: structured calibration receipt schema (`seeded-v1.{json,md}`, Zod-validated, four status labels); multi-run harness (`--runs <n>`, per-run isolation, median-based PASS/FAIL bars, recurring-failure demotion); architecture-aware decision-vocab bar; pack-relative receipt lookup in `review-promote`. **No trusted baseline admitted:** `hermes-two-pass=failed` (aggregate, 3 runs), `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`. research-os can now refuse to trust a reviewer profile when repeated seeded failures do not support trust. **No gate, freeze, or synthesis-law changes. All four frozen packs verify-pack byte-identically.** 671/671 vitest passing. See [CHANGELOG.md](CHANGELOG.md).

**v0.4.0** — published to npm as `@mcptoolshop/research-os@0.4.0`, 2026-05-10. v0.4.0 makes source identity durable. Deterministic source-type rules handle the repeatable majority, override ledgers preserve operator corrections across re-gather, and `source-card audit` replaces scratch-script drift checks with a first-class CLI surface. Ships: centralized source-type classifier (Component B — `classifySourceType`, 11 canonical vendors, `source-type-rules.json`); source-card override ledger (Component A — `source-card-overrides.jsonl`, `validate` + `list` subcommands); and source-card audit CLI (Component D — `research-os source-card audit --pack <dir>`, 7 finding kinds, JSON + Markdown artifacts, `--apply --from` apply path). F-46 cosmetic fix: pack manifests now stamp the live binary version rather than the version frozen into `research.yaml` at pack-init. **No gate, freeze, or synthesis-law changes. All four existing frozen packs verify-pack byte-identically.** 620/620 vitest passing. See [CHANGELOG.md](CHANGELOG.md) and the [source-card audit handbook page](https://mcp-tool-shop-org.github.io/research-os/handbook/source-card-audit/).

**v0.3.3** — published to npm as `@mcptoolshop/research-os@0.3.3`, 2026-05-10. Ships gate-semantics clarity earned by Pack-3 (Godot export/runtime durability, Experiment 3 pack #3 of 3). Gate output now carries section-scoped publisher + primary counts alongside pack-wide counts (F-43); `no_source_cluster_monopoly` reworded from WARN to informational diagnostic (F-41). **Pass/fail behavior unchanged; existing frozen packs verify-pack byte-identically.** 570/570 vitest passing. See [CHANGELOG.md](CHANGELOG.md) and [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**v0.3.2** — published to npm as `@mcptoolshop/research-os@0.3.2`, 2026-05-09. Ships normalized accepted-claim accounting for `pack publish` admission. The strict equality check between `claim-reviews.jsonl` and `pack-audit.json::accepted_claims` is replaced with an effective-set comparison — accepted claims are unique `claim_id`s whose latest canonical review decision is `accepted_for_synthesis` (latest-decision-wins per `claim_id`). Frozen packs whose legacy audit count differs from the effective set now admit with a warning rather than refusing; the legacy audit file is preserved verbatim (Law 15) while the archive manifest reflects the normalized count. Refusal stays hard for phantom claim_ids, incompatible duplicate decisions, and non-synthesis-eligible gates. Earned by Experiment 3 XRPL pack Session K — pack publish refused on a real closure-ledger seam disagreement (Section 07 had 24 raw `accepted_for_synthesis` rows but only 19 unique `claim_id`s due to overlapping reviewer windows). 558/558 vitest passing. See [CHANGELOG.md](CHANGELOG.md) and [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.3.1** — published to npm as `@mcptoolshop/research-os@0.3.1`, 2026-05-09. Ships section-scoped source-floor waivers (`primary_source_waiver.section_waivers[]`) plus reviewer-side acknowledgement so a waived section-wide `source_cluster_monopoly` finding becomes a visible caveat rather than auto-routing all claims to `needs_source_repair`. Earned by Experiment 3 XRPL pack Session 2 — canonical-protocol sections (single-foundation chains, walled-garden API specs, standards-body docs) inverted the assumption that publisher diversity is a proxy for truth quality. 540/540 vitest passing then. See [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**Section-scoped source waivers** — Use them when publisher diversity is structurally incompatible with the section's truth source, not when a section merely failed to find enough sources. Schema-enforced `reason` + non-empty `compensating_controls[]`. Pack policy `primary_source_waiver_allowed: false` blocks both pack-level and section-scoped waivers. The pre-v0.3.1 pack-level `min_independent_publishers: 0` workaround is now deprecated; existing frozen packs remain valid under their existing receipts. See [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) and the [research-packs operator playbook](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md).

**v0.3.0** — published 2026-05-09. Shipped the `--detector <auto|heuristic|ollama-intern>` flag on `contradict map` (F-09 chain-blocker fix from Experiment 3 Session 1, XRPL pack). 527/527 vitest then. Detector selection is now an explicit operator choice instead of a state-dependent env-var dance; mode is announced visibly on every run. See [`docs/contradict-map.md`](docs/contradict-map.md).

**v0.2.0** — published 2026-05-09. Shipped `research-os pack publish` (Experiment 2) and the Pattern 2 readiness predicate fix. 515/515 vitest passing then. See [CHANGELOG.md](CHANGELOG.md). Frozen packs export to the canonical `research-packs` archive with a single command; admission contract is enforced by code, not checklist. See [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.1.0** — dogfood pack frozen 2026-05-08. The pack at `research-os-packs/research-os-spec/` (sibling repo) reached freeze with 296 accepted claims across 8 sections, 17 dispositioned, 30 operator-overridden, 0 active repair blockers, 0 unresolved contradictions, all gates `synthesis_eligible=true`. Sixteen load-bearing laws cumulative. See [`docs/dogfood-proof.md`](docs/dogfood-proof.md) for the seven findings and freeze receipt fingerprints.

**research-packs archive monorepo** — live at [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) with four packages: `research-os-self-dogfood` (v0.1 dogfood backfill, 296 accepted claims, 8 sections), `comfyui-workflow-durability` (Experiment 1, 302 accepted claims, 8 sections), `xrpl-creator-token-durability` (Experiment 3 pack #2), and `godot-export-runtime-durability` (Experiment 3 pack #3). All packages PASS `verify-pack.mjs`.

**v1 Experiment 1 (ComfyUI workflow durability)** — CLOSED 2026-05-09. All 8 sections at Terminal A, pack frozen, archive live. See [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) and [`docs/roadmap.md`](docs/roadmap.md).

### What research-os is not (and v0.12.1 does not claim to be)

- Not operator-aloneness-proven on fresh packs. v0.12.0 closed the v0.3 gate findings (defense-grade aloneness PROVEN; coverage-grade aloneness NOT yet — the doctrine ratchet earned at v0.3); the v0.4 gate against v0.12.0 returned PASS_WITH_CONDITIONS (NOT authorization-grade) — defense floor preserved, coverage-grade SUBSTANTIVELY PROVEN at section-brief level, single failure mode at finalization. v0.12.1 patches that single failure mode (R-018). The v0.4 rerun against this npm release fires in a separate session and is the prerequisite for finalization-grade.
- Not battle-tested by external users beyond the dogfood arcs and the four operator-aloneness gate runs. Six dogfood experiments closed — one self-referential, five external-domain (ComfyUI, XRPL, Godot, reviewer-calibration, deterministic-reviewer) — plus v0.1 / v0.2 / v0.3 / v0.4 operator-aloneness gate runs surfacing 18 named findings (R-001 through R-005 closed in v0.10.0, R-007 through R-011 closed in v0.11.0, R-012 through R-017 closed in v0.12.0, R-018 closed in v0.12.1). External operator usage at scale remains future work.
- Not a full-pack synthesis writer. v0.12.1 inherits v0.9's section-scope (`synth section`) and partial-pack-scope (`synth pack --partial`) prose surfaces, each with explicit pack-readiness disclosure. Full-pack synthesis still requires a `synthesis_ready` pack and human (or Cowork) authoring against accepted claim IDs via `synth workspace`.
- Not an endorsement of any reviewer model. v0.12.1 does not ship a `trusted_baseline` reviewer profile by default; calibration receipts are evidence, not endorsement. The existing v0.6.0 calibration receipts predate the v0.8.0 MCP architecture and have not been re-baselined under the MCP path. See the [reviewer calibration handbook page](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).
- Not free of historical artifacts in frozen packs. Pre-v0.4 frozen packs carry `research_os_version: '0.1.0'` due to a pre-v0.4 hardcoded scaffold constant; the fix landed in v0.4.0 but earlier frozen packs are immutable under Law 15 (see [`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)).
- Not provenance-attested on npm. Sigstore provenance attestation is deferred to a future release; verify v0.12.1 npm packages via package-shasum and the GitHub release commit.
- Not a cloud-baseline win. The product proof at `local-first-vs-cloud-research/` from v0.7.x identified cloud's advantages on readability and operator burden; v0.12.1 does not claim those have been overcome.

### Known limitations

v0.12.1 ships with three operator-visible known limitations carried over from prior releases. Each is documented in the [handbook known-limitations page](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/) and in [CHANGELOG.md](CHANGELOG.md). None block release; all have a defined recovery or mitigation path.

- **B-E-001 — pre-v0.4 frozen-pack version stamp is a historical artifact.** Frozen packs published under v0.3.3 through v0.6.0 carry `research_os_version: "0.1.0"` in `pack.manifest.json` and `pack/research.yaml` due to a pre-v0.4 hardcoded scaffold constant. The fix landed in v0.4.0 (scaffold now imports the live `RESEARCH_OS_VERSION`); earlier frozen packs are immutable under Law 15. Audit JSONs inside affected packs already carry their contemporary versions.
- **B-E-004 — npm provenance attestation is deferred to a future release.** The v0.12.1 npm tarball verifies via package-shasum only. Migrating the publish flow to a CI workflow with sigstore OIDC conflicts with the translation-before-publish discipline (TranslateGemma 12B runs locally); the migration is planned for a future release. Verify v0.12.1 npm packages via package-shasum and the GitHub release commit.
- **B-A-003 — indexer schema-version migration is documented, not enforced.** v0.12.1 ships a write-side `SCHEMA_VERSION` integer but no read-side migration runner. On a documented `SCHEMA_VERSION` bump, delete `.research-os/index.sqlite` and rerun `research-os index build --all`. The pack itself is unaffected — the indexer is an acceleration layer over evidence + claims (Law 8); rebuilding is idempotent.

**No `trusted_baseline` reviewer profile is admitted at v0.12.1.** This is an intentional trust posture, not a gap: calibration receipts in the repo (`hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`) record the evidence. Trust is earned through repeated seeded-failure recall, not assumed. These receipts predate the v0.8.0 MCP architecture and have not been re-baselined under the MCP path.

## Roadmap to v1.0

v1.0 is an earned state, not a release date. All six dogfood experiments closed (Exp1–Exp6, 2026-05-08 through 2026-05-11), each producing a frozen research-pack admitted to [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs). The arc earned v0.2.0 `research-os pack publish` + Pattern 2 (Experiment 2), v0.3.0 `--detector` flag (F-09), v0.3.1 section-scoped waivers (F-10/F-11), v0.3.2 normalized accepted-claim accounting (F-36), v0.3.3 gate-semantics clarity (F-43/F-41), v0.4.0 source-truth discipline (F-27/F-47/F-46), v0.5.0 reviewer calibration as durable trust contract (F-48/F-49/F-50), and v0.6.0 deterministic reviewer baseline (F-53/F-54). v1.0 release preparation is in progress via a multi-stage health/polish swarm; the architecture lock holds throughout. Full plan in [`docs/roadmap.md`](docs/roadmap.md).

## License

MIT
