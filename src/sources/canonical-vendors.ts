export interface CanonicalVendor {
  slug: string;
  /** Exact hostname matches (lowercased). Consumed by L3. */
  hosts: string[];
  /**
   * Host+path-prefix matches for cases where the vendor surface is a subpath,
   * not the whole host (e.g. "itch.io/docs", "support.google.com/googleplay").
   * Format: "hostname/path-prefix" — leading slash on path is added by the matcher.
   * Consumed by L3 as an extension of the hosts matcher.
   */
  hostPaths?: string[];
  /**
   * GitHub org slugs (original casing) whose api.github.com and
   * raw.githubusercontent.com URLs should be treated as canonical.
   * Consumed by L4 and L5, NOT by L3.
   */
  github_orgs?: string[];
  /**
   * Vendor-specific source type.
   * Protocol-foundation vendors that own a canonical spec/API surface → 'primary'.
   * Platform/engine vendors whose canonical surface is documentation → 'docs'.
   */
  source_type: 'primary' | 'docs';
  description: string;
}

/**
 * Advisor-locked canonical vendor list (v0.4.0 initial set — 11 entries).
 * Operator-extension contract: add entries via research-os PR, not per-pack YAML.
 * See Q3 advisor decision.
 */
export const CANONICAL_VENDORS: readonly CanonicalVendor[] = [
  // ── Protocol-foundation vendors → primary ────────────────────────────────
  {
    slug: 'xrpl-foundation',
    hosts: ['xrpl.org', 'xls.xrpl.org'],
    github_orgs: ['XRPLF'],
    source_type: 'primary',
    description: 'XRPL Foundation — canonical authority for the XRPL protocol + XLS standards.',
  },
  {
    slug: 'ipfs-foundation',
    hosts: ['docs.ipfs.tech', 'ipfs.tech'],
    source_type: 'primary',
    description: 'IPFS protocol canonical surface.',
  },
  {
    slug: 'arweave',
    hosts: ['docs.arweave.org', 'arweave.org'],
    source_type: 'primary',
    description: 'Arweave protocol canonical surface.',
  },
  {
    slug: 'anthropic',
    hosts: ['docs.anthropic.com', 'anthropic.com', 'claude.com'],
    source_type: 'primary',
    description:
      'Claude API + Anthropic models — vendor owns the API surface. Resolves F-47: docs.anthropic.com is primary, not docs.',
  },
  // ── Platform/engine vendors → docs ───────────────────────────────────────
  {
    slug: 'godot-foundation',
    hosts: ['docs.godotengine.org', 'godotengine.org'],
    github_orgs: ['godotengine'],
    source_type: 'docs',
    description:
      'Godot engine docs. NB: api.github.com/repos/godotengine/godot/releases matches L4 as canonical-releases → primary.',
  },
  {
    slug: 'apple',
    hosts: ['developer.apple.com', 'docs.developer.apple.com'],
    source_type: 'docs',
    description:
      'Apple platform docs. developer.apple.com/documentation/* is JS-shell (F-42); docs.developer.apple.com/tutorials/data/*.md is the text-stable alternate.',
  },
  {
    slug: 'microsoft',
    hosts: ['learn.microsoft.com'],
    github_orgs: ['MicrosoftDocs'],
    source_type: 'docs',
    description: 'MS Learn + MicrosoftDocs raw GitHub.',
  },
  {
    slug: 'mozilla',
    hosts: ['developer.mozilla.org'],
    source_type: 'docs',
    description: 'MDN web platform docs.',
  },
  {
    slug: 'google-android',
    hosts: ['developer.android.com'],
    source_type: 'docs',
    description: 'Android platform docs.',
  },
  {
    slug: 'google-play',
    hosts: [],
    hostPaths: ['support.google.com/googleplay'],
    source_type: 'docs',
    description:
      'Play Store policy/help docs. Matched on host+path-prefix to avoid classifying all of support.google.com as docs.',
  },
  {
    slug: 'itch-io',
    hosts: [],
    hostPaths: ['itch.io/docs'],
    source_type: 'docs',
    description:
      'itch.io creator docs (not storefront chrome). Matched on host+path-prefix so itch.io/<creator>/<game> does not match L3.',
  },
] as const;
