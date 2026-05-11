---
title: Known Limitations
description: Disclosed v1.0 known gaps — frozen-pack version stamp, npm provenance, indexer schema migration.
sidebar:
  order: 9
---

v1.0 ships with three known operator-visible limitations. Each is documented
here so the operator surface matches the [CHANGELOG `[Unreleased]`](https://github.com/mcp-tool-shop-org/research-os/blob/master/CHANGELOG.md) disclosure. None block release; all have a defined recovery or
mitigation path.

---

## B-E-001 — frozen-pack version stamp historical artifact

**Symptom.** Frozen packs published under v0.3.3 through v0.6.0 carry
`research_os_version: "0.1.0"` in `pack.manifest.json` and
`pack/research.yaml`, regardless of which release produced them. Audit JSONs
inside the same packs carry their contemporary version (`0.2.0` / `0.3.1` /
`0.3.2`) because the audit-emit path used the live version export.

**Cause.** `src/intake/scaffold.ts` carried a hardcoded `PACKAGE_VERSION =
'0.1.0'` constant from pre-v0.4 development. The audit-emit paths imported
`RESEARCH_OS_VERSION` from `src/index.ts` and stayed accurate; the scaffold
emit path did not. The 4-pack byte-identical regression continues to PASS
because verify-pack hashes frozen artifacts as-is — the regression has been
validating that the frozen falsehood reproduces.

**Scope.** Affected packs are immutable under Law 15 (freeze locks completed
research truth):

- `368d2361…` `research-os-self-dogfood` — manifest+yaml: `0.1.0`; audits: `0.1.0`
- `d71943c6…` `comfyui-workflow-durability` — manifest: `0.1.1`; yaml: `0.1.0`; audits: `0.1.0`
- `6511a044…` `xrpl-creator-token-durability` — manifest+yaml: `0.1.0`; audits: mixed `0.2.0` + `0.3.1`
- `55a65792…` `godot-export-runtime-durability` — manifest+yaml: `0.1.0`; audits: `0.3.2`

**Recovery.** The fix landed in the Stage B Phase 3 amend wave (B-E-001):
`src/intake/scaffold.ts` now imports the live `RESEARCH_OS_VERSION` constant.
Packs scaffolded under v1.0+ stamp the contemporary version correctly. **Existing
frozen packs are not re-stamped.** Their fingerprints are locked.

---

## B-E-004 — npm provenance attestation deferred to v1.x

**Symptom.** The v1.0 npm tarball verifies via package-shasum only; no sigstore
provenance attestation is attached.

**Cause.** Real provenance requires migrating the publish flow out of local
advisor sessions into a GitHub Actions workflow with OIDC. That migration
conflicts with the established translation-before-publish discipline:
TranslateGemma 12B runs locally (zero API cost, two to four minutes per README),
and CI runners do not carry the model. Wiring provenance without breaking the
translation gate requires a separate design session.

**Recovery.** Verify v1.0 npm packages via the package-shasum and the GitHub
release commit. Migration to a CI-based publish flow with the translation
handoff worked out is planned for v1.x.

---

## B-A-003 — indexer schema-version migration model

**Symptom.** Bumping `SCHEMA_VERSION` in `src/indexer/schema.ts` and re-running
`research-os index build` against a pack with a previously-built index can
produce a refusal or a malformed index.

**Cause.** v1.0 ships a write-side `SCHEMA_VERSION` integer but no read-side
enforcement: there is no "stored vs current" check, no refuse-on-newer-than-tool
gate, no additive `ALTER TABLE` migration runner. The contract is documented
but not enforced.

**Recovery.** When the release notes for a new research-os version include a
`BREAKING: delete .research-os/index.sqlite` instruction, delete the local
index file before running `research-os index build`. The pack itself is
unaffected — the indexer is an acceleration layer over evidence + claims, not
the source of record (Law 8). Rebuilding is idempotent.

```bash
# On SCHEMA_VERSION bump:
rm .research-os/index.sqlite
research-os index build --all
```

**Future work.** Read-side enforcement (compare stored vs current, refuse on
newer-than-tool, additive `ALTER TABLE` migrations) is planned for a future
release. Until then, this disclosure is the contract.

---

## Related pages

- [Recovery runbook](/research-os/handbook/recovery/) — partial-failure recovery for the long-running commands.
- [CLI Reference](/research-os/handbook/reference/) — complete command + flag reference.
