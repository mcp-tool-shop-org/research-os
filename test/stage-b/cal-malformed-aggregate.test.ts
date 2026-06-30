// B-CAL-001 coverage follow-up (Stage B verifier LOW): the aggregate-receipt
// reader must still raise CALIBRATION_RECEIPT_MALFORMED on a receipt that is
// validly receipt_kind:'aggregate' at a SUPPORTED schema_version but structurally
// broken (a required AggregateMetric is missing). The aggregate-load happy path
// and version-rejection are covered by review-calibration-aggregate-receipt.test.ts;
// this pins the malformed-but-aggregate branch so the discriminator can't silently
// pass a corrupt receipt.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReceiptForPack } from '../../src/calibration/lookup.js';
import { CalibrationReceiptMalformedError } from '../../src/errors.js';

// Valid aggregate kind + supported schema_version (1), but good_fp_count is a bare
// number instead of an AggregateMetric object ({median,...}) — a structural break.
const MALFORMED_AGGREGATE = {
  schema_version: 1,
  receipt_kind: 'aggregate',
  profile_name: 'hermes-two-pass',
  status: 'conditional_pass',
  model: 'hermes3:8b',
  architecture: 'two-pass',
  fixture: 'seeded-v1',
  fixture_total_claims: 18,
  fixture_good_claims: 5,
  fixture_bad_claims: 13,
  runs_count: 3,
  aggregated_at: '2026-05-10T22:37:42.174Z',
  research_os_version: '0.4.0',
  good_fp_count: 0, // BAD: should be { median, min, max, values }
};

async function writeReceipt(packDir: string, profile: string, content: unknown): Promise<void> {
  const dir = join(packDir, 'calibration', 'reviewer-profiles', profile);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'seeded-v1.json'), JSON.stringify(content), 'utf8');
}

let tmpRoot: string;
beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'ro-stageb-cal-malformed-'));
});
afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('B-CAL-001 — malformed aggregate receipt still raises CALIBRATION_RECEIPT_MALFORMED', () => {
  it('a receipt_kind:aggregate + supported version but broken metric is rejected (not silently passed)', async () => {
    const pack = join(tmpRoot, 'pack-agg-malformed');
    await mkdir(pack);
    await writeReceipt(pack, 'hermes-two-pass', MALFORMED_AGGREGATE);
    await expect(loadReceiptForPack(pack, 'hermes-two-pass')).rejects.toBeInstanceOf(
      CalibrationReceiptMalformedError,
    );
  });
});
