import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { ResearchYamlSchema } from '../src/intake/schema.js';
import {
  checkSourceFloor,
  checkClaimIntegrity,
  checkScopeIntegrity,
  checkFreshness,
  checkContradiction,
  checkSectionBudget,
  applyWaivers,
} from '../src/gates/checks/index.js';
import type { GateInput } from '../src/gates/types.js';
import type { Claim } from '../src/claims/schema.js';
import type { Contradiction } from '../src/contradictions/schema.js';
import type { FetchReceipt, SourceCard } from '../src/sources/schema.js';

function makeResearch(overrides: Record<string, unknown> = {}) {
  return ResearchYamlSchema.parse({
    research_os_version: '0.1.0',
    created_at: '2026-05-06T22:00:00.000Z',
    topic: 'How does the gate engine handle synthetic inputs?',
    sections: [
      {
        id: '01-test',
        purpose: 'Probe',
        max_time_minutes: 45,
        min_sources: 2,
        primary_sources_required: 1,
        contradictions_required: false,
        status: 'draft',
      },
    ],
    ...overrides,
  });
}

function makeSource(overrides: Partial<SourceCard>): SourceCard {
  return {
    source_id: 'src_aaaaaaaaaaaa',
    receipt_id: 'rcpt_aaaaaaaaaaaa_1',
    section_id: '01-test',
    url: 'https://example.com/x',
    final_url: 'https://example.com/x',
    fetched_at: '2026-05-06T22:00:00.000Z',
    publisher: 'Example Pub',
    published_at: '2025-12-01T00:00:00.000Z',
    title: 'A',
    source_type: 'secondary',
    relevance: 'unknown',
    key_points: [],
    limitations: [],
    asserts: 'A',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-06T22:00:00.000Z',
    ...overrides,
  };
}

function makeReceipt(overrides: Partial<FetchReceipt>): FetchReceipt {
  return {
    receipt_id: 'rcpt_aaaaaaaaaaaa_1',
    source_id: 'src_aaaaaaaaaaaa',
    section_id: '01-test',
    requested_url: 'https://example.com/x',
    final_url: 'https://example.com/x',
    status: 200,
    status_text: 'OK',
    content_type: 'text/html',
    fetched_at: '2026-05-06T22:00:00.000Z',
    byte_count: 100,
    sha256: 'a'.repeat(64),
    title: 'A',
    raw_text_path: 'evidence/raw/src_aaaaaaaaaaaa.html',
    fetch_outcome: 'ok',
    fetch_error: null,
    extraction_outcome: 'ok',
    extraction_extractor: 'heuristic',
    extraction_error: null,
    ...overrides,
  };
}

function makeClaim(overrides: Partial<Claim>): Claim {
  return {
    claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
    section_id: '01-test',
    source_ids: ['src_aaaaaaaaaaaa'],
    source_hashes: ['a'.repeat(64)],
    asserts: 'something',
    scope: 'narrow',
    not: 'broad',
    evidence_excerpt: 'literal text',
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
    ...overrides,
  };
}

function makeContradiction(overrides: Partial<Contradiction>): Contradiction {
  return {
    contradiction_id: 'cnt_111111111111_heuristic',
    section_id: '01-test',
    claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1', 'clm_bbbbbbbbbbbb_heuristic_1'],
    source_ids: ['src_aaaaaaaaaaaa'],
    type: 'overgeneralization_risk',
    summary: 'A widens B',
    scope_analysis: 'A is null-scope',
    overlap_assessment: 'partially_overlapping',
    severity: 'medium',
    confidence: 'low',
    detector: 'heuristic',
    detection_method: 'heuristic_similarity_negation',
    evidence: 'token overlap',
    status: 'unresolved',
    created_at: '2026-05-06T22:00:00.000Z',
    ...overrides,
  };
}

