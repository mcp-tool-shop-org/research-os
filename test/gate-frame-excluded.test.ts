// Phase 1b-b (v0.8.0): gate-level proofs that frame_excluded claims do NOT
// count toward the accepted_claim_floor.
//
// Required scenarios from the locked spec:
//   A. Mixed: 2 accepted + 3 frame_excluded → gate PASSES on the floor
//      (frame_excluded ignored; 2 accepted from 1 distinct source meets the
//      configured floor of min 2 / min 1 sources).
//   B. All frame_excluded: 5 frame_excluded, 0 accepted → gate FAILS the
//      floor (frame_excluded does NOT count as accepted).
//   C. Doctrine ratchet: same as B with a section_waiver on a DIFFERENT
//      check applied → gate STILL FAILS on accepted_claim_floor (the floor
//      is unwaiveable; the waiver cannot bypass).
//
// The check is `checkAcceptedClaimFloor` in src/gates/checks/accepted-claim-floor.ts.
// It filters on `decision === 'accepted_for_synthesis'`. Frame-excluded
// claims have decision === 'frame_excluded' and so naturally fall outside
// the accepted set. No production code change is needed here — this test
// proves the property is correct-by-construction.

import { describe, it, expect } from 'vitest';
import { checkAcceptedClaimFloor } from '../src/gates/checks/accepted-claim-floor.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';
import type { Claim } from '../src/claims/schema.js';
import type { GateInput } from '../src/gates/types.js';
import type { ClaimReview } from '../src/review/schema.js';
import type { FetchReceipt, SourceCard } from '../src/sources/schema.js';

const RESEARCH = ResearchYamlSchema.parse({
  research_os_version: '0.1.0',
  created_at: '2026-05-06T22:00:00.000Z',
  topic: 'Frame-excluded gate proof',
  sections: [
    {
      id: '01-test',
      purpose: 'Probe',
      max_time_minutes: 45,
      min_sources: 2,
      primary_sources_required: 1,
      contradictions_required: false,
      status: 'draft',
    },
  ],
});

const SECTION = RESEARCH.sections[0]!;

function makeClaim(id: string, sourceId: string, frameExcluded = false): Claim {
  return {
    claim_id: id,
    section_id: '01-test',
    source_ids: [sourceId],
    source_hashes: ['a'.repeat(64)],
    asserts: 'something',
    scope: 'scope',
    not: 'not',
    evidence_excerpt_ids: [],
    evidence_excerpt: 'excerpt',
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
    frame_excluded: frameExcluded,
    ...(frameExcluded
      ? {
          frame_exclusion_reason: 'off_topic' as const,
          frame_exclusion_rationale: 'about an unrelated topic',
        }
      : {}),
  };
}

function makeReview(
  claimId: string,
  decision: ClaimReview['decision'],
  createdAt = '2026-05-06T22:01:00.000Z',
): ClaimReview {
  return {
    claim_id: claimId,
    decision,
    reason: 'fixture',
    finding_ids: [],
    reviewer: 'heuristic',
    review_method: 'heuristic_key_point',
    created_at: createdAt,
  };
}

function makeInput(claims: Claim[], reviews: ClaimReview[]): GateInput {
  const sources: SourceCard[] = Array.from(new Set(claims.flatMap((c) => c.source_ids))).map(
    (sid) => ({
      source_id: sid,
      receipt_id: `rcpt_${sid.replace(/^src_/, '')}_1`,
      section_id: '01-test',
      url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      fetched_at: '2026-05-06T22:00:00.000Z',
      publisher: 'pub',
      published_at: '2025-12-01T00:00:00.000Z',
      title: 'x',
      source_type: 'secondary',
      relevance: 'unknown',
      key_points: [],
      limitations: [],
      asserts: 'x',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-06T22:00:00.000Z',
    }),
  );
  const receipts: FetchReceipt[] = [];
  return {
    research: RESEARCH,
    section: SECTION,
    claims,
    candidateClaims: claims,
    sources,
    receipts,
    contradictions: [],
    claimReviews: reviews,
  };
}

