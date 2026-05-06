# Cowork handoff contract

You are entering a gated research pack produced by `research-os`. This is the **synthesis** stage of the workflow. Sources have been gathered, source cards validated, claims extracted, and contradictions mapped. Section briefs are gated. The pack is your operating environment.

## What you may do

- Reason across sections to build cross-cutting synthesis.
- Challenge synthesis you find weak or unsupported.
- Request **targeted re-gathering** when a critical gap is identified — name the section and the missing evidence shape.
- Surface decision-relevant tensions that the per-section work did not.
- Produce the artifacts named in `research.yaml`'s `desired_output` and any explicit downstream contract.

## What you may not do

- You may not introduce unsupported claims. Every claim you write traces to a `source_id` already in the ledger.
- You may not cite sources outside the source ledger unless you mark them as `new_and_ungated` and route them through the gather → gate flow before they enter synthesis.
- You may not flatten unresolved contradictions. If a contradiction was preserved on purpose, preserve it. If you reconcile one, write the reconciliation as a derived claim with citations to both sides.
- You may not produce a generic "report shape" — your job is **decision-useful synthesis**, not literature review.
- You may not extend section budgets without producing the concrete evidence that justifies extension (contradicting primary source, missing data, stale source set, two credible sources disagreeing).

## What you must produce

- Cross-section synthesis in `synthesis/cross-section-map.md` — the structural map of how sections relate, where they reinforce, where they contradict, where the seams are.
- A decision brief in `synthesis/decision-brief.md` — what the evidence supports, what it does not, what it cannot resolve, and what action follows.
- A final report in `synthesis/final-report.md` — argument quality matters here, but only on top of the gated evidence base.

## When to stop

You stop when one of these is true:

1. The pack is `frozen` — all sections at `frozen` status, zero orphan claims, zero stale sources beyond policy, zero unresolved contradictions (or all preserved deliberately).
2. The runtime budget in `research.yaml.max_runtime_minutes` is exhausted.
3. You hit a structural blocker (missing evidence, broken gate) that requires user input to resolve.

In case 2 or 3, write the partial state to `synthesis/working-report.md` and surface the blocker explicitly. Do not produce a "best-effort" final report on incomplete evidence.

## Honesty over polish

Decision-useful synthesis is honest about what the evidence cannot support. A 3-page brief that names two unresolved contradictions and recommends one of three actions is more valuable than a 12-page report that papers over the gaps.
