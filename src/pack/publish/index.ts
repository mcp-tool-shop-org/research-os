import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join, basename, resolve } from 'node:path';
import { emitProgress } from '../../util/progress.js';
import { deriveManifest } from './manifest.js';
import { generateReadme } from './readme.js';
import { generateHowToReadScaffold } from './how-to-read.js';
import { copyDir } from './copy.js';
import { verifyPack } from './verify.js';
import { ResearchOSError } from '../../errors.js';
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
  // C1-004: structured error with closest existing code (PACK_NOT_FOUND) —
  // the source pack is incomplete (a required file is absent). See
  // closeout escalation note: PACK_NOT_FOUND broadened from "research.yaml
  // missing" to "any required pack artifact missing" for v1.0 release.
  for (const rel of REQUIRED_SOURCE_FILES) {
    if (!existsSync(join(fromDir, rel))) {
      throw new ResearchOSError(
        `Source pack missing required file: ${rel} (pack: ${fromDir})`,
        'PACK_NOT_FOUND',
        `Run \`research-os freeze\` before publish to produce the required artifact. See handbook/pack-publish.md.`,
      );
    }
  }

  // 2. Refuse if freeze-refusal artifacts exist (pack did not freeze cleanly)
  // C1-005: structured error. SYNTHESIS_NOT_READY conveys "pack is in a
  // non-publishable state" (closest existing code). See escalation note.
  if (
    existsSync(join(fromDir, 'audits/freeze-refusal.json')) ||
    existsSync(join(fromDir, 'audits/freeze-refusal.md'))
  ) {
    throw new ResearchOSError(
      `Source pack has freeze-refusal artifacts — pack did not freeze cleanly (pack: ${fromDir})`,
      'SYNTHESIS_NOT_READY',
      `Resolve the blocking reasons in audits/freeze-refusal.{json,md}, then re-run \`research-os freeze\`. See handbook/pack-publish.md.`,
    );
  }

  // 3. Check target: refuse if non-empty without --force.
  //    D-001 part 1: with --force on a non-empty target, recursively remove
  //    the target before re-creating it. Otherwise stale artifacts from a
  //    previous publish can survive into the new pack and verify-pack
  //    accepts them silently because the receipt only checks
  //    fingerprinted-files-exist + re-hash, not the inverse direction.
  if (existsSync(toDir)) {
    const entries = readdirSync(toDir);
    if (entries.length > 0) {
      if (!input.force) {
        // C1-006: first-encounter --force hint must communicate the
        // recursive-replace consequence. Canonical sentence (Stage C
        // Phase 3 Theme 1): see also cli.ts --force option description
        // and handbook/pack-publish.md.
        throw new ResearchOSError(
          `Target directory already exists and is non-empty: ${toDir}`,
          'PACK_EXISTS',
          `Pass --force to overwrite. --force clears and replaces the target package directory. Do not keep hand-authored files inside generated package output. See handbook/pack-publish.md.`,
        );
      }
      // We do not attempt to defend against malicious --to paths at this
      // point: resolve() above has already canonicalized any '..' segments
      // to absolute paths. The operator-supplied --to is the trust boundary
      // here. Hardening (caller-supplied publish-root constraint) is a
      // post-v1.0 concern if research-os ever accepts untrusted publish
      // targets.
      await rm(toDir, { recursive: true, force: true });
    }
  }

  // 4. Derive manifest early — fail fast on bad pack state before writing anything.
  //    Manifest derivation surfaces F-36 legacy-mismatch warnings via the
  //    shared warnings array; refusals throw.
  const manifest = deriveManifest(fromDir, packageName, input.operatorNotes ?? '', warnings);

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
  // C2-010: phase marker. Large packs (200+ artifacts) copy for several
  // seconds with no output; this tells the operator copy is in progress.
  emitProgress('Copying pack files...');
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
  // C2-010: phase marker. verify-pack re-hashes every fingerprinted artifact
  // (can take several seconds on large packs); emit one stderr line before
  // it starts so the operator does not interpret the gap as a hang.
  emitProgress('Verifying pack artifacts...');
  const verifyResult = verifyPack(toDir);
  for (const w of verifyResult.softWarnings ?? []) warnings.push(w);

  if (!verifyResult.pass) {
    // C1-007: structured error. verifyResult.reason already includes the
    // mismatched file path (verify.ts emits "Fingerprinted artifact missing:
    // pack/<rel>" / "Hash mismatch for pack/<rel>" / orphan-artifact list),
    // so C2-011 progress integration can pluck the path for stderr framing.
    // PACK_PARSE_ERROR is the closest existing code for "pack failed
    // structural verification".
    throw new ResearchOSError(
      `Pack verification FAILED after publish — the published package does not meet the admission contract. ${verifyResult.reason} (target: ${toDir})`,
      'PACK_PARSE_ERROR',
      `Inspect ${toDir}/pack/ for the artifact named in the failure detail above. Re-run \`research-os freeze\` upstream if the artifact state is wrong. See handbook/pack-publish.md and handbook/recovery.md.`,
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
