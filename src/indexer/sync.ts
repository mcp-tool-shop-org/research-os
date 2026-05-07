import { resolve } from 'node:path';

import { exportRepoKnowledge } from './export.js';
import type { SyncOptions, SyncSummary } from './types.js';

interface RepoKnowledgeShape {
  ingestFacts?: (args: {
    facts: unknown[];
    namespace?: string;
  }) => Promise<{ count: number }> | { count: number };
}

async function loadRepoKnowledge(): Promise<RepoKnowledgeShape | null> {
  // Optional peer dependency; resolved dynamically at runtime so the package
  // does not need to be installed for the rest of research-os to work.
  const pkgName = '@mcptoolshop/repo-knowledge';
  try {
    const mod = (await import(/* @vite-ignore */ pkgName).catch(() => null)) as
      | RepoKnowledgeShape
      | null;
    return mod;
  } catch {
    return null;
  }
}

export async function syncRepoKnowledge(options: SyncOptions): Promise<SyncSummary> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  const rk = await loadRepoKnowledge();
  if (!rk || typeof rk.ingestFacts !== 'function') {
    return {
      attempted: false,
      ok: false,
      reason:
        '@mcptoolshop/repo-knowledge not available locally. Sync skipped — pack remains self-contained. Use `research-os index export-repo-knowledge` for a portable export instead.',
      factsSynced: 0,
    };
  }

  const exportResult = await exportRepoKnowledge({ packPath });
  // Re-read the JSONL we just wrote so repo-knowledge ingests the same canonical fact stream
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(exportResult.outPath, 'utf8');
  const facts = text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));

  try {
    const r = await rk.ingestFacts({ facts, namespace: 'research-os' });
    return {
      attempted: true,
      ok: true,
      reason: 'ingested via @mcptoolshop/repo-knowledge.ingestFacts',
      factsSynced: r.count ?? facts.length,
    };
  } catch (err) {
    return {
      attempted: true,
      ok: false,
      reason: err instanceof Error ? err.message : 'unknown ingest error',
      factsSynced: 0,
    };
  }
}
