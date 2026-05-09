/**
 * Tests for v0.3.1 section-scoped source-floor waivers.
 *
 * Two-layer feature:
 *   (a) Gate-side — applyWaivers converts source_floor.<scope> failures from
 *       fail to pass_with_waiver when a matching section_waivers entry is
 *       present and validates.
 *   (b) Reviewer-side — deriveClaimReviews neutralises the section-wide
 *       source_cluster_monopoly finding's contribution to per-claim decision
 *       routing when an active min_independent_publishers waiver covers the
 *       section. The finding remains in the ledger as a visible caveat.
 *
 * Earned by Experiment 3 XRPL Pack Session 2 — canonical-protocol sections
 * are structurally single-publisher and the global publisher-diversity floor
 * inappropriately fails them.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import {
  PrimarySourceWaiverSchema,
  ResearchYamlSchema,
  SectionScopedWaiverSchema,
  type SectionScopedWaiver,
} from '../src/intake/schema.js';
import { applyWaivers, checkSourceFloor } from '../src/gates/checks/index.js';
import { deriveClaimReviews } from '../src/review/decision.js';
import { aggregate, type AggregateInput } from '../src/audit/aggregate.js';
import type { GateInput } from '../src/gates/types.js';
import type { Claim } from '../src/claims/schema.js';
import type { FetchReceipt, SourceCard } from '../src/sources/schema.js';
import { ReviewFindingSchema, type ReviewFinding } from '../src/review/schema.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SECTION_ID = '01-token-surface';
const OTHER_SECTION_ID = '02-other';

function makeResearch(opts: {
  sectionWaivers?: SectionScopedWaiver[];
  primarySourceWaiverAllowed?: boolean;
  packLevelWaiver?: 'none' | 'granted';
  sectionIds?: string[];
} = {}) {
  const sectionIds = opts.sectionIds ?? [SECTION_ID];
  return ResearchYamlSchema.parse({
    research_os_version: '0.3.1',
    created_at: '2026-05-09T00:00:00.000Z',
    topic: 'Section-scoped waiver test pack — canonical-protocol single publisher',
    sections: sectionIds.map((id) => ({
      id,
      purpose: `Probe ${id}`,
      max_time_minutes: 45,
      min_sources: 2,
      primary_sources_required: 1,
      contradictions_required: false,
      status: 'draft',
    })),
    gates: {
      source_floor: {
        min_sources: 2,
        min_independent_publishers: 4,
        primary_sources_required: 2,
        primary_source_waiver_allowed: opts.primarySourceWaiverAllowed ?? true,
      },
    },
    primary_source_waiver: {
      status: opts.packLevelWaiver ?? 'none',
      reason: opts.packLevelWaiver === 'granted' ? 'pack-level reason' : undefined,
      compensating_controls:
        opts.packLevelWaiver === 'granted' ? ['pack-level control'] : [],
      section_waivers: opts.sectionWaivers ?? [],
    },
  });
}

function makeSource(overrides: Partial<SourceCard>): SourceCard {
  return {
    source_id: 'src_aaaaaaaaaaaa',
    receipt_id: 'rcpt_aaaaaaaaaaaa_1',
    section_id: SECTION_ID,
    url: 'https://xrpl.org/x',
    final_url: 'https://xrpl.org/x',
    fetched_at: '2026-05-09T00:00:00.000Z',
    publisher: 'XRP Ledger Foundation',
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
    extracted_at: '2026-05-09T00:00:00.000Z',
    ...overrides,
  };
}

function makeReceipt(overrides: Partial<FetchReceipt>): FetchReceipt {
  return {
    receipt_id: 'rcpt_aaaaaaaaaaaa_1',
    source_id: 'src_aaaaaaaaaaaa',
    section_id: SECTION_ID,
    requested_url: 'https://xrpl.org/x',
    final_url: 'https://xrpl.org/x',
    status: 200,
    status_text: 'OK',
    content_type: 'text/html',
    fetched_at: '2026-05-09T00:00:00.000Z',
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

function makeClaim(id: string, section_id: string = SECTION_ID): Claim {
  return {
    claim_id: id,
    section_id,
    source_ids: ['src_aaaaaaaaaaaa'],
    source_hashes: ['a'.repeat(64)],
    asserts: 'X',
    scope: 'narrow',
    not: 'broad',
    evidence_excerpt: 'literal',
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-05-09T00:00:00.000Z',
    review_state: 'candidate',
  };
}

function makeFinding(overrides: Partial<ReviewFinding>): ReviewFinding {
  return ReviewFindingSchema.parse({
    finding_id: 'fnd_aaaaaaaaaaaa',
    section_id: SECTION_ID,
    claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1'],
    source_ids: ['src_aaaaaaaaaaaa'],
    category: 'source_cluster_monopoly',
    severity: 'warn',
    summary: 'Single publisher across the section',
    evidence: '',
    required_action: 'fix',
    reviewer: 'heuristic',
    review_method: 'm',
    confidence: 'medium',
    created_at: '2026-05-09T00:00:00.000Z',
    ...overrides,
  });
}

function makeGateInput(opts: {
  research?: ReturnType<typeof makeResearch>;
  sourceCount?: number;
  sectionId?: string;
}): GateInput {
  const research = opts.research ?? makeResearch();
  const sectionId = opts.sectionId ?? SECTION_ID;
  const section = research.sections.find((s) => s.id === sectionId)!;
  // 2 sources, single publisher (XRPLF), zero primary sources -> triggers
  // both min_independent_publishers fail and primary_sources_required fail.
  const sourceCount = opts.sourceCount ?? 2;
  const sources: SourceCard[] = [];
  for (let i = 0; i < sourceCount; i += 1) {
    sources.push(makeSource({
      source_id: `src_${String(i).padStart(12, '0')}`,
      section_id: sectionId,
    }));
  }
  return {
    research,
    section,
    claims: [],
    candidateClaims: [],
    sources,
    receipts: sources.map((s) =>
      makeReceipt({ source_id: s.source_id, section_id: sectionId }),
    ),
    contradictions: [],
    claimReviews: [],
  };
}

// Canonical waiver shape for XRPL Section 01 (mirrors terminal-b-repair-plan.md)
const XRPL_MONOPOLY_WAIVER: SectionScopedWaiver = {
  section_id: SECTION_ID,
  scope: 'min_independent_publishers',
  reason:
    'Section defines XRPL token surfaces from canonical protocol sources. ' +
    'Authoritative source of truth is intentionally concentrated in XRPL ' +
    'Foundation documentation, XLS standards, and rippled implementation ' +
    'records.',
  compensating_controls: [
    'Sources span multiple canonical artifact types: xrpl.org docs, rendered XLS standards, raw standards markdown, rippled release data, and GitHub implementation discussions.',
    'Claims remain span-grounded and reviewed individually.',
    'Section synthesis must disclose the single-foundation source concentration.',
    'Third-party sources may be added in later sections for adoption, marketplace, metadata, or operational interpretation, but are not required for protocol-definition truth.',
  ],
};

// ---------------------------------------------------------------------------
// Test 1 — Schema validation
// ---------------------------------------------------------------------------

describe('SectionScopedWaiverSchema', () => {
  it('accepts a valid entry; rejects bad shapes', () => {
    expect(() => SectionScopedWaiverSchema.parse(XRPL_MONOPOLY_WAIVER)).not.toThrow();

    // Missing reason → fail (z.string().min(1))
    expect(() =>
      SectionScopedWaiverSchema.parse({ ...XRPL_MONOPOLY_WAIVER, reason: '' }),
    ).toThrow(z.ZodError);

    // Empty compensating_controls → fail (z.array().min(1))
    expect(() =>
      SectionScopedWaiverSchema.parse({
        ...XRPL_MONOPOLY_WAIVER,
        compensating_controls: [],
      }),
    ).toThrow(z.ZodError);

    // Invalid scope enum → fail
    expect(() =>
      SectionScopedWaiverSchema.parse({
        ...XRPL_MONOPOLY_WAIVER,
        scope: 'min_sources',
      }),
    ).toThrow(z.ZodError);

    // Bad section_id regex (no leading two-digit prefix) → fail
    expect(() =>
      SectionScopedWaiverSchema.parse({
        ...XRPL_MONOPOLY_WAIVER,
        section_id: 'token-surface',
      }),
    ).toThrow(z.ZodError);

    // PrimarySourceWaiverSchema embeds the array; defaults to []
    const parsed = PrimarySourceWaiverSchema.parse({});
    expect(parsed.section_waivers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Gate-side: section_id MATCH converts min_independent_publishers
// ---------------------------------------------------------------------------

describe('applyWaivers — section-scoped min_independent_publishers', () => {
  it('converts matching section min_independent_publishers fail to pass_with_waiver', () => {
    const research = makeResearch({ sectionWaivers: [XRPL_MONOPOLY_WAIVER] });
    const input = makeGateInput({ research });
    const raw = checkSourceFloor(input);
    const { updatedResults, waivers_applied, waiver_validation_failures } = applyWaivers(
      input,
      raw,
    );
    const conv = updatedResults.find((r) => r.check === 'min_independent_publishers');
    expect(conv?.status).toBe('pass_with_waiver');
    expect(conv?.blocks_synthesis).toBe(false);
    expect(waivers_applied).toHaveLength(1);
    expect(waivers_applied[0]?.check).toBe('min_independent_publishers');
    expect(waiver_validation_failures).toHaveLength(0);
  });

  // Test 3 — Gate-side: section_id MISMATCH leaves fail unchanged
  it('leaves min_independent_publishers fail untouched when section_id does not match', () => {
    const mismatched: SectionScopedWaiver = {
      ...XRPL_MONOPOLY_WAIVER,
      section_id: OTHER_SECTION_ID,
    };
    const research = makeResearch({
      sectionWaivers: [mismatched],
      sectionIds: [SECTION_ID, OTHER_SECTION_ID],
    });
    const input = makeGateInput({ research, sectionId: SECTION_ID });
    const raw = checkSourceFloor(input);
    const { updatedResults, waivers_applied } = applyWaivers(input, raw);
    const conv = updatedResults.find((r) => r.check === 'min_independent_publishers');
    expect(conv?.status).toBe('fail');
    expect(conv?.blocks_synthesis).toBe(true);
    expect(waivers_applied).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Gate-side: primary_sources_required via section-scoped waiver
// ---------------------------------------------------------------------------

describe('applyWaivers — section-scoped primary_sources_required', () => {
  it('converts matching section primary_sources_required fail to pass_with_waiver', () => {
    const waiver: SectionScopedWaiver = {
      section_id: SECTION_ID,
      scope: 'primary_sources_required',
      reason: 'no public primaries exist for this protocol layer',
      compensating_controls: ['operator-staged URLs verified for text-content'],
    };
    const research = makeResearch({ sectionWaivers: [waiver] });
    const input = makeGateInput({ research });
    const raw = checkSourceFloor(input);
    const { updatedResults, waivers_applied } = applyWaivers(input, raw);
    const conv = updatedResults.find((r) => r.check === 'primary_sources_required');
    expect(conv?.status).toBe('pass_with_waiver');
    expect(waivers_applied[0]?.check).toBe('primary_sources_required');
  });
});

// ---------------------------------------------------------------------------
// Test 5 — Backward compat: pack-level waiver with section_waivers: []
// ---------------------------------------------------------------------------

describe('applyWaivers — pack-level waiver regression', () => {
  it('pack-level waiver still converts primary_sources_required when section_waivers is empty', () => {
    const research = makeResearch({ packLevelWaiver: 'granted', sectionWaivers: [] });
    const input = makeGateInput({ research });
    const raw = checkSourceFloor(input);
    const { updatedResults, waivers_applied } = applyWaivers(input, raw);
    const conv = updatedResults.find((r) => r.check === 'primary_sources_required');
    expect(conv?.status).toBe('pass_with_waiver');
    // Pack-level waiver only converts primary_sources_required (existing behavior).
    expect(waivers_applied.some((w) => w.check === 'primary_sources_required')).toBe(true);
    // Pack-level waiver does NOT touch min_independent_publishers (existing behavior).
    const monopoly = updatedResults.find((r) => r.check === 'min_independent_publishers');
    expect(monopoly?.status).toBe('fail');
  });
});

// ---------------------------------------------------------------------------
// Test 6 — Pack policy primary_source_waiver_allowed: false blocks BOTH
// ---------------------------------------------------------------------------

describe('applyWaivers — pack-policy refusal', () => {
  it('section-scoped waiver fails validation when primary_source_waiver_allowed is false', () => {
    const research = makeResearch({
      sectionWaivers: [XRPL_MONOPOLY_WAIVER],
      primarySourceWaiverAllowed: false,
    });
    const input = makeGateInput({ research });
    const raw = checkSourceFloor(input);
    const { updatedResults, waivers_applied, waiver_validation_failures } = applyWaivers(
      input,
      raw,
    );
    const conv = updatedResults.find((r) => r.check === 'min_independent_publishers');
    expect(conv?.status).toBe('fail');
    expect(waivers_applied).toHaveLength(0);
    expect(
      waiver_validation_failures.some(
        (f) => f.check === 'section_scoped_waiver_allowed_by_pack',
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 7 — Multiple sections each with their own waiver
// ---------------------------------------------------------------------------

describe('applyWaivers — multiple section waivers', () => {
  it('applies only the waiver matching the active section, ignores others', () => {
    const otherWaiver: SectionScopedWaiver = {
      ...XRPL_MONOPOLY_WAIVER,
      section_id: OTHER_SECTION_ID,
      reason: 'other section reason',
      compensating_controls: ['other control'],
    };
    const research = makeResearch({
      sectionWaivers: [XRPL_MONOPOLY_WAIVER, otherWaiver],
      sectionIds: [SECTION_ID, OTHER_SECTION_ID],
    });

    // Section 01: should pick up XRPL_MONOPOLY_WAIVER, not otherWaiver
    const inp1 = makeGateInput({ research, sectionId: SECTION_ID });
    const r1 = applyWaivers(inp1, checkSourceFloor(inp1));
    expect(r1.waivers_applied).toHaveLength(1);
    expect(r1.waivers_applied[0]?.reason).toContain('canonical protocol sources');

    // Section 02: should pick up otherWaiver, not XRPL_MONOPOLY_WAIVER
    const inp2 = makeGateInput({ research, sectionId: OTHER_SECTION_ID });
    const r2 = applyWaivers(inp2, checkSourceFloor(inp2));
    expect(r2.waivers_applied).toHaveLength(1);
    expect(r2.waivers_applied[0]?.reason).toBe('other section reason');
  });
});

// ---------------------------------------------------------------------------
// Test 8 — Two waivers for the same section (different scopes)
// ---------------------------------------------------------------------------

describe('applyWaivers — multiple scopes for same section', () => {
  it('applies both min_independent_publishers and primary_sources_required waivers', () => {
    const monopoly = XRPL_MONOPOLY_WAIVER;
    const primary: SectionScopedWaiver = {
      section_id: SECTION_ID,
      scope: 'primary_sources_required',
      reason: 'no public primaries',
      compensating_controls: ['operator-staged URLs'],
    };
    const research = makeResearch({ sectionWaivers: [monopoly, primary] });
    const input = makeGateInput({ research });
    const raw = checkSourceFloor(input);
    const { updatedResults, waivers_applied } = applyWaivers(input, raw);
    expect(waivers_applied).toHaveLength(2);
    expect(updatedResults.find((r) => r.check === 'min_independent_publishers')?.status).toBe(
      'pass_with_waiver',
    );
    expect(updatedResults.find((r) => r.check === 'primary_sources_required')?.status).toBe(
      'pass_with_waiver',
    );
  });
});

// ---------------------------------------------------------------------------
// Test 9 — waivers_applied[] disclosure (reason + compensating controls)
// ---------------------------------------------------------------------------

describe('applyWaivers — disclosure in WaiverApplication', () => {
  it('records reason + compensating_controls verbatim on the applied entry', () => {
    const research = makeResearch({ sectionWaivers: [XRPL_MONOPOLY_WAIVER] });
    const input = makeGateInput({ research });
    const raw = checkSourceFloor(input);
    const { waivers_applied } = applyWaivers(input, raw);
    const entry = waivers_applied[0];
    expect(entry?.reason).toBe(XRPL_MONOPOLY_WAIVER.reason);
    expect(entry?.compensating_controls).toEqual(XRPL_MONOPOLY_WAIVER.compensating_controls);
    expect(entry?.original_status).toBe('fail');
    expect(entry?.new_status).toBe('pass_with_waiver');
  });
});

// ---------------------------------------------------------------------------
// Test 10 — Reviewer-side WITH waiver: source_cluster_monopoly does NOT route
// ---------------------------------------------------------------------------

describe('deriveClaimReviews — section-scoped waiver acknowledgement', () => {
  it('claim with only source_cluster_monopoly warn reaches accepted_for_synthesis when waiver active', () => {
    const claim = makeClaim('clm_aaaaaaaaaaaa_heuristic_1');
    const monopoly = makeFinding({
      finding_id: 'fnd_aaaaaaaaaaaa',
      claim_ids: [claim.claim_id],
      category: 'source_cluster_monopoly',
      severity: 'warn',
    });
    const reviews = deriveClaimReviews({
      claims: [claim],
      findings: [monopoly],
      reviewer: 'heuristic',
      reviewMethod: 'm',
      activeSectionWaivers: [XRPL_MONOPOLY_WAIVER],
    });
    expect(reviews[0]?.decision).toBe('accepted_for_synthesis');
    // Finding remains visible as caveat — not removed
    expect(reviews[0]?.finding_ids).toContain('fnd_aaaaaaaaaaaa');
    // Reason annotated as waived
    expect(reviews[0]?.reason).toContain('waived');
  });

  it('per-claim source_quality_problem still routes to needs_source_repair even with monopoly waiver', () => {
    const claim = makeClaim('clm_bbbbbbbbbbbb_heuristic_1');
    const monopoly = makeFinding({
      finding_id: 'fnd_bbbbbbbbbbbb',
      claim_ids: [claim.claim_id],
      category: 'source_cluster_monopoly',
      severity: 'warn',
    });
    const perClaimQuality = makeFinding({
      finding_id: 'fnd_cccccccccccc',
      claim_ids: [claim.claim_id],
      category: 'source_quality_problem',
      severity: 'warn',
    });
    const reviews = deriveClaimReviews({
      claims: [claim],
      findings: [monopoly, perClaimQuality],
      reviewer: 'heuristic',
      reviewMethod: 'm',
      activeSectionWaivers: [XRPL_MONOPOLY_WAIVER],
    });
    expect(reviews[0]?.decision).toBe('needs_source_repair');
  });
});

// ---------------------------------------------------------------------------
// Test 11 — Reviewer-side WITHOUT waiver: regression — same fixture routes
// ---------------------------------------------------------------------------

describe('deriveClaimReviews — regression without waiver', () => {
  it('claim with only source_cluster_monopoly warn routes to needs_source_repair (regression)', () => {
    const claim = makeClaim('clm_aaaaaaaaaaaa_heuristic_1');
    const monopoly = makeFinding({
      finding_id: 'fnd_dddddddddddd',
      claim_ids: [claim.claim_id],
      category: 'source_cluster_monopoly',
      severity: 'warn',
    });
    const reviews = deriveClaimReviews({
      claims: [claim],
      findings: [monopoly],
      reviewer: 'heuristic',
      reviewMethod: 'm',
      // No activeSectionWaivers passed — old behavior must be preserved.
    });
    expect(reviews[0]?.decision).toBe('needs_source_repair');
    expect(reviews[0]?.reason).not.toContain('waived');
  });
});

// ---------------------------------------------------------------------------
// Test 12 — Audit aggregate annotates waived rows
// ---------------------------------------------------------------------------

describe('audit aggregate — section-waiver disclosure', () => {
  it('weak-sources and source-diversity-gaps rows carry waived: true + waiver_reason', () => {
    const research = makeResearch({ sectionWaivers: [XRPL_MONOPOLY_WAIVER] });
    const sources: SourceCard[] = [
      makeSource({ source_id: 'src_x1', section_id: SECTION_ID }),
      makeSource({ source_id: 'src_x2', section_id: SECTION_ID }),
    ];
    const input: AggregateInput = {
      research,
      perSection: new Map([
        [
          SECTION_ID,
          {
            claims: [],
            candidateClaims: [],
            claimReviews: [],
            contradictions: [],
            resolutions: [],
            dispositions: [],
            gate: null,
            findings: [],
            sourceIdsForSection: sources.map((s) => s.source_id),
          },
        ],
      ]),
      sources,
      receipts: sources.map((s) => makeReceipt({ source_id: s.source_id })),
      handoff: null,
      generatedAt: '2026-05-09T00:00:00.000Z',
      warnings: [],
    };
    const out = aggregate(input);
    const monopolyWeakRow = out.weakSources.find(
      (r) => r.reason === 'source_cluster_monopoly' && r.section_id === SECTION_ID,
    );
    expect(monopolyWeakRow?.waived).toBe(true);
    expect(monopolyWeakRow?.waiver_reason).toBe(XRPL_MONOPOLY_WAIVER.reason);

    const diversityRow = out.sourceDiversityGaps.find(
      (r) => r.reason === 'section_publisher_monopoly' && r.section_id === SECTION_ID,
    );
    expect(diversityRow?.waived).toBe(true);
    expect(diversityRow?.waiver_reason).toBe(XRPL_MONOPOLY_WAIVER.reason);

    // Without a waiver, the rows should NOT carry waived flag (regression).
    const researchNoWaiver = makeResearch({ sectionWaivers: [] });
    const out2 = aggregate({ ...input, research: researchNoWaiver });
    const unwaivedRow = out2.weakSources.find(
      (r) => r.reason === 'source_cluster_monopoly',
    );
    expect(unwaivedRow?.waived).toBeUndefined();
  });
});
