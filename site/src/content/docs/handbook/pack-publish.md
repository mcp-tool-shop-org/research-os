---
title: pack publish
description: Export a frozen research pack into the research-packs archive format.
sidebar:
  order: 7
---

`research-os pack publish` automates the manual closeout work from Experiment 1.
Given a frozen pack on disk, it derives the admission contract, copies all artifacts,
and verifies the result — in one command.

---

## Quick use

```bash
research-os pack publish \
  --from ./research-os-packs/my-pack \
  --to ./research-packs/packages/my-pack
```

Exit 0 = admission-contract PASS. Exit 2 = refused (nothing written).

---

## Flags

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--to <path>` | yes | — | Target package directory |
| `--from <path>` | no | cwd | Source frozen pack directory |
| `--operator-notes <text>` | no | `""` | Notes written into `pack.manifest.json` |
| `--force` | no | false | `--force` clears and replaces the target package directory. Do not keep hand-authored files inside generated package output. |
| `--dry-run` | no | false | Derive and print plan; write nothing |

---

## What it produces

```
<target>/
  pack/                    ← full frozen pack copy
    audits/
      freeze-receipt.json  ← admission contract anchor
  synthesis/               ← citation-clean prose
    final-report.md
    decision-brief.md
  pack.manifest.json       ← derived metadata
  README.md                ← derived from final-report
  docs/
    how-to-read-this.md   ← scaffold; you fill in the prose
```

---

## Refusal cases (exit 2)

The command refuses — writing nothing — if any of these conditions hold:

- `audits/freeze-receipt.json` is missing from the source pack
- `synthesis/final-report.md` is missing from the source pack
- `audits/freeze-refusal.json` is present (pack not cleanly frozen)
- Target directory is non-empty and `--force` was not given
- `audits/<section>-gate.json` is missing for any section
- `research.yaml.frozen_at` is null (pack not yet frozen)
- `accepted_claims` count disagrees between `claim-reviews.jsonl` and `pack-audit.json`
- Any unresolved contradictions remain in `contradiction-resolutions.jsonl`

After writing, `pack publish` also verifies the target and refuses if the freeze-receipt sha256 doesn't reproduce or any fingerprinted artifact was corrupted.

---

## Typical workflow

```bash
# 1. Freeze your pack
research-os freeze

# 2. Clone research-packs locally
git clone https://github.com/mcp-tool-shop-org/research-packs

# 3. Publish
research-os pack publish \
  --from ./research-os-packs/my-pack \
  --to ./research-packs/packages/my-pack

# 4. Finish the how-to-read scaffold
#    Open docs/how-to-read-this.md — find the SCAFFOLD marker and write the prose

# 5. Verify independently (optional — pack publish already did this)
node research-packs/scripts/verify-pack.mjs research-packs/packages/my-pack

# 6. Commit and push
cd research-packs
git add packages/my-pack
git commit -m "feat: add my-pack"
git push
```

---

## What `pack publish` does NOT do

- Does not push to GitHub — committing and pushing is the operator's step
- Does not modify the source pack — the frozen pack is read-only
- Does not write to npm or any package registry
- Does not create new claims, reviews, or resolutions inside the pack
- Does not author the `docs/how-to-read-this.md` prose — it provisions a scaffold
- Does not update `catalog.json` in the monorepo root — that step is manual

---

## Dogfood proof

Both day-one packages in `research-packs` were re-derived via `pack publish` and passed `verify-pack.mjs`:

- `comfyui-workflow-durability` — 302 accepted claims, 124 artifacts verified, receipt sha256 `d71943c6...`
- `research-os-self-dogfood` — 296 accepted claims, 131 artifacts verified, receipt sha256 `368d23...`

Full receipt: [`docs/pack-publish-dogfood.md`](https://github.com/mcp-tool-shop-org/research-os/blob/master/docs/pack-publish-dogfood.md)

---

## Full reference

[`docs/pack-publish.md`](https://github.com/mcp-tool-shop-org/research-os/blob/master/docs/pack-publish.md)
in the repository covers refusal cases, manifest shape, and implementation details.
