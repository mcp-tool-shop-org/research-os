import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createTinyPack } from './helpers.js';
import { publish } from '../../src/pack/publish/index.js';

// D-001 part 1: `pack publish --force` must clear the target directory before
// writing into it. Without this, stale files from a previous publish can
// survive into the new pack — the receipt + per-fingerprint hash checks both
// PASS (they only verify files-listed-exist-and-match, not the inverse) so a
// dirty package ships silently.

let outerTmp: string;

beforeEach(() => {
  outerTmp = mkdtempSync(join(tmpdir(), 'ros-test-force-clear-'));
});

afterEach(() => {
  rmSync(outerTmp, { recursive: true, force: true });
});

describe('pack publish --force clears the target before writing', () => {
  it('removes a stale file from a previous publish on --force', async () => {
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });

    createTinyPack(packDir);

    // First publish — fresh target.
    await publish({ fromDir: packDir, toDir: pkgDir });
    expect(existsSync(pkgDir)).toBe(true);

    // Seed a stale file inside the published package — something that was
    // never fingerprinted by freeze and isn't in PUBLISH_GENERATED_PATHS.
    // Drop it under `pack/` so it sits alongside fingerprinted artifacts —
    // that's the worst case (the place orphan-detection has to catch).
    const stalePath = join(pkgDir, 'pack/sections/01-test/STALE-LEFTOVER.txt');
    writeFileSync(stalePath, 'this should not survive --force', 'utf8');
    expect(existsSync(stalePath)).toBe(true);

    // Re-publish with --force — the stale file must NOT survive.
    const result = await publish({ fromDir: packDir, toDir: pkgDir, force: true });

    expect(existsSync(stalePath)).toBe(false);
    // And verify-pack passes (no orphan present, all fingerprints intact).
    expect(result.verifyPassed).toBe(true);
  });

  it('still creates the publish-root parent after --force wipe', async () => {
    // Sanity: the publish root (parent of pkgDir) must continue to exist
    // after the clean step — we only nuke the target, not its parent.
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });
    createTinyPack(packDir);

    await publish({ fromDir: packDir, toDir: pkgDir });
    const result = await publish({ fromDir: packDir, toDir: pkgDir, force: true });
    expect(result.verifyPassed).toBe(true);
    expect(existsSync(dirname(pkgDir))).toBe(true);
  });

  it('refuses to publish to a non-empty target without --force', async () => {
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });
    createTinyPack(packDir);

    await publish({ fromDir: packDir, toDir: pkgDir });
    // Second publish without --force still refuses (pre-existing behavior).
    await expect(publish({ fromDir: packDir, toDir: pkgDir })).rejects.toThrow(/force/);
  });
});
