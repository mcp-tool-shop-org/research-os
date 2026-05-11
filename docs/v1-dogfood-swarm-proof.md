# v1.0 Dogfood Swarm Proof

**Date:** 2026-05-11
**Repo:** `mcp-tool-shop-org/research-os`
**Companion to:** [`v1-readiness-packet.md`](v1-readiness-packet.md) (the verdict + contract document)
**Final commit prior to release:** `d263751` (Stage D presentation polish amend wave)
**Final test count:** 901/901 (713 → 901, +188 across the 4-stage swarm)

---

This document is the historical record of how v1.0 was earned. The [`v1-readiness-packet.md`](v1-readiness-packet.md) documents *what* v1.0 claims and what it does NOT claim. This document documents *how* those claims were verified through a four-stage dogfood swarm executed against research-os itself — including two cross-agent integration escapes that were caught structurally and corrected forward, each producing a permanent doctrine ratchet.

The pattern mirrors the [`experiment-6-proof.md`](experiment-6-proof.md) format: not a marketing artifact, an evidence trail.

---

## Why a swarm

The v0.6.0 readiness packet ([`v1-readiness-packet.md`](v1-readiness-packet.md)) declared v1.0 *unblocked from substance*, but explicitly punted on the health pass: *"the product is structurally sound, but the code has not been put through a multi-stage audit pass at v0.6.0 maturity."* The swarm was that pass.

Four stages, each with the same audit → review → amend → re-audit cycle but different lenses:

- **Stage A — bug/security:** Find and fix defects. Repeat until 0 CRITICAL + 0 HIGH.
- **Stage B — proactive resilience:** Defensive coding gaps, observability, graceful degradation, supply-chain hygiene.
- **Stage C — operator humanization:** Error messages that help, progress feedback, recovery documentation, discoverability.
- **Stage D — presentation polish:** Handbook + README + repo metadata + CLI output rendering. No behavior changes.

Each stage was a read-only audit (3-5 concurrent agents in exclusive file lanes), an advisor triage report, a Phase 3 amend wave (3-5 concurrent agents per lane), and a Phase 4 read-only re-audit confirming convergence. Reports + closeouts live in `dogfood-labs/swarms/mcp-tool-shop-org--research-os/reports/`.

## Stage-by-stage outcomes

| Stage | Phase 1 findings | Amend commit | Phase 4 verdict |
|---|---|---|---|
| A | 70 findings: 14 CRIT + 25 HIGH + 19 MED + 12 LOW | `fb4752c` (Wave 1) + `3e98b3e` (Wave 2 escape-close) | CONVERGED at `3e98b3e` — 0 CRIT/HIGH, A-RE-001 caller-migration escape caught + corrected forward |
| B | 9 v1.0 blockers + 3 release-doc + 27 POST-v1 | `c804f04` (Wave 3) | CONVERGED at `c804f04` — 8 of 9 blockers fixed inline; B-E-004 npm provenance scope-downed to v1.x with disclosure |
| C | 43 findings: 3 CRIT + 12 HIGH + 15 MED + 12 LOW | `dd22582` (Wave 4) + `68130c6` (Phase 4 correct-forward) | CONVERGED at `68130c6` — 22 v1.0 blockers + 1 correct-forward closed; C2-RE-001 cross-domain handoff escape caught + corrected forward |
| D | 26 findings: 0 CRIT + 5 HIGH + 11 MED + 10 LOW | `d263751` (Wave 6) | CONVERGED at `d263751` — 0 v1.0 blockers; 11 release-doc fixes; PB-002 v2.0-track lock |

Total amend waves: 4 commits + 2 correct-forward commits = 6 wave commits in the release stack atop the prior v0.6.0 release commit `298321f`.

## Cross-agent integration escape #1 — A-RE-001 (caller migration)

**Stage:** A, Wave 1 → Wave 2
**Pattern:** Helper API was added; caller was not migrated to use it.

Wave 1 Agent A landed a new `appendSectionSourceId` helper in `src/sources/`. The unit test for the helper passed at the helper level. But `gather.ts` (the actual production caller) was not migrated to call the new helper; it continued to use the deprecated inline append path. Phase 4b audit caught this via the **end-to-end-through-actual-caller** verification doctrine: a "helper has tests + caller theoretically migrated" claim is insufficient — the audit must trace the test through to the live entrypoint OR grep for the deprecated path and confirm zero callers.

