import type { GateCheckResult, GateInput } from '../types.js';
import type { ClaimReview } from '../../review/schema.js';

const MIN_ACCEPTED_CLAIMS = 3;
const MIN_ACCEPTED_SOURCES = 2;

export function checkAcceptedClaimFloor(input: GateInput): GateCheckResult[] {
  const reviews = input.claimReviews;

  // Status-wins-by-latest: for each claim_id, the latest review entry wins.
  const latestByClaimId = new Map<string, ClaimReview>();
  for (const r of reviews) {
    const existing = latestByClaimId.get(r.claim_id);
    if (!existing || r.created_at > existing.created_at) {
      latestByClaimId.set(r.claim_id, r);
    }
  }

  const acceptedIds = [...latestByClaimId.values()]
    .filter((r) => r.decision === 'accepted_for_synthesis')
    .map((r) => r.claim_id);

  const acceptedCount = acceptedIds.length;

  // Map claim_id → source_ids from all claims in the section.
  const claimSourceMap = new Map<string, string[]>();
  for (const claim of input.claims) {
    claimSourceMap.set(claim.claim_id, claim.source_ids);
  }

  const distinctSources = new Set<string>();
  for (const cid of acceptedIds) {
    for (const sid of claimSourceMap.get(cid) ?? []) {
      distinctSources.add(sid);
    }
  }
  const distinctSourceCount = distinctSources.size;

  const belowClaimFloor = acceptedCount < MIN_ACCEPTED_CLAIMS;
  const belowSourceFloor = distinctSourceCount < MIN_ACCEPTED_SOURCES;

  if (belowClaimFloor || belowSourceFloor) {
    return [
      {
        family: 'accepted_claim_floor',
        check: 'min_accepted_claims_and_sources',
        status: 'fail',
        detail: `accepted-claim floor violated: ${acceptedCount} accepted claims from ${distinctSourceCount} sources (minimum: ${MIN_ACCEPTED_CLAIMS} claims from ${MIN_ACCEPTED_SOURCES} sources). Waivers cannot bypass evidence existence.`,
        evidence: acceptedIds,
        blocks_synthesis: true,
      },
    ];
  }

  return [
    {
      family: 'accepted_claim_floor',
      check: 'min_accepted_claims_and_sources',
      status: 'pass',
      detail: `${acceptedCount} accepted claims from ${distinctSourceCount} distinct sources (minimum: ${MIN_ACCEPTED_CLAIMS} from ${MIN_ACCEPTED_SOURCES}).`,
      evidence: [],
      blocks_synthesis: false,
    },
  ];
}
