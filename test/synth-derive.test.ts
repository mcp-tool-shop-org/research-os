import { describe, it, expect } from 'vitest';
import { deriveCrossSectionMap } from '../src/synth/derive.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';
import { CoworkHandoffPayloadSchema } from '../src/cowork/schema.js';
import type { Claim } from '../src/claims/schema.js';
import type { ClaimReview } from '../src/review/schema.js';
import type { Contradiction } from '../src/contradictions/schema.js';
import type { SourceCard } from '../src/sources/schema.js';

function research(sectionIds: string[] = ['01-test', '02-test']) {
  return ResearchYamlSchema.parse({
    research_os_version: '0.1.0',
    created_at: '2026-05-06T22:00:00.000Z',
    topic: 'How does the synthesis workspace derive its cross-section map?',
    decision: 'Pick the right synthesis input set.',
    sections: sectionIds.map((id) => ({
      id,
      purpose: `purpose for ${id}`,
      max_time_minutes: 45,
      min_sources: 2,
      primary_sources_required: 1,
      contradictions_required: false,
      status: 'reviewed',
    })),
  });
}

function claim(id: string, sectionId: string, source_ids: string[], scope: string | null = 'narrow scope'): Claim {
  return {
    claim_id: id,
    section_id: sectionId,
    source_ids,
    source_hashes: ['a'.repeat(64)],
    asserts: `assertion for ${id}`,
    scope,
    not: 'broad',
    evidence_excerpt: 'literal',
    evidence_location: null,
    confidence: 'medium',
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

function source(id: string, publisher: string): SourceCard {
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
  };
}

function makeHandoff(args: {
  acceptedClaimIds: string[];
  sectionState: Array<{
    section_id: string;
    accepted: string[];
    repair?: string[];
    rejected?: string[];
    synthesis_eligible?: boolean;
    candidates?: number;
  }>;
  waivers?: Array<{ scope: 'pack' | 'gate'; family: string; reason: string; compensating_controls: string[]; applied_to: string }>;
}) {
  return CoworkHandoffPayloadSchema.parse({
    pack_id: 'abcdef012345',
    pack_topic: 'How does the synthesis workspace derive its cross-section map?',
    generated_at: '2026-05-06T22:00:00.000Z',
    mode: 'synthesis_ready',
    synthesis_allowed: true,
    summary: 'mock',
    sections: args.sectionState.map((s) => ({
      section_id: s.section_id,
      purpose: 'p',
      status: 'reviewed',
      has_gate_run: true,
      has_review_run: true,
      gate_verdict: 'pass',
      synthesis_eligible: s.synthesis_eligible ?? true,
      accepted_claim_ids: s.accepted,
      repair_claim_ids: s.repair ?? [],
      rejected_claim_ids: s.rejected ?? [],
      candidate_claims_total: s.candidates ?? s.accepted.length + (s.repair?.length ?? 0) + (s.rejected?.length ?? 0),
      unresolved_contradiction_ids: [],
      blocking_reasons: [],
      blocking_contradictions_unresolved: 0,
    })),
    accepted_claim_ids: args.acceptedClaimIds,
    repair_claim_ids: args.sectionState.flatMap((s) => s.repair ?? []),
    blocked_claim_ids: args.sectionState.flatMap((s) => s.rejected ?? []),
    unresolved_contradiction_ids: [],
    waivers: args.waivers ?? [],
    gate_verdicts: args.sectionState.map((s) => ({ section_id: s.section_id, verdict: 'pass', synthesis_eligible: s.synthesis_eligible ?? true })),
    review_decisions: [],
    recommended_next_actions: [],
    allowed_write_paths: [],
    forbidden_actions: [],
    index_status: 'present',
    warnings: [],
  });
}

describe('deriveCrossSectionMap', () => {
  it('lists only accepted claims as allowed synthesis inputs', () => {
    const r = research(['01-test']);
    const accepted = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test', ['src_aaaaaaaaaaaa']);
    const repair = claim('clm_bbbbbbbbbbbb_heuristic_1', '01-test', ['src_aaaaaaaaaaaa']);
    const handoff = makeHandoff({
      acceptedClaimIds: [accepted.claim_id],
      sectionState: [{ section_id: '01-test', accepted: [accepted.claim_id], repair: [repair.claim_id] }],
    });
    const result = deriveCrossSectionMap({
      research: r,
      handoff,
      claimsBySection: new Map([['01-test', [accepted, repair]]]),
      reviewsBySection: new Map([['01-test', [review(accepted.claim_id, 'accepted_for_synthesis'), review(repair.claim_id, 'needs_source_repair')]]]),
      contradictionsBySection: new Map([['01-test', []]]),
      sources: [source('src_aaaaaaaaaaaa', 'p1')],
      generatedAt: '2026-05-06T22:00:00.000Z',
    });
    expect(result.allowed_synthesis_inputs.map((a) => a.claim_id)).toEqual([accepted.claim_id]);
    expect(result.forbidden_inputs.some((f) => f.claim_id === repair.claim_id)).toBe(true);
    expect(result.forbidden_inputs.find((f) => f.claim_id === repair.claim_id)?.decision).toBe('needs_source_repair');
  });

  it('clusters accepted claims by shared source_ids', () => {
    const r = research(['01-test', '02-test']);
    const a = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test', ['src_aaaaaaaaaaaa', 'src_bbbbbbbbbbbb']);
    const b = claim('clm_bbbbbbbbbbbb_heuristic_1', '02-test', ['src_bbbbbbbbbbbb']);
    const c = claim('clm_cccccccccccc_heuristic_1', '01-test', ['src_dddddddddddd']);
    const handoff = makeHandoff({
      acceptedClaimIds: [a.claim_id, b.claim_id, c.claim_id],
      sectionState: [
        { section_id: '01-test', accepted: [a.claim_id, c.claim_id] },
        { section_id: '02-test', accepted: [b.claim_id] },
      ],
    });
    const result = deriveCrossSectionMap({
      research: r,
      handoff,
      claimsBySection: new Map([
        ['01-test', [a, c]],
        ['02-test', [b]],
      ]),
      reviewsBySection: new Map([
        ['01-test', [review(a.claim_id, 'accepted_for_synthesis'), review(c.claim_id, 'accepted_for_synthesis')]],
        ['02-test', [review(b.claim_id, 'accepted_for_synthesis')]],
      ]),
      contradictionsBySection: new Map([
        ['01-test', []],
        ['02-test', []],
      ]),
      sources: [
        source('src_aaaaaaaaaaaa', 'p1'),
        source('src_bbbbbbbbbbbb', 'p2'),
        source('src_dddddddddddd', 'p3'),
      ],
      generatedAt: '2026-05-06T22:00:00.000Z',
    });
    const clusterIds = result.claim_clusters.map((c) => c.member_claim_ids.sort().join(','));
    expect(clusterIds.some((s) => s.includes(a.claim_id) && s.includes(b.claim_id))).toBe(true);
    expect(result.claim_clusters.some((c) => c.spans_sections.length > 1)).toBe(true);
  });

  it('records cross-section scope overlaps with cross_section=true', () => {
    const r = research(['01-test', '02-test']);
    const a = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test', ['src_aaaaaaaaaaaa'], 'sqlite fts5 virtual table extension');
    const b = claim('clm_bbbbbbbbbbbb_heuristic_1', '02-test', ['src_bbbbbbbbbbbb'], 'sqlite fts5 virtual extension');
    const handoff = makeHandoff({
      acceptedClaimIds: [a.claim_id, b.claim_id],
      sectionState: [
        { section_id: '01-test', accepted: [a.claim_id] },
        { section_id: '02-test', accepted: [b.claim_id] },
      ],
    });
    const result = deriveCrossSectionMap({
      research: r,
      handoff,
      claimsBySection: new Map([
        ['01-test', [a]],
        ['02-test', [b]],
      ]),
      reviewsBySection: new Map([
        ['01-test', [review(a.claim_id, 'accepted_for_synthesis')]],
        ['02-test', [review(b.claim_id, 'accepted_for_synthesis')]],
      ]),
      contradictionsBySection: new Map([['01-test', []], ['02-test', []]]),
      sources: [source('src_aaaaaaaaaaaa', 'p1'), source('src_bbbbbbbbbbbb', 'p2')],
      generatedAt: '2026-05-06T22:00:00.000Z',
    });
    expect(result.scope_overlaps.length).toBeGreaterThan(0);
    expect(result.scope_overlaps.some((o) => o.cross_section)).toBe(true);
  });

  it('preserves cross-section contradictions', () => {
    const r = research(['01-test', '02-test']);
    const a = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test', ['src_aaaaaaaaaaaa']);
    const b = claim('clm_bbbbbbbbbbbb_heuristic_1', '02-test', ['src_bbbbbbbbbbbb']);
    const contradiction: Contradiction = {
      contradiction_id: 'cnt_111111111111_heuristic',
      section_id: '01-test',
      claim_ids: [a.claim_id, b.claim_id],
      source_ids: ['src_aaaaaaaaaaaa'],
      type: 'direct_conflict',
      summary: 'cross-section',
      scope_analysis: '',
      overlap_assessment: 'fully_overlapping',
      severity: 'medium',
      confidence: 'low',
      detector: 'heuristic',
      detection_method: 'heuristic_similarity_negation',
      evidence: '',
      status: 'unresolved',
      created_at: '2026-05-06T22:00:00.000Z',
    };
    const handoff = makeHandoff({
      acceptedClaimIds: [a.claim_id, b.claim_id],
      sectionState: [
        { section_id: '01-test', accepted: [a.claim_id] },
        { section_id: '02-test', accepted: [b.claim_id] },
      ],
    });
    const result = deriveCrossSectionMap({
      research: r,
      handoff,
      claimsBySection: new Map([
        ['01-test', [a]],
        ['02-test', [b]],
      ]),
      reviewsBySection: new Map([
        ['01-test', [review(a.claim_id, 'accepted_for_synthesis')]],
        ['02-test', [review(b.claim_id, 'accepted_for_synthesis')]],
      ]),
      contradictionsBySection: new Map([
        ['01-test', [contradiction]],
        ['02-test', []],
      ]),
      sources: [source('src_aaaaaaaaaaaa', 'p1'), source('src_bbbbbbbbbbbb', 'p2')],
      generatedAt: '2026-05-06T22:00:00.000Z',
    });
    expect(result.cross_section_contradictions).toHaveLength(1);
    expect(result.cross_section_contradictions[0]?.sections.sort()).toEqual(['01-test', '02-test']);
  });

  it('carries waiver dependencies through with must_disclose_in', () => {
    const r = research(['01-test']);
    const a = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test', ['src_aaaaaaaaaaaa']);
    const handoff = makeHandoff({
      acceptedClaimIds: [a.claim_id],
      sectionState: [{ section_id: '01-test', accepted: [a.claim_id] }],
      waivers: [{
        scope: 'pack',
        family: 'source_floor',
        reason: 'design research with no public primaries',
        compensating_controls: ['adversarial review'],
        applied_to: 'primary_sources_required',
      }],
    });
    const result = deriveCrossSectionMap({
      research: r,
      handoff,
      claimsBySection: new Map([['01-test', [a]]]),
      reviewsBySection: new Map([['01-test', [review(a.claim_id, 'accepted_for_synthesis')]]]),
      contradictionsBySection: new Map([['01-test', []]]),
      sources: [source('src_aaaaaaaaaaaa', 'p1')],
      generatedAt: '2026-05-06T22:00:00.000Z',
    });
    expect(result.waiver_dependencies).toHaveLength(1);
    expect(result.waiver_dependencies[0]?.must_disclose_in).toBe('both');
  });

  it('records excluded sections with a reason', () => {
    const r = research(['01-test', '02-test']);
    const a = claim('clm_aaaaaaaaaaaa_heuristic_1', '01-test', ['src_aaaaaaaaaaaa']);
    const handoff = makeHandoff({
      acceptedClaimIds: [a.claim_id],
      sectionState: [
        { section_id: '01-test', accepted: [a.claim_id] },
        { section_id: '02-test', accepted: [], synthesis_eligible: false, candidates: 0 },
      ],
    });
    const result = deriveCrossSectionMap({
      research: r,
      handoff,
      claimsBySection: new Map([['01-test', [a]], ['02-test', []]]),
      reviewsBySection: new Map([['01-test', [review(a.claim_id, 'accepted_for_synthesis')]], ['02-test', []]]),
      contradictionsBySection: new Map([['01-test', []], ['02-test', []]]),
      sources: [source('src_aaaaaaaaaaaa', 'p1')],
      generatedAt: '2026-05-06T22:00:00.000Z',
    });
    const excluded = result.sections.find((s) => s.section_id === '02-test');
    expect(excluded?.excluded_reason).not.toBeNull();
  });
});
