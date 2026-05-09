import { describe, it, expect } from 'vitest';
import { aggregate } from '../src/audit/aggregate.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';
import { CoworkHandoffPayloadSchema } from '../src/cowork/schema.js';
import { renderDecisionBrief, renderWorkingReport } from '../src/synth/markdown.js';
import type { Claim } from '../src/claims/schema.js';
import type { ClaimReview, ReviewFinding } from '../src/review/schema.js';
import type { Contradiction } from '../src/contradictions/schema.js';
import type { ContradictionResolution } from '../src/contradictions/resolution-schema.js';
import type { ClaimSynthesisDisposition } from '../src/dispositions/schema.js';
import type { FetchReceipt, SourceCard } from '../src/sources/schema.js';
import type { SectionGateResult } from '../src/gates/schema.js';
import type { CrossSectionMap } from '../src/synth/types.js';

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

function repairReview(claim_id: string): ClaimReview {
  return {
    claim_id,
    decision: 'needs_human_review',
    reason: 'repair needed',
    finding_ids: [],
    reviewer: 'heuristic',
    review_method: 'heuristic_field_and_grounding_checks',
    created_at: '2026-05-08T00:00:00.000Z',
  };
}

function testDisposition(claim_id: string, status: ClaimSynthesisDisposition['status']): ClaimSynthesisDisposition {
  return {
    claim_id,
    section_id: '01-test',
    status,
    reason: 'operator disposition reason',
    decided_by: 'sonnet',
    authorized_by: 'operator',
    source: 'audit-readiness-correction-run',
    created_at: '2026-05-08T01:00:00.000Z',
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

  describe('contradiction-resolution ledger integration (latest-status-wins)', () => {
    function makeContradiction(id: string, status: Contradiction['status'] = 'unresolved'): Contradiction {
      return {
        contradiction_id: id,
        section_id: '01-test',
        claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1'],
        source_ids: ['src_aaaaaaaaaaaa'],
        type: 'direct_conflict',
        summary: 'test contradiction',
        scope_analysis: '',
        overlap_assessment: 'fully_overlapping',
        severity: 'medium',
        confidence: 'medium',
        detector: 'heuristic',
        detection_method: 'heuristic_similarity_negation',
        evidence: '',
        status,
        created_at: '2026-05-06T22:00:00.000Z',
      };
    }

    function makeResolution(
      id: string,
      status: ContradictionResolution['status'],
      resolvedAt = '2026-05-07T00:00:00.000Z',
    ): ContradictionResolution {
      return {
        contradiction_id: id,
        status,
        reason: 'test resolution reason',
        resolved_at: resolvedAt,
        resolved_by: 'operator',
      };
    }

    function runWithResolutions(
      contradictions: Contradiction[],
      resolutions: ContradictionResolution[],
    ) {
      return aggregate({
        research: research(['01-test']),
        perSection: new Map([
          ['01-test', {
            claims: [],
            candidateClaims: [],
            claimReviews: [],
            contradictions,
            resolutions,
            gate: null,
            findings: [],
            sourceIdsForSection: [],
          }],
        ]),
        sources: [],
        receipts: [],
        handoff: null,
        generatedAt: '2026-05-06T22:00:00.000Z',
        warnings: [],
      });
    }

    it('100 raw contradictions + 100 resolved entries → 0 unresolved', () => {
      const contradictions = Array.from({ length: 100 }, (_, i) =>
        makeContradiction(`cnt_${String(i).padStart(12, '0')}_heuristic`),
      );
      const resolutions = contradictions.map((c) =>
        makeResolution(c.contradiction_id, 'resolved'),
      );
      const result = runWithResolutions(contradictions, resolutions);
      expect(result.unresolvedContradictions).toHaveLength(0);
      expect(result.payload.contradiction_summary.unresolved).toBe(0);
    });

    it('100 raw + 50 resolved + 50 preserved → 0 unresolved', () => {
      const contradictions = Array.from({ length: 100 }, (_, i) =>
        makeContradiction(`cnt_${String(i).padStart(12, '0')}_heuristic`),
      );
      const resolutions = contradictions.map((c, i) =>
        makeResolution(c.contradiction_id, i < 50 ? 'resolved' : 'preserved'),
      );
      const result = runWithResolutions(contradictions, resolutions);
      expect(result.unresolvedContradictions).toHaveLength(0);
      expect(result.payload.contradiction_summary.unresolved).toBe(0);
    });

    it('100 raw + 99 resolved + 1 without resolution entry → 1 unresolved', () => {
      const contradictions = Array.from({ length: 100 }, (_, i) =>
        makeContradiction(`cnt_${String(i).padStart(12, '0')}_heuristic`),
      );
      // resolve all except the last one
      const resolutions = contradictions.slice(0, 99).map((c) =>
        makeResolution(c.contradiction_id, 'resolved'),
      );
      const result = runWithResolutions(contradictions, resolutions);
      expect(result.unresolvedContradictions).toHaveLength(1);
      expect(result.payload.contradiction_summary.unresolved).toBe(1);
    });

    it('100 raw + 0 resolution entries → 100 unresolved (default-unresolved holds)', () => {
      const contradictions = Array.from({ length: 100 }, (_, i) =>
        makeContradiction(`cnt_${String(i).padStart(12, '0')}_heuristic`),
      );
      const result = runWithResolutions(contradictions, []);
      expect(result.unresolvedContradictions).toHaveLength(100);
      expect(result.payload.contradiction_summary.unresolved).toBe(100);
    });

    it('latest-wins: resolved then later entry sets it back to unresolved → 1 unresolved', () => {
      const contradiction = makeContradiction('cnt_aaaaaaaaaaaa_heuristic');
      const resolutions: ContradictionResolution[] = [
        makeResolution('cnt_aaaaaaaaaaaa_heuristic', 'resolved', '2026-05-07T10:00:00.000Z'),
        makeResolution('cnt_aaaaaaaaaaaa_heuristic', 'unresolved', '2026-05-07T11:00:00.000Z'),
      ];
      const result = runWithResolutions([contradiction], resolutions);
      expect(result.unresolvedContradictions).toHaveLength(1);
      expect(result.payload.contradiction_summary.unresolved).toBe(1);
    });
  });

  describe('claim-synthesis-dispositions ledger integration', () => {
    function makeRepairClaim(id: string): Claim {
      return claim(id, '01-test');
    }

    function makeRepairReview(claim_id: string): ClaimReview {
      return {
        claim_id,
        decision: 'needs_human_review',
        reason: 'claim_overproduction',
        finding_ids: [],
        reviewer: 'heuristic',
        review_method: 'heuristic_field_and_grounding_checks',
        created_at: '2026-05-08T00:00:00.000Z',
      };
    }

    function makeDisposition(
      claim_id: string,
      status: ClaimSynthesisDisposition['status'],
      created_at = '2026-05-08T01:00:00.000Z',
    ): ClaimSynthesisDisposition {
      return {
        claim_id,
        section_id: '01-test',
        status,
        reason: 'test disposition reason',
        decided_by: 'sonnet',
        authorized_by: 'operator',
        source: 'pack-truth-consistency-run',
        created_at,
      };
    }

    function runWithDispositions(
      claims: Claim[],
      claimReviews: ClaimReview[],
      dispositions: ClaimSynthesisDisposition[],
    ) {
      return aggregate({
        research: research(['01-test']),
        perSection: new Map([
          ['01-test', {
            claims,
            candidateClaims: claims,
            claimReviews,
            contradictions: [],
            dispositions,
            gate: gate('01-test', true),
            findings: [],
            sourceIdsForSection: [],
          }],
        ]),
        sources: [],
        receipts: [],
        handoff: null,
        generatedAt: '2026-05-08T00:00:00.000Z',
        warnings: [],
      });
    }

    it('dispositioned needs_scope_repair claim no longer counts as active repair blocker', () => {
      const c = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test');
      const rev: ClaimReview = { ...makeRepairReview(c.claim_id), decision: 'needs_scope_repair' };
      const disp = makeDisposition(c.claim_id, 'parked_not_for_synthesis');
      const result = runWithDispositions([c], [rev], [disp]);
      const section = result.payload.section_summaries.find((s) => s.section_id === '01-test')!;
      expect(section.repair_claims).toBe(0);
      expect(section.dispositioned_claims).toBe(1);
    });

    it('dispositioned needs_human_review claim no longer counts as active repair blocker', () => {
      const c = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test');
      const rev = makeRepairReview(c.claim_id);
      const disp = makeDisposition(c.claim_id, 'needs_human_review_excluded');
      const result = runWithDispositions([c], [rev], [disp]);
      const section = result.payload.section_summaries.find((s) => s.section_id === '01-test')!;
      expect(section.repair_claims).toBe(0);
      expect(section.dispositioned_claims).toBe(1);
    });

    it('dispositioned claim is NOT counted in claim_summary.needs_repair', () => {
      const c = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test');
      const rev = makeRepairReview(c.claim_id);
      const disp = makeDisposition(c.claim_id, 'parked_not_for_synthesis');
      const result = runWithDispositions([c], [rev], [disp]);
      expect(result.payload.claim_summary.needs_repair).toBe(0);
      expect(result.payload.claim_summary.dispositioned).toBe(1);
    });

    it('undisposed repair claim still blocks (default-blocking holds)', () => {
      const c = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test');
      const rev = makeRepairReview(c.claim_id);
      const result = runWithDispositions([c], [rev], []);
      const section = result.payload.section_summaries.find((s) => s.section_id === '01-test')!;
      expect(section.repair_claims).toBe(1);
      expect(section.dispositioned_claims).toBe(0);
    });

    it('out_of_bounds_regression_fixture claim is visible in section summary under dispositioned_claims, not repair_claims', () => {
      const c = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test');
      const rev: ClaimReview = { ...makeRepairReview(c.claim_id), decision: 'needs_scope_repair' };
      const disp = makeDisposition(c.claim_id, 'out_of_bounds_regression_fixture');
      const result = runWithDispositions([c], [rev], [disp]);
      const section = result.payload.section_summaries.find((s) => s.section_id === '01-test')!;
      expect(section.repair_claims).toBe(0);
      expect(section.dispositioned_claims).toBe(1);
    });

    it('latest disposition wins — parked then later preserved reads as preserved_for_human_note', () => {
      const c = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test');
      const rev = makeRepairReview(c.claim_id);
      const dispositions: ClaimSynthesisDisposition[] = [
        makeDisposition(c.claim_id, 'parked_not_for_synthesis', '2026-05-08T01:00:00.000Z'),
        makeDisposition(c.claim_id, 'preserved_for_human_note', '2026-05-08T02:00:00.000Z'),
      ];
      const result = runWithDispositions([c], [rev], dispositions);
      const section = result.payload.section_summaries.find((s) => s.section_id === '01-test')!;
      expect(section.dispositioned_claims).toBe(1);
      expect(section.repair_claims).toBe(0);
    });

    it('attempting to disposition an accepted_for_synthesis claim adds a warning (layer separation)', () => {
      const c = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test');
      const rev = review(c.claim_id, 'accepted_for_synthesis');
      const disp = makeDisposition(c.claim_id, 'parked_not_for_synthesis');
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
            gate: gate('01-test', true),
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
      expect(warnings.some((w) => w.includes('invalid disposition'))).toBe(true);
      expect(warnings.some((w) => w.includes(c.claim_id))).toBe(true);
    });

    it('writing a disposition does not modify the accepted count for the accepted claim', () => {
      const accepted = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test');
      const repair = claim('clm_bbbbbbbbbbbb_heuristic_1', '01-test');
      const claimReviews = [
        review(accepted.claim_id, 'accepted_for_synthesis'),
        makeRepairReview(repair.claim_id),
      ];
      // Only the repair claim has a disposition
      const disp = makeDisposition(repair.claim_id, 'parked_not_for_synthesis');
      const result = runWithDispositions([accepted, repair], claimReviews, [disp]);
      const section = result.payload.section_summaries.find((s) => s.section_id === '01-test')!;
      expect(section.accepted_claims).toBe(1);
      expect(section.repair_claims).toBe(0);
      expect(section.dispositioned_claims).toBe(1);
    });

    it('existing audit tests are unaffected: no dispositions → behavior identical to before', () => {
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
      expect(result.payload.claim_summary.dispositioned).toBe(0);
    });
  });

  describe('corrected active-blocker readiness predicate', () => {
    function makeSection(
      claims: Claim[],
      claimReviews: ClaimReview[],
      dispositions: ClaimSynthesisDisposition[] = [],
      contradictions: Contradiction[] = [],
      resolutions: ContradictionResolution[] = [],
      eligible = true,
    ) {
      return {
        claims,
        candidateClaims: claims,
        claimReviews,
        contradictions,
        resolutions,
        dispositions,
        gate: gate('01-test', eligible),
        findings: [] as ReviewFinding[],
        sourceIdsForSection: ['src_aaaaaaaaaaaa'],
      };
    }

    it('overproduction-baseline: 100 candidates, 5 accepted, 20 rejected, 70 unreviewed, 5 dispositioned → ready_for_synthesis', () => {
      const r = research(['01-test']);
      const claims = Array.from({ length: 100 }, (_, i) =>
        claim(`clm_${String(i).padStart(12, '0')}_heuristic_1`, '01-test'),
      );
      const acceptedReviews = claims.slice(0, 5).map((c) => review(c.claim_id, 'accepted_for_synthesis'));
      const rejectedReviews = claims.slice(5, 25).map((c) => review(c.claim_id, 'rejected'));
      const repairReviews = claims.slice(25, 30).map((c) => repairReview(c.claim_id));
      const dispositions = claims.slice(25, 30).map((c) => testDisposition(c.claim_id, 'needs_human_review_excluded'));
      // claims 30–99: never reviewed (triage-parked / unreviewed)

      const result = aggregate({
        research: r,
        perSection: new Map([['01-test', makeSection(claims, [...acceptedReviews, ...rejectedReviews, ...repairReviews], dispositions)]]),
        sources: [source('src_aaaaaaaaaaaa', 'p1')],
        receipts: [receipt('src_aaaaaaaaaaaa')],
        handoff: makeHandoff('synthesis_ready'),
        generatedAt: '2026-05-08T00:00:00.000Z',
        warnings: [],
      });
      expect(result.payload.verdict).toBe('ready_for_synthesis');
      const s = result.payload.section_summaries.find((s) => s.section_id === '01-test')!;
      expect(s.accepted_claims).toBe(5);
      expect(s.rejected_claims).toBe(20);
      expect(s.repair_claims).toBe(0);
      expect(s.dispositioned_claims).toBe(5);
    });

    it('P2-fix: calibrated-reviewer repair decisions are settled state — undispositioned needs_human_review does not block when gate passes and blocking_reasons is empty', () => {
      const r = research(['01-test']);
      const claims = Array.from({ length: 30 }, (_, i) =>
        claim(`clm_${String(i).padStart(12, '0')}_heuristic_1`, '01-test'),
      );
      const acceptedReviews = claims.slice(0, 5).map((c) => review(c.claim_id, 'accepted_for_synthesis'));
      const rejectedReviews = claims.slice(5, 25).map((c) => review(c.claim_id, 'rejected'));
      const repairReviews = claims.slice(25, 30).map((c) => repairReview(c.claim_id));
      // 4 of 5 repair claims dispositioned; 1 undispositioned — but gate is passing so not a blocker
      const dispositions = claims.slice(25, 29).map((c) => testDisposition(c.claim_id, 'needs_human_review_excluded'));

      const result = aggregate({
        research: r,
        perSection: new Map([['01-test', makeSection(claims, [...acceptedReviews, ...rejectedReviews, ...repairReviews], dispositions)]]),
        sources: [source('src_aaaaaaaaaaaa', 'p1')],
        receipts: [receipt('src_aaaaaaaaaaaa')],
        handoff: makeHandoff('synthesis_ready'),
        generatedAt: '2026-05-08T00:00:00.000Z',
        warnings: [],
      });
      // Gate passes (synthesis_eligible=true, blocking_reasons=[]) → ready_for_synthesis
      expect(result.payload.verdict).toBe('ready_for_synthesis');
      const s = result.payload.section_summaries.find((s) => s.section_id === '01-test')!;
      expect(s.repair_claims).toBe(1); // informational, visible but not a gate
      expect(s.blocking_reasons).toHaveLength(0); // the actual gate condition
    });

    it('P2-fix: non-empty repair_claims with empty blocking_reasons and synthesis_eligible=true → ready_for_synthesis', () => {
      // Directly tests the corrected predicate: repair_claims > 0 does NOT gate synthesis
      // when synthesis_eligible=true and blocking_reasons=[]. Simulates the ComfyUI pack shape:
      // calibrated reviewer leaves undispositioned needs_scope_repair / needs_human_review claims,
      // but gate is passing → audit must return ready_for_synthesis.
      const r = research(['01-test']);
      const claims = Array.from({ length: 15 }, (_, i) =>
        claim(`clm_${String(i).padStart(12, '0')}_heuristic_1`, '01-test'),
      );
      const acceptedReviews = claims.slice(0, 5).map((c) => review(c.claim_id, 'accepted_for_synthesis'));
      const rejectedReviews = claims.slice(5, 8).map((c) => review(c.claim_id, 'rejected'));
      const repairReviews = [
        ...claims.slice(8, 11).map((c) => review(c.claim_id, 'needs_scope_repair' as ClaimReview['decision'])),
        ...claims.slice(11, 14).map((c) => review(c.claim_id, 'needs_source_repair' as ClaimReview['decision'])),
        review(claims[14]!.claim_id, 'needs_human_review' as ClaimReview['decision']),
      ];
      // No dispositions — all 7 repair-vocabulary claims are undispositioned

      const result = aggregate({
        research: r,
        perSection: new Map([['01-test', makeSection(claims, [...acceptedReviews, ...rejectedReviews, ...repairReviews])]]),
        sources: [source('src_aaaaaaaaaaaa', 'p1')],
        receipts: [receipt('src_aaaaaaaaaaaa')],
        handoff: makeHandoff('synthesis_ready'),
        generatedAt: '2026-05-08T00:00:00.000Z',
        warnings: [],
      });
      expect(result.payload.verdict).toBe('ready_for_synthesis');
      const s = result.payload.section_summaries.find((s) => s.section_id === '01-test')!;
      expect(s.repair_claims).toBe(7); // informational
      expect(s.accepted_claims).toBe(5);
      expect(s.blocking_reasons).toHaveLength(0);
      expect(result.payload.readiness_summary.ready_sections).toBe(1);
    });

    it('default-blocking holds (contradictions): 1 unresolved contradiction (medium severity) → not ready_for_synthesis', () => {
      const r = research(['01-test']);
      const c1 = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test');
      const c2 = claim('clm_bbbbbbbbbbbb_heuristic_1', '01-test');
      const contradiction: Contradiction = {
        contradiction_id: 'cnt_aaaaaaaaaaaa_heuristic',
        section_id: '01-test',
        claim_ids: [c1.claim_id, c2.claim_id],
        source_ids: ['src_aaaaaaaaaaaa'],
        type: 'direct_conflict',
        summary: 'test',
        scope_analysis: '',
        overlap_assessment: 'fully_overlapping',
        severity: 'medium',
        confidence: 'medium',
        detector: 'heuristic',
        detection_method: 'm',
        evidence: '',
        status: 'unresolved',
        created_at: '2026-05-08T00:00:00.000Z',
      };

      const result = aggregate({
        research: r,
        perSection: new Map([['01-test', makeSection([c1, c2], [review(c1.claim_id, 'accepted_for_synthesis'), review(c2.claim_id, 'accepted_for_synthesis')], [], [contradiction], [])]]),
        sources: [source('src_aaaaaaaaaaaa', 'p1')],
        receipts: [receipt('src_aaaaaaaaaaaa')],
        handoff: makeHandoff('synthesis_ready'),
        generatedAt: '2026-05-08T00:00:00.000Z',
        warnings: [],
      });
      expect(result.payload.verdict).not.toBe('ready_for_synthesis');
      expect(result.unresolvedContradictions).toHaveLength(1);
    });

    it('rejected with provenance does not block: 5 accepted + 30 rejected, 0 repair blockers → ready_for_synthesis', () => {
      const r = research(['01-test']);
      const claims = Array.from({ length: 35 }, (_, i) =>
        claim(`clm_${String(i).padStart(12, '0')}_heuristic_1`, '01-test'),
      );
      const acceptedReviews = claims.slice(0, 5).map((c) => review(c.claim_id, 'accepted_for_synthesis'));
      const rejectedReviews = claims.slice(5, 35).map((c) => review(c.claim_id, 'rejected'));

      const result = aggregate({
        research: r,
        perSection: new Map([['01-test', makeSection(claims, [...acceptedReviews, ...rejectedReviews])]]),
        sources: [source('src_aaaaaaaaaaaa', 'p1')],
        receipts: [receipt('src_aaaaaaaaaaaa')],
        handoff: makeHandoff('synthesis_ready'),
        generatedAt: '2026-05-08T00:00:00.000Z',
        warnings: [],
      });
      expect(result.payload.verdict).toBe('ready_for_synthesis');
      const s = result.payload.section_summaries.find((s) => s.section_id === '01-test')!;
      expect(s.accepted_claims).toBe(5);
      expect(s.rejected_claims).toBe(30);
      expect(s.repair_claims).toBe(0);
      expect(result.payload.readiness_summary.ready_sections).toBe(1);
    });

    it('unreviewed candidates do not block: 5 accepted + 195 never reviewed → ready_for_synthesis', () => {
      const r = research(['01-test']);
      const claims = Array.from({ length: 200 }, (_, i) =>
        claim(`clm_${String(i).padStart(12, '0')}_heuristic_1`, '01-test'),
      );
      const acceptedReviews = claims.slice(0, 5).map((c) => review(c.claim_id, 'accepted_for_synthesis'));

      const result = aggregate({
        research: r,
        perSection: new Map([['01-test', makeSection(claims, acceptedReviews)]]),
        sources: [source('src_aaaaaaaaaaaa', 'p1')],
        receipts: [receipt('src_aaaaaaaaaaaa')],
        handoff: makeHandoff('synthesis_ready'),
        generatedAt: '2026-05-08T00:00:00.000Z',
        warnings: [],
      });
      expect(result.payload.verdict).toBe('ready_for_synthesis');
      const s = result.payload.section_summaries.find((s) => s.section_id === '01-test')!;
      expect(s.candidate_claims).toBe(200);
      expect(s.accepted_claims).toBe(5);
      expect(s.repair_claims).toBe(0);
    });

    it('audit summary preserves visibility: rejected/dispositioned counts appear even when verdict is ready_for_synthesis', () => {
      const r = research(['01-test']);
      const claims = Array.from({ length: 30 }, (_, i) =>
        claim(`clm_${String(i).padStart(12, '0')}_heuristic_1`, '01-test'),
      );
      const acceptedReviews = claims.slice(0, 5).map((c) => review(c.claim_id, 'accepted_for_synthesis'));
      const rejectedReviews = claims.slice(5, 20).map((c) => review(c.claim_id, 'rejected'));
      const repairReviews = claims.slice(20, 25).map((c) => repairReview(c.claim_id));
      const dispositions = claims.slice(20, 25).map((c) => testDisposition(c.claim_id, 'parked_not_for_synthesis'));

      const result = aggregate({
        research: r,
        perSection: new Map([['01-test', makeSection(claims, [...acceptedReviews, ...rejectedReviews, ...repairReviews], dispositions)]]),
        sources: [source('src_aaaaaaaaaaaa', 'p1')],
        receipts: [receipt('src_aaaaaaaaaaaa')],
        handoff: makeHandoff('synthesis_ready'),
        generatedAt: '2026-05-08T00:00:00.000Z',
        warnings: [],
      });
      expect(result.payload.verdict).toBe('ready_for_synthesis');
      const s = result.payload.section_summaries.find((s) => s.section_id === '01-test')!;
      expect(s.rejected_claims).toBe(15);
      expect(s.dispositioned_claims).toBe(5);
      expect(s.accepted_claims).toBe(5);
      expect(result.payload.claim_summary.rejected).toBe(15);
      expect(result.payload.claim_summary.dispositioned).toBe(5);
    });

    it('cowork-audit agreement: state satisfying cowork synthesis_ready predicates also produces audit ready_for_synthesis', () => {
      // Mirrors exactly what cowork determineMode checks: synthesis_eligible, has_review_run,
      // repair_claim_ids.length === 0, unresolved_contradiction_ids.length === 0
      const r = research(['01-test']);
      const claims = [
        claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test'),
        claim('clm_bbbbbbbbbbbb_heuristic_1', '01-test'),
        claim('clm_cccccccccccc_heuristic_1', '01-test'),
        claim('clm_dddddddddddd_heuristic_1', '01-test'),
        claim('clm_eeeeeeeeeeee_heuristic_1', '01-test'),
      ];
      const claimReviews = [
        review(claims[0].claim_id, 'accepted_for_synthesis'),
        review(claims[1].claim_id, 'accepted_for_synthesis'),
        review(claims[2].claim_id, 'accepted_for_synthesis'),
        review(claims[3].claim_id, 'rejected'),
        review(claims[4].claim_id, 'rejected'),
      ];

      const result = aggregate({
        research: r,
        perSection: new Map([['01-test', makeSection(claims, claimReviews, [], [], [])]]),
        sources: [source('src_aaaaaaaaaaaa', 'p1')],
        receipts: [receipt('src_aaaaaaaaaaaa')],
        handoff: makeHandoff('synthesis_ready'),
        generatedAt: '2026-05-08T00:00:00.000Z',
        warnings: [],
      });
      expect(result.payload.verdict).toBe('ready_for_synthesis');
      expect(result.payload.readiness_summary.ready_sections).toBe(1);
    });

    it('floor still bites: gate-blocked section (synthesis_eligible=false) → not ready_for_synthesis', () => {
      const r = research(['01-test']);
      const c = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test');

      const result = aggregate({
        research: r,
        perSection: new Map([['01-test', makeSection([c], [review(c.claim_id, 'accepted_for_synthesis')], [], [], [], false)]]),
        sources: [source('src_aaaaaaaaaaaa', 'p1')],
        receipts: [receipt('src_aaaaaaaaaaaa')],
        handoff: makeHandoff('repair_required'),
        generatedAt: '2026-05-08T00:00:00.000Z',
        warnings: [],
      });
      expect(result.payload.verdict).not.toBe('ready_for_synthesis');
      const s = result.payload.section_summaries.find((s) => s.section_id === '01-test')!;
      expect(s.synthesis_eligible).toBe(false);
    });

    it('workspace template emits [claim:clm_...] not bare [clm_...] in decision brief and working report', () => {
      const minimalMap: CrossSectionMap = {
        pack_id: 'test000000000',
        pack_topic: 'test topic',
        pack_decision: 'test decision',
        generated_at: '2026-05-08T00:00:00.000Z',
        accepted_claim_ids: [],
        sections: [],
        claim_clusters: [],
        shared_sources: [],
        scope_overlaps: [],
        cross_section_contradictions: [],
        waiver_dependencies: [],
        open_questions: [],
        allowed_synthesis_inputs: [],
        forbidden_inputs: [],
      };

      const brief = renderDecisionBrief(minimalMap);
      const workingReport = renderWorkingReport(minimalMap);

      expect(brief).toContain('[claim:clm_...]');
      expect(workingReport).toContain('[claim:clm_...]');
      // Old bare [clm_...] format must not appear
      expect(brief).not.toMatch(/`\[clm_\.\.\.\]`/);
      expect(workingReport).not.toMatch(/`\[clm_\.\.\.\]`/);
    });
  });
});
