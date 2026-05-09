# Roadmap to v1.0

`research-os` ships at **v0.1.0** because it has been used exactly once: by itself, on itself. That single run earned sixteen load-bearing laws, two integration patterns, and one frozen pack — but it doesn't tell us how the system holds up under everything the world will throw at it.

v1.0 isn't a calendar date. It is an earned state. Six open questions stand between v0.1 and v1.0. Each is a small experiment or research project. Closing them is the fun part.

The order below reflects a natural sequence — prove the chain holds off-self, automate the closeout the first arc revealed by hand, then run more domains through the automation, then tackle the architectural enforcement gaps, then polish the reviewer story, then a clean canonical-model baseline. The numbering is the recommended order, not a hard dependency. Whichever question is most interesting to answer next is the next experiment.

---

## 1. Non-self-referential dogfood

**Status: CLOSED 2026-05-09.** ComfyUI workflow durability pack frozen 2026-05-09T08:30:02.276Z. Public archive at <https://github.com/mcp-tool-shop-org/research-packs> (`packages/comfyui-workflow-durability/`). Proof: [`docs/experiment-1-proof.md`](experiment-1-proof.md). Operator playbook: [`research-packs/docs/operator-playbook.md`](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md). Pattern 2 enforcement completed via commit `22b5dba`.

**The question.** Did the chain hold because it's correct, or because the dogfood pack happened to share vocabulary with `research-os` itself?

**Done looks like.** A pack on a topic with no overlap with `research-os` internals reaches freeze with claim-traceable synthesis. Candidates: a tax-law pack, a clinical-evidence pack, a hardware-design pack, a historical-research pack. The reviewer's seeded-failure recall holds. The gate doesn't gate-block on metadata coincidence. Discovery doesn't hallucinate the topic into the wrong domain at first attempt.

**Likely shape.** Pick one topic deliberately distant from `research-os`'s vocabulary. Run it. See what the chain finds. Whatever breaks is the eighth correction — and the eighth correction earns its own integration pattern note in the architecture-lock memo.

**Why it matters.** Self-referential dogfood is the cheapest validation possible because the writer and the reader speak the same vocabulary. The first non-self-referential pack is where the abstractions either generalize or don't.

**Closeout artifacts (mandatory at freeze, not optional follow-up).** Experiment 1 is not done at freeze of the pack. The canonical archive is a public **research-packs monorepo** — `mcp-tool-shop-org/research-packs` — where every frozen pack is a package and the repo itself is a growing research library. A standalone topic repo would under-scale; this is not the only external-domain pack the project will produce. Experiment 1 is done when these ship together:

1. **`research-packs` monorepo created public, with two packages on day one.** First package: `packages/<topic>/` populated from the freshly frozen experiment pack — `pack/` carries the full frozen ledger (sources, source cards, excerpts, claims, reviews, contradiction resolutions, dispositions, audits, synthesis files, freeze receipt); `synthesis/` carries the citation-clean prose; `README.md` is the human-readable synthesis (Lane 1: for humans who want the answer); `docs/how-to-read-this.md` explains claim IDs, accepted-vs-rejected, waivers, dispositions, and what "frozen" means; `pack.manifest.json` carries canonical per-package metadata. Second package on day one: backfill of the v0.1 self-dogfood pack from `research-os-packs/research-os-spec/` into `packages/research-os-self-dogfood/` so the catalog launches with two real entries. Top-level monorepo carries `README.md` (three-lane explainer), `catalog.json`, `docs/` (Lane 3: method-evaluation surface — how-to-read-a-pack, artifact-contract, source-quality-notes, operator-playbook), and `scripts/` (`verify-pack.mjs`, `summarize-pack.mjs`).

   **Per-package admission contract (load-bearing — no frozen receipt, no package).** Every package MUST carry: `pack/audits/freeze-receipt.json`, `synthesis/final-report.md`, `synthesis/decision-brief.md`, `pack.manifest.json`, and a derived `README.md`. Half-frozen packs do not get a directory. This keeps the monorepo from becoming a dumping ground.

2. **Experiment proof artifact** — `docs/experiment-1-proof.md` in the `research-os` repo, parallel in shape to `docs/dogfood-proof.md`. Documents findings, frictions, source-shape limits, v0.x candidate scope earned by the arc, freeze fingerprints. Links to the monorepo package URL.

3. **External-domain operator playbook** — published as `docs/operator-playbook.md` in the `research-packs` monorepo (Lane 3) AND mirrored or linked from the handbook. Distills operating doctrine the arc earned: when to prefer operator-staged URLs, source-format preferences, contradiction-detector selection rules, model-env discipline, what to make of null publisher fields, and source-quality routing the v0.1 chain doesn't express natively.

Partial publication is forbidden. None of the three ships until all of: 8/8 sections Terminal A, synthesis written and citation-clean, audit `ready_for_synthesis`, freeze succeeds, `freeze-receipt.json` present, refusal absent. Mid-arc artifacts mislead readers who don't know gate semantics.

---

