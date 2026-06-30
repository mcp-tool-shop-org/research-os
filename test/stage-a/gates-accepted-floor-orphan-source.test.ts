// Stage A regression — A-GATES-001.
//
// Invariant: the distinct-source half of the accepted_claim_floor must only
// count source_ids that resolve to a REAL source card (input.sources). A
// phantom (orphan) source_id declared on an accepted claim must NOT satisfy the
// 2-source floor on its own.
//
// Both halves proven:
//   BAD  — 3 accepted claims, but their second distinct source is a phantom
//          (no matching source card). Floor must FAIL (only 1 real source).
//   GOOD — same 3 accepted claims where the second source IS a real card.
//          Floor must PASS (2 real distinct sources).

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
  topic: 'Orphan-source floor proof',
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

function makeReview(claimId: string): ClaimReview {
  return {
    claim_id: claimId,
    decision: 'accepted_for_synthesis',
    reason: 'fixture',
    finding_ids: [],
    reviewer: 'heuristic',
    review_method: 'heuristic_key_point',
    created_at: '2026-05-06T22:01:00.000Z',
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
const PHANTOM = 'src_cccccccccccc';

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

describe('A-GATES-001 — orphan source_ids do not satisfy the distinct-source floor', () => {
  it('BAD: accepted claims whose 2nd distinct source is a phantom → floor FAILS (1 real source)', () => {
    // 3 accepted claims meet MIN_ACCEPTED_CLAIMS=3. Distinct declared sources
    // are REAL_A + PHANTOM, but only REAL_A has a source card. The phantom must
    // not count, leaving 1 real distinct source < MIN_ACCEPTED_SOURCES=2.
    const claims = [
      makeClaim('clm_aaaaaaaaaaaa_heuristic_1', [REAL_A]),
      makeClaim('clm_aaaaaaaaaaaa_heuristic_2', [REAL_A]),
      makeClaim('clm_aaaaaaaaaaaa_heuristic_3', [PHANTOM]),
    ];
    const reviews = claims.map((c) => makeReview(c.claim_id));
    // Only REAL_A has a source card; PHANTOM is unresolved.
    const out = checkAcceptedClaimFloor(makeInput(claims, reviews, [makeSourceCard(REAL_A)]));
    expect(out).toHaveLength(1);
    expect(out[0]!.status).toBe('fail');
    expect(out[0]!.detail).toContain('from 1 sources');
    expect(out[0]!.blocks_synthesis).toBe(true);
  });

  it('GOOD: same accepted claims where the 2nd source IS a real card → floor PASSES (2 real sources)', () => {
    const claims = [
      makeClaim('clm_aaaaaaaaaaaa_heuristic_1', [REAL_A]),
      makeClaim('clm_aaaaaaaaaaaa_heuristic_2', [REAL_A]),
      makeClaim('clm_aaaaaaaaaaaa_heuristic_3', [REAL_B]),
    ];
    const reviews = claims.map((c) => makeReview(c.claim_id));
    const out = checkAcceptedClaimFloor(
      makeInput(claims, reviews, [makeSourceCard(REAL_A), makeSourceCard(REAL_B)]),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.status).toBe('pass');
    expect(out[0]!.detail).toContain('from 2 distinct sources');
    expect(out[0]!.blocks_synthesis).toBe(false);
  });
});
