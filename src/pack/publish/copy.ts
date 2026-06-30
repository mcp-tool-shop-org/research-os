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

export function copyDir(src: string, dst: string): number {
  mkdirSync(dst, { recursive: true });
  let count = 0;
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && COPY_EXCLUDED_DIRS.has(entry.name)) continue;
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      count += copyDir(srcPath, dstPath);
    } else if (entry.isFile()) {
      copyFileSync(srcPath, dstPath);
      count++;
    }
  }
  return count;
}
