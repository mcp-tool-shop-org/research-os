import { describe, it, expect } from 'vitest';
import { derive } from '../src/cowork/derive.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';
import type { Claim } from '../src/claims/schema.js';
import type { ClaimReview } from '../src/review/schema.js';
import type { SectionGateResult } from '../src/gates/schema.js';

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

  it('produces repair_required when zero claims accepted', () => {
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
    expect(result.mode).toBe('repair_required');
    expect(result.accepted_claim_ids).toEqual([]);
    expect(result.repair_claim_ids).toContain(c.claim_id);
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
});
