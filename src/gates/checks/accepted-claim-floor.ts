import type { GateCheckResult, GateInput } from '../types.js';
import { getEffectiveAcceptedClaimIds } from '../../closure-ledger/effective-accepted.js';

const MIN_ACCEPTED_CLAIMS = 3;
const MIN_ACCEPTED_SOURCES = 2;

export function checkAcceptedClaimFloor(input: GateInput): GateCheckResult[] {
  const reviews = input.claimReviews;

  // A-COWORK-001 (verifier follow-up): use the single canonical latest-decision
  // join so the synthesis-blocking floor resolves same-`created_at` ties in the
  // SAME (last-appended-wins) direction as cowork/synth/freeze. A hand-rolled
  // strict-`>` join here would count an accepted-then-rejected same-millisecond
  // pair as accepted while freeze enforces rejected — a split-brain gate verdict.
  const acceptedIds = [...getEffectiveAcceptedClaimIds(reviews)];

  const acceptedCount = acceptedIds.length;

  // Map claim_id → source_ids from all claims in the section.
  const claimSourceMap = new Map<string, string[]>();
  for (const claim of input.claims) {
    claimSourceMap.set(claim.claim_id, claim.source_ids);
  }

  // A-GATES-001: only count source_ids that resolve to a REAL source card.
  // A claim may declare a phantom source_id (no matching source card); such an
  // id must not satisfy the distinct-source floor. Intersect against the set of
  // real source-card ids (input.sources) before counting. (Today this is masked
  // by no_orphan_claims, but the floor must hold on its own.)
  const realSourceIds = new Set(input.sources.map((s) => s.source_id));

  const distinctSources = new Set<string>();
  for (const cid of acceptedIds) {
    for (const sid of claimSourceMap.get(cid) ?? []) {
      if (realSourceIds.has(sid)) distinctSources.add(sid);
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
