# Security Policy

## Reporting a Vulnerability

If you discover a security issue in `research-os`, please report it privately:

- **GitHub Security Advisory:** Open a private advisory on the repository (preferred).
- **Email:** 64996768+mcp-tool-shop@users.noreply.github.com

Do not file a public issue for security reports.

**Response timeline:** We aim to acknowledge reports within 72 hours and provide a resolution timeline within 7 days.

## Scope

`research-os` is a local-first CLI that operates on the user's filesystem and (when configured) issues outbound network requests to fetch sources. It does not run a server, accept inbound connections, or store credentials.

Reports about the following are in scope:

- Path-traversal in pack scaffolding or template rendering
- Schema validation bypasses that allow malformed packs
- Issues in source-fetching adapters that could leak local data
- Supply-chain risks in published artifacts

## Supported Versions

Until v1.0.0, only the latest release is supported.

## Known limitations

### DNS-rebinding TOCTOU in `gather` SSRF guard

The SSRF guard in `src/sources/fetch.ts` resolves the URL hostname via
`dns.lookup(...)` and rejects private/loopback/link-local addresses
before invoking `fetch()`. The subsequent `fetch()` call performs its
own DNS resolution. An attacker controlling the authoritative DNS for
a hostname can return a public IP to the pre-check and a private IP
to the connect, evading the guard.

**Threat-model fit:** research-os gather operates on operator-curated
URL lists (output of `research-os discover approve`), not arbitrary
user input. The residual risk is acceptable for v1.0.

**Future hardening (post-v1.0):** resolve once and pass the IP directly
via a custom dispatcher (e.g., `undici.Agent` with a `connect.lookup`
hook) so the fetch reuses the pre-checked address.
