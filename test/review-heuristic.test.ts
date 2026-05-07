import { describe, it, expect } from 'vitest';
import { HeuristicReviewer } from '../src/review/reviewers/heuristic.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';
import type { Claim } from '../src/claims/schema.js';
import type { Contradiction } from '../src/contradictions/schema.js';
import type { FetchReceipt, SourceCard } from '../src/sources/schema.js';
import type { ReviewerInput } from '../src/review/types.js';

const reviewer = new HeuristicReviewer();

function makeResearch() {
  return ResearchYamlSchema.parse({
    research_os_version: '0.1.0',
    created_at: '2026-05-06T22:00:00.000Z',
    topic: 'How does the heuristic reviewer behave on synthetic input?',
    sections: [
      {
        id: '01-test',
        purpose: 'probe',
        max_time_minutes: 45,
        min_sources: 2,
        primary_sources_required: 1,
        contradictions_required: false,
        status: 'draft',
      },
    ],
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
    asserts: 'something concise',
    scope: 'narrow scope',
    not: 'broad scope',
    evidence_excerpt: 'something concise',
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
    type: 'direct_conflict',
    summary: 'mock',
    scope_analysis: '',
    overlap_assessment: 'partially_overlapping',
    severity: 'medium',
    confidence: 'low',
    detector: 'heuristic',
    detection_method: 'm',
    evidence: '',
    status: 'unresolved',
    created_at: '2026-05-06T22:00:00.000Z',
    ...overrides,
  };
}

function makeInput(overrides: Partial<ReviewerInput> = {}): ReviewerInput {
  const research = overrides.research ?? makeResearch();
  return {
    research,
    section: research.sections[0]!,
    candidateClaims: overrides.candidateClaims ?? [],
    sources: overrides.sources ?? [],
    receipts: overrides.receipts ?? [],
    contradictions: overrides.contradictions ?? [],
    gateResult: overrides.gateResult ?? null,
    rawTextBySourceId: overrides.rawTextBySourceId ?? new Map(),
    briefText: overrides.briefText ?? null,
  };
}

describe('HeuristicReviewer', () => {
  it('is always available', async () => {
    expect(await reviewer.available()).toBe(true);
  });

  it('flags unsupported_claim when claim cites no resolved source', async () => {
    const result = await reviewer.review(makeInput({
      candidateClaims: [makeClaim({})],
      sources: [],
      receipts: [],
    }));
    if (!result.ok) throw new Error('failed');
    expect(result.drafts.some((f) => f.category === 'unsupported_claim' && f.severity === 'block')).toBe(true);
  });

  it('flags ungrounded_excerpt when excerpt is not in raw text', async () => {
    const result = await reviewer.review(makeInput({
      candidateClaims: [makeClaim({ evidence_excerpt: 'this exact phrase does not exist in raw text' })],
      sources: [makeSource({})],
      receipts: [makeReceipt({})],
      rawTextBySourceId: new Map([['src_aaaaaaaaaaaa', 'a totally different body of text']]),
    }));
    if (!result.ok) throw new Error('failed');
    expect(result.drafts.some((f) => f.category === 'ungrounded_excerpt' && f.severity === 'block')).toBe(true);
  });

  it('flags overgeneralized_claim when scope is null on a substantive assertion', async () => {
    const result = await reviewer.review(makeInput({
      candidateClaims: [makeClaim({
        scope: null,
        asserts: 'this is a long substantive assertion about something that has more than forty characters',
      })],
      sources: [makeSource({})],
      receipts: [makeReceipt({})],
      rawTextBySourceId: new Map([['src_aaaaaaaaaaaa', 'this is a long substantive assertion about something that has more than forty characters']]),
    }));
    if (!result.ok) throw new Error('failed');
    expect(result.drafts.some((f) => f.category === 'overgeneralized_claim')).toBe(true);
  });

  it('flags missing_not_constraint as info when not is null', async () => {
    const result = await reviewer.review(makeInput({
      candidateClaims: [makeClaim({ not: null })],
      sources: [makeSource({})],
      receipts: [makeReceipt({})],
      rawTextBySourceId: new Map([['src_aaaaaaaaaaaa', 'something concise body']]),
    }));
    if (!result.ok) throw new Error('failed');
    expect(result.drafts.some((f) => f.category === 'missing_not_constraint' && f.severity === 'info')).toBe(true);
  });

  it('flags source_cluster_monopoly when all cited sources share a single publisher', async () => {
    const result = await reviewer.review(makeInput({
      candidateClaims: [makeClaim({
        source_ids: ['src_aaaaaaaaaaaa', 'src_bbbbbbbbbbbb'],
      })],
      sources: [
        makeSource({ source_id: 'src_aaaaaaaaaaaa', publisher: 'OnePublisher' }),
        makeSource({ source_id: 'src_bbbbbbbbbbbb', publisher: 'OnePublisher' }),
      ],
      receipts: [
        makeReceipt({ source_id: 'src_aaaaaaaaaaaa' }),
        makeReceipt({ source_id: 'src_bbbbbbbbbbbb', receipt_id: 'rcpt_bbbbbbbbbbbb_1' }),
      ],
      rawTextBySourceId: new Map([
        ['src_aaaaaaaaaaaa', 'something concise'],
        ['src_bbbbbbbbbbbb', 'something concise'],
      ]),
    }));
    if (!result.ok) throw new Error('failed');
    expect(result.drafts.some((f) => f.category === 'source_cluster_monopoly')).toBe(true);
  });

  it('flags source_quality_problem when high-confidence claim cites only forum/unknown sources', async () => {
    const result = await reviewer.review(makeInput({
      candidateClaims: [makeClaim({ confidence: 'high' })],
      sources: [makeSource({ source_type: 'forum' })],
      receipts: [makeReceipt({})],
      rawTextBySourceId: new Map([['src_aaaaaaaaaaaa', 'something concise']]),
    }));
    if (!result.ok) throw new Error('failed');
    expect(result.drafts.some((f) => f.category === 'source_quality_problem')).toBe(true);
  });

  it('flags stale_claim when source predates freshness policy', async () => {
    const research = makeResearch();
    research.freshness.required = true;
    research.freshness.max_source_age_months = 6;
    const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 2).toISOString();
    const result = await reviewer.review(makeInput({
      research,
      candidateClaims: [makeClaim({})],
      sources: [makeSource({ published_at: oldDate })],
      receipts: [makeReceipt({})],
      rawTextBySourceId: new Map([['src_aaaaaaaaaaaa', 'something concise']]),
    }));
    if (!result.ok) throw new Error('failed');
    expect(result.drafts.some((f) => f.category === 'stale_claim')).toBe(true);
  });

  it('flags unmapped_contradiction with block severity for high-severity unresolved involvement', async () => {
    const result = await reviewer.review(makeInput({
      candidateClaims: [makeClaim({})],
      sources: [makeSource({})],
      receipts: [makeReceipt({})],
      rawTextBySourceId: new Map([['src_aaaaaaaaaaaa', 'something concise']]),
      contradictions: [makeContradiction({ severity: 'high' })],
    }));
    if (!result.ok) throw new Error('failed');
    const f = result.drafts.find((d) => d.category === 'unmapped_contradiction');
    expect(f?.severity).toBe('block');
  });

  it('flags hidden_synthesis warn when brief.md exceeds stub threshold', async () => {
    const longBrief = '# Section\n\n' + 'x'.repeat(700);
    const result = await reviewer.review(makeInput({
      candidateClaims: [makeClaim({})],
      sources: [makeSource({})],
      receipts: [makeReceipt({})],
      rawTextBySourceId: new Map([['src_aaaaaaaaaaaa', 'something concise']]),
      briefText: longBrief,
    }));
    if (!result.ok) throw new Error('failed');
    expect(result.drafts.some((f) => f.category === 'hidden_synthesis')).toBe(true);
  });

  it('does not flag hidden_synthesis when brief.md still has the stub marker', async () => {
    const stubBrief = '# Section\n\nThis section has not been gathered yet.\n' + 'x'.repeat(700);
    const result = await reviewer.review(makeInput({
      candidateClaims: [makeClaim({})],
      sources: [makeSource({})],
      receipts: [makeReceipt({})],
      rawTextBySourceId: new Map([['src_aaaaaaaaaaaa', 'something concise']]),
      briefText: stubBrief,
    }));
    if (!result.ok) throw new Error('failed');
    expect(result.drafts.some((f) => f.category === 'hidden_synthesis')).toBe(false);
  });

  it('flags claim_overproduction when one source carries >= 30 candidate claims', async () => {
    const claims: Claim[] = Array.from({ length: 32 }, (_, i) =>
      makeClaim({
        claim_id: `clm_aaaaaaaaaaaa_heuristic_${i + 1}`,
        asserts: `unique assertion #${i + 1} that is long enough to count.`,
      }),
    );
    const result = await reviewer.review(
      makeInput({
        candidateClaims: claims,
        sources: [makeSource({})],
        receipts: [makeReceipt({})],
        rawTextBySourceId: new Map([['src_aaaaaaaaaaaa', 'something concise']]),
      }),
    );
    if (!result.ok) throw new Error('failed');
    const overproduction = result.drafts.filter((f) => f.category === 'claim_overproduction');
    expect(overproduction.length).toBeGreaterThanOrEqual(1);
    // Severity rises to 'block' once a single source dominates strongly.
    expect(overproduction.some((f) => f.severity === 'block' || f.severity === 'warn')).toBe(true);
  });

  it('flags claim_overproduction when 3+ claims share normalised asserts', async () => {
    const claims: Claim[] = [
      makeClaim({ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', asserts: 'A is B.' }),
      makeClaim({ claim_id: 'clm_aaaaaaaaaaaa_heuristic_2', asserts: 'A IS B.' }),
      makeClaim({ claim_id: 'clm_aaaaaaaaaaaa_heuristic_3', asserts: 'a is b!' }),
    ];
    const result = await reviewer.review(
      makeInput({
        candidateClaims: claims,
        sources: [makeSource({})],
        receipts: [makeReceipt({})],
        rawTextBySourceId: new Map([['src_aaaaaaaaaaaa', 'something concise']]),
      }),
    );
    if (!result.ok) throw new Error('failed');
    expect(result.drafts.some((f) => f.category === 'claim_overproduction')).toBe(true);
  });

  it('does not flag claim_overproduction on tiny sections (1-2 claims)', async () => {
    const claims: Claim[] = [makeClaim({})];
    const result = await reviewer.review(
      makeInput({
        candidateClaims: claims,
        sources: [makeSource({})],
        receipts: [makeReceipt({})],
        rawTextBySourceId: new Map([['src_aaaaaaaaaaaa', 'something concise']]),
      }),
    );
    if (!result.ok) throw new Error('failed');
    expect(result.drafts.some((f) => f.category === 'claim_overproduction')).toBe(false);
  });
});
