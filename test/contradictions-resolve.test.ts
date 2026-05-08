import { describe, it, expect } from 'vitest';
import { derive } from '../src/cowork/derive.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';
import type { Claim } from '../src/claims/schema.js';
import type { ClaimReview } from '../src/review/schema.js';
import type { SectionGateResult } from '../src/gates/schema.js';
import type { ContradictionResolution } from '../src/contradictions/resolution-schema.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function research() {
  return ResearchYamlSchema.parse({
    research_os_version: '0.1.0',
    created_at: '2026-05-06T22:00:00.000Z',
    topic: 'contradiction resolution ledger behaviour',
    sections: [{ id: '01-test', purpose: 'probe', max_time_minutes: 45, min_sources: 2, primary_sources_required: 1, contradictions_required: false, status: 'draft' }],
  });
}

function claim(): Claim {
  return {
    claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
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

function review(decision: ClaimReview['decision']): ClaimReview {
  return {
    claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
    decision,
    reason: 'test',
    finding_ids: [],
    reviewer: 'heuristic',
    review_method: 'heuristic_field_and_grounding_checks',
    created_at: '2026-05-06T22:00:01.000Z',
  };
}

function gate(): SectionGateResult {
  return {
    section_id: '01-test',
    verdict: 'pass',
    summary: 'mock',
    checked_at: '2026-05-06T22:00:00.000Z',
    synthesis_eligible: true,
    gate_results: [],
    failures: [],
    warnings: [],
    waivers_applied: [],
    blocking_reasons: [],
    claim_counts: { total: 1, candidate: 1, with_evidence_excerpt: 1, with_source_hashes: 1, with_scope: 1, with_not: 1, universal_scope_null: 0, orphans: 0 },
    source_counts: { total: 2, primary: 0, secondary: 2, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 2, failed_fetches: 0 },
    contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
    freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 0 },
    scope_integrity_summary: { universal_claims: 0, scoped_claims: 1, with_not_constraint: 1, overgen_risks_total: 0, overgen_risks_blocking: 0 },
    next_actions: [],
  };
}

const HIGH_SEVERITY_CONTRADICTION = {
  contradiction_id: 'cnt_111111111111_heuristic',
  section_id: '01-test',
  claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1', 'clm_bbbbbbbbbbbb_heuristic_1'] as [string, string],
  source_ids: ['src_aaaaaaaaaaaa'],
  type: 'direct_conflict' as const,
  summary: 'A vs B',
  scope_analysis: '',
  overlap_assessment: 'fully_overlapping' as const,
  severity: 'high' as const,
  confidence: 'high' as const,
  detector: 'heuristic' as const,
  detection_method: 'heuristic_similarity_negation',
  evidence: '',
  status: 'unresolved' as const,
  created_at: '2026-05-06T22:00:00.000Z',
};

function input(resolutions: ContradictionResolution[] = []) {
  return {
    research: research(),
    perSection: new Map([
      ['01-test', {
        gate: gate(),
        candidateClaims: [claim()],
        claimReviews: [review('accepted_for_synthesis')],
        contradictions: [HIGH_SEVERITY_CONTRADICTION],
        resolutions,
      }],
    ]),
    indexStatus: 'present' as const,
    generatedAt: '2026-05-06T22:00:00.000Z',
    warnings: [],
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('contradiction resolution ledger', () => {
  it('positive: unresolved high-severity contradiction (no ledger entry) blocks handoff', () => {
    const result = derive(input([]));
    expect(result.mode).toBe('human_review_required');
  });

  it('negative (resolved): resolution entry with status=resolved removes the block', () => {
    const resolution: ContradictionResolution = {
      contradiction_id: 'cnt_111111111111_heuristic',
      status: 'resolved',
      reason: 'definitional variation between sources',
      resolved_at: '2026-05-06T23:00:00.000Z',
      resolved_by: 'operator',
    };
    const result = derive(input([resolution]));
    expect(result.mode).not.toBe('human_review_required');
  });

  it('negative (preserved): resolution entry with status=preserved removes the block', () => {
    const resolution: ContradictionResolution = {
      contradiction_id: 'cnt_111111111111_heuristic',
      status: 'preserved',
      reason: 'genuine conflict to document in decision-brief',
      resolved_at: '2026-05-06T23:00:00.000Z',
      resolved_by: 'operator',
    };
    const result = derive(input([resolution]));
    expect(result.mode).not.toBe('human_review_required');
  });

  it('negative (rejected): resolution entry with status=rejected removes the block', () => {
    const resolution: ContradictionResolution = {
      contradiction_id: 'cnt_111111111111_heuristic',
      status: 'rejected',
      reason: 'false positive from detector',
      resolved_at: '2026-05-06T23:00:00.000Z',
      resolved_by: 'operator',
    };
    const result = derive(input([resolution]));
    expect(result.mode).not.toBe('human_review_required');
  });

  it('latest-wins: later resolved entry overrides earlier unresolved entry', () => {
    const resolutions: ContradictionResolution[] = [
      {
        contradiction_id: 'cnt_111111111111_heuristic',
        status: 'unresolved',
        reason: 'still investigating',
        resolved_at: '2026-05-06T22:30:00.000Z',
        resolved_by: 'operator',
      },
      {
        contradiction_id: 'cnt_111111111111_heuristic',
        status: 'resolved',
        reason: 'definitional variation confirmed after review',
        resolved_at: '2026-05-06T23:00:00.000Z',
        resolved_by: 'operator',
      },
    ];
    const result = derive(input(resolutions));
    expect(result.mode).not.toBe('human_review_required');
  });

  it('latest-wins: later unresolved entry overrides earlier resolved entry (re-opens block)', () => {
    const resolutions: ContradictionResolution[] = [
      {
        contradiction_id: 'cnt_111111111111_heuristic',
        status: 'resolved',
        reason: 'thought it was done',
        resolved_at: '2026-05-06T22:30:00.000Z',
        resolved_by: 'operator',
      },
      {
        contradiction_id: 'cnt_111111111111_heuristic',
        status: 'unresolved',
        reason: 'reopening for further review',
        resolved_at: '2026-05-06T23:00:00.000Z',
        resolved_by: 'operator',
      },
    ];
    const result = derive(input(resolutions));
    expect(result.mode).toBe('human_review_required');
  });
});
