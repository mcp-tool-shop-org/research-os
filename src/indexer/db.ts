import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';

import { applySchema, SCHEMA_VERSION } from './schema.js';

export interface OpenDbOptions {
  packPath: string;
  readonly?: boolean;
}

export function indexDbPath(packPath: string): string {
  return join(packPath, '.research-os', 'index.sqlite');
}

function ensureGitIgnore(packPath: string): void {
  const dir = join(packPath, '.research-os');
  const gi = join(dir, '.gitignore');
  if (!existsSync(gi)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(gi, '*\n', 'utf8');
  }
}

/**
 * B-IDX-002 — read-side schema-version enforcement (the automated form of the
 * B-A-003 "delete-and-rebuild on bump" v1.0 contract documented in schema.ts).
 *
 * `applySchema` only runs `CREATE TABLE IF NOT EXISTS` DDL, so a future
 * `SCHEMA_VERSION` bump that ADDS a column leaves an existing
 * `.research-os/index.sqlite` with the OLD column set untouched. The per-row
 * INSERTs in build.ts would then throw "no such column", get caught as a
 * `section_index_failed` warning, and `index build` would exit 0 with a hollow
 * (zeroed-count) index — silent data loss.
 *
 * Before applying schema to a writable DB, read `meta.schema_version` from any
 * pre-existing file. On a STALE/mismatched version, delete the DB file (and its
 * WAL/SHM sidecars) so `applySchema` rebuilds it from scratch against the
 * current DDL. A fresh/empty DB (no meta row yet) has nothing to migrate and is
 * left alone. This is additive: the happy path (matching version, or no prior
 * DB) is byte-identical.
 *
 * Returns the on-disk version found (or null for a fresh/unreadable DB).
 */
function reconcileSchemaVersion(dbPath: string): number | null {
  if (!existsSync(dbPath)) return null;
  let stored: number | null = null;
  try {
    const probe = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const row = probe
        .prepare(`SELECT value FROM meta WHERE key = 'schema_version'`)
        .get() as { value?: string } | undefined;
      if (row && typeof row.value === 'string') {
        const n = Number.parseInt(row.value, 10);
        if (Number.isFinite(n)) stored = n;
      }
    } catch {
      // No meta table (or unreadable) — treat as fresh/unknown; leave the file
      // for applySchema to (re)create the meta row.
      stored = null;
    } finally {
      probe.close();
    }
  } catch {
    // Could not even open the file readonly (corrupt / not a sqlite db). Leave
    // it; the writable open below surfaces any real corruption to the caller.
    return null;
  }
  if (stored !== null && stored !== SCHEMA_VERSION) {
    // Documented contract: delete-and-rebuild. Remove the DB and WAL/SHM
    // sidecars so the next writable open starts clean.
    for (const suffix of ['', '-wal', '-shm']) {
      const p = `${dbPath}${suffix}`;
      try {
        rmSync(p, { force: true });
      } catch {
        /* best-effort; writable open will surface a hard failure */
      }
    }
  }
  return stored;
}

export function openIndexDb(opts: OpenDbOptions): Database.Database {
  const dbPath = indexDbPath(opts.packPath);
  if (!opts.readonly) {
    mkdirSync(dirname(dbPath), { recursive: true });
    ensureGitIgnore(opts.packPath);
    reconcileSchemaVersion(dbPath);
  }
  const db = new Database(dbPath, { readonly: opts.readonly ?? false, fileMustExist: opts.readonly ?? false });
  if (!opts.readonly) applySchema(db);
  return db;
}
