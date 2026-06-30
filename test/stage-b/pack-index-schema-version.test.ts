import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

import { openIndexDb, indexDbPath } from '../../src/indexer/db.js';
import { SCHEMA_VERSION } from '../../src/indexer/schema.js';

let packPath: string;

beforeEach(async () => {
  packPath = await mkdtemp(join(tmpdir(), 'research-os-pack-schema-ver-'));
});

afterEach(async () => {
  await rm(packPath, { recursive: true, force: true });
});

describe('B-IDX-002 — schema-version read-side enforcement in openIndexDb', () => {
  // RED-half target: a stale on-disk DB (older SCHEMA_VERSION) used to survive
  // openIndexDb untouched because applySchema only runs CREATE TABLE IF NOT
  // EXISTS — so a future column-adding bump left the old column set in place,
  // per-row INSERTs threw, and index build silently produced a hollow index.
  // openIndexDb must now delete-and-rebuild a version-mismatched DB.
  it('deletes and rebuilds an existing DB whose stored schema_version is stale', () => {
    // First open creates the DB at the current SCHEMA_VERSION.
    const db1 = openIndexDb({ packPath });
    // Plant a marker row + force the stored version to a STALE value, as a
    // future bump would leave behind.
    db1.prepare(`INSERT OR REPLACE INTO meta(key, value) VALUES ('marker', 'present')`).run();
    db1.prepare(`INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', ?)`).run(
      String(SCHEMA_VERSION - 1),
    );
    db1.close();

    // Re-open: the stale version must trigger delete-and-rebuild.
    const db2 = openIndexDb({ packPath });
    const version = (
      db2.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
        | { value?: string }
        | undefined
    )?.value;
    const marker = db2.prepare(`SELECT value FROM meta WHERE key = 'marker'`).get() as
      | { value?: string }
      | undefined;
    db2.close();

    // Version reconciled to current; the rebuilt DB no longer holds the marker.
    expect(version).toBe(String(SCHEMA_VERSION));
    expect(marker).toBeUndefined();
  });

  // HAPPY-half: an existing DB at the CURRENT version is left untouched — no
  // spurious delete-and-rebuild. Default behavior is byte-identical.
  it('preserves an existing DB whose stored schema_version matches', () => {
    const db1 = openIndexDb({ packPath });
    db1.prepare(`INSERT OR REPLACE INTO meta(key, value) VALUES ('marker', 'present')`).run();
    db1.close();

    const db2 = openIndexDb({ packPath });
    const marker = db2.prepare(`SELECT value FROM meta WHERE key = 'marker'`).get() as
      | { value?: string }
      | undefined;
    const version = (
      db2.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
        | { value?: string }
        | undefined
    )?.value;
    db2.close();

    // Same-version DB keeps its data; nothing was rebuilt.
    expect(marker?.value).toBe('present');
    expect(version).toBe(String(SCHEMA_VERSION));
  });

  // HAPPY-half: a fresh pack (no prior DB) opens and creates the DB normally.
  it('creates a fresh DB at the current version when none exists', () => {
    expect(indexDbPath(packPath)).toContain('.research-os');
    const db = openIndexDb({ packPath });
    const version = (
      db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
        | { value?: string }
        | undefined
    )?.value;
    db.close();
    expect(version).toBe(String(SCHEMA_VERSION));
  });
});