## 2. `research-os pack publish` — automate the canonical archive

**Status: CLOSED 2026-05-09 — shipped in v0.2.0.** Implementation at commit `558c42a`. Documentation: [`docs/pack-publish.md`](pack-publish.md). Dogfood receipt: [`docs/pack-publish-dogfood.md`](pack-publish-dogfood.md).

**The question.** Experiment 1 produces the `research-packs` monorepo by hand. What does the manual closeout teach us about the right shape for `research-os pack publish` — a first-class command that exports any frozen pack into the canonical monorepo format?

**Done looks like.** A frozen pack on disk can be published into a local `research-packs` checkout with a single command:

```
research-os pack publish --to <local-research-packs-checkout>/packages/<name>
```

The command copies the frozen pack into the package layout, generates `pack.manifest.json`, derives `README.md` from `synthesis/final-report.md`, runs receipt-verification, and refuses on any admission-contract violation. The admission contract is enforced by the command, not by checklist discipline. A second external-domain pack runs through `pack publish` end-to-end without manual intervention. The monorepo's `verify-pack.mjs` reproduces the receipt fingerprints for every package.

**Likely shape.** Experiment 1's manual closeout reveals the contract. Implementation is a new CLI subcommand that wraps file copy, manifest generation, and receipt-verification. Tests cover: refusal on missing freeze receipt, refusal on missing synthesis, manifest-generation determinism, receipt-fingerprint preservation across copy. The schema for `pack.manifest.json` is fixed during this experiment. The monorepo's admission contract becomes machine-enforced.

**Why it matters.** Until publication is automated, every external-domain pack carries a session-shaped publication tax and the admission contract is enforced by checklist discipline rather than code. Experiment 1 proves the chain generalizes; Experiment 2 proves the closeout generalizes. Without it, the monorepo grows by hand-edits and ages by drift. With it, `research-packs` has a first-class write path and the admission contract becomes a runtime guarantee.

**What shipped.** `src/pack/publish/` (7 modules: schema, types, copy, manifest, readme, how-to-read, verify, index). CLI: `research-os pack publish --to <path> [--from <path>] [--operator-notes <text>] [--force] [--dry-run]`. 48 new tests (515 total). Dogfood: both existing `research-packs` packages republished via CLI; `verify-pack.mjs` returns PASS for both.

---

## 3. API stability under external pressure

**Status: IN PROGRESS.** Pack #1 of 3 — XRPL creator-token durability — has earned two v0.3.x releases so far. F-09 fix shipped in **v0.3.0** (`--detector` flag on `contradict map`); section-scoped source waivers + reviewer acknowledgement shipped in **v0.3.1**. Two more external-domain packs required for closure.

**Progress (2026-05-09):** Two API-stability findings shipped from the XRPL pack so far:

- **v0.3.0** — F-09 chain blocker resolved. The earlier "clear `OLLAMA_INTERN_MODEL`
  to force heuristic" workaround was state-dependent and silently broke once
  `hermes3:8b` was installed (the default model takes over and the LLM detector
  saturates the Jaccard prefilter on narrow-topic documentation sections). The
  new `--detector <auto|heuristic|ollama-intern>` flag makes heuristic mode a
  first-class operator choice that is environment-independent.

- **v0.3.1** — Section-scoped source waivers + reviewer-side acknowledgement.
  XRPL Section 01 found that the publisher-diversity floor (`min_independent_publishers: 4`)
  inverts on canonical-protocol sections where source diversity is structurally
  low — the XRPL Foundation owns the specification, the implementation, and the
  documentation by design. Pre-v0.3.1, the only mitigation was a pack-level
  `min_independent_publishers: 0` workaround that weakened the global guard
  across every section. v0.3.1 ships `primary_source_waiver.section_waivers[]`
  for relaxing the floor only where truth is structurally single-publisher,
  with explicit `reason` + `compensating_controls[]` preserved in the audit
  trail. The calibrated reviewer's section-wide `source_cluster_monopoly`
  finding is visibly preserved in the findings ledger but no longer routes
  claims to `needs_source_repair` solely on its own when a matching waiver is
  active. Earned by the XRPL pack, ships as v0.3.1, generalizes to every future
  canonical-protocol pack (single-foundation chains, walled-garden APIs, single-vendor specs).

