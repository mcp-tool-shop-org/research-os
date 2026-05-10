# Experiment 3 Pack-3 Proof — Godot Export/Runtime Durability

**Topic:** What makes a Godot narrative game build durable across engine versions, export templates, platform targets, asset pipelines, save/runtime behavior, and distribution surfaces?

**Arc:** v1 Experiment 3, pack #3 of 3. Mixed-shape domain: canonical engine docs (Godot Foundation RSTs), platform-vendor requirements (Apple, Microsoft, Google, Mozilla), practical community evidence (SaveState Lite, GodotSteam, ForgeJSONGD), and closed distribution surfaces (Steam, Nintendo, Sony) that are structurally inaccessible to the v0.1 fetch model. Deliberately contrasts both Experiment 1's ComfyUI (community-distribution-shaped) and pack #2's XRPL (canonical-protocol-shaped). This is the mixed-shape case.

**Public archive:** [`mcp-tool-shop-org/research-packs/packages/godot-export-runtime-durability/`](https://github.com/mcp-tool-shop-org/research-packs/tree/main/packages/godot-export-runtime-durability/)

---

## The answer

Godot narrative-game build durability is a **layered release-state problem, not a single export step**. Successful engine export is not the same thing as a durable playable release.

A studio or solo developer managing a live Godot narrative game needs a decision per layer — not a one-time export:

1. Engine version and export template pin (Godot major versions break API compatibility)
2. Scene/resource reference graph discipline (UID vs path-string references)
3. Save schema versioning (the built-in save APIs provide no schema migration)
4. Scripting language and toolchain policy (GDScript vs C# toolchain; GDExtension binary-placement constraints)
5. Desktop code signing and certificate management (macOS notarization; Windows MSIX; certificate renewal)
6. Mobile/web platform policy compliance (C# web export gap; Android APK size caps; iOS post-export Xcode steps)
7. Distribution channel selection and public verification ceiling (itch.io fully accessible; Steam/console structurally inaccessible to the v0.1 fetch model)

The seventh layer carries a hard ceiling for this pack: all Valve web properties are jQuery/client-side rendered with no plain-text alternate. Console developer portals are login-gated or similarly JS-rendered. The pack's Steam and console evidence is limited to GodotSteam community tooling and GitHub issue evidence — not Steamworks SDK requirements. This ceiling is structural, not a research gap, and is disclosed in full in the closed-surface ledger (`pack/audits/source-diversity-gaps.md`).

The full synthesis lives in [`packages/godot-export-runtime-durability/synthesis/final-report.md`](https://github.com/mcp-tool-shop-org/research-packs/blob/main/packages/godot-export-runtime-durability/synthesis/final-report.md). This proof doc tells the **research-os generalization story**, not the Godot story.

---

## The three-pack parallel

The Experiment 3 arc's claim is that the bundle thesis generalizes across domain shapes, not just the specific domain content:

- **ComfyUI (Experiment 1):** *Workflow JSON is not the whole workflow.* The runnable state bundle is six elements: ComfyUI core version, Python/PyTorch/CUDA environment, custom-node dependency state, model checkpoint identity, workflow schema version, and distribution metadata.
- **XRPL (Experiment 3 pack #2):** *Ledger finality is not the whole creator-token durability story.* Seven interdependent layers span on-ledger state, amendment voting, key management, transfer mechanics, and off-chain metadata reachability.
- **Godot (Experiment 3 pack #3):** *Successful engine export is not the whole playable release story.* Seven independent failure boundaries span engine versioning, scene serialization, save migration, scripting toolchain, desktop signing, mobile/web gatekeepers, and distribution surfaces.

Same claim structure, three different domain shapes. Each pack's evidence is claim-traceable. Each pack's freeze receipt is independently verifiable. Experiment 3 is **closed**.

---

## The seven release-shaping findings

Pack-3 contributed four new release-shaping findings (F-40 broadened, F-41 escalated, F-43, F-44) atop the three earned by the XRPL pack (F-09 → v0.3.0, F-10/F-11 → v0.3.1, F-36 → v0.3.2). Collectively, these seven findings describe how v0.3.x evolved under external pack pressure:

### 1. v0.3.0 — `--detector` flag (F-09, XRPL Session 1)

The pre-v0.3.0 workaround for the ollama-intern stall — clearing `OLLAMA_INTERN_MODEL` before `contradict map` — was state-dependent and broke silently once `hermes3:8b` was pulled. F-09 earned a `--detector <auto|heuristic|ollama-intern>` flag: explicit detector selection, environment-independent, fails fast on invalid values, announces mode at command start. Tight scope, no schema changes.

### 2. v0.3.1 — Section-scoped source waivers (F-10/F-11, XRPL Sessions 2–3)

The publisher-diversity floor inverts for canonical-protocol sections: the XRPL Foundation IS the authoritative ground truth for XRPL by design — adding third-party publishers does not improve truth quality. F-10/F-11 earned `primary_source_waiver.section_waivers[]` — per-section relaxation with `reason` + non-empty `compensating_controls[]` preserved in the audit trail. Generalizes to every single-foundation domain where truth is structurally single-publisher.

### 3. v0.3.2 — Normalized accepted-claim accounting (F-36, XRPL Sessions K–M)

`claim-reviews.jsonl` is append-only; reviewer windows can overlap; the same `claim_id` can legitimately receive multiple `accepted_for_synthesis` records. The pre-v0.3.2 admission contract refused on the seam (strict equality between raw row count and legacy audit count). F-36 shipped `getEffectiveAcceptedClaimIds` (latest-decision-wins per `claim_id`), demoted legacy mismatch from refusal to soft warn, and preserved hard refusal for real integrity failures (phantom `claim_id`, incompatible duplicate decisions, non-synthesis-eligible gate).

### 4. F-40 BROADENED — Content-shape detection across 12 distinct mis-type patterns (Pack-3 Sessions 1–7)

F-40 was first observed in Pack-3 Session 1: Godot Foundation tutorial RST files typed as `docs` when they are primary-equivalent content. By Session 7 it had expanded to 12 distinct mis-type patterns across 7 sections: itch.io pricing pages typed as `forum`; itch.io distribution guides typed as `secondary`; GodotSteam README typed as `primary`; Apple and Microsoft developer docs typed as `docs` only because `docs` is the mis-type default. Total mis-type rate across non-GH-Search sources: >60%. The F-27 pre-chain source-card audit was the load-bearing mitigation — every section was audited and repaired before extraction ran. F-40 is a v0.3.3 candidate: a content-shape model using URL patterns, document structure, and publisher type as signals.

### 5. F-41 ESCALATED — `no_source_cluster_monopoly` fires 100% false-positive rate (Pack-3 structural finding)

The claim-level `no_source_cluster_monopoly` WARN fires on every claim across all seven Pack-3 sections, asserting that 100% of claims trace to a single publisher. This is structurally incorrect: the gate's publisher-attribution logic does not correctly propagate the publisher field from repaired source cards through to the claim-level check. The misfire does not cascade to a gate failure (WARN, not FAIL) and does not affect claim correctness or reviewer decisions. Confirmed 7× across Pack-3 and previously in Pack-1 and Pack-2. F-41 is a v0.3.3 candidate: redesign the monopoly checker's publisher-attribution chain to operate at source-card-set level rather than claim level.

### 6. F-43 — Gate accumulation asymmetry (Pack-3 Sessions 4–5)

Pack-wide gate checks (`min_independent_publishers`, `primary_sources_required`) evaluate against the full pack's accumulated source set, not the current section's sources in isolation. Section 01 ran first with 1 publisher — required 2 waivers. If Section 01 had run last (after 9 other publishers accumulated), it would have required 0 waivers for identical evidence. The asymmetry is bidirectional and run-order-sensitive. This is a gate-engine design question — whether section-local and pack-wide checks should be separately reportable — confirmed across 3 single-publisher sections (01: dual-waiver, 02: 0, 04: 0) at two different run positions. F-43 is a v0.3.3 candidate: A-vs-B-vs-hybrid design call.

### 7. F-44 — Valve entire-web-presence is JS-rendered with no alternate (Pack-3 Session 7)

All `partner.steamgames.com/*` and `store.steampowered.com/*` URLs return HTTP 200 but contain only JavaScript initialization stubs and zero extractable prose. This is distinct from F-42 (Apple `developer.apple.com/documentation/*`): Apple has a known Markdown API alternate at `docs.developer.apple.com`; Valve has no known alternate. The barrier is the v0.1 fetch model's inability to execute client-side JavaScript — not a partner login gate. Even public Steam pages are inaccessible. F-44 is a v0.3.3 candidate: operator-playbook documentation of the Valve barrier and a potential "closed-surface staging mode" that automatically routes JS-shell URLs to the closed-surface ledger.

---

## Operating-mode discipline earned across the Experiment 3 arc

| Discipline | Origin |
|------------|--------|
| Operator-staged URLs over LLM discovery for code-repository + engine topics | XRPL Session 1; reaffirmed in every Pack-3 section |
| Live URL verification BEFORE staging — every session, not just first | F-21 |
| Pre-chain global source-card audit before every extraction run | F-27 mitigation — load-bearing in Pack-3 (>60% mis-type rate without repair) |
| `--detector heuristic` for narrow-vocabulary canonical-engine sections | F-09 → v0.3.0 |
| Section-scoped waivers per section, each independently justified | F-10/F-11 → v0.3.1 |
| `getEffectiveAcceptedClaimIds` at pack publish — latest-decision-wins per `claim_id` | F-36 → v0.3.2 |
| Apple `developer.apple.com/documentation/*` → Markdown API alternate at `docs.developer.apple.com` | F-42 (Pack-3 Session 3) |
| Microsoft `learn.microsoft.com/*` → GitHub raw alternate | Pack-3 Session 3 |
| Closed-surface ledger discipline: document inaccessible JS-shell URLs as audit evidence, not as gaps to paper over | Pack-3 Session 7 (F-44) |
| F-37 `.gitattributes -text` rule applied preemptively for Windows-frozen packs | F-37 — applied at Pack-3 closeout; Pack-2 earned it reactively |
| Honest Terminal B beats a fake Terminal A | Arc-wide |

Full doctrine in [`mcp-tool-shop-org/research-packs/docs/operator-playbook.md`](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md).

---

## The frozen pack

Pack: `research-os-packs/what-makes-a-godot-narrative-game-build-durable-across-engin/` — operating workspace, read-only reference post-freeze.

Public archive: [`packages/godot-export-runtime-durability/`](https://github.com/mcp-tool-shop-org/research-packs/tree/main/packages/godot-export-runtime-durability/) in `mcp-tool-shop-org/research-packs`.

- 276 accepted claims across 7 sections (per-section effective sum; 272 unique claim IDs globally after deduplication — 4 claim IDs appear accepted in two sections each).
- 0 dispositioned claims.
- 0 unresolved contradictions; 0 preserved contradiction records.
- 3 `gate.source_floor` waivers: Sections 01/`min_independent_publishers`, 01/`primary_sources_required`, 03/`primary_sources_required`. All waivers reflect gate-accumulation timing, not evidence weakness — Section 01 ran first, before publisher diversity accumulated; Section 03 ran second.
- All 7 gates `synthesis_eligible=true`.
- 114 unique claim IDs cited across 3 synthesis files (194 total citations, 0 invalid). 41.5% coverage of unique accepted set — freeze validates citation correctness only, not coverage percentage.
- `research.yaml.frozen_at: 2026-05-10T09:46:27.052Z`.

**Freeze receipt fingerprints** (from `pack/audits/freeze-receipt.json`):

| Artifact | sha256 (first 16 chars) |
|----------|------------------------|
| pack-audit | `6b32c67719069ef3` |
| cowork-handoff | `b0761b92eeba4b7a` |
| synthesis/cross-section-map.json | `7d8fc2dc191a5d5b` |
| synthesis/cross-section-map.md | `93d858d7aba25708` |
| synthesis/decision-brief.md | `a94a2ff88876e53a` |
| synthesis/working-report.md | `2aa3562800d5ee2e` |
| synthesis/final-report.md | `5a472f56a2dfd493` |
| research.yaml (post-freeze) | `a86d2edda93db26d` |

Full receipt: [`pack/audits/freeze-receipt.json`](https://github.com/mcp-tool-shop-org/research-packs/blob/main/packages/godot-export-runtime-durability/pack/audits/freeze-receipt.json) — 127 fingerprinted artifacts, independently verifiable with `node scripts/verify-pack.mjs packages/godot-export-runtime-durability` from the monorepo root. Expected: `PASS` with receipt sha256 `55a65792caed9c026e76d4913c939a0f656a777a0a130e0b8a0d29ad6cf41235`.

---

## v0.3.3 candidate scope earned by the arc

Frictions logged but not shipped. All deferred to v0.3.3; none block Experiment 3 closure:

- **F-37 (P2, product side):** `pack publish` should emit the `.gitattributes -text` snippet at admission time so operators don't need to apply it manually. Until then, the operator discipline is documented in the playbook.
- **F-40 (P1-adjacent):** Content-shape detection in the extractor. Fix the extractor's `source_type` inference to use URL patterns, document structure, and publisher type as signals. Target: reduce the manual source-card repair rate from >60% to <10% on non-GH-Search sources.
- **F-41 (P2):** Redesign the `no_source_cluster_monopoly` checker's publisher-attribution chain to operate at source-card-set level rather than claim level. The WARN fires 100% false-positive rate across all packs tested.
- **F-42 (P2, scoped):** Document the Apple `documentation/*` Markdown API alternate in the operator-playbook more prominently. Scope confirmed: Apple `documentation/*` only.
- **F-43 (P2):** Design decision on section-local vs pack-wide gate semantics. Options: (a) add a separate section-local check mode; (b) keep pack-wide-only; (c) expose both. Requires a product spec before implementation.
- **F-44 (P2):** Document the Valve/Steam JS-rendering barrier in the operator-playbook as a structural constraint. Consider a "closed-surface staging mode" that automatically routes JS-shell URLs to the closed-surface ledger.

F-09 SHIPPED in v0.3.0. F-10/F-11 SHIPPED in v0.3.1. F-36 SHIPPED in v0.3.2.

---

## Did the abstraction hold?

Yes. The mixed-shape case proved what neither the ComfyUI nor XRPL packs could have proved alone: canonical engine docs, practical community evidence, platform-vendor requirements, and structurally closed distribution surfaces can coexist inside one pack without flattening the gate model into a single behavior. Section 01 (canonical engine docs, single publisher) required two waivers. Section 06 (mobile/web, four platform-vendor publishers) required none. Section 07 (distribution surfaces) hit a hard public-verification ceiling on Steam and console — the pack disclosed that ceiling correctly rather than papering over it. Three different gate behaviors, one pack, all correct.

The Godot pack is also the first pack in the arc to surface F-43 structurally: the run-order-sensitive waiver asymmetry (Section 01 dual-waiver because it ran first; Sections 02 and 04 zero-waiver despite being similarly single-publisher because they ran later). The gate worked as designed; the design has an asymmetry worth a product decision in v0.3.3.

The F-37 discipline was applied preemptively at Pack-3 closeout — no CI failure between PR merge and follow-up hotfix (the friction Pack-2 experienced). That's the closing proof that the discipline is learnable and transferable within the same arc.

The bundle thesis stands. Three packs, three domain shapes, one claim structure: the thing the platform calls "the artifact" is not the unit of durability — the surrounding bundle is. Experiment 3 is closed.
