import { describe, it, expect } from 'vitest';
import { aggregate } from '../src/audit/aggregate.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';
import { CoworkHandoffPayloadSchema } from '../src/cowork/schema.js';
import type { Claim } from '../src/claims/schema.js';
import type { ClaimReview, ReviewFinding } from '../src/review/schema.js';
import type { Contradiction } from '../src/contradictions/schema.js';
import type { FetchReceipt, SourceCard } from '../src/sources/schema.js';
import type { SectionGateResult } from '../src/gates/schema.js';

function research(sectionIds: string[] = ['01-test']) {
  return ResearchYamlSchema.parse({
    research_os_version: '0.1.0',
    created_at: '2026-05-06T22:00:00.000Z',
    topic: 'How does the pack audit aggregate everything correctly?',
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

function claim(id: string, sectionId: string, opts: Partial<Claim> = {}): Claim {
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
    ...opts,
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

function source(id: string, publisher: string, opts: Partial<SourceCard> = {}): SourceCard {
  return {
    source_id: id,
    receipt_id: `rcpt_${id.replace(/^src_/, '')}_1`,
    section_id: '01-test',
    url: 'https://example.com',
    final_url: 'https://example.com',
    fetched_at: '2026-05-06T22:00:00.000Z',
    publisher,
    published_at: null,
    title: 't',
    source_type: 'secondary',
    relevance: 'unknown',
    key_points: [],
    limitations: [],
    asserts: 'a',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-06T22:00:00.000Z',
    ...opts,
  };
}

function receipt(source_id: string, opts: Partial<FetchReceipt> = {}): FetchReceipt {
  return {
    receipt_id: `rcpt_${source_id.replace(/^src_/, '')}_1`,
    source_id,
    section_id: '01-test',
    requested_url: 'https://example.com',
    final_url: 'https://example.com',
    status: 200,
    status_text: 'OK',
    content_type: 'text/html',
    fetched_at: '2026-05-06T22:00:00.000Z',
    byte_count: 100,
    sha256: 'a'.repeat(64),
    title: 't',
    raw_text_path: null,
    fetch_outcome: 'ok',
    fetch_error: null,
    extraction_outcome: 'ok',
    extraction_extractor: 'heuristic',
    extraction_error: null,
    ...opts,
  };
}

function gate(section_id: string, eligible: boolean): SectionGateResult {
  return {
    section_id,
    verdict: eligible ? 'pass' : 'blocked',
    summary: 'mock',
    checked_at: '2026-05-06T22:00:00.000Z',
    synthesis_eligible: eligible,
    gate_results: [],
    failures: eligible ? [] : [{ family: 'source_floor', check: 'min_sources', status: 'fail', detail: 'too few', evidence: [], blocks_synthesis: true }],
    warnings: [],
    waivers_applied: [],
    blocking_reasons: eligible ? [] : ['source_floor.min_sources: too few'],
    claim_counts: { total: 0, candidate: 0, with_evidence_excerpt: 0, with_source_hashes: 0, with_scope: 0, with_not: 0, universal_scope_null: 0, orphans: 0 },
    source_counts: { total: 1, primary: 0, secondary: 1, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 1, failed_fetches: 0 },
    contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
    freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 0 },
    scope_integrity_summary: { universal_claims: 0, scoped_claims: 0, with_not_constraint: 0, overgen_risks_total: 0, overgen_risks_blocking: 0 },
    next_actions: [],
  };
}

function makeHandoff(mode: 'repair_required' | 'synthesis_ready' | 'human_review_required') {
  return CoworkHandoffPayloadSchema.parse({
    pack_id: 'abcdef012345',
    pack_topic: 'topic',
    generated_at: '2026-05-06T22:00:00.000Z',
    mode,
    synthesis_allowed: mode === 'synthesis_ready',
    summary: 'mock',
    sections: [],
    accepted_claim_ids: [],
    repair_claim_ids: [],
    blocked_claim_ids: [],
    unresolved_contradiction_ids: [],
    waivers: [],
    gate_verdicts: [],
    review_decisions: [],
    recommended_next_actions: [],
    allowed_write_paths: [],
    forbidden_actions: [],
    index_status: 'present',
    warnings: [],
  });
}

describe('audit.aggregate', () => {
  it('produces blocked verdict when no sections have been gated', () => {
    const r = research(['01-test', '02-test']);
    const result = aggregate({
      research: r,
      perSection: new Map([
        ['01-test', { claims: [], candidateClaims: [], claimReviews: [], contradictions: [], gate: null, findings: [], sourceIdsForSection: [] }],
        ['02-test', { claims: [], candidateClaims: [], claimReviews: [], contradictions: [], gate: null, findings: [], sourceIdsForSection: [] }],
      ]),
      sources: [],
      receipts: [],
      handoff: null,
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.payload.verdict).toBe('blocked');
    expect(result.payload.synthesis_allowed).toBe(false);
  });

  it('produces repair_required when at least one section is gate-blocked and others are unrun', () => {
    const r = research(['01-test', '02-test']);
    const result = aggregate({
      research: r,
      perSection: new Map([
        ['01-test', { claims: [], candidateClaims: [], claimReviews: [], contradictions: [], gate: gate('01-test', false), findings: [], sourceIdsForSection: ['src_aaaaaaaaaaaa'] }],
        ['02-test', { claims: [], candidateClaims: [], claimReviews: [], contradictions: [], gate: null, findings: [], sourceIdsForSection: [] }],
      ]),
      sources: [source('src_aaaaaaaaaaaa', 'p1')],
      receipts: [receipt('src_aaaaaaaaaaaa')],
      handoff: makeHandoff('repair_required'),
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.payload.verdict).toBe('repair_required');
    expect(result.payload.blocking_reasons.some((r) => r.includes('01-test'))).toBe(true);
  });

  it('produces ready_for_synthesis only when all sections are fully ready', () => {
    const r = research(['01-test']);
    const c = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test');
    const result = aggregate({
      research: r,
      perSection: new Map([
        ['01-test', { claims: [c], candidateClaims: [c], claimReviews: [review(c.claim_id, 'accepted_for_synthesis')], contradictions: [], gate: gate('01-test', true), findings: [], sourceIdsForSection: ['src_aaaaaaaaaaaa'] }],
      ]),
      sources: [source('src_aaaaaaaaaaaa', 'p1')],
      receipts: [receipt('src_aaaaaaaaaaaa')],
      handoff: makeHandoff('synthesis_ready'),
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.payload.verdict).toBe('ready_for_synthesis');
    expect(result.payload.synthesis_allowed).toBe(true);
  });

  it('produces human_review_required when an unresolved blocking contradiction exists', () => {
    const r = research(['01-test']);
    const c = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test');
    const contradiction: Contradiction = {
      contradiction_id: 'cnt_111111111111_heuristic',
      section_id: '01-test',
      claim_ids: [c.claim_id, 'clm_bbbbbbbbbbbb_heuristic_1'],
      source_ids: ['src_aaaaaaaaaaaa'],
      type: 'direct_conflict',
      summary: '',
      scope_analysis: '',
      overlap_assessment: 'fully_overlapping',
      severity: 'blocking',
      confidence: 'high',
      detector: 'heuristic',
      detection_method: 'm',
      evidence: '',
      status: 'unresolved',
      created_at: '2026-05-06T22:00:00.000Z',
    };
    const result = aggregate({
      research: r,
      perSection: new Map([
        ['01-test', { claims: [c], candidateClaims: [c], claimReviews: [review(c.claim_id, 'accepted_for_synthesis')], contradictions: [contradiction], gate: gate('01-test', true), findings: [], sourceIdsForSection: ['src_aaaaaaaaaaaa'] }],
      ]),
      sources: [source('src_aaaaaaaaaaaa', 'p1')],
      receipts: [receipt('src_aaaaaaaaaaaa')],
      handoff: makeHandoff('synthesis_ready'),
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.payload.verdict).toBe('human_review_required');
    expect(result.unresolvedContradictions.some((c) => c.severity === 'blocking')).toBe(true);
  });

  it('detects orphan claims via missing source card', () => {
    const r = research(['01-test']);
    const c = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test', { source_ids: ['src_zzzzzzzzzzzz'] });
    const result = aggregate({
      research: r,
      perSection: new Map([
        ['01-test', { claims: [c], candidateClaims: [c], claimReviews: [], contradictions: [], gate: null, findings: [], sourceIdsForSection: [] }],
      ]),
      sources: [],
      receipts: [],
      handoff: null,
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.orphanClaims.some((o) => o.reason === 'missing_source_card')).toBe(true);
  });

  it('detects weak source: section publisher monopoly', () => {
    const r = research(['01-test']);
    const c = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test');
    const result = aggregate({
      research: r,
      perSection: new Map([
        ['01-test', { claims: [c], candidateClaims: [c], claimReviews: [], contradictions: [], gate: gate('01-test', false), findings: [], sourceIdsForSection: ['src_aaaaaaaaaaaa', 'src_bbbbbbbbbbbb'] }],
      ]),
      sources: [source('src_aaaaaaaaaaaa', 'sqlite.org'), source('src_bbbbbbbbbbbb', 'sqlite.org', { source_id: 'src_bbbbbbbbbbbb' })],
      receipts: [receipt('src_aaaaaaaaaaaa'), receipt('src_bbbbbbbbbbbb')],
      handoff: makeHandoff('repair_required'),
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.weakSources.some((w) => w.reason === 'source_cluster_monopoly')).toBe(true);
  });

  it('detects missing-not constraint flagged by review findings as scope-widening risk', () => {
    const r = research(['01-test']);
    const c = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test');
    const finding: ReviewFinding = {
      finding_id: 'fnd_abcdef012345',
      section_id: '01-test',
      claim_ids: [c.claim_id],
      source_ids: ['src_aaaaaaaaaaaa'],
      category: 'missing_not_constraint',
      severity: 'info',
      summary: 'no not',
      evidence: '',
      required_action: 'add a not',
      reviewer: 'heuristic',
      review_method: 'heuristic_field_and_grounding_checks',
      confidence: 'low',
      created_at: '2026-05-06T22:00:00.000Z',
    };
    const result = aggregate({
      research: r,
      perSection: new Map([
        ['01-test', { claims: [c], candidateClaims: [c], claimReviews: [], contradictions: [], gate: null, findings: [finding], sourceIdsForSection: ['src_aaaaaaaaaaaa'] }],
      ]),
      sources: [source('src_aaaaaaaaaaaa', 'p1')],
      receipts: [receipt('src_aaaaaaaaaaaa')],
      handoff: null,
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.scopeWideningRisks.some((r) => r.reason === 'missing_not_flagged')).toBe(true);
  });

  it('detects scope_null_in_use for substantive null-scope claims', () => {
    const r = research(['01-test']);
    const c = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test', { scope: null });
    const result = aggregate({
      research: r,
      perSection: new Map([
        ['01-test', { claims: [c], candidateClaims: [c], claimReviews: [], contradictions: [], gate: null, findings: [], sourceIdsForSection: ['src_aaaaaaaaaaaa'] }],
      ]),
      sources: [source('src_aaaaaaaaaaaa', 'p1')],
      receipts: [receipt('src_aaaaaaaaaaaa')],
      handoff: null,
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.scopeWideningRisks.some((r) => r.reason === 'scope_null_in_use')).toBe(true);
  });

  it('detects source_has_no_sources diversity gap', () => {
    const r = research(['01-test', '02-test']);
    const result = aggregate({
      research: r,
      perSection: new Map([
        ['01-test', { claims: [], candidateClaims: [], claimReviews: [], contradictions: [], gate: null, findings: [], sourceIdsForSection: [] }],
        ['02-test', { claims: [], candidateClaims: [], claimReviews: [], contradictions: [], gate: null, findings: [], sourceIdsForSection: [] }],
      ]),
      sources: [],
      receipts: [],
      handoff: null,
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.sourceDiversityGaps.filter((g) => g.reason === 'section_has_no_sources').length).toBe(2);
  });

  it('flags malformed warnings into human_review_required verdict', () => {
    const r = research(['01-test']);
    const result = aggregate({
      research: r,
      perSection: new Map([
        ['01-test', { claims: [], candidateClaims: [], claimReviews: [], contradictions: [], gate: gate('01-test', true), findings: [], sourceIdsForSection: [] }],
      ]),
      sources: [],
      receipts: [],
      handoff: null,
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: ['malformed line in claims.jsonl'],
    });
    expect(result.payload.verdict).toBe('human_review_required');
  });

  it('flags invalid waivers into human_review_required verdict', () => {
    const r = research(['01-test']);
    r.primary_source_waiver = { status: 'granted', reason: '', compensating_controls: [] };
    const c = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test');
    const result = aggregate({
      research: r,
      perSection: new Map([
        ['01-test', { claims: [c], candidateClaims: [c], claimReviews: [review(c.claim_id, 'accepted_for_synthesis')], contradictions: [], gate: gate('01-test', true), findings: [], sourceIdsForSection: ['src_aaaaaaaaaaaa'] }],
      ]),
      sources: [source('src_aaaaaaaaaaaa', 'p1')],
      receipts: [receipt('src_aaaaaaaaaaaa')],
      handoff: null,
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.payload.verdict).toBe('human_review_required');
    expect(result.payload.waiver_summary.invalid).toBe(1);
  });

  it('lists all 16 expected audit files', () => {
    const r = research(['01-test']);
    const result = aggregate({
      research: r,
      perSection: new Map([
        ['01-test', { claims: [], candidateClaims: [], claimReviews: [], contradictions: [], gate: null, findings: [], sourceIdsForSection: [] }],
      ]),
      sources: [],
      receipts: [],
      handoff: null,
      generatedAt: '2026-05-06T22:00:00.000Z',
      warnings: [],
    });
    expect(result.payload.audit_files).toHaveLength(16);
    expect(result.payload.audit_files).toContain('audits/pack-audit.json');
    expect(result.payload.audit_files).toContain('audits/synthesis-readiness.md');
  });
});
