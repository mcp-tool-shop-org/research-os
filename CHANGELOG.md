# Changelog

All notable changes to `research-os` are documented here.

## [0.5.0] — 2026-05-10 — reviewer calibration as durable trust contract

### F-50 stabilization (Session 5)

- **Multi-run calibration:** `--runs <n>` flag on the calibration harness. Per-run
  receipts persist under `<profile>/runs/run-NNN.json`; aggregate receipts at
  `<profile>/seeded-v1.{json,md}` use median-based PASS/FAIL rules.
- **Median aggregation rules:** FP ceiling (median ≤1 AND max ≤2), any-flag
  recall (median ≥65%), per-category any-flag (median ≥50% per category with
  total ≥2), strict recall (median ≥20%), decision vocab (architecture-aware
  median ≥3 for two-pass / ≥4 for single-pass), latency hard (every run ≤20 min,
  enforced via max), empty/malformed (every run =0, enforced via max).
- **Recurring-failure demotion:** a profile passes median rules but FAILed the
  same bar in ≥⌈N/2⌉ individual runs → demoted from `trusted_baseline` to
  `conditional_pass`. Prevents one lucky median from masking systemic bar weakness.
- **Single-run mode preserved:** harness without `--runs` (or `--runs 1`) writes
  the existing single-run receipt directly. `comparison_only` profiles stay single-run.
- **New source files:** `src/calibration/aggregate-receipt-schema.ts` (aggregate Zod schema
  with `receipt_kind: 'aggregate'` discriminator) and `src/calibration/aggregate.ts`
  (pure helpers: `median`, `aggregateMetric`, `aggregatePerCategoryRecall`,
  `aggregateDecisionVocabulary`, `computeAggregatePassFail`, `computeRecurringBarFailures`,
  `computeAggregateStatusLabel`, `aggregateReceipts`, `buildAggregateReceiptMarkdown`).

### Frictions closed (Session 5)

- **F-50** — Per-category any-flag floor was statistically unreliable at N=2–3
  seeds per category (one missed claim drops a category from 67% to 33%). Median
  aggregation across 3 runs absorbs single-run variance without lowering the bar.

### Canonical receipt statuses (Session 5)

- `hermes-two-pass` (aggregate, 3 runs): **`failed`** — escalation. Run 1 PASS (FP=0,
  any-flag=85%, decisions=3/6); runs 2–3 FAIL (any-flag 62%/46%, decisions=2/6).
  Recurring failures: `any_flag_recall_floor`, `per_category_any_flag_floor`,
  `decision_vocab_completeness`. Thesis NOT proven at N=3. Advisor decides path.
- `mistral-nemo-two-pass` (aggregate, 3 runs): **`conditional_pass`** — aggregate PASS
  (median FP=1, max=2 at ceiling; median any-flag=69%; no recurring failures).
  Run 1 FAIL (FP=2/5); runs 2–3 PASS.
- `hermes-single-pass` (single-run): **`comparison_only`** — auto-assigned.

v0.5.0 makes reviewer calibration durable. A reviewer profile is not trusted because
it ran once; it earns a status through structured seeded-failure receipts and
multi-run aggregation.

**Product guardrail:** research-os can now refuse to trust a reviewer profile when
repeated seeded failures do not support trust.

**No trusted baseline admitted.** The three canonical receipts shipped with v0.5.0:

| Profile | Status | Notes |
|---|---|---|
| `hermes-two-pass` | `failed` | Aggregate, 3 runs. Recurring failures: any-flag recall, per-category floor, decision vocab. |
| `mistral-nemo-two-pass` | `conditional_pass` | Aggregate, 3 runs. FP at ceiling (median=1/max=2); no recurring failures. |
| `hermes-single-pass` | `comparison_only` | Auto-assigned; architectural comparison only. |

`trusted_baseline` is earned, not assumed. Single-run receipts remain available for quick
local checks; aggregate receipts (3+ runs, median-based bars) are the trust artifact.

### Added

- **`profile?: string`** optional field on `ClaimReviewSchema`. Per-claim review
  records can now carry the profile name that produced them. Existing records
  without `profile` parse cleanly.
- **Structured calibration receipts** at `calibration/reviewer-profiles/<profile>/seeded-v1.{json,md}`.
  Zod-validated JSON + operator-readable Markdown sibling. `schema_version: 1`.
- **`research-os` source `--profile <name>` flag** on `scripts/reviewer-calibration.mjs`.
  Drives output path and persists profile name on claim-review records.
- **Architecture-aware decision-vocabulary bar:** single-pass ≥ 4/6 decisions;
  two-pass ≥ 3/6 decisions. Two-pass acknowledges that `narrow_critic` severity
  escalation collapses the `needs_human_review` path.
- **Four status labels:** `trusted_baseline`, `conditional_pass`, `failed`,
  `comparison_only`. `trusted_baseline` requires the canonical Hermes two-pass
  profile + all bars pass + zero false positives.
- **`review-promote` receipt lookup is now pack-relative** — reads from
  `<pack>/calibration/reviewer-profiles/<profile>/seeded-v1.json`, not
  `process.cwd()`. Operators running `review-promote --pack <non-cwd-pack>`
  now correctly resolve the receipt from the specified pack.
- **`review-promote` fails visibly on invalid receipts.** Previously a malformed
  receipt was silently skipped; now any schema mismatch or JSON parse failure
  throws `Invalid calibration receipt at <path>: <reason>`. Missing receipts
  remain a no-op.
- **Three canonical receipts shipped:** `hermes-two-pass`, `mistral-nemo-two-pass`,
  `hermes-single-pass` — all under `calibration/reviewer-profiles/<profile>/seeded-v1.{json,md}`.
  These are the v0.5.0 proof artifacts. See Session 4 status note below.

### Frictions closed

- **F-48** — Structured calibration receipt persistence. The harness previously
  wrote raw artifacts but no comparable receipt; recall metrics lived in
  `console.log` only.
- **F-49** — Decision-vocabulary bar was miscalibrated against two-pass
  architecture. Bar is now architecture-aware.

### Compatibility

- All 4 frozen packs verify byte-identical against v0.3.3 baselines.
- `ClaimReviewSchema.profile` is optional (Zod `.optional()`, no `.default()`).
  Existing pack records parse cleanly. Frozen pack receipts unchanged.
- No gate-law, freeze-law, or synthesis-law changes.

### Out of scope

