---
title: Section-scoped source waivers
description: Relax publisher-diversity / primary-source floors for sections where truth is structurally single-publisher; full audit-trail disclosure preserved.
sidebar:
  order: 12
---

> Use section-scoped source waivers when publisher diversity is structurally
> incompatible with the section's truth source, not when a section merely
> failed to find enough sources.

This is the **load-bearing distinction**. The waiver is a discipline-shifting
tool, not a shortcut around weak research.

---

## What it is

`primary_source_waiver.section_waivers[]` (v0.3.1+) lets an operator relax
the pack-wide source-floor checks **for one section at a time**, with
explicit `reason` + `compensating_controls[]` preserved in the audit trail.
Pack-level defaults remain in force everywhere else.

Two scopes are supported:

- `min_independent_publishers` — pack-wide publisher count requirement.
- `primary_sources_required` — pack-wide primary-source count requirement.

---

## When to use it (valid cases)

- **Canonical protocol-definition sections** — XRPL XLS standards,
  Ethereum EIPs, BIPs. The protocol foundation IS the canonical truth.
- **Single-vendor API definition sections** — the vendor's own OpenAPI
  spec is the canonical authority.
- **Single-foundation standards sections** — W3C / IETF / IEEE specs
  where the standards body is canonical by design.

The common shape: the section documents *what something is* against its
canonical specifying authority, not *what people think about it*.

---

## When NOT to use it (invalid cases)

### "I couldn't find enough independent sources"

**Not a waiver case.** Either expand source curation or honestly accept
Terminal B. The publisher-diversity floor is doing what it was designed
to do — catching under-curation.

### "The reviewer is being too strict"

**Not a waiver case.** Per-claim findings (`source_quality_problem`,
`scope_widening`, `overgeneralized_claim`, etc.) continue to route claims
normally regardless of waiver. Only the section-wide
`source_cluster_monopoly` finding's contribution to per-claim routing is
neutralised.

### "I want to ship faster"

**Not a waiver case.** The waiver requires a non-empty `reason` and
non-empty `compensating_controls[]`; empty values fail validation.

---

## Schema

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
        records.
      compensating_controls:
        - "Sources span multiple canonical artifact types: xrpl.org docs, rendered XLS standards, raw standards markdown, rippled release data, and GitHub implementation discussions."
        - "Claims remain span-grounded and reviewed individually."
        - "Section synthesis must disclose the single-foundation source concentration."
        - "Third-party sources may be added in later sections for adoption, marketplace, metadata, or operational interpretation, but are not required for protocol-definition truth."
```

| Field | Required | Notes |
|-------|----------|-------|
| `section_id` | yes | Matches `^[0-9]{2}-[a-z0-9-]+$` |
| `scope` | yes | `min_independent_publishers` \| `primary_sources_required` |
| `reason` | yes | Non-empty string |
| `compensating_controls` | yes | At least one entry |

---

## Behavior contract

- **Gate** — matching `(section_id, scope)` failure converts from `fail`
  to `pass_with_waiver`. The gate output's `waivers_applied[]` records
  `reason` + `compensating_controls` verbatim.
- **Reviewer (load-bearing)** — when a `min_independent_publishers`
  waiver is in effect, the section-wide `source_cluster_monopoly`
  finding remains visible in the findings ledger but does NOT route
  claims to `needs_source_repair` solely on its own. Per-claim findings
  continue to apply normally.
- **Audit** — `weak-sources` and `source-diversity-gaps` rollups
  annotate waived rows with `waived: true` + `waiver_reason`. Rows are
  **not removed** (Law 16: waivers do not hide evidence).
- **Freeze** — `research.yaml` content is fingerprinted; section_waivers
  land in the freeze receipt by construction.

---

## Required operator discipline

Two requirements enforced by code:

1. `reason` non-empty (schema validation).
2. `compensating_controls[]` non-empty (schema validation).

One requirement enforced by operator practice (NOT by code):

3. **Synthesis-time disclosure.** The section's eventual
   `final-report.md` must explicitly surface that the publisher
   concentration was deliberately accepted, with the rationale visible
   in the prose. The waiver mechanism does NOT substitute for this
   disclosure — it complements it.

---

## Pack policy still wins

`gates.source_floor.primary_source_waiver_allowed: false` blocks BOTH
pack-level and section-scoped waivers. An operator cannot smuggle a
waiver past pack policy by rerouting it to section scope.

---

## Counterexamples within the same pack

Within the XRPL pack:

- **Section 01 (token surface and standards)** — canonical protocol;
  waiver applies.
- **Section 07 (metadata and off-chain durability)** — spans IPFS,
  Arweave, HTTP-served metadata, marketplace indexers; multi-publisher
  diversity is genuinely useful; do NOT waive.

When in doubt: the waiver is for sections documenting *what something
is*, not *what people think about it*.

---

## Why this exists

`research-os` v0.1–v0.3.0 assumed publisher diversity is a proxy for
truth quality across all sections. That assumption is correct for most
domains and incorrect for canonical-protocol sections, where the
authoritative source of truth is structurally single-publisher.

Experiment 3 (XRPL pack Session 2) earned the fix. The pre-v0.3.1
mitigation (`min_independent_publishers: 0` at pack level) weakened the
global guard across every section, including ones where multi-publisher
diversity is genuinely useful. v0.3.1 ships section-scoped waivers as
the honest answer.

---

## Gate-semantics clarity (v0.3.3)

### Pack-wide vs section-scoped diagnostic counts (F-43)

The source-floor checks evaluate **pack-wide** — the pass/fail decision
uses the full source set accumulated across every section run so far.
From v0.3.3, gate output carries both views explicitly:

```
min_independent_publishers: PASS (pack-wide=8, section-scoped=1; threshold=4)
```

*Gate pass/fail behavior is unchanged. v0.3.3 makes the source-floor
evidence legible by reporting both pack-wide and section-scoped counts.*

A section that runs early (when the pack source set is thin) may need a
waiver even though the same section, run later, would pass. Both outcomes
are correct; the diagnostic now shows which view drove the decision.

### `no_source_cluster_monopoly` is informational, not a warning (F-41)

From v0.3.3, this check emits an informational `pass` rather than a `warn`
when claims are single-source. Each research-os claim is grounded to one
source span by design, so single-source attribution is expected and carries
no actionable signal.

*Because research-os claims are usually grounded to one source span,
single-source claim attribution is expected. Source diversity should be
judged from the section/pack source floor, not from a per-claim "monopoly"
warning.*

The check is preserved — it stays visible in gate output. It no longer
inflates the section's warning count.

---

## Related

- [`docs/section-scoped-waivers.md`](https://github.com/mcp-tool-shop-org/research-os/blob/master/docs/section-scoped-waivers.md)
  — full reference in the repo.
- [Operator Playbook](/research-os/handbook/operator-playbook/) —
  canonical guidance, including the deprecated pack-level workaround.
- [`research-packs/docs/operator-playbook.md`](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md)
  — canonical operator playbook in the archive monorepo.
- [Contradict map](/research-os/handbook/contradict-map/) — v0.3.0's
  `--detector` flag, the prior Experiment 3 fix.

:::tip[Recovery]
For partial-failure scenarios — including gate-failure repair and source-floor recovery — see the [Recovery runbook](/research-os/handbook/recovery/).
:::
