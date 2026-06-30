/**
 * Shared SSRF guard — A-SOURCES-001.
 *
 * Factored out of fetch.ts (A-007) so BOTH the gather-time fetcher and the
 * discover-time title fetcher (src/discover/relevance.ts) run the same
 * private/loopback + DNS-resolution check before any network call. fetch.ts's
 * guard semantics are preserved byte-for-byte; this is a pure relocation.
 *
 * NOTE: Known DNS-rebinding TOCTOU between the pre-check here and the
 * fetchImpl() resolution. An attacker controlling the authoritative DNS for a
 * hostname can return a public IP here and a private/loopback IP at fetch time
 * (or use a low-TTL A-record swap). This is acceptable for the current
 * operator-curated URL threat model. Hardening (custom dispatcher with
 * pre-resolved IP) is a post-v1.0 concern; see SECURITY.md.
 */
import { URL } from 'node:url';
import { isIP } from 'node:net';
import { promises as dns } from 'node:dns';

/**
 * A-007 — SSRF guard. True when the address is a private, loopback,
 * link-local, or otherwise non-routable address that must not be fetched.
 */
export function isPrivateOrLoopbackAddress(addr: string): boolean {
  const v = isIP(addr);
  if (v === 4) {
    const parts = addr.split('.').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
    const [a, b] = parts;
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    return false;
  }
  if (v === 6) {
    const bare = addr.toLowerCase().split('%')[0];
    if (bare === '::1' || bare === '0:0:0:0:0:0:0:1') return true;
    if (bare === '::' || bare === '0:0:0:0:0:0:0:0') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(bare);
    if (mapped) return isPrivateOrLoopbackAddress(mapped[1]);
    if (/^f[cd][0-9a-f]{2}:/.test(bare)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(bare)) return true;
    return false;
  }
  return false;
}

export type UrlSafetyResult = { safe: true } | { safe: false; reason: string };

/**
 * Validate a URL against the SSRF guard. Rejects non-http(s) protocols,
 * literal private/loopback IPs, and hostnames whose DNS resolution includes a
 * private/loopback address. DNS-lookup failure is treated as unsafe (no signal
 * → refuse).
 */
export async function isUrlSafe(urlStr: string): Promise<UrlSafetyResult> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { safe: false, reason: 'invalid URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `non-http(s) protocol ${parsed.protocol}` };
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname)) {
    if (isPrivateOrLoopbackAddress(hostname)) {
      return { safe: false, reason: `private/loopback IP ${hostname}` };
    }
    return { safe: true };
  }
  try {
    const records = await dns.lookup(hostname, { all: true });
    for (const r of records) {
      if (isPrivateOrLoopbackAddress(r.address)) {
        return {
          safe: false,
          reason: `hostname ${hostname} resolves to private/loopback ${r.address}`,
        };
      }
    }
    return { safe: true };
  } catch (err) {
    return {
      safe: false,
      reason: `DNS lookup failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
