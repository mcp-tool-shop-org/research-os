# Experiment 6 Proof — Deterministic Reviewer Baseline

**Topic:** Can research-os produce a reproducible, attributable canonical-model baseline — and what happens when the model is not good enough to earn trust?

**Arc:** v1 Experiment 6. Five sessions across 2026-05-10. Builds on the reviewer-calibration infrastructure introduced in v0.5.0.

**Release:** v0.6.0 — 2026-05-10.

---

## Release thesis (verbatim)

> *v0.6.0 closes Experiment 6 with reviewer-trust evidence: research-os can now produce a
> reproducible, attributable canonical-model baseline. The real review path carries
> deterministic reviewer options from profile config, legacy gate artifacts parse, review
> outputs disclose sampling conditions, and the v0.1 self-dogfood pack was reviewed through
> the production CLI under explicit Hermes conditions. **Hermes is not promoted to trusted
> baseline.** The win is the mechanism, not a passing receipt.*

---

## Outcome

Canonical Hermes baseline produced with caveats.

The Experiment 6 arc opened with a question: once reviewer calibration is durable
(v0.5.0), can research-os actually run the real production review path with explicit,
attributable sampling conditions and produce a receipt that means something?

The answer is yes — with honest caveats. Five sessions threaded deterministic reviewer
options (`temperature: 0, seed: 7`) through every layer of the system: the calibration
harness, the aggregate receipt schema, the production review profile config, the review
snapshot output, and the human-readable review markdown. The v0.1 self-dogfood pack was
reviewed through the production CLI without workarounds. Two backward-compatibility seams
(F-53, F-54) were found and fixed. The resulting evidence trail is honest, attributable,
and reproducible.

Hermes (`hermes3:8b`) is NOT promoted to `trusted_baseline`. The aggregate deterministic
calibration status is `failed` — a permanent structural gap in decision vocabulary
(`decision_vocab_completeness: 2/6` vs required `3/6`), not a variance problem. The
dogfood baseline is real and consistent; it cannot be called passing.

The win is the mechanism, not a passing receipt. Research-os can now preserve the
evidence when the model is weak.

---

## Session 1 — Variance audit

**Commit:** none (discovery only)  
**Date:** 2026-05-10

### What was known before this session

v0.5.0 closed F-50 by introducing multi-run median aggregation in the calibration harness.
The canonical `hermes-two-pass` receipt shows `failed` across 3 runs with high per-run
variance: `any_flag_recall` ranged 0.846 → 0.615 → 0.462; `valid_but_low_value` collapsed
from 100% → 100% → 0% in run 3. The advisor identified run-to-run variance as the dominant
failure driver and asked whether deterministic Ollama settings could make the baseline
meaningful.

### Discovery

Session 1 audited the current parameter control surface. Only `num_ctx: 8192` was set
in `OllamaInternReviewer`. Temperature, seed, and all other sampling parameters were
unset — inheriting whatever the hermes3 Modelfile specifies (typically temperature≈0.8,
no seed).

Three seam experiments ran with `temperature: 0, seed: 7` patched directly into the
source (not committed). Results:

| Metric | Default range | Deterministic range | Change |
|---|---|---|---|
| `any_flag_recall` | 0.384 | 0.077 | **5× reduction** |
| `strict_recall` | 0.231 | 0.000 | **Eliminated** |
| `valid_but_low_value` any | 1.000 | 0.000 | **Collapse eliminated** |
| `runtime_ms` | 65,806ms | 2,105ms | **31× reduction** |

The `valid_but_low_value` collapse — the F-50 failure driver — was eliminated under
deterministic settings. Runs 2 and 3 were byte-for-byte identical; run 1 differed in one
dimension (`temporal_mismatch_2` any-flag: 0.5 vs 1.0), confirming that Ollama's `seed`
is advisory, not perfectly deterministic. This is F-51 (P3).

The `decision_vocab_completeness` bar failed in every deterministic run (2/6 decisions
produced; requires 3/6). This is a structural model-capability ceiling, not variance.

### Recommendation

