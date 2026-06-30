// Stage A verifier follow-up — accepted_claim_floor tie direction (A-COWORK-001).
//
// The wave promoted getEffectiveDecisionMap to the single canonical
// last-appended-wins-on-tie join, but the synthesis-BLOCKING accepted_claim_floor
// kept a hand-rolled strict-`>` (first-appended-wins) join — the OPPOSITE
// direction. On two same-`created_at` reviews for one claim, the gate's
// accepted-set would diverge from what freeze/cowork/synth enforce.
//
// This pins the tie direction at the floor by making it observable in the verdict:
//   - accept-THEN-reject at the same created_at  → effective REJECTED → claim NOT
//     counted → floor fails on claim count (last-appended wins).
//   - reject-THEN-accept at the same created_at  → effective ACCEPTED → claim
//     counted → floor passes (last-appended wins).
// A strict-`>` (first-wins) join flips BOTH verdicts, so reverting the fix is red.

import { describe, it, expect } from 'vitest';
import { checkAcceptedClaimFloor } from '../../src/gates/checks/accepted-claim-floor.js';
import { ResearchYamlSchema } from '../../src/intake/schema.js';
import type { Claim } from '../../src/claims/schema.js';
import type { GateInput } from '../../src/gates/types.js';
import type { ClaimReview } from '../../src/review/schema.js';
import type { FetchReceipt, SourceCard } from '../../src/sources/schema.js';

const RESEARCH = ResearchYamlSchema.parse({
  research_os_version: '0.1.0',
  created_at: '2026-05-06T22:00:00.000Z',
  topic: 'Tie-direction floor proof',
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

function makeClaim(id: string, sourceIds: string[]): Claim {
  return {
    claim_id: id,
    section_id: '01-test',
    source_ids: sourceIds,
    source_hashes: ['a'.repeat(64)],
    asserts: 'something substantive',
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
  };
}

function makeReview(claimId: string, decision: ClaimReview['decision'], createdAt: string): ClaimReview {
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

function makeSourceCard(sid: string): SourceCard {
  return {
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
  };
}

const REAL_A = 'src_aaaaaaaaaaaa';
const REAL_B = 'src_bbbbbbbbbbbb';

function makeInput(claims: Claim[], reviews: ClaimReview[], sources: SourceCard[]): GateInput {
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

const C1 = 'clm_aaaaaaaaaaaa_heuristic_1';
const C2 = 'clm_aaaaaaaaaaaa_heuristic_2';
const C3 = 'clm_bbbbbbbbbbbb_heuristic_1';
const TIE = '2026-05-06T22:05:00.000Z'; // identical timestamp for the C3 conflict pair

const CLAIMS = [makeClaim(C1, [REAL_A]), makeClaim(C2, [REAL_A]), makeClaim(C3, [REAL_B])];
const SOURCES = [makeSourceCard(REAL_A), makeSourceCard(REAL_B)];

describe('accepted_claim_floor — same-created_at tie resolves last-appended-wins (A-COWORK-001)', () => {
  it('accept THEN reject at the same created_at → claim is REJECTED → floor fails (only 2 accepted)', () => {
    const reviews = [
      makeReview(C1, 'accepted_for_synthesis', TIE),
      makeReview(C2, 'accepted_for_synthesis', TIE),
      // C3: accepted then (same ms) rejected — last-appended (reject) must win.
      makeReview(C3, 'accepted_for_synthesis', TIE),
      makeReview(C3, 'rejected', TIE),
    ];
    const out = checkAcceptedClaimFloor(makeInput(CLAIMS, reviews, SOURCES));
    expect(out[0]!.status).toBe('fail');
    expect(out[0]!.detail).toContain('2 accepted claims');
  });

  it('reject THEN accept at the same created_at → claim is ACCEPTED → floor passes (3 accepted, 2 sources)', () => {
    const reviews = [
      makeReview(C1, 'accepted_for_synthesis', TIE),
      makeReview(C2, 'accepted_for_synthesis', TIE),
      // C3: rejected then (same ms) accepted — last-appended (accept) must win.
      makeReview(C3, 'rejected', TIE),
      makeReview(C3, 'accepted_for_synthesis', TIE),
    ];
    const out = checkAcceptedClaimFloor(makeInput(CLAIMS, reviews, SOURCES));
    expect(out[0]!.status).toBe('pass');
    expect(out[0]!.detail).toContain('3 accepted claims');
  });
});