The Wave 2 correct-forward (`3e98b3e`) deleted the deprecated `appendSectionSourceId` API entirely, migrated `gather.ts`, and added a regression test asserting the symbol is `undefined` on the public surface (**old-API-dead assertion** doctrine — assertion-that-it's-gone is part of the closure).

**Doctrine ratchet #1 codified:** *Agents do not mark a finding "closed" without an end-to-end test through the actual caller. The Phase 4 audit must be able to grep for the deprecated path and confirm zero callers, or trace the test through to the live entrypoint.* This rule held through Stages B, C, and D.

## Cross-agent integration escape #2 — C2-RE-001 (cross-domain handoff)

**Stage:** C, Wave 4 → Phase 4 correct-forward
**Pattern:** Env-var plumbing added; corresponding Commander flag registration framed as "handoff" in a closeout but never picked up.

Wave 4 Agent C2 landed `src/util/progress.ts` with TTY-detect + env-var threading for `RESEARCH_OS_NO_PROGRESS` / `RESEARCH_OS_FORCE_PROGRESS`. Because C2's exclusive file ownership did not include `src/cli.ts`, the Commander flag registration (`.option('--no-progress', ...)` × 4 commands) was deferred to "C1 handoff" in C2's Phase 3 closeout §4. Wave 4's Agent C1 modified `src/cli.ts` for other structured-error work but never picked up the handoff. The Wave 4 CHANGELOG entry overclaimed *"--no-progress / --progress Commander options on review, gather, contradict map, pack publish"* — the env-var plumbing was wired, but the operator-visible CLI flag was not.

Phase 4 read-only re-audit caught this structurally: C2 auditor ran `node ./dist/cli.js gather --no-progress test` and got `error: unknown option '--no-progress'`. Grep for the option registration on `src/cli.ts` returned zero matches. The 13-case regression test from C2 was passing at the env-var helper layer; the binary-layer reproduction-flip failed.

The Phase 4 correct-forward (`68130c6`) — coordinator-inline amend, no separate Wave 5 agent — added the 4 Commander option registrations + `applyProgressFlags(argv)` helper + 13-case integration test asserting both env-var translation and the reproduction-flip from "unknown option" to "option accepted" at the binary layer.

**Doctrine ratchet #2 codified:** *When an agent's fix requires changes in another agent's domain to be operator-visible, the cross-domain dependency is a tracked work item with its own ID, assigned to the receiving agent in the same wave. "Handoff" is not a status; it's an explicit pickup task with an owning agent. Closeout footnotes do not constitute assignment.* Carried into Stage D.

## Doctrine ratchet #3 — No working-tree archaeology

**Earned from:** A Stage A Wave 1 incident where Agent B mis-diagnosed working-tree state as "stash leakage" and ran broad `git checkout HEAD -- <files>` calls clobbering other agents' work.

**Codified rule:** *No broad git ops. Never run `git checkout HEAD -- <path>`, `git restore`, `git reset --hard`, `git clean -fd`, or `git stash`. If the working tree looks surprising, STOP and report — do not "clean up". Working-tree archaeology is forbidden. Recovery is coordinator-owned; agents file observations, the coordinator decides whether to act.*

This rule was read verbatim at the start of every agent brief in Stages B, C, and D. Zero broad-git-op violations across the 16 agents dispatched in those stages.

## Doctrine ratchet #4 — Hard-gate items must be fillable BEFORE shipcheck re-pass

**Earned from:** A Phase 10 advisor sequence error caught by the executor pre-action.

The original advisor Phase 10 sequence placed GitHub metadata sync near step 10 and put initial shipcheck at step 1. SHIP_GATE.md Section D includes translations + GitHub metadata as hard-gate items per the global *"Hard gate (A–D): Must pass before any version is tagged or published"* rule. The original sequence would have arrived at tag/publish (steps 7-8) with the metadata hard gate still unchecked — a release-procedure violation.

Caught pre-action by reading SHIP_GATE.md Section D verbatim against the executor's own memory at `feedback_shipgate_hard_gates.md`. Reordered Phase 10 to: step 3 docs/version → step 4 translations → step 5 GitHub metadata sync → step 6 *re-run shipcheck as the actual release-authorization gate* → step 7 final verification → step 8 release commit → step 9 push/tag → step 10 publish/release.

**Codified rule:** *Hard gates in shipcheck are not just step items in the release sequence; they are pre-conditions for tag/publish. The sequence must guarantee every hard-gate item is fillable BEFORE the shipcheck re-pass that authorizes tag/publish, and the re-pass is a discrete step, not an inherited assumption. "Initial shipcheck → fill gaps → re-pass shipcheck → tag" is the canonical shape.*

This is the first **advisor-side** doctrine ratchet (the prior three were agent-side). Documenting it here puts it in the historical record alongside the agent escapes.

## Coordination incidents (process, not product)

Three documented coordination incidents during the swarm — each produced a process refinement, not a code change. These are filed in the historical record because the swarm doctrine evolved through them:

1. **Stage A auto-triage misstep.** Coordinator initially attempted self-triage of Stage A Phase 1 findings (approving 31 fixes, deferring 8 LOWs). User course-corrected: *"No self-triage. We're working with a team that needs a report after every wave."* Subsequent stages always paused for advisor triage after Phase 1.
2. **Stage A Wave 1 Agent B ownership violation.** Agent B misdiagnosed working-tree state and ran broad git restore ops clobbering other agents' edits. Triggered doctrine ratchet #3 (no working-tree archaeology) and a single-recovery-agent pattern instead of broad cleanup.
3. **Stage B Wave 3 Agent A truncated notification.** Agent A's final message ended mid-sentence: *"Dir exists. Now write the regression test:"* — substantial work landed but disclosure tasks incomplete and 2 test fixtures broken on non-hex tokens. Coordinator inline fix (hex-mnemonic substitution + B-A-003 disclosure addition) closed without re-dispatch.

All three incidents were called out in commit messages and closeout reports. Honest record beats clean linear history.

## Test count evidence trail

```
v0.6.0 baseline                              713/713 tests
Stage A Wave 1 (fb4752c)                     +47 tests → 760/760
Stage A Wave 2 (3e98b3e)                     +8 tests → 768/768
Stage B Wave 3 (c804f04)                     +41 tests → 809/809
Stage C Wave 4 (dd22582)                     +77 tests → 886/886
Stage C Phase 4 correct-forward (68130c6)    +13 tests → 899/899
Stage D Wave 6 (d263751)                     +2 tests → 901/901
                                             ─────────
TOTAL                                        +188 tests across the swarm
```

Every new test is a regression assertion against a specific finding. Net addition: 188 load-bearing tests preserving the property they were added to enforce. Zero tests deleted; 3 pre-existing tests intentionally inverted (Stage A pattern: contract change requires the prior test to flip — documented in Wave 4 commit body).

## Frozen-pack regression evidence

All 4 packs verified byte-identical against documented baselines at every phase boundary throughout the swarm:

- After Stage A Wave 1, Wave 2: byte-identical ✓
- After Stage B Wave 3: byte-identical ✓
- After Stage C Wave 4, Phase 4 correct-forward: byte-identical ✓
- After Stage D Wave 6: byte-identical ✓
- Phase 9 final test: byte-identical ✓

Receipt sha256s (unchanged from v0.3.3 baselines):

```
research-os-self-dogfood         368d23613783ef48b36cccd814463b3f413d514eb7a37792653142ef1fd5d466
comfyui-workflow-durability      d71943c6444d4bb5ba38ae577089498d119b95f00caed8f068f0ee09c79038eb
xrpl-creator-token-durability    6511a044aa15fa4de30a0dfc82b811947e1f57a1563fd1d7ba013a64725259a5
godot-export-runtime-durability  55a65792caed9c026e76d4913c939a0f656a777a0a130e0b8a0d29ad6cf41235
```

The frozen packs were never touched by the swarm — only the production code was modified. The byte-identical regression is the canonical proof that the swarm did not regress any frozen pack's reproducibility.

## POST-v1 backlog — 86 items synthesized for v1.x

The swarm filed 86 POST-v1 items across all 4 stages, preserved at `reports/stage-b-phase1-post-v1-backlog.md` (single-file rule):

- Stage B Phase 1: 28 items (proactive-health discoveries below the v1.0 threshold)
- Stage C Phase 1 audit: 11 items (humanization polish below v1.0 threshold)
- Stage C Phase 3 amend-wave: 14 items (filed during amend, not implemented inline per scope discipline)
- Stage C Wave 4 error-taxonomy candidates: 13 items (semantic-broadening codes; advisor decision = defer all to v1.x)
- Stage C Phase 4 audit: 5 items (handbook-pointer integrity gaps, sweep-test absence)
- Stage D Phase 1+3: 15 items (handbook polish, CLI label-format v2.0-track, README metadata edges)

Synthesized into v1.x themes in [`roadmap.md`](roadmap.md). The raw 86-item manifest stays coordinator-internal as swarm output; the public roadmap carries the synthesized themes.

## What this proves

- **The code is correct.** 0 CRIT/HIGH after Stage A; 0 v1.0 blockers after Stage B; 0 v1.0 blockers after Stage C; 0 v1.0 blockers after Stage D.
- **The doctrine is enforced.** 4 doctrine ratchets codified, each anchored to a concrete escape that the doctrine would have caught.
- **The contract is honest.** Three release-notes disclosures (B-E-001, B-E-004, B-A-003) preserved as historical disclosures, not buried.
- **The 4-pack regression is canonical.** Every release from v0.3.3 through v1.0.0 verifies that frozen packs reproduce byte-identically.
- **Cross-agent integration discipline is mature.** Two escapes caught structurally + corrected forward without amending history or scrubbing the record.

## Companion documents

- [`v1-readiness-packet.md`](v1-readiness-packet.md) — verdict + 8 claims + 6 non-claims + caveat disposition + API/semver contract + release prerequisites
- [`release-notes/v1.0.0.md`](release-notes/v1.0.0.md) — release announcement and changelog
- [`roadmap.md`](roadmap.md) — six closed experiments + v1.x themes synthesized from the 86-item POST-v1 backlog
- [`experiment-6-proof.md`](experiment-6-proof.md) — Hermes deterministic baseline (the experiment that closed Phase 0 and earned v0.6.0)
- [Swarm closeout reports](https://github.com/mcp-tool-shop-org/research-os/tree/master/) — coordinator-internal, preserved in `dogfood-labs/swarms/mcp-tool-shop-org--research-os/reports/`