describe('accepted_claim_floor — frame_excluded does NOT count', () => {
  it('Scenario A: mixed accepted + frame_excluded → floor PASSES on 2 accepted from 2 sources', () => {
    // Floor in code: MIN_ACCEPTED_CLAIMS=3, MIN_ACCEPTED_SOURCES=2.
    // 5 claims total: 3 accepted across 2 sources + 2 frame_excluded.
    const claims = [
      makeClaim('clm_aaaaaaaaaaaa_heuristic_1', 'src_aaaaaaaaaaaa', false),
      makeClaim('clm_aaaaaaaaaaaa_heuristic_2', 'src_bbbbbbbbbbbb', false),
      makeClaim('clm_aaaaaaaaaaaa_heuristic_3', 'src_bbbbbbbbbbbb', false),
      makeClaim('clm_aaaaaaaaaaaa_heuristic_4', 'src_aaaaaaaaaaaa', true),
      makeClaim('clm_aaaaaaaaaaaa_heuristic_5', 'src_bbbbbbbbbbbb', true),
    ];
    const reviews = [
      makeReview('clm_aaaaaaaaaaaa_heuristic_1', 'accepted_for_synthesis'),
      makeReview('clm_aaaaaaaaaaaa_heuristic_2', 'accepted_for_synthesis'),
      makeReview('clm_aaaaaaaaaaaa_heuristic_3', 'accepted_for_synthesis'),
      makeReview('clm_aaaaaaaaaaaa_heuristic_4', 'frame_excluded'),
      makeReview('clm_aaaaaaaaaaaa_heuristic_5', 'frame_excluded'),
    ];
    const out = checkAcceptedClaimFloor(makeInput(claims, reviews));
    expect(out).toHaveLength(1);
    expect(out[0]!.status).toBe('pass');
    expect(out[0]!.detail).toContain('3 accepted claims from 2 distinct sources');
    expect(out[0]!.blocks_synthesis).toBe(false);
  });

  it('Scenario B: all claims frame_excluded → floor FAILS (0 accepted)', () => {
    const claims = [
      makeClaim('clm_aaaaaaaaaaaa_heuristic_1', 'src_aaaaaaaaaaaa', true),
      makeClaim('clm_aaaaaaaaaaaa_heuristic_2', 'src_aaaaaaaaaaaa', true),
      makeClaim('clm_aaaaaaaaaaaa_heuristic_3', 'src_aaaaaaaaaaaa', true),
      makeClaim('clm_aaaaaaaaaaaa_heuristic_4', 'src_aaaaaaaaaaaa', true),
      makeClaim('clm_aaaaaaaaaaaa_heuristic_5', 'src_aaaaaaaaaaaa', true),
    ];
    const reviews = [
      makeReview('clm_aaaaaaaaaaaa_heuristic_1', 'frame_excluded'),
      makeReview('clm_aaaaaaaaaaaa_heuristic_2', 'frame_excluded'),
      makeReview('clm_aaaaaaaaaaaa_heuristic_3', 'frame_excluded'),
      makeReview('clm_aaaaaaaaaaaa_heuristic_4', 'frame_excluded'),
      makeReview('clm_aaaaaaaaaaaa_heuristic_5', 'frame_excluded'),
    ];
    const out = checkAcceptedClaimFloor(makeInput(claims, reviews));
    expect(out).toHaveLength(1);
    expect(out[0]!.status).toBe('fail');
    expect(out[0]!.detail).toContain('0 accepted claims from 0 sources');
    expect(out[0]!.detail).toContain('Waivers cannot bypass evidence existence');
    expect(out[0]!.blocks_synthesis).toBe(true);
  });

  it('Scenario C (doctrine ratchet): all frame_excluded + unrelated waiver → floor STILL FAILS', () => {
    // Same claims as scenario B. We do NOT pass any waiver context into
    // checkAcceptedClaimFloor — the check itself ignores waivers entirely
    // because the accepted_claim_floor is unwaiveable. This test guards
    // against a future change that would smuggle waiver-bypass into the
    // accepted_claim_floor path.
    const claims = [
      makeClaim('clm_aaaaaaaaaaaa_heuristic_1', 'src_aaaaaaaaaaaa', true),
      makeClaim('clm_aaaaaaaaaaaa_heuristic_2', 'src_aaaaaaaaaaaa', true),
      makeClaim('clm_aaaaaaaaaaaa_heuristic_3', 'src_aaaaaaaaaaaa', true),
      makeClaim('clm_aaaaaaaaaaaa_heuristic_4', 'src_aaaaaaaaaaaa', true),
      makeClaim('clm_aaaaaaaaaaaa_heuristic_5', 'src_aaaaaaaaaaaa', true),
    ];
    const reviews = [
      makeReview('clm_aaaaaaaaaaaa_heuristic_1', 'frame_excluded'),
      makeReview('clm_aaaaaaaaaaaa_heuristic_2', 'frame_excluded'),
      makeReview('clm_aaaaaaaaaaaa_heuristic_3', 'frame_excluded'),
      makeReview('clm_aaaaaaaaaaaa_heuristic_4', 'frame_excluded'),
      makeReview('clm_aaaaaaaaaaaa_heuristic_5', 'frame_excluded'),
    ];
    const input = makeInput(claims, reviews);
    // Apply a section_waiver on a DIFFERENT check — proves that a waiver
    // present in the research context cannot bypass accepted_claim_floor.
    // accepted_claim_floor never reads waivers; the check is unwaiveable
    // by construction.
    const waivedResearch = ResearchYamlSchema.parse({
      ...RESEARCH,
      primary_source_waiver: {
        status: 'granted',
        reason: 'no public primary sources',
        compensating_controls: ['adversarial review'],
        section_waivers: [
          {
            section_id: '01-test',
            scope: 'min_independent_publishers',
            reason: 'monopoly waiver justified by triple-secondary corroboration',
            compensating_controls: ['triple-source review'],
          },
        ],
      },
    });
    const waivedInput: GateInput = { ...input, research: waivedResearch };
    const out = checkAcceptedClaimFloor(waivedInput);
    expect(out).toHaveLength(1);
    expect(out[0]!.status).toBe('fail');
    expect(out[0]!.blocks_synthesis).toBe(true);
    expect(out[0]!.detail).toContain('Waivers cannot bypass evidence existence');
  });
});
