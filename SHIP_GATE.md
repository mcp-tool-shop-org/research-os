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
- [x] `[all]` Version in manifest matches git tag — v0.3.0 in package.json + RESEARCH_OS_VERSION; tag v0.3.0 created at release commit (2026-05-09)
- [x] `[all]` Dependency scanning runs in CI — `npm audit --audit-level=high` in .github/workflows/ci.yml (2026-05-08)
- [x] `[all]` Automated dependency update mechanism exists — Dependabot weekly npm in .github/dependabot.yml (2026-05-08)
- [x] `[npm]` `npm pack --dry-run` includes: dist/, README.md, CHANGELOG.md, LICENSE, SECURITY.md (2026-05-08)
- [x] `[npm]` `engines.node` set — ">=20" in package.json (2026-05-08)
- [x] `[npm]` Lockfile committed — package-lock.json present (2026-05-08)
- [ ] `[vsix]` SKIP: not a VS Code extension
- [ ] `[desktop]` SKIP: not a desktop app
- [ ] `[all]` SKIP: Translations (polyglot-mcp, 8 languages) — WAIVED for v0.3.0. README updated (status block, version badge, "What v0.3 is not"); translations will be stale at release time. Operator re-runs translations locally post-release per hard-rules.md (Claude does not run translations).
- [ ] `[all]` SKIP: GitHub repo metadata (description, homepage, topics) — WAIVED for v0.3.0. Deferred to operator action post-release; not load-bearing for this release thesis.

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