- `seeded-v1` cannot test `needs_contradiction_mapping` (no `unmapped_contradiction`
  seeded). The receipt's `unreachable_decisions` array discloses this honestly.
  Fixture expansion deferred to v0.6.
- `phi3:14b` calibration deferred to a later experiment.

### Session 4 single-run evidence (context for F-50 investigation)

The three canonical receipts initially committed in Session 4 reflect honest single-run
evidence. `hermes-single-pass` produced `comparison_only` (auto-assigned). `hermes-two-pass`
and `mistral-nemo-two-pass` both produced `failed` across two single-run attempts each,
with high per-run variance:

- `hermes-two-pass` run 1: `per_category_any_flag_floor FAIL` (valid_but_low_value 1/3);
  run 2: `decision_vocab_completeness FAIL` (2/6 decisions produced).
- `mistral-nemo-two-pass` run 1: `per_category_any_flag_floor FAIL` (unsupported_claim 1/3);
  run 2: `fp_ceiling FAIL` (2/5 FP) + `per_category_any_flag_floor FAIL`.

This per-run nondeterminism (1–2 claim variance per category at N=2–3 seeds) was the
root cause of F-50. Session 5 resolved it via multi-run median aggregation. See
"Canonical receipt statuses (Session 5)" above for the aggregate outcome. The initial
Session 4 receipts were overwritten by the Session 5 aggregate re-runs.

### Test surface

- 620 → 646 tests in Session 3 (+26).
- Session 4 adds 5 regression tests (646 → 651): pack-relative lookup,
  cwd-irrelevance, invalid-receipt fail (×2), missing-receipt no-op.
- Session 5 adds 20 aggregate-helper tests (651 → 671): median, aggregateMetric,
  per-category aggregation, decision-vocab aggregation, PASS/FAIL bars,
  recurring-failure demotion, status-label logic, aggregateReceipts round-trip.
- **Cumulative (Experiments 4+5):** 570 → 671 tests (+101).

## [0.4.0] — 2026-05-10 — source-truth discipline

v0.4.0 makes source identity durable. Deterministic source-type rules
handle the repeatable majority, override ledgers preserve operator
corrections across re-gather, and `source-card audit` replaces
scratch-script drift checks with a first-class CLI surface.

### Component B — centralized source-type classifier

- **`classifySourceType(url)`** — deterministic rule-based classifier
  stored in `source-type-rules.json` (11 canonical vendor entries,
  precedence-ordered). Returns `{ source_type, rule_hint, precedence_level }`.
  The `rule_hint` field exposes flagged conditions (`flagged:github-ui-html`,
  `flagged:*`) and the `no-rule-match` sentinel so callers can distinguish
  extractor-typed from rule-typed cards.
- **`CanonicalVendor` registry** — 11 vendors covering GitHub UI HTML,
  arxiv.org, npm, PyPI, MDN, Apple developer docs, Microsoft docs,
  Valve/Steam, Godot docs, GDExtension, and ReST-typed documentation sites.
- **`classify-source` CLI subcommand** — `research-os classify-source <url>`
  for interactive rule inspection.

### Component A — source-card override ledger

- **`source-card-overrides.jsonl`** — append-only ledger for operator
  corrections to source-card fields (`new_source_type`, `new_publisher`,
  `reason`). Lives at `evidence/source-card-overrides.jsonl` inside each pack.
- **`validateSourceCardOverride`** — strict Zod schema validation for
  override entries. Used by both the ledger writer and the audit apply path.
- **`readOverrides` / `appendOverride`** — safe I/O helpers. `readOverrides`
  returns `[]` when no ledger exists (missing-ledger is not an error).
- **`getEffectiveSourceType` / `getEffectivePublisher`** — latest-wins
  effective-view helpers; override ledger takes precedence over raw card fields.
- **`source-card validate` / `source-card list` CLI subcommands** — inspect and
  manage the ledger.

### Component D — source-card audit CLI

- **`research-os source-card audit --pack <dir>`** — read-only drift
  inspection. Reads all source cards, re-runs the classifier per card,
  assigns exactly one of 7 advisor-locked finding kinds
  (`github_ui_html`, `classifier_flagged`, `source_type_mismatch`,
  `publisher_mismatch`, `publisher_missing`, `override_applied`, `no_action`),
  and writes `audits/source-card-audit.{json,md}`.
- **`--json` flag** — prints the full JSON report to stdout.
- **`--apply --from <file>` flag** — applies an operator-authored JSON array
  of override entries. All-or-nothing validation (all entries validated via
  `validateSourceCardOverride` before any write). Refuses frozen packs
  (`audits/freeze-receipt.json` present) — read-only audit still allowed.
- **7 finding kinds** — precedence-ordered:
  `github_ui_html` → `classifier_flagged` → `source_type_mismatch` →
  `publisher_mismatch` → `publisher_missing` → `override_applied` → `no_action`.
  `source_type_mismatch` guards `rule_hint !== 'no-rule-match'` to prevent false
  positives on extractor-typed cards. `publisher_mismatch` is forward-compatible
  (cannot fire today — no publisher_hint in ClassificationResult).
- **JSON report shape** — `schema_version: 1`, `pack_path`, `audited_at`,
  `research_os_version`, `totals`, `findings`.
