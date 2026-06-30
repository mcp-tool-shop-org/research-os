// Stage A verifier follow-up — restoreArchivedRecoveryFiles must honor its
// post-rollback contract on the POST-WRITE failure window (A-RECOVER-001).
//
// The compensator previously short-circuited with `if (existsSync(canonical)) return;`,
// so when writeRecoveryArtifact had already overwritten the canonical files and
// the ledger append THEN threw, restore was skipped — leaving the partial NEW
// artifact at the canonical path and the OLD original orphaned in history/ with
// no ledger entry. On any post-archive failure the regeneration is incomplete
// (no ledger record), so the pre-regeneration original must win.
//
// Both halves:
//   - BAD : a partial NEW artifact at the canonical path is OVERWRITTEN by the
//           restored original (this was skipped before the fix).
//   - GOOD: the original pre-write failure case (canonical absent) still restores.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  archiveExistingRecoveryFiles,
  restoreArchivedRecoveryFiles,
} from '../../src/recover/regeneration-ledger.js';

let workDir: string;
let packPath: string;
const recoverDir = (): string => join(packPath, 'recovery');
const canonicalJson = (): string => join(recoverDir(), 'blocked-section-recovery.json');
const canonicalMd = (): string => join(recoverDir(), 'blocked-section-recovery.md');

const OLD_JSON = '{"v":"OLD-original"}\n';
const OLD_MD = '# OLD original\n';
const NEW_JSON = '{"v":"NEW-partial-regeneration"}\n';
const NEW_MD = '# NEW partial regeneration\n';

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-recover-compensator-'));
  packPath = workDir;
  await mkdir(recoverDir(), { recursive: true });
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('restoreArchivedRecoveryFiles — post-write window (A-RECOVER-001)', () => {
  it('BAD: a partial NEW artifact at the canonical path is overwritten by the restored original', async () => {
    await writeFile(canonicalJson(), OLD_JSON, 'utf8');
    await writeFile(canonicalMd(), OLD_MD, 'utf8');
    // Archive moves OLD into history/.
    const archive = await archiveExistingRecoveryFiles(
      packPath,
      'a'.repeat(64),
      new Date('2026-06-29T00:00:00.000Z'),
    );
    // writeRecoveryArtifact succeeded (partial NEW state), THEN the ledger append throws.
    await writeFile(canonicalJson(), NEW_JSON, 'utf8');
    await writeFile(canonicalMd(), NEW_MD, 'utf8');
    // Compensator runs in the catch.
    await restoreArchivedRecoveryFiles(packPath, archive);
    // The pre-regeneration ORIGINAL must be back at the canonical path.
    expect(await readFile(canonicalJson(), 'utf8')).toBe(OLD_JSON);
    expect(await readFile(canonicalMd(), 'utf8')).toBe(OLD_MD);
    // No orphaned archive remains in history.
    expect(existsSync(archive.archivedJsonPath!)).toBe(false);
    expect(existsSync(archive.archivedMarkdownPath!)).toBe(false);
  });

  it('GOOD: the pre-write failure case (canonical absent) still restores cleanly', async () => {
    await writeFile(canonicalJson(), OLD_JSON, 'utf8');
    await writeFile(canonicalMd(), OLD_MD, 'utf8');
    const archive = await archiveExistingRecoveryFiles(
      packPath,
      'b'.repeat(64),
      new Date('2026-06-29T00:00:01.000Z'),
    );
    // Throw happened BEFORE writeRecoveryArtifact → canonical is absent.
    expect(existsSync(canonicalJson())).toBe(false);
    await restoreArchivedRecoveryFiles(packPath, archive);
    expect(await readFile(canonicalJson(), 'utf8')).toBe(OLD_JSON);
    expect(await readFile(canonicalMd(), 'utf8')).toBe(OLD_MD);
  });
});
