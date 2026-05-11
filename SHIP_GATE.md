# Ship Gate

> No repo is "done" until every applicable line is checked.
> Copy this into your repo root. Check items off per-release.

**Tags:** `[all]` every repo · `[npm]` `[pypi]` `[vsix]` `[desktop]` `[container]` published artifacts · `[mcp]` MCP servers · `[cli]` CLI tools

**Detected:** `[all]` `[npm]` `[cli]`

---

## A. Security Baseline

- [x] `[all]` SECURITY.md exists (report email, supported versions, response timeline) (2026-05-08)
- [x] `[all]` README includes threat model paragraph (data touched, data NOT touched, permissions required) (2026-05-08)
- [x] `[all]` No secrets, tokens, or credentials in source or diagnostics output — only OLLAMA_HOST/OLLAMA_INTERN_MODEL env config, no hardcoded secrets (2026-05-08)
- [x] `[all]` No telemetry by default — research-os writes only to local pack artifacts, no outbound telemetry (2026-05-08)

### Default safety posture

- [ ] `[cli|mcp|desktop]` SKIP: research-os does not perform dangerous system actions (kill, delete system resources, restart services); writes only within the research-pack directory
- [x] `[cli|mcp|desktop]` File operations constrained to known directories — all writes anchored to pack root via path resolution (2026-05-08)
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[mcp]` SKIP: not an MCP server

## B. Error Handling

- [x] `[all]` Errors follow the Structured Error Shape: `code`, `message`, `hint`, `cause?`, `retryable?` — ResearchOSError has all five fields; CLI reportError shows code + message + hint (2026-05-08)
- [x] `[cli]` Exit codes: 0 ok · 1 user error · 2 runtime error · 3 partial success — gate/freeze/synth use exit 2 for blocked state (2026-05-08)
- [x] `[cli]` No raw stack traces without `--debug` — reportError suppresses stacks at all levels (2026-05-08)
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[desktop]` SKIP: not a desktop app
- [ ] `[vscode]` SKIP: not a VS Code extension

## C. Operator Docs

- [x] `[all]` README is current: what it does, install, usage, supported platforms + runtime versions (Node ≥ 20) (2026-05-08)
- [x] `[all]` CHANGELOG.md (Keep a Changelog format) (2026-05-08)
- [x] `[all]` LICENSE file present and repo states support status (MIT) (2026-05-08)
- [x] `[cli]` `--help` output accurate for all commands and flags (2026-05-08)
- [ ] `[cli|mcp|desktop]` SKIP: research-os CLI writes structured status to stdout only; no logging framework with sensitive data paths; stacks suppressed via reportError without requiring a flag
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[complex]` SKIP: no background daemon, no state machines requiring daily ops procedures

## D. Shipping Hygiene

- [x] `[all]` `verify` script exists — `npm run build && npm run typecheck && npm run lint && npm run test` (2026-05-08)
- [x] `[all]` Version in manifest matches git tag — `<package.json version>` matches the value exported as `RESEARCH_OS_VERSION`; matching git tag created at the release commit (see Release log below for shipped versions)
- [x] `[all]` Dependency scanning runs in CI — `npm audit --audit-level=high` in .github/workflows/ci.yml (2026-05-08)
- [x] `[all]` Automated dependency update mechanism exists — Dependabot weekly npm in .github/dependabot.yml (2026-05-08)
- [x] `[npm]` `npm pack --dry-run` includes: dist/, README.md, CHANGELOG.md, LICENSE, SECURITY.md (2026-05-08)
- [x] `[npm]` `engines.node` set — ">=20" in package.json (2026-05-08)
- [x] `[npm]` Lockfile committed — package-lock.json present (2026-05-08)
- [ ] `[vsix]` SKIP: not a VS Code extension
- [ ] `[desktop]` SKIP: not a desktop app
- [x] `[all]` Translations (polyglot-mcp, 8 languages: ja, zh, es, fr, hi, it, pt-BR + source en) — must run BEFORE `npm publish` and BEFORE `gh release create` per the canonical release workflow. README.md changes (status block, version badge) are staged together with refreshed README.{ja,zh,es,fr,hi,it,pt-BR}.md in a single release commit; the tag is created against that commit so GitHub visitors never see stale translations at a release tag. Translations execute locally on TranslateGemma 12B (zero API cost) via `node E:/AI/polyglot-mcp/scripts/translate-all.mjs <readme-path>`. (2026-05-11 — v1.0.0 release prep, all 7 returned status=ok)
- [x] `[all]` GitHub repo metadata (description, homepage, topics) — verify before tagging. Description matches the README one-liner, homepage points at the landing page, topics cover the primary use case + ecosystem. (2026-05-11 — `gh repo edit` added 4 topics (cowork, gated-research, evidence, citations); description + homepage unchanged from v0.6.0; 11 topics total)
- [x] `[all]` Indexer schema-version migration contract (B-A-003) — v1.0 contract: bumping `SCHEMA_VERSION` in `src/indexer/schema.ts` requires deleting `.research-os/index.sqlite` on next run. Read-side enforcement + additive `ALTER TABLE` migrations are deferred to post-v1.0. Documented inline at the constant declaration and in CHANGELOG `[Unreleased]`. Until enforcement lands, treat this as a release-note disclosure: when SCHEMA_VERSION bumps, the release notes for that version must include a `BREAKING: delete .research-os/index.sqlite` instruction.

## E. Identity (soft gate — does not block ship)

- [x] `[all]` Logo in README header — centered, hosted at mcp-tool-shop-org/brand (2026-05-08)
- [x] `[org]` Landing page (@mcptoolshop/site-theme) — live at https://mcp-tool-shop-org.github.io/research-os/ (2026-05-08)

---

## Gate Rules

**Hard gate (A–D):** Must pass before any version is tagged or published.
If a section doesn't apply, mark `SKIP:` with justification — don't leave it unchecked.

**Soft gate (E):** Should be done. Product ships without it, but isn't "whole."

**Checking off:**
```
- [x] `[all]` SECURITY.md exists (2026-02-27)
```

**Skipping:**
```
- [ ] `[pypi]` SKIP: not a Python project
```

---

## Release log

Each release lands here once tagged on master. Format: `vX.Y.Z (YYYY-MM-DD, <short sha>) — <one-line note>`.

- v0.6.0 (2026-05-10, 298321f) — Experiment 6 closed: reviewer-options + deterministic single-pass calibration baseline produced with caveats. F-53/F-54 closed.
- v0.5.0 (2026-05-09, c3ea4d3) — Reviewer calibration as durable trust contract. F-48/F-49/F-50 closed.
- v0.4.0 (2026-05-08, 4399f94) — Source-truth discipline (Components A+B+D). F-27/F-47/F-46 closed.
- v0.3.3 (2026-05-08, eaac1bc) — Gate-semantics clarity (F-43 + F-41).
- v0.3.2 (2026-05-09, fc73a37) — F-36 closed: pack-publish closure-ledger reconciliation via getEffectiveAcceptedClaimIds.
- v0.3.1 (2026-05-09, 5afc413) — Section-scoped source-floor waivers + reviewer acknowledgement.
- v0.3.0 (2026-05-09, 08de7fb) — `contradict map --detector` flag (auto / heuristic / ollama-intern).
- v0.2.0 (2026-05-08, de84068) — `research-os pack publish` (Experiment 2).
- v0.1.x (earlier) — initial pipeline: discover → gather → claims → contradictions → review → freeze.
