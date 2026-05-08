# Dogfood Proof — research-os v0.1

`research-os` v0.1 was gated through its own dogfood pack before shipping. The pack (`research-os-packs/research-os-spec/`) researches the spec for `research-os` itself. Running the system on itself under production conditions found seven correctness gaps before the first release. Each gap required a real code fix; each fix earned a law or integration pattern. The freeze step confirmed the chain holds end-to-end.

## The seven findings

1. **Waivers manufactured synthesis eligibility (Law 16).** Gate allowed `synthesis_eligible=true` on sections with zero or one accepted claim — no diversity to check. Added hard floors: `min_accepted_claims=3`, `min_accepted_sources=2`, `waiver_allowed=false`. Tests: 405 → 425.

2. **No resolution path for contradictions.** Detected contradictions were permanently "unresolved" — no mechanism to record a resolution decision. Added `research-os contradict resolve` and `contradiction-resolutions.jsonl`; gate, reviewer, and cowork now read effective statuses via latest-status-wins. Tests: +6.

3. **Audit split-brain on contradiction-resolutions.jsonl (Pattern 1, instance 1).** `contradict resolve` shipped without wiring the pack audit. Audit reported 1,080 unresolved; cowork reported 0. Audit wired to read the resolution ledger with the same semantics as gate and cowork. Tests: 431 → 436.

4. **Audit and cowork missed claim-synthesis-dispositions.jsonl (Pattern 1, instance 2).** Disposition layer added without wiring both pack-level readers in the same session. Both were wired before the session closed, per the pattern earned in finding 3. Tests: +18 across findings 4–6.

5. **Cowork handoff readiness used candidate-set completeness (Pattern 2, instance 1).** `determineMode` required every candidate to be accepted — defeating the overproduction-then-curate architecture. Corrected to active-blocker semantics: readiness is the count of claims and contradictions that are still open, not whether the full candidate set was consumed.

6. **Synthesis citation format + freeze timestamp comparison.** Workspace templates emitted `[clm_...]`; freeze validator expected `[claim:clm_...]`. Separately, `freeze/run.ts` compared decision strings as timestamps in a latest-wins Map. Both fixed. Tests: → ≥454.

7. **Audit readiness used candidate-set completeness (Pattern 2, instance 2).** `buildReadinessSummary` had the same stale predicate as cowork. Freeze refused because audit said `repair_required` while cowork said `synthesis_ready`. Corrected to active-blocker semantics. Tests: 454 → 463.

## The frozen pack

Pack: `research-os-packs/research-os-spec/` — sibling repo, read-only reference.

- 296 accepted claims across 8 sections.
- 17 dispositioned (documented, not erased).
- 30 operator-override claims with full provenance.
- 0 active repair blockers, 0 unresolved contradictions.
- All 8 gates `synthesis_eligible=true`.
- `research.yaml.frozen_at: 2026-05-08T07:41:33.924Z`

**Freeze receipt fingerprints** (from `audits/freeze-receipt.json`):

| Artifact | sha256 (first 16 chars) |
|----------|------------------------|
| pack-audit | `360b6e38d6404270` |
| cowork-handoff | `bfce28d0379b7cad` |
| synthesis/cross-section-map.json | `5ebccbbdd6a3cf4e` |
| synthesis/cross-section-map.md | `1ab39b2bd6d9b45e` |
| synthesis/decision-brief.md | `b225102d970c7a28` |
| synthesis/working-report.md | `44e73474f14454b0` |
| synthesis/final-report.md | `02eaae66c3414ea1` |
| research.yaml | `ff55db88c226cd85` |

## The two integration patterns

**Pattern 1 — Consistent effective views across pack-level layers.** When an append-only ledger has a closure ledger (`contradictions.jsonl` + `contradiction-resolutions.jsonl`; `claim-reviews.jsonl` + `claim-synthesis-dispositions.jsonl`), every pack-level reader must join source and closure with the same latest-status-wins semantics. Diverging views produce split-brain truth at pack seams. When adding a new closure ledger, every reader must be wired in the same session.

**Pattern 2 — Readiness measures active blockers, not candidate-set completeness.** Rejected, parked, and dispositioned claims are settled state, not open work. Readiness layers (cowork handoff, audit `ready_for_synthesis`, freeze) must compute verdicts from active blockers, not from whether every candidate was accepted. The same predicate must hold across all readiness layers — diverging predicates produce split-brain freeze blockers.

## Tests

405 at arc start → 463 at close. 58 new tests across seven sessions. Section 03 (`03-source-and-claim-truth`, 42 accepted, 7 sources) is the golden regression fixture: changes to extraction, triage, review, gate, audit, or freeze are verified against its measured outputs.
