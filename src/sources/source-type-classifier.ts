/**
 * Centralized source-type classifier — v0.4 Component B.
 *
 * Implements the advisor-locked 6-level precedence stack (L2–L6).
 * L1 (override ledger) lives outside this module — it is applied by Component A
 * (Session 3) at the gather-integration site, after the classifier returns.
 *
 * Shape: pure-function module, no I/O, no schema parsing.
 * Mirrors src/closure-ledger/effective-accepted.ts.
 *
 * Fixes: F-23, F-26, F-31, F-40, F-47.
 */
import { URL } from 'node:url';

import { CANONICAL_VENDORS } from './canonical-vendors.js';

export interface ClassificationInput {
  url: string;
  /** Optional content-shape hints from the extractor. Defaults to URL-only classification if absent. */
  contentType?: string;
  httpStatus?: number;
}

export interface ClassificationResult {
  source_type: 'primary' | 'docs' | 'forum' | 'secondary' | 'unknown';
  /**
   * Human-readable rule that fired, e.g.:
   *   "canonical-vendor:xrpl-foundation"
   *   "github-api:search-issues"
   *   "raw-github:project-docs"
   *   "fallback:docs-host-prefix"
   *   "no-rule-match"
   */
  rule_hint: string;
  /** Precedence level of the rule that fired (2–6). Level 1 = override ledger (Component A). */
  precedence_level: 2 | 3 | 4 | 5 | 6;
}

/** GitHub org slugs (lowercased) from all canonical vendors. Used by L4 and L5. */
const CANONICAL_GITHUB_ORGS: Set<string> = new Set(
  CANONICAL_VENDORS.flatMap((v) => (v.github_orgs ?? []).map((o) => o.toLowerCase())),
);

/**
 * Classify a source URL into a source_type using the advisor-locked precedence stack.
 *
 * Precedence (L1 is external — Component A):
 *   L2 — Reject/flag known bad evidence surfaces (GitHub UI HTML).
 *   L3 — Canonical vendor/source-owner rules (direct host or host+path-prefix match).
 *   L4 — GitHub API endpoint rules (api.github.com).
 *   L5 — Raw GitHub docs/file rules (raw.githubusercontent.com).
 *   L6 — General fallbacks (docs-host-prefix, known forums, no-rule-match).
 *
 * Returns without throwing for any input, including malformed URLs.
 */
