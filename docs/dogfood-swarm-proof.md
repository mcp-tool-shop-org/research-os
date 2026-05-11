# Dogfood Swarm Hardening Proof

**Date:** 2026-05-11
**Repo:** `mcp-tool-shop-org/research-os`
**Release:** [`v0.7.0`](release-notes/v0.7.0.md) (hardening release, not v1)
**Final commit prior to release:** `d263751` (Stage D presentation polish amend wave)
**Final test count:** 901/901 (713 → 901, +188 across the 4-stage swarm)

---

This document is the historical record of the dogfood swarm executed against `research-os` on 2026-05-11. It documents what the swarm found, what the swarm fixed, what doctrine it codified, and — critically — what the swarm did **not** prove.

The swarm hardened the machinery. It did not produce v1. v1 readiness work continues; the missing v1 evidence is documented at the end of this file.

This proof doc is a companion to [`v1-readiness-packet.md`](v1-readiness-packet.md) — but where that earlier readiness packet declared v1 ready, this proof revises that judgment after the swarm: the swarm uncovered enough gaps in the operator-facing story to make v1 require a fresh end-to-end production proof, not just a clean code audit.

---

## What the swarm was

Four stages, each with the same audit → review → amend → re-audit cycle but different lenses:

- **Stage A — bug/security:** Find and fix defects. Repeat until 0 CRITICAL + 0 HIGH.
- **Stage B — proactive resilience:** Defensive coding gaps, observability, graceful degradation, supply-chain hygiene.
- **Stage C — operator humanization:** Error messages that help, progress feedback, recovery documentation, discoverability.
- **Stage D — presentation polish:** Handbook + README + repo metadata + CLI output rendering. No behavior changes.

Each stage was a read-only audit (3-5 concurrent agents in exclusive file lanes), an advisor triage report, a Phase 3 amend wave (3-5 concurrent agents per lane), and a Phase 4 read-only re-audit confirming convergence. Reports + closeouts live in `dogfood-labs/swarms/mcp-tool-shop-org--research-os/reports/` (coordinator-internal, not shipped in the npm tarball).

## Stage-by-stage outcomes

| Stage | Phase 1 findings | Amend commit | Phase 4 verdict |
|---|---|---|---|
| A | 70 findings: 14 CRIT + 25 HIGH + 19 MED + 12 LOW | `fb4752c` (Wave 1) + `3e98b3e` (Wave 2 escape-close) | CONVERGED at `3e98b3e` — 0 CRIT/HIGH; A-RE-001 caller-migration escape caught + corrected forward |
| B | 9 v1.0 blockers + 3 release-doc + 27 POST-v1 | `c804f04` (Wave 3) | CONVERGED at `c804f04` — 8 of 9 blockers fixed inline; B-E-004 npm provenance deferred with disclosure |
| C | 43 findings: 3 CRIT + 12 HIGH + 15 MED + 12 LOW | `dd22582` (Wave 4) + `68130c6` (Phase 4 correct-forward) | CONVERGED at `68130c6` — 22 + 1 blockers closed; C2-RE-001 cross-domain handoff escape caught + corrected forward |
| D | 26 findings: 0 CRIT + 5 HIGH + 11 MED + 10 LOW | `d263751` (Wave 6) | CONVERGED at `d263751` — 0 v1.0 blockers; 11 release-doc fixes; PB-002 v2.0-track lock |

Total amend waves: 4 commits + 2 correct-forward commits = 6 wave commits in the release stack atop the prior v0.6.0 release commit `298321f`.

## Cross-agent integration escape #1 — A-RE-001 (caller migration)

**Stage:** A, Wave 1 → Wave 2
**Pattern:** Helper API was added; caller was not migrated to use it.

Wave 1 Agent A landed a new `appendSectionSourceId` helper in `src/sources/`. The unit test for the helper passed at the helper level. But `gather.ts` (the actual production caller) was not migrated to call the new helper; it continued to use the deprecated inline append path. Phase 4b audit caught this via the **end-to-end-through-actual-caller** verification doctrine.

The Wave 2 correct-forward (`3e98b3e`) deleted the deprecated API entirely, migrated `gather.ts`, and added a regression test asserting the symbol is `undefined` on the public surface.

**Doctrine ratchet #1 codified:** *Agents do not mark a finding "closed" without an end-to-end test through the actual caller. The Phase 4 audit must be able to grep for the deprecated path and confirm zero callers, or trace the test through to the live entrypoint.*

## Cross-agent integration escape #2 — C2-RE-001 (cross-domain handoff)

