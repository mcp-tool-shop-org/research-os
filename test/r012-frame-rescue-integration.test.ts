/**
 * R-012 — Frame-rescue integration tests (v0.12 Slice 1).
 *
 * Covers acceptance tests #3 through #11 from
 * memory/r012_slice_kickoff_prompt.md. The pure eligibility-gate tests
 * (#1, #2, #9 closed-enum) live in r012-rescue-eligibility-gate.test.ts;
 * this file covers everything else:
 *
 *   #3 LLM rescue positive (Preferred shape)
 *   #4 Operator rescue positive
 *   #5 Operator-declined explicit path
 *   #6 v0.3 regression replay (load-bearing)
 *   #7 Adversarial off-topic LLM decline
 *   #8 Original-scope preservation
 *  #10 No silent rescue (audit-trail discipline)
 *  #11 RESEARCH_OS_FRAME_SOURCE_CONTENT=0 env opt-out
 *
 * Tests #12 (1448 baseline) and #13 (4-pack regression byte-identical)
 * are verified at the suite level (npm test) and via the regression
 * script, not in this file.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildRescueCriticToolArgs,
  renderRescuePrompt,
  runRescueCritic,
  type RescueCriticInput,
} from '../src/claims/critic/rescue-critic.js';
import { MCPClaimExtractor } from '../src/claims/extractors/mcp.js';
import { MCPClientHandle } from '../src/mcp/client.js';
import type { Excerpt } from '../src/sources/excerpts/schema.js';
import type { SourceCard } from '../src/sources/schema.js';
import {
  declineClaimRescueByOperator,
  listRescueCandidates,
  readRescueLedger,
  rescueClaimByOperator,
} from '../src/claims/rescue-ledger.js';
import { ClaimSchema, type Claim } from '../src/claims/schema.js';

// ── Helpers — fake MCP client + extractor wiring ─────────────────────────────

interface CapturedCall {
  name: string;
  arguments: Record<string, unknown>;
}

function makeQueuedExtractor(args: {
  responses: Array<() => { content: Array<{ type: string; text: string }>; isError?: boolean }>;
  capture?: CapturedCall[];
}): { extractor: MCPClaimExtractor; capture: CapturedCall[] } {
  const capture = args.capture ?? [];
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

function extractEnvelope(claims: Array<Record<string, unknown>>): {
  content: Array<{ type: string; text: string }>;
} {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          result: { ok: true, data: { claims } },
          tier_used: 'workhorse',
          model: 'hermes3:8b',
          hardware_profile: 'test',
          tokens_in: 100,
          tokens_out: 50,
          elapsed_ms: 10,
        }),
      },
    ],
  };
}

function criticEnvelope(label: 'supports_section' | 'off_topic' | 'background_only' | 'source_chrome', rationale: string): {
  content: Array<{ type: string; text: string }>;
} {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          result: { ok: true, data: { label, rationale } },
          tier_used: 'workhorse',
          model: 'hermes3:8b',
        }),
      },
    ],
  };
}

function rescueEnvelope(
  label: 'rescue' | 'decline',
  rationale: string,
  rescueScope?: string,
  rescueBoundary?: string,
): { content: Array<{ type: string; text: string }> } {
  const data: Record<string, unknown> = { label, rationale };
  if (label === 'rescue') {
    data.rescue_scope = rescueScope ?? '';
    data.rescue_boundary = rescueBoundary ?? '';
  } else {
    data.rescue_scope = null;
    data.rescue_boundary = null;
  }
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          result: { ok: true, data },
          tier_used: 'workhorse',
          model: 'hermes3:8b',
        }),
      },
    ],
  };
}

const baseCard: SourceCard = {
  source_id: 'src_f6ffc9e9d86f',
  receipt_id: 'rcpt_f6ffc9e9d86f_1700000000000',
  section_id: '01-test',
  url: 'https://example.com/healthline-dst',
  final_url: 'https://example.com/healthline-dst',
  fetched_at: '2026-05-06T22:00:00.000Z',
  publisher: 'Healthline',
  published_at: null,
  title: 'Daylight Saving Time Tied to Spike in Fatal Car Crashes',
  source_type: 'secondary',
  relevance: 'unknown',
  key_points: ['kp1'],
  limitations: [],
  asserts: 'Healthline coverage of DST motor-vehicle crash research',
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

// ── Pure rescue-critic tests ─────────────────────────────────────────────────

describe('R-012 rescue critic — renderRescuePrompt + buildRescueCriticToolArgs', () => {
  const baseInput: RescueCriticInput = {
    sectionPurpose: 'What does the empirical literature say about DST workplace effects?',
    claimAsserts: 'Fatal crashes increase about 8 percent on the western edge of time zones during DST.',
    sourceTitle: 'Healthline DST coverage',
    sourcePublisher: 'Healthline',
    sourceType: 'secondary',
    sourceExcerpt: 'A study found fatal car crashes spike following the spring DST transition; the effect is more pronounced on the western edge of time zones.',
    peerAsserts: [
      'Fatal motor-vehicle crashes increase 6% in the days following the spring DST transition.',
      'Sleep loss following the spring transition is the main driver of the increase.',
    ],
  };

  it('renders the prompt with contrastive framing (both rescue and decline options visible)', () => {
    const prompt = renderRescuePrompt(baseInput);
    expect(prompt).toContain('rescue:');
    expect(prompt).toContain('decline:');
    expect(prompt).toContain('legitimate aside / moderator / tangential finding');
    expect(prompt).toContain('precheck is correct');
  });

  it('renders peer asserts as a numbered list with the count called out', () => {
    const prompt = renderRescuePrompt(baseInput);
    expect(prompt).toContain('2 other claim(s)');
    expect(prompt).toContain('1. Fatal motor-vehicle crashes increase 6%');
    expect(prompt).toContain('2. Sleep loss following the spring transition');
  });

  it('truncates very long source excerpts to a bounded length', () => {
    const huge = 'workplace productivity '.repeat(10_000);
    const prompt = renderRescuePrompt({ ...baseInput, sourceExcerpt: huge });
    expect(prompt.length).toBeLessThan(huge.length / 2);
  });

  it('omits source-card lines when their values are absent', () => {
    const prompt = renderRescuePrompt({
      ...baseInput,
      sourceTitle: null,
      sourcePublisher: null,
      sourceType: null,
    });
    expect(prompt).not.toContain('Source title:');
    expect(prompt).not.toContain('Publisher:');
    expect(prompt).not.toContain('Source type:');
  });

  it('buildRescueCriticToolArgs produces ollama_extract args with the rescue schema and hint', () => {
    const args = buildRescueCriticToolArgs(baseInput);
    expect(args.text).toEqual(expect.any(String));
    expect(args.schema).toMatchObject({
      type: 'object',
      properties: expect.objectContaining({
        label: expect.objectContaining({ enum: ['rescue', 'decline'] }),
      }),
    });
    expect(args.hint).toMatch(/rescue_scope/);
    expect(args.hint).toMatch(/rescue_boundary/);
  });

  it('passes effectiveModel through when supplied', () => {
    const args = buildRescueCriticToolArgs({ ...baseInput, effectiveModel: 'hermes3:8b' });
    expect(args.model).toBe('hermes3:8b');
  });
});

describe('R-012 rescue critic — runRescueCritic envelope parsing', () => {
  const input: RescueCriticInput = {
    sectionPurpose: 'DST effects',
    claimAsserts: 'The western-edge moderator effect on DST crashes.',
    peerAsserts: ['Other accepted DST claim 1', 'Other accepted DST claim 2'],
  };

  function fakeClient(envelope: () => { content: Array<{ type: string; text: string }>; isError?: boolean }) {
    return {
      callTool: async () => envelope(),
    };
  }

  it('returns ok=true + rescue label + scope + boundary on a clean rescue response', async () => {
    const result = await runRescueCritic(
      fakeClient(() =>
        rescueEnvelope(
          'rescue',
          'Western-edge effect is genuinely supported by the source body context.',
          'western-edge-of-time-zone moderator effect on DST crash rates',
          'not generalizing to all DST effects or other geographical moderators',
        ),
      ),
      input,
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.label === 'rescue') {
      expect(result.rescueScope).toMatch(/western-edge/);
      expect(result.rescueBoundary).toMatch(/not generalizing/);
      expect(result.rationale).toMatch(/genuinely supported/);
    } else {
      throw new Error(`Expected ok=true rescue, got ${JSON.stringify(result)}`);
    }
  });

  it('returns ok=true + decline label on a decline response', async () => {
    const result = await runRescueCritic(
      fakeClient(() => rescueEnvelope('decline', 'The claim is not substantively grounded in this source.')),
      input,
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.label === 'decline') {
      expect(result.rationale).toMatch(/not substantively grounded/);
    } else {
      throw new Error('Expected ok=true decline');
    }
  });

  it('returns ok=false on rescue label with empty rescue_boundary (contract violation → operator path)', async () => {
    const result = await runRescueCritic(
      fakeClient(() => rescueEnvelope('rescue', 'reason', 'scope', '')),
      input,
    );
    expect(result.ok).toBe(false);
  });

  it('returns ok=false on rescue label with empty rescue_scope', async () => {
    const result = await runRescueCritic(
      fakeClient(() => rescueEnvelope('rescue', 'reason', '', 'boundary')),
      input,
    );
    expect(result.ok).toBe(false);
  });

  it('returns ok=false on invalid label (closed-enum discipline)', async () => {
    const result = await runRescueCritic(
      fakeClient(() => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              result: { ok: true, data: { label: 'maybe', rationale: 'unclear' } },
            }),
          },
        ],
      })),
      input,
    );
    expect(result.ok).toBe(false);
  });

  it('returns ok=false on transport error (caller treats as decline → not_rescued)', async () => {
    const result = await runRescueCritic(
      {
        callTool: async () => {
          throw new Error('socket timeout');
        },
      },
      input,
    );
    expect(result.ok).toBe(false);
  });
});

// ── Defense-floor preservation tests (acceptance #1 + #2) ────────────────────

describe('R-012 extractor integration — defense floor preservation', () => {
  const sourcePurpose = 'What does the empirical literature say about DST workplace and crash effects?';

  it('Acceptance #1 — isolated off-topic body: 1 draft → ineligible_for_rescue (no LLM rescue call)', async () => {
    // Source body = off-topic cellular biology paper. Extractor emits 1
    // DST-framed draft confabulated onto unrelated source content. R-011
    // fires → frame_excluded=true with source_content_mismatch. R-012
    // eligibility gate: 0 other non-excluded peers → ineligible. The LLM
    // rescue critic must NOT be invoked (the gate short-circuited).
    //
    // Vocabulary check: claim tokens {dst, transitions, reduce, worker,
    // output} ∩ body tokens {cellular, dna, replication, errors, increase,
    // age, mutation, accumulation, repair, mechanisms, tumor, formation,
    // rates, differ, tissue} = ∅ → overlap 0% → R-011 fires.
    const offTopicRaw =
      'Cellular DNA replication errors increase with age. Mutation accumulation. Repair mechanisms differ. Tumor formation rates by tissue.';
    const cardOffTopic: SourceCard = { ...baseCard, title: '(untitled)' };
    const { extractor, capture } = makeQueuedExtractor({
      responses: [
        () =>
          extractEnvelope([
            {
              asserts: 'DST transitions reduce worker output.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_001'],
              confidence: 'high',
            },
          ]),
        // No second response queued — if R-012 erroneously calls the LLM
        // rescue critic, the test fails with "Unexpected MCP call".
      ],
    });
    const result = await extractor.extract({
      sourceCard: cardOffTopic,
      sourceHash: null,
      excerpts: [ex(1, 'cellular DNA replication errors mutation accumulation')],
      framePurpose: sourcePurpose,
      sourceRawText: offTopicRaw,
    });
    if (!result.ok) throw new Error(`extractor failed: ${result.error}`);
    expect(result.claims).toHaveLength(1);
    const claim = result.claims[0]!;
    expect(claim.frame_excluded).toBe(true);
    expect(claim.frame_exclusion_reason).toBe('source_content_mismatch');
    expect(claim.rescue_status).toBe('ineligible_for_rescue');
    expect(claim.rescue_eligibility_check?.passed).toBe(false);
    expect(claim.rescue_eligibility_check?.peer_count).toBe(0);
    expect(claim.rescue_boundary).toBeUndefined();
    // Defense-floor proof: only the original extract call hit the MCP
    // server. NO rescue critic call fired.
    const rescueCalls = capture.filter((c) =>
      typeof c.arguments.hint === 'string' &&
      (c.arguments.hint as string).includes('rescue_boundary'),
    );
    expect(rescueCalls).toHaveLength(0);
  });

  it('Acceptance #2 — below-threshold eligibility: 1 admit + 1 source_content_mismatch → ineligible (LLM rescue not invoked)', async () => {
    // One on-topic admit + one source_content_mismatch from same source.
    // Eligibility predicate: peer_count = 1 (just the one admit), threshold = 2 → ineligible.
    // R-011 fires on the off-topic claim's 0% overlap; R-012 gate blocks rescue.
    const dstBody =
      'Daylight saving time workplace injuries spring transition Monday sleep loss workplace productivity DST research';
    const { extractor, capture } = makeQueuedExtractor({
      responses: [
        () =>
          extractEnvelope([
            {
              asserts:
                'Daylight saving time transitions are associated with workplace productivity changes and sleep loss.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_001'],
              confidence: 'high',
            },
            {
              asserts:
                'Unrelated cancer mortality finding from Almeria province research data.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_002'],
              confidence: 'high',
            },
          ]),
        () => criticEnvelope('supports_section', 'Claim 1 supports the DST section purpose.'),
        // Claim 2 hits R-011 precheck (no LLM critic call). Then R-012:
        // peer_count = 1 (only claim 1 survived). Gate fails. Ineligible.
        // No LLM rescue call queued.
      ],
    });
    const result = await extractor.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: [
        ex(1, 'workplace productivity spring transition sleep loss DST'),
        ex(2, 'almeria cancer mortality'),
      ],
      framePurpose: sourcePurpose,
      sourceRawText: dstBody,
    });
    if (!result.ok) throw new Error(`extractor failed: ${result.error}`);
    expect(result.claims).toHaveLength(2);
    const admitted = result.claims.find((c) => !c.frame_excluded)!;
    const excluded = result.claims.find(
      (c) => c.frame_exclusion_reason === 'source_content_mismatch',
    )!;
    expect(admitted).toBeTruthy();
    expect(excluded).toBeTruthy();
    expect(excluded.rescue_status).toBe('ineligible_for_rescue');
    expect(excluded.rescue_eligibility_check?.passed).toBe(false);
    expect(excluded.rescue_eligibility_check?.peer_count).toBe(1);
    // No LLM rescue call fired.
    const rescueCalls = capture.filter((c) =>
      typeof c.arguments.hint === 'string' &&
      (c.arguments.hint as string).includes('rescue_boundary'),
    );
    expect(rescueCalls).toHaveLength(0);
  });
});

// ── Happy path: LLM rescue (acceptance #3 + #6 v0.3 regression) ──────────────

describe('R-012 extractor integration — LLM rescue', () => {
  const sourcePurpose = 'What does the empirical literature say about DST motor-vehicle crash effects?';
  // Body vocabulary carefully chosen so claims 1-4 have HIGH overlap
  // (R-011 doesn't fire, claims go through normal critic loop) and the
  // mismatch claim has ~0% overlap (R-011 fires deterministically).
  const dstCrashBody =
    'Motor-vehicle crash spike following spring transition. Sleep-loss mechanism. Monday morning shows elevated risk. Fritz documented six-day window.';

  it('Acceptance #3 + #6 — v0.3 Healthline regression: 4 admits + 1 source_content_mismatch → eligibility passes → LLM rescues', async () => {
    // Mirrors clm_f6ffc9e9d86f_ollama_intern_8 from v0.3: source body
    // produces 4 admits + a moderator claim that R-011 excludes because
    // its asserts text uses orthogonal vocabulary. R-012 eligibility
    // passes (peer_count=4); LLM rescue critic accepts with rationale +
    // scope + boundary.
    const { extractor, capture } = makeQueuedExtractor({
      responses: [
        () =>
          extractEnvelope([
            // Vocabulary aligns with body (motor, vehicle, crash, spring).
            {
              asserts: 'Motor-vehicle crash rates spike following spring transition.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_001'],
              confidence: 'high',
            },
            // sleep, loss, mechanism, monday, spike all in body.
            {
              asserts: 'Sleep loss mechanism explains Monday morning spike.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_002'],
              confidence: 'high',
            },
            // fritz, documented, six, day, window, risk, monday all in body.
            {
              asserts: 'Fritz documented elevated risk during a six-day window.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_003'],
              confidence: 'high',
            },
            // motor, vehicle, elevated, monday, morning all in body.
            {
              asserts: 'Motor-vehicle elevated risk peaks Monday morning.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_004'],
              confidence: 'high',
            },
            // Mismatch: tokens {geographic, chronotype, moderates, dst,
            // exposure} have 0 overlap with body → R-011 fires.
            {
              asserts: 'Geographic chronotype moderates DST exposure.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_005'],
              confidence: 'high',
            },
          ]),
        // 4 critic calls for the 4 admits.
        () => criticEnvelope('supports_section', 'Direct motor-vehicle DST crash finding.'),
        () => criticEnvelope('supports_section', 'Sleep-loss mechanism finding.'),
        () => criticEnvelope('supports_section', 'Fritz et al. finding.'),
        () => criticEnvelope('supports_section', 'Monday spike finding.'),
        // Claim 5 hits R-011 (short-circuit; no critic call).
        // R-012: peer_count = 4, gate passes, LLM rescue critic invoked.
        () =>
          rescueEnvelope(
            'rescue',
            'The chronotype moderator is a single-sentence aside in a body that otherwise extensively covers DST crashes — alignment is genuine despite low lexical overlap.',
            'geographic-position chronotype moderator effect on DST crash risk',
            'not generalizing to all DST effects or other psychological moderators',
          ),
      ],
    });
    const result = await extractor.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: [
        ex(1, 'Motor-vehicle crash rates spike following spring transition.'),
        ex(2, 'Sleep-loss mechanism explains Monday morning spike.'),
        ex(3, 'Fritz documented six-day window of elevated risk.'),
        ex(4, 'Motor-vehicle elevated risk peaks Monday morning.'),
        ex(5, 'Geographic chronotype moderator from study aside.'),
      ],
      framePurpose: sourcePurpose,
      sourceRawText: dstCrashBody,
    });
    if (!result.ok) throw new Error(`extractor failed: ${result.error}`);

    const rescued = result.claims.find(
      (c) => c.rescue_status === 'rescued_by_llm',
    );
    expect(rescued).toBeTruthy();
    expect(rescued!.frame_excluded).toBe(false);
    expect(rescued!.frame_exclusion_reason).toBeUndefined();
    expect(rescued!.rescue_boundary).toMatch(/not generalizing/);
    expect(rescued!.rescue_eligibility_check?.passed).toBe(true);
    expect(rescued!.rescue_eligibility_check?.peer_count).toBe(4);

    // Verify the LLM rescue critic was invoked exactly once.
    const rescueCalls = capture.filter((c) =>
      typeof c.arguments.hint === 'string' &&
      (c.arguments.hint as string).includes('rescue_boundary'),
    );
    expect(rescueCalls).toHaveLength(1);

    // Critic tally counters
    expect(result.criticTally?.rescue_eligible_evaluated).toBe(1);
    expect(result.criticTally?.rescued_by_llm).toBe(1);
  });

  it('Acceptance #7 — eligibility passes but LLM rescue critic declines: rescue_status=not_rescued, frame_excluded stays true', async () => {
    // Eligibility passes (2 admits in same source), but the LLM examines
    // the case and decides the claim is genuinely off-topic for this
    // source. Operator rescue path remains open.
    const { extractor } = makeQueuedExtractor({
      responses: [
        () =>
          extractEnvelope([
            // motor, vehicle, crash, spring, transition in body → admit
            {
              asserts: 'Motor-vehicle crash rates rise following spring transition.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_001'],
              confidence: 'high',
            },
            // sleep, loss, mechanism in body → admit
            {
              asserts: 'Sleep loss mechanism behind the Monday spike.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_002'],
              confidence: 'high',
            },
            // mismatch: cellular, dna, replication, tumor — 0 overlap
            {
              asserts: 'Cellular DNA replication errors cause tumors.',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_003'],
              confidence: 'high',
            },
          ]),
        () => criticEnvelope('supports_section', 'OK'),
        () => criticEnvelope('supports_section', 'OK'),
        () =>
          rescueEnvelope(
            'decline',
            'The cellular-DNA claim is genuinely off-topic for this DST-crash source body; the precheck is correct.',
          ),
      ],
    });
    const result = await extractor.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: [
        ex(1, 'Motor-vehicle crash rates rise following spring transition'),
        ex(2, 'Sleep-loss mechanism behind Monday spike'),
        ex(3, 'Cellular replication tumor formation'),
      ],
      framePurpose: sourcePurpose,
      sourceRawText: dstCrashBody,
    });
    if (!result.ok) throw new Error(`extractor failed: ${result.error}`);
    const declined = result.claims.find(
      (c) => c.frame_exclusion_reason === 'source_content_mismatch',
    );
    expect(declined).toBeTruthy();
    expect(declined!.rescue_status).toBe('not_rescued');
    expect(declined!.frame_excluded).toBe(true);
    expect(declined!.rescue_eligibility_check?.passed).toBe(true);
    expect(declined!.rescue_boundary).toBeUndefined();
  });
});

// ── Env opt-out (acceptance #11) ──────────────────────────────────────────────

describe('R-012 env opt-out', () => {
  let priorEnv: string | undefined;
  beforeEach(() => {
    priorEnv = process.env.RESEARCH_OS_FRAME_SOURCE_CONTENT;
  });
  afterEach(() => {
    if (priorEnv === undefined) {
      delete process.env.RESEARCH_OS_FRAME_SOURCE_CONTENT;
    } else {
      process.env.RESEARCH_OS_FRAME_SOURCE_CONTENT = priorEnv;
    }
  });

  it('Acceptance #11 — RESEARCH_OS_FRAME_SOURCE_CONTENT=0: R-011 disabled so R-012 is no-op (no rescue path triggered)', async () => {
    process.env.RESEARCH_OS_FRAME_SOURCE_CONTENT = '0';
    const { extractor, capture } = makeQueuedExtractor({
      responses: [
        () =>
          extractEnvelope([
            {
              asserts: 'A DST claim from a cancer paper (would have hit R-011 normally).',
              scope: null,
              not: null,
              evidence_excerpt_ids: ['ex_f6ffc9e9d86f_001'],
              confidence: 'high',
            },
          ]),
        // With R-011 disabled, the LLM critic still runs.
        () => criticEnvelope('supports_section', 'Critic says ok.'),
      ],
    });
    const result = await extractor.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: [ex(1, 'Some excerpt')],
      framePurpose: 'DST workplace research',
      sourceRawText: 'Off-topic cancer paper body content',
    });
    if (!result.ok) throw new Error(`extractor failed: ${result.error}`);
    expect(result.claims).toHaveLength(1);
    // No R-011 fire → no source_content_mismatch → no R-012 stage.
    expect(result.claims[0]!.frame_exclusion_reason).toBeUndefined();
    expect(result.claims[0]!.rescue_status).toBeUndefined();
    // No rescue critic call was made.
    const rescueCalls = capture.filter((c) =>
      typeof c.arguments.hint === 'string' &&
      (c.arguments.hint as string).includes('rescue_boundary'),
    );
    expect(rescueCalls).toHaveLength(0);
  });
});

// ── Operator rescue ledger + CLI integration (acceptance #2 CLI side, #4, #5, #8, #10) ──

describe('R-012 operator rescue — ledger + claim mutations', () => {
  let pack: string;

  function makeClaim(args: {
    claimId: string;
    sourceIds?: string[];
    asserts?: string;
    frame_excluded?: boolean;
    frame_exclusion_reason?: Claim['frame_exclusion_reason'];
    frame_exclusion_rationale?: string;
    rescue_status?: Claim['rescue_status'];
    scope?: string | null;
    not?: string | null;
  }): Claim {
    return ClaimSchema.parse({
      claim_id: args.claimId,
      section_id: '01-test',
      source_ids: args.sourceIds ?? ['src_f6ffc9e9d86f'],
      source_hashes: [],
      asserts: args.asserts ?? 'A claim',
      scope: args.scope ?? null,
      not: args.not ?? null,
      evidence_excerpt_ids: [`ex_${args.claimId.split('_')[1] ?? 'aaaaaaaaaaaa'}_001`],
      evidence_excerpt: 'evidence body',
      evidence_location: null,
      confidence: 'medium',
      extractor: 'ollama-intern',
      extraction_method: 'mcp_ollama_extract',
      created_at: '2026-05-15T10:00:00.000Z',
      review_state: 'candidate',
      frame_excluded: args.frame_excluded ?? false,
      ...(args.frame_exclusion_reason
        ? { frame_exclusion_reason: args.frame_exclusion_reason }
        : {}),
      ...(args.frame_exclusion_rationale
        ? { frame_exclusion_rationale: args.frame_exclusion_rationale }
        : {}),
      ...(args.rescue_status ? { rescue_status: args.rescue_status } : {}),
    });
  }

  function writeClaims(claims: Claim[]): void {
    const dir = join(pack, 'sections', '01-test');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'claims.jsonl'),
      claims.map((c) => JSON.stringify(c)).join('\n') + '\n',
      'utf8',
    );
  }

  function readClaimsFromDisk(): Claim[] {
    const path = join(pack, 'sections', '01-test', 'claims.jsonl');
    const text = readFileSync(path, 'utf8');
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => ClaimSchema.parse(JSON.parse(l)));
  }

  beforeEach(() => {
    pack = mkdtempSync(join(tmpdir(), 'r012-op-rescue-'));
  });
  afterEach(() => {
    rmSync(pack, { recursive: true, force: true });
  });

  it('Acceptance #4 — operator rescue success: eligible candidate → rescued_by_operator, ledger entry written, claim mutated', async () => {
    // Set up: 2 admitted claims + 1 source_content_mismatch claim from same source.
    // Gate passes (peer_count=2). Operator invokes rescue.
    writeClaims([
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_1',
        asserts: 'DST crashes increase 6%.',
        frame_excluded: false,
        scope: 'spring transition window',
        not: 'not fall transition',
      }),
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_2',
        asserts: 'Sleep loss is the mechanism.',
        frame_excluded: false,
        scope: 'mechanism interpretation',
        not: null,
      }),
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_3',
        asserts: 'Western edge of time zone moderator.',
        frame_excluded: true,
        frame_exclusion_reason: 'source_content_mismatch',
        frame_exclusion_rationale: '11% overlap',
        scope: 'original moderator scope',
        not: 'original moderator boundary',
      }),
    ]);

    const outcome = await rescueClaimByOperator({
      packPath: pack,
      sectionId: '01-test',
      claimId: 'clm_f6ffc9e9d86f_ollama_intern_3',
      rescueScope: 'western-edge-of-time-zone moderator on DST crash risk',
      rescueReason: 'Operator has independent knowledge that this is a load-bearing moderator',
      rescueBoundary: 'not generalizing to all DST effects',
      operator: 'test-operator',
      now: '2026-05-16T03:00:00.000Z',
    });
    expect(outcome.kind).toBe('rescued');

    // Acceptance #8: original scope/not are PRESERVED on the claim record.
    // Only rescue_boundary is added; rescue_scope lives in the ledger.
    const updated = readClaimsFromDisk();
    const rescued = updated.find((c) => c.claim_id === 'clm_f6ffc9e9d86f_ollama_intern_3')!;
    expect(rescued.frame_excluded).toBe(false);
    expect(rescued.frame_exclusion_reason).toBeUndefined();
    expect(rescued.rescue_status).toBe('rescued_by_operator');
    expect(rescued.rescue_boundary).toBe('not generalizing to all DST effects');
    // ORIGINAL scope/not preserved byte-identical.
    expect(rescued.scope).toBe('original moderator scope');
    expect(rescued.not).toBe('original moderator boundary');

    // Acceptance #10: ledger entry was written.
    const ledger = await readRescueLedger(pack);
    expect(ledger).toHaveLength(1);
    const entry = ledger[0]!;
    expect(entry.claim_id).toBe('clm_f6ffc9e9d86f_ollama_intern_3');
    expect(entry.rescue_status).toBe('rescued_by_operator');
    expect(entry.rescue_scope).toBe('western-edge-of-time-zone moderator on DST crash risk');
    expect(entry.rescue_boundary).toBe('not generalizing to all DST effects');
    expect(entry.rescued_by).toBe('operator');
    expect(entry.operator).toBe('test-operator');
    expect(entry.eligibility_check.passed).toBe(true);
    expect(entry.eligibility_check.peer_count).toBe(2);
  });

  it('Acceptance #2 (CLI side) — operator rescue REFUSED on ineligible candidate (≥2 gate enforced in code)', async () => {
    // Only 1 admitted peer + 1 source_content_mismatch → ineligible.
    writeClaims([
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_1',
        asserts: 'DST crashes increase 6%.',
        frame_excluded: false,
      }),
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_3',
        asserts: 'Western edge moderator.',
        frame_excluded: true,
        frame_exclusion_reason: 'source_content_mismatch',
      }),
    ]);

    const outcome = await rescueClaimByOperator({
      packPath: pack,
      sectionId: '01-test',
      claimId: 'clm_f6ffc9e9d86f_ollama_intern_3',
      rescueScope: 'scope',
      rescueReason: 'I want to rescue this',
      rescueBoundary: 'boundary',
      operator: 'test-operator',
    });
    expect(outcome.kind).toBe('ineligible');

    // The claim was mutated to record ineligibility, but NO ledger entry.
    const updated = readClaimsFromDisk();
    const target = updated.find((c) => c.claim_id === 'clm_f6ffc9e9d86f_ollama_intern_3')!;
    expect(target.rescue_status).toBe('ineligible_for_rescue');
    expect(target.frame_excluded).toBe(true); // STILL excluded
    expect(target.frame_exclusion_reason).toBe('source_content_mismatch'); // unchanged
    expect(target.rescue_eligibility_check?.passed).toBe(false);
    expect(target.rescue_eligibility_check?.peer_count).toBe(1);

    const ledger = await readRescueLedger(pack);
    expect(ledger).toHaveLength(0); // No ledger entry on ineligibility.
  });

  it('Acceptance #5 — operator decline path is explicit: operator_declined ≠ not_rescued', async () => {
    writeClaims([
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_1',
        asserts: 'Admit 1',
        frame_excluded: false,
      }),
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_2',
        asserts: 'Admit 2',
        frame_excluded: false,
      }),
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_3',
        asserts: 'Mismatch claim.',
        frame_excluded: true,
        frame_exclusion_reason: 'source_content_mismatch',
        rescue_status: 'not_rescued', // LLM already declined at extract time
      }),
    ]);

    const outcome = await declineClaimRescueByOperator({
      packPath: pack,
      sectionId: '01-test',
      claimId: 'clm_f6ffc9e9d86f_ollama_intern_3',
      declineReason: 'Reviewed independently; not a real moderator from this source.',
      operator: 'test-operator',
    });
    expect(outcome.kind).toBe('declined');

    const updated = readClaimsFromDisk();
    const target = updated.find((c) => c.claim_id === 'clm_f6ffc9e9d86f_ollama_intern_3')!;
    expect(target.rescue_status).toBe('operator_declined');
    expect(target.frame_excluded).toBe(true);

    const ledger = await readRescueLedger(pack);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.rescue_status).toBe('operator_declined');
    expect(ledger[0]!.rescue_scope).toBeNull();
    expect(ledger[0]!.rescue_boundary).toBeNull();
    expect(ledger[0]!.rescue_reason).toMatch(/not a real moderator/);
  });

  it('listRescueCandidates returns rescue-eligible claims with current state', async () => {
    writeClaims([
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_1',
        asserts: 'Admit 1',
        frame_excluded: false,
      }),
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_2',
        asserts: 'Admit 2',
        frame_excluded: false,
      }),
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_3',
        asserts: 'Mismatch (eligible).',
        frame_excluded: true,
        frame_exclusion_reason: 'source_content_mismatch',
      }),
      // A claim from a DIFFERENT source: should NOT be a peer for the
      // mismatch above (peers must share at least one source_id).
      makeClaim({
        claimId: 'clm_aaaaaaaaaaaa_ollama_intern_1',
        sourceIds: ['src_aaaaaaaaaaaa'],
        asserts: 'Different source admit',
        frame_excluded: false,
      }),
    ]);
    const candidates = await listRescueCandidates({
      packPath: pack,
      sectionId: '01-test',
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.claim.claim_id).toBe('clm_f6ffc9e9d86f_ollama_intern_3');
    expect(candidates[0]!.eligibility.passed).toBe(true);
    expect(candidates[0]!.eligibility.peer_count).toBe(2);
  });

  it('Already-rescued claims do not reappear as candidates (terminal-state rule)', async () => {
    writeClaims([
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_1',
        asserts: 'Admit 1',
        frame_excluded: false,
      }),
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_2',
        asserts: 'Admit 2',
        frame_excluded: false,
      }),
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_3',
        asserts: 'Already rescued by LLM',
        frame_excluded: false, // LLM rescued so frame_excluded=false
        rescue_status: 'rescued_by_llm',
      }),
    ]);
    const candidates = await listRescueCandidates({
      packPath: pack,
      sectionId: '01-test',
    });
    expect(candidates).toHaveLength(0);
  });
});
