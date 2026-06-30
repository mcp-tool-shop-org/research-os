// A-REVIEW-001 regression: promote({promoteSectionStatus:true}) must filter
// frame_excluded synthetic reviews out of the allAccepted check, mirroring
// run.ts finalizeReview. Before the fix, a single frame_excluded review in the
// snapshot blocked promotion of an otherwise-clean section (every reviewer-set
// review accepted_for_synthesis), contradicting
// test/cowork-frame-excluded-promotion.test.ts Scenario A.
//
// Invariant (both halves):
//   - REJECT-side: a snapshot whose ONLY non-frame_excluded review is a
//     repair/reject decision still does NOT promote (frame_excluded filtering
//     must not accidentally promote a section with outstanding reviewer work,
//     and a section with ZERO reviewer-set reviews — all frame_excluded — must
//     NOT promote).
//   - ACCEPT-side: a snapshot with N accepted_for_synthesis + M frame_excluded
//     DOES promote gated -> reviewed.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { promote } from '../../src/review/promote.js';
import { ResearchYamlSchema } from '../../src/intake/schema.js';
import type { ClaimReview, ReviewSnapshot } from '../../src/review/schema.js';

let workDir: string;
let packPath: string;

function review(decision: ClaimReview['decision'], idx: number): ClaimReview {
  return {
    claim_id: `clm_aaaaaaaaaaaa_heuristic_${idx}`,
    decision,
    reason: `scripted ${decision}`,
    finding_ids: [],
    reviewer: 'heuristic',
    review_method: 'scripted_for_promote_test',
    created_at: '2026-06-29T00:00:00.000Z',
  };
}

async function writeProfileSnapshot(reviews: ClaimReview[]) {
  const snapshot: ReviewSnapshot = {
    section_id: '01-test',
    reviewer: 'heuristic',
    review_method: 'scripted_for_promote_test',
    reviewed_at: '2026-06-29T00:00:00.000Z',
    candidate_claims: reviews.length,
    findings: [],
    claim_reviews: reviews,
    decision_counts: {},
    severity_counts: {},
    llm_findings_rejected_ungrounded: 0,
    promoted_to_reviewed: false,
  };
  const dir = join(packPath, 'sections', '01-test', 'reviews', 'default');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'review.json'), JSON.stringify(snapshot), 'utf8');
}

async function setGated() {
  const yamlPath = join(packPath, 'research.yaml');
  const research = ResearchYamlSchema.parse(yamlParse(await readFile(yamlPath, 'utf8')));
  research.sections[0]!.status = 'gated';
  await writeFile(yamlPath, yamlStringify(research, { lineWidth: 0 }), 'utf8');
}

async function readStatus(): Promise<string | undefined> {
  const research = ResearchYamlSchema.parse(
    yamlParse(await readFile(join(packPath, 'research.yaml'), 'utf8')),
  );
  return research.sections[0]?.status;
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-review-promote-fe-'));
  const result = await init({ topic: 'Frame-excluded promote', outDir: workDir });
  packPath = result.packPath;
  await sectionAdd({ id: '01-test', purpose: 'probe', packPath });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('A-REVIEW-001 — promote filters frame_excluded out of allAccepted', () => {
  it('ACCEPT: 3 accepted_for_synthesis + 2 frame_excluded promotes gated -> reviewed', async () => {
    await setGated();
    await writeProfileSnapshot([
      review('accepted_for_synthesis', 1),
      review('accepted_for_synthesis', 2),
      review('accepted_for_synthesis', 3),
      review('frame_excluded', 4),
      review('frame_excluded', 5),
    ]);
    const result = await promote({
      sectionId: '01-test',
      packPath,
      profile: 'default',
      promoteSectionStatus: true,
    });
    expect(result.section_status_bumped).toBe(true);
    expect(await readStatus()).toBe('reviewed');
  });

  it('REJECT: a reviewer-set repair decision (plus frame_excluded) does NOT promote', async () => {
    await setGated();
    await writeProfileSnapshot([
      review('accepted_for_synthesis', 1),
      review('needs_source_repair', 2),
      review('frame_excluded', 3),
    ]);
    const result = await promote({
      sectionId: '01-test',
      packPath,
      profile: 'default',
      promoteSectionStatus: true,
    });
    expect(result.section_status_bumped).toBe(false);
    expect(await readStatus()).toBe('gated');
  });

  it('REJECT: ZERO reviewer-set reviews (all frame_excluded) does NOT promote', async () => {
    await setGated();
    await writeProfileSnapshot([
      review('frame_excluded', 1),
      review('frame_excluded', 2),
    ]);
    const result = await promote({
      sectionId: '01-test',
      packPath,
      profile: 'default',
      promoteSectionStatus: true,
    });
    expect(result.section_status_bumped).toBe(false);
    expect(await readStatus()).toBe('gated');
  });
});
