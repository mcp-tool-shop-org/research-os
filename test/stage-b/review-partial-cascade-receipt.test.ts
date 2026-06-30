// B-REVIEW-001 (e2e) + B-REVIEW-002 regression.
//
// B-REVIEW-001 e2e: when a paged ollama reviewer reports a partial window
// failure (ok:true with windows_failed/windows_total), the persisted
// ReviewSnapshot stamps windows_failed/windows_total as a durable receipt.
//
// B-REVIEW-002: in a multi-pass run where an LLM reviewer fails but the
// heuristic succeeds (a PARTIAL cascade — not every reviewer failed), the
// failed reviewer's error must escape onto the snapshot (failed_reviewers)
// rather than being silently dropped (the old code surfaced failedReviewers
// only in the all-failed branch).
//
// Both halves are covered:
//   - FAILURE PRESENT: snapshot.windows_failed === 1 and
//     snapshot.failed_reviewers names the failed LLM pass.
//   - HAPPY PATH: a clean multi-pass run leaves both fields undefined
//     (snapshot stays byte-identical to legacy).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { review } from '../../src/review/index.js';
import { HeuristicReviewer } from '../../src/review/reviewers/heuristic.js';
import { ReviewSnapshotSchema } from '../../src/review/schema.js';
import type { Reviewer } from '../../src/review/types.js';

let workDir: string;
let packPath: string;

async function makeFixture() {
  const result = await init({ topic: 'partial cascade receipt probe', outDir: workDir });
  packPath = result.packPath;
  await sectionAdd({ id: '01-test', purpose: 'probe', packPath });

  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  const sourceId = 'src_aaaaaaaaaaaa';
  const card = {
    source_id: sourceId,
    receipt_id: 'rcpt_aaaaaaaaaaaa_1',
    section_id: '01-test',
    url: 'https://example.com/x',
    final_url: 'https://example.com/x',
    fetched_at: '2026-05-06T22:00:00.000Z',
    publisher: 'p1',
    published_at: '2025-12-01T00:00:00.000Z',
    title: 'A',
    source_type: 'secondary',
    relevance: 'unknown',
    key_points: [],
    limitations: [],
    asserts: 'A',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-06T22:00:00.000Z',
  };
  await writeFile(join(cardDir, `${sourceId}.json`), JSON.stringify(card), 'utf8');
  const rawDir = join(packPath, 'evidence', 'raw');
  await mkdir(rawDir, { recursive: true });
  await writeFile(join(rawDir, `${sourceId}.html`), 'literal body text', 'utf8');
  const receipt = {
    receipt_id: 'rcpt_aaaaaaaaaaaa_1',
    source_id: sourceId,
    section_id: '01-test',
    requested_url: 'https://example.com/x',
    final_url: 'https://example.com/x',
    status: 200,
    status_text: 'OK',
    content_type: 'text/html',
    fetched_at: '2026-05-06T22:00:00.000Z',
    byte_count: 100,
    sha256: createHash('sha256').update(sourceId).digest('hex'),
    title: 'A',
    raw_text_path: `evidence/raw/${sourceId}.html`,
    fetch_outcome: 'ok',
    fetch_error: null,
    extraction_outcome: 'ok',
    extraction_extractor: 'heuristic',
    extraction_error: null,
  };
  await appendFile(join(packPath, 'evidence', 'fetch-log.jsonl'), JSON.stringify(receipt) + '\n', 'utf8');

  const claim = {
    claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
    section_id: '01-test',
    source_ids: [sourceId],
    source_hashes: ['a'.repeat(64)],
    asserts: 'literal body text',
    scope: 'narrow scope',
    not: 'broad scope',
    evidence_excerpt: 'literal body text',
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
  };
  await appendFile(
    join(packPath, 'sections', '01-test', 'claims.jsonl'),
    JSON.stringify(claim) + '\n',
    'utf8',
  );
}

async function readSnapshot() {
  const text = await readFile(join(packPath, 'audits', '01-test-review.json'), 'utf8');
  return ReviewSnapshotSchema.parse(JSON.parse(text));
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'ro-stageb-cascade-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('B-REVIEW-001/002 — partial failure receipts on the snapshot', () => {
  it('FAILURE PRESENT: partial-window failure + a failed LLM pass are stamped on the snapshot', async () => {
    await makeFixture();

    // LLM pass that succeeded overall but lost one of two windows.
    const partialWindowLlm: Reviewer = {
      name: 'ollama-intern',
      async available() {
        return true;
      },
      async review() {
        return {
          ok: true as const,
          method: 'ollama_intern_adversarial_review_paged',
          drafts: [],
          windows_failed: 1,
          windows_total: 2,
        };
      },
    };
    // A second LLM-family pass that fails outright (partial cascade — heuristic
    // below still succeeds, so the run completes).
    const failingLlm: Reviewer = {
      name: 'ollama-intern',
      async available() {
        return true;
      },
      async review() {
        return { ok: false as const, error: 'Ollama HTTP 500' };
      },
    };

    const summary = await review({
      sectionId: '01-test',
      packPath,
      multiPass: true,
      reviewers: [partialWindowLlm, failingLlm, new HeuristicReviewer()],
    });

    // Summary surfaces both.
    expect(summary.windowsFailed).toBe(1);
    expect(summary.windowsTotal).toBe(2);
    expect(summary.failedReviewers).toBeDefined();
    expect(summary.failedReviewers!.some((r) => r.includes('Ollama HTTP 500'))).toBe(true);

    // Snapshot is the durable receipt.
    const snap = await readSnapshot();
    expect(snap.windows_failed).toBe(1);
    expect(snap.windows_total).toBe(2);
    expect(snap.failed_reviewers).toBeDefined();
    expect(snap.failed_reviewers!.some((r) => r.includes('Ollama HTTP 500'))).toBe(true);
  });

  it('HAPPY PATH: a clean multi-pass run leaves the partial-failure fields undefined', async () => {
    await makeFixture();

    const cleanLlm: Reviewer = {
      name: 'ollama-intern',
      async available() {
        return true;
      },
      async review() {
        return {
          ok: true as const,
          method: 'ollama_intern_adversarial_review',
          drafts: [],
        };
      },
    };

    const summary = await review({
      sectionId: '01-test',
      packPath,
      multiPass: true,
      reviewers: [cleanLlm, new HeuristicReviewer()],
    });

    expect(summary.windowsFailed).toBeUndefined();
    expect(summary.windowsTotal).toBeUndefined();
    expect(summary.failedReviewers).toBeUndefined();

    const snap = await readSnapshot();
    expect(snap.windows_failed).toBeUndefined();
    expect(snap.windows_total).toBeUndefined();
    expect(snap.failed_reviewers).toBeUndefined();
  });
});