**(c) Both — deterministic settings + multi-run aggregate.** Deterministic settings
eliminate the worst variance; `--runs 3` covers the residual advisory-seed variance. The
receipt must disclose both the exact reviewer invocation and the run count to be
meaningful.

The seam was reverted. Session 1 produced the variance audit document and handed the
implementation specification to Session 2.

---

## Session 2 — Reviewer options as receipt-backed inputs

**Commit:** `40af0a9`  
**Date:** 2026-05-10  
**Tests:** 671 → 698 (+27)

### What shipped

- `src/review/reviewer-options-schema.ts` — new `ReviewerOptionsSchema` (6 optional fields:
  `num_ctx`, `temperature`, `seed`, `top_p`, `top_k`, `repeat_penalty`).
- `src/review/reviewers/ollama-intern.ts` — constructor accepts `reviewer_options`;
  options merged via `!== undefined` checks (load-bearing: `temperature: 0` is not dropped
  as falsy).
- `src/calibration/receipt-schema.ts` and `aggregate-receipt-schema.ts` — `reviewer_options`
  added to both schemas (optional, additive, backward-compatible).
- `src/calibration/receipt.ts` / `aggregate.ts` — `## Reviewer options` section rendered
  when present.
- `scripts/reviewer-calibration.mjs` — 6 new CLI flags (`--temperature`, `--seed`,
  `--top-p`, `--top-k`, `--num-ctx`, `--repeat-penalty`); numeric validation; options
  captured once and reused across all N runs.
- 27 new tests in `test/reviewer-options.test.ts`.

### Canonical deterministic aggregate

```
node scripts/reviewer-calibration.mjs --model hermes3:8b --two-pass \
  --temperature 0 --seed 7 --runs 3 --profile hermes-two-pass-deterministic
```

Result:
- Status: **`failed`** — as expected.
- All 3 runs byte-identical (72.6s / 72.6s / 72.9s) — stable.
- Recurring failures: `per_category_any_flag_floor` (unsupported_claim any-flag = 0/3 in
  all 3 runs), `decision_vocab_completeness` (2/6 across all 3 runs).
- Receipt: `calibration/reviewer-profiles/hermes-two-pass-deterministic/seeded-v1.json`.
- `reviewer_options: {"temperature":0,"seed":7}` in all receipts.

**F-52 NEW P2:** `per_category_any_flag_floor` is a recurring failure under deterministic
mode. `unsupported_claim` any-flag = 0/3 in all 3 runs under `--runs 3` single-process
mode, vs 2/3 in Session 1 seam experiments (separate processes). Cross-session seed
variance: different RNG initial state per Ollama process spawn.

Note: the `valid_but_low_value` collapse is STILL eliminated (3/3 all runs). F-50's
primary driver is removed. F-52 is a separate recurring pattern, not a variance problem.

---

## Session 3 — Production review profile config

**Commit:** `a8e9e9c`  
**Date:** 2026-05-10  
**Tests:** 698 → 706 (+8)

### What shipped

- `src/intake/schema.ts` — `reviewer_options` field added to `ReviewProfilePresetSchema`;
  `hermes-two-pass-deterministic` profile added to `DEFAULT_REVIEW_PROFILES`
  (`mode: two_pass`, `temperature: 0`, `seed: 7`, status: `experimental`). The existing
  `hermes-two-pass` profile is NOT modified.
- `src/cli.ts` — `reviewerOptions` extracted from preset; passed to all 3
  `OllamaInternReviewer` constructions (general, narrow_critic, single-pass).
- 8 new tests in `test/review-cli-preset.test.ts`, including the load-bearing test 4
  (simulates full CLI chain: preset → reviewer_options extraction → OllamaInternReviewer
  construction → fetchImpl captures `/api/chat` body → asserts `temperature===0 AND seed===7`).

### What this means

The production `research-os review` path now carries deterministic conditions from
`research.yaml` profile config — no manual flag injection required. An operator adds
`hermes-two-pass-deterministic` to their pack's `review_profiles` and runs:

```
research-os review <section> --preset hermes-two-pass-deterministic \
  --profile hermes-two-pass-deterministic
```

