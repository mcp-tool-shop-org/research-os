# Section-Scoped Source Waivers (v0.3.1)

> Use section-scoped source waivers when publisher diversity is structurally
> incompatible with the section's truth source, not when a section merely
> failed to find enough sources.

This is the **load-bearing distinction**. Without it, the waiver mechanism
becomes an excuse for under-curated research, which inverts what the waiver
was earned for.

---

## What it is

A **section-scoped source-floor waiver** lets an operator relax the pack-wide
publisher-diversity floor *for one section at a time*, with explicit reason
and compensating controls preserved in the audit trail. Pack-level defaults
remain in force everywhere else.

The waiver applies to two source-floor checks:

- `min_independent_publishers` — the pack-wide publisher count requirement.
- `primary_sources_required` — the pack-wide primary-source count
  requirement.

Other source-quality checks (`min_sources`, claim integrity, freshness,
contradiction floors, the calibrated reviewer's per-claim findings) are
**unaffected** by the waiver.

---

## When to use it (valid cases)

Section-scoped waivers exist for sections where the truth itself is
**structurally single-publisher**. Adding third-party publishers cannot
improve ground truth in these cases — it can only add interpretation layers
on top of the canonical authority.

Valid cases include:

- **Canonical protocol-definition sections.** XRPL XLS standards, Ethereum
  EIPs on a single chain, BIPs for a single Bitcoin codebase. The
  protocol foundation IS the canonical source. Earned by Experiment 3
  (XRPL pack Session 2, 2026-05-09).
- **Single-vendor API definition sections.** A vendor's own OpenAPI spec
  is the canonical truth for the API itself; third-party "API explainers"
  are downstream interpretations, not corroborating primaries.
- **Single-foundation standards sections.** W3C / IETF / IEEE specs where
  the standards body is the canonical authority by design.

The common shape: the section is documenting *what something is* against
its canonical specifying authority, not *what people think about it*.

---

## When NOT to use it (invalid cases)

Three patterns operators must NOT use the waiver mechanism for. Each is
a research-quality failure dressed up as a publisher-diversity exception.

### "I couldn't find enough independent sources"

**Not a waiver case.** Either expand source curation (academic papers,
exchange/custodian operational docs, independent block explorers, sourced
journalism) or honestly accept Terminal B for the section. The
publisher-diversity floor is doing what it was designed to do: catching
under-curation.

### "The reviewer is being too strict"

**Not a waiver case.** The reviewer's per-claim findings continue to apply
normally regardless of any waiver. Per-claim `source_quality_problem`,
`scope_widening`, `overgeneralized_claim`, etc. still route claims to
repair. The section-scoped waiver only neutralises the *section-wide*
`source_cluster_monopoly` finding's contribution to per-claim decision
routing — it does not silence per-claim quality signals.

### "I want to ship faster"

**Not a waiver case.** The waiver requires audit-disclosed `reason` and
non-empty `compensating_controls[]`; an empty or hand-wavy waiver fails
schema validation and the gate logs a `section_scoped_waiver_*_required`
validation failure. The mechanism is a discipline-shifting tool, not a
shortcut.

---

## Schema

The waiver lives under `primary_source_waiver.section_waivers[]` in
`research.yaml`. Each entry stands alone; multiple entries can target
different sections, or the same section with different scopes.

```yaml
primary_source_waiver:
  status: none
  compensating_controls: []
  section_waivers:
    - section_id: 01-token-surface-and-standards
      scope: min_independent_publishers
      reason: |
        Section 01 defines XRPL token surfaces from canonical protocol sources.
        The authoritative source of truth is intentionally concentrated in XRPL
        Foundation documentation, XLS standards, and rippled implementation/release
        records. Third-party publishers can explain or interpret these standards,
        but they are not primary authorities for protocol semantics.
      compensating_controls:
        - "Sources span multiple canonical artifact types: xrpl.org docs, rendered XLS standards, raw standards markdown, rippled release data, and GitHub implementation discussions."
        - "Claims remain span-grounded and reviewed individually."
        - "Section synthesis must disclose the single-foundation source concentration."
        - "Third-party sources may be added in later sections for adoption, marketplace, metadata, or operational interpretation, but are not required for protocol-definition truth."
```

### Field reference

| Field | Required | Description |
|-------|----------|-------------|
| `section_id` | yes | Section id, e.g. `01-token-surface-and-standards`. Must match the regex used by `SectionSchema.id`. |
| `scope` | yes | `min_independent_publishers` or `primary_sources_required`. |
| `reason` | yes | Non-empty string. The structural rationale, written so a future reader can evaluate whether it still holds. |
| `compensating_controls` | yes | At least one entry. Each is a free-text discipline statement that compensates for the relaxed floor. |

Schema enforcement is strict: empty `reason` or empty
`compensating_controls[]` cause validation failures. The pack policy
`gates.source_floor.primary_source_waiver_allowed: false` blocks both
pack-level and section-scoped waivers.

---

## Behavior contract

### Gate path

When `research-os gate <section>` runs, `applyWaivers` iterates
`section_waivers[]`, filters by `section_id`, validates each entry, and
converts matching `source_floor.<scope>` failures from `fail` to
`pass_with_waiver`. The gate output's `waivers_applied[]` records the
exact `reason` and `compensating_controls` for the audit trail.

### Reviewer path (load-bearing)

`research-os review <section>` plumbs the active section's waivers into
`deriveClaimReviews`. When a `min_independent_publishers` waiver is in
effect, the reviewer's section-wide `source_cluster_monopoly` finding
remains in the findings ledger (visible to operators reading the audit
trail) but its contribution to per-claim decision routing is neutralised.

The behavior contract is precise:

- The `source_cluster_monopoly` finding is **not removed**; it appears
  in the findings ledger and in the claim-review's `finding_ids[]`.
- The claim-review's `reason` annotates the waived finding as
  `(severity, waived)` so an operator reading the reason can see the
  finding is present but neutralised.
- **Other source-quality findings continue to route normally.** Per-claim
  `source_quality_problem`, `scope_widening`, `overgeneralized_claim`,
  `temporal_mismatch`, etc. all drive their own decisions independently
  of the waiver.

### Audit path

`audit/aggregate.ts` annotates `weak-sources` and `source-diversity-gaps`
rows with `waived: true` and `waiver_reason: <verbatim>` when a matching
section waiver is active. The rows are **not suppressed** — the
publisher-monopoly fact is still surfaced in the rollup; it's just
disclosed as deliberately accepted rather than as an open blocker. Law 16
discipline: waivers do not hide evidence.

### Freeze path

`research.yaml` content is fingerprinted by the freeze receipt; the
section_waivers array therefore lands in the receipt by construction.
A frozen pack's waiver state is part of its tamper-evident audit trail.

---

## Required operator discipline beyond the schema

Two requirements are enforced by code (validated by the schema, evaluated
by `applyWaivers`):

1. `reason` non-empty.
2. `compensating_controls[]` non-empty.

A third requirement is **NOT** enforced by code but is required by
operator practice:

3. **Synthesis-time disclosure.** The section's eventual `final-report.md`
   must explicitly surface that the publisher concentration was
   deliberately accepted, with the rationale visible in the prose. The
   waiver mechanism captures the structural fact in research.yaml and
   the freeze receipt; the synthesis-time disclosure carries the same
   fact into the human-readable output. The waiver mechanism does NOT
   substitute for this disclosure — it complements it.

Operators reading the freeze receipt can audit (1) and (2) mechanically.
Operators reading the published synthesis must be told (3) by the prose
itself. Both must hold for the waiver to be honest.

---

## Why this exists

`research-os` v0.1 — v0.3.0 assumed publisher diversity is a proxy for
truth quality across all sections. That assumption is correct for most
research domains: when multiple independent publishers converge on a
fact, the fact is more trustworthy than any single source. The
publisher-floor catches under-curated source pools where one publisher
dominates by accident.

Experiment 3 (XRPL creator-token durability pack, Session 2, 2026-05-09)
inverted that assumption. The XRPL protocol's authoritative source of
truth is structurally single-publisher (XRPL Foundation owns the
specification, the implementation, and the documentation). The
publisher-diversity floor failed every section that defined the protocol
itself, and the calibrated reviewer's section-wide
`source_cluster_monopoly` finding routed 64/64 selected_for_review claims
to `needs_source_repair`. The pre-v0.3.1 mitigation —
`min_independent_publishers: 0` at the pack level — weakened the global
guard across every section in the pack, including sections like
`07-metadata-and-off-chain-durability` where multi-publisher diversity is
genuinely useful.

v0.3.1 ships section-scoped waivers as the honest answer: relax the
floor only where truth is structurally single-publisher, with explicit
disclosure, while the pack-wide default continues to protect every other
section.

The deeper lesson is API stability. The `--detector` flag (v0.3.0) and
section-scoped waivers (v0.3.1) are both surfaced extensions to the
public CLI / config interface, both earned by external pressure on the
chain, and both shipped through the same release coordination model. v1.0
is closer.

---

## Counterexamples (sections where the waiver does NOT apply)

Within the same XRPL pack:

- **Section 07 — Metadata and off-chain durability.** Spans IPFS,
  Arweave, HTTP-served metadata, marketplace indexer caching. Multiple
  publishers genuinely apply (storage layer foundations, marketplace
  vendors, independent indexer projects). The `min_independent_publishers`
  floor does its job here — do not waive.
- **Section 04 — Issuer controls and immutability adoption.** Strictly
  the canonical protocol surface (issuer-set flags, AccountSet,
  Clawback) — single-publisher. Adoption of those features by exchanges
  / custodians / wallets is *separate*; if the section spans both, split
  it or scope the waiver carefully.

When in doubt: the waiver is for sections that document *what something
is*, not *what people think about it*.

---

## Related

- [`research-packs/docs/operator-playbook.md`](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md)
  — canonical operator guidance, including the deprecation note for the
  pre-v0.3.1 pack-level workaround.
- Handbook mirror: `https://mcp-tool-shop-org.github.io/research-os/handbook/section-scoped-waivers/`.
- [`docs/contradict-map.md`](contradict-map.md) — v0.3.0's `--detector`
  flag, the prior Experiment 3 fix.
- [`docs/roadmap.md`](roadmap.md) — Experiment 3 progress.