Both fixes earned by the XRPL pack (Experiment 3 #2 of 3). Other Experiment 3 frictions cataloged as
v0.3.x candidates (F-01 init version-stamp, F-02 packs-dir docs, F-05 discover --query example,
F-08 Windows process recovery, F-16 unused SectionSchema fields, F-17 sections/<id>/gates.yaml
runtime wiring) ship as their own scoped releases. XRPL Session 3 resumes against the npm-published
v0.3.1 — the released CLI is the operator surface. Resuming from local source would invalidate the
API-stability test.

**The question.** Where do the CLI surface, schema files, and ledger formats break when packs we didn't write run through them?

**Done looks like.** Three non-self-referential packs run end-to-end without requiring a breaking change. Schemas have been versioned with explicit migration receipts where they did change. The CLI's `--help` output is the contract — and the contract held under packs whose authors don't read this codebase. All three packs are admitted to `research-packs` via `pack publish` (Experiment 2), which means each one exercises the publication contract under load.

**Likely shape.** Run packs on adjacent topics — `knowledge-core`, `role-os`, `ollama-intern-mcp`, anything in the org that needs structured research. Each pack's frictions log feeds back into the schema/CLI surface. Additive changes ship as v0.2.x. Breaking changes get a bump and a documented migration. Non-breaking adjustments are patch releases.

**Why it matters.** Until external pressure has hit the API surface, "stability" is an assertion. v1.0 means operators can pin to `^1` and trust it.

---

## 4. Close the extractor-provenance gap

**The question.** The gate counts accepted claims without asking which extractor produced them. A section can pass the floor on heuristic-fallback claims when the calibrated extractor is unavailable. What does the gate look like when extractor provenance is first-class?

**Done looks like.** Gate output reports accepted claims per extractor. The accepted-claim floor either requires the calibrated extractor for the floor's worth of claims, or explicitly discloses heuristic-fallback contribution. The known-weakness note in `memory/research-os.md` is replaced with a closure note: *"Extractor provenance: closed by Run X, 202Y-MM-DD."*

**Likely shape.** Schema addition to the claim-review entry (`extractor_id`) — the closure-ledger pattern already established. Gate predicate update. Tests covering both the calibrated-floor and heuristic-disclosure branches. Probably a one-session correction in the same shape as the cowork-readiness fix from the v0.1 arc.

**Why it matters.** This is the only known weakness in the architecture-lock memo. Closing it is the difference between "v1.0 with a documented integrity caveat" and "v1.0 clean."

---

## 5. Reviewer calibration generalized

**The question.** `hermes-two-pass` was calibrated against the seeded-failure fixture and earned the trust to ship. What's the calibration story for other models? Does `qwen3` hit a recall threshold with two-pass? Does `llama3`? Does a smaller model with three passes beat a bigger model with one?

**Done looks like.** At least three reviewer configurations have published per-category recall against the seeded-failure fixture (`good-claim FP rate`, `unsupported_claim`, `scope_widening`, `definition_drift`, `temporal_mismatch`, `valid_but_low_value`). `review-promote` can promote any of them as the active profile for a section. Operators choose a config knowing what its recall actually is.

**Likely shape.** Run the calibration script (`scripts/reviewer-calibration.mjs`) against each candidate config. Record results in the canonical fixture log. The calibration regression gate (already a law) catches drift automatically — any new config below the prior baseline is rejected.

**Why it matters.** This is the most genuinely experimental milestone. It's pure research-on-research: each configuration is a hypothesis, the seeded-failure fixture is the experiment, and the recall numbers are the result. v0.x signals "one calibrated baseline." v1.0 signals "the calibration story scales."

---

## 6. Hermes3 baseline

**The question.** The dogfood pack used `mistral-nemo:12b` because `hermes3:8b` wasn't pulled on this rig. What does a clean dogfood run on the canonical default model look like?

**Done looks like.** A second freeze receipt for `research-os-packs/research-os-spec/` (or a sibling pack on the same topic) generated with the canonical reviewer + extractor stack. The two receipts are diffed; meaningful divergences become findings or — if none — confirmation that the model substitution didn't bias the proof.

**Likely shape.** `ollama pull hermes3:8b`. Re-run the chain with `OLLAMA_INTERN_MODEL=hermes3:8b`. Compare receipt fingerprints. Diff per-section accepted-claim counts. Diff per-section dispositioned counts. The diff is its own evidence.

**Why it matters.** The cleanest v1.0 story includes a dogfood proof on the canonical model stack. The current proof is honest — it discloses the substitution — but a hermes3-based receipt removes the disclosure entirely.

---

## Versioning posture until v1.0

| Range | What ships |
|-------|------------|
| **v0.1.x** | Patch fixes, friction-log triage, documentation, README polish, translations. |
| **v0.2.0** | Additive behavior changes — new commands, new flags, new optional schema fields. |
| **v0.3.0+** | Each release lands one of the milestones above as a meaningful capability. |
| **v1.0.0** | All six milestones closed **and** at least one external user has run a pack to freeze without intervention. |

The six milestones don't need to ship in numerical order. The order above is the recommended sequence; the architecture lock holds regardless of which experiment is closed next.

---

## What v1.0 will earn

- Semver discipline that means something. `^1` is a contract.
- A reviewer-calibration story that scales beyond a single model.
- A gate that reports its own confidence — extractor provenance is visible at the seam.
- A dogfood receipt for a topic that isn't `research-os` itself, archived in a public, machine-verifiable monorepo.
- A first-class command that turns a frozen pack into a published archive entry without checklist discipline.
- A second receipt on the canonical model stack.

Six experiments. The architecture lock holds throughout — none of these requires reopening the truth chain. They each deepen what v0.1 already proved.

This document is living. As experiments reveal things, it gets updated.
