import { describe, it, expect } from 'vitest';
import { derive } from '../src/cowork/derive.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';
import type { Claim } from '../src/claims/schema.js';
import type { ClaimReview } from '../src/review/schema.js';
import type { SectionGateResult } from '../src/gates/schema.js';
import type { Contradiction } from '../src/contradictions/schema.js';
import type { ClaimSynthesisDisposition } from '../src/dispositions/schema.js';

function research(sectionIds: string[] = ['01-test']) {
  return ResearchYamlSchema.parse({
    research_os_version: '0.1.0',
    created_at: '2026-05-06T22:00:00.000Z',
    topic: 'How does the cowork handoff derive its mode and contract?',
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

function claim(id: string): Claim {
  return {
    claim_id: id,
    section_id: '01-test',
    source_ids: ['src_aaaaaaaaaaaa'],
    source_hashes: ['a'.repeat(64)],
    asserts: 'something',
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

function review(claimId: string, decision: ClaimReview['decision'], created_at = '2026-05-06T22:00:01.000Z'): ClaimReview {
  return {
    claim_id: claimId,
    decision,
    reason: `Test ${decision}`,
    finding_ids: [],
    reviewer: 'heuristic',
    review_method: 'heuristic_field_and_grounding_checks',
    created_at,
  };
}

function gate(synthesis_eligible: boolean, verdict = synthesis_eligible ? 'pass' : 'blocked'): SectionGateResult {
  return {
    section_id: '01-test',
    verdict: verdict as SectionGateResult['verdict'],
    summary: 'mock',
    checked_at: '2026-05-06T22:00:00.000Z',
    synthesis_eligible,
    gate_results: [],
    failures: synthesis_eligible
      ? []
      : [
          {
            family: 'source_floor',
            check: 'min_sources',
            status: 'fail',
            detail: 'not enough sources',
            evidence: [],
            blocks_synthesis: true,
          },
        ],
    warnings: [],
    waivers_applied: [],
    blocking_reasons: synthesis_eligible ? [] : ['source_floor.min_sources: not enough sources'],
    claim_counts: { total: 1, candidate: 1, with_evidence_excerpt: 1, with_source_hashes: 1, with_scope: 1, with_not: 1, universal_scope_null: 0, orphans: 0 },
    source_counts: { total: 1, primary: 0, secondary: 1, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 1, failed_fetches: 0 },
    contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
    freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 0 },
    scope_integrity_summary: { universal_claims: 0, scoped_claims: 1, with_not_constraint: 1, overgen_risks_total: 0, overgen_risks_blocking: 0 },
    next_actions: [],
  };
}

describe('cowork.derive', () => {
  it('produces repair_required when gate is blocked', () => {
    const r = research();
    const c = claim('clm_aaaaaaaaaaaa_heuristic_1');
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: gate(false), candidateClaims: [c], claimReviews: [review(c.claim_id, 'needs_source_repair')], contradictions: [] }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.mode).toBe('repair_required');
    expect(result.synthesis_allowed).toBe(false);
  });

  it('produces synthesis_ready when gate passes even if zero claims accepted (calibrated-reviewer settled decisions do not gate mode)', () => {
    const r = research();
    const c = claim('clm_aaaaaaaaaaaa_heuristic_1');
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: gate(true), candidateClaims: [c], claimReviews: [review(c.claim_id, 'needs_scope_repair')], contradictions: [] }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.mode).toBe('synthesis_ready');
    expect(result.accepted_claim_ids).toEqual([]);
    expect(result.repair_claim_ids).toContain(c.claim_id); // informational, not a gate
  });

  it('produces synthesis_ready when gates pass and every candidate is accepted', () => {
    const r = research();
    const c = claim('clm_aaaaaaaaaaaa_heuristic_1');
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: gate(true), candidateClaims: [c], claimReviews: [review(c.claim_id, 'accepted_for_synthesis')], contradictions: [] }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.mode).toBe('synthesis_ready');
    expect(result.synthesis_allowed).toBe(true);
    expect(result.accepted_claim_ids).toContain(c.claim_id);
  });

  it('produces human_review_required for unresolved blocking contradictions', () => {
    const r = research();
    const c = claim('clm_aaaaaaaaaaaa_heuristic_1');
    const contradiction = {
      contradiction_id: 'cnt_111111111111_heuristic',
      section_id: '01-test',
      claim_ids: [c.claim_id, 'clm_bbbbbbbbbbbb_heuristic_1'],
      source_ids: ['src_aaaaaaaaaaaa'],
      type: 'direct_conflict' as const,
      summary: 'A vs B',
      scope_analysis: '',
      overlap_assessment: 'fully_overlapping' as const,
      severity: 'blocking' as const,
      confidence: 'high' as const,
      detector: 'heuristic' as const,
      detection_method: 'm',
      evidence: '',
      status: 'unresolved' as const,
      created_at: '2026-05-06T22:00:00.000Z',
    };
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: gate(true), candidateClaims: [c], claimReviews: [review(c.claim_id, 'accepted_for_synthesis')], contradictions: [contradiction] }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.mode).toBe('human_review_required');
  });

  it('produces human_review_required when a granted waiver lacks reason or compensating_controls', () => {
    const r = research();
    r.primary_source_waiver = { status: 'granted', reason: '', compensating_controls: [] };
    const c = claim('clm_aaaaaaaaaaaa_heuristic_1');
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: gate(true), candidateClaims: [c], claimReviews: [review(c.claim_id, 'accepted_for_synthesis')], contradictions: [] }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.mode).toBe('human_review_required');
  });

  it('produces human_review_required when warnings indicate malformed artifacts', () => {
    const r = research();
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: null, candidateClaims: [], claimReviews: [], contradictions: [] }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: ['malformed line in sections/01-test/claims.jsonl: zod validation failed'],
    });
    expect(result.mode).toBe('human_review_required');
  });

  it('latest review decision wins per claim', () => {
    const r = research();
    const c = claim('clm_aaaaaaaaaaaa_heuristic_1');
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', {
          gate: gate(true),
          candidateClaims: [c],
          claimReviews: [
            review(c.claim_id, 'needs_source_repair', '2026-05-06T22:00:01.000Z'),
            review(c.claim_id, 'accepted_for_synthesis', '2026-05-06T22:00:02.000Z'),
          ],
          contradictions: [],
        }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.accepted_claim_ids).toContain(c.claim_id);
    expect(result.repair_claim_ids).not.toContain(c.claim_id);
  });

  it('lists rejected claims separately from repair claims', () => {
    const r = research();
    const ca = claim('clm_aaaaaaaaaaaa_heuristic_1');
    const cb = { ...claim('clm_bbbbbbbbbbbb_heuristic_1'), claim_id: 'clm_bbbbbbbbbbbb_heuristic_1' };
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', {
          gate: gate(false),
          candidateClaims: [ca, cb],
          claimReviews: [
            review(ca.claim_id, 'rejected'),
            review(cb.claim_id, 'needs_scope_repair'),
          ],
          contradictions: [],
        }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.blocked_claim_ids).toEqual([ca.claim_id]);
    expect(result.repair_claim_ids).toEqual([cb.claim_id]);
  });

  it('repair-mode allowed_write_paths exclude synthesis directories', () => {
    const r = research();
    const c = claim('clm_aaaaaaaaaaaa_heuristic_1');
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: gate(false), candidateClaims: [c], claimReviews: [review(c.claim_id, 'needs_source_repair')], contradictions: [] }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.allowed_write_paths.some((p) => p.startsWith('synthesis/'))).toBe(false);
    expect(result.allowed_write_paths.some((p) => p.startsWith('handoffs/'))).toBe(true);
  });

  it('synthesis-mode allowed_write_paths include synthesis directories', () => {
    const r = research();
    const c = claim('clm_aaaaaaaaaaaa_heuristic_1');
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: gate(true), candidateClaims: [c], claimReviews: [review(c.claim_id, 'accepted_for_synthesis')], contradictions: [] }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.allowed_write_paths.some((p) => p.startsWith('synthesis/'))).toBe(true);
  });

  it('forbidden_actions are present in every mode', () => {
    const r = research();
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: null, candidateClaims: [], claimReviews: [], contradictions: [] }],
      ]),
      indexStatus: 'missing',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.forbidden_actions.length).toBeGreaterThan(0);
    expect(result.forbidden_actions.some((a) => /claims\.jsonl/i.test(a))).toBe(true);
  });

  // ── Required new tests: corrected readiness predicates ──────────────────────

  function claimN(n: number, sectionId = '01-test'): Claim {
    const hex = n.toString(16).padStart(12, '0');
    return {
      claim_id: `clm_${hex}_heuristic_${n}`,
      section_id: sectionId,
      source_ids: ['src_aaaaaaaaaaaa'],
      source_hashes: ['a'.repeat(64)],
      asserts: `claim ${n}`,
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

  function reviewN(n: number, decision: ClaimReview['decision'], ts?: string): ClaimReview {
    const hex = n.toString(16).padStart(12, '0');
    return {
      claim_id: `clm_${hex}_heuristic_${n}`,
      decision,
      reason: `test ${decision}`,
      finding_ids: [],
      reviewer: 'heuristic',
      review_method: 'heuristic_field_and_grounding_checks',
      created_at: ts ?? '2026-05-06T22:00:01.000Z',
    };
  }

  function dispositionN(
    n: number,
    status: ClaimSynthesisDisposition['status'] = 'parked_not_for_synthesis',
    sectionId = '01-test',
  ): ClaimSynthesisDisposition {
    const hex = n.toString(16).padStart(12, '0');
    return {
      claim_id: `clm_${hex}_heuristic_${n}`,
      section_id: sectionId,
      status,
      reason: 'test disposition',
      decided_by: 'operator',
      authorized_by: 'operator',
      source: 'test',
      created_at: '2026-05-06T22:00:02.000Z',
    };
  }

  function contradiction(id: string, severity: Contradiction['severity'] = 'medium'): Contradiction {
    return {
      contradiction_id: `cnt_${id.padEnd(12, '0')}_heuristic`,
      section_id: '01-test',
      claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1', 'clm_aaaaaaaaaaaa_heuristic_2'],
      source_ids: ['src_aaaaaaaaaaaa'],
      type: 'direct_conflict',
      summary: 'A vs B',
      scope_analysis: '',
      overlap_assessment: 'fully_overlapping',
      severity,
      confidence: 'medium',
      detector: 'heuristic',
      detection_method: 'heuristic_similarity_negation',
      evidence: '',
      status: 'unresolved',
      created_at: '2026-05-06T22:00:00.000Z',
    };
  }

  function passingGate(sectionId = '01-test'): SectionGateResult {
    return {
      section_id: sectionId,
      verdict: 'warn',
      summary: 'mock',
      checked_at: '2026-05-06T22:00:00.000Z',
      synthesis_eligible: true,
      gate_results: [],
      failures: [],
      warnings: [],
      waivers_applied: [],
      blocking_reasons: [],
      claim_counts: { total: 5, candidate: 5, with_evidence_excerpt: 5, with_source_hashes: 5, with_scope: 5, with_not: 5, universal_scope_null: 0, orphans: 0 },
      source_counts: { total: 2, primary: 0, secondary: 2, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 2, failed_fetches: 0 },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 0 },
      scope_integrity_summary: { universal_claims: 0, scoped_claims: 5, with_not_constraint: 5, overgen_risks_total: 0, overgen_risks_blocking: 0 },
      next_actions: [],
    };
  }

  it('T1: overproduction-baseline — rejected and triage-parked do not block synthesis', () => {
    const r = research();
    const claims = Array.from({ length: 100 }, (_, i) => claimN(i + 1));
    const reviews: ClaimReview[] = [
      ...Array.from({ length: 5 }, (_, i) => reviewN(i + 1, 'accepted_for_synthesis')),
      ...Array.from({ length: 20 }, (_, i) => reviewN(i + 6, 'rejected')),
      ...Array.from({ length: 5 }, (_, i) => reviewN(i + 26, 'needs_human_review')),
      // claims 31-100 have no review (triage-parked)
    ];
    const dispositions: ClaimSynthesisDisposition[] = Array.from({ length: 5 }, (_, i) =>
      dispositionN(i + 26, 'parked_not_for_synthesis'),
    );
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: passingGate(), candidateClaims: claims, claimReviews: reviews, contradictions: [], dispositions }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.mode).toBe('synthesis_ready');
    expect(result.synthesis_allowed).toBe(true);
    expect(result.sections[0]!.provenance_summary?.accepted_count).toBe(5);
    expect(result.sections[0]!.provenance_summary?.rejected_count).toBe(20);
    expect(result.sections[0]!.provenance_summary?.triage_parked_count).toBe(70);
    expect(result.sections[0]!.provenance_summary?.dispositioned_count).toBe(5);
    expect(result.sections[0]!.provenance_summary?.active_repair_blockers).toBe(0);
  });

  it('T2: calibrated-reviewer needs_human_review without disposition is settled state — does not gate synthesis when active_blockers is empty', () => {
    const r = research();
    const claims = Array.from({ length: 100 }, (_, i) => claimN(i + 1));
    const reviews: ClaimReview[] = [
      ...Array.from({ length: 5 }, (_, i) => reviewN(i + 1, 'accepted_for_synthesis')),
      ...Array.from({ length: 20 }, (_, i) => reviewN(i + 6, 'rejected')),
      ...Array.from({ length: 5 }, (_, i) => reviewN(i + 26, 'needs_human_review')),
    ];
    // 4 of the 5 needs_human_review are dispositioned; 1 is undispositioned (n=30)
    const dispositions: ClaimSynthesisDisposition[] = Array.from({ length: 4 }, (_, i) =>
      dispositionN(i + 26, 'parked_not_for_synthesis'),
    );
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: passingGate(), candidateClaims: claims, claimReviews: reviews, contradictions: [], dispositions }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    // Gate is passing (synthesis_eligible=true, active_blockers=[]) — reviewer decisions are settled state
    expect(result.mode).toBe('synthesis_ready');
    expect(result.synthesis_allowed).toBe(true);
    expect(result.sections[0]!.active_blockers).toEqual([]);
    expect(result.sections[0]!.provenance_summary?.active_repair_blockers).toBeGreaterThanOrEqual(1); // informational
    expect(result.repair_claim_ids.length).toBeGreaterThanOrEqual(1); // informational
  });

  it('T3: rejected claims with provenance do not block synthesis', () => {
    const r = research();
    const claims = Array.from({ length: 35 }, (_, i) => claimN(i + 1));
    const reviews: ClaimReview[] = [
      ...Array.from({ length: 5 }, (_, i) => reviewN(i + 1, 'accepted_for_synthesis')),
      ...Array.from({ length: 30 }, (_, i) => reviewN(i + 6, 'rejected')),
    ];
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: passingGate(), candidateClaims: claims, claimReviews: reviews, contradictions: [] }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.mode).toBe('synthesis_ready');
    expect(result.sections[0]!.provenance_summary?.rejected_count).toBe(30);
    expect(result.sections[0]!.provenance_summary?.active_repair_blockers).toBe(0);
  });

  it('T4: unreviewed candidates do not block synthesis', () => {
    const r = research();
    const claims = Array.from({ length: 205 }, (_, i) => claimN(i + 1));
    const reviews: ClaimReview[] = Array.from({ length: 5 }, (_, i) =>
      reviewN(i + 1, 'accepted_for_synthesis'),
    );
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: passingGate(), candidateClaims: claims, claimReviews: reviews, contradictions: [] }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.mode).toBe('synthesis_ready');
    expect(result.sections[0]!.provenance_summary?.triage_parked_count).toBe(200);
    expect(result.sections[0]!.provenance_summary?.active_repair_blockers).toBe(0);
  });

  it('T5: dispositioned claims surface correctly in provenance_summary', () => {
    const r = research();
    const claims = Array.from({ length: 10 }, (_, i) => claimN(i + 1));
    const reviews: ClaimReview[] = [
      reviewN(1, 'accepted_for_synthesis'),
      reviewN(2, 'needs_human_review'),
      reviewN(3, 'needs_human_review'),
      reviewN(4, 'needs_scope_repair'),
    ];
    const dispositions: ClaimSynthesisDisposition[] = [
      dispositionN(2, 'parked_not_for_synthesis'),
      dispositionN(3, 'preserved_for_human_note'),
      dispositionN(4, 'needs_human_review_excluded'),
    ];
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: passingGate(), candidateClaims: claims, claimReviews: reviews, contradictions: [], dispositions }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    const ps = result.sections[0]!.provenance_summary!;
    expect(ps.dispositioned_count).toBe(3);
    expect(ps.dispositioned_breakdown.parked_not_for_synthesis).toBe(1);
    expect(ps.dispositioned_breakdown.preserved_for_human_note).toBe(1);
    expect(ps.dispositioned_breakdown.needs_human_review_excluded).toBe(1);
    expect(ps.dispositioned_breakdown.out_of_bounds_regression_fixture).toBe(0);
    expect(ps.active_repair_blockers).toBe(0);
  });

  it('T6: active unresolved contradiction blocks synthesis (non-high severity)', () => {
    const r = research();
    const claims = Array.from({ length: 5 }, (_, i) => claimN(i + 1));
    const reviews: ClaimReview[] = Array.from({ length: 5 }, (_, i) =>
      reviewN(i + 1, 'accepted_for_synthesis'),
    );
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', {
          gate: passingGate(),
          candidateClaims: claims,
          claimReviews: reviews,
          contradictions: [contradiction('abc123', 'medium')],
        }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.mode).toBe('repair_required');
    expect(result.synthesis_allowed).toBe(false);
    expect(result.sections[0]!.provenance_summary?.active_unresolved_contradictions).toBe(1);
    expect(result.recommended_next_actions.some((a) => /contradiction/i.test(a))).toBe(true);
  });

  it('T7: needs_scope_repair is settled state — visible in repair_claim_ids but does not gate synthesis when gate is passing', () => {
    const r = research();
    const claims = Array.from({ length: 6 }, (_, i) => claimN(i + 1));
    const reviews: ClaimReview[] = [
      ...Array.from({ length: 5 }, (_, i) => reviewN(i + 1, 'accepted_for_synthesis')),
      reviewN(6, 'needs_scope_repair'),
    ];
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: passingGate(), candidateClaims: claims, claimReviews: reviews, contradictions: [] }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    // Gate is passing — needs_scope_repair is the reviewer's settled decision, not an open blocker
    expect(result.mode).toBe('synthesis_ready');
    expect(result.sections[0]!.active_blockers).toEqual([]);
    expect(result.repair_claim_ids).toContain('clm_000000000006_heuristic_6'); // informational
    expect(result.sections[0]!.provenance_summary?.active_repair_blockers).toBe(1); // informational
  });

  it('T8: provenance_summary present on every required section in handoff payload', () => {
    const r = research(['01-test', '02-prod']);
    const c1 = claimN(1);
    const c2 = { ...claimN(1), claim_id: 'clm_000000000002_heuristic_1', section_id: '02-prod' };
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: passingGate('01-test'), candidateClaims: [c1], claimReviews: [reviewN(1, 'accepted_for_synthesis')], contradictions: [] }],
        ['02-prod', { gate: passingGate('02-prod'), candidateClaims: [c2], claimReviews: [{ ...reviewN(1, 'accepted_for_synthesis'), claim_id: 'clm_000000000002_heuristic_1' }], contradictions: [] }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    for (const s of result.sections) {
      expect(s.provenance_summary).toBeDefined();
      const ps = s.provenance_summary!;
      expect(typeof ps.accepted_count).toBe('number');
      expect(typeof ps.rejected_count).toBe('number');
      expect(typeof ps.triage_parked_count).toBe('number');
      expect(typeof ps.needs_review_undispositioned_count).toBe('number');
      expect(typeof ps.dispositioned_count).toBe('number');
      expect(typeof ps.active_repair_blockers).toBe('number');
      expect(typeof ps.active_unresolved_contradictions).toBe('number');
      expect(Array.isArray(ps.waivers_active)).toBe(true);
      expect(typeof ps.overrides_applied_count).toBe('number');
    }
  });

  it('P2-fix-1: calibrated reviewer with non-empty repair_claim_ids and empty active_blockers → synthesis_ready', () => {
    // Core regression for Pattern 2 fix. Simulates ComfyUI-style pack: hermes3:8b two-pass
    // reviewer produced needs_scope_repair / needs_source_repair / needs_human_review decisions,
    // none dispositioned. Gate says synthesis_eligible=true. No unresolved contradictions.
    // These review decisions are settled state, not open work — synthesis must not be blocked.
    const r = research();
    const claims = Array.from({ length: 8 }, (_, i) => claimN(i + 1));
    const reviews: ClaimReview[] = [
      ...Array.from({ length: 3 }, (_, i) => reviewN(i + 1, 'accepted_for_synthesis')),
      reviewN(4, 'needs_scope_repair'),
      reviewN(5, 'needs_scope_repair'),
      reviewN(6, 'needs_source_repair'),
      reviewN(7, 'needs_human_review'),
      reviewN(8, 'needs_human_review'),
    ];
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: passingGate(), candidateClaims: claims, claimReviews: reviews, contradictions: [] }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.mode).toBe('synthesis_ready');
    expect(result.synthesis_allowed).toBe(true);
    expect(result.sections[0]!.active_blockers).toEqual([]);
    expect(result.repair_claim_ids.length).toBe(5); // visible but not a gate
    expect(result.sections[0]!.provenance_summary?.active_repair_blockers).toBe(5); // informational
    expect(result.accepted_claim_ids.length).toBe(3);
  });

  it('P2-fix-2: gate-blocked section has non-empty active_blockers → repair_required', () => {
    // Active blockers are gate-level blocking reasons (synthesis_eligible=false); repair
    // vocabulary decisions are NOT active_blockers and do not appear here.
    const r = research();
    const c = claimN(1);
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: gate(false), candidateClaims: [c], claimReviews: [review(c.claim_id, 'accepted_for_synthesis')], contradictions: [] }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.mode).toBe('repair_required');
    expect(result.sections[0]!.active_blockers.length).toBeGreaterThan(0);
    expect(result.sections[0]!.synthesis_eligible).toBe(false);
  });

  it('P2-fix-3: heuristic-reviewer regression — only accepted/rejected vocabulary, no repair → synthesis_ready', () => {
    // Protects v0.1 dogfood pack: heuristic reviewer only outputs accepted_for_synthesis
    // and rejected. repair_claim_ids = []. Under the new predicate this must still produce
    // synthesis_ready (no regression from the pre-calibrated-reviewer baseline).
    const r = research();
    const claims = Array.from({ length: 10 }, (_, i) => claimN(i + 1));
    const reviews: ClaimReview[] = [
      ...Array.from({ length: 3 }, (_, i) => reviewN(i + 1, 'accepted_for_synthesis')),
      ...Array.from({ length: 7 }, (_, i) => reviewN(i + 4, 'rejected')),
    ];
    const result = derive({
      research: r,
      perSection: new Map([
        ['01-test', { gate: passingGate(), candidateClaims: claims, claimReviews: reviews, contradictions: [] }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.mode).toBe('synthesis_ready');
    expect(result.repair_claim_ids).toHaveLength(0);
    expect(result.sections[0]!.active_blockers).toEqual([]);
  });

  it('T9: sections 03 + 06 shaped — both synthesis_eligible=true with zero active blockers yield synthesis_ready', () => {
    const r = research(['03-source-and-claim-truth', '06-repo-knowledge-integration']);
    const make = (sectionId: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        ...claimN(i + 1),
        claim_id: `clm_${(i + 1).toString(16).padStart(12, '0')}_heuristic_${i + 1}`,
        section_id: sectionId,
      }));
    const makeReviews = (n: number) =>
      Array.from({ length: n }, (_, i) => reviewN(i + 1, 'accepted_for_synthesis'));
    const result = derive({
      research: r,
      perSection: new Map([
        ['03-source-and-claim-truth', {
          gate: passingGate('03-source-and-claim-truth'),
          candidateClaims: make('03-source-and-claim-truth', 42),
          claimReviews: makeReviews(42),
          contradictions: [],
        }],
        ['06-repo-knowledge-integration', {
          gate: passingGate('06-repo-knowledge-integration'),
          candidateClaims: make('06-repo-knowledge-integration', 21),
          claimReviews: makeReviews(21),
          contradictions: [],
        }],
      ]),
      indexStatus: 'present',
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.mode).toBe('synthesis_ready');
    for (const s of result.sections) {
      expect(s.synthesis_eligible).toBe(true);
      expect(s.provenance_summary?.active_repair_blockers).toBe(0);
      expect(s.provenance_summary?.active_unresolved_contradictions).toBe(0);
    }
  });
});