The reviewer options are resolved from config and applied to every Ollama call within
the session. The receipt must disclose them — that gap was F-54, closed in Session 5.

---

## Session 4 — All-section dogfood scratch rerun

**Commit:** none (evidence-only session)  
**Date:** 2026-05-10  
**Tests:** 706/706 (unchanged)

### Setup

Scratch workspace: `E:/AI/research-os-packs/research-os-spec-hermes3-deterministic/`  
Source pack (read-only): `E:/AI/research-packs/packages/research-os-self-dogfood/`

Profile resolution: Case (b) — `hermes-two-pass-deterministic` added to the scratch
pack's `research.yaml` only (source pack untouched).

### F-53 surfaced

The production `research-os review` path reads existing `audits/<section>-gate.json`
files and parses them through `SectionGateResultSchema`. The frozen v0.1 pack's gate
JSONs were written under a schema that did not yet have `source_counts.section_primary`
and `source_counts.section_independent_publishers`. The current schema required those
fields, causing a parse failure on every section.

**Workaround this session:** All 8 gate JSONs in the scratch pack were renamed to
`.bak-F53-schema-migration` so `readGateResult` returned `null` (fully handled branch).
Review ran cleanly. Source pack gate JSONs were untouched. F-53 was escalated to
Session 5 for a proper fix.

### Per-section evidence

| Section | Runtime (s) | Claims | Findings | Accepted | Profile lineage |
|---|---:|---:|---:|---:|---|
| 03-source-and-claim-truth | 84.4 | 50 | 38 | 42 | ✓ |
| 01-product-thesis | 16.4 | 19 | 19 | 18 | ✓ |
| 02-pack-artifact-contract | 64.1 | 50 | 60 | 38 | ✓ |
| 04-gates-and-waivers | 13.1 | 30 | 26 | 30 | ✓ |
| 05-cowork-handoff | 89.3 | 83 | 97 | 65 | ✓ |
| 06-repo-knowledge-integration | 50.4 | 43 | 66 | 18 | ✓ |
| 07-cli-and-runtime-flow | 31.2 | 29 | 28 | 26 | ✓ |
| 08-acceptance-suite | 36.1 | 25 | 28 | 15 | ✓ |
| **TOTAL** | **385s** | **329** | **362** | **252** | **all ✓** |

- Aggregate acceptance rate: 76.6% (252/329)
- Zero stalls, zero malformed LLM responses across all 8 sections
- All 329 claim-review records carry `"profile": "hermes-two-pass-deterministic"` — confirmed
- Source pack: byte-identical post-session (507 files)

**F-54 surfaced:** `reviewer_options` (temperature=0, seed=7) not disclosed in
`review.json`. The only trace was `profile` field → secondary lookup. Indirect disclosure
is insufficient for a `trusted_baseline` receipt. Escalated to Session 5.

### Caveats on Session 4 evidence

The Session 4 dogfood rerun was done under the F-53 rename workaround. Gate context was
absent (gateResult=null for all 8 sections). This is honest and disclosed. The proof
point this session established was not "the dogfood pack reviewed cleanly without any
workaround" — that golden run was reserved for Session 5. Session 4 established that the
full 8-section rerun is mechanically possible and produces stable, attributable evidence.
Session 5 fixed the seam and re-ran a golden section to prove production readiness.

---

## Session 5 — Workflow seam fixes + golden rerun without rename

**Commit:** `682bd0e`  
**Date:** 2026-05-10  
**Tests:** 706 → 713 (+7)

### F-53 fix — gate JSON schema backward compat

`src/gates/schema.ts`:
```typescript
section_primary: z.number().int().nonnegative().optional().default(0),
section_independent_publishers: z.number().int().nonnegative().optional().default(0),
```

Pre-v0.3.3 gate JSONs that omit these fields now parse with default 0. Fresh gate runs
continue to write both fields. Fully backward-compatible.

### F-54 fix — reviewer_options on review.json + review.md

Five touchpoints:
1. `src/review/schema.ts` — `ReviewSnapshotSchema` + `reviewer_options` optional field.
2. `src/review/types.ts` — `RunReviewOptions` + `reviewer_options?: ReviewerOptions`.
3. `src/review/run.ts` — `FinalizeArgs` + `reviewer_options`; both review paths pass
   `args.options.reviewer_options` through to `finalizeReview`; snapshot stamped.
