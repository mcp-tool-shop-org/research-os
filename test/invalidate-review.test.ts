import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, appendFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { invalidateReview } from '../src/invalidate/index.js';
import { ReviewInvalidationReceiptSchema } from '../src/invalidate/review.js';
import { PackNotFoundError, SectionNotFoundError } from '../src/errors.js';

let workDir: string;
let packPath: string;

async function setupPack() {
  const r = await init({ topic: 'Review-invalidation fixture pack', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: '01-test', purpose: 'review invalidation', packPath });
}

async function plantCanonicalReviewState() {
  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(join(packPath, 'audits', '01-test-review.json'), '{}', 'utf8');
  await writeFile(join(packPath, 'audits', '01-test-review.md'), '# review', 'utf8');
  await appendFile(
    join(packPath, 'audits', '01-test-findings.jsonl'),
    JSON.stringify({ finding_id: 'fnd_x', section_id: '01-test' }) + '\n',
    'utf8',
  );
  await appendFile(
    join(packPath, 'sections', '01-test', 'claim-reviews.jsonl'),
    JSON.stringify({ claim_id: 'clm_xxxxxxxxxxxx_heuristic_1', decision: 'rejected' }) + '\n',
    'utf8',
  );
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-invr-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('invalidateReview', () => {
  it('rejects when pack does not exist', async () => {
    await expect(
      invalidateReview({
        packPath: join(workDir, 'nope'),
        sectionId: '01-test',
        reason: 'pre-profile contamination cleanup',
      }),
    ).rejects.toBeInstanceOf(PackNotFoundError);
  });

  it('rejects when section does not exist', async () => {
    await setupPack();
    await expect(
      invalidateReview({
        packPath,
        sectionId: '99-no',
        reason: 'pre-profile contamination cleanup',
      }),
    ).rejects.toBeInstanceOf(SectionNotFoundError);
  });

  it('rejects too-short reason', async () => {
    await setupPack();
    await expect(
      invalidateReview({ packPath, sectionId: '01-test', reason: 'short' }),
    ).rejects.toThrow(/at least 8/);
  });

  it('returns no-op when there is no canonical review state to archive', async () => {
    await setupPack();
    const result = await invalidateReview({
      packPath,
      sectionId: '01-test',
      reason: 'pre-profile contamination cleanup',
    });
    expect(result.performed).toBe(false);
    expect(result.archivedCount).toBe(0);
    expect(result.message).toMatch(/No canonical review artifacts/);
  });

  it('archives all canonical review artifacts and writes a parseable receipt', async () => {
    await setupPack();
    await plantCanonicalReviewState();
    // Plant a review-active.json so we know it gets archived too.
    await writeFile(
      join(packPath, 'sections', '01-test', 'review-active.json'),
      JSON.stringify({
        active_profile: 'old-default',
        promoted_at: '2026-05-06T22:00:00.000Z',
        promoted_method: 'foo',
        promoted_reviewer: 'heuristic',
      }),
      'utf8',
    );

    const result = await invalidateReview({
      packPath,
      sectionId: '01-test',
      reason: 'reviewer experiments predated profile isolation',
      now: () => new Date('2026-05-07T00:00:00.000Z'),
    });

    expect(result.performed).toBe(true);
    expect(result.archivedCount).toBe(5);
    // Original canonical paths should be empty now.
    expect(existsSync(join(packPath, 'audits', '01-test-review.json'))).toBe(false);
    expect(existsSync(join(packPath, 'audits', '01-test-review.md'))).toBe(false);
    expect(existsSync(join(packPath, 'audits', '01-test-findings.jsonl'))).toBe(false);
    expect(existsSync(join(packPath, 'sections', '01-test', 'claim-reviews.jsonl'))).toBe(false);
    expect(existsSync(join(packPath, 'sections', '01-test', 'review-active.json'))).toBe(false);

    // Archived copies live under the receipt dir.
    const receiptDir = join(packPath, result.archiveDir!);
    expect(existsSync(join(receiptDir, 'audits', '01-test-review.json'))).toBe(true);
    expect(existsSync(join(receiptDir, 'sections', '01-test', 'claim-reviews.jsonl'))).toBe(true);
    expect(existsSync(join(receiptDir, 'invalidation.json'))).toBe(true);
    expect(existsSync(join(receiptDir, 'invalidation.md'))).toBe(true);

    const receipt = ReviewInvalidationReceiptSchema.parse(
      JSON.parse(await readFile(join(receiptDir, 'invalidation.json'), 'utf8')),
    );
    expect(receipt.section_id).toBe('01-test');
    expect(receipt.contract_label).toBe('pre-review-profiles');
    expect(receipt.archived_artifacts).toHaveLength(5);
  });

  it('does NOT touch sections/<id>/reviews/<profile>/ — only canonical state', async () => {
    await setupPack();
    await plantCanonicalReviewState();
    await mkdir(join(packPath, 'sections', '01-test', 'reviews', 'hermes-two-pass'), {
      recursive: true,
    });
    await writeFile(
      join(packPath, 'sections', '01-test', 'reviews', 'hermes-two-pass', 'review.json'),
      '{"keep": "me"}',
      'utf8',
    );
    await invalidateReview({
      packPath,
      sectionId: '01-test',
      reason: 'pre-profile contamination cleanup of canonical state',
    });
    expect(
      existsSync(
        join(packPath, 'sections', '01-test', 'reviews', 'hermes-two-pass', 'review.json'),
      ),
    ).toBe(true);
  });
});
