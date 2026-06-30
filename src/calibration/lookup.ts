import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CalibrationReceiptSchema,
  SUPPORTED_RECEIPT_VERSIONS,
} from './receipt-schema.js';
import {
  AggregateCalibrationReceiptSchema,
  SUPPORTED_AGGREGATE_RECEIPT_VERSIONS,
  type AggregateCalibrationReceipt,
} from './aggregate-receipt-schema.js';
import { receiptToCalibrationSummary } from './receipt.js';
import {
  CalibrationReceiptMalformedError,
  UnsupportedReceiptVersionError,
} from '../errors.js';

// B-CAL-001: aggregate receipts (receipt_kind:'aggregate') carry per-metric
// { median, min, max, values } objects rather than the single-run scalars.
// The shipped receipts at calibration/reviewer-profiles/<profile>/seeded-v1.json
// are AGGREGATE (multi-run), so the single-run reader threw
// CALIBRATION_RECEIPT_MALFORMED on perfectly valid files and hard-aborted
// `review promote` auto-population. This maps an aggregate receipt onto the
// same PromotionCalibrationSummary string shape receiptToCalibrationSummary
// produces, reading each AggregateMetric's median (the representative central
// value across runs). Per-category recall percentages use median_ratio.
export function aggregateReceiptToCalibrationSummary(
  receipt: AggregateCalibrationReceipt,
): ReturnType<typeof receiptToCalibrationSummary> {
  const fp = receipt.good_fp_count.median;
  const fpTotal = receipt.fixture_good_claims;
  const fpPct = fpTotal > 0 ? Math.round((fp / fpTotal) * 100) : 0;

  const afRatio = receipt.any_flag_recall_ratio.median;
  const afTotal = receipt.fixture_bad_claims;
  const afMatched = Math.round(afRatio * afTotal);

  const srRatio = receipt.strict_recall_ratio.median;
  const srMatched = Math.round(srRatio * afTotal);

  const unsupported = receipt.per_category_any_flag['unsupported_claim'];
  const unsupportedMatched = unsupported
    ? Math.round(unsupported.median_ratio * unsupported.total)
    : 0;

  return {
    fixture: receipt.fixture,
    good_false_positive_rate: `${fp}/${fpTotal} (${fpPct}%)`,
    bad_any_flag_recall: `${afMatched}/${afTotal} (${Math.round(afRatio * 100)}%)`,
    strict_category_recall: `${srMatched}/${afTotal} (${Math.round(srRatio * 100)}%)`,
    unsupported_claim_recall: unsupported
      ? `${unsupportedMatched}/${unsupported.total} (${Math.round(unsupported.median_ratio * 100)}%)`
      : null,
    notes: `status=${receipt.status} model=${receipt.model} arch=${receipt.architecture} overall=${receipt.pass_fail.overall} decisions=${receipt.decisions_produced_count.median}/6 (aggregate of ${receipt.runs_count} runs)`,
  };
}

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

  // B-CAL-001: discriminate on receipt_kind BEFORE choosing a schema. The
  // shipped receipts are AGGREGATE (receipt_kind:'aggregate'), which the
  // single-run CalibrationReceiptSchema cannot parse — validating them with it
  // threw CALIBRATION_RECEIPT_MALFORMED on a VALID file. When the kind is
  // 'aggregate', gate on SUPPORTED_AGGREGATE_RECEIPT_VERSIONS, validate with
  // AggregateCalibrationReceiptSchema, and map medians onto the summary shape.
  if (
    raw !== null &&
    typeof raw === 'object' &&
    (raw as Record<string, unknown>).receipt_kind === 'aggregate'
  ) {
    const seen = (raw as { schema_version?: unknown }).schema_version;
    if (
      typeof seen === 'number' &&
      !SUPPORTED_AGGREGATE_RECEIPT_VERSIONS.includes(seen as 1)
    ) {
      throw new UnsupportedReceiptVersionError(
        SUPPORTED_AGGREGATE_RECEIPT_VERSIONS,
        seen,
        receiptPath,
      );
    }
    const aggResult = AggregateCalibrationReceiptSchema.safeParse(raw);
    if (!aggResult.success) {
      const schemaVersionIssue = aggResult.error.issues.find(
        (i) => i.path.length === 1 && i.path[0] === 'schema_version',
      );
      if (schemaVersionIssue) {
        throw new UnsupportedReceiptVersionError(
          SUPPORTED_AGGREGATE_RECEIPT_VERSIONS,
          typeof seen === 'number' ? seen : undefined,
          receiptPath,
        );
      }
      throw new CalibrationReceiptMalformedError(
        receiptPath,
        aggResult.error.message,
      );
    }
    return aggregateReceiptToCalibrationSummary(aggResult.data);
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
