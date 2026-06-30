import { describe, it, expect } from 'vitest';
import { aggregate } from '../../src/audit/aggregate.js';
import { ResearchYamlSchema } from '../../src/intake/schema.js';
import type { Claim } from '../../src/claims/schema.js';
import type { ClaimReview } from '../../src/review/schema.js';
import type { ClaimSynthesisDisposition } from '../../src/dispositions/schema.js';
import type { SectionGateResult } from '../../src/gates/schema.js';

// A-AUD-003 regression. The invariant has two halves:
//   BAD:  a claim with BOTH an accepted_for_synthesis review AND a disposition
//         triggers the "invalid disposition" layer-violation warning EXACTLY
//         ONCE — not twice. buildEffectiveDispositions has a side effect
//         (pushes into the shared warnings array) and was invoked twice over
//         the same data (buildSectionReadiness + buildClaimSummary), so the
//         warning (and its blocking_reasons echo) was duplicated.
//   GOOD: a normally-dispositioned claim (no accepting review) produces NO
//         layer-violation warning.

function research(sectionIds: string[] = ['01-test']) {
  return ResearchYamlSchema.parse({
    research_os_version: '0.1.0',
    created_at: '2026-05-06T22:00:00.000Z',
    topic: 'How does the audit dedup layer-violation warnings correctly?',
    decision: 'lock the audit shape',
    sections: sectionIds.map((id) => ({
      id,
      purpose: `purpose for ${id}`,
      max_time_minutes: 45,
      min_sources: 2,
      primary_sources_required: 1,
      contradictions_required: false,
      status: 'draft',
    })),
  });
}

function claim(id: string, sectionId: string): Claim {
  return {
    claim_id: id,
    section_id: sectionId,
    source_ids: ['src_aaaaaaaaaaaa'],
    source_hashes: ['a'.repeat(64)],
    asserts: 'an assertion long enough to be substantive across the threshold',
    scope: 'narrow',
    not: 'broad',
    evidence_excerpt: 'literal',
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
  };
}

function review(claim_id: string, decision: ClaimReview['decision']): ClaimReview {
  return {
    claim_id,
    decision,
    reason: 'test',
    finding_ids: [],
    reviewer: 'heuristic',
    review_method: 'heuristic_field_and_grounding_checks',
    created_at: '2026-05-06T22:00:01.000Z',
  };
}

function disposition(claim_id: string, status: ClaimSynthesisDisposition['status']): ClaimSynthesisDisposition {
  return {
    claim_id,
    section_id: '01-test',
    status,
    reason: 'test disposition reason',
    decided_by: 'sonnet',
    authorized_by: 'operator',
    source: 'pack-truth-consistency-run',
    created_at: '2026-05-08T01:00:00.000Z',
  };
}

function gate(section_id: string): SectionGateResult {
  return {
    section_id,
    verdict: 'pass',
    summary: 'mock',
    checked_at: '2026-05-06T22:00:00.000Z',
    synthesis_eligible: true,
    gate_results: [],
    failures: [],
    warnings: [],
    waivers_applied: [],
    blocking_reasons: [],
    claim_counts: { total: 0, candidate: 0, with_evidence_excerpt: 0, with_source_hashes: 0, with_scope: 0, with_not: 0, universal_scope_null: 0, orphans: 0 },
    source_counts: { total: 1, primary: 0, secondary: 1, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 1, failed_fetches: 0 },
    contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
    freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 0 },
    scope_integrity_summary: { universal_claims: 0, scoped_claims: 0, with_not_constraint: 0, overgen_risks_total: 0, overgen_risks_blocking: 0 },
    next_actions: [],
  };
}

describe('A-AUD-003 layer-violation warning de-duplication', () => {
  it('BAD: accepted + dispositioned claim yields the layer-violation warning exactly once', () => {
    const c = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test');
    const rev = review(c.claim_id, 'accepted_for_synthesis');
    const disp = disposition(c.claim_id, 'parked_not_for_synthesis');
    const warnings: string[] = [];
    const result = aggregate({
      research: research(['01-test']),
      perSection: new Map([
        ['01-test', {
          claims: [c],
          candidateClaims: [c],
          claimReviews: [rev],
          contradictions: [],
          dispositions: [disp],
          gate: gate('01-test'),
          findings: [],
          sourceIdsForSection: [],
        }],
      ]),
      sources: [],
      receipts: [],
      handoff: null,
      generatedAt: '2026-05-08T00:00:00.000Z',
      warnings,
    });

    const matchingWarnings = warnings.filter((w) => w.includes('invalid disposition') && w.includes(c.claim_id));
    expect(matchingWarnings.length).toBe(1);

    // payload.warnings (which the verdict greps for /invalid/ to build
    // blocking_reasons) must not double-count either.
    const payloadMatches = result.payload.warnings.filter((w) => w.includes('invalid disposition') && w.includes(c.claim_id));
    expect(payloadMatches.length).toBe(1);
    const blockingMatches = result.payload.blocking_reasons.filter((b) => b.includes('invalid disposition') && b.includes(c.claim_id));
    expect(blockingMatches.length).toBe(1);
  });

  it('GOOD: a normally-dispositioned claim (no accepting review) produces no layer-violation warning', () => {
    const c = claim('clm_bbbbbbbbbbbb_heuristic_1', '01-test');
    const rev = review(c.claim_id, 'needs_human_review');
    const disp = disposition(c.claim_id, 'parked_not_for_synthesis');
    const warnings: string[] = [];
    aggregate({
      research: research(['01-test']),
      perSection: new Map([
        ['01-test', {
          claims: [c],
          candidateClaims: [c],
          claimReviews: [rev],
          contradictions: [],
          dispositions: [disp],
          gate: gate('01-test'),
          findings: [],
          sourceIdsForSection: [],
        }],
      ]),
      sources: [],
      receipts: [],
      handoff: null,
      generatedAt: '2026-05-08T00:00:00.000Z',
      warnings,
    });
    expect(warnings.some((w) => w.includes('invalid disposition'))).toBe(false);
  });
});