4. `src/cli.ts` — `runReview` call passes `reviewer_options: reviewerOptions`.
5. `src/review/markdown.ts` — conditional `## Reviewer options` section rendered when
   set and non-empty; stable key order (`num_ctx, temperature, seed, top_p, top_k,
   repeat_penalty`); omitted when absent.

### Golden section 03 rerun

Fresh scratch: `E:/AI/research-os-packs/research-os-spec-hermes3-deterministic-fresh/`  
Profile: Case (b) — `hermes-two-pass-deterministic` in scratch pack's `research.yaml`.  
Gate JSON status: **PRESENT** (not renamed) — `03-source-and-claim-truth-gate.json`
167363 bytes, untouched timestamp.  
CLI: `node E:/AI/research-os/dist/cli.js` (local build with F-53/F-54 fixes).

| Outcome | Value |
|---|---|
| Ran without gate-JSON rename | **YES** (load-bearing) |
| Runtime | 150.9 seconds |
| Candidate claims | 50 (triaged-only) |
| Findings | 31 added, 0 deduped |
| LLM findings rejected | 1 |
| Blocking findings | 0 |

**`review.json.reviewer_options`:**
```json
{"temperature": 0, "seed": 7}
```

**`review.md` "Reviewer options" section:**
```markdown
## Reviewer options

- temperature: 0
- seed: 7
```

Source pack: byte-identical post-session (507 files, line-by-line verified).

The golden section 03 rerun proves that the production CLI, without any gate-JSON rename
workaround, on a fresh scratch pack with the F-53/F-54 fixes applied:
1. Parses the frozen v0.1 gate artifact cleanly.
2. Runs review under deterministic conditions.
3. Discloses `reviewer_options` directly in both `review.json` and `review.md`.

---

## Caveats — honest disclosure

These are not minimized. They are the honest state of Hermes at this arc's close.

### 1. Hermes-two-pass aggregate status is `failed`

The canonical aggregate receipt (`hermes-two-pass-deterministic/seeded-v1.json`) shows
**`failed`** across 3 deterministic runs.

Recurring failures:
- `decision_vocab_completeness`: 2/6 decision types produced in all 3 runs (requires
  3/6). The model produces only `accepted_for_synthesis` and `needs_scope_repair` for
  every claim in `seeded-v1`. It does not produce `rejected`, `needs_source_repair`, or
  `needs_human_review`. This is a structural model-capability ceiling, not variance.
- `per_category_any_flag_floor`: `unsupported_claim` any-flag = 0/3 in all 3 runs under
  the `--runs 3` single-process mode (F-52). The canonical multi-run evidence is
  consistent.

### 2. Mistral-nemo-two-pass is `conditional_pass`, not `trusted_baseline`

The v0.5.0 canonical receipt for `mistral-nemo-two-pass` shows `conditional_pass`
(aggregate, 3 runs). Unchanged by Experiment 6.

### 3. `needs_contradiction_mapping` is unreachable from `seeded-v1`

The fixture does not seed `unmapped_contradiction` findings. Every receipt's
`unreachable_decisions` array discloses this honestly. Fixture expansion deferred.

### 4. Ollama seed is advisory (F-51, P3)

Run 1 under `--runs 3` (single-process, same seed) differs from runs 2+3 in at least
one dimension (`temporal_mismatch_2` any-flag: 0.5 vs 1.0). The first inference after a
process spawn appears to have slightly different RNG initialization than subsequent
inferences within the same session. Mitigated by `--runs N` aggregation; the advisory
behavior is disclosed in every receipt.

### 5. Session 4 workaround disclosed

The full 8-section dogfood rerun (Session 4) was executed with the F-53 gate-JSON rename
workaround (gateResult=null for all sections). Session 5 fixed the seam and ran a golden
section without rename. The Session 4 evidence is honest: 329 claims reviewed, 252
accepted, all profile-lineage confirmed. The caveated method is documented, not hidden.

---

