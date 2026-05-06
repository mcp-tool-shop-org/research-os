# Security Policy

## Reporting a Vulnerability

If you discover a security issue in `research-os`, please report it privately by opening a GitHub Security Advisory on the repository, or by emailing the maintainer listed in `package.json`.

Do not file a public issue for security reports.

## Scope

`research-os` is a local-first CLI that operates on the user's filesystem and (when configured) issues outbound network requests to fetch sources. It does not run a server, accept inbound connections, or store credentials.

Reports about the following are in scope:

- Path-traversal in pack scaffolding or template rendering
- Schema validation bypasses that allow malformed packs
- Issues in source-fetching adapters that could leak local data
- Supply-chain risks in published artifacts

## Supported Versions

Until v1.0.0, only the latest release is supported.
