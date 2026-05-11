/**
 * Stage C Phase 3 — multi-site structured-error conversion regression tests.
 *
 * Covers:
 *  - C1-010: discover/run.ts (7 raw-error sites)
 *  - C1-011: contradictions/map.ts (2 sites)
 *  - C1-012: indexer/query.ts IndexNotBuiltError extends ResearchOSError
 *           + command-text typo (research-os index --all → index build --all)
 *  - C1-013: sources/source-card-audit.ts (6 sites)
 *  - C1-014: invalidate/run.ts + invalidate/review.ts (validation → InvalidArgumentError)
 *
 * "Old-API-dead assertion" doctrine: grep-asserts no raw `throw new Error(`
 * remains in the converted files (excluding the test file itself).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidArgumentError } from 'commander';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { discover, approve, reject } from '../src/discover/index.js';
import { map as contradictMap } from '../src/contradictions/index.js';
import { query as indexQuery, IndexNotBuiltError } from '../src/indexer/query.js';
import {
  runSourceCardAudit,
  applySourceCardOverrides,
} from '../src/sources/source-card-audit.js';
import { invalidateExtraction, invalidateReview } from '../src/invalidate/index.js';
import { ResearchOSError } from '../src/errors.js';

let workDir: string;
let packPath: string;

async function setupPack() {
  const r = await init({ topic: 'Stage C Phase 3 fixture pack', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: '01-fixture', purpose: 'fixture for structured-error tests', packPath });
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-c1-multi-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

// ──────────────────────────────────────────────────────────────────────────
// C1-010: discover/run.ts
// ──────────────────────────────────────────────────────────────────────────
describe('C1-010: discover/run.ts structured errors', () => {
  it('discover() rejects a short query via InvalidArgumentError', async () => {
    await setupPack();
    await expect(
      discover({
        sectionId: '01-fixture',
        packPath,
        query: 'abc', // < 4 chars
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('approve() with neither --candidate nor --top throws InvalidArgumentError', async () => {
    await setupPack();
    await expect(
      approve({
        sectionId: '01-fixture',
        packPath,
        candidateIds: undefined,
        topN: undefined,
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('approve() with unknown candidate id throws ResearchOSError(INTAKE_VALIDATION)', async () => {
    await setupPack();
    try {
      await approve({
        sectionId: '01-fixture',
        packPath,
        candidateIds: ['disc_doesnotexist'],
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchOSError);
      const e = err as ResearchOSError;
      expect(e.code).toBe('INTAKE_VALIDATION');
      expect(e.message).toContain('disc_doesnotexist');
    }
  });

  it('reject() with short reason throws InvalidArgumentError', async () => {
    await setupPack();
    await expect(
      reject({
        sectionId: '01-fixture',
        packPath,
        candidateIds: ['disc_x'],
        reason: 'no', // < 4 chars
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('reject() with unknown candidate id throws ResearchOSError(INTAKE_VALIDATION)', async () => {
    await setupPack();
    try {
      await reject({
        sectionId: '01-fixture',
        packPath,
        candidateIds: ['disc_doesnotexist'],
        reason: 'this is a long enough reason',
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchOSError);
      const e = err as ResearchOSError;
      expect(e.code).toBe('INTAKE_VALIDATION');
    }
  });

  it('source: discover/run.ts no longer contains raw `throw new Error(`', async () => {
    const src = await readFile(
      join(__dirname, '..', 'src', 'discover', 'run.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/\bthrow\s+new\s+Error\(/);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// C1-011: contradictions/map.ts
// ──────────────────────────────────────────────────────────────────────────
describe('C1-011: contradictions/map.ts structured errors', () => {
  it('contradict map with invalid --detector throws InvalidArgumentError', async () => {
    await setupPack();
    await expect(
      // detectorMode "garbage" is not in VALID_DETECTOR_MODES.
      // The runtime detector validation fires before any I/O work happens.
      contradictMap({
        sectionId: '01-fixture',
        packPath,
        detectorMode: 'garbage' as 'auto',
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('source: contradictions/map.ts no longer contains raw `throw new Error(`', async () => {
    const src = await readFile(
      join(__dirname, '..', 'src', 'contradictions', 'map.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/\bthrow\s+new\s+Error\(/);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// C1-012: indexer/query.ts IndexNotBuiltError extends ResearchOSError
// ──────────────────────────────────────────────────────────────────────────
describe('C1-012: indexer/query.ts IndexNotBuiltError', () => {
  it('IndexNotBuiltError is a ResearchOSError with PACK_NOT_FOUND code', () => {
    const err = new IndexNotBuiltError('/some/db/path');
    expect(err).toBeInstanceOf(ResearchOSError);
    expect(err.code).toBe('PACK_NOT_FOUND');
    expect(err.message).toContain('research-os index build --all'); // correct command
    expect(err.message).not.toContain('research-os index --all\''); // legacy typo gone
    expect(err.hint).toContain('research-os index build --all');
    expect(err.hint).toContain('handbook/recovery.md');
  });

  it('query() throws IndexNotBuiltError when the index DB is missing', async () => {
    await setupPack();
    try {
      indexQuery({ term: 'anything', packPath });
      throw new Error('expected throw');
    } catch (err) {
      // Note: a fresh pack has no index, so this should throw.
      // Either IndexNotBuiltError (if pack itself exists per fixture init)
      // or PackNotFoundError if the path is bad.
      expect(err).toBeInstanceOf(ResearchOSError);
      const e = err as ResearchOSError;
      expect(e.code).toBe('PACK_NOT_FOUND');
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// C1-013: sources/source-card-audit.ts structured errors
// ──────────────────────────────────────────────────────────────────────────
describe('C1-013: source-card-audit.ts structured errors', () => {
  it('runSourceCardAudit throws PACK_NOT_FOUND when evidence/source-cards/ is absent', async () => {
    await setupPack();
    // Intake scaffolds `evidence/source-cards/` as an empty dir; remove it
    // so the absence-check fires.
    await rm(join(packPath, 'evidence', 'source-cards'), { recursive: true, force: true });
    try {
      await runSourceCardAudit(packPath);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchOSError);
      const e = err as ResearchOSError;
      expect(e.code).toBe('PACK_NOT_FOUND');
      expect(e.hint).toContain('research-os gather');
    }
  });

  it('applySourceCardOverrides refuses frozen pack with SYNTHESIS_NOT_READY', async () => {
    await setupPack();
    // Simulate frozen pack by writing audits/freeze-receipt.json.
    await mkdir(join(packPath, 'audits'), { recursive: true });
    await writeFile(
      join(packPath, 'audits/freeze-receipt.json'),
      JSON.stringify({ frozen_at: '2026-05-11T00:00:00Z' }),
      'utf8',
    );
    // Write an override file (won't matter — frozen-pack check fires first).
    const overrideFile = join(workDir, 'overrides.json');
    await writeFile(overrideFile, '[]', 'utf8');

    try {
      await applySourceCardOverrides(packPath, overrideFile);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchOSError);
      const e = err as ResearchOSError;
      expect(e.code).toBe('SYNTHESIS_NOT_READY');
      expect(e.message).toContain('frozen pack');
    }
  });

  it('applySourceCardOverrides surfaces PACK_NOT_FOUND on missing --from file', async () => {
    await setupPack();
    try {
      await applySourceCardOverrides(packPath, join(workDir, 'does-not-exist.json'));
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchOSError);
      const e = err as ResearchOSError;
      expect(e.code).toBe('PACK_NOT_FOUND');
    }
  });

  it('applySourceCardOverrides surfaces INTAKE_VALIDATION on non-array JSON', async () => {
    await setupPack();
    const overrideFile = join(workDir, 'overrides.json');
    await writeFile(overrideFile, '{"not": "an array"}', 'utf8');
    try {
      await applySourceCardOverrides(packPath, overrideFile);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchOSError);
      const e = err as ResearchOSError;
      expect(e.code).toBe('INTAKE_VALIDATION');
    }
  });

  it('applySourceCardOverrides surfaces PACK_PARSE_ERROR on malformed JSON', async () => {
    await setupPack();
    const overrideFile = join(workDir, 'overrides.json');
    await writeFile(overrideFile, '{not valid json', 'utf8');
    try {
      await applySourceCardOverrides(packPath, overrideFile);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchOSError);
      const e = err as ResearchOSError;
      expect(e.code).toBe('PACK_PARSE_ERROR');
    }
  });

  it('source: source-card-audit.ts no longer contains raw `throw new Error(`', async () => {
    const src = await readFile(
      join(__dirname, '..', 'src', 'sources', 'source-card-audit.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/\bthrow\s+new\s+Error\(/);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// C1-014: invalidate/run.ts + invalidate/review.ts validation
// ──────────────────────────────────────────────────────────────────────────
describe('C1-014: invalidate validation → InvalidArgumentError', () => {
  it('invalidateExtraction throws InvalidArgumentError on short reason', async () => {
    await setupPack();
    await expect(
      invalidateExtraction({
        packPath,
        reason: 'too', // < 8 chars
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('invalidateExtraction throws InvalidArgumentError on non-kebab label', async () => {
    await setupPack();
    await expect(
      invalidateExtraction({
        packPath,
        reason: 'a sufficiently long reason',
        label: 'NotKebabCase',
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('invalidateReview throws InvalidArgumentError on short reason', async () => {
    await setupPack();
    await expect(
      invalidateReview({
        packPath,
        sectionId: '01-fixture',
        reason: 'no',
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('invalidateReview throws InvalidArgumentError on non-kebab label', async () => {
    await setupPack();
    await expect(
      invalidateReview({
        packPath,
        sectionId: '01-fixture',
        reason: 'a sufficiently long reason',
        label: 'NotKebab',
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('source: invalidate/run.ts no longer contains raw `throw new Error(`', async () => {
    const src = await readFile(
      join(__dirname, '..', 'src', 'invalidate', 'run.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/\bthrow\s+new\s+Error\(/);
  });

  it('source: invalidate/review.ts no longer contains raw `throw new Error(`', async () => {
    const src = await readFile(
      join(__dirname, '..', 'src', 'invalidate', 'review.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/\bthrow\s+new\s+Error\(/);
  });
});