function makeInput(overrides: Partial<GateInput> = {}): GateInput {
  const research = overrides.research ?? makeResearch();
  const section = overrides.section ?? research.sections[0]!;
  return {
    research,
    section,
    claims: overrides.claims ?? [],
    candidateClaims: overrides.candidateClaims ?? overrides.claims ?? [],
    sources: overrides.sources ?? [],
    receipts: overrides.receipts ?? [],
    contradictions: overrides.contradictions ?? [],
  };
}

describe('checkSourceFloor', () => {
  it('fails min_sources when below threshold', () => {
    const out = checkSourceFloor(makeInput({
      sources: [makeSource({ source_id: 'src_aaaaaaaaaaaa' })],
    }));
    const min = out.find((r) => r.check === 'min_sources');
    expect(min?.status).toBe('fail');
    expect(min?.blocks_synthesis).toBe(true);
  });

  it('passes min_sources when at or above threshold', () => {
    const cfgResearch = makeResearch();
    cfgResearch.gates.source_floor.min_sources = 1;
    cfgResearch.gates.source_floor.min_independent_publishers = 1;
    cfgResearch.gates.source_floor.primary_sources_required = 0;
    const out = checkSourceFloor(makeInput({
      research: cfgResearch,
      sources: [makeSource({ source_id: 'src_aaaaaaaaaaaa' })],
    }));
    expect(out.find((r) => r.check === 'min_sources')?.status).toBe('pass');
  });

  it('fails primary_sources_required when no primaries (pre-waiver)', () => {
    const out = checkSourceFloor(makeInput({
      sources: [makeSource({ source_type: 'secondary' })],
    }));
    const pri = out.find((r) => r.check === 'primary_sources_required');
    expect(pri?.status).toBe('fail');
  });

  it('records failed_fetches as warn', () => {
    const out = checkSourceFloor(makeInput({
      receipts: [makeReceipt({ fetch_outcome: 'http_error', status: 404 })],
    }));
    expect(out.find((r) => r.check === 'failed_fetches_visible')?.status).toBe('warn');
  });
});

describe('applyWaivers', () => {
  const research = makeResearch();
  research.primary_source_waiver = {
    status: 'granted',
    reason: 'Design research has no public primary sources.',
    compensating_controls: ['Adversarial review required.'],
  };
  const input = makeInput({
    research,
    sources: [makeSource({ source_type: 'secondary' })],
  });
  const sourceFloorRaw = checkSourceFloor(input);

  it('converts primary_sources_required fail → pass_with_waiver when waiver is complete', () => {
    const { updatedResults, waivers_applied, waiver_validation_failures } = applyWaivers(input, sourceFloorRaw);
    const conv = updatedResults.find((r) => r.check === 'primary_sources_required');
    expect(conv?.status).toBe('pass_with_waiver');
    expect(conv?.blocks_synthesis).toBe(false);
    expect(waivers_applied).toHaveLength(1);
    expect(waiver_validation_failures).toHaveLength(0);
  });

  it('rejects waiver missing reason', () => {
    const r = makeResearch();
    r.primary_source_waiver = { status: 'granted', reason: '', compensating_controls: ['x'] };
    const inp = makeInput({ research: r, sources: [makeSource({ source_type: 'secondary' })] });
    const { waiver_validation_failures, waivers_applied } = applyWaivers(inp, checkSourceFloor(inp));
    expect(waiver_validation_failures.some((f) => f.check === 'primary_source_waiver_reason_required')).toBe(true);
    expect(waivers_applied).toHaveLength(0);
  });

  it('rejects waiver missing compensating controls', () => {
    const r = makeResearch();
    r.primary_source_waiver = { status: 'granted', reason: 'because', compensating_controls: [] };
    const inp = makeInput({ research: r, sources: [makeSource({ source_type: 'secondary' })] });
    const { waiver_validation_failures, waivers_applied } = applyWaivers(inp, checkSourceFloor(inp));
    expect(waiver_validation_failures.some((f) => f.check === 'primary_source_waiver_compensating_controls_required')).toBe(true);
    expect(waivers_applied).toHaveLength(0);
  });

  it('rejects waiver when pack policy disallows it', () => {
    const r = makeResearch();
    r.gates.source_floor.primary_source_waiver_allowed = false;
    r.primary_source_waiver = {
      status: 'granted',
      reason: 'because',
      compensating_controls: ['x'],
    };
    const inp = makeInput({ research: r, sources: [makeSource({ source_type: 'secondary' })] });
    const { waiver_validation_failures, waivers_applied } = applyWaivers(inp, checkSourceFloor(inp));
    expect(waiver_validation_failures.some((f) => f.check === 'primary_source_waiver_allowed_by_pack')).toBe(true);
    expect(waivers_applied).toHaveLength(0);
  });
});

