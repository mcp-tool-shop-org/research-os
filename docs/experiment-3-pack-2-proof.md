# Experiment 3 Pack-2 Proof — XRPL Creator Token Durability

**Topic:** What makes XRPL creator-token holdings durable over time — across token-standard versions, account access changes, and ledger-state evolution — and what should a creator-side control plane track to keep them runnable, transferable, and provable?

**Arc:** v1 Experiment 3, pack #2 of 3. Canonical-protocol-shaped domain with one explicit multi-publisher section (off-chain durability layer). Distinct domain shape from Experiment 1's ComfyUI (community-distribution-shaped, multi-publisher); pack #3 will deliberately contrast both.

**Public archive:** [`mcp-tool-shop-org/research-packs/packages/xrpl-creator-token-durability/`](https://github.com/mcp-tool-shop-org/research-packs/tree/main/packages/xrpl-creator-token-durability/)

---

## The answer

XRPL creator-token durability is a **multi-layer state bundle, not a single property**. A creator-side control plane that tracks only on-ledger state will miss the dominant failure mode in practice — because XRPL protocol durability does not imply creator-token durability. A token's persistence depends on seven interdependent layers:

1. Token-paradigm choice (NFTokens / MPTs / trust-line tokens / XRP)
2. Account and key control (master keys, signer-list multi-sign, tickets, account deletion)
3. On-ledger state and reserves (base + owner reserve solvency)
4. Issuer-retained controls and immutability (freeze, Clawback, NFTokenModify under DynamicNFT)
5. Transfer and trade mechanics (direct/brokered NFTokenAcceptOffer, DEX, Payment, Escrow)
6. Amendment state and validator landscape (voting, activation, validator software supply chain)
7. Off-chain metadata durability (URI reachability, IPFS pinning + Filecoin storage, content-hash verification)

The seventh layer is where the pack's central thesis lives: URI on-chain + content unavailable off-chain = nominal token, no semantic content. The full thesis lives in [`packages/xrpl-creator-token-durability/synthesis/final-report.md`](https://github.com/mcp-tool-shop-org/research-packs/blob/main/packages/xrpl-creator-token-durability/synthesis/final-report.md). This proof doc tells the **research-os generalization story**, not the XRPL story.

---

## The four release-shaping findings

### 1. v0.3.0 was earned by XRPL Session 1 (`contradict map --detector` flag)

The operator-playbook's pre-v0.3.0 workaround for the ollama-intern contradiction stall — clear `OLLAMA_INTERN_MODEL` before `contradict map` so the heuristic fallback engages — silently broke when `hermes3:8b` was already installed and the stall happened mid-window instead of pre-window. Session 1 surfaced F-09: an operator could not confidently reach the heuristic detector by clearing an env var. The fix was a `--detector <auto|heuristic|ollama-intern>` flag with explicit detector selection and a visible `contradict map: using <name> detector` mode announcement at command start. Tight scope, one feature, npm + GitHub release, no schema changes.

### 2. v0.3.1 was earned by XRPL Sessions 2–3 (section-scoped source waivers)

Sections 01–06 of the XRPL pack are canonical-protocol-shaped: XRPL Foundation owns the protocol (rippled), the standards (XLS), and the documentation (xrpl.org). Pre-v0.3.1, research-os assumed publisher diversity was a proxy for truth quality across all sections — but for canonical-protocol sections, third-party publishers cannot provide more authoritative ground truth than the protocol-defining body. F-10/F-11 surfaced the structural mismatch. The fix was a `primary_source_waiver.section_waivers[]` schema (each entry: `section_id` + `scope` + `reason` + non-empty `compensating_controls[]`), reviewer-side acknowledgement of waived `source_cluster_monopoly` findings, and audit-side disclosure surfaces. Pattern 2 reviewer-pipeline integration was completed under load: the section-scoped waiver propagates from gate output through reviewer findings to the cowork handoff.

### 3. Section 07 validated v0.3.1 by clearing publisher diversity WITHOUT a waiver

**The strongest product proof of the entire arc.** Sections 01–06 each carried explicit `section_waivers[]` entries with documented `compensating_controls[]`. Section 07 (off-chain durability layer — XRPLF + IPFS Foundation + Arweave + GitHub developer-discussion surface) cleared the global publisher-diversity floor on its own merits at gate-time, without invoking a waiver. The waiver feature is honest discipline, not a universal floor-relaxer: when the source surface genuinely supports multi-publisher diversity, the waiver does not engage and the floor does its work. When the source surface is structurally single-publisher (canonical-protocol sections), the waiver engages with explicit compensating controls. Same pack, two different gate behaviors, both correct. This is what proves the v0.3.1 mechanism is not a backdoor.

### 4. v0.3.2 was earned by XRPL Sessions K–M (closure-ledger counting reconciliation)

`claim-reviews.jsonl` is append-only and reviewer windows can overlap (default `review_window: 10`); the same `claim_id` can legitimately receive multiple `accepted_for_synthesis` records when it falls in two consecutive windows. Pre-v0.3.2 admission used strict equality between `claim-reviews.jsonl` decision counts and `pack-audit.json::accepted_claims` and refused on the seam — Session K refused at Section 07 (24 raw rows / 19 unique `claim_id`s). The fix shipped `getEffectiveAcceptedClaimIds` (latest-decision-wins per `claim_id`) at [`src/closure-ledger/effective-accepted.ts`](../src/closure-ledger/effective-accepted.ts), demoted legacy mismatch from refusal to soft warn, and preserved hard refusal for real integrity failures (phantom `claim_id`, incompatible duplicate decisions, non-synthesis-eligible gate). The XRPL pack is the first frozen-from-scratch pack on the v0.2.0+v0.3.x admission contract whose reviewer-window-overlap pattern surfaced the seam — the test caught what the self-referential dogfood arc could not.

---

## Operating-mode discipline earned across the arc

| Discipline | Origin |
|------------|--------|
| Operator-staged URLs > LLM discover for canonical-protocol domains | Session 1 (XRPL); reaffirms ComfyUI's same finding |
| Live URL verification BEFORE staging (every session, not just first) | F-21 |
| Pre-chain global source-card audit (session-opening discipline) | F-27 mitigation |
| `--detector heuristic` for narrow-vocabulary canonical-protocol sections | F-09 → v0.3.0 |
| Source-card audit-and-re-type as standard for canonical-protocol packs | F-23 + F-26 |
| Section-scoped waivers per section, each independently justified with `reason` + non-empty `compensating_controls[]` | F-10/F-11 → v0.3.1 |
| `xls.xrpl.org` sources contribute proportional to content size | F-28 |
| Reviewer-window-overlap is a normal artifact of the append-only review ledger; downstream consumers must use the effective-set helper | F-36 → v0.3.2 |

Full doctrine in [`mcp-tool-shop-org/research-packs/docs/operator-playbook.md`](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md).

---

## The frozen pack

Pack: `research-os-packs/xrpl-creator-token-durability/` — operating workspace, read-only reference post-freeze.

Public archive: [`packages/xrpl-creator-token-durability/`](https://github.com/mcp-tool-shop-org/research-packs/tree/main/packages/xrpl-creator-token-durability/) in `mcp-tool-shop-org/research-packs`.

- 251 effective accepted claims across 7 sections (post-F-36 normalization; was 256 in pre-admission cowork handoff before Section 07 dedup applied).
- 0 dispositioned claims.
- 0 unresolved contradictions; 0 preserved contradiction records.
- All 7 gates `synthesis_eligible=true`. Sections 01–06 each carry an explicit `min_independent_publishers` section_waiver with `compensating_controls[]`. Section 07 cleared the global publisher-diversity floor without a waiver — five independent publishers detected at gate-time.
- 100% citation coverage at freeze: 243 cited / 243 accepted (the freeze-time count; the v0.3.2 admission applies the F-36 normalization, producing 251 in the published manifest).
- `research.yaml.frozen_at: 2026-05-10T00:25:19.025Z`.

**Freeze receipt fingerprints** (from `pack/audits/freeze-receipt.json`):

| Artifact | sha256 (first 16 chars) |
|----------|------------------------|
| pack-audit | `de306d254ac76900` |
| cowork-handoff | `646bebe0909e3aee` |
| synthesis/cross-section-map.json | `28f3fd5960c0e9f0` |
| synthesis/decision-brief.md | `616c01c7db7e6916` |
| synthesis/working-report.md | `1b5934c1ca6f55e1` |
| synthesis/final-report.md | `8a8b779962438db4` |
| research.yaml (post-freeze) | `80a10a2ebd88917d` |

Full receipt: [`pack/audits/freeze-receipt.json`](https://github.com/mcp-tool-shop-org/research-packs/blob/main/packages/xrpl-creator-token-durability/pack/audits/freeze-receipt.json) — 137 fingerprinted artifacts, independently verifiable with `node scripts/verify-pack.mjs packages/xrpl-creator-token-durability` from the monorepo root. Expected: `PASS` with receipt sha256 `6511a044aa15fa4de30a0dfc82b811947e1f57a1563fd1d7ba013a64725259a5`.

---

## v0.3.x candidate scope earned by the arc

Frictions logged but not shipped. Priority annotations are advisor-locked:

- **P1:** F-27 (cross-section gather reverts), F-35 (cross-section-map waiver-dependency mismatch).
- **P2:** F-23 (extractor under-typing canonical sources), F-26 (extractor over-typing non-deterministically), F-31 (xrplmeta JS-shell), F-21 (URL staleness verification).
- **P3:** F-22 (LLM nondeterminism), F-28 (xls.xrpl.org content-size pattern), F-30 (rippled-releases topic-skew).
- **Below P3:** F-24, F-25, F-29, F-32, F-33, F-34.

F-09 SHIPPED in v0.3.0. F-10/F-11 SHIPPED in v0.3.1. F-36 SHIPPED in v0.3.2.

---

## Did the abstraction hold?

Yes. The chain generalized to a non-self-referential canonical-protocol-with-off-chain-edges domain. Three release-shaping fixes (v0.3.0, v0.3.1, v0.3.2) shipped through the public interface and were validated against the same parked pack at each release boundary. Section 07's no-waiver result proves the v0.3.1 mechanism is honest discipline, not a universal floor-relaxer. F-36's fix was earned by an external pack pressure that the self-referential dogfood arc could not have surfaced — reviewer-window-overlap is a normal artifact of the calibrated reviewer pipeline at scale, and only an external pack with overlapping windows could have produced the seam.

The bundle thesis stands. The chain finds the bundle, not any single layer, as the unit of token durability. The evidence base is claim-traceable. The freeze receipt fingerprints are independently verifiable. Experiment 3 is **not yet closed** — pack #3 of 3 (TBD external domain) remains to prove generalization across a third domain shape.
