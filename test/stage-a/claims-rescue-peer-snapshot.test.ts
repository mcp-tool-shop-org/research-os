/**
 * A-CLAIMS-001 regression — rescued claims must NOT inflate a later
 * candidate's eligibility peer count.
 *
 * INVARIANT (both halves proven):
 *   (bad) When two source_content_mismatch candidates from the SAME source
 *         each have only 1 genuine frame-critic survivor as a peer, rescuing
 *         the first must NOT make its now-frame_excluded=false state count as
 *         a peer for the second — i.e. the second must stay ineligible
 *         (peer_count must be measured against the FROZEN pre-rescue basis).
 *   (good) When there are genuinely >=2 independent survivors, an eligible
 *          candidate still passes the gate and the LLM rescue critic fires.
 *
 * Pre-fix, runR012RescueStage recomputed peers from the LIVE drafts array; a
 * successful first rescue flipped target.frame_excluded=false in place, which
 * inflated the second candidate's peer_count to 2 and let it (wrongly) become
 * eligible. The fix snapshots frame_excluded once before the candidate loop.
 */
import { describe, it, expect } from 'vitest';

import { MCPClaimExtractor } from '../../src/claims/extractors/mcp.js';
import { MCPClientHandle } from '../../src/mcp/client.js';
import type { Excerpt } from '../../src/sources/excerpts/schema.js';
import type { SourceCard } from '../../src/sources/schema.js';

interface CapturedCall {
  name: string;
  arguments: Record<string, unknown>;
}

function makeQueuedExtractor(args: {
  responses: Array<() => { content: Array<{ type: string; text: string }>; isError?: boolean }>;
}): { extractor: MCPClaimExtractor; capture: CapturedCall[] } {
  const capture: CapturedCall[] = [];
  let cursor = 0;
  const extractor = new MCPClaimExtractor({
    handleFactory: () => {
      const fake = {
        async callTool(params: { name: string; arguments: Record<string, unknown> }) {
          capture.push({ name: params.name, arguments: params.arguments });
          const fn = args.responses[cursor];
          cursor += 1;
          if (!fn) {
            throw new Error(
              `Unexpected MCP call #${cursor} (only ${args.responses.length} responses queued). Last call name=${params.name}`,
            );
          }
          return fn();
        },
      };
      const handle = new MCPClientHandle({});
      (handle as unknown as { connect: () => Promise<unknown> }).connect = async () => fake;
      (handle as unknown as { close: () => Promise<void> }).close = async () => {};
      return handle;
    },
  });
  return { extractor, capture };
}

function extractEnvelope(claims: Array<Record<string, unknown>>) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ result: { ok: true, data: { claims } }, model: 'hermes3:8b' }),
      },
    ],
  };
}

function criticEnvelope(
  label: 'supports_section' | 'off_topic' | 'background_only' | 'source_chrome',
  rationale: string,
) {
  return {
    content: [
      { type: 'text', text: JSON.stringify({ result: { ok: true, data: { label, rationale } } }) },
    ],
  };
}

function rescueEnvelope(
  label: 'rescue' | 'decline',
  rationale: string,
  rescueScope?: string,
  rescueBoundary?: string,
) {
  const data: Record<string, unknown> = { label, rationale };
  if (label === 'rescue') {
    data.rescue_scope = rescueScope ?? '';
    data.rescue_boundary = rescueBoundary ?? '';
  } else {
    data.rescue_scope = null;
    data.rescue_boundary = null;
  }
  return {
    content: [{ type: 'text', text: JSON.stringify({ result: { ok: true, data } }) }],
  };
}

const baseCard: SourceCard = {
  source_id: 'src_f6ffc9e9d86f',
  receipt_id: 'rcpt_f6ffc9e9d86f_1700000000000',
  section_id: '01-test',
  url: 'https://example.com/x',
  final_url: 'https://example.com/x',
  fetched_at: '2026-05-06T22:00:00.000Z',
  publisher: 'Healthline',
  published_at: null,
  title: 'DST coverage',
  source_type: 'secondary',
  relevance: 'unknown',
  key_points: ['kp1'],
  limitations: [],
  asserts: 'Coverage of DST crash research',
  scope: null,
  not: null,
  extracted_by: 'heuristic',
  extracted_at: '2026-05-06T22:00:00.000Z',
};

function ex(idx: number, text: string): Excerpt {
  return {
    excerpt_id: `ex_f6ffc9e9d86f_${String(idx).padStart(3, '0')}`,
    source_id: 'src_f6ffc9e9d86f',
    source_hash: null,
    text,
    location_hint: `paragraph ${idx}`,
    char_start: 0,
    char_end: text.length,
    origin: 'raw_text',
    created_at: '2026-05-06T22:00:00.000Z',
  };
}

const purpose = 'What does the empirical literature say about DST motor-vehicle crash effects?';

// Body vocabulary: claims 1 and 2 overlap (survive R-011); claims 3 and 4 use
// orthogonal vocabulary (R-011 fires → source_content_mismatch candidates).
const dstBody =
  'Motor-vehicle crash spike following spring transition. Sleep loss mechanism. Monday morning elevated risk.';