- See the [source-card audit handbook page](https://mcp-tool-shop-org.github.io/research-os/handbook/source-card-audit/)
  for the operator workflow.

### Cosmetic

- **F-46: pack manifests now stamp live binary version.** `pack publish`
  manifest previously copied `research.research_os_version` — the version
  frozen into `research.yaml` at pack-init time (was `0.1.0` for packs
  created under older versions). Manifests now derive the version from the
  live `RESEARCH_OS_VERSION` constant at publish time.

### Compatibility

- No gate, freeze, or synthesis-law changes.
- All four frozen packs (`research-os-self-dogfood`,
  `comfyui-workflow-durability`, `xrpl-creator-token-durability`,
  `godot-export-runtime-durability`) verify-pack with byte-identical
  receipt fingerprints under v0.4.0.
- 570 → 620 vitest tests (50 new tests across Components A, B, D).

## [0.3.3] — 2026-05-10

Tight release. **Gate-semantics clarity, not behavior change.** Two
diagnostic improvements earned by Pack-3 (Godot export/runtime
durability, Experiment 3 pack #3 of 3, frozen 2026-05-10): F-43 (gate
accumulation diagnostic) and F-41 (monopoly check reword). Existing
pass/fail semantics for source-floor checks UNCHANGED. All four frozen
packs in research-packs continue to verify-pack with byte-identical
receipt fingerprints under v0.3.3.

### Added

- **Section-scoped diagnostic counts in gate output (F-43).** Gate
  output now carries `section_primary` and `section_independent_publishers`
  alongside the existing pack-wide counts. Section reports and audit
  rollups display both views. Operators can now see, per section, how
  many publishers contribute section-locally vs how many the
  cumulative pack-wide source set carries.

  *Gate pass/fail behavior is unchanged. v0.3.3 makes the source-floor
  evidence legible by reporting both pack-wide and section-scoped
  counts.*

  Earned by Pack-3 Sessions 4–7 (Godot pack), where five sections of
  identical single-publisher canonical-engine shape received different
  waiver outcomes purely based on run-order — Section 01 (run first,
  pack thin) needed dual waiver; Sections 02 + 04 + 05 + 06 + 07 (run
  later, pack accumulated 6+ publishers) needed 0 waivers. The
  difference was real (pack-wide counts at gate-run time), but the
  diagnostic didn't show operators which view drove the decision.

### Changed

- **`no_source_cluster_monopoly` reworded from WARN to informational
  diagnostic (F-41).** The check fired WARN on every single-source
  claim across Pack-3 (confirmed 7×) regardless of explicit publisher
  attribution on source cards. Each research-os claim is grounded to
  one source span by design, so every claim is structurally
  "single-publisher sourced." The WARN didn't carry actionable signal —
  publisher diversity is already enforced by `min_independent_publishers`
  at the source-card level.

  *Because research-os claims are usually grounded to one source span,
  single-source claim attribution is expected. Source diversity should
  be judged from the section/pack source floor, not from a per-claim
  "monopoly" warning.*

  The check is preserved (not removed) so its diagnostic stays visible.
  It now passes with an explanatory message rather than firing a
  warning.

### Compatibility

- All four frozen packs (`research-os-self-dogfood`,
  `comfyui-workflow-durability`, `xrpl-creator-token-durability`,
  `godot-export-runtime-durability`) verify-pack with byte-identical
  receipt sha256 under v0.3.3.
- Manifest format, freeze receipt format, claim-reviews.jsonl
  semantics, F-36 effective-accepted-claims helper — all UNCHANGED.
- New diagnostic fields are additive. Existing tooling that reads
  gate output continues to function.

### Tests

- 558 → **570 passing** (+12). Lint clean; typecheck clean; build
  clean.
- 4-pack regression confirmed: ComfyUI sha256
  `d71943c6...09c79038eb`, dogfood sha256 `368d2361...142ef1fd5d466`,
  XRPL sha256 `6511a044...725259a5`, Godot sha256
  `55a65792...6cf41235` — all stable.

### Out of scope (deferred to later releases)

- F-40 (source-type classification stability across authoritative
  docs).
- F-42 / F-44 (operator-playbook documentation for JS-rendered
  vendor doc alternates).
- F-37 product side (admission emits `.gitattributes` snippet).
- F-46 (manifest version display: init-time vs publish-time).

These are real frictions earned during Pack-3, but v0.3.3 ships with a
single coherent spine. They will land in their own scoped releases.

## [0.3.2] — 2026-05-09

Tight release. One real, tested, dogfooded improvement: normalized
accepted-claim accounting for `pack publish` admission. Earned by
Experiment 3 XRPL pack Session K — frozen-pack admission refused on
a closure-ledger seam disagreement (Section 07 had 24 raw
`accepted_for_synthesis` rows but only 19 unique `claim_id`s due to
overlapping reviewer windows). The strict equality check between
`claim-reviews.jsonl` count and `pack-audit.json::accepted_claims`
was overcounting duplicates as a refusal trigger. Fix is structural:
a single canonical "effective accepted set" definition, applied at
admission, with the legacy audit count preserved (Law 15) but
demoted from refusal to soft warn when it disagrees with the
effective set. F-35 (cross-section-map waiver-dependency mismatch)
deferred to its own scoped release; the helper's normalization
shape doesn't naturally generalize to operator-authored waiver
entries.

### Added

- **`getEffectiveAcceptedClaimIds(reviews)` helper** at
  [`src/closure-ledger/effective-accepted.ts`](src/closure-ledger/effective-accepted.ts)
  — pure-function module. Also exports `getEffectiveDecisionMap` and
  `findIncompatibleDecisions` for downstream consumers that need the
  latest decision per `claim_id` or want to detect incompatible
  duplicate decisions at the same timestamp. The product rule
  (advisor-locked): *Accepted claims = unique `claim_id`s whose
  latest canonical review decision is `accepted_for_synthesis`.*
  Latest-decision-wins precedence per `claim_id` (ISO-8601
  timestamps compare lexicographically). Pattern mirrors
  `cowork/derive.ts`'s active-blocker derivation (Pattern 2:
  latest-status-wins).

### Fixed

- **Pack publish admission contract: normalized accepted-claim
  accounting (F-36).** When `claim-reviews.jsonl` contains
  overlapping reviewer windows, the same `claim_id` can legitimately
  receive multiple `accepted_for_synthesis` records. Pack publish
  admission now derives the effective accepted set per section using
  latest-decision-wins precedence per `claim_id`, instead of strict
  equality against the legacy `pack-audit.json::accepted_claims` raw
  count. Frozen packs whose legacy audit count differs from the
  effective set now admit with a warning rather than refusing — the
  legacy audit file is preserved (Law 15 immutability) while the
  archive manifest reflects the normalized count. Refusal cases kept
  hard: phantom `claim_id` (accepted but absent from `claims.jsonl`),
  incompatible duplicate decisions (same `claim_id` + same
  `created_at` with different decision values), and section gate not
  synthesis-eligible.

  The new soft-warn line:

  ```
  section <id>: legacy pack-audit.json accepted_claims (...) differs
  from effective accepted set (...). Using effective count in
  manifest. Legacy audit count preserved in pack/audits/pack-audit.json
  (immutable per Law 15).
  ```

  This is **not** a publish failure when the effective accepted set
  is valid. It means pack publish is preserving the frozen audit
  file while normalizing the archive manifest.

### Tests

- 540 → **558 passing** (+18). All 57 test files green; lint clean;
  typecheck clean; build clean.
- 9 helper unit tests at
  `test/closure-ledger/effective-accepted.test.ts` covering empty
  input, duplicate-row dedup, latest-wins precedence in both
  directions, out-of-order resolution, decision-map exposure,
  incompatible-decision detection (with and without timestamp
  collisions), and identical-timestamp agreement.
