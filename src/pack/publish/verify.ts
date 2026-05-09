import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PackManifestSchema } from './schema.js';

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

  return { pass: true, name: m.name, artifactsVerified: verified, softWarnings };
}
