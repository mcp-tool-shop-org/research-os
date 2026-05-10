import { describe, it, expect } from 'vitest';
import { classifySourceType } from '../../src/sources/source-type-classifier.js';

// ── 1. Precedence-stack ordering ─────────────────────────────────────────────

describe('precedence-stack ordering', () => {
  it('F-47 regression: docs.anthropic.com → primary via L3, NOT docs via L6 docs-host-prefix fallback', () => {
    // Pre-v0.4: deriveSourceType() fired host.startsWith('docs.') → 'docs'.
    // Post-v0.4: canonical-vendor:anthropic (L3) matches first → 'primary'.
    // 6 frozen cards in the research-os-spec dogfood pack carry source_type:'primary'
    // for docs.anthropic.com URLs — classifier must agree with operator-repaired state.
    const result = classifySourceType({ url: 'https://docs.anthropic.com/en/docs/claude-code' });
    expect(result.source_type).toBe('primary');
    expect(result.rule_hint).toBe('canonical-vendor:anthropic');
    expect(result.precedence_level).toBe(3);
  });

  it('docs.godotengine.org → docs (vendor-specified source_type honored, not overridden to primary)', () => {
    // godot-foundation.source_type is 'docs' (platform vendor, not protocol vendor).
    // L3 fires but returns vendor.source_type = 'docs', not 'primary'.
    const result = classifySourceType({ url: 'https://docs.godotengine.org/en/stable/tutorials/index.html' });
    expect(result.source_type).toBe('docs');
    expect(result.rule_hint).toBe('canonical-vendor:godot-foundation');
    expect(result.precedence_level).toBe(3);
  });

  it('api.github.com/repos/godotengine/... does NOT match L3 despite godotengine being in github_orgs → falls through to L4', () => {
    // L3 matches vendor.hosts[] only — api.github.com is not in any vendor.hosts[].
    // github_orgs is consumed by L4/L5, not L3.
    const result = classifySourceType({
      url: 'https://api.github.com/repos/godotengine/godot/releases?per_page=20',
    });
    // L4 fires because godotengine is a canonical org → canonical-releases → primary
    expect(result.source_type).toBe('primary');
    expect(result.rule_hint).toBe('github-api:canonical-releases');
    expect(result.precedence_level).toBe(4);
  });
});

// ── 2. Per-rule positive tests ────────────────────────────────────────────────

describe('per-rule positive tests', () => {
  it('xrpl.org/docs/... → primary + canonical-vendor:xrpl-foundation + L3', () => {
    const result = classifySourceType({ url: 'https://xrpl.org/docs/references/protocol/transactions' });
    expect(result.source_type).toBe('primary');
    expect(result.rule_hint).toBe('canonical-vendor:xrpl-foundation');
    expect(result.precedence_level).toBe(3);
  });

  it('xls.xrpl.org/... → primary + canonical-vendor:xrpl-foundation + L3', () => {
    const result = classifySourceType({ url: 'https://xls.xrpl.org/XLS-30d-tokenization' });
    expect(result.source_type).toBe('primary');
    expect(result.rule_hint).toBe('canonical-vendor:xrpl-foundation');
    expect(result.precedence_level).toBe(3);
  });

  it('raw.githubusercontent.com/godotengine/godot-docs/.../tutorials/.../.rst → docs + raw-github:project-docs + L5', () => {
    // godotengine is a canonical org → isCanonicalOrg = true → project-docs
    const result = classifySourceType({
      url: 'https://raw.githubusercontent.com/godotengine/godot-docs/master/tutorials/getting-started/index.rst',
    });
    expect(result.source_type).toBe('docs');
    expect(result.rule_hint).toBe('raw-github:project-docs');
    expect(result.precedence_level).toBe(5);
  });

  it('api.github.com/search/issues?q=... → forum + github-api:search-issues + L4', () => {
    const result = classifySourceType({
      url: 'https://api.github.com/search/issues?q=godot+export+android&per_page=10',
    });
    expect(result.source_type).toBe('forum');
    expect(result.rule_hint).toBe('github-api:search-issues');
    expect(result.precedence_level).toBe(4);
  });

  it('api.github.com/repos/godotengine/godot/issues/<id> → forum + github-api:issue-thread + L4', () => {
    const result = classifySourceType({
      url: 'https://api.github.com/repos/godotengine/godot/issues/110466',
    });
    expect(result.source_type).toBe('forum');
    expect(result.rule_hint).toBe('github-api:issue-thread');
    expect(result.precedence_level).toBe(4);
  });

  it('api.github.com/repos/godotengine/godot/releases (canonical org) → primary + github-api:canonical-releases + L4', () => {
    const result = classifySourceType({
      url: 'https://api.github.com/repos/godotengine/godot/releases?per_page=20',
    });
    expect(result.source_type).toBe('primary');
    expect(result.rule_hint).toBe('github-api:canonical-releases');
    expect(result.precedence_level).toBe(4);
  });

  it('api.github.com/repos/random-org/random-repo/releases (non-canonical) → secondary + github-api:releases-noncanonical + L4', () => {
    const result = classifySourceType({
      url: 'https://api.github.com/repos/random-org/random-repo/releases?per_page=20',
    });
    expect(result.source_type).toBe('secondary');
    expect(result.rule_hint).toBe('github-api:releases-noncanonical');
    expect(result.precedence_level).toBe(4);
  });

  it('raw.githubusercontent.com/youssof20/savestate/master/README.md → secondary + raw-github:plugin-readme + L5', () => {
    // Non-canonical org, non-docs-shaped repo, but filename is README.md → plugin-readme
    const result = classifySourceType({
      url: 'https://raw.githubusercontent.com/youssof20/savestate/master/README.md',
    });
    expect(result.source_type).toBe('secondary');
    expect(result.rule_hint).toBe('raw-github:plugin-readme');
    expect(result.precedence_level).toBe(5);
  });
});

// ── 3. GitHub UI HTML flag ────────────────────────────────────────────────────

describe('GitHub UI HTML flag (L2)', () => {
  it('github.com/godotengine/godot/releases → unknown + flagged:github-ui-html + L2 (does not throw)', () => {
    const result = classifySourceType({ url: 'https://github.com/godotengine/godot/releases' });
    expect(result.source_type).toBe('unknown');
    expect(result.rule_hint).toBe('flagged:github-ui-html');
    expect(result.precedence_level).toBe(2);
  });

  it('github.com/<org>/<repo>/issues/<id> (HTML) → flagged:github-ui-html + L2 (does not throw)', () => {
    const result = classifySourceType({
      url: 'https://github.com/godotengine/godot/issues/110466',
    });
    expect(result.source_type).toBe('unknown');
    expect(result.rule_hint).toBe('flagged:github-ui-html');
    expect(result.precedence_level).toBe(2);
  });
});

// ── 4. Fallback / no-match ────────────────────────────────────────────────────

describe('fallback and no-match (L6)', () => {
  it('docs.random-vendor.com/... (not in canonical-vendor list) → docs + fallback:docs-host-prefix + L6', () => {
    const result = classifySourceType({ url: 'https://docs.random-vendor.com/getting-started' });
    expect(result.source_type).toBe('docs');
    expect(result.rule_hint).toBe('fallback:docs-host-prefix');
    expect(result.precedence_level).toBe(6);
  });

  it('random-blog.example.com/post → unknown + no-rule-match + L6', () => {
    const result = classifySourceType({ url: 'https://random-blog.example.com/post/some-article' });
    expect(result.source_type).toBe('unknown');
    expect(result.rule_hint).toBe('no-rule-match');
    expect(result.precedence_level).toBe(6);
  });
});
