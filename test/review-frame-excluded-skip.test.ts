// Phase 1b-b (v0.8.0): the review run MUST skip the reviewer LLM call for
// claims with frame_excluded === true, and instead emit a synthetic
// ClaimReview record with decision='frame_excluded' carrying the critic's
// rationale forward.
//
// We use a fake reviewer that records every claim it was asked to review;
// the test asserts the fake never sees the excluded claim, and that the
// final review.json snapshot has the expected decision counts.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { review } from '../src/review/index.js';
import type { Reviewer, ReviewerInput, ReviewerResult } from '../src/review/types.js';
import { ReviewSnapshotSchema } from '../src/review/schema.js';

let workDir: string;
let packPath: string;

class RecordingReviewer implements Reviewer {
  readonly name = 'heuristic' as const;
  public readonly sawClaimIds: string[] = [];
  async available(): Promise<boolean> {
    return true;
  }
  async review(input: ReviewerInput): Promise<ReviewerResult> {
    for (const c of input.candidateClaims) this.sawClaimIds.push(c.claim_id);
    return { ok: true, drafts: [], method: 'recording_test' };
  }
}

async function makeFixture(args: {
  excludedClaimIds: string[];
  acceptedClaimIds: string[];
}) {
  const result = await init({
    topic: 'Frame-excluded review-skip test',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({ id: '01-test', purpose: 'probe', packPath });

  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  const sourceId = 'src_aaaaaaaaaaaa';
  const card = {
    source_id: sourceId,
    receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1`,
    section_id: '01-test',
    url: 'https://example.com/x',
    final_url: 'https://example.com/x',
    fetched_at: '2026-05-06T22:00:00.000Z',
    publisher: 'p',
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
  await writeFile(join(rawDir, `${sourceId}.html`), 'literal text body content', 'utf8');
  const receipt = {
    receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1`,
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
  await appendFile(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    JSON.stringify(receipt) + '\n',
    'utf8',
  );

  for (const claimId of args.acceptedClaimIds) {
    const claim = {
      claim_id: claimId,
      section_id: '01-test',
      source_ids: [sourceId],
      source_hashes: ['a'.repeat(64)],
      asserts: 'literal text body content',
      scope: 'narrow',
      not: 'broad',
      evidence_excerpt_ids: [],
      evidence_excerpt: 'literal text body content',
      evidence_location: null,
      confidence: 'low',
      extractor: 'heuristic',
      extraction_method: 'heuristic_key_point',
      created_at: '2026-05-06T22:00:00.000Z',
      review_state: 'candidate',
      frame_excluded: false,
    };
    await appendFile(
      join(packPath, 'sections', '01-test', 'claims.jsonl'),
      JSON.stringify(claim) + '\n',
      'utf8',
    );
  }
  for (const claimId of args.excludedClaimIds) {
    const claim = {
      claim_id: claimId,
      section_id: '01-test',
      source_ids: [sourceId],
      source_hashes: ['a'.repeat(64)],
      asserts: 'about an unrelated subject entirely',
      scope: 'narrow',
      not: 'broad',
      evidence_excerpt_ids: [],
      evidence_excerpt: 'literal text body content',
      evidence_location: null,
      confidence: 'low',
      extractor: 'ollama-intern',
      extraction_method: 'mcp_ollama_extract',
      created_at: '2026-05-06T22:00:00.000Z',
      review_state: 'candidate',
      frame_excluded: true,
      frame_exclusion_reason: 'off_topic',
      frame_exclusion_rationale: 'about an unrelated subject',
    };
    await appendFile(
      join(packPath, 'sections', '01-test', 'claims.jsonl'),
      JSON.stringify(claim) + '\n',
      'utf8',
    );
  }
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-review-frame-excluded-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('review run — frame_excluded claims skip the reviewer LLM', () => {
  it('does NOT pass frame_excluded claims to the reviewer.review() call', async () => {
    await makeFixture({
      acceptedClaimIds: ['clm_aaaaaaaaaaaa_heuristic_1', 'clm_aaaaaaaaaaaa_heuristic_2'],
      excludedClaimIds: ['clm_aaaaaaaaaaaa_ollama_intern_1', 'clm_aaaaaaaaaaaa_ollama_intern_2'],
    });
    const rec = new RecordingReviewer();
    await review({
      sectionId: '01-test',
      packPath,
      reviewers: [rec],
    });
    // The reviewer saw only the non-excluded claims.
    expect(rec.sawClaimIds).toContain('clm_aaaaaaaaaaaa_heuristic_1');
    expect(rec.sawClaimIds).toContain('clm_aaaaaaaaaaaa_heuristic_2');
    expect(rec.sawClaimIds).not.toContain('clm_aaaaaaaaaaaa_ollama_intern_1');
    expect(rec.sawClaimIds).not.toContain('clm_aaaaaaaaaaaa_ollama_intern_2');
  });

  it('emits a ClaimReview record per frame_excluded claim with decision=frame_excluded and rationale-bearing reason', async () => {
    await makeFixture({
      acceptedClaimIds: ['clm_aaaaaaaaaaaa_heuristic_1'],
      excludedClaimIds: ['clm_aaaaaaaaaaaa_ollama_intern_1'],
    });
    const rec = new RecordingReviewer();
    await review({
      sectionId: '01-test',
      packPath,
      reviewers: [rec],
    });
    const reviewsPath = join(packPath, 'sections', '01-test', 'claim-reviews.jsonl');
    const text = await readFile(reviewsPath, 'utf8');
    const records = text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const excludedRecord = records.find(
      (r) => r.claim_id === 'clm_aaaaaaaaaaaa_ollama_intern_1',
    );
    expect(excludedRecord).toBeDefined();
    expect(excludedRecord?.decision).toBe('frame_excluded');
    expect(excludedRecord?.finding_ids).toEqual([]);
    expect(String(excludedRecord?.reason)).toContain('Frame-excluded before review');
    expect(String(excludedRecord?.reason)).toContain('off_topic');
    expect(String(excludedRecord?.reason)).toContain('about an unrelated subject');
  });

  it('counts frame_excluded in review.json decision_counts (not folded into rejected/needs_*)', async () => {
    await makeFixture({
      acceptedClaimIds: ['clm_aaaaaaaaaaaa_heuristic_1'],
      excludedClaimIds: [
        'clm_aaaaaaaaaaaa_ollama_intern_1',
        'clm_aaaaaaaaaaaa_ollama_intern_2',
      ],
    });
    const rec = new RecordingReviewer();
    await review({
      sectionId: '01-test',
      packPath,
      reviewers: [rec],
    });
    const snap = ReviewSnapshotSchema.parse(
      JSON.parse(await readFile(join(packPath, 'audits', '01-test-review.json'), 'utf8')),
    );
    expect(snap.decision_counts.frame_excluded ?? 0).toBe(2);
    expect(snap.decision_counts.rejected ?? 0).toBe(0);
    // candidate_claims reflects the TOTAL (accepted-set + frame_excluded set).
    expect(snap.candidate_claims).toBe(3);
  });
});
