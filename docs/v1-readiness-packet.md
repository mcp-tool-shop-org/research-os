# v1.0 Readiness Packet — Judgment + Inventory

**Produced:** 2026-05-10  
**Session type:** Pure judgment + inventory. No code changes. No schema changes. No tests added. No release prep.  
**Repository state at packet time:** master HEAD `298321f` (v0.6.0 release commit), 713/713 tests passing, 4 frozen packs byte-identical.  
**research-packs PR #9 status at packet time:** OPEN (`mergeStateStatus: CLEAN`)

---

## Section 1 — Verdict Candidate

**Verdict: Ready after research-packs PR #9 merge.**

The six-experiment arc is fully closed. The core contract — source truth before synthesis, append-only ledgers, deterministic freeze receipts, machine-enforced admission, calibrated reviewer evidence — is proven, tested at 713/713, and byte-identical across four frozen external-domain packs. No functional blocker was found during inventory.

The one remaining prerequisite is PR #9 merge. PR #9 carries the v0.6.0 deterministic-reviewer-baseline operator docs to `research-packs/docs/operator-playbook.md`. Operators encountering the product for the first time should find the playbook reflecting the full v0.6.0 surface, including deterministic reviewer options and the `hermes-two-pass-deterministic` profile. Shipping v1.0 without that merge would leave the public playbook one major release behind. No code change is required; PR #9 is a docs merge.

Two inventory findings surface that are not functional blockers but require docs-alignment during release prep (see Section 7):

1. **CHANGELOG/CLI surface discrepancy.** The CHANGELOG v0.4.0 entry describes `source-card validate`, `source-card list`, and `classify-source` as CLI subcommands. None of these are registered in the current `src/cli.ts` (1,251 lines, confirmed by full read). The actual `source-card` group exposes only `source-card audit` (with `--apply --from <file>` for override application). This is a documentation accuracy issue, not a code defect. Release prep should align the public surface description with what is actually shipped.

2. **roadmap.md v1.0 framing predates this packet.** The roadmap still carries the older prospective framing: *"v1.0 is not a calendar date. When the extractor-provenance design question is resolved and at least one external operator has run a pack to freeze without intervention, the v1.0 arc begins."* This language was written before the experiments started. This packet supersedes it. Release prep should update `roadmap.md` to reflect the decision made here.

### Criteria for the verdict to stand

1. research-packs PR #9 is merged before v1.0 ships.
2. `npm run verify` returns clean (713/713 tests, lint, typecheck, build) on the release commit.
3. 4-pack regression byte-identical: sha256 hashes unchanged from v0.3.3 baselines.
4. `README.md`, `CHANGELOG.md`, and `docs/roadmap.md` are updated to reflect v1.0 framing without overstating reviewer trust.
5. The CHANGELOG CLI-surface discrepancy is addressed in release-prep documentation pass (correct description or implement the missing commands).
6. Translations run **before** npm publish and `gh release create` (canonical ordering per global rule).
7. No `trusted_baseline` is claimed anywhere in the release artifacts.

---

## Section 2 — What Is Proven: The Six-Experiment Arc

### Experiment 1 — Non-self-referential dogfood (closed 2026-05-09)

ComfyUI workflow durability: 11 sessions, 8 sections, a domain with zero vocabulary overlap with research-os itself. Frozen 2026-05-09T08:30:02.276Z. Pack archived at `research-packs/packages/comfyui-workflow-durability/`. The arc proved the chain generalizes beyond self-referential topics, earned Pattern 2 completion (active-blocker readiness, not candidate-set completeness, commit `22b5dba`), and surfaced the first batch of external-domain operating-mode discipline (GitHub UI HTML avoidance, operator-staged URLs, publisher-null interpretation). Proof: [`docs/experiment-1-proof.md`](experiment-1-proof.md). Release: v0.2.0 incorporated Pattern 2 fix.

### Experiment 2 — `pack publish` automation (closed 2026-05-09, v0.2.0)

The manual Experiment 1 closeout revealed the admission contract shape; Experiment 2 made it machine-enforced. `research-os pack publish` exports any frozen pack into the canonical monorepo format, derives `pack.manifest.json`, generates `README.md`, provisions `docs/how-to-read-this.md`, and refuses on any admission-contract violation. 48 new tests. Both existing `research-packs` packages republished via CLI and verified. The monorepo has a first-class write path and the admission contract is a runtime guarantee, not checklist discipline.

