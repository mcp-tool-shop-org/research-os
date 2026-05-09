# Experiment 1 Proof — ComfyUI Workflow Durability

**Topic:** What makes ComfyUI workflows durable over time, and what should a local-first workflow control plane track to keep them runnable?

**Arc:** v1 Experiment 1 (first non-self-referential dogfood). 11 sessions, 8 sections, a domain with no vocabulary overlap with `research-os` itself.

**Public archive:** [`mcp-tool-shop-org/research-packs/packages/comfyui-workflow-durability/`](https://github.com/mcp-tool-shop-org/research-packs/tree/main/packages/comfyui-workflow-durability/)

---

## The answer

ComfyUI workflow durability depends on a surrounding state bundle, not on the workflow JSON file alone. A runnable workflow requires six elements to be captured and tracked together:

1. **ComfyUI core version** — releases every ~2 weeks; a workflow drifts from the ambient installation within days without a version lock.
2. **Python / PyTorch / CUDA environment** — the full triple (Python version + PyTorch version + CUDA/ROCm build variant) must match; some PyTorch features only exist on newer versions.
3. **Custom-node dependency state** — not just node names. State is a `(repository URL, Git commit hash, pip dependency state)` tuple per installed node. Non-Git nodes fall outside the snapshot mechanism entirely.
4. **Model checkpoint identity** — filename alone is insufficient; the file hash must be recorded to detect corruption or silent replacement.
5. **Workflow / API schema format** — the ComfyUI workflow JSON follows a versioned JSON Schema (`v0.4` is the current reference); the schema version must be stored with the JSON to detect loader incompatibilities.
6. **Distribution metadata** — workflow sharing in the community loses the surrounding state bundle systematically; three confirmed gaps exist in current tooling (broken model download path, incomplete snapshot coverage for non-Git nodes, batch-image metadata corruption).

The claim "save the JSON and you're durable" is **not supported** by the evidence base.

---

## The seven strongest findings

1. **GitHub UI HTML is not a reliable evidence source.** GitHub release pages and issue list pages fetch at HTTP 200 (~600 KB) but deliver JavaScript-rendered chrome. Session 1 of Section 06 produced structurally grounded but semantically invalid claims ("desktop release includes GitHub Copilot"). The chain held — the gate correctly blocked Section 06. The fix was source-swapping to text-accessible official materials. *No code change; operating-mode discipline.*

2. **Community gallery tier is structurally inaccessible under v0.1 fetch.** The three primary community workflow gallery URLs were all inaccessible: one payment-walled (HTTP 402), two JavaScript CSR shells with no extractable prose. This is the strongest Experiment 1 finding — the section most directly about community distribution patterns could not reach the community distribution tier. The evidence gap is structural, not a gather failure.

3. **LLM discover had 100% hallucination rate for this topic.** All 8 URLs proposed by `research-os discover run` in Section 07 were wrong repos, wrong orgs, or invented paths. Operator-staged URLs (verified against `docs.comfy.org` and `api.github.com` before gather) were the reliable path for all 8 sections.

4. **The ollama-intern contradiction detector never completed in this arc.** 5/5 consecutive stalls on narrow-topic documentation sections (Sections 01–05). The Jaccard prefilter at 0.25 passes most pairs when all claims share tokens like "workflow," "json," "schema." Heuristic fallback (clear `OLLAMA_INTERN_MODEL` before `contradict map`) completed in seconds and found 0 contradictions — correct for sections where claims describe orthogonal aspects of the same phenomenon.

5. **Publisher extraction is non-deterministic.** The same domain (`docs.comfy.org`) returned `publisher: "docs.comfy.org"` in some sessions and `publisher: null` in others, with no stable pattern across 10 sessions. Setting `min_independent_publishers: 0` in pack gate config is the correct workaround for packs where the field cannot be trusted. *(Updated 2026-05-09 for v0.3.1: this pack-level workaround was correct at v0.1 / v0.2 time and remains valid in this pack's frozen receipt. New packs facing structurally single-publisher sections should use the section-scoped waiver pattern shipped in v0.3.1 instead — see [docs/section-scoped-waivers.md](section-scoped-waivers.md).)*

6. **Pattern 2 was completed mid-arc by the calibrated reviewer.** The v0.1 dogfood arc used the heuristic reviewer exclusively (output: only `accepted_for_synthesis` and `rejected`). The calibrated hermes3:8b two-pass reviewer produces `needs_scope_repair`, `needs_source_repair`, and `needs_human_review` decisions. The existing `determineMode` and `buildReadinessSummary` predicates counted these as active blockers instead of settled state, causing both to report `repair_required` on a synthesis-ready pack. Fix: commit `22b5dba` — active-blocker semantics in both predicates. Tests: 463 → 467.

7. **`llms.txt` aggregate sources produce expected source_dominance (not a defect).** `docs.comfy.org/llms.txt` contributed 51% of extracted candidates in Section 06. The triage `parked_overdense_source` cap handled this correctly. The signal to surface at the discovery layer: "this is a full-docs aggregate; expect dominance and rely on triage capping."

---

## Pattern 2 completion story

Pattern 2 (readiness measures active blockers, not candidate-set completeness) was earned in the v0.1 dogfood arc and encoded in the architecture-lock memo. The ComfyUI arc is where it was *completed*.

The v0.1 dogfood pack used the heuristic reviewer. Heuristic output is binary: `accepted_for_synthesis` or `rejected`. With binary decisions, `repair_claim_ids.length === 0` is equivalent to active-blocker semantics — there are no intermediate states.

When the calibrated reviewer's full decision vocabulary is used, 182 claims in the ComfyUI pack received intermediate decisions (`needs_scope_repair`, `needs_source_repair`, `needs_human_review`). These are settled state: review ran, the gate passed with sufficient accepted claims, synthesis uses only the `accepted_for_synthesis` set. But the stale predicates counted all 182 as repair blockers, making a synthesis-ready pack appear unrepairable.

The fix replaced two stale predicates:

- `src/cowork/derive.ts:determineMode` — was: `repair_claim_ids.length === 0`; now: `active_blockers.length === 0`
- `src/audit/aggregate.ts:buildReadinessSummary` — was: `r.repair_claims === 0`; now: `r.blocking_reasons.length === 0`

Four new tests cover the calibrated-reviewer path explicitly. The heuristic-reviewer regression case (v0.1 dogfood pack behavior) is also covered, confirming the fix does not change v0.1 pack verdicts. Commit `22b5dba` on `origin/master`.

---

## Operating-mode discipline earned by the arc

| Finding | Discipline |
|---------|------------|
| GitHub UI HTML → chrome claims | Use `raw.githubusercontent.com`, `docs.comfy.org`, `api.github.com` |
| `/issues?q=` silently ignores `q=` | Use `/search/issues?q=repo:Owner/Repo+keyword` |
| LLM discover hallucination | Pre-stage URLs via `urls.operator-staged.txt`, bypass discover |
| ollama-intern stall on narrow topics | Clear `OLLAMA_INTERN_MODEL` before `contradict map` |
| `OLLAMA_INTERN_MODEL` not in background processes | Set via `$env:OLLAMA_INTERN_MODEL` in PowerShell before each command |
| Publisher null is non-deterministic | Set `min_independent_publishers: 0`; do not use `publisher: null` as quality signal *(v0.3.1 forward note: prefer section-scoped waivers for new packs — see [docs/section-scoped-waivers.md](section-scoped-waivers.md); the pack-level workaround stays valid for this frozen receipt)* |
| `llms.txt` source_dominance expected | Accept and rely on triage capping |
| Large-page extraction abort (>500 KB) | Avoid single large-page sources; prefer per-page URLs |

Full doctrine in [`mcp-tool-shop-org/research-packs/docs/operator-playbook.md`](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md).

---

## The frozen pack

Pack: `research-os-packs/what-makes-comfyui-workflows-durable-over-time-and-what-shou/` — operating workspace, read-only reference post-freeze.

Public archive: [`packages/comfyui-workflow-durability/`](https://github.com/mcp-tool-shop-org/research-packs/tree/main/packages/comfyui-workflow-durability/) in `mcp-tool-shop-org/research-packs`.

- 302 accepted claims across 8 sections.
- 0 dispositioned claims.
- 182 settled repair claims (settled state — not active blockers; review ran, gate passed, synthesis excludes them).
- 0 active repair blockers.
- Preserved contradiction records: 171 (disclosed and preserved at freeze; closure ledger records every disposition).
- All 8 gates `synthesis_eligible=true` (all 8 carry `gate.source_floor` waiver; all passed the accepted-claim and source-diversity floors).
- `research.yaml.frozen_at: 2026-05-09T08:30:02.276Z`

**Freeze receipt fingerprints** (from `pack/audits/freeze-receipt.json`):

| Artifact | sha256 (first 16 chars) |
|----------|------------------------|
| pack-audit | `bbca495b700cbe24` |
| cowork-handoff | `d41e0475dbdb983a` |
| synthesis/cross-section-map.json | `d2c6b41056fda6b7` |
| synthesis/cross-section-map.md | `a8565adb5e3c6465` |
| synthesis/decision-brief.md | `06b1fa25b4032963` |
| synthesis/working-report.md | `5f43baf9f013a76a` |
| synthesis/final-report.md | `217d9cadc3da3a37` |

Full receipt: [`pack/audits/freeze-receipt.json`](https://github.com/mcp-tool-shop-org/research-packs/blob/main/packages/comfyui-workflow-durability/pack/audits/freeze-receipt.json) — 119 canonical artifact fingerprints, independently verifiable with `node scripts/verify-pack.mjs packages/comfyui-workflow-durability` from the monorepo root.

---

## v0.2 candidate scope earned by the arc

Ten grounded candidates (in recommended implementation order):

1. **Pattern 2 predicate fix release scoping** — v0.1.2 vs fold into v0.2.0; decision pending.
2. **Large-page chunker before extractor LLM calls** — pages >500 KB abort extraction; pre-chunk before LLM calls.
3. **JSON-aware excerpt chunker** — GitHub API JSON sources produce a metadata-fragment first excerpt; treat array elements as separate excerpts.
4. **Publisher derivation / override** — non-deterministic across all source types; derive from URL canonical form or add formal override.
5. **Visible model-fallback warnings** — silent heuristic fallback when `OLLAMA_INTERN_MODEL` is unset or model is not pulled.
6. **Contradiction detector strategy / heuristic default for narrow domains** — ollama-intern stalled on 5/5 consecutive narrow-topic sections; document or enforce heuristic as default for high-overlap corpora.
7. **GitHub API / Search API source guidance** — gather-time hint when `/issues?q=` is used (silently ignored; search API is canonical).
8. **Community-source accessibility strategy** — JS-shell + paywall + stale-URL surfaces; chain has no archive.org or headless-browser fallback.
9. **`research-os pack publish` automation** — Roadmap Experiment 2; automates the manual closeout Experiment 1 ran by hand.
10. **`llms.txt` injection guard at excerpt-ledger seam** — `docs.comfy.org` injects crawler-directive meta-instructions into page content; 16 of 29 heuristic candidates in Section 04 were llms.txt nav meta.

---

## Did the abstraction hold?

Yes, with one completion and one discovery.

**The completion:** Pattern 2 was abstract until Experiment 1 ran a calibrated reviewer. The predicate was written correctly in the architecture-lock memo but was only enforceable after a reviewer with a full decision vocabulary hit the stale code. The fix was mechanical — two predicate replacements — not an architectural change.

**The discovery:** The v0.1 chain's source-accessibility model (HTTP fetch → text extraction) fails at the community-distribution tier of the ComfyUI ecosystem. This was predicted before the arc began; the arc confirmed it with three structural failures on three distinct failure modes (payment wall, JS-CSR shell, stale URL). The abstraction — "fetch truth is the source of record" — held perfectly; what failed was the assumption that the relevant sources were HTTP-text-accessible.

The bundle thesis stands. The chain finds the bundle, not the JSON file, as the unit of workflow durability. The evidence base is claim-traceable. The freeze receipt fingerprints are independently verifiable. Experiment 1 is closed.
