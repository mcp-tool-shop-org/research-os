import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';

import { applySchema } from './schema.js';

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

export function openIndexDb(opts: OpenDbOptions): Database.Database {
  const dbPath = indexDbPath(opts.packPath);
  if (!opts.readonly) {
    mkdirSync(dirname(dbPath), { recursive: true });
    ensureGitIgnore(opts.packPath);
  }
  const db = new Database(dbPath, { readonly: opts.readonly ?? false, fileMustExist: opts.readonly ?? false });
  if (!opts.readonly) applySchema(db);
  return db;
}
