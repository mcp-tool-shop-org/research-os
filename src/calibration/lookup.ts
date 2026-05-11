import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CalibrationReceiptSchema,
  SUPPORTED_RECEIPT_VERSIONS,
} from './receipt-schema.js';
import { receiptToCalibrationSummary } from './receipt.js';
import {
  CalibrationReceiptMalformedError,
  UnsupportedReceiptVersionError,
} from '../errors.js';

// Load a calibration receipt from a pack directory (pack-relative, not cwd-relative).
// Returns null when no receipt exists at the expected path (missing = no-op).
// Throws structured errors when a receipt exists but fails JSON parse, schema
// validation, or version recognition (present-but-malformed = fail visibly).
export async function loadReceiptForPack(
  packDir: string,
  profile: string,
): Promise<ReturnType<typeof receiptToCalibrationSummary> | null> {
  const receiptPath = receiptPathForPack(packDir, profile);
  if (!existsSync(receiptPath)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(receiptPath, 'utf8'));
  } catch (err) {
    throw new CalibrationReceiptMalformedError(
      receiptPath,
      (err as Error).message,
    );
  }

  // B-C-001: check schema_version BEFORE running the full schema. An unknown
  // version triggers a structured UnsupportedReceiptVersionError with the
  // supported list rather than an opaque zod union failure.
  if (
    raw !== null &&
    typeof raw === 'object' &&
    'schema_version' in (raw as Record<string, unknown>)
  ) {
    const seen = (raw as { schema_version: unknown }).schema_version;
    if (
      typeof seen === 'number' &&
      !SUPPORTED_RECEIPT_VERSIONS.includes(seen as 1)
    ) {
      throw new UnsupportedReceiptVersionError(
        SUPPORTED_RECEIPT_VERSIONS,
        seen,
        receiptPath,
      );
    }
  }

  const result = CalibrationReceiptSchema.safeParse(raw);
  if (!result.success) {
    // If the zod failure is on the schema_version union specifically (e.g.
    // schema_version omitted, or a future stray-type producer wrote a string),
    // surface as UnsupportedReceiptVersionError. Other zod failures fall
    // through as a structured malformed-receipt error.
    const schemaVersionIssue = result.error.issues.find(
      (i) => i.path.length === 1 && i.path[0] === 'schema_version',
    );
    if (schemaVersionIssue) {
      const seenRaw =
        raw !== null && typeof raw === 'object'
          ? (raw as { schema_version?: unknown }).schema_version
          : undefined;
      throw new UnsupportedReceiptVersionError(
        SUPPORTED_RECEIPT_VERSIONS,
        typeof seenRaw === 'number' ? seenRaw : undefined,
        receiptPath,
      );
    }
    throw new CalibrationReceiptMalformedError(
      receiptPath,
      result.error.message,
    );
  }

  return receiptToCalibrationSummary(result.data);
}

// Receipt path convention exported so CLI can include path in log messages
// without duplicating the join logic.
export function receiptPathForPack(packDir: string, profile: string): string {
  return join(packDir, 'calibration', 'reviewer-profiles', profile, 'seeded-v1.json');
}
