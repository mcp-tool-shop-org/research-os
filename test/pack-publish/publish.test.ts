import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTinyPack } from './helpers.js';
import { publish } from '../../src/pack/publish/index.js';

let outerTmp: string;

beforeEach(() => {
  outerTmp = mkdtempSync(join(tmpdir(), 'ros-test-publish-'));
});

afterEach(() => {
  rmSync(outerTmp, { recursive: true, force: true });
});

describe('pack publish — happy path', () => {
  it('publishes a tiny frozen pack and passes inline verify', async () => {
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });

    createTinyPack(packDir);

    const result = await publish({ fromDir: packDir, toDir: pkgDir });

    expect(result.verifyPassed).toBe(true);
    expect(result.packageName).toBe('test-package');
    expect(result.dryRun).toBe(false);
  });

  it('writes all 5 admission-contract files', async () => {
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });

    createTinyPack(packDir);
    await publish({ fromDir: packDir, toDir: pkgDir });

    expect(existsSync(join(pkgDir, 'pack/audits/freeze-receipt.json'))).toBe(true);
    expect(existsSync(join(pkgDir, 'synthesis/final-report.md'))).toBe(true);
    expect(existsSync(join(pkgDir, 'synthesis/decision-brief.md'))).toBe(true);
    expect(existsSync(join(pkgDir, 'pack.manifest.json'))).toBe(true);
    expect(existsSync(join(pkgDir, 'README.md'))).toBe(true);
  });

  it('provisions docs/how-to-read-this.md scaffold', async () => {
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });

    createTinyPack(packDir);
    await publish({ fromDir: packDir, toDir: pkgDir });

    expect(existsSync(join(pkgDir, 'docs/how-to-read-this.md'))).toBe(true);
    const content = readFileSync(join(pkgDir, 'docs/how-to-read-this.md'), 'utf8');
    expect(content).toContain('SCAFFOLD');
  });

  it('copies pack to pack/ subdirectory preserving freeze receipt', async () => {
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });

    createTinyPack(packDir);
    await publish({ fromDir: packDir, toDir: pkgDir });

    // The freeze receipt must be identical after copy
    const srcReceipt = readFileSync(join(packDir, 'audits/freeze-receipt.json'), 'utf8');
    const dstReceipt = readFileSync(join(pkgDir, 'pack/audits/freeze-receipt.json'), 'utf8');
    expect(dstReceipt).toBe(srcReceipt);
  });

  it('copies synthesis/ to package-root synthesis/', async () => {
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });

    createTinyPack(packDir);
    await publish({ fromDir: packDir, toDir: pkgDir });

    // Synthesis is accessible at package root (Lane 1)
    expect(existsSync(join(pkgDir, 'synthesis/final-report.md'))).toBe(true);
    expect(existsSync(join(pkgDir, 'synthesis/decision-brief.md'))).toBe(true);
  });

  it('pack.manifest.json is valid and freeze_receipt_sha256 matches actual receipt', async () => {
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });

    const { freezeReceiptSha256 } = createTinyPack(packDir);
    await publish({ fromDir: packDir, toDir: pkgDir });

    const manifest = JSON.parse(
      readFileSync(join(pkgDir, 'pack.manifest.json'), 'utf8'),
    ) as { freeze_receipt_sha256: string; name: string };

    expect(manifest.freeze_receipt_sha256).toBe(freezeReceiptSha256);
    expect(manifest.name).toBe('test-package');
  });

  it('README.md uses "Preserved contradiction records" phrasing', async () => {
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });

    createTinyPack(packDir);
    await publish({ fromDir: packDir, toDir: pkgDir });

    const readme = readFileSync(join(pkgDir, 'README.md'), 'utf8');
    // Fixture has 2 preserved contradiction records (1 resolved + 1 preserved)
    expect(readme).toContain('Preserved contradiction records: 2');
    expect(readme).not.toContain('Unresolved contradictions preserved');
  });
});

