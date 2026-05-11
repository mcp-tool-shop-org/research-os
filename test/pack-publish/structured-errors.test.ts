/**
 * Stage C Phase 3 — C1-004 / C1-005 / C1-006 / C1-007 / C1-008 / C1-009
 * regression tests.
 *
 * Every site that previously threw `new Error(...)` now throws a
 * `ResearchOSError` with a code from the locked taxonomy (per Stage C
 * doctrine). These tests assert:
 *
 *   1. The throw site emits a `ResearchOSError` (NOT a plain Error).
 *   2. The error.code matches the documented mapping.
 *   3. The hint mentions the documented handbook page where applicable.
 *
 * "Old-API-dead assertion" doctrine: also grep-asserts that none of the
 * known-converted lines retain a raw `throw new Error(...)` call.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, unlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { publish } from '../../src/pack/publish/index.js';
import { deriveManifest } from '../../src/pack/publish/manifest.js';
import { ResearchOSError } from '../../src/errors.js';
import { createTinyPack } from './helpers.js';

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-c1-pack-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('Stage C Phase 3 — pack publish structured errors', () => {
  // ─────────────────────────────────────────────────────────────────────
  // C1-004: source pack missing required file
  // ─────────────────────────────────────────────────────────────────────
  it('C1-004: publish throws ResearchOSError(PACK_NOT_FOUND) when a required file is missing', async () => {
    const fromDir = join(workDir, 'pack');
    createTinyPack(fromDir);
    // Remove a required file.
    await unlink(join(fromDir, 'synthesis/final-report.md'));

    await expect(
      publish({
        fromDir,
        toDir: join(workDir, 'out'),
        operatorNotes: '',
        force: false,
        dryRun: false,
      }),
    ).rejects.toMatchObject({
      name: 'ResearchOSError',
      code: 'PACK_NOT_FOUND',
    });

    try {
      await publish({
        fromDir,
        toDir: join(workDir, 'out2'),
        operatorNotes: '',
        force: false,
        dryRun: false,
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchOSError);
      const e = err as ResearchOSError;
      expect(e.code).toBe('PACK_NOT_FOUND');
      expect(e.message).toContain('final-report.md');
      expect(e.hint).toContain('handbook/pack-publish.md');
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // C1-005: freeze-refusal artifacts present
  // ─────────────────────────────────────────────────────────────────────
  it('C1-005: publish throws ResearchOSError(SYNTHESIS_NOT_READY) when freeze-refusal artifacts exist', async () => {
    const fromDir = join(workDir, 'pack');
    createTinyPack(fromDir);
    await writeFile(
      join(fromDir, 'audits/freeze-refusal.json'),
      JSON.stringify({ verdict: 'refused', blocking_reasons: ['test'] }),
      'utf8',
    );

    try {
      await publish({
        fromDir,
        toDir: join(workDir, 'out'),
        operatorNotes: '',
        force: false,
        dryRun: false,
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchOSError);
      const e = err as ResearchOSError;
      expect(e.code).toBe('SYNTHESIS_NOT_READY');
      expect(e.message).toContain('freeze-refusal');
      expect(e.hint).toContain('handbook/pack-publish.md');
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // C1-006: target directory non-empty without --force (canonical sentence)
  // ─────────────────────────────────────────────────────────────────────
  it('C1-006: publish throws PACK_EXISTS with canonical --force sentence in hint', async () => {
    const fromDir = join(workDir, 'pack');
    createTinyPack(fromDir);
    const toDir = join(workDir, 'out');
    // Pre-populate target to trigger the --force refusal.
    await writeFile(join(workDir, 'sentinel.txt'), 'x', 'utf8');
    // Put a file inside toDir so it's non-empty.
    const { mkdir } = await import('node:fs/promises');
    await mkdir(toDir, { recursive: true });
    await writeFile(join(toDir, 'preexisting.txt'), 'x', 'utf8');

    try {
      await publish({
        fromDir,
        toDir,
        operatorNotes: '',
        force: false,
        dryRun: false,
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchOSError);
      const e = err as ResearchOSError;
      expect(e.code).toBe('PACK_EXISTS');
      // Canonical sentence substring.
      expect(e.hint).toContain('clears and replaces the target package directory');
      expect(e.hint).toContain(
        'Do not keep hand-authored files inside generated package output',
      );
      expect(e.hint).toContain('handbook/pack-publish.md');
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // C1-008: manifest derivation — pack not frozen
  // ─────────────────────────────────────────────────────────────────────
  it('C1-008: deriveManifest throws SYNTHESIS_NOT_READY when research.yaml.frozen_at is null', async () => {
    const fromDir = join(workDir, 'pack');
    createTinyPack(fromDir);
    // Rewrite research.yaml to unset frozen_at.
    const yamlPath = join(fromDir, 'research.yaml');
    const yamlText = await readFile(yamlPath, 'utf8');
    const cleared = yamlText.replace(/frozen_at:\s*"[^"]*"/, 'frozen_at: null');
    await writeFile(yamlPath, cleared, 'utf8');

    try {
      deriveManifest(fromDir, 'testpack', '');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchOSError);
      const e = err as ResearchOSError;
      expect(e.code).toBe('SYNTHESIS_NOT_READY');
      expect(e.message).toContain('not frozen');
      expect(e.hint).toContain('research-os freeze');
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // C1-008: missing freeze-receipt.json
  // ─────────────────────────────────────────────────────────────────────
  it('C1-008: deriveManifest throws SYNTHESIS_NOT_READY when freeze-receipt.json is absent', async () => {
    const fromDir = join(workDir, 'pack');
    createTinyPack(fromDir);
    await unlink(join(fromDir, 'audits/freeze-receipt.json'));

    try {
      deriveManifest(fromDir, 'testpack', '');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchOSError);
      const e = err as ResearchOSError;
      // Either SYNTHESIS_NOT_READY (preferred) or PACK_NOT_FOUND.
      expect(['SYNTHESIS_NOT_READY', 'PACK_NOT_FOUND']).toContain(e.code);
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // C1-008: missing pack-audit.json
  // ─────────────────────────────────────────────────────────────────────
  it('C1-008: deriveManifest throws PACK_NOT_FOUND when pack-audit.json is absent', async () => {
    const fromDir = join(workDir, 'pack');
    createTinyPack(fromDir);
    await unlink(join(fromDir, 'audits/pack-audit.json'));

    try {
      deriveManifest(fromDir, 'testpack', '');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchOSError);
      const e = err as ResearchOSError;
      expect(e.code).toBe('PACK_NOT_FOUND');
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // C1-008: missing gate result for a section
  // ─────────────────────────────────────────────────────────────────────
  it('C1-008: deriveManifest throws PACK_NOT_FOUND when audits/<section>-gate.json is absent', async () => {
    const fromDir = join(workDir, 'pack');
    createTinyPack(fromDir);
    await unlink(join(fromDir, 'audits/01-test-gate.json'));

    try {
      deriveManifest(fromDir, 'testpack', '');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchOSError);
      const e = err as ResearchOSError;
      expect(e.code).toBe('PACK_NOT_FOUND');
      expect(e.message).toContain('01-test-gate.json');
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // Old-API-dead assertion: no raw `throw new Error(` in the converted file
  // sections. We grep against the source on disk.
  // ─────────────────────────────────────────────────────────────────────
  it('publish/index.ts and publish/manifest.ts no longer contain raw `throw new Error(`', async () => {
    const idxPath = join(__dirname, '..', '..', 'src', 'pack', 'publish', 'index.ts');
    const manifestPath = join(__dirname, '..', '..', 'src', 'pack', 'publish', 'manifest.ts');
    const idxSrc = await readFile(idxPath, 'utf8');
    const manifestSrc = await readFile(manifestPath, 'utf8');
    expect(idxSrc).not.toMatch(/\bthrow\s+new\s+Error\(/);
    expect(manifestSrc).not.toMatch(/\bthrow\s+new\s+Error\(/);
  });
});
