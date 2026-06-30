// A-REVIEW-002 regression: evidenceGroundedViaLedger (via HeuristicReviewer)
// must resolve evidence_excerpt_ids against the UNION of every cited source's
// ledger. Before the fix it short-circuited on the FIRST source's ledger, so a
// multi-source claim whose excerpt IDs span two sources was false-flagged
// ungrounded (an ungrounded_excerpt finding it should not produce).
//
// Invariant (both halves):
//   - GOOD: a 2-source claim whose two excerpt IDs live in DIFFERENT source
//     ledgers, with evidence_excerpt equal to the deterministic join, produces
//     NO ungrounded_excerpt finding (it resolves against the union).
//   - BAD: a claim citing an excerpt ID that resolves in NO cited source's
//     ledger still produces an ungrounded_excerpt finding.

import { describe, it, expect } from 'vitest';
import { HeuristicReviewer } from '../../src/review/reviewers/heuristic.js';
import type { Claim } from '../../src/claims/schema.js';
import type { Excerpt } from '../../src/sources/excerpts/schema.js';
import type { SourceCard, FetchReceipt } from '../../src/sources/schema.js';
import type { ReviewerInput } from '../../src/review/types.js';
import type { ResearchYaml } from '../../src/intake/schema.js';

const SRC_A = 'src_aaaaaaaaaaaa';
const SRC_B = 'src_bbbbbbbbbbbb';
const EX_A = 'ex_aaaaaaaaaaaa_001';
const EX_B = 'ex_bbbbbbbbbbbb_001';
const JOIN = ' … ';

function excerpt(id: string, sid: string, text: string): Excerpt {
  return {
    excerpt_id: id,
    source_id: sid,
    source_hash: null,
    text,
    location_hint: null,
    char_start: 0,
    char_end: text.length,
    origin: 'raw_text',
    created_at: '2026-06-29T00:00:00.000Z',
  };
}

function card(sid: string): SourceCard {
  return {
    source_id: sid,
    receipt_id: `rcpt_${sid.replace(/^src_/, '')}_1`,
    section_id: '01-test',
    url: 'https://example.com/x',
    final_url: 'https://example.com/x',
    fetched_at: '2026-06-29T00:00:00.000Z',
    publisher: `pub-${sid}`,
    published_at: null,
    title: 'T',
    source_type: 'secondary',
    relevance: 'unknown',
    key_points: [],
    limitations: [],
    asserts: 'A',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-06-29T00:00:00.000Z',
  };
}

function receipt(sid: string): FetchReceipt {
  return {
    receipt_id: `rcpt_${sid.replace(/^src_/, '')}_1`,
    source_id: sid,
    section_id: '01-test',
    requested_url: 'https://example.com/x',
    final_url: 'https://example.com/x',
    status: 200,
    status_text: 'OK',
    content_type: 'text/html',
    fetched_at: '2026-06-29T00:00:00.000Z',
    byte_count: 100,
    sha256: null,
    title: 'T',
    raw_text_path: null,
    fetch_outcome: 'ok',
    fetch_error: null,
    extraction_outcome: 'ok',
    extraction_extractor: 'heuristic',
    extraction_error: null,
  };
}

function claim(args: {
  excerptIds: string[];
  evidenceExcerpt: string;
  sourceIds: string[];
}): Claim {
  return {
    claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
    section_id: '01-test',
    source_ids: args.sourceIds,
    source_hashes: [],
    asserts: 'short',
    scope: 'narrow scope keeps overgeneralized_claim quiet',
    not: 'a not-constraint keeps missing_not_constraint quiet',
    evidence_excerpt_ids: args.excerptIds,
    evidence_excerpt: args.evidenceExcerpt,
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-06-29T00:00:00.000Z',
    review_state: 'candidate',
    frame_excluded: false,
  };
}

function makeInput(c: Claim, ledgers: Map<string, Map<string, Excerpt>>): ReviewerInput {
  const sources = c.source_ids.map(card);
  const research = {
    freshness: { required: false, max_source_age_months: null },
  } as unknown as ResearchYaml;
  return {
    research,
    section: { id: '01-test', purpose: 'probe' } as ReviewerInput['section'],
    candidateClaims: [c],
    sources,
    receipts: c.source_ids.map(receipt),
    contradictions: [],
    gateResult: null,
    rawTextBySourceId: new Map(),
    excerptsBySourceId: ledgers,
    briefText: null,
  };
}

describe('A-REVIEW-002 — heuristic resolves excerpt IDs against union of cited ledgers', () => {
  it('GOOD: multi-source claim spanning two ledgers is NOT flagged ungrounded', async () => {
    const ledgers = new Map<string, Map<string, Excerpt>>([
      [SRC_A, new Map([[EX_A, excerpt(EX_A, SRC_A, 'alpha text')]])],
      [SRC_B, new Map([[EX_B, excerpt(EX_B, SRC_B, 'beta text')]])],
    ]);
    const c = claim({
      sourceIds: [SRC_A, SRC_B],
      excerptIds: [EX_A, EX_B],
      evidenceExcerpt: ['alpha text', 'beta text'].join(JOIN),
    });
    const result = await new HeuristicReviewer().review(makeInput(c, ledgers));
    if (!result.ok) throw new Error('reviewer failed');
    const ungrounded = result.drafts.filter((d) => d.category === 'ungrounded_excerpt');
    expect(ungrounded).toHaveLength(0);
  });

  it('BAD: excerpt ID resolving in NO cited ledger is still flagged ungrounded', async () => {
    const ledgers = new Map<string, Map<string, Excerpt>>([
      [SRC_A, new Map([[EX_A, excerpt(EX_A, SRC_A, 'alpha text')]])],
      [SRC_B, new Map([[EX_B, excerpt(EX_B, SRC_B, 'beta text')]])],
    ]);
    const c = claim({
      sourceIds: [SRC_A, SRC_B],
      excerptIds: [EX_A, 'ex_cccccccccccc_001'], // second ID in no ledger
      evidenceExcerpt: ['alpha text', 'beta text'].join(JOIN),
    });
    const result = await new HeuristicReviewer().review(makeInput(c, ledgers));
    if (!result.ok) throw new Error('reviewer failed');
    const ungrounded = result.drafts.filter((d) => d.category === 'ungrounded_excerpt');
    expect(ungrounded).toHaveLength(1);
  });
});
