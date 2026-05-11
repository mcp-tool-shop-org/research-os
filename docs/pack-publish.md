# `research-os pack publish` — CLI Reference

`pack publish` exports a frozen research pack into the canonical
[`research-packs`](https://github.com/mcp-tool-shop-org/research-packs) archive format.
The command is an automation of the manual closeout work documented in Experiment 1.

---

## What it does

Given a frozen pack on disk, `pack publish` does exactly eight things:

1. Copies the pack into `<target>/pack/` and the synthesis files into `<target>/synthesis/`.
2. Derives `pack.manifest.json` from pack artifacts — no operator inputs required beyond the package name (inferred from the target directory).
3. Verifies that the freeze-receipt sha256 reproduces from the copied receipt bytes.
4. Derives per-section `accepted_claims` from `claim-reviews.jsonl` using latest-decision-wins semantics (Pattern 2 predicate).
5. Derives `preserved_contradiction_records` from `contradiction-resolutions.jsonl` closure-ledger state. Phrasing is accurate by construction; the count is never operator-guessed.
6. Generates `README.md` deterministically from `synthesis/final-report.md` and the manifest. Uses "Preserved contradiction records: N" phrasing when the field is non-zero.
7. Provisions `docs/how-to-read-this.md` with a scaffold pre-filled with pack-specific metadata (name, topic, accepted_claims, frozen date). Final prose is human-authored and excluded from the freeze receipt.
8. Runs an inline admission-contract verification pass before declaring success. Refuses if anything is wrong.

---

## CLI surface

```
research-os pack publish --to <path> [--from <path>] [--operator-notes <text>] [--force] [--dry-run]
```

### Flags

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--to <path>` | yes | — | Target package directory, e.g. `<research-packs>/packages/<name>` |
| `--from <path>` | no | `cwd` | Source frozen pack directory |
| `--operator-notes <text>` | no | `""` | Free-text notes written into `pack.manifest.json` |
| `--force` | no | `false` | `--force` clears and replaces the target package directory. Do not keep hand-authored files inside generated package output. |
| `--dry-run` | no | `false` | Derive manifest + README, print plan, write nothing |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success — admission-contract PASS |
| `2` | Refused — pack or target failed a pre-condition; nothing written |

### Examples

**Basic publish:**
```bash
research-os pack publish \
  --from ./research-os-packs/my-pack \
  --to ./research-packs/packages/my-pack
```

**Dry run to preview the manifest without writing:**
```bash
research-os pack publish \
  --from ./research-os-packs/my-pack \
  --to ./research-packs/packages/my-pack \
  --dry-run
```

**Re-publish with force (destructive — clears and replaces the target):**

`--force clears and replaces the target package directory. Do not keep hand-authored files inside generated package output.`
Edit upstream artifacts (claims, sources, synthesis) or sibling files instead.

```bash
research-os pack publish \
  --from ./research-os-packs/my-pack \
  --to ./research-packs/packages/my-pack \
  --force
```

**Add operator notes to the manifest:**
```bash
research-os pack publish \
  --from ./research-os-packs/my-pack \
  --to ./research-packs/packages/my-pack \
  --operator-notes "Synthesized from 8 sections, all gates WARN."
```

---

## What it produces

```
<target>/
  pack/                           ← full copy of the frozen pack
    research.yaml
    sections/
    evidence/
    audits/
      freeze-receipt.json         ← admission contract anchor
      ...
  synthesis/                      ← citation-clean synthesis prose (Lane 1)
    final-report.md
    decision-brief.md
    working-report.md
    cross-section-map.{json,md}
  pack.manifest.json              ← canonical per-package metadata
  README.md                       ← derived from final-report + manifest
  docs/
    how-to-read-this.md           ← scaffold; human authors the prose
```

### pack.manifest.json shape

```json
{
  "name": "<package-name>",
  "topic": "...",
  "frozen_at": "2026-05-09T08:30:02.276Z",
  "research_os_version": "0.1.1",
  "sections": [
    { "id": "01-section", "accepted_claims": 40, "gate": "warn", "synthesis_eligible": true }
  ],
  "totals": {
    "sections": 8,
    "accepted_claims": 302,
    "dispositioned": 0,
    "unresolved_contradictions": 0,
    "preserved_contradiction_records": 171
  },
  "freeze_receipt_sha256": "d71943c6...",
  "operator_notes": ""
}
```

`preserved_contradiction_records` is omitted when zero.

---

## Admission contract

Every published package must carry exactly five files. `pack publish` enforces this contract by refusing if any condition fails.

### Source-side refusals (exit 2, nothing written)

| Condition | Error pattern |
|-----------|---------------|
| `audits/freeze-receipt.json` missing from source pack | `freeze-receipt` |
| `synthesis/final-report.md` missing from source pack | `final-report` |
| `audits/freeze-refusal.json` present in source pack | `freeze-refusal` |
| Target directory non-empty and `--force` not given | `force` |
| `audits/<section>-gate.json` missing for any section | `gate.json` |
| `research.yaml.frozen_at` is null | `frozen` |
| Section gate result is not `synthesis_eligible` | `synthesis_eligible` |
| Accepted `claim_id` cited in `claim-reviews.jsonl` but absent from `claims.jsonl` (phantom claim) | `phantom` |
| Same `claim_id` + same `created_at` carries incompatible decision values (e.g., one `accepted_for_synthesis`, one `rejected`) | `incompatible decisions` |
| Unresolved contradictions remain in `contradiction-resolutions.jsonl` | `unresolved` |

### Soft warnings (admission proceeds, surfaced in stdout)

| Condition | Warning shape |
|-----------|---------------|
| Legacy `pack-audit.json::accepted_claims` count differs from the effective accepted set (latest-decision-wins per `claim_id`) | `legacy pack-audit.json accepted_claims (N) differs from effective accepted set (M). Using effective count (M) in manifest.` |
| `claims.jsonl` absent — phantom-claim integrity check skipped | `claims.jsonl absent for section <id>; skipping phantom-claim integrity check` |

### Normalized accepted-claim accounting (v0.3.2)

`pack publish` derives the per-section `accepted_claims` count using the
**effective accepted set** — unique `claim_id`s whose latest canonical
review decision is `accepted_for_synthesis`. Latest-decision-wins
precedence per `claim_id` (ISO-8601 timestamps compare
lexicographically). Helper module:
[`src/closure-ledger/effective-accepted.ts`](../src/closure-ledger/effective-accepted.ts).

This matters because `claim-reviews.jsonl` is append-only and reviewer
windows can overlap, so the same `claim_id` can legitimately receive
multiple `accepted_for_synthesis` records. Counting raw rows
overcounts; counting unique-claim-ids-ever-accepted ignores later
override decisions. The effective accepted set is the single canonical
definition every `pack publish` consumer uses.

**When the legacy `pack-audit.json::accepted_claims` count differs
from the effective set, admission proceeds with a warning** rather
than refusing. The legacy audit count is preserved verbatim inside
`pack/audits/pack-audit.json` (Law 15: freeze artifacts are
immutable). The archive manifest's `sections[].accepted_claims`
reflects the effective count. The warning is surfaced once per
mismatched section. This is **not** a publish failure.

The contract still hard-refuses on real integrity problems: phantom
`claim_id`s (accepted but absent from `claims.jsonl`), incompatible
duplicate decisions at the same timestamp, and section gates that
aren't `synthesis_eligible`.

### Post-write verification refusals

After writing, `pack publish` re-verifies the target:

| Condition | Error pattern |
|-----------|---------------|
| `pack/audits/freeze-receipt.json` absent in target | `freeze-receipt` |
| `synthesis/final-report.md` absent in target | `final-report` |
| `pack.manifest.json` absent in target | manifest parse error |
| `freeze_receipt_sha256` in manifest doesn't match actual receipt bytes | `hash mismatch` |
| Any `canonical_artifact_hashes` or `synthesis_hashes` entry doesn't reproduce | `Hash mismatch` |

---

## Typical operator workflow

```
1. Pack reaches freeze
   research-os freeze

2. Clone (or pull) the research-packs monorepo locally
   git clone https://github.com/mcp-tool-shop-org/research-packs

3. Publish the pack
   research-os pack publish \
     --from ./research-os-packs/my-pack \
     --to ./research-packs/packages/my-pack

4. Open docs/how-to-read-this.md in the new package and finish the prose
   (the scaffold has pack-specific fields pre-filled; SCAFFOLD marker shows what needs writing)

5. Verify independently
   node research-packs/scripts/verify-pack.mjs research-packs/packages/my-pack

6. Commit and push the new package
   cd research-packs
   git add packages/my-pack
   git commit -m "feat: add <name> package"
   git push
```

---

## What `pack publish` does NOT do

- **Does not push to GitHub.** Committing and pushing the resulting package is the operator's step.
- **Does not modify the source pack.** The source frozen pack is read-only; `pack publish` writes only to the target.
- **Does not write to npm or any package registry.** The `research-packs` monorepo is a git archive, not an npm package.
- **Does not create new pack-internal truth.** `pack publish` reads existing artifacts and writes the package layout. It never adds claims, reviews, or resolutions to the source pack.
- **Does not author `docs/how-to-read-this.md` prose.** It provisions a scaffold; the pack-specific prose is human-authored. The scaffold is excluded from the freeze receipt so operator edits don't invalidate fingerprints.
- **Does not update `catalog.json`** in the monorepo root. That step is manual after each new package admission.

---

## Dogfood proof

Both day-one packages in `research-packs` were re-derived via `pack publish` and verified:
[`docs/pack-publish-dogfood.md`](pack-publish-dogfood.md)

---

## Implementation

Source: `src/pack/publish/` — 7 modules (schema, types, copy, manifest, readme, how-to-read, verify, index).
Helper: `src/closure-ledger/effective-accepted.ts` — pure-function module exporting
`getEffectiveDecisionMap`, `getEffectiveAcceptedClaimIds`, and `findIncompatibleDecisions`.
Tests: `test/pack-publish/` and `test/closure-ledger/` — covering all 8 behaviors,
all refusal cases, and the F-36 normalization paths.
Ships in: `@mcptoolshop/research-os@0.2.0` (initial), `@mcptoolshop/research-os@0.3.2` (F-36 admission contract).
