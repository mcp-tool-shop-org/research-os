import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { deriveManifest } from './manifest.js';
import { generateReadme } from './readme.js';
import { generateHowToReadScaffold } from './how-to-read.js';
import { copyDir } from './copy.js';
import { verifyPack } from './verify.js';
import type { PublishInput, PublishResult } from './types.js';

// Source pack files that must exist before publish begins.
const REQUIRED_SOURCE_FILES = [
  'research.yaml',
  'audits/freeze-receipt.json',
  'audits/pack-audit.json',
  'synthesis/final-report.md',
  'synthesis/decision-brief.md',
];

export async function publish(input: PublishInput): Promise<PublishResult> {
  const fromDir = resolve(input.fromDir);
  const toDir = resolve(input.toDir);
  const packageName = basename(toDir);
  const warnings: string[] = [];

  // 1. Validate source pack has required files
  for (const rel of REQUIRED_SOURCE_FILES) {
    if (!existsSync(join(fromDir, rel))) {
      throw new Error(
        `Source pack missing required file: ${rel}\n  Hint: run research-os freeze before publish\n  Pack: ${fromDir}`,
      );
    }
  }

  // 2. Refuse if freeze-refusal artifacts exist (pack did not freeze cleanly)
  if (
    existsSync(join(fromDir, 'audits/freeze-refusal.json')) ||
    existsSync(join(fromDir, 'audits/freeze-refusal.md'))
  ) {
    throw new Error(
      `Source pack has freeze-refusal artifacts — pack did not freeze cleanly.\n  Resolve blocking reasons then re-run research-os freeze.\n  Pack: ${fromDir}`,
    );
  }

  // 3. Check target: refuse if non-empty without --force
  if (existsSync(toDir)) {
    const entries = readdirSync(toDir);
    if (entries.length > 0 && !input.force) {
      throw new Error(
        `Target directory already exists and is non-empty: ${toDir}\n  Use --force to overwrite.`,
      );
    }
  }

  // 4. Derive manifest early — fail fast on bad pack state before writing anything
  const manifest = deriveManifest(fromDir, packageName, input.operatorNotes ?? '');

  // 5. Dry-run: print plan without writing
  if (input.dryRun) {
    const finalReportPath = join(fromDir, 'synthesis/final-report.md');
    const finalReport = existsSync(finalReportPath)
      ? readFileSync(finalReportPath, 'utf8')
      : '';
    const readme = generateReadme(manifest, finalReport);
    return {
      packageName,
      filesWritten: [],
      warnings: ['dry-run: no files written'],
      verifyPassed: false,
      dryRun: true,
      dryRunManifest: manifest,
      dryRunReadme: readme,
    };
  }

  // 6. Create target directory
  mkdirSync(toDir, { recursive: true });

  const filesWritten: string[] = [];

  // 7. Copy entire frozen pack to <target>/pack/
  const packTarget = join(toDir, 'pack');
  const packFileCount = copyDir(fromDir, packTarget);
  filesWritten.push(`pack/ (${packFileCount} files)`);

  // 8. Copy synthesis/ to <target>/synthesis/ (Lane 1 accessibility)
  const synthSrc = join(fromDir, 'synthesis');
  if (existsSync(synthSrc)) {
    const synthTarget = join(toDir, 'synthesis');
    const synthFileCount = copyDir(synthSrc, synthTarget);
    filesWritten.push(`synthesis/ (${synthFileCount} files)`);
  } else {
    warnings.push(
      'No synthesis/ directory in source pack — Lane 1 synthesis files not written',
    );
  }

  // 9. Write pack.manifest.json
  writeFileSync(
    join(toDir, 'pack.manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );
  filesWritten.push('pack.manifest.json');

  // 10. Generate README.md from final-report.md + manifest
  const finalReportPath = join(fromDir, 'synthesis/final-report.md');
  const finalReport = existsSync(finalReportPath) ? readFileSync(finalReportPath, 'utf8') : '';
  const readme = generateReadme(manifest, finalReport);
  writeFileSync(join(toDir, 'README.md'), readme, 'utf8');
  filesWritten.push('README.md');

  // 11. Provision docs/how-to-read-this.md scaffold (preserve if already exists)
  const docsDir = join(toDir, 'docs');
  mkdirSync(docsDir, { recursive: true });
  const howToReadPath = join(docsDir, 'how-to-read-this.md');
  if (existsSync(howToReadPath)) {
    warnings.push(
      'docs/how-to-read-this.md already exists — not overwritten (operator-authored content preserved)',
    );
  } else {
    const scaffold = generateHowToReadScaffold(manifest);
    writeFileSync(howToReadPath, scaffold, 'utf8');
    filesWritten.push('docs/how-to-read-this.md');
  }

  // 12. Run inline admission-contract verification
  const verifyResult = verifyPack(toDir);
  for (const w of verifyResult.softWarnings ?? []) warnings.push(w);

  if (!verifyResult.pass) {
    throw new Error(
      `Pack verification FAILED after publish — the published package does not meet the admission contract.\n` +
        `  ${verifyResult.reason}\n` +
        `  Target: ${toDir}`,
    );
  }

  return {
    packageName,
    filesWritten,
    warnings,
    verifyPassed: true,
    dryRun: false,
  };
}

export { verifyPack } from './verify.js';
export { deriveManifest } from './manifest.js';
export { generateReadme } from './readme.js';
export { generateHowToReadScaffold } from './how-to-read.js';
export type { PublishInput, PublishResult } from './types.js';
export type { PackManifest } from './schema.js';
