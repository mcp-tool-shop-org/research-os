import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { copyDir, type CopySkip } from '../../src/pack/publish/copy.js';

let srcDir: string;
let dstDir: string;

beforeEach(async () => {
  srcDir = await mkdtemp(join(tmpdir(), 'research-os-pack-copy-src-'));
  dstDir = await mkdtemp(join(tmpdir(), 'research-os-pack-copy-dst-'));
});

afterEach(async () => {
  await rm(srcDir, { recursive: true, force: true });
  await rm(dstDir, { recursive: true, force: true });
});

describe('B-PACK-001 — copyDir / walkFiles file-set alignment', () => {
  // RED-half target: a stray hidden FILE used to be copied into the published
  // pack (only dot-DIRS in COPY_EXCLUDED_DIRS were skipped) while verify.ts
  // walkFiles skips every leading-dot name — so the hidden file shipped but was
  // invisible to D-001 orphan detection. copyDir must now skip leading-dot
  // files so the copied set matches the orphan-detected set.
  it('does not copy leading-dot files into the published pack', async () => {
    await writeFile(join(srcDir, 'README.md'), '# real file\n', 'utf8');
    await writeFile(join(srcDir, '.DS_Store'), 'junk', 'utf8');
    await writeFile(join(srcDir, '.env'), 'SECRET=1', 'utf8');

    const count = copyDir(srcDir, dstDir);

    // The one non-dot file is copied; the two dotfiles are not.
    expect(count).toBe(1);
    expect(existsSync(join(dstDir, 'README.md'))).toBe(true);
    expect(existsSync(join(dstDir, '.DS_Store'))).toBe(false);
    expect(existsSync(join(dstDir, '.env'))).toBe(false);

    // No leading-dot file survives in the copied set — parity with walkFiles.
    const copied = await readdir(dstDir);
    expect(copied.filter((n) => n.startsWith('.'))).toEqual([]);
  });

  it('surfaces a skipped dotfile via the optional onSkip callback', async () => {
    await writeFile(join(srcDir, 'keep.txt'), 'k', 'utf8');
    await writeFile(join(srcDir, '.hidden'), 'h', 'utf8');

    const skips: CopySkip[] = [];
    copyDir(srcDir, dstDir, (s) => skips.push(s));

    expect(skips).toContainEqual({ kind: 'dotfile', path: join(srcDir, '.hidden') });
  });

  // HAPPY-half: a pack with no dotfiles and no symlinks copies byte-identically
  // to the pre-fix behavior (nested dirs, normal files, file count preserved).
  it('copies normal files and nested directories unchanged', async () => {
    await writeFile(join(srcDir, 'a.txt'), 'a', 'utf8');
    await mkdir(join(srcDir, 'sub'), { recursive: true });
    await writeFile(join(srcDir, 'sub', 'b.txt'), 'b', 'utf8');

    const skips: CopySkip[] = [];
    const count = copyDir(srcDir, dstDir, (s) => skips.push(s));

    expect(count).toBe(2);
    expect(existsSync(join(dstDir, 'a.txt'))).toBe(true);
    expect(existsSync(join(dstDir, 'sub', 'b.txt'))).toBe(true);
    // No skips on a clean pack — default behavior unchanged.
    expect(skips).toEqual([]);
  });

  // HAPPY-half: excluded dirs (.research-os / .git / node_modules) still skipped.
  it('still skips COPY_EXCLUDED_DIRS', async () => {
    await writeFile(join(srcDir, 'real.txt'), 'r', 'utf8');
    await mkdir(join(srcDir, '.research-os'), { recursive: true });
    await writeFile(join(srcDir, '.research-os', 'index.sqlite'), 'db', 'utf8');
    await mkdir(join(srcDir, 'node_modules'), { recursive: true });
    await writeFile(join(srcDir, 'node_modules', 'x.js'), 'x', 'utf8');

    const count = copyDir(srcDir, dstDir);
    expect(count).toBe(1);
    expect(existsSync(join(dstDir, '.research-os'))).toBe(false);
    expect(existsSync(join(dstDir, 'node_modules'))).toBe(false);
  });
});
