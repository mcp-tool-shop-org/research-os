<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/research-os/readme.png" alt="research-os" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/research-os/releases/tag/v0.3.0"><img src="https://img.shields.io/badge/version-0.3.0-blue" alt="version 0.3.0"></a>
  <a href="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-brightgreen" alt="Node ≥20">
  <a href="https://mcp-tool-shop-org.github.io/research-os/handbook/"><img src="https://img.shields.io/badge/handbook-live-purple" alt="Handbook"></a>
</p>

# research-os

Local-first CLI that turns an open-ended topic into a gated **research-pack** — a structured repo where Claude, Cowork, or a swarm can work for hours without hallucinating or flattening the investigation.

## What it is

`research-os` is the control plane between "I want to research X" and a frozen, claim-traceable evidence base. It separates discovery leads from fetch evidence, raw extraction from triaged claims, contradiction detection from contradiction resolution, and review decisions from synthesis dispositions. Every step writes to an append-only ledger; every readiness verdict is computed from those ledgers, not asserted.

It is not a report generator. It is not an LLM-orchestration framework. It does not write your synthesis for you. It enforces the conditions under which synthesis can begin.

Frozen packs are archived in [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) — live, with two day-one packages. See [`docs/roadmap.md`](docs/roadmap.md) for the v1.0 path.

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

**For a real worked example**, see the dogfood pack at `research-os-packs/research-os-spec/` — every artifact, every receipt, every disposition, every freeze fingerprint, all on disk in append-only ledgers. That pack is what produced `docs/dogfood-proof.md`.

**Requires [ollama-intern-mcp](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) running locally** for LLM extraction, triage, review, and discovery. Default model is `hermes3:8b`; override with `OLLAMA_INTERN_MODEL=<model>`. Set `OLLAMA_HOST` if Ollama is not on the default `localhost:11434`.

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

## Status

**v0.3.0** — published to npm as `@mcptoolshop/research-os@0.3.0`, 2026-05-09. Ships the `--detector <auto|heuristic|ollama-intern>` flag on `contradict map` (F-09 chain-blocker fix from Experiment 3 Session 1, XRPL pack). 527/527 vitest passing. See [CHANGELOG.md](CHANGELOG.md) and [`docs/contradict-map.md`](docs/contradict-map.md).

**`contradict map --detector`** — Detector selection is now an explicit operator choice instead of a state-dependent env-var dance. `auto` (default) preserves prior behavior; `heuristic` always works without LLM and completes quickly on narrow-topic documentation sections; `ollama-intern` requires the configured model and exits visibly if unavailable. Mode is announced visibly on every run. The earlier "clear `OLLAMA_INTERN_MODEL` to force heuristic" workaround is superseded by `--detector heuristic` as the canonical operator surface; see the [research-packs operator playbook](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md) and the [handbook contradict-map page](https://mcp-tool-shop-org.github.io/research-os/handbook/contradict-map/).

**v0.2.0** — published 2026-05-09. Shipped `research-os pack publish` (Experiment 2) and the Pattern 2 readiness predicate fix. 515/515 vitest passing then. See [CHANGELOG.md](CHANGELOG.md). Frozen packs export to the canonical `research-packs` archive with a single command; admission contract is enforced by code, not checklist. See [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.1.0** — dogfood pack frozen 2026-05-08. The pack at `research-os-packs/research-os-spec/` (sibling repo) reached freeze with 296 accepted claims across 8 sections, 17 dispositioned, 30 operator-overridden, 0 active repair blockers, 0 unresolved contradictions, all gates `synthesis_eligible=true`. Sixteen load-bearing laws cumulative. See [`docs/dogfood-proof.md`](docs/dogfood-proof.md) for the seven findings and freeze receipt fingerprints.

**research-packs archive monorepo** — live at [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) with two day-one packages. `comfyui-workflow-durability` (Experiment 1, 302 accepted claims, 8 sections) and `research-os-self-dogfood` (v0.1 dogfood backfill, 296 accepted claims, 8 sections). Both packages PASS `verify-pack.mjs`.

**v1 Experiment 1 (ComfyUI workflow durability)** — CLOSED 2026-05-09. All 8 sections at Terminal A, pack frozen, archive live. See [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) and [`docs/roadmap.md`](docs/roadmap.md).

### What v0.3 is not

- Not battle-tested by external users. Two dogfood arcs have closed — one self-referential, one external-domain — and Experiment 3 (API stability under external pressure) is in progress: pack #1 of 3 (XRPL creator-token durability) earned the v0.3.0 `--detector` flag. Two more external-domain packs required for Experiment 3 closure.
- Not a synthesis writer. The `synth workspace` command generates the structured workspace; humans (or Cowork) write the prose against accepted claim IDs.
- Not API-stable under semver. v1.0.0 is an earned state, not a calendar date — see [`docs/roadmap.md`](docs/roadmap.md) for the six experiments that close the gap.

### Known limitations

- **Extractor provenance is not visible at the gate seam.** A section can pass the accepted-claim floor while relying on heuristic-fallback claims when the calibrated extractor (Ollama with the configured model) is unavailable. Recorded as Experiment 4 in the roadmap; future hardening will report accepted claims by extractor and require the floor's worth of accepted claims from the calibrated path.
- **Reviewer model selection beyond the calibrated `hermes-two-pass` baseline is unresolved.** The dogfood arc validated one reviewer config; alternative models need their own seeded-failure recall calibration before they can be trusted. Experiment 5 in the roadmap.
- **The v0.1 self-dogfood pack used `mistral-nemo:12b` for extraction (canonical default is `hermes3:8b`).** `hermes3:8b` was not available on this rig during the v0.1 arc. The substitution disclosure stands until a hermes3-based receipt is produced — Experiment 6 in the roadmap. For operators on rigs without `hermes3:8b`, set `OLLAMA_INTERN_MODEL` to an available model; operator-pre-staged URLs and query-precision discipline (see handbook) mitigate discovery hallucination on ambiguous topics.

## Roadmap to v1.0

v1.0 is an earned state, not a release date. Six open experiments stand between v0.1 and v1.0 — non-self-referential dogfood (currently in progress as the ComfyUI workflow durability pack), a `research-os pack publish` command that automates export into the canonical `research-packs` monorepo (Experiment 2, scoped behind Experiment 1's manual closeout), API stability under external pressure, closing the extractor-provenance gap, generalizing reviewer calibration beyond `hermes-two-pass`, and a clean baseline run on `hermes3:8b`. Experiment 1 is not done at pack freeze — it closes when the frozen pack ships as the first package in the `research-packs` monorepo alongside the v0.1 self-dogfood backfill. Full plan in [`docs/roadmap.md`](docs/roadmap.md). The architecture lock holds throughout; v1.0 deepens what v0.1 proved rather than reopening it.

## License

MIT