describe('A-CLAIMS-001 — a rescued candidate must not inflate a later candidate peer_count', () => {
  it('bad-input half: rescuing candidate A first must NOT raise candidate B recorded peer_count above the true survivor count', async () => {
    // 2 survivors (S1, S2) + 2 source_content_mismatch candidates (A, B), in
    // draft order [S1, S2, A, B]. The eligibility gate counts each candidate's
    // OTHER drafts that are non-excluded SURVIVORS.
    //
    //   Candidate A peers: {S1:survivor, S2:survivor, B:excluded} → peer_count 2.
    //     A is eligible and the LLM rescues it, flipping A.frame_excluded=false.
    //   Candidate B peers: {S1:survivor, S2:survivor, A:???}.
    //     Pre-fix bug: reads the LIVE drafts array → A is now frame_excluded
    //       =false → B.peer_count = 3 (A wrongly counted as a survivor/peer).
    //     Fixed: reads the FROZEN pre-rescue snapshot → A stays excluded → B
    //       .peer_count = 2 (only the true survivors S1, S2 count).
    //
    // The recorded peer_count on candidate B's rescue_eligibility_check is the
    // observable discriminator: 2 (fixed) vs 3 (buggy).
    const { extractor } = makeQueuedExtractor({
      responses: [
        () =>
          extractEnvelope([
            { // S1 survivor (overlaps body)
              asserts: 'Motor-vehicle crash rates spike following spring transition.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_001'],
              confidence: 'high',
            },
            { // S2 survivor (overlaps body)
              asserts: 'Sleep loss mechanism explains Monday morning spike.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_002'],
              confidence: 'high',
            },
            { // A — mismatch (orthogonal vocab)
              asserts: 'Geographic chronotype moderates exposure.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_003'],
              confidence: 'high',
            },
            { // B — mismatch (orthogonal vocab)
              asserts: 'Latitude photoperiod alters circadian alignment.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_004'],
              confidence: 'high',
            },
          ]),
        // critic calls for the 2 survivors
        () => criticEnvelope('supports_section', 'Direct DST crash finding.'),
        () => criticEnvelope('supports_section', 'Sleep-loss mechanism finding.'),
        // Candidate A: eligible (peer_count 2) → LLM rescues it.
        () =>
          rescueEnvelope(
            'rescue',
            'Genuine moderator aside.',
            'geographic chronotype moderator on DST crash risk',
            'not generalizing to all DST effects',
          ),
        // Candidate B: eligible too → LLM rescues it. We only assert B's
        // recorded peer_count, which must be 2 (frozen), not 3 (live bug).
        () =>
          rescueEnvelope(
            'rescue',
            'Genuine moderator aside.',
            'latitude photoperiod moderator on DST crash risk',
            'not generalizing to all DST effects',
          ),
      ],
    });
    const result = await extractor.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: [
        ex(1, 'Motor-vehicle crash rates spike following spring transition.'),
        ex(2, 'Sleep-loss mechanism explains Monday morning spike.'),
        ex(3, 'Geographic chronotype moderator aside.'),
        ex(4, 'Latitude photoperiod aside.'),
      ],
      framePurpose: purpose,
      sourceRawText: dstBody,
    });
    if (!result.ok) throw new Error(`extract failed: ${result.error}`);

    const b = result.claims.find((c) =>
      c.asserts.toLowerCase().includes('latitude photoperiod'),
    )!;
    expect(b).toBeTruthy();
    // The discriminator: B's eligibility must have been judged against the
    // true survivor count (2), NOT inflated by the already-rescued candidate A.
    expect(b.rescue_eligibility_check?.peer_count).toBe(2);
  });

  it('good-input half: with 2 genuine survivors, an eligible candidate still passes and the LLM rescue fires', async () => {
    const { extractor, capture } = makeQueuedExtractor({
      responses: [
        () =>
          extractEnvelope([
            {
              asserts: 'Motor-vehicle crash rates spike following spring transition.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_001'],
              confidence: 'high',
            },
            {
              asserts: 'Sleep loss mechanism explains Monday morning spike.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_002'],
              confidence: 'high',
            },
            {
              asserts: 'Geographic chronotype moderates exposure.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_003'],
              confidence: 'high',
            },
          ]),
        () => criticEnvelope('supports_section', 'survivor 1'),
        () => criticEnvelope('supports_section', 'survivor 2'),
        () =>
          rescueEnvelope(
            'rescue',
            'Genuine moderator aside in an otherwise on-topic body.',
            'geographic chronotype moderator on DST crash risk',
            'not generalizing to all DST effects',
          ),
      ],
    });
    const result = await extractor.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: [
        ex(1, 'Motor-vehicle crash rates spike following spring transition.'),
        ex(2, 'Sleep-loss mechanism explains Monday morning spike.'),
        ex(3, 'Geographic chronotype moderator aside.'),
      ],
      framePurpose: purpose,
      sourceRawText: dstBody,
    });
    if (!result.ok) throw new Error(`extract failed: ${result.error}`);
    const rescued = result.claims.find((c) => c.rescue_status === 'rescued_by_llm');
    expect(rescued).toBeTruthy();
    expect(rescued!.rescue_eligibility_check?.peer_count).toBe(2);
    expect(rescued!.frame_excluded).toBe(false);
    const rescueCalls = capture.filter(
      (c) =>
        typeof c.arguments.hint === 'string' &&
        (c.arguments.hint as string).includes('rescue_boundary'),
    );
    expect(rescueCalls).toHaveLength(1);
  });
});
