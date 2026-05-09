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
| `--force` | no | `false` | Overwrite an existing non-empty target directory |
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

**Re-publish with force (overwrites existing, preserves `docs/how-to-read-this.md` if operator-authored):**
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
| `accepted_claims` mismatch between `claim-reviews.jsonl` and `pack-audit.json` | `mismatch` |
| Unresolved contradictions remain in `contradiction-resolutions.jsonl` | `unresolved` |

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
Tests: `test/pack-publish/` — 48 tests covering all 8 behaviors and all refusal cases.
Ships in: `@mcptoolshop/research-os@0.2.0`.
