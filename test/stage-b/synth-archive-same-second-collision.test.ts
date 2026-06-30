/**
 * Stage B — B-RECOVER-003 (future-proofing): archive filename collision.
 *
 * safeTimestamp() drops the ms component, giving the archive filename
 * 1-SECOND resolution. Two same-second regenerations with the same 8-char
 * hash prefix produce an identical archive base; the second rename used to
 * silently OVERWRITE the first archived file — losing a history record and
 * breaking the 1:1 archive↔ledger pairing. (The old comment's claim that
 * "the random regeneration_id protects this" is false: that id disambiguates
 * the LEDGER record, not the archive PATH.)
 *
 * Fix: archiveExistingRecoveryFiles suffix-increments the base when the
 * target path is already taken rather than renaming over it.
 *
 * Both halves proven:
 *   RED   — without the suffix-increment guard, the second archive reuses the
 *           base and overwrites the first, so only ONE history pair survives.
 *   GREEN — two distinct history pairs survive; the first's content is intact.
 *   Happy path — a single archive at a fresh second still uses the plain base.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  archiveExistingRecoveryFiles,
  listRecoveryHistory,
} from '../../src/recover/regeneration-ledger.js';

let packPath: string;

beforeEach(async () => {
  packPath = await mkdtemp(join(tmpdir(), 'ros-synth-archive-collision-'));
  await mkdir(join(packPath, 'recovery'), { recursive: true });
});

afterEach(async () => {
  await rm(packPath, { recursive: true, force: true });
});

async function writeCanonical(jsonBody: string, mdBody: string): Promise<void> {
  await writeFile(join(packPath, 'recovery', 'blocked-section-recovery.json'), jsonBody, 'utf8');
  await writeFile(join(packPath, 'recovery', 'blocked-section-recovery.md'), mdBody, 'utf8');
}

describe('B-RECOVER-003 — same-second + same-hash-prefix archive collision', () => {
  // Same wall-clock SECOND (different ms, which safeTimestamp drops) and the
  // SAME previous-hash prefix → identical archive base under the old code.
  const NOW_A = new Date('2026-06-29T12:00:00.111Z');
  const NOW_B = new Date('2026-06-29T12:00:00.999Z');
  const SAME_HASH = 'deadbeefcafef00d0011223344556677';

  it('keeps both archives 1:1 — the second does not overwrite the first', async () => {
    // First regeneration archives the original canonical pair.
    await writeCanonical('{"gen":"first"}', '# first');
    const archive1 = await archiveExistingRecoveryFiles(packPath, SAME_HASH, NOW_A);
    expect(archive1.archivedJsonPath).not.toBeNull();
    expect(archive1.archivedMarkdownPath).not.toBeNull();

    // A fresh canonical pair is laid down, then a SECOND regeneration in the
    // same wall-clock second with the same hash prefix archives it too.
    await writeCanonical('{"gen":"second"}', '# second');
    const archive2 = await archiveExistingRecoveryFiles(packPath, SAME_HASH, NOW_B);
    expect(archive2.archivedJsonPath).not.toBeNull();
    expect(archive2.archivedMarkdownPath).not.toBeNull();

    // The two archives must land at DISTINCT paths.
    expect(archive2.archivedJsonPath).not.toBe(archive1.archivedJsonPath);
    expect(archive2.archivedMarkdownPath).not.toBe(archive1.archivedMarkdownPath);

    // Both .json + both .md survive on disk → 4 history files (2 pairs).
    const history = await listRecoveryHistory(packPath);
    const jsons = history.filter((f) => f.endsWith('.json'));
    const mds = history.filter((f) => f.endsWith('.md'));
    expect(jsons).toHaveLength(2);
    expect(mds).toHaveLength(2);

    // The FIRST archive's content is intact (not clobbered by the second).
    expect(await readFile(archive1.archivedJsonPath!, 'utf8')).toBe('{"gen":"first"}');
    expect(await readFile(archive2.archivedJsonPath!, 'utf8')).toBe('{"gen":"second"}');
  });

  it('happy path: a single archive at a fresh second uses the plain (un-suffixed) base', async () => {
    await writeCanonical('{"gen":"only"}', '# only');
    const archive = await archiveExistingRecoveryFiles(packPath, SAME_HASH, NOW_A);
    expect(archive.archivedJsonPath).not.toBeNull();
    // Plain base — no "-1"/"-2" disambiguation suffix on the timestamp+prefix.
    expect(archive.archivedJsonPath!).toMatch(
      /blocked-section-recovery-2026-06-29T12-00-00Z-deadbeef\.json$/,
    );
    expect(existsSync(archive.archivedJsonPath!)).toBe(true);
  });
});