### Experiment 3 — API stability under external pressure (closed 2026-05-10)

Three external-domain packs — ComfyUI (community-distribution), XRPL (canonical-protocol), Godot (mixed-shape) — ran through the v0.3.x CLI surface without requiring breaking changes. Each pack's shape was deliberately different from the previous. The XRPL pack earned v0.3.0 (`--detector` flag, F-09), v0.3.1 (section-scoped source waivers, F-10/F-11), and v0.3.2 (normalized accepted-claim accounting, F-36). The Godot pack earned v0.3.3 (gate-semantics clarity, F-43 + F-41). API stability is now an earned claim: packs from three domains froze without breaking changes to the CLI contract. Proofs: [`docs/experiment-3-pack-2-proof.md`](experiment-3-pack-2-proof.md), [`docs/experiment-3-pack-3-proof.md`](experiment-3-pack-3-proof.md).

### Experiment 4 — Source identity durability (closed 2026-05-10, v0.4.0)

The A+B+D spine made source identity durable across re-gather operations. Component B: centralized source-type classifier with an 11-vendor canonical list and 6-level precedence stack. Component A: `evidence/source-card-overrides.jsonl` append-only ledger with latest-wins effective-view helpers; gather no longer reverts operator corrections. Component D: `research-os source-card audit` read-only drift inspection with 7 finding kinds and `--apply --from <file>` override application. F-27, F-47, F-46 closed. 50 new tests. 4-pack byte-identical throughout.

### Experiment 5 — Reviewer calibration generalized (closed 2026-05-10, v0.5.0)

Reviewer calibration became durable. The harness produces structured Zod-validated receipts (`schema_version: 1`, 8 PASS/FAIL bars, 4 status labels). Multi-run median aggregation (`--runs N`) absorbs single-run variance without lowering bars. Three canonical receipts shipped: `hermes-two-pass` → `failed`; `mistral-nemo-two-pass` → `conditional_pass`; `hermes-single-pass` → `comparison_only`. No `trusted_baseline` admitted. The `hermes-two-pass` `failed` outcome is the mechanism doing exactly what it was designed to do: exposing nondeterminism that a single run would have hidden. F-48, F-49, F-50 closed. 51 new tests cumulative (v0.4.0→v0.5.0).

### Experiment 6 — Canonical Hermes baseline with deterministic options (closed 2026-05-10, v0.6.0)

Deterministic reviewer options threaded through every layer: calibration harness (6 CLI flags), aggregate receipt schema (`reviewer_options` field), production review profile config (`research.yaml` `reviewer_options:` shape), review snapshot output (`review.json`), and human-readable review markdown (`review.md`). The v0.1 self-dogfood pack reviewed through the production CLI under explicit `temperature: 0, seed: 7` — 329 claims, 8 sections, 76.6% acceptance rate. Two backward-compatibility seams fixed: F-53 (gate JSON `.optional().default(0)`) and F-54 (`reviewer_options` disclosure on review artifacts). Hermes NOT promoted to `trusted_baseline`. The aggregate deterministic receipt (`hermes-two-pass-deterministic`) shows `failed` — a structural model-capability gap in decision vocabulary (2/6 decisions vs. required 3/6), not a variance problem. The win is the mechanism: research-os preserves the evidence when the model is weak. 42 new tests. Proof: [`docs/experiment-6-proof.md`](experiment-6-proof.md).

### Quantitative summary

| Metric | v0.4.0 | v0.5.0 | v0.6.0 |
|---|---|---|---|
| Tests | 620 | 671 | **713** |
| Frozen packs byte-identical | 4 | 4 | **4** |
| Experiments closed | 4 | 5 | **6 / 6** |
| Calibration receipts shipped | — | 3 | 4 |
| Trusted baselines admitted | 0 | 0 | **0** |

---

## Section 3 — What v1.0 DOES Claim

### Product promise

> *research-os is a local-first research control plane that preserves source truth, gates synthesis eligibility, and produces frozen, claim-traceable research packs.*

### Concrete v1.0 claims