export function classifySourceType(input: ClassificationInput): ClassificationResult {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return { source_type: 'unknown', rule_hint: 'no-rule-match', precedence_level: 6 };
  }

  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname;

  // ── L2: Flag known bad evidence surfaces ────────────────────────────────
  // github.com/<owner>/<repo> (and deeper) are JS-rendered HTML pages — not API.
  // Audit-blocking, not gather-blocking (Q5): classifier returns the signal; caller decides.
  if (host === 'github.com' && /^\/[^/]+\/[^/]+/.test(pathname)) {
    return { source_type: 'unknown', rule_hint: 'flagged:github-ui-html', precedence_level: 2 };
  }

  // ── L3: Canonical vendor/source-owner rules ──────────────────────────────
  // Direct host match only. Does NOT match api.github.com or raw.githubusercontent.com —
  // those go to L4/L5 via github_orgs. L3 consumes vendor.hosts[] and vendor.hostPaths[].
  for (const vendor of CANONICAL_VENDORS) {
    if (vendor.hosts.includes(host)) {
      return {
        source_type: vendor.source_type,
        rule_hint: `canonical-vendor:${vendor.slug}`,
        precedence_level: 3,
      };
    }
    for (const hp of vendor.hostPaths ?? []) {
      // hp format: "hostname/path-prefix" (e.g. "itch.io/docs", "support.google.com/googleplay")
      const slashIdx = hp.indexOf('/');
      const hpHost = slashIdx === -1 ? hp : hp.slice(0, slashIdx);
      const hpPath = slashIdx === -1 ? '' : '/' + hp.slice(slashIdx + 1);
      if (
        host === hpHost &&
        (hpPath === '' || pathname === hpPath || pathname.startsWith(hpPath + '/'))
      ) {
        return {
          source_type: vendor.source_type,
          rule_hint: `canonical-vendor:${vendor.slug}`,
          precedence_level: 3,
        };
      }
    }
  }

  // ── L4: GitHub API endpoint rules ────────────────────────────────────────
  if (host === 'api.github.com') {
    // /search/issues — always forum
    if (pathname.startsWith('/search/issues')) {
      return { source_type: 'forum', rule_hint: 'github-api:search-issues', precedence_level: 4 };
    }

    // /repos/<org>/<repo>/releases — primary if canonical org, secondary otherwise
    const releasesMatch = pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/releases(?:\/|$|\?)/);
    if (releasesMatch) {
      const org = releasesMatch[1].toLowerCase();
      if (CANONICAL_GITHUB_ORGS.has(org)) {
        return {
          source_type: 'primary',
          rule_hint: 'github-api:canonical-releases',
          precedence_level: 4,
        };
      }
      return {
        source_type: 'secondary',
        rule_hint: 'github-api:releases-noncanonical',
        precedence_level: 4,
      };
    }

    // /repos/<org>/<repo>/issues/<numeric_id> — single issue thread
    // Must be checked before the issues-list pattern below.
    if (pathname.match(/^\/repos\/[^/]+\/[^/]+\/issues\/\d+(?:\/|$|\?)/)) {
      return { source_type: 'forum', rule_hint: 'github-api:issue-thread', precedence_level: 4 };
    }

    // /repos/<org>/<repo>/issues — list (with optional query or trailing slash)
    if (pathname.match(/^\/repos\/[^/]+\/[^/]+\/issues(?:\/|$|\?)/)) {
      return { source_type: 'forum', rule_hint: 'github-api:issues-list', precedence_level: 4 };
    }

    // /repos/<org>/<repo>/tags
    if (pathname.match(/^\/repos\/[^/]+\/[^/]+\/tags(?:\/|$|\?)/)) {
      return { source_type: 'secondary', rule_hint: 'github-api:tags', precedence_level: 4 };
    }
  }

  // ── L5: Raw GitHub docs/file rules ───────────────────────────────────────
  if (host === 'raw.githubusercontent.com') {
    // Pathname: /<org>/<repo>/<branch>/<file-path>
    const rawMatch = pathname.match(/^\/([^/]+)\/([^/]+)\/([^/]+)\/(.*)/);
    if (rawMatch) {
      const [, org, repo, , filePath] = rawMatch;
      const isCanonicalOrg = CANONICAL_GITHUB_ORGS.has(org.toLowerCase());
      const isDocsShapedRepo = /-docs$/.test(repo) || /-documentation$/.test(repo);
      const isDocFile = /\.(rst|md)$/i.test(filePath);

      // Docs files from canonical orgs or docs-shaped repos → project-docs
      if (isDocFile && (isCanonicalOrg || isDocsShapedRepo)) {
        return {
          source_type: 'docs',
          rule_hint: 'raw-github:project-docs',
          precedence_level: 5,
        };
      }

      // README.md (any depth) from non-canonical, non-docs-shaped repos → plugin-readme
      if (/(?:^|\/)README\.md$/i.test(filePath)) {
        return {
          source_type: 'secondary',
          rule_hint: 'raw-github:plugin-readme',
          precedence_level: 5,
        };
      }

      // All other raw GitHub paths
      return { source_type: 'secondary', rule_hint: 'raw-github:other', precedence_level: 5 };
    }
    return { source_type: 'secondary', rule_hint: 'raw-github:other', precedence_level: 5 };
  }

  // ── L6: General fallbacks ────────────────────────────────────────────────
  // Critical: docs-host-prefix only fires if L3 (canonical-vendor) didn't match.
  // This resolves F-47: docs.anthropic.com matches L3 first → primary, not docs.
  if (host.startsWith('docs.')) {
    return {
      source_type: 'docs',
      rule_hint: 'fallback:docs-host-prefix',
      precedence_level: 6,
    };
  }

  const KNOWN_FORUM_HOSTS = ['stackoverflow.com', 'reddit.com', 'news.ycombinator.com'];
  if (KNOWN_FORUM_HOSTS.some((fh) => host === fh || host.endsWith('.' + fh))) {
    return { source_type: 'forum', rule_hint: 'fallback:known-forum', precedence_level: 6 };
  }

  return { source_type: 'unknown', rule_hint: 'no-rule-match', precedence_level: 6 };
}
