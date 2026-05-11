import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { PackManifestSchema } from './schema.js';
import { SYNTHESIS_FILES } from '../../freeze/run.js';

// Inline equivalent of research-packs/scripts/verify-pack.mjs.
// Checks the same admission-contract conditions. The dogfood test uses the
// MJS script directly; this inline version is used when the research-packs
// checkout is unavailable or for testing.

const REQUIRED_FILES = [
  'pack/audits/freeze-receipt.json',
  'synthesis/final-report.md',
  'synthesis/decision-brief.md',
  'pack.manifest.json',
  'README.md',
];

export interface VerifyResult {
  pass: boolean;
  reason?: string;
  name?: string;
  artifactsVerified?: number;
  softWarnings?: string[];
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/**
 * D-001 part 2: walk `root` recursively and return every file path it contains,
 * as POSIX-style paths relative to `root` (forward slashes — matches the style
 * of `freeze-receipt.json` `path` fields). Skips hidden files (leading `.`),
 * `node_modules/`, and `.git/`.
 */
function walkFiles(root: string): string[] {
  const out: string[] = [];
  function recurse(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue;
      if (name === 'node_modules') continue;
      const full = join(dir, name);
      let isDir: boolean;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        recurse(full);
      } else {
        const rel = relative(root, full).split(sep).join('/');
        out.push(rel);
      }
    }
  }
  recurse(root);
  return out;
}

/**
 * Files at the published-package root that are produced by `pack publish`
 * itself rather than fingerprinted in `freeze-receipt.json`. Synthesis
 * paths are sourced from the canonical `SYNTHESIS_FILES` constant in
 * `src/freeze/run.ts` so this list stays in lockstep with what `freeze`
 * writes (single source of truth — do not hardcode synthesis paths here).
 *
 * Exported so regression tests can assert the single-source-of-truth
 * invariant (SYNTHESIS_FILES ⊂ PUBLISH_GENERATED_PATHS). This module is
 * internal to research-os; no public API stability concern.
 */
export const PUBLISH_GENERATED_PATHS = new Set<string>([
  ...SYNTHESIS_FILES,
  'pack.manifest.json',
  'README.md',
  'docs/how-to-read-this.md',
  // freeze-receipt.json lives under pack/ — included for parity with
  // research-packs/scripts/verify-pack.mjs ignore set.
  'pack/audits/freeze-receipt.json',
]);

export function verifyPack(packageDir: string): VerifyResult {
  // Step 1: Check admission-contract files
  for (const rel of REQUIRED_FILES) {
    const full = join(packageDir, rel);
    if (!existsSync(full)) {
      return { pass: false, reason: `MISSING required file: ${rel}` };
    }
  }

  // Step 2: Parse and validate pack.manifest.json
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(readFileSync(join(packageDir, 'pack.manifest.json'), 'utf8'));
  } catch (e) {
    return { pass: false, reason: `pack.manifest.json parse error: ${(e as Error).message}` };
  }
  const parsed = PackManifestSchema.safeParse(rawManifest);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join(', ');
    return { pass: false, reason: `pack.manifest.json schema violation: ${issues}` };
  }
  const m = parsed.data;

  // Step 3: Verify freeze_receipt_sha256 matches actual file
  const receiptPath = join(packageDir, 'pack/audits/freeze-receipt.json');
  const actualReceiptHash = sha256File(receiptPath);
  if (actualReceiptHash !== m.freeze_receipt_sha256) {
    return {
      pass: false,
      reason:
        `freeze-receipt.json hash mismatch.\n  manifest: ${m.freeze_receipt_sha256}\n  actual:   ${actualReceiptHash}`,
      name: m.name,
    };
  }

  // Step 4: Parse freeze receipt and re-verify all fingerprinted artifacts
  let receipt: {
    canonical_artifact_hashes?: Array<{ path: string; sha256: string }>;
    synthesis_hashes?: Array<{ path: string; sha256: string }>;
  };
  try {
    receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch (e) {
    return {
      pass: false,
      reason: `freeze-receipt.json parse error: ${(e as Error).message}`,
      name: m.name,
    };
  }

  const allFingerprints = [
    ...(receipt.canonical_artifact_hashes ?? []),
    ...(receipt.synthesis_hashes ?? []),
  ];

  let verified = 0;
  const softWarnings: string[] = [];
  for (const entry of allFingerprints) {
    const artifactPath = join(packageDir, 'pack', entry.path);
    if (!existsSync(artifactPath)) {
      return {
        pass: false,
        reason: `Fingerprinted artifact missing: pack/${entry.path}`,
        name: m.name,
      };
    }
    const actualHash = sha256File(artifactPath);
    if (actualHash !== entry.sha256) {
      // research.yaml is always modified by freeze AFTER the receipt is written.
      // Its receipt hash reflects the pre-freeze state by design — soft-warn, do not fail.
      if (entry.path === 'research.yaml') {
        softWarnings.push(
          `WARN  pack/research.yaml hash reflects pre-freeze state (known: freeze writes frozen_at + status after fingerprinting)`,
        );
        verified++;
        continue;
      }
      return {
        pass: false,
        reason: `Hash mismatch for pack/${entry.path}.\n  receipt: ${entry.sha256}\n  actual:  ${actualHash}`,
        name: m.name,
      };
    }
    verified++;
  }

  // Step 5: D-001 part 2 — orphan-artifact detection. A "stale-artifact
  // leak" can survive a `pack publish --force` if the target directory had
  // files from a previous publish that the new pack doesn't write — the
  // receipt hash check + per-fingerprint hash check both PASS (they only
  // verify files-listed-exist-and-match, not the inverse) so a dirty package
  // ships silently. Compare on-disk file set against fingerprinted set
  // (plus the publish-generated allowlist) and FAIL on any extras.
  const fingerprintedPackRelative = new Set<string>(
    allFingerprints.map((e) => `pack/${e.path.replace(/\\/g, '/')}`),
  );
  const allOnDisk = walkFiles(packageDir);
  const orphans: string[] = [];
  for (const rel of allOnDisk) {
    if (PUBLISH_GENERATED_PATHS.has(rel)) continue;
    if (fingerprintedPackRelative.has(rel)) continue;
    orphans.push(rel);
  }
  if (orphans.length > 0) {
    const preview = orphans.slice(0, 5).join(', ');
    const more = orphans.length > 5 ? ` (+${orphans.length - 5} more)` : '';
    return {
      pass: false,
      reason: `Orphan artifact(s) present in pack: ${preview}${more}`,
      name: m.name,
    };
  }

  return { pass: true, name: m.name, artifactsVerified: verified, softWarnings };
}