**Stage:** C, Wave 4 → Phase 4 correct-forward
**Pattern:** Env-var plumbing added; corresponding Commander flag registration framed as "handoff" in a closeout but never picked up.

Wave 4 Agent C2 landed `src/util/progress.ts` with TTY-detect + env-var threading for `RESEARCH_OS_NO_PROGRESS` / `RESEARCH_OS_FORCE_PROGRESS`. Because C2's exclusive file ownership did not include `src/cli.ts`, the Commander flag registration was deferred to "C1 handoff" in C2's Phase 3 closeout §4. Wave 4's Agent C1 modified `src/cli.ts` for other structured-error work but never picked up the handoff.

Phase 4 read-only re-audit caught this structurally: C2 auditor ran `node ./dist/cli.js gather --no-progress test` and got `error: unknown option '--no-progress'`. The 13-case regression test from C2 was passing at the env-var helper layer; the binary-layer reproduction-flip failed.

The Phase 4 correct-forward (`68130c6`) — coordinator-inline amend, no separate Wave 5 agent — added the 4 Commander option registrations + `applyProgressFlags(argv)` helper + 13-case integration test asserting both env-var translation and the reproduction-flip from "unknown option" to "option accepted" at the binary layer.

**Doctrine ratchet #2 codified:** *When an agent's fix requires changes in another agent's domain to be operator-visible, the cross-domain dependency is a tracked work item with its own ID, assigned to the receiving agent in the same wave. "Handoff" is not a status; it's an explicit pickup task with an owning agent. Closeout footnotes do not constitute assignment.*

## Doctrine ratchet #3 — No working-tree archaeology

Earned from a Stage A Wave 1 incident where an agent misdiagnosed working-tree state and ran broad `git checkout HEAD -- <files>` calls clobbering other agents' work.

**Codified rule:** *No broad git ops. Never run `git checkout HEAD -- <path>`, `git restore`, `git reset --hard`, `git clean -fd`, or `git stash`. If the working tree looks surprising, STOP and report — do not "clean up". Working-tree archaeology is forbidden. Recovery is coordinator-owned.*

This rule was read verbatim at the start of every agent brief in Stages B, C, and D. Zero broad-git-op violations across the 16 agents dispatched in those stages.

## Doctrine ratchet #4 — Hard-gate items must be fillable BEFORE shipcheck re-pass

Earned from a release sequencing error caught pre-action by the executor.

The initial release sequence placed GitHub metadata sync near step 10 and put initial shipcheck at step 1. SHIP_GATE.md Section D includes translations + GitHub metadata as hard-gate items per the global *"Hard gate (A–D): Must pass before any version is tagged or published"* rule. The original sequence would have arrived at tag/publish (steps 7-8) with the metadata hard gate still unchecked. Reordered to: docs/version → translations → GitHub metadata sync → *re-run shipcheck as the release-authorization gate* → final verification → release commit → push/tag → publish/release.

**Codified rule:** *Hard gates in shipcheck are not just step items in the release sequence; they are pre-conditions for tag/publish. The sequence must guarantee every hard-gate item is fillable BEFORE the shipcheck re-pass that authorizes tag/publish, and the re-pass is a discrete step, not an inherited assumption.*

This is the first **advisor-side** doctrine ratchet; the prior three were agent-side.

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

Every new test is a regression assertion against a specific finding. Zero tests deleted; 3 pre-existing tests intentionally inverted (Stage A pattern: contract change requires the prior test to flip — documented in Wave 4 commit body).

## Frozen-pack regression evidence

All 4 packs verified byte-identical against documented baselines at every phase boundary throughout the swarm. Receipt sha256s (unchanged from v0.3.3 baselines through v0.7.0):

```
research-os-self-dogfood         368d23613783ef48b36cccd814463b3f413d514eb7a37792653142ef1fd5d466
comfyui-workflow-durability      d71943c6444d4bb5ba38ae577089498d119b95f00caed8f068f0ee09c79038eb
xrpl-creator-token-durability    6511a044aa15fa4de30a0dfc82b811947e1f57a1563fd1d7ba013a64725259a5
godot-export-runtime-durability  55a65792caed9c026e76d4913c939a0f656a777a0a130e0b8a0d29ad6cf41235
```

The frozen packs were never touched by the swarm — only the production code was modified. The byte-identical regression is the canonical proof that the swarm did not regress any frozen pack's reproducibility.

## POST-v1 backlog — 86 items synthesized

The swarm filed 86 POST-v1 items across all 4 stages, preserved coordinator-internal at `reports/stage-b-phase1-post-v1-backlog.md`:

- Stage B Phase 1: 28 items
- Stage C Phase 1 audit: 11 items
- Stage C Phase 3 amend-wave: 14 items
- Stage C Wave 4 error-taxonomy candidates: 13 items
- Stage C Phase 4 audit: 5 items
- Stage D Phase 1+3: 15 items

These are post-v0.7.0 themes synthesized into the public roadmap in [`docs/roadmap.md`](roadmap.md). The raw 86-item manifest stays coordinator-internal as swarm output.

## What the swarm proved

- **The hardening landed.** 0 CRIT/HIGH after Stage A; 0 v0.7.0 blockers after Stages B/C/D. 901/901 tests passing.
- **The doctrine is enforced.** 4 ratchets codified, each anchored to a concrete escape that the doctrine would have caught.
- **The frozen-pack regression is canonical.** Every release v0.3.3 → v0.7.0 reproduces the 4 receipts byte-identically.
- **Cross-agent integration discipline is mature.** Two escapes caught structurally + corrected forward without amending history.
- **The release-procedure discipline matured.** Hard-gate items are now fillable BEFORE the shipcheck re-pass that authorizes tag/publish.

## What the swarm did NOT prove (open for v1 readiness arc)

This is the load-bearing section. The swarm fixed the machinery; it did not produce the product-level evidence v1 requires.

- **No fresh end-to-end pack with the current toolchain.** The 4-pack regression verifies that *historical* frozen artifacts reproduce byte-identically. It does not prove a new operator can take v0.7.0, run `init → discover → gather → claims → review → gate → synth → freeze → publish` on a fresh topic, recover from realistic failures using the new `handbook/recovery.md` runbook, and produce a pack the reader can audit without first reading project history.
- **No clean operator happy-path guide.** Stage C produced the recovery surface (`handbook/recovery.md`) and the per-error handbook pointers. It did not produce a single, sharp, top-to-bottom operator guide that walks a first-time user through pack production. The handbook still feels like a method-evaluation reference, not a how-to-use-the-product guide.
- **No simplified reviewer-trust story for operator-facing audiences.** The calibration machinery is sound; the operator-facing "should I trust this model?" answer still requires reading `docs/experiment-6-proof.md`. v1 needs a shorter, sharper answer — possibly `comparison_only` by default.
- **No external-operator validation.** The swarm hardened the code; it did not introduce a new external operator who reproduced a pack with the current docs and recovered from a real failure. That validation is the missing v1 evidence.
- **No release-copy proof.** A failed v1.0.0 ship attempt on this same date (rolled back as v0.7.0 within the npm 72h unpublish window) confirmed that v1 release-copy cannot lead with the swarm narrative or with a feature/non-claim inventory. v1 release-copy must lead with the product's primary use case and the operator's reason for using it.

## The v1 readiness arc (open work after v0.7.0)

Five V1-BLOCKERs framed during the v0.7.0 rollback discussion:

1. **V1-BLOCKER-1: fresh current-version pack proof.** A new pack on a fresh topic, produced with v0.7.0+, frozen, published, and audit-able without reading project history.
2. **V1-BLOCKER-2: clean happy-path operator guide.** Top-to-bottom walkthrough that does not require the reader to be familiar with experiment history or swarm doctrine.
3. **V1-BLOCKER-3: recovery guide proven against real failures.** `handbook/recovery.md` exercised against actual failure modes during the V1-BLOCKER-1 pack production.
4. **V1-BLOCKER-4: reviewer trust story simplified.** A short answer to "what reviewer should I use?" that does not require reading `experiment-6-proof.md`.
5. **V1-BLOCKER-5: release copy rewritten around product value, not caveat inventory.** Lead with what the product does and who it's for, not with the workflow's refusals.

## What you do with v0.7.0

If you want to take `research-os` for a real run today — with safer ingestion, structured recovery paths, discoverable runbooks, and known limitations stated honestly — this is the release to use. The next pack you make with v0.7.0 will not be a v1 proof on its own, but the swarm work means you are less likely to lose state to a malformed input or a partial-failure window.

The work that earned v0.7.0 is real. The work that earns v1 still remains.

## Companion documents

- [`release-notes/v0.7.0.md`](release-notes/v0.7.0.md) — release announcement
- [`v1-readiness-packet.md`](v1-readiness-packet.md) — earlier readiness packet (verdict superseded by the v1 readiness arc the swarm uncovered)
- [`roadmap.md`](roadmap.md) — six closed experiments + open v1 readiness arc
- [`experiment-6-proof.md`](experiment-6-proof.md) — Hermes deterministic baseline (the experiment that closed Phase 0 and earned v0.6.0)
- Coordinator-internal swarm closeouts at `dogfood-labs/swarms/mcp-tool-shop-org--research-os/reports/`
