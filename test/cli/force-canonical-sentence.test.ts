/**
 * Stage C Phase 3 Theme 1 (C1-001): canonical --force sentence verification.
 *
 * The pack publish --force flag description, and the publish/index.ts
 * --force first-encounter hint, MUST carry the canonical sentence:
 *
 *   --force clears and replaces the target package directory. Do not keep
 *   hand-authored files inside generated package output.
 *
 * Test 1: invoke `research-os pack publish --help` via execFileSync and assert
 *         the canonical sentence appears in --help output.
 * Test 2: assert the publish/index.ts source carries the canonical substring
 *         "clears and replaces the target package directory" in the
 *         PACK_EXISTS hint (regression for C1-006).
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const cliPath = join(__dirname, '..', '..', 'dist', 'cli.js');

describe('Stage C Phase 3 Theme 1 — canonical --force sentence', () => {
  it('dist/cli.js exists (build prerequisite)', () => {
    expect(existsSync(cliPath)).toBe(true);
  });

  it('`research-os pack publish --help` includes the canonical --force sentence', () => {
    const out = execFileSync('node', [cliPath, 'pack', 'publish', '--help'], {
      encoding: 'utf8',
    });
    // Commander word-wraps the description across multiple lines (typically
    // 80 columns). Normalize whitespace before substring-matching so the
    // canonical sentence is recognized regardless of where the wrap landed.
    const normalized = out.replace(/\s+/g, ' ');
    expect(normalized).toContain('--force clears and replaces the target package directory');
    expect(normalized).toContain('Do not keep hand-authored files inside generated package output');
  });

  it('publish/index.ts PACK_EXISTS hint carries the canonical substring (C1-006)', () => {
    const idxPath = join(__dirname, '..', '..', 'src', 'pack', 'publish', 'index.ts');
    const src = readFileSync(idxPath, 'utf8');
    expect(src).toContain('clears and replaces the target package directory');
    expect(src).toContain('Do not keep hand-authored files inside generated package output');
  });
});
