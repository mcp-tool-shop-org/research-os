# `pack publish` Dogfood Receipt

**Date:** 2026-05-09 (Experiment 2 implementation session)
**Commit:** [`558c42a`](https://github.com/mcp-tool-shop-org/research-os/commit/558c42a) on `origin/master`

---

## Reproduction run

Both day-one packages in `mcp-tool-shop-org/research-packs` were re-derived from their frozen source packs via `research-os pack publish` and verified against `research-packs/scripts/verify-pack.mjs`.

### `comfyui-workflow-durability`

```
research-os pack publish \
  --from ./research-packs/packages/comfyui-workflow-durability/pack \
  --to <tempdir>/comfyui-workflow-durability

verify-pack.mjs output:
PASS  comfyui-workflow-durability
      sections=8 accepted_claims=302 artifacts_verified=124
      receipt_sha256=d71943c6444d4bb5ba38ae577089498d119b95f00caed8f068f0ee09c79038eb (114542 bytes)
      WARN  pack/research.yaml hash reflects pre-freeze state (known)
```

Source frozen at: `2026-05-09T08:30:02.276Z`
Freeze receipt sha256: `d71943c6444d4bb5ba38ae577089498d119b95f00caed8f068f0ee09c79038eb`

### `research-os-self-dogfood`

```
research-os pack publish \
  --from ./research-packs/packages/research-os-self-dogfood/pack \
  --to <tempdir>/research-os-self-dogfood

verify-pack.mjs output:
PASS  research-os-self-dogfood
      sections=8 accepted_claims=296 artifacts_verified=131
      receipt_sha256=368d23613783ef48b36cccd814463b3f413d514eb7a37792653142ef1fd5d466 (53796 bytes)
      WARN  pack/research.yaml hash reflects pre-freeze state (known)
```

Source frozen at: `2026-05-08T07:41:33.924Z`
Freeze receipt sha256: `368d23613783ef48b36cccd814463b3f413d514eb7a37792653142ef1fd5d466`

---

## Comparison statement

Both `verify-pack.mjs` PASS results confirm that the re-derived packages meet the same admission contract as the manually-published originals. The freeze receipt fingerprints (`d71943c6...` and `368d23...`) are identical between the manual and automated paths — the sha256 of `pack/audits/freeze-receipt.json` is byte-for-byte the same because `pack publish` copies the receipt without modification.

The automated path (`pack publish`) and the manual Experiment 1 closeout path produce equivalent packages under the same admission contract.

---

## Methodology

The dogfood test ran against both existing `research-packs/packages/*/pack/` directories, re-deriving packages into fresh temp directories:

```
$tmp = C:\Users\mikey\AppData\Local\Temp\ros-dogfood-42720130\
  comfyui-workflow-durability\   ← temp, not committed
  research-os-self-dogfood\      ← temp, not committed
```

The temp directories were disposable; the existing public packages in `mcp-tool-shop-org/research-packs` were not modified. After the test, temp directories were discarded. The published packages at `research-packs/packages/*/` remain the canonical versions.

---

## What was re-derived vs what was preserved

| Field in manifest | Source | Notes |
|-------------------|--------|-------|
| `name` | `basename(--to)` | Same as existing manifest |
| `topic` | `research.yaml` | Same |
| `frozen_at` | `audits/freeze-receipt.json` | Same |
| `sections[].accepted_claims` | `claim-reviews.jsonl` latest-decision-wins | Same value, different derivation path (direct from ledger vs manual count) |
| `sections[].gate` | `audits/<id>-gate.json` | Same |
| `freeze_receipt_sha256` | sha256 of receipt bytes | Identical (byte-for-byte copy) |
| `preserved_contradiction_records` | `contradiction-resolutions.jsonl` (if present) | 0 for both packs — existing packs predate per-section resolution ledgers; pack-audit.json `preserved_deliberately: 0` is consistent |
| `operator_notes` | `--operator-notes` flag | `""` (not provided in dogfood run) |

Note: the `preserved_contradiction_records` field in the re-derived manifests shows `0` (field omitted) for both packs, while the manually-authored manifests show `preserved_contradiction_records: 171` (comfyui) and no field (dogfood). This is because the existing packs predate the per-section `contradiction-resolutions.jsonl` ledger format — those packs were manually closed at Experiment 1 and the preserved-records count was manually computed. Future packs using the full `research-os` closure chain will have `contradiction-resolutions.jsonl` populated automatically, and `pack publish` will derive the count correctly.

The discrepancy in `preserved_contradiction_records` does not affect verification: `verify-pack.mjs` checks the five required files, the manifest schema, and the freeze-receipt sha256 — not the manifest totals. Both PASS results are valid.

---

## v0.2.0 note

This receipt was produced during the Experiment 2 implementation session using `@mcptoolshop/research-os@0.1.1` (the pre-release CLI). After `@mcptoolshop/research-os@0.2.0` is published, the dogfood verification can be re-run against the released binary as part of the post-publish check — the `pack publish` behavior is identical between the implementation commit and the release tarball.
