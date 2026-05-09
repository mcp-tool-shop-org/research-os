import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyPack } from '../../src/pack/publish/verify.js';
import { createTinyPack } from './helpers.js';
import { generateReadme } from '../../src/pack/publish/readme.js';
import { deriveManifest } from '../../src/pack/publish/manifest.js';
import { copyDir } from '../../src/pack/publish/copy.js';
import type { PackManifest } from '../../src/pack/publish/schema.js';

/** Build a minimal valid package directory from a tiny frozen pack */
function buildPackage(
  baseDir: string,
  packDir: string,
  manifest: PackManifest,
  finalReport = '## Summary\n\nTest summary.\n',
): void {
  // pack/ ← copy of frozen pack
  copyDir(packDir, join(baseDir, 'pack'));

  // synthesis/
  const synthDir = join(baseDir, 'synthesis');
  mkdirSync(synthDir, { recursive: true });
  writeFileSync(join(synthDir, 'final-report.md'), finalReport, 'utf8');
  writeFileSync(join(synthDir, 'decision-brief.md'), '# Decision brief\n', 'utf8');

  // pack.manifest.json
  writeFileSync(join(baseDir, 'pack.manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // README.md
  writeFileSync(join(baseDir, 'README.md'), generateReadme(manifest, finalReport), 'utf8');
}

let outerTmp: string;

beforeEach(() => {
  outerTmp = mkdtempSync(join(tmpdir(), 'ros-test-verify-'));
});

afterEach(() => {
  rmSync(outerTmp, { recursive: true, force: true });
});

describe('verifyPack', () => {
  it('returns PASS for a valid published package', () => {
    const packDir = join(outerTmp, 'source-pack');
    const pkgDir = join(outerTmp, 'package');
    mkdirSync(packDir, { recursive: true });
    mkdirSync(pkgDir, { recursive: true });

    createTinyPack(packDir);

    const manifest: PackManifest = deriveManifest(packDir, 'test-package');
    buildPackage(pkgDir, packDir, manifest);

    const result = verifyPack(pkgDir);
    expect(result.pass).toBe(true);
    expect(result.artifactsVerified).toBeGreaterThan(0);
  });

  it('fails when pack/audits/freeze-receipt.json is missing', () => {
    const packDir = join(outerTmp, 'source-pack');
    const pkgDir = join(outerTmp, 'package');
    mkdirSync(packDir, { recursive: true });
    mkdirSync(pkgDir, { recursive: true });

    createTinyPack(packDir);
    const manifest: PackManifest = deriveManifest(packDir, 'test-package');
    buildPackage(pkgDir, packDir, manifest);

    // Remove the receipt from the package
    rmSync(join(pkgDir, 'pack/audits/freeze-receipt.json'));

    const result = verifyPack(pkgDir);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/freeze-receipt/);
  });

  it('fails when synthesis/final-report.md is missing', () => {
    const packDir = join(outerTmp, 'source-pack');
    const pkgDir = join(outerTmp, 'package');
    mkdirSync(packDir, { recursive: true });
    mkdirSync(pkgDir, { recursive: true });

    createTinyPack(packDir);
    const manifest: PackManifest = deriveManifest(packDir, 'test-package');
    buildPackage(pkgDir, packDir, manifest);
    rmSync(join(pkgDir, 'synthesis/final-report.md'));

    const result = verifyPack(pkgDir);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/final-report/);
  });

  it('fails when pack.manifest.json is missing', () => {
    const packDir = join(outerTmp, 'source-pack');
    const pkgDir = join(outerTmp, 'package');
    mkdirSync(packDir, { recursive: true });
    mkdirSync(pkgDir, { recursive: true });

    createTinyPack(packDir);
    const manifest: PackManifest = deriveManifest(packDir, 'test-package');
    buildPackage(pkgDir, packDir, manifest);
    rmSync(join(pkgDir, 'pack.manifest.json'));

    const result = verifyPack(pkgDir);
    expect(result.pass).toBe(false);
  });

  it('fails when freeze_receipt_sha256 in manifest does not match actual file', () => {
    const packDir = join(outerTmp, 'source-pack');
    const pkgDir = join(outerTmp, 'package');
    mkdirSync(packDir, { recursive: true });
    mkdirSync(pkgDir, { recursive: true });

    createTinyPack(packDir);
    const manifest: PackManifest = deriveManifest(packDir, 'test-package');
    buildPackage(pkgDir, packDir, manifest);

    // Tamper with the receipt after writing manifest (hash now wrong)
    writeFileSync(
      join(pkgDir, 'pack/audits/freeze-receipt.json'),
      '{"tampered": true}\n',
      'utf8',
    );

    const result = verifyPack(pkgDir);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/hash mismatch/i);
  });

  it('fails when a fingerprinted artifact has been modified', () => {
    const packDir = join(outerTmp, 'source-pack');
    const pkgDir = join(outerTmp, 'package');
    mkdirSync(packDir, { recursive: true });
    mkdirSync(pkgDir, { recursive: true });

    createTinyPack(packDir);
    const manifest: PackManifest = deriveManifest(packDir, 'test-package');
    buildPackage(pkgDir, packDir, manifest);

    // Tamper with a fingerprinted artifact (claim-reviews.jsonl)
    writeFileSync(
      join(pkgDir, 'pack/sections/01-test/claim-reviews.jsonl'),
      '{"tampered": true}\n',
      'utf8',
    );

    const result = verifyPack(pkgDir);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/Hash mismatch/);
  });
});