- 9 admission integration tests at
  `test/pack-publish/f36-admission.test.ts` covering duplicate
  accepted dedup, soft-warn (not refuse) on legacy mismatch,
  effective-count manifest write, phantom-claim refusal,
  incompatible-decision refusal, non-synthesis-eligible-gate
  refusal, claims.jsonl-absent warn, repair-then-accept resolution,
  later-rejected removal from accepted set, and tiny-fixture
  regression.

### Validated against frozen packs

- **XRPL creator-token durability** (Experiment 3 pack #2 of 3):
  smoke test admits cleanly. Section 07 surfaces the expected single
  warning (legacy=24, effective=19). Total
  `accepted_claims = 251`. `verify-pack` PASS.
- **ComfyUI workflow durability** (Experiment 1 pack):
  regression PASS, sha256 fingerprint stable.
- **research-os self-dogfood** (Experiment 0 pack):
  regression PASS, sha256 fingerprint stable.

The fix is a strict superset of prior admission discipline. Packs
whose effective count already matched legacy admit identically.
Only XRPL hits the new soft-warn path.

## [0.3.1] — 2026-05-09

Tight release. One real, tested, dogfooded improvement: section-scoped
source-floor waivers + reviewer-side acknowledgement. Earned by Experiment 3
XRPL pack Session 2 — canonical-protocol sections (XRPL XLS standards,
single-foundation chain documentation, walled-garden API specs) inverted
the assumption that publisher diversity is a proxy for truth quality. No
other v0.3.x candidates shipped — F-01 (init version-stamp), F-02
(packs-dir docs), F-05 (discover --query example), F-08 (Windows process
recovery), F-16 (unused SectionSchema fields), F-17 (sections/<id>/gates.yaml
runtime wiring) are deferred to their own scoped releases.

### Added

- **`primary_source_waiver.section_waivers[]`** — section-scoped source-floor
  waivers. Each entry carries `section_id`, `scope` (`min_independent_publishers`
  or `primary_sources_required`), `reason` (non-empty), and
  `compensating_controls[]` (at least one entry). Schema enforcement: empty
  `reason` or empty `compensating_controls[]` fail validation. Pack policy
  `gates.source_floor.primary_source_waiver_allowed: false` blocks both
  pack-level and section-scoped waivers — operators cannot smuggle a waiver
  past pack policy by rerouting it to section scope.

  Multiple entries can target different sections, or the same section with
  different scopes. Pack-level `primary_source_waiver` semantics unchanged;
  the new `section_waivers[]` is additive and defaults to `[]` for backward
  compatibility. Existing packs unaffected. Full reference:
  [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

- **Reviewer-side acknowledgement** — when a section has a matching
  `min_independent_publishers` waiver in effect, the calibrated reviewer's
  section-wide `source_cluster_monopoly` finding remains visible in the
  findings ledger but does NOT, by itself, route claims to
  `needs_source_repair`. The finding is annotated as
  `(severity, waived)` in the claim-review's reason string so operators
  reading the ledger can see the finding is present but neutralised. Other
  source-quality findings (per-claim `source_quality_problem`,
  `scope_widening`, `overgeneralized_claim`, etc.) continue to drive their
  own routing normally.

- **Audit-side disclosure** — `weak-sources.{json,md}` and
  `source-diversity-gaps.{json,md}` rollups annotate waived rows with
  `waived: true` and `waiver_reason: <verbatim>` when a matching section
  waiver is active. Rows are NOT removed (Law 16: waivers do not hide
  evidence). The publisher-monopoly fact is still surfaced in the rollup;
  it's disclosed as deliberately accepted rather than as an open blocker.

- **13 new tests** in `test/section-scoped-waivers.test.ts` covering
  schema validation (valid shape, missing reason, empty compensating
  controls, invalid scope enum, bad section_id regex), gate-side
  conversion (section_id match, section_id mismatch, primary_sources_required
  scope, pack-level regression, pack-policy refusal, multiple sections,
  multiple scopes for same section, disclosure in WaiverApplication),
  reviewer-side acknowledgement (waived monopoly → accepted, per-claim
  quality still routes, regression without waiver), and audit-side
  annotation.

- **`docs/section-scoped-waivers.md`** — full operator reference: schema,
  behavior contract, valid-cases / invalid-cases enumeration, required
  operator discipline (synthesis-time disclosure beyond the schema), and
  the release thesis. Opens with the canonical phrasing:
  *"Use section-scoped source waivers when publisher diversity is
  structurally incompatible with the section's truth source, not when a
  section merely failed to find enough sources."*

- **Handbook page** at `/handbook/section-scoped-waivers` — condensed
  reference matching the docs page.

### Changed

- **Pack-level `min_independent_publishers: 0` workaround DEPRECATED**
  in the canonical `research-packs/docs/operator-playbook.md` and the
  research-os handbook mirror. The pack-level pattern remains valid for
  already-frozen packs (e.g., `packages/comfyui-workflow-durability/`)
  whose freeze receipts are unchanged; new packs should prefer the
  section-scoped pattern. Forward notes added to
  [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) at the
  references to the deprecated workaround — historical content
  preserved, not rewritten.

### Documentation

- README status block updated to v0.3.1; version badge updated.
- `docs/roadmap.md` Experiment 3 progress: section-scoped source waivers
  shipped in v0.3.1; pack #2 of 3 (XRPL) earned both v0.3.0 and v0.3.1
  fixes. Two more external-domain packs required for closure.
- **Cross-repo:** `research-packs/docs/operator-playbook.md` updated in
  the same release window. Adds the section-scoped waiver pattern as the
  canonical guidance with the same anti-misuse framing as the research-os
  docs page (public guidance is consistent across the surface by design).
  Deprecates the `min_independent_publishers: 0` pack-level workaround.

### Tests

- **540 total** (527 at v0.3.0 → 540 at v0.3.1, +13 from
  `test/section-scoped-waivers.test.ts`).

### Migration notes

No code-level migration required. Existing packs continue to work
unchanged — `section_waivers` defaults to `[]`. Frozen packs' freeze
receipts remain valid (the schema addition is additive).

For new canonical-protocol packs: prefer section-scoped waivers over the
deprecated pack-level `min_independent_publishers: 0` workaround. The
section-scoped pattern preserves the publisher-diversity floor on every
section that doesn't waive it explicitly.

For operators with packs already using the deprecated pack-level
workaround: the pattern remains valid; no migration is required. If you
want to tighten the global default and waive specific sections instead,
that's a clean per-section migration — set
`min_independent_publishers` back to its non-zero pack default and add
section_waivers entries for the sections that need them, with
`reason` and `compensating_controls[]` documented.

## [0.3.0] — 2026-05-09

Tight release. One real, tested, dogfooded improvement: `--detector` flag on
`research-os contradict map`. F-09 from Experiment 3 Session 1 (XRPL pack)
earned the fix. No other v0.3 candidates shipped — F-01 (init version-stamp),
F-02 (packs-dir docs), F-05 (discover --query example), F-08 (Windows process
recovery) are deferred to v0.3.x.

### Added

- **`--detector <auto|heuristic|ollama-intern>`** flag on
  `research-os contradict map`. Three explicit modes:

  - `auto` (default) — preserves env-var-driven behavior. When the
    configured Ollama model is available, runs the LLM detector;
    otherwise falls through to heuristic. Mirrors v0.2.x behavior.
  - `heuristic` — bypasses Ollama entirely. No model availability check,
    no LLM calls. Always works. Always completes quickly.
  - `ollama-intern` — requires the configured model. Exits with code 2
    and a visible failure message if the model is unavailable, instead
    of silently falling back to heuristic.

  Invalid `--detector` values exit with code 2. The mode chosen is
  announced visibly on the first output line of every run; there are no
  silent shifts. Full reference: [`docs/contradict-map.md`](docs/contradict-map.md).

- **12 new tests** in `test/contradictions-detector-flag.test.ts` covering
  all three modes (heuristic never instantiates the Ollama client;
  ollama-intern errors visibly when model unavailable; auto preserves
  existing behavior; invalid value fails fast), heuristic ledger validity,
  and a regression fixture that mirrors the XRPL Section 01 pattern (~60
  claims with ~5-token shared vocabulary completes via heuristic in well
  under 30 seconds).

- **`docs/contradict-map.md`** — full CLI reference: detector modes, mode
  announcements (verbatim strings), when-to-use-which guidance, and the
  release thesis.

- **Handbook page** at `/handbook/contradict-map` — condensed reference
  matching the docs page.

### Changed

- **CLI `--help`** for `contradict map` now lists the three `--detector`
  choices.
- **Reference page** in the handbook updated to mention the flag and
  link to the new contradict-map page.

### Documentation

- README status block updated to v0.3.0; version badge updated.
- `docs/roadmap.md` Experiment 3 entry: F-09 chain blocker noted as
  resolved in v0.3.0 (Experiment 3 itself remains in progress; closure
  requires a third external-domain pack).
- **Cross-repo:** `research-packs/docs/operator-playbook.md` updated in
  the same release window. The earlier "clear `OLLAMA_INTERN_MODEL` to
  force heuristic" workaround is replaced with `--detector heuristic`
  as the canonical operator surface. The handbook mirror in this repo
  is kept consistent with the canonical.
- `SHIP_GATE.md` D2 updated: version bump + tag for v0.3.0.

### Tests

- **527 total** (515 at v0.2.0 → 527 at v0.3.0, +12 from
  `test/contradictions-detector-flag.test.ts`).

### Migration notes

No code-level migration required. Existing scripts that don't pass
`--detector` continue to work via `auto` mode.

For operators who previously cleared `OLLAMA_INTERN_MODEL` to force the
heuristic detector: that pattern still works in environments where the
default model isn't installed, but the flag is the canonical surface
and is environment-independent. Switch to `--detector heuristic` when
re-running narrow-topic sections; the v0.3.0 operator-playbook update
in `research-packs` documents the rationale.

## [0.2.0] — 2026-05-09

Tight release. Two real, tested, dogfooded improvements: `research-os pack publish`
(Experiment 2) and the Pattern 2 readiness predicate fix (Session 11 escalation).
No other v0.2 candidates shipped — remaining 7 items (large-page chunker, JSON-aware
excerpt chunker, publisher derivation, model-fallback warnings, contradict detector
strategy, GitHub source guidance, llms.txt guard) are deferred to v0.3/v0.x.

### Added

- **`research-os pack publish`** — exports a frozen pack into the canonical
  [`research-packs`](https://github.com/mcp-tool-shop-org/research-packs) archive format.
  CLI: `research-os pack publish --to <path> [--from <path>] [--operator-notes <text>] [--force] [--dry-run]`.
  Exit 0 on PASS, 2 on refusal. Derives `pack.manifest.json` from pack artifacts,
  generates `README.md` from `synthesis/final-report.md`, provisions `docs/how-to-read-this.md`
  scaffold, verifies the admission contract (5 required files, sha256 receipt reproduction,
  all fingerprinted artifacts). See [`docs/pack-publish.md`](docs/pack-publish.md).

- **48 new tests** under `test/pack-publish/` covering all 8 minimum-scope behaviors
  (copy, manifest derivation, sha256 verification, accepted-claims derivation,
  preserved-contradiction-records derivation, README generation, how-to-read scaffold,
  inline verify-pack) plus refusal cases (missing receipt, missing synthesis,
  freeze-refusal present, non-empty target without --force, tampered artifacts).

- **`docs/pack-publish.md`** — full CLI reference: flags, refusal cases, produced layout,
  what the command does NOT do, typical operator workflow.

- **`docs/pack-publish-dogfood.md`** — dogfood receipt: both existing `research-packs`
  packages re-derived via `pack publish` and verified by `research-packs/scripts/verify-pack.mjs`.
  `comfyui-workflow-durability` PASS (302 claims, 124 artifacts); `research-os-self-dogfood`
  PASS (296 claims, 131 artifacts).

- **Handbook page** at `/handbook/pack-publish` — condensed reference with flags, refusal
  cases, typical workflow, and links to the full reference doc and dogfood receipt.

### Changed

- **Pattern 2 readiness predicate enforcement completed** (commit `22b5dba`).
  `src/cowork/derive.ts:determineMode` and `src/audit/aggregate.ts:buildReadinessSummary`
  now use `active_blockers.length === 0` semantics instead of `repair_claim_ids.length === 0`
  and `repair_claims === 0`. Under Pattern 2, `needs_scope_repair`, `needs_source_repair`,
  and `needs_human_review` decisions are settled state (review ran, gate passed with
  sufficient accepted claims) — they are not active blockers.

  **Behavioral change:** packs that previously returned `audit: repair_required` or
  `handoff: repair_required` solely because claims carry intermediate reviewer decisions
  (not because any active gate blocker remains) now correctly return
  `audit: ready_for_synthesis` / `handoff: synthesis_ready`. The `active_blockers` field
  is now the authoritative readiness signal; it was already correctly computed but was
  not wired into the verdict in v0.1.

  The v0.1 dogfood pack (`research-os-self-dogfood`) is regression-clean under the new
  predicate — it used the heuristic reviewer (only `accepted_for_synthesis` and `rejected`
  decisions), so `repair_claim_ids.length === 0` was equivalent to `active_blockers.length === 0`
  by coincidence. That coincidence is gone; the intent is now enforced directly.

### Documentation

- README status block updated to v0.2.0; `pack publish` mentioned in the workflow chain.
- `docs/roadmap.md` Experiment 2 entry updated: `IMPLEMENTED → CLOSED 2026-05-09`.
- `SHIP_GATE.md` D2 updated: version bump + tag for v0.2.0.

### Tests

- **515 total** (467 at v0.1.1 → 515 at v0.2.0, +48 from `test/pack-publish/`).

### Migration notes

No migration required for existing v0.1.x packs. The Pattern 2 predicate change is
forward-only: if your pack previously returned `repair_required` and the verdict was
wrong (all active gate blockers were already resolved), re-running `research-os audit`
or `research-os cowork handoff` after upgrading to v0.2.0 will return the correct
`ready_for_synthesis` / `synthesis_ready` verdict. Existing freeze receipts remain valid.

## [0.1.1] — 2026-05-08

Documentation and release-alignment patch. No code or behavior changes — all production source and tests are identical to v0.1.0 (463 vitest cases, all passing).

### Added
- `docs/roadmap.md` — five experiments that stand between v0.1 and v1.0 (API stability under external pressure, non-self-referential dogfood, extractor-provenance gap closure, reviewer-calibration generalization, hermes3 baseline).
- README "What v0.1 is not" section disclosing what hasn't been validated yet.
- README "Known limitations" section naming the extractor-provenance gap and the model-substitution caveat.
- README "Roadmap to v1.0" section linking to the roadmap doc.
- Centered logo in README, hosted at `mcp-tool-shop-org/brand`.
- Status badges: version, CI, license, Node ≥20, handbook.
- Translated READMEs in 7 languages (ja, zh, es, fr, hi, it, pt-BR) plus the language nav bar.
- `publishConfig.access=public` in `package.json` for the scoped npm package.

### Fixed
- README workflow chain order: `review`/`review-promote` come before `gate` (gate consumes review decisions, not the other way around). Quick-start commands updated to match.
- README CLI invocation: `--triaged-only --preset hermes-two-pass --profile hermes-two-pass` matches the actual demonstrated workflow.
- `pages.yml` workflow trigger: `branches: [master]` (was `[main]`); the deploy never fired on the v0.1.0 push because of this. Site is now live at <https://mcp-tool-shop-org.github.io/research-os/>.

### Why a patch release
The v0.1.0 tag was created before the documentation pass landed. The npm tarball at `0.1.0` already includes the corrected README (it was published after the doc commits), but the GitHub tag/release pointed to the pre-doc commit. v0.1.1 realigns everything: tag, GitHub Release, and npm tarball all point at the same coherent state.

## [0.1.0] — 2026-05-08

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
- `research-os claim extract <section>` — Link 4 of the workflow chain
- `Claim` schema (zod): `claim_id` / `source_ids` / `source_hashes` / `asserts` / `scope` / `not` / `evidence_excerpt` / `evidence_location` / `confidence` / `extractor` / `extraction_method` / `created_at` / `review_state`. Every emitted claim ships at `review_state: candidate` — extraction never promotes
- `HeuristicClaimExtractor`: one candidate claim per source-card `key_point` with `extraction_method: heuristic_key_point`, `scope: null`, `not: null`, `confidence: low` — labelled honestly as shallow
- `OllamaInternClaimExtractor`: 3-7 propositional claims per source via local Ollama HTTP, each with its own `asserts` / `scope` / `not` triple grounded in a literal `evidence_excerpt`. Falls back to heuristic when unavailable
- `OLLAMA_HOST` host normalization: bare `127.0.0.1:11434` and `localhost:11434` are accepted alongside fully-qualified URLs; trailing slashes stripped
- Re-runs of `claim extract` are idempotent — claim_ids dedupe by `clm_<source-hash>_<extractor>_<index>`
- `NoSourcesGatheredError` when claim extraction is invoked on an empty section
- 26 new tests (79 total)
- `research-os contradict map <section>` — Link 5 of the workflow chain
- `Contradiction` schema (zod) with six tension types: `direct_conflict` / `scope_conflict` / `temporal_conflict` / `definition_conflict` / `evidence_conflict` / `overgeneralization_risk`. Severity, confidence, scope_analysis, overlap_assessment, status (always `unresolved` at write), detector, detection_method
- Pair-wise comparison of `review_state: candidate` claims within a single section. Section-scoped only; cross-section mapping is a later link
- `HeuristicContradictionDetector`: scope-aware similarity + negation matching. Surfaces direct_conflict (token overlap + negation mismatch + overlapping/unknown scope) and overgeneralization_risk (asymmetric scope-tagging on claims that share substantive tokens). Conservative thresholds; only low/medium confidence
- `OllamaInternContradictionDetector`: pair-wise LLM classification across all six tension types with explicit "none" path; falls back cleanly when unavailable
- Stable `contradiction_id` = `cnt_<sha256(sorted_claim_pair)>_<detector>` — deterministic and dedup-friendly across re-runs
- Markdown view written to `sections/<id>/contradictions.md` is regenerated each run; honest "0 candidates detected" when nothing fires; ledger appended to `sections/<id>/contradictions.jsonl`
- Load-bearing law added: **contradiction mapping surfaces tension; it does not resolve, synthesize, or decide which claim wins**
- `research-os gate <section>` — Link 6 of the workflow chain
- Seven gate families: `source_floor` (min_sources, min_independent_publishers, primary_sources_required + waiver, failed-fetches visibility), `claim_integrity` (every_claim_needs_source, no_orphan_claims, source_hashes_present, evidence_excerpt_present, fetch_receipt_anchored, no_source_cluster_monopoly), `scope_integrity` (no_untagged_universal_claims, not_constraint_present, no_blocking_overgeneralization, low-severity overgen warning, scope-tagging summary), `freshness` (policy applicability, no_stale_sources, publication_date_known), `contradiction` (unresolved_visible, unresolved_blocks_synthesis, contradiction_required_by_policy), `section_budget` (budget_configured, runtime_tracking honest about not-yet-tracked), `waivers` (primary-source waiver post-pass that converts fail → pass_with_waiver only when reason + compensating_controls + pack-policy permission all present)
- Verdict model: `pass` / `warn` / `fail` / `blocked`. `synthesis_eligible: boolean` is the real switch — failures with `blocks_synthesis: true` produce `blocked` verdict; non-blocking failures produce `fail` but remain synthesis-eligible
- Structured gate result schema: section_id, verdict, summary, checked_at, gate_results[], failures[], warnings[], waivers_applied[], blocking_reasons[], synthesis_eligible, claim_counts, source_counts, contradiction_counts, freshness_summary, scope_integrity_summary, next_actions[]
- Outputs: `audits/<section>-gate.json` (structured), `audits/<section>-gate.md` (human-readable)
- `research.yaml.sections[]` status promoted to `gated` only when synthesis_eligible; never downgraded
- Load-bearing law added: **gates decide whether a section is eligible for synthesis; they do not synthesize, rewrite claims, resolve contradictions, or hide failure**
- `research-os review <section>` — Link 7 of the workflow chain
- Thirteen finding categories: `unsupported_claim`, `ungrounded_excerpt`, `stale_claim`, `overgeneralized_claim`, `scope_widening`, `missing_not_constraint`, `source_quality_problem`, `source_cluster_monopoly`, `unmapped_contradiction`, `recommendation_exceeds_evidence`, `hidden_synthesis`, `definition_drift`, `temporal_mismatch`
- Severity model: `info` / `warn` / `block`
- Six review decisions: `accepted_for_synthesis`, `rejected`, `needs_scope_repair`, `needs_source_repair`, `needs_contradiction_mapping`, `needs_human_review`
- `HeuristicReviewer`: missing-field detection, evidence-grounding re-verification against raw text, scope-null risk, unresolved-contradiction involvement, source-cluster monopoly per-claim, source-quality mismatch (high confidence + forum/unknown source type), stale-claim per pack freshness policy, hidden-synthesis flag when brief.md exceeds stub state
- `OllamaInternReviewer`: pair-pass over candidate claims for `overgeneralized_claim`, `scope_widening`, `definition_drift`, `recommendation_exceeds_evidence`, `hidden_synthesis`, `temporal_mismatch`. **Critical guard**: any LLM finding citing a claim_id or source_id not in the input is rejected as ungrounded reviewer output (counted in `llmFindingsRejected`). Falls back to heuristic when unavailable
- Append-only ledgers: `audits/<section>-findings.jsonl` and `sections/<id>/claim-reviews.jsonl`. **`claims.jsonl` is never mutated** — extraction truth and review truth are separate
- Snapshot artifacts (regenerated each run): `audits/<section>-review.json` (structured) and `audits/<section>-review.md` (human-readable)
- Section status promoted from `gated` → `reviewed` only when **every** candidate claim has decision=`accepted_for_synthesis`
- Load-bearing law added: **adversarial review judges research integrity; it does not synthesize, rewrite source truth, or erase extraction history**
- `research-os index build [section]` / `research-os index export-repo-knowledge` / `research-os index sync-repo-knowledge` / `research-os query <term>` — Link 8 of the workflow chain
- Pack-local SQLite index at `.research-os/index.sqlite` (auto-gitignored). Schema: `sections`, `sources`, `claims`, `contradictions`, `review_findings`, `claim_reviews`, `gate_results`, `fetch_receipts`, `artifacts`, plus FTS5 virtual table `facts_fts` for human-queryable text. Every indexed row carries `artifact_path` so search results point back to canonical files; the SQLite row is a pointer + acceleration layer, not the evidence
- Re-build is deterministic and idempotent — re-indexing a section deletes its rows then re-inserts from current artifact state. Canonical artifacts (`claims.jsonl`, `contradictions.jsonl`, `claim-reviews.jsonl`, `findings.jsonl`, `gate.json`, source-cards, fetch-log) are never mutated by index build or query
- Snippet-based query results group by record type; FTS5 prefix queries supported (`prefix='2 3 4'`)
- `export-repo-knowledge` writes `evidence/repo-knowledge/research-os-facts.jsonl` with one fact per row (`fact_type`, `id`, `section_id`, `text`, `artifact_path`, `metadata`, `pack_origin`, `exported_at`). The export is portable; no runtime dependency on `@mcptoolshop/repo-knowledge`
- `sync-repo-knowledge` is optional and dynamic — when `@mcptoolshop/repo-knowledge` is locally installed and exposes `ingestFacts`, the index syncs in; when absent, the command exits cleanly with a clear "skipped, use export instead" message. **No hard runtime dependency on repo-knowledge**
- `IndexNotBuiltError` when querying or exporting before a build has run
- Load-bearing law added: **indexing makes research truth queryable; it does not create new truth, rewrite truth, or become the source of record**
- `research-os cowork handoff` — Link 9 of the workflow chain
- Renders the pack's current research-truth state into a runtime contract for Cowork. Outputs `handoffs/cowork-handoff.json` (structured) + `handoffs/cowork-master.md` (rendered runtime). The static template at `prompts/cowork-master.md` is the source template and is never mutated by handoff
- Three handoff modes: `repair_required` (sections blocked, no accepted claims, or repair decisions outstanding — Cowork may gather/repair/re-run gates and review, may NOT write final synthesis); `synthesis_ready` (required sections synthesis-eligible, accepted claims exist, no unwaived blocking contradictions — Cowork may produce cross-section synthesis using accepted_claim_ids only); `human_review_required` (invalid waiver state, blocking contradictions, malformed artifacts, or ambiguous review states — Cowork prepares options, doesn't decide)
- `synthesis_allowed: boolean` is the operational switch. Mode-specific `allowed_write_paths[]` constrain Cowork's write surface
- `forbidden_actions[]` ships as pack invariants regardless of mode: never mutate claims.jsonl / source-cards / audits, never cite outside the source ledger, never widen scope, never flatten unresolved contradictions, never write final synthesis when mode != synthesis_ready
- `recommended_next_actions[]` are mode-specific and concrete: in `repair_required` they enumerate per-section commands (`research-os gate <id>`, `research-os review <id>`, etc.); in `synthesis_ready` they walk through synthesis structure
- `index_status` reported as `present` / `missing`. Missing index produces a warning but does not fail handoff generation — Cowork can still operate from canonical artifacts
- Mode determination: any malformed artifact / invalid waiver (granted but missing reason or compensating_controls) / unresolved high-or-blocking contradiction → `human_review_required`. Else any not-ready section → `repair_required`. Else → `synthesis_ready`
- Latest review decision per claim wins (claim-reviews.jsonl is append-only; effective state = claim + latest decision). Re-running cowork handoff is idempotent
- Load-bearing law added: **cowork handoff renders operational instructions from research truth; it does not create truth, bless weak claims, or bypass gates**
- `research-os synth workspace` — Link 10 of the workflow chain
- **Refusal as feature, not error gap.** When `handoffs/cowork-handoff.json` is in `repair_required` or `human_review_required` mode, the workspace command refuses to create synthesis files and exits with code 2 plus a clear remediation message. No empty synthesis placeholders ever appear in repair mode
- When mode is `synthesis_ready`: writes `synthesis/cross-section-map.json` (structured) and `synthesis/cross-section-map.md` (human-readable map). Both regenerated each run — they are derived state, not Cowork's drafts
- Also writes `synthesis/decision-brief.md`, `synthesis/working-report.md`, `synthesis/final-report.md` as guardrail-headed writable workspaces — only created if absent so Cowork's drafts are preserved across re-runs. Each carries enforced citation rules in the front-matter (cite only `allowed_synthesis_inputs[]`, never widen scope, preserve unresolved contradictions, disclose all waivers)
- `CrossSectionMap` schema: pack_id / pack_topic / pack_decision / generated_at / accepted_claim_ids / sections[] / claim_clusters[] / shared_sources[] / scope_overlaps[] / cross_section_contradictions[] / waiver_dependencies[] / open_questions[] / allowed_synthesis_inputs[] / forbidden_inputs[]
- Claim-cluster derivation via union-find on shared `source_ids`; scope-overlap detection via Jaccard similarity on `scope` strings (threshold 0.3); cross-section contradictions identified by claim_ids spanning multiple sections
- `forbidden_inputs[]` enumerates every non-accepted claim with its decision and reason — synthesis must not cite them
- `HandoffNotFoundError` when handoff hasn't been generated yet; `SynthesisNotReadyError` carries the mode for diagnostic clarity
- Load-bearing law added: **synthesis workspace organizes accepted research truth for Cowork; it does not create synthesis, bless repair-mode claims, or bypass handoff mode**
- `research-os audit` — Link 11 of the workflow chain
- Pack-level rollups derived from existing section truth (gate JSON, review JSON, claims, contradictions, claim-reviews, source-cards, fetch-log, handoff). Eight markdown rollups + JSON siblings: `pack-audit.{json,md}`, `orphan-claims.{json,md}`, `stale-sources.{json,md}`, `weak-sources.{json,md}`, `unresolved-contradictions.{json,md}`, `scope-widening-risks.{json,md}`, `source-diversity-gaps.{json,md}`, `synthesis-readiness.{json,md}`
- Six audit categories: orphan_claims (missing source card / hash / excerpt / unresolvable source_id), stale_sources (too_old / missing_date / unparseable_date per pack policy), weak_sources (cluster monopoly / low publisher count / missing primary / type imbalance / failed-fetches reducing floor), unresolved_contradictions (with explicit "clean ledger ≠ proof of completeness" disclosure), scope_widening_risks (overgeneralization findings, scope=null in use, missing not), source_diversity_gaps (per-section monopoly + cross-section publisher overlap)
- Pack verdict: `ready_for_synthesis` (every section ready), `repair_required` (some sections need work), `human_review_required` (invalid waivers / blocking contradictions / malformed artifacts), `blocked` (no section has been gated — foundational gap). Verdict never invents green state when section gates are missing
- Every audit row carries `artifact_path` so rollups are pointers back to canonical evidence; canonical artifacts are never mutated. Idempotent: re-running with the same inputs produces the same rollups
- `pack-audit.json` schema includes section_summaries / claim_summary / source_summary / contradiction_summary / review_summary / waiver_summary / readiness_summary / audit_files / blocking_reasons / warnings / next_actions
- Audit rollups are themselves indexable by Link 8 — re-running `research-os index build --all` makes the audit JSON files queryable through `research-os query`
- Load-bearing law added: **pack audit aggregates existing research truth; it does not create new truth, resolve failures, or hide section-level evidence**
- `research-os freeze` — Link 12 of the workflow chain (final integrity lock)
- **Refusal as feature, not error gap.** Freeze refuses unless every pass condition holds: pack-audit verdict=ready_for_synthesis, handoff mode=synthesis_ready, synthesis workspace exists, final-report.md cites accepted claim_ids only (via `[claim:clm_...]` references), unresolved contradictions disclosed in decision-brief or final-report, waivers disclosed similarly, every section has a gate result on file, all canonical artifacts parse cleanly. On refusal, exits with code 2 and writes `audits/freeze-refusal.json` + `audits/freeze-refusal.md`. Does NOT write freeze-receipt.* on refusal. Does NOT mark the pack frozen on refusal
- On pass: writes `audits/freeze-receipt.json` + `audits/freeze-receipt.md`, sha256-fingerprints every canonical artifact + every synthesis file, sets `research.yaml.frozen_at = <ISO>`, bumps every section status to `frozen`. Removes any stale freeze-refusal artifact from a prior failed run
- Receipt schema: pack_id / frozen_at / verdict='frozen' / pack_audit_hash / handoff_hash / synthesis_hashes[] / canonical_artifact_hashes[] / accepted_claim_ids[] / cited_claim_ids[] / uncited_accepted_claim_ids[] / unresolved_contradictions[] (with disclosed_in pointers) / waivers_disclosed[] (with disclosed_in pointers) / sections[] / counts / integrity_checks[]
- Refusal schema: pack_id / checked_at / verdict='refused' / reasons[] / blocking_reasons[] / missing_artifacts[] / invalid_artifacts[] / next_actions[] / would_freeze=false. next_actions[] are concrete commands derived from reasons
- Citation rule: synthesis markdown must use explicit `[claim:clm_<id>]` references for freeze-grade traceability. Plain prose, source URLs, or vague mentions don't count
- `frozen_at: string | null` field added to research.yaml schema with default null; existing packs continue to validate
- Load-bearing law added: **freeze locks completed research truth; it does not complete unfinished research, excuse missing synthesis, or convert repair state into evidence**
