# Roadmap to v1.0

`research-os` ships at **v0.1.0** because it has been used exactly once: by itself, on itself. That single run earned sixteen load-bearing laws, two integration patterns, and one frozen pack — but it doesn't tell us how the system holds up under everything the world will throw at it.

v1.0 isn't a calendar date. It is an earned state. Five open questions stand between v0.1 and v1.0. Each is a small experiment or research project. Closing them is the fun part.

---

## 1. API stability under external pressure

**The question.** Where do the CLI surface, schema files, and ledger formats break when packs we didn't write run through them?

**Done looks like.** Three non-self-referential packs run end-to-end without requiring a breaking change. Schemas have been versioned with explicit migration receipts where they did change. The CLI's `--help` output is the contract — and the contract held under packs whose authors don't read this codebase.

**Likely shape.** Run packs on adjacent topics — `knowledge-core`, `role-os`, `ollama-intern-mcp`, anything in the org that needs structured research. Each pack's frictions log feeds back into the schema/CLI surface. Additive changes ship as v0.2.x. Breaking changes get a bump and a documented migration. Non-breaking adjustments are patch releases.

**Why it matters.** Until external pressure has hit the API surface, "stability" is an assertion. v1.0 means operators can pin to `^1` and trust it.

---

## 2. Non-self-referential dogfood

**The question.** Did the chain hold because it's correct, or because the dogfood pack happened to share vocabulary with `research-os` itself?

**Done looks like.** A pack on a topic with no overlap with `research-os` internals reaches freeze with claim-traceable synthesis. Candidates: a tax-law pack, a clinical-evidence pack, a hardware-design pack, a historical-research pack. The reviewer's seeded-failure recall holds. The gate doesn't gate-block on metadata coincidence. Discovery doesn't hallucinate the topic into the wrong domain at first attempt.

**Likely shape.** Pick one topic deliberately distant from `research-os`'s vocabulary. Run it. See what the chain finds. Whatever breaks is the eighth correction — and the eighth correction earns its own integration pattern note in the architecture-lock memo.

**Why it matters.** Self-referential dogfood is the cheapest validation possible because the writer and the reader speak the same vocabulary. The first non-self-referential pack is where the abstractions either generalize or don't.

---

## 3. Close the extractor-provenance gap

**The question.** The gate counts accepted claims without asking which extractor produced them. A section can pass the floor on heuristic-fallback claims when the calibrated extractor is unavailable. What does the gate look like when extractor provenance is first-class?

**Done looks like.** Gate output reports accepted claims per extractor. The accepted-claim floor either requires the calibrated extractor for the floor's worth of claims, or explicitly discloses heuristic-fallback contribution. The known-weakness note in `memory/research-os.md` is replaced with a closure note: *"Extractor provenance: closed by Run X, 202Y-MM-DD."*

**Likely shape.** Schema addition to the claim-review entry (`extractor_id`) — the closure-ledger pattern already established. Gate predicate update. Tests covering both the calibrated-floor and heuristic-disclosure branches. Probably a one-session correction in the same shape as the cowork-readiness fix from the v0.1 arc.

**Why it matters.** This is the only known weakness in the architecture-lock memo. Closing it is the difference between "v1.0 with a documented integrity caveat" and "v1.0 clean."

---

## 4. Reviewer calibration generalized

**The question.** `hermes-two-pass` was calibrated against the seeded-failure fixture and earned the trust to ship. What's the calibration story for other models? Does `qwen3` hit a recall threshold with two-pass? Does `llama3`? Does a smaller model with three passes beat a bigger model with one?

**Done looks like.** At least three reviewer configurations have published per-category recall against the seeded-failure fixture (`good-claim FP rate`, `unsupported_claim`, `scope_widening`, `definition_drift`, `temporal_mismatch`, `valid_but_low_value`). `review-promote` can promote any of them as the active profile for a section. Operators choose a config knowing what its recall actually is.

**Likely shape.** Run the calibration script (`scripts/reviewer-calibration.mjs`) against each candidate config. Record results in the canonical fixture log. The calibration regression gate (already a law) catches drift automatically — any new config below the prior baseline is rejected.

**Why it matters.** This is the most genuinely experimental milestone. It's pure research-on-research: each configuration is a hypothesis, the seeded-failure fixture is the experiment, and the recall numbers are the result. v0.x signals "one calibrated baseline." v1.0 signals "the calibration story scales."

---

## 5. Hermes3 baseline

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
| **v1.0.0** | All five milestones closed **and** at least one external user has run a pack to freeze without intervention. |

The five milestones don't need to ship in numerical order. Whichever question is most interesting to answer next is the next experiment.

---

## What v1.0 will earn

- Semver discipline that means something. `^1` is a contract.
- A reviewer-calibration story that scales beyond a single model.
- A gate that reports its own confidence — extractor provenance is visible at the seam.
- A dogfood receipt for a topic that isn't `research-os` itself.
- A second receipt on the canonical model stack.

Five experiments. The architecture lock holds throughout — none of these requires reopening the truth chain. They each deepen what v0.1 already proved.

This document is living. As experiments reveal things, it gets updated.
