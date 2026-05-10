import { describe, it, expect } from 'vitest';
import {
  findIncompatibleDecisions,
  getEffectiveAcceptedClaimIds,
  getEffectiveDecisionMap,
} from '../../src/closure-ledger/effective-accepted.js';
import type { ClaimReview } from '../../src/review/schema.js';

// Local builder so the helper unit tests stay isolated from the pack-publish
// test fixture. Schema-conformant claim_ids are not strictly required here
// because the helper itself doesn't validate; it just operates on string
// `claim_id` values.
function review(
  claim_id: string,
  decision: ClaimReview['decision'],
  created_at: string,
): ClaimReview {
  return {
    claim_id,
    decision,
    reason: 'test',
    finding_ids: [],
    reviewer: 'heuristic',
    review_method: 'heuristic',
    created_at,
  };
}

describe('getEffectiveAcceptedClaimIds (F-36 helper)', () => {
  it('returns empty set on empty input', () => {
    expect(getEffectiveAcceptedClaimIds([]).size).toBe(0);
  });

  it('counts each unique claim_id once even with duplicate accepted rows', () => {
    // Mirrors XRPL Section 07 shape: same claim_id reviewed in two overlapping
    // windows, both decisions accepted_for_synthesis. Should count as one.
    const reviews = [
      review('clm_a', 'accepted_for_synthesis', '2026-05-09T10:00:00.000Z'),
      review('clm_a', 'accepted_for_synthesis', '2026-05-09T10:05:00.000Z'),
      review('clm_a', 'accepted_for_synthesis', '2026-05-09T10:10:00.000Z'),
      review('clm_b', 'accepted_for_synthesis', '2026-05-09T10:00:00.000Z'),
    ];
    const accepted = getEffectiveAcceptedClaimIds(reviews);
    expect(accepted.size).toBe(2);
    expect(accepted.has('clm_a')).toBe(true);
    expect(accepted.has('clm_b')).toBe(true);
  });

  it('latest-decision-wins: earlier accepted is overridden by later non-accepted', () => {
    // Claim accepted at T1, then rejected at T2. Effective state is rejected.
    const reviews = [
      review('clm_a', 'accepted_for_synthesis', '2026-05-09T10:00:00.000Z'),
      review('clm_a', 'rejected', '2026-05-09T11:00:00.000Z'),
    ];
    const accepted = getEffectiveAcceptedClaimIds(reviews);
    expect(accepted.has('clm_a')).toBe(false);
    expect(accepted.size).toBe(0);
  });

  it('latest-decision-wins: earlier non-accepted is overridden by later accepted', () => {
    // Claim sent for scope repair at T1, then accepted at T2. Effective is accepted.
    const reviews = [
      review('clm_a', 'needs_scope_repair', '2026-05-09T10:00:00.000Z'),
      review('clm_a', 'accepted_for_synthesis', '2026-05-09T11:00:00.000Z'),
    ];
    const accepted = getEffectiveAcceptedClaimIds(reviews);
    expect(accepted.has('clm_a')).toBe(true);
    expect(accepted.size).toBe(1);
  });

  it('does not depend on input order — out-of-order rows still resolve correctly', () => {
    // Same data as the previous test, but rows shuffled.
    const reviews = [
      review('clm_a', 'accepted_for_synthesis', '2026-05-09T11:00:00.000Z'),
      review('clm_a', 'needs_scope_repair', '2026-05-09T10:00:00.000Z'),
    ];
    const accepted = getEffectiveAcceptedClaimIds(reviews);
    expect(accepted.has('clm_a')).toBe(true);
  });

  it('getEffectiveDecisionMap exposes the latest review record per claim_id', () => {
    const reviews = [
      review('clm_a', 'accepted_for_synthesis', '2026-05-09T10:00:00.000Z'),
      review('clm_a', 'rejected', '2026-05-09T11:00:00.000Z'),
      review('clm_b', 'accepted_for_synthesis', '2026-05-09T10:00:00.000Z'),
    ];
    const map = getEffectiveDecisionMap(reviews);
    expect(map.size).toBe(2);
    expect(map.get('clm_a')?.decision).toBe('rejected');
    expect(map.get('clm_a')?.created_at).toBe('2026-05-09T11:00:00.000Z');
    expect(map.get('clm_b')?.decision).toBe('accepted_for_synthesis');
  });
});

describe('findIncompatibleDecisions (F-36 helper)', () => {
  it('returns empty array when there are no conflicts', () => {
    const reviews = [
      review('clm_a', 'accepted_for_synthesis', '2026-05-09T10:00:00.000Z'),
      review('clm_b', 'rejected', '2026-05-09T10:00:00.000Z'),
    ];
    expect(findIncompatibleDecisions(reviews)).toEqual([]);
  });

  it('flags a claim with two different decisions at the same created_at', () => {
    const reviews = [
      review('clm_a', 'accepted_for_synthesis', '2026-05-09T10:00:00.000Z'),
      review('clm_a', 'rejected', '2026-05-09T10:00:00.000Z'),
    ];
    const conflicts = findIncompatibleDecisions(reviews);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].claim_id).toBe('clm_a');
    expect(conflicts[0].created_at).toBe('2026-05-09T10:00:00.000Z');
    expect(conflicts[0].decisions.sort()).toEqual(['accepted_for_synthesis', 'rejected']);
  });

  it('does NOT flag identical-timestamp rows that agree on decision', () => {
    // Duplicate rows (same claim_id, same timestamp, same decision) are harmless
    // for counting and not a tie-breaker problem.
    const reviews = [
      review('clm_a', 'accepted_for_synthesis', '2026-05-09T10:00:00.000Z'),
      review('clm_a', 'accepted_for_synthesis', '2026-05-09T10:00:00.000Z'),
    ];
    expect(findIncompatibleDecisions(reviews)).toEqual([]);
  });
});