**1. Source truth before synthesis (Laws 1 and 4).** No synthesis is permitted until extracted claims have passed adversarial review and a section gate has returned `synthesis_eligible: true`. The gate is machine-enforced: `synth workspace` refuses with exit code 2 in `repair_required` or `human_review_required` mode. Source cards are typed deterministically via the 11-vendor canonical classifier (Component B, v0.4.0). Operator corrections are preserved in `evidence/source-card-overrides.jsonl` and survive re-gather (Component A, v0.4.0).

**2. Append-only ledgers throughout.** `claim-reviews.jsonl`, `source-card-overrides.jsonl`, `evidence/fetch-log.jsonl`, `calibration/reviewer-profiles/<profile>/runs/run-NNN.json` — all append-only. Effective state at any point is derived from the ledger, not asserted. The F-36 `getEffectiveAcceptedClaimIds` helper (latest-decision-wins per `claim_id`) makes this derivation canonical for `pack publish` admission.

**3. Deterministic freeze receipts with byte-identical verification.** `freeze` requires `pack-audit verdict=ready_for_synthesis`, `handoff mode=synthesis_ready`, synthesis files citing accepted claim IDs via `[claim:clm_<id>]` references, and every canonical artifact sha256-hashed. The resulting `audits/freeze-receipt.json` is independently reproducible: `research-packs/scripts/verify-pack.mjs` has verified all 4 archived packs byte-identical against v0.3.3 baselines through v0.6.0.

**4. Machine-enforced pack publication contract.** `pack publish` refuses packs missing `audits/freeze-receipt.json`, `synthesis/final-report.md`, or other admission requirements. The effective-accepted-claim count (F-36) is used in the manifest rather than the raw ledger count. Frozen-pack refusal for `--apply` operations is unconditional. Half-frozen packs do not get a `research-packs` directory entry.

**5. Section gates with pack-wide and section-scoped source-floor accounting.** Seven gate families per section: source floor (min sources, min independent publishers, primary sources required + waiver), claim integrity, scope integrity, freshness, contradiction, section budget, and waivers. Gate output carries both pack-wide and section-scoped publisher counts (v0.3.3, F-43). Section-scoped source-floor waivers available for structurally single-publisher domains, each requiring non-empty `reason` and `compensating_controls[]` (v0.3.1, F-10/F-11).

**6. Reviewer calibration machinery with durable receipts.** Four status labels (`trusted_baseline`, `conditional_pass`, `failed`, `comparison_only`). Eight PASS/FAIL bars including FP ceiling, any-flag recall, per-category any-flag floor, strict recall, decision vocab completeness, latency hard stop, empty/malformed rate. Multi-run median aggregation with recurring-failure demotion. Single-run and aggregate receipt schemas (Zod-validated, `schema_version: 1`). Four canonical receipts committed in the repository.

**7. Explicit caveat handling with audit-trail preservation.** Section-scoped waivers disclose `reason` and `compensating_controls[]` in the audit trail; waived rows are annotated `waived: true`, not removed. Calibration receipts carry `unreachable_decisions[]` arrays disclosing which seeded-failure categories cannot be tested by the current fixture. `review.json` and `review.md` disclose `reviewer_options` directly (F-54) — no secondary lookup required. Override-ledger entries are validated before application (all-or-nothing: validate all, then write all).

**8. Reproducible operator workflow from pack config.** `reviewer_options` in `research.yaml` `review_profiles.<name>` carries sampling parameters (`temperature`, `seed`, `top_p`, `top_k`, `repeat_penalty`, `num_ctx`). The production `research-os review` command extracts these from the preset and threads them into both `OllamaInternReviewer` passes. Operators reproduce a calibrated baseline from config, not from memorizing CLI flags. Profile name is stamped on `claim-reviews.jsonl` records (optional `profile?` field, v0.5.0).

---

## Section 4 — What v1.0 Does NOT Claim

**1. It is not a report generator.** Synthesis prose remains an operator-authored output downstream of gated evidence. `synth workspace` creates guardrail-headed workspace files when `handoff mode=synthesis_ready`; it does not write synthesis. The operator writes `synthesis/final-report.md`; freeze verifies citation discipline.

**2. It is not an autonomous truth machine.** It cannot decide what is true. It can structure what has been gathered, gate what is permitted to synthesize, and disclose what has been caveated. The operator makes all research judgments; research-os makes the evidence structure and gate semantics machine-enforced.

