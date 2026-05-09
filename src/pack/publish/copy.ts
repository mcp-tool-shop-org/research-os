import { mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function copyDir(src: string, dst: string): number {
  mkdirSync(dst, { recursive: true });
  let count = 0;
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
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
