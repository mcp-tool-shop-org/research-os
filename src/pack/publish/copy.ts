import { mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A-PACK-002: directory names that must never be copied into a published
 * pack. `.research-os/` holds the *derivative* mutable SQLite index
 * (`.research-os/index.sqlite`, written by `research-os index build`). It is
 * not fingerprinted in freeze-receipt.json, so copying it would smuggle a
 * stale, mutable DB into a "frozen" pack — and orphan detection in verify.ts
 * (which skips dot-directories) would never flag it. We also skip the usual
 * VCS / dependency dirs so a publish from a working tree stays clean.
 * Exported so regression tests can assert the exclusion set.
 */
export const COPY_EXCLUDED_DIRS = new Set<string>([
  '.research-os',
  '.git',
  'node_modules',
]);

/**
 * B-PACK-001 — align the copy walker with verify.ts `walkFiles` (orphan
 * detection) so the two file-sets are identical, preserving the D-001
 * inverse-direction guarantee.
 *
 * `walkFiles` SKIPS every leading-dot name (files and dirs). `copyDir`
 * previously skipped only the dirs in `COPY_EXCLUDED_DIRS`, so a stray hidden
 * FILE (`.DS_Store`, `.env`, an editor swap file) was copied into the published
 * pack but was INVISIBLE to orphan detection — it shipped silently. We now skip
 * leading-dot files here too, matching `walkFiles`, so copy and orphan-detection
 * see the same set and a hidden file can never slip past D-001.
 *
 * `copyDir` also silently dropped symlink entries (`Dirent.isFile()` /
 * `isDirectory()` are both false for a symlink). That is the correct default
 * for a published pack (no symlinks in a frozen artifact), but the drop is now
 * surfaced via the optional `onSkip` callback so the publisher can warn rather
 * than lose a file with no trace. The callback is optional — existing callers
 * that pass only (src, dst) are unaffected and behavior on a pack with no
 * dotfiles / no symlinks is byte-identical.
 */
export interface CopySkip {
  kind: 'dotfile' | 'symlink';
  path: string;
}

export function copyDir(
  src: string,
  dst: string,
  onSkip?: (skip: CopySkip) => void,
): number {
  mkdirSync(dst, { recursive: true });
  let count = 0;
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && COPY_EXCLUDED_DIRS.has(entry.name)) continue;
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    // Parity with verify.ts walkFiles: skip every leading-dot name so the
    // copied set and the orphan-detected set are identical.
    if (entry.name.startsWith('.')) {
      if (entry.isFile()) onSkip?.({ kind: 'dotfile', path: srcPath });
      continue;
    }
    if (entry.isDirectory()) {
      count += copyDir(srcPath, dstPath, onSkip);
    } else if (entry.isFile()) {
      copyFileSync(srcPath, dstPath);
      count++;
    } else if (entry.isSymbolicLink()) {
      // Not copied (frozen packs hold no symlinks) — surface the drop.
      onSkip?.({ kind: 'symlink', path: srcPath });
    }
  }
  return count;
}