## Hermes is not promoted to trusted_baseline

**Hermes (`hermes3:8b`) is NOT promoted to `trusted_baseline`.** The Experiment 6
canonical receipt shows `failed`. The structural gap in decision vocabulary
(`decision_vocab_completeness: 2/6 < required 3/6`) is consistent across all deterministic
runs and is not a variance artifact. A failed receipt is an honest receipt — the
mechanism works precisely because it does not manufacture trust when trust is not earned.

---

## What v0.6.0 ships

- **Deterministic reviewer options on the production review path.** `review_profiles.<name>.reviewer_options` in `research.yaml` carries `temperature`, `seed`, and other Ollama sampling parameters into every `OllamaInternReviewer` construction in the CLI.
- **Gate schema backward compatibility (F-53 closed).** Pre-v0.3.3 gate JSONs that omit `source_counts.section_primary` and `source_counts.section_independent_publishers` now parse cleanly with default 0.
- **Review output discloses sampling conditions directly (F-54 closed).** `review.json` carries `reviewer_options`; `review.md` renders a `## Reviewer options` section with stable key order.
- **Calibration harness reviewer options as receipt-backed inputs.** `--temperature`, `--seed`, and 4 additional Ollama flags on `scripts/reviewer-calibration.mjs`. Canonical deterministic aggregate receipt committed with `reviewer_options` in the receipt.
- **Canonical deterministic aggregate receipt committed.** Status `failed` — as expected and honest.
- **v0.1 self-dogfood pack reviewed through the production CLI under explicit Hermes conditions.** 329 claims, 252 accepted (76.6%), 8 sections, all profile-lineage confirmed on `hermes-two-pass-deterministic`.

---

## What v0.6.0 does NOT ship

- No trusted reviewer. `hermes-two-pass-deterministic` is `failed`. No profile is admitted as `trusted_baseline`.
- No gate-law, freeze-law, or synthesis-law changes.
- No `seeded-v1` fixture expansion. `needs_contradiction_mapping` remains unreachable.
- No prompt tuning. The model's decision-vocabulary ceiling is documented evidence, not something to coach away.
- No new CLI command or subcommand.
- No change to how packs are frozen, audited, or published.

---

## Frictions catalog at close

| Friction | Status | Version |
|---|---|---|
| F-48 — structured calibration receipt persistence | **CLOSED** | v0.5.0 |
| F-49 — decision-vocab bar miscalibrated for two-pass | **CLOSED** | v0.5.0 |
| F-50 — per-category any-flag floor unreliable at N=2–3 | **CLOSED** | v0.5.0 |
| F-51 — Ollama seed advisory (first inference differs) | P3 — documented | open |
| F-52 — per_category_any_flag_floor recurring under deterministic | P2 — documented | open |
| F-53 — gate JSON schema migration gap (v0.1 frozen artifacts) | **CLOSED** | v0.6.0 |
| F-54 — reviewer_options not disclosed in review.json/.md | **CLOSED** | v0.6.0 |

Earlier frictions (F-21 through F-47) are documented in the respective version CHANGELOG
entries and the Experiment 3 / Experiment 4 / Experiment 5 proof artifacts.

Active open frictions (P2): F-52 (`per_category_any_flag_floor` recurring under
deterministic single-process mode). Not a blocker; a documented calibration finding.

---

## Next

v1.0 closure is a separate arc, not part of v0.6.0. Six milestones stand between v0.1
and v1.0 (see [`docs/roadmap.md`](roadmap.md)). Experiment 6 addresses milestone 6
(Hermes3 baseline) — producing the mechanism without earning trust. The remaining
open milestones (extractor provenance gap, reviewer calibration generalized to multiple
models) are addressed in the v1.0 arc.

v0.6.0 ships the deterministic reviewer infrastructure. v1.0 is a release/readiness
decision when the remaining milestones close.

**Experiment 6 is CLOSED 2026-05-10.**

---

*Proof doc authored: 2026-05-10. Evidence trail: 5 sessions, 3 commits
(`40af0a9`, `a8e9e9c`, `682bd0e`), 713 tests, 4-pack byte-identical regression.*