**3. It does not ship a trusted reviewer model by default.** No profile earns `trusted_baseline` at v1.0. The four canonical receipts at v0.6.0: `hermes-two-pass` → `failed`; `hermes-two-pass-deterministic` → `failed`; `mistral-nemo-two-pass` → `conditional_pass`; `hermes-single-pass` → `comparison_only`. Operators choosing a reviewer profile know exactly what evidence backs it. `trusted_baseline` is earned through the harness — not claimed by the developer.

**4. It does not guarantee web accessibility for JS-shell or paywalled sources.** F-42 (Apple `developer.apple.com` JavaScript-render gap) and F-44 (Valve/Steam entire web surface is jQuery-rendered with no plain-text alternate) are documented structural ceilings. Operator workarounds exist and are documented in the operator playbook. These are not product defects; they are honest disclosures of what the v0.1 fetch model cannot reach.

**5. It does not make weak sources strong through waivers.** Section-scoped waivers require non-empty `compensating_controls[]` and a non-empty `reason`. Pack policy `primary_source_waiver_allowed: false` blocks all waivers unconditionally — operators cannot route around pack policy using section scope. Waived rows remain visible in audit rollups annotated as `waived: true`, not removed. The waiver feature is honest discipline for structurally single-publisher domains, not a universal floor-relaxer.

**6. It does not make synthesis decisions for the operator.** Effective-accepted-claim count, gate verdict, section scopes, and waiver disclosures inform the operator; the operator authors synthesis prose and accepts responsibility for interpretation. `forbidden_inputs[]` in `synth workspace` enumerates every non-accepted claim — synthesis must not cite them — but what to write with the accepted claims is the operator's work.

---

## Section 5 — Caveat Disposition

All remaining frictions classified as **acceptable for v1.0 (with disclosure)** or **post-v1**. Items marked acceptable are documented in the operator playbook or calibration receipts. None represent hidden defects; all represent honest operating boundaries.

