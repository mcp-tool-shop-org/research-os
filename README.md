<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/research-os/readme.png" alt="research-os" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/research-os/releases/tag/v0.7.0"><img src="https://img.shields.io/badge/version-0.7.0-blue" alt="version 0.7.0"></a>
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

## New in v0.8.0

**v0.8.0 — architecture recovery + frame-bound topicality enforcement.** research-os now consumes its declared substrate `ollama-intern-mcp@^2.4.0` over MCP (previously bypassed via internal direct-Ollama stubs). An extraction-time critic via `ollama_extract` enforces section topicality: claims judged off-topic for the section purpose are preserved with `frame_excluded: true` and a structured reason, kept out of synthesis evidence but visible to operators. Section-level synthesis produces an evidence-citation brief (claim ID → assertion → evidence excerpt → source URL), not narrative prose; pack-level narrative synthesis remains gated on whole-pack `synthesis_ready` state. See [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md) and [CHANGELOG.md](CHANGELOG.md).

## Status

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

### What research-os is not (and v0.7.0 does not claim to be)

- Not battle-tested by external users beyond the dogfood arcs. Six dogfood experiments closed — one self-referential, five external-domain (ComfyUI, XRPL, Godot, reviewer-calibration, deterministic-reviewer) — but external operator usage at scale remains future work.
- Not a synthesis writer. The `synth workspace` command generates the structured workspace; humans (or Cowork) write the prose against accepted claim IDs.
- Not an endorsement of any reviewer model. v1.0 does not ship a `trusted_baseline` reviewer profile by default; calibration receipts are evidence, not endorsement. See the [reviewer calibration handbook page](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).
- Not free of historical artifacts in frozen packs. Pre-v1.0 frozen packs carry `research_os_version: '0.1.0'` due to a pre-v0.4 scaffold stamp; the fix landed but historical packs are immutable under Law 15 (see [`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)).
- Not provenance-attested on npm. Sigstore provenance attestation is deferred to v1.x; verify v1.0 npm packages via package-shasum and the GitHub release commit.

### Known limitations

v1.0 ships with three operator-visible known limitations. Each is documented in the [handbook known-limitations page](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/) and in [CHANGELOG.md](CHANGELOG.md). None block release; all have a defined recovery or mitigation path.

- **B-E-001 — pre-v1.0 frozen-pack version stamp is a historical artifact.** Frozen packs published under v0.3.3 through v0.6.0 carry `research_os_version: "0.1.0"` in `pack.manifest.json` and `pack/research.yaml` due to a pre-v0.4 hardcoded scaffold constant. The fix landed in v1.0 (scaffold now imports the live `RESEARCH_OS_VERSION`); existing frozen packs are immutable under Law 15. Audit JSONs inside affected packs already carry their contemporary versions.
- **B-E-004 — npm provenance attestation is deferred to v1.x.** The v1.0 npm tarball verifies via package-shasum only. Migrating the publish flow to a CI workflow with sigstore OIDC conflicts with the translation-before-publish discipline (TranslateGemma 12B runs locally); the migration is planned for v1.x. Verify v1.0 npm packages via package-shasum and the GitHub release commit.
- **B-A-003 — indexer schema-version migration is documented, not enforced.** v1.0 ships a write-side `SCHEMA_VERSION` integer but no read-side migration runner. On a documented `SCHEMA_VERSION` bump, delete `.research-os/index.sqlite` and rerun `research-os index build --all`. The pack itself is unaffected — the indexer is an acceleration layer over evidence + claims (Law 8); rebuilding is idempotent.

**No `trusted_baseline` reviewer profile is admitted at v1.0.** This is an intentional trust posture, not a gap: calibration receipts in the repo (`hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`) record the evidence. Trust is earned through repeated seeded-failure recall, not assumed.

## Roadmap to v1.0

v1.0 is an earned state, not a release date. All six dogfood experiments closed (Exp1–Exp6, 2026-05-08 through 2026-05-11), each producing a frozen research-pack admitted to [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs). The arc earned v0.2.0 `research-os pack publish` + Pattern 2 (Experiment 2), v0.3.0 `--detector` flag (F-09), v0.3.1 section-scoped waivers (F-10/F-11), v0.3.2 normalized accepted-claim accounting (F-36), v0.3.3 gate-semantics clarity (F-43/F-41), v0.4.0 source-truth discipline (F-27/F-47/F-46), v0.5.0 reviewer calibration as durable trust contract (F-48/F-49/F-50), and v0.6.0 deterministic reviewer baseline (F-53/F-54). v1.0 release preparation is in progress via a multi-stage health/polish swarm; the architecture lock holds throughout. Full plan in [`docs/roadmap.md`](docs/roadmap.md).

## License

MIT
