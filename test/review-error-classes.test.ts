import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { review } from '../src/review/index.js';
import { promote } from '../src/review/promote.js';
import {
  CalibrationReceiptMalformedError,
  NoReviewerAvailableError,
  ReviewerCascadeFailedError,
  ReviewerProfileInvalidError,
  ReviewerProfileNotFoundError,
} from '../src/errors.js';
import { pickReviewer } from '../src/review/reviewers/index.js';
import type { Reviewer } from '../src/review/types.js';
import { loadReceiptForPack } from '../src/calibration/lookup.js';

// B-C-002 regression: raw `throw new Error(...)` calls at review/promote/
// calibration/reviewers throw sites are now structured ResearchOSError
// subclasses with stable `code` fields and `hint` strings. Callers (CLI,
// harness, future MCP shim) can programmatically distinguish failure classes.

let workDir: string;
let packPath: string;

async function makeMinimalPack(): Promise<void> {
  const result = await init({
    topic: 'B-C-002 error-class regression fixture',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({
    id: '01-test',
    purpose: 'probe',
    packPath,
  });
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'ro-bc002-test-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// NoReviewerAvailableError (reviewers/index.ts pickReviewer)
// ---------------------------------------------------------------------------
describe('B-C-002 — NoReviewerAvailableError', () => {
  it('pickReviewer throws structured error with code NO_REVIEWER_AVAILABLE when given empty list', async () => {
    let thrown: unknown = null;
    try {
      await pickReviewer([]);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(NoReviewerAvailableError);
    expect((thrown as NoReviewerAvailableError).code).toBe('NO_REVIEWER_AVAILABLE');
    expect((thrown as NoReviewerAvailableError).hint).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ReviewerCascadeFailedError (review/run.ts)
// ---------------------------------------------------------------------------

class AlwaysFailingReviewer implements Reviewer {
  readonly name = 'ollama-intern' as const;
  async available(): Promise<boolean> {
    return true;
  }
  async review() {
    return { ok: false as const, error: 'simulated reviewer failure' };
  }
}

describe('B-C-002 — ReviewerCascadeFailedError', () => {
  it('throws structured error with code REVIEWER_CASCADE_FAILED when single-reviewer fallback path exhausts', async () => {
    await makeMinimalPack();

    // Drop one minimal claim so candidate set is non-empty (the cascade path
    // doesn't depend on it, but real-shape input is harmless).
    let thrown: unknown = null;
    try {
      // Pass only the failing reviewer. The heuristic fallback inside review()
      // is found by name, but if heuristic isn't in the list and the chosen
      // reviewer fails, the structured cascade error is raised.
      await review({
        sectionId: '01-test',
        packPath,
        reviewers: [new AlwaysFailingReviewer()],
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ReviewerCascadeFailedError);
    const e = thrown as ReviewerCascadeFailedError;
    expect(e.code).toBe('REVIEWER_CASCADE_FAILED');
    expect(e.retryable).toBe(true);
    expect(e.failedReviewers.length).toBeGreaterThan(0);
    expect(e.failedReviewers[0]).toContain('simulated reviewer failure');
  });

  it('multi-pass mode also throws REVIEWER_CASCADE_FAILED when every reviewer fails', async () => {
    await makeMinimalPack();

    let thrown: unknown = null;
    try {
      await review({
        sectionId: '01-test',
        packPath,
        reviewers: [new AlwaysFailingReviewer()],
        multiPass: true,
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ReviewerCascadeFailedError);
    expect((thrown as ReviewerCascadeFailedError).code).toBe('REVIEWER_CASCADE_FAILED');
  });
});

// ---------------------------------------------------------------------------
// ReviewerProfileInvalidError (promote.ts)
// ---------------------------------------------------------------------------
describe('B-C-002 — ReviewerProfileInvalidError', () => {
  it('promote throws REVIEW_PROFILE_INVALID for a bad profile slug', async () => {
    await makeMinimalPack();

    let thrown: unknown = null;
    try {
      await promote({
        sectionId: '01-test',
        packPath,
        profile: 'BAD PROFILE NAME!!',
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ReviewerProfileInvalidError);
    expect((thrown as ReviewerProfileInvalidError).code).toBe('REVIEW_PROFILE_INVALID');
    expect((thrown as ReviewerProfileInvalidError).retryable).toBe(false);
    expect((thrown as ReviewerProfileInvalidError).profileName).toBe('BAD PROFILE NAME!!');
  });
});

// ---------------------------------------------------------------------------
// ReviewerProfileNotFoundError (promote.ts)
// ---------------------------------------------------------------------------
describe('B-C-002 — ReviewerProfileNotFoundError', () => {
  it('promote throws REVIEW_PROFILE_NOT_FOUND for a well-formed but missing profile', async () => {
    await makeMinimalPack();

    // Create a sibling profile so knownNames isn't empty
    const siblingDir = join(packPath, 'sections', '01-test', 'reviews', 'hermes-two-pass');
    await mkdir(siblingDir, { recursive: true });
    await writeFile(join(siblingDir, 'review.json'), '{}', 'utf8');

    let thrown: unknown = null;
    try {
      await promote({
        sectionId: '01-test',
        packPath,
        profile: 'mistral-nemo-two-pass',
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ReviewerProfileNotFoundError);
    const e = thrown as ReviewerProfileNotFoundError;
    expect(e.code).toBe('REVIEW_PROFILE_NOT_FOUND');
    expect(e.profileName).toBe('mistral-nemo-two-pass');
    expect(e.knownNames).toContain('hermes-two-pass');
    expect(e.hint).toBeDefined();
    // hint should mention known profiles
    expect(e.hint).toContain('known profiles');
  });

  it('knownNames is empty list when no sibling profiles exist', async () => {
    await makeMinimalPack();

    let thrown: unknown = null;
    try {
      await promote({
        sectionId: '01-test',
        packPath,
        profile: 'whatever',
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ReviewerProfileNotFoundError);
    expect((thrown as ReviewerProfileNotFoundError).knownNames).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CalibrationReceiptMalformedError (calibration/lookup.ts)
// ---------------------------------------------------------------------------
describe('B-C-002 — CalibrationReceiptMalformedError', () => {
  it('loadReceiptForPack throws CALIBRATION_RECEIPT_MALFORMED for malformed JSON', async () => {
    const pack = join(workDir, 'pack-malformed');
    await mkdir(pack);
    const dir = join(pack, 'calibration', 'reviewer-profiles', 'hermes-two-pass');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'seeded-v1.json'), '{ broken json !!!', 'utf8');

    let thrown: unknown = null;
    try {
      await loadReceiptForPack(pack, 'hermes-two-pass');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(CalibrationReceiptMalformedError);
    const e = thrown as CalibrationReceiptMalformedError;
    expect(e.code).toBe('CALIBRATION_RECEIPT_MALFORMED');
    expect(e.receiptPath).toContain('seeded-v1.json');
    expect(e.hint).toContain('Receipt path');
  });

  it('loadReceiptForPack throws CALIBRATION_RECEIPT_MALFORMED for valid-JSON but schema-invalid', async () => {
    const pack = join(workDir, 'pack-schema-bad');
    await mkdir(pack);
    const dir = join(pack, 'calibration', 'reviewer-profiles', 'hermes-two-pass');
    await mkdir(dir, { recursive: true });
    // Has schema_version: 1 (valid version) but missing required fields
    await writeFile(
      join(dir, 'seeded-v1.json'),
      JSON.stringify({ schema_version: 1, status: 'NOT_A_STATUS' }),
      'utf8',
    );

    let thrown: unknown = null;
    try {
      await loadReceiptForPack(pack, 'hermes-two-pass');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(CalibrationReceiptMalformedError);
    expect((thrown as CalibrationReceiptMalformedError).code).toBe('CALIBRATION_RECEIPT_MALFORMED');
  });
});

// ---------------------------------------------------------------------------
// End-to-end CLI test: research-os review-promote with a bogus profile must
// surface the structured `<CODE>:` prefix on stderr.
// ---------------------------------------------------------------------------
describe('B-C-002 — CLI structured-error surface (end-to-end)', () => {
  it('research-os review promote --profile <bogus> emits CODE-prefixed stderr', async () => {
    await makeMinimalPack();

    // Resolve the local CLI entry. Use the built dist/ if present and
    // up-to-date with the new B-C-002 error codes; otherwise skip — we still
    // keep the structured-error unit tests above as the primary proof.
    const distEntry = join(process.cwd(), 'dist', 'cli.js');
    if (!existsSync(distEntry)) {
      return;
    }
    // The bundled dist must include the new ResearchOSError subclass code
    // strings; if it predates B-C-002, skip rather than fail.
    const { readFileSync } = await import('node:fs');
    const distText = readFileSync(distEntry, 'utf8');
    if (!distText.includes('REVIEW_PROFILE_INVALID')) {
      return;
    }

    let stderr = '';
    let exitCode = 0;
    try {
      execFileSync(
        process.execPath,
        [distEntry, 'review-promote', '01-test', '--profile', 'BAD PROFILE!!'],
        {
          cwd: packPath,
          stdio: ['ignore', 'pipe', 'pipe'],
          encoding: 'utf8',
        },
      );
    } catch (err) {
      const e = err as { status?: number; stderr?: Buffer | string };
      exitCode = e.status ?? -1;
      stderr =
        typeof e.stderr === 'string'
          ? e.stderr
          : Buffer.isBuffer(e.stderr)
          ? e.stderr.toString('utf8')
          : '';
    }
    expect(exitCode).not.toBe(0);
    // The CLI's reportError prints `research-os: <CODE>: <message>\n  hint: ...`
    expect(stderr).toContain('REVIEW_PROFILE_INVALID');
  });
});