| Friction | Severity | v1.0 disposition | Disclosure path |
|---|---|---|---|
| F-22 — LLM nondeterminism on source-type classification | P3 | Acceptable — partially mitigated by Component B deterministic rules (v0.4.0); long-tail handled by Component A overrides | Operator playbook, source-card audit workflow |
| F-23 / F-26 / F-31 — Extractor under/over-typing of canonical-protocol sources | P2 | Acceptable — bulk mitigated by Component B; long tail handled by Component A overrides | Operator playbook, source-card audit workflow |
| F-28 — `xls.xrpl.org` content size | P3 | Acceptable — content contribution proportional to size; triage capping handles it | Operator playbook |
| F-30 — `rippled` releases topic skew | P3 | Acceptable — operator-stage topic-filtered API URLs | Operator playbook |
| F-37 — `.gitattributes -text` CRLF preemption for source-card files | P2 | Acceptable — closeout doctrine documented; operator-playbook covers the workaround | Operator playbook |
| F-40 — Source mis-typing long-tail (12+ documented variants across RST, Apple docs, platform-vendor surfaces) | P2 | Acceptable — handled by Component A override ledger; v0.4.0 Component B catches the major patterns; long tail is operator-correction territory | Operator playbook, source-card audit workflow |
| F-42 — JS-shell vendor surfaces (Apple `developer.apple.com` render gap) | P2 | Acceptable — Apple Markdown API alternate documented and confirmed for `developer.apple.com/documentation/*` paths | Operator playbook |
| F-44 — Valve/Steam closed surface (jQuery-rendered, no plain-text alternate) | P2 | Acceptable — structural ceiling; closed-surface ledger pattern established in Godot pack | Operator playbook, experiment-3-pack-3-proof.md |
| F-51 — Ollama `seed` advisory; first inference after process spawn differs | P3 | Acceptable — mitigated by `--runs N` aggregation; disclosed in every aggregate receipt via `unreachable_decisions[]` | Calibration receipts, operator playbook (PR #9) |
| F-52 — `per_category_any_flag_floor` cross-session variance under small-N fixture | P2 | Acceptable — documented in canonical receipts and CHANGELOG; multi-run aggregation is the mitigation; v0.6.0 framing explicitly states "baseline produced with caveats" | CHANGELOG, experiment-6-proof.md, release notes |
| No `trusted_baseline` admitted at v1.0 | Structural | Acceptable — this is the mechanism's value, not a defect; research-os "ships the machinery to prove, reject, or conditionally admit reviewer profiles" | README, release notes, calibration receipts |
| `seeded-v1` fixture cannot test `needs_contradiction_mapping` | Structural | Acceptable — honestly disclosed in every aggregate receipt's `unreachable_decisions[]` array; fixture expansion is a post-v1.0 decision | Calibration receipts |
| Extractor provenance gap — gate counts accepted claims without asking which extractor produced them | Design question | Acceptable with disclosure — v0.4.0 closed the gate-output gap (section/pack-wide counts visible); the deeper design question (which extractor produced which accepted claim) remains open and documented in roadmap.md; post-v1 | docs/roadmap.md; roadmap framing update needed in release prep |
| External-operator test unconfirmed — no documented independent-operator pack-to-freeze case | Adoption | Acceptable — adoption metric, not correctness metric; the workflow is validated across 4 external-domain packs; the machinery is operator-ready | roadmap.md update needed in release prep |
| CHANGELOG v0.4.0 overstates CLI surface (`source-card validate`, `source-card list`, `classify-source` described but not in `src/cli.ts`) | Documentation | Acceptable with fix — the `source-card audit` (plus `--apply`) covers the operator-facing workflow; CHANGELOG description needs alignment in release prep | CHANGELOG alignment during release prep |

---

## Section 6 — API / Semver Contract

v1.0 stabilizes the following public surfaces. Operators may pin to `^1` and trust these contracts across minor and patch releases.

### CLI subcommands (authoritative from `src/cli.ts`, confirmed by full read)

**Top-level:**
`init` · `gather` · `gate` · `review` · `review-promote` · `query` · `audit` · `freeze`

**Sub-command groups:**
- `section`: `add`, `report`
- `discover`: `run`, `approve`, `reject`, `export-urls`
- `claim`: `extract`, `triage`, `audit-density`
- `contradict`: `map`, `resolve`
- `index`: `build`, `export-repo-knowledge`, `sync-repo-knowledge`
- `cowork`: `handoff`
- `synth`: `workspace`
- `invalidate`: `extraction`, `review`
- `pack`: `publish`
- `source-card`: `audit` (includes `--apply --from <file>` for override application)

**Inventory note (release prep action required):** The CHANGELOG v0.4.0 entry describes `source-card validate`, `source-card list`, and `classify-source` as CLI subcommands. These are not registered in `src/cli.ts`. The underlying functionality exists as internal exports (`validateSourceCardOverride`, `classifySourceType`), but they are not operator-callable CLI commands. Release prep should either implement the missing subcommands or correct the CHANGELOG description. Until resolved, the v1.0 CLI contract is the set above.

### Pack layout (stable at v1.0)

```
<pack>/
  research.yaml
  sections/<id>/
    sources.jsonl
    claims.jsonl
    claim-reviews.jsonl
    contradictions.jsonl
    gates.yaml
    audits/<section>-gate.{json,md}
    audits/<section>-review.{json,md}
    audits/<section>-findings.jsonl
    calibration/reviewer-profiles/<profile>/seeded-v1.{json,md}
    calibration/reviewer-profiles/<profile>/runs/run-NNN.json
  evidence/
    source-cards/<source-id>.json
    source-card-overrides.jsonl
    citation-ledger.jsonl
    fetch-log.jsonl
  audits/
    pack-audit.{json,md}
    freeze-receipt.{json,md}
    source-card-audit.{json,md}
  synthesis/
    cross-section-map.{json,md}
    final-report.md
    decision-brief.md
    working-report.md
  handoffs/
    cowork-handoff.json
    cowork-master.md
```

### Ledger semantics (stable at v1.0)

- All ledgers are **append-only**. `claims.jsonl`, `source-cards/`, and `fetch-log.jsonl` are never mutated post-extraction.
- Effective state is **derived**, not asserted. Use `getEffectiveAcceptedClaimIds` for pack admission; use latest-timestamp-wins for `claim-reviews.jsonl` effective decisions.
- Freeze receipts are **immutable** once written. `pack publish` refuses to apply overrides to frozen packs.

### Calibration receipt schema (stable at v1.0)

`schema_version: 1` on both single-run and aggregate receipts. 4 status labels. 8 PASS/FAIL bars. `reviewer_options` field optional and additive. Existing receipts (without this field) parse cleanly.

### Source-card override ledger (stable at v1.0)

Entries carry: `url`, `source_id`, `new_source_type?`, `new_publisher?`, `reason`, `created_at`, `applied_by`. Validated by `validateSourceCardOverride` (strict Zod). Apply semantics: all-or-nothing (validate all entries, then write all; any validation failure aborts).

### Review profile config shape (stable at v1.0)

`research.yaml` `review_profiles.<name>`:
```yaml
<name>:
  mode: general | two_pass
  general_model: <string>
  critic_model: <string>
  review_window: <number>
  status: stable | experimental | deprecated
  reviewer_options:          # optional
    temperature: <number>
    seed: <number>
    top_p: <number>
    top_k: <number>
    repeat_penalty: <number>
    num_ctx: <number>
```

### What counts as a breaking change (major version required post-v1.0)

- Removing or renaming any CLI subcommand or flag in the v1.0 surface.
- Removing a field from any persisted schema (pack layout files, ledger entries, receipt schemas).
- Changing the semantics of any existing schema field.
- Changing pack-admission gate behavior in a way that re-evaluates already-frozen packs.
- Bumping `schema_version` on any receipt or ledger without a documented migration path.
- Changing the 4-status-label semantics (`trusted_baseline`, `conditional_pass`, `failed`, `comparison_only`).
- Removing any of the 8 PASS/FAIL calibration bars.

### What counts as additive (minor version OK post-v1.0)

- New optional fields on existing schemas (the pattern established across v0.3.x → v0.6.x: all additive fields shipped as `optional()`, backward-parseable without migration).
- New CLI subcommands or flags.
- New finding kinds in `source-card audit` (precedence-ordered, additive).
- New status labels alongside the existing 4.
- New PASS/FAIL bars that extend coverage without demoting currently-passing profiles.
- New reviewer profiles in `DEFAULT_REVIEW_PROFILES`.
- New `CanonicalVendor` entries in the source-type classifier.

---

## Section 7 — Release Prerequisites

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | research-packs PR #9 merged | **PENDING** | OPEN at packet time, `mergeStateStatus: CLEAN`. Carries v0.6.0 deterministic-reviewer-baseline operator-playbook docs. Must merge before v1.0 ships. |
| 2 | README / CHANGELOG / roadmap aligned | **PENDING** | (a) README: update version badge to 1.0.0; ensure no `trusted_baseline` claims. (b) CHANGELOG: add v1.0 entry; address CLI-surface discrepancy for `source-card validate/list/classify-source`. (c) roadmap.md: update v1.0 framing to reflect this packet's decision criteria; supersede the "extractor provenance + external operator" gate language. |
| 3 | Handbook aligned | **PENDING** | Starlight docs site should reflect v1.0 contract including reviewer-options profile shape and the no-trusted-baseline-at-v1.0 framing. |
| 4 | Translations complete | **PENDING** | 7 languages via TranslateGemma 12B (local, zero API cost). Must run **before** `npm publish` and **before** `gh release create` per canonical ordering rule. |
| 5 | `npm run verify` clean | **PASS** | 713/713 tests, lint, typecheck, build confirmed clean at HEAD `298321f`. |
| 6 | 4-pack regression byte-identical against v0.3.3 baselines | **PASS** | Confirmed at v0.6.0 release. Hashes: dogfood `368d2361...`, ComfyUI `d71943c6...`, XRPL `6511a044...`, Godot `55a65792...`. |
| 7 | v1.0.0 tag + npm publish + GitHub release | **POST-PACKET** | Advisor scope after PR #9 merge and release-prep session. |
| 8 | Smoke install verify | **POST-PACKET** | `npm install -g @mcptoolshop/research-os@1.0.0 && research-os --version` → `1.0.0`. |

Items 5 and 6 are **PASS**. Items 1, 2, 3, 4, 7, 8 are post-packet work — not done in this session.

---

## Section 8 — Final Operator Story

research-os helps an operator turn a research question into a frozen evidence pack. It separates leads from fetched evidence, extracted claims from accepted claims, contradiction mapping from resolution, review from synthesis, and readiness from writing. It does not ask you to trust an LLM reviewer by default; it records the evidence needed to trust, reject, or conditionally admit reviewer profiles.
