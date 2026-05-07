import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import type { ArtifactHash, IntegrityCheck } from './types.js';

export interface CheckContext {
  packPath: string;
  invalidArtifacts: Array<{ path: string; error: string }>;
  missingArtifacts: string[];
}

export async function fileSha256(absPath: string): Promise<ArtifactHash> {
  const buf = await readFile(absPath);
  const sha = createHash('sha256').update(buf).digest('hex');
  return { path: absPath, sha256: sha, bytes: buf.byteLength };
}

export async function hashArtifact(
  ctx: CheckContext,
  rel: string,
): Promise<ArtifactHash | null> {
  const abs = join(ctx.packPath, rel);
  if (!existsSync(abs)) {
    ctx.missingArtifacts.push(rel);
    return null;
  }
  try {
    const s = await stat(abs);
    if (!s.isFile()) {
      ctx.invalidArtifacts.push({ path: rel, error: 'not a regular file' });
      return null;
    }
    const h = await fileSha256(abs);
    return { ...h, path: rel };
  } catch (err) {
    ctx.invalidArtifacts.push({
      path: rel,
      error: err instanceof Error ? err.message : 'read error',
    });
    return null;
  }
}

export function pass(name: string, detail = ''): IntegrityCheck {
  return { name, passed: true, detail: detail || 'ok' };
}

export function fail(name: string, detail: string): IntegrityCheck {
  return { name, passed: false, detail };
}