describe('pack publish — --dry-run', () => {
  it('returns dryRun=true and writes no files', async () => {
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });

    createTinyPack(packDir);
    const result = await publish({ fromDir: packDir, toDir: pkgDir, dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.filesWritten).toHaveLength(0);
    expect(existsSync(pkgDir)).toBe(false);
  });

  it('returns dryRunManifest with correct fields', async () => {
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });

    createTinyPack(packDir);
    const result = await publish({ fromDir: packDir, toDir: pkgDir, dryRun: true });

    expect(result.dryRunManifest?.name).toBe('test-package');
    expect(result.dryRunManifest?.totals.accepted_claims).toBe(3);
  });
});

describe('pack publish — --force', () => {
  it('overwrites an existing non-empty target with --force', async () => {
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });

    createTinyPack(packDir);
    // First publish
    await publish({ fromDir: packDir, toDir: pkgDir });
    // Second publish without --force should fail
    await expect(publish({ fromDir: packDir, toDir: pkgDir })).rejects.toThrow(/force/);
    // Third publish with --force should succeed
    const result = await publish({ fromDir: packDir, toDir: pkgDir, force: true });
    expect(result.verifyPassed).toBe(true);
  });
});

describe('pack publish — refusal cases', () => {
  it('refuses if freeze-receipt.json is missing from source pack', async () => {
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });

    createTinyPack(packDir);
    rmSync(join(packDir, 'audits/freeze-receipt.json'));

    await expect(publish({ fromDir: packDir, toDir: pkgDir })).rejects.toThrow(/freeze-receipt/);
  });

  it('refuses if synthesis/final-report.md is missing from source pack', async () => {
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });

    createTinyPack(packDir);
    rmSync(join(packDir, 'synthesis/final-report.md'));

    await expect(publish({ fromDir: packDir, toDir: pkgDir })).rejects.toThrow(/final-report/);
  });

  it('refuses if freeze-refusal artifacts exist in source pack', async () => {
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });

    createTinyPack(packDir);
    writeFileSync(join(packDir, 'audits/freeze-refusal.json'), '{}', 'utf8');

    await expect(publish({ fromDir: packDir, toDir: pkgDir })).rejects.toThrow(
      /freeze-refusal/,
    );
  });

  it('refuses if target is non-empty without --force', async () => {
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'existing.txt'), 'content', 'utf8');

    createTinyPack(packDir);

    await expect(publish({ fromDir: packDir, toDir: pkgDir })).rejects.toThrow(/force/);
  });

  it('D-001 part 1: --force clears the target so operator-authored how-to-read-this.md is REPLACED, not preserved', async () => {
    // Behavior change: D-001 part 1 now requires `--force` to clear the
    // target directory before re-writing. The previous "preserve operator
    // content across runs" guarantee is intentionally removed — `--force`
    // is now an unconditional clean. Operators that author content under
    // docs/how-to-read-this.md must commit it to the source pack repo,
    // not rely on the published artifact being a stable shell.
    const packDir = join(outerTmp, 'source');
    const pkgDir = join(outerTmp, 'packages/test-package');
    mkdirSync(packDir, { recursive: true });

    createTinyPack(packDir);

    // First publish
    await publish({ fromDir: packDir, toDir: pkgDir });

    // Write custom how-to-read content
    const howToPath = join(pkgDir, 'docs/how-to-read-this.md');
    const customContent = '# Custom operator-authored how-to-read\n';
    writeFileSync(howToPath, customContent, 'utf8');

    // Re-publish with --force — D-001 part 1 wipes pkgDir before re-write.
    const result = await publish({ fromDir: packDir, toDir: pkgDir, force: true });

    // Custom content is GONE — replaced by the freshly-generated scaffold.
    expect(readFileSync(howToPath, 'utf8')).not.toBe(customContent);
    expect(readFileSync(howToPath, 'utf8')).toContain('SCAFFOLD');
    // No "preserved" warning — there was nothing on disk at write time.
    expect(result.warnings.some((w) => w.includes('how-to-read-this.md'))).toBe(false);
  });
});
