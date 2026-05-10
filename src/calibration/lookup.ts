import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CalibrationReceiptSchema } from './receipt-schema.js';
import { receiptToCalibrationSummary } from './receipt.js';

// Load a calibration receipt from a pack directory (pack-relative, not cwd-relative).
// Returns null when no receipt exists at the expected path (missing = no-op).
// Throws with a descriptive message when a receipt exists but fails JSON parse or
// Zod schema validation (present-but-malformed = fail visibly).
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
    throw new Error(
      `Invalid calibration receipt at ${receiptPath}: ${(err as Error).message}`,
      { cause: err },
    );
  }

  const result = CalibrationReceiptSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid calibration receipt at ${receiptPath}: ${result.error.message}`,
    );
  }

  return receiptToCalibrationSummary(result.data);
}

// Receipt path convention exported so CLI can include path in log messages
// without duplicating the join logic.
export function receiptPathForPack(packDir: string, profile: string): string {
  return join(packDir, 'calibration', 'reviewer-profiles', profile, 'seeded-v1.json');
}