describe('checkClaimIntegrity', () => {
  it('flags orphan claims (cite missing source)', () => {
    const out = checkClaimIntegrity(makeInput({
      candidateClaims: [makeClaim({ source_ids: ['src_zzzzzzzzzzzz'] })],
      sources: [makeSource({ source_id: 'src_aaaaaaaaaaaa' })],
      receipts: [makeReceipt()],
    }));
    expect(out.find((r) => r.check === 'no_orphan_claims')?.status).toBe('fail');
  });

  it('flags missing source_hashes', () => {
    const out = checkClaimIntegrity(makeInput({
      candidateClaims: [makeClaim({ source_hashes: [] })],
      sources: [makeSource({})],
      receipts: [makeReceipt()],
    }));
    expect(out.find((r) => r.check === 'source_hashes_present')?.status).toBe('fail');
  });

  it('flags claims without a matching successful fetch receipt', () => {
    const out = checkClaimIntegrity(makeInput({
      candidateClaims: [makeClaim({})],
      sources: [makeSource({})],
      receipts: [makeReceipt({ fetch_outcome: 'http_error', status: 404 })],
    }));
    expect(out.find((r) => r.check === 'fetch_receipt_anchored')?.status).toBe('fail');
  });

  it('warns on source-cluster monopoly when most claims share a publisher', () => {
    const out = checkClaimIntegrity(makeInput({
      candidateClaims: [
        makeClaim({ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', source_ids: ['src_aaaaaaaaaaaa'] }),
        makeClaim({ claim_id: 'clm_aaaaaaaaaaaa_heuristic_2', source_ids: ['src_aaaaaaaaaaaa'] }),
        makeClaim({ claim_id: 'clm_aaaaaaaaaaaa_heuristic_3', source_ids: ['src_aaaaaaaaaaaa'] }),
      ],
      sources: [makeSource({ publisher: 'OnePublisher' })],
      receipts: [makeReceipt()],
    }));
    expect(out.find((r) => r.check === 'no_source_cluster_monopoly')?.status).toBe('warn');
  });

  it('passes when claims are well-formed', () => {
    const out = checkClaimIntegrity(makeInput({
      candidateClaims: [makeClaim({})],
      sources: [makeSource({})],
      receipts: [makeReceipt()],
    }));
    expect(out.find((r) => r.check === 'no_orphan_claims')?.status).toBe('pass');
    expect(out.find((r) => r.check === 'source_hashes_present')?.status).toBe('pass');
  });
});

describe('checkScopeIntegrity', () => {
  it('blocks on high-severity overgeneralization_risk', () => {
    const out = checkScopeIntegrity(makeInput({
      candidateClaims: [makeClaim({})],
      contradictions: [makeContradiction({ severity: 'high' })],
    }));
    const block = out.find((r) => r.check === 'no_blocking_overgeneralization');
    expect(block?.status).toBe('fail');
    expect(block?.blocks_synthesis).toBe(true);
  });

  it('warns on low-severity overgeneralization_risk only', () => {
    const out = checkScopeIntegrity(makeInput({
      candidateClaims: [makeClaim({})],
      contradictions: [makeContradiction({ severity: 'low' })],
    }));
    expect(out.find((r) => r.check === 'no_blocking_overgeneralization')?.status).toBe('pass');
    expect(out.find((r) => r.check === 'low_severity_overgeneralization')?.status).toBe('warn');
  });

  it('warns when claims are mostly scope=null', () => {
    const out = checkScopeIntegrity(makeInput({
      candidateClaims: [
        makeClaim({ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', scope: null }),
        makeClaim({ claim_id: 'clm_bbbbbbbbbbbb_heuristic_1', scope: null }),
      ],
    }));
    expect(out.find((r) => r.check === 'no_untagged_universal_claims')?.status).toBe('warn');
  });
});

describe('checkContradiction', () => {
  it('blocks when high-severity unresolved contradictions exist and policy says block', () => {
    const research = makeResearch();
    research.gates.contradiction.unresolved_contradictions_block_synthesis = true;
    const out = checkContradiction(makeInput({
      research,
      contradictions: [
        makeContradiction({ severity: 'blocking', type: 'direct_conflict' }),
      ],
    }));
    const block = out.find((r) => r.check === 'unresolved_contradictions_block_synthesis');
    expect(block?.status).toBe('fail');
    expect(block?.blocks_synthesis).toBe(true);
  });

  it('does not block when only low-severity unresolved contradictions exist', () => {
    const out = checkContradiction(makeInput({
      contradictions: [makeContradiction({ severity: 'low', type: 'direct_conflict' })],
    }));
    expect(out.find((r) => r.check === 'unresolved_contradictions_block_synthesis')?.status).toBe('pass');
  });

  it('warns when contradictions are unresolved (visibility)', () => {
    const out = checkContradiction(makeInput({
      contradictions: [makeContradiction({})],
    }));
    expect(out.find((r) => r.check === 'unresolved_visible')?.status).toBe('warn');
  });
});

describe('checkFreshness', () => {
  it('passes when policy is not required', () => {
    const research = makeResearch();
    research.freshness.required = false;
    research.gates.freshness.required_for_current_topics = false;
    const out = checkFreshness(makeInput({ research }));
    expect(out[0]?.check).toBe('policy_applicability');
    expect(out[0]?.status).toBe('pass');
  });

  it('flags stale sources per policy=fail', () => {
    const research = makeResearch();
    research.freshness.required = true;
    research.freshness.max_source_age_months = 6;
    research.gates.freshness.stale_source_policy = 'fail';
    const old = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 2).toISOString(); // 2 years ago
    const out = checkFreshness(makeInput({
      research,
      sources: [makeSource({ published_at: old })],
    }));
    const stale = out.find((r) => r.check === 'no_stale_sources');
    expect(stale?.status).toBe('fail');
    expect(stale?.blocks_synthesis).toBe(true);
  });

  it('warns on stale sources per policy=warn', () => {
    const research = makeResearch();
    research.freshness.required = true;
    research.freshness.max_source_age_months = 6;
    research.gates.freshness.stale_source_policy = 'warn';
    const old = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 2).toISOString();
    const out = checkFreshness(makeInput({
      research,
      sources: [makeSource({ published_at: old })],
    }));
    const stale = out.find((r) => r.check === 'no_stale_sources');
    expect(stale?.status).toBe('warn');
    expect(stale?.blocks_synthesis).toBe(false);
  });

  it('warns on unknown publication date', () => {
    const research = makeResearch();
    research.freshness.required = true;
    const out = checkFreshness(makeInput({
      research,
      sources: [makeSource({ published_at: null })],
    }));
    expect(out.find((r) => r.check === 'publication_date_known')?.status).toBe('warn');
  });
});

describe('checkSectionBudget', () => {
  it('records configured budget and admits runtime tracking is not implemented', () => {
    const out = checkSectionBudget(makeInput({}));
    expect(out.find((r) => r.check === 'budget_configured')?.status).toBe('pass');
    expect(out.find((r) => r.check === 'runtime_tracking')?.status).toBe('warn');
  });

  it('warns when section has no max_time_minutes', () => {
    const research = makeResearch();
    research.sections[0]!.max_time_minutes = 0 as unknown as z.infer<typeof z.number>;
    const out = checkSectionBudget(makeInput({ research, section: research.sections[0]! }));
    expect(out.find((r) => r.check === 'budget_configured')?.status).toBe('warn');
  });
});
