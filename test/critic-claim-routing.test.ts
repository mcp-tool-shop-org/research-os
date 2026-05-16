// Phase 1b-b (v0.8.0): integration test for the per-claim section-evidence
// critic routing inside MCPClaimExtractor.
//
// Properties under test:
//   1. The critic runs on EVERY claim from EVERY window, regardless of the
//      extractor envelope's frame_alignment.on_topic value. This is the
//      doctrine ratchet: extract's frame_alignment is telemetry only.
//   2. supports_section drafts admit with frame_excluded === false.
//   3. off_topic / background_only / source_chrome drafts admit with
//      frame_excluded === true AND carry frame_exclusion_reason +
//      frame_exclusion_rationale.
//   4. Critic call failure fails soft: admit with frame_excluded === false,
//      and the criticTally.critic_call_failed counter increments.
//   5. The criticTally aggregates per-label counts correctly.

import { describe, it, expect } from 'vitest';

import { MCPClaimExtractor } from '../src/claims/extractors/mcp.js';
import { MCPClientHandle } from '../src/mcp/client.js';
import type { Excerpt } from '../src/sources/excerpts/schema.js';
import type { SourceCard } from '../src/sources/schema.js';

const baseCard: SourceCard = {
  source_id: 'src_abcdef012345',
  receipt_id: 'rcpt_abcdef012345_1700000000000',
  section_id: '01-landscape',
  url: 'https://example.com/x',
  final_url: 'https://example.com/x',
  fetched_at: '2026-05-06T22:00:00.000Z',
  publisher: 'Example Pub',
  published_at: null,
  title: 'Example',
  source_type: 'secondary',
  relevance: 'unknown',
  key_points: ['kp1'],
  limitations: [],
  asserts: 'Source headline',
  scope: null,
  not: null,
  extracted_by: 'heuristic',
  extracted_at: '2026-05-06T22:00:00.000Z',
};

function ex(idx: number, text: string): Excerpt {
  return {
    excerpt_id: `ex_abcdef012345_${String(idx).padStart(3, '0')}`,
    source_id: 'src_abcdef012345',
    source_hash: null,
    text,
    location_hint: `paragraph ${idx}`,
    char_start: 0,
    char_end: text.length,
    origin: 'raw_text',
    created_at: '2026-05-06T22:00:00.000Z',
  };
}

const sampleExcerpts: Excerpt[] = [
  ex(1, 'For role-os rollout specifically: any code fix discovered post-publish ships in a patch.'),
  ex(2, 'Every commit that adds or modifies a function ships with at least one test.'),
];

interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

// A scripted client that responds based on tool name. ollama_extract returns
// `extractResponse`; ollama_extract called with critic-shaped args (presence
// of {label, rationale} schema) returns `criticResponses` round-robin.
function scriptedClient(opts: {
  capture: ToolCall[];
  extractResponse: () => unknown;
  criticResponses: Array<() => unknown>;
}): unknown {
  let criticIdx = 0;
  return {
    async callTool(params: { name: string; arguments: Record<string, unknown> }) {
      opts.capture.push({ name: params.name, arguments: params.arguments });
      // Both extractor + critic use ollama_extract. Distinguish by the
      // schema shape: critic schema has a `label` property with enum.
      const schema = params.arguments.schema as
        | { properties?: Record<string, unknown> }
        | undefined;
      const isCritic = !!schema?.properties && 'label' in schema.properties;
      if (isCritic) {
        const i = criticIdx++;
        const fn = opts.criticResponses[i] ?? opts.criticResponses[opts.criticResponses.length - 1];
        if (!fn) throw new Error('no critic response scripted');
        return fn();
      }
      return opts.extractResponse();
    },
  };
}

function makeExtractor(
  capture: ToolCall[],
  extractResponse: () => unknown,
  criticResponses: Array<() => unknown>,
): MCPClaimExtractor {
  return new MCPClaimExtractor({
    handleFactory: () => {
      const fake = scriptedClient({ capture, extractResponse, criticResponses });
      const handle = new MCPClientHandle({});
      (handle as unknown as { connect: () => Promise<unknown> }).connect = async () => fake;
      (handle as unknown as { close: () => Promise<void> }).close = async () => {
        /* no-op */
      };
      return handle;
    },
  });
}

function extractEnvelope(opts: {
  on_topic?: boolean;
  claims: Array<{
    asserts: string;
    evidence_excerpt_ids: string[];
    confidence?: string;
    scope?: string | null;
    not?: string | null;
  }>;
}) {
  const result: Record<string, unknown> = {
    ok: true,
    data: { claims: opts.claims },
  };
  if (opts.on_topic !== undefined) {
    result.frame_alignment = { on_topic: opts.on_topic, reason: 'test' };
  }
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          result,
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

function criticEnvelope(label: string, rationale: string) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          result: { ok: true, data: { label, rationale } },
          tier_used: 'instant',
          model: 'hermes3:8b',
          hardware_profile: 'test',
          tokens_in: 50,
          tokens_out: 20,
          elapsed_ms: 5,
        }),
      },
    ],
  };
}

function criticErrorEnvelope() {
  return {
    content: [{ type: 'text', text: 'not-json-at-all' }],
  };
}

describe('Critic routing — every claim gets critiqued', () => {
  it('calls the critic ONCE per draft claim emitted by ollama_extract', async () => {
    const capture: ToolCall[] = [];
    const ex = makeExtractor(
      capture,
      () =>
        extractEnvelope({
          on_topic: true,
          claims: [
            {
              asserts: 'first claim',
              evidence_excerpt_ids: ['ex_abcdef012345_001'],
              confidence: 'medium',
            },
            {
              asserts: 'second claim',
              evidence_excerpt_ids: ['ex_abcdef012345_002'],
              confidence: 'medium',
            },
          ],
        }),
      [
        () => criticEnvelope('supports_section', 'good'),
        () => criticEnvelope('supports_section', 'good'),
      ],
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'some purpose',
    });
    expect(result.ok).toBe(true);
    // 1 extract call + 2 critic calls = 3 total
    expect(capture).toHaveLength(3);
    expect(capture[0]?.name).toBe('ollama_extract');
    expect(capture[1]?.name).toBe('ollama_extract');
    expect(capture[2]?.name).toBe('ollama_extract');
  });

  it('calls the critic EVEN when extract envelope says frame_alignment.on_topic === false (doctrine ratchet)', async () => {
    const capture: ToolCall[] = [];
    const ex = makeExtractor(
      capture,
      () =>
        extractEnvelope({
          on_topic: false, // <-- envelope says off-topic; critic must still run
          claims: [
            {
              asserts: 'envelope-flagged claim one',
              evidence_excerpt_ids: ['ex_abcdef012345_001'],
              confidence: 'low',
            },
            {
              asserts: 'envelope-flagged claim two',
              evidence_excerpt_ids: ['ex_abcdef012345_002'],
              confidence: 'low',
            },
          ],
        }),
      [
        // Critic INDEPENDENTLY decides. We script supports_section here to
        // prove the critic — not the envelope — is the source of truth.
        () => criticEnvelope('supports_section', 'critic disagrees with envelope'),
        () => criticEnvelope('supports_section', 'critic disagrees with envelope'),
      ],
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'purpose',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Two critic calls happened.
    const criticCalls = capture.filter((c, i) => i > 0);
    expect(criticCalls).toHaveLength(2);
    // And the critic's verdict — not the envelope's — wins. Both claims
    // admitted as supports_section.
    expect(result.claims.every((c) => c.frame_excluded !== true)).toBe(true);
    expect(result.criticTally?.supports_section).toBe(2);
    expect(result.criticTally?.off_topic).toBe(0);
  });

  it('does NOT run the critic when framePurpose is undefined (no section purpose to judge against)', async () => {
    const capture: ToolCall[] = [];
    const ex = makeExtractor(
      capture,
      () =>
        extractEnvelope({
          claims: [
            {
              asserts: 'unframed claim',
              evidence_excerpt_ids: ['ex_abcdef012345_001'],
              confidence: 'low',
            },
          ],
        }),
      [() => criticEnvelope('supports_section', 'should not be called')],
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      // framePurpose: undefined — no purpose, no critic.
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only the extract call; no critic call.
    expect(capture).toHaveLength(1);
    expect(capture[0]?.name).toBe('ollama_extract');
    expect(result.criticTally?.supports_section).toBe(0);
  });
});

describe('Critic routing — label → draft state', () => {
  it('supports_section → frame_excluded:false, no reason/rationale on draft', async () => {
    const capture: ToolCall[] = [];
    const ex = makeExtractor(
      capture,
      () =>
        extractEnvelope({
          on_topic: true,
          claims: [
            {
              asserts: 'good claim',
              evidence_excerpt_ids: ['ex_abcdef012345_001'],
              confidence: 'medium',
            },
          ],
        }),
      [() => criticEnvelope('supports_section', 'addresses the section purpose directly')],
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'purpose',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims).toHaveLength(1);
    const c = result.claims[0]!;
    expect(c.frame_excluded === true).toBe(false);
    expect(c.frame_exclusion_reason).toBeUndefined();
    expect(c.frame_exclusion_rationale).toBeUndefined();
    expect(result.criticTally?.supports_section).toBe(1);
  });

  it('off_topic → frame_excluded:true with reason="off_topic" and rationale stamped', async () => {
    const capture: ToolCall[] = [];
    const ex = makeExtractor(
      capture,
      () =>
        extractEnvelope({
          on_topic: true, // envelope says on-topic; critic disagrees
          claims: [
            {
              asserts: 'pizza topology rotation',
              evidence_excerpt_ids: ['ex_abcdef012345_001'],
              confidence: 'low',
            },
          ],
        }),
      [() => criticEnvelope('off_topic', 'about pizza, not research packs')],
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'gates and waivers',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.claims[0]!;
    expect(c.frame_excluded).toBe(true);
    expect(c.frame_exclusion_reason).toBe('off_topic');
    expect(c.frame_exclusion_rationale).toBe('about pizza, not research packs');
    expect(result.criticTally?.off_topic).toBe(1);
  });

  it('background_only → frame_excluded:true with reason="background_only"', async () => {
    const capture: ToolCall[] = [];
    const ex = makeExtractor(
      capture,
      () =>
        extractEnvelope({
          claims: [
            {
              asserts: 'open science is generally good',
              evidence_excerpt_ids: ['ex_abcdef012345_001'],
              confidence: 'low',
            },
          ],
        }),
      [() => criticEnvelope('background_only', 'too broad to support synthesis')],
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'purpose',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.claims[0]!;
    expect(c.frame_excluded).toBe(true);
    expect(c.frame_exclusion_reason).toBe('background_only');
    expect(c.frame_exclusion_rationale).toBe('too broad to support synthesis');
    expect(result.criticTally?.background_only).toBe(1);
  });

  it('source_chrome → frame_excluded:true with reason="source_chrome"', async () => {
    const capture: ToolCall[] = [];
    const ex = makeExtractor(
      capture,
      () =>
        extractEnvelope({
          claims: [
            {
              asserts: 'arXivLabs is a framework for collaborators',
              evidence_excerpt_ids: ['ex_abcdef012345_001'],
              confidence: 'low',
            },
          ],
        }),
      [() => criticEnvelope('source_chrome', 'describes site UI not content')],
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'purpose',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.claims[0]!;
    expect(c.frame_excluded).toBe(true);
    expect(c.frame_exclusion_reason).toBe('source_chrome');
    expect(c.frame_exclusion_rationale).toBe('describes site UI not content');
    expect(result.criticTally?.source_chrome).toBe(1);
  });

  it('aggregates the mixed-label criticTally correctly across one window', async () => {
    const capture: ToolCall[] = [];
    const ex = makeExtractor(
      capture,
      () =>
        extractEnvelope({
          claims: [
            { asserts: 'one', evidence_excerpt_ids: ['ex_abcdef012345_001'], confidence: 'low' },
            { asserts: 'two', evidence_excerpt_ids: ['ex_abcdef012345_002'], confidence: 'low' },
            { asserts: 'three', evidence_excerpt_ids: ['ex_abcdef012345_001'], confidence: 'low' },
            { asserts: 'four', evidence_excerpt_ids: ['ex_abcdef012345_002'], confidence: 'low' },
          ],
        }),
      [
        () => criticEnvelope('supports_section', 'good'),
        () => criticEnvelope('off_topic', 'bad'),
        () => criticEnvelope('background_only', 'too broad'),
        () => criticEnvelope('source_chrome', 'chrome'),
      ],
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'purpose',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.criticTally).toEqual({
      supports_section: 1,
      off_topic: 1,
      background_only: 1,
      source_chrome: 1,
      critic_call_failed: 0,
      // v0.11 Slice 3 (R-011) — new counter for the deterministic
      // source-content precheck. Zero in this test because no
      // sourceRawText was supplied (the precheck degrades gracefully).
      source_content_mismatch: 0,
      // v0.12 Slice 1 (R-012) — rescue stage counters. All zero in this
      // test because no source_content_mismatch claims exist (the rescue
      // stage operates only on R-011-excluded drafts).
      rescue_eligible_evaluated: 0,
      rescue_ineligible: 0,
      rescued_by_llm: 0,
      rescue_llm_declined: 0,
      rescue_llm_call_failed: 0,
    });
  });
});

describe('Critic routing — conservative fail-exclude on critic-call failure (v0.8.0 phase 1b-b correctness fix)', () => {
  it('EXCLUDES the claim (frame_excluded:true, reason=critic_unavailable) AND increments critic_call_failed when the critic call returns malformed JSON', async () => {
    const capture: ToolCall[] = [];
    const ex = makeExtractor(
      capture,
      () =>
        extractEnvelope({
          on_topic: true,
          claims: [
            {
              asserts: 'ambiguous claim',
              evidence_excerpt_ids: ['ex_abcdef012345_001'],
              confidence: 'low',
            },
          ],
        }),
      [() => criticErrorEnvelope()],
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'purpose',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.claims[0]!;
    // Conservative fail-EXCLUDE: critic could not judge, so do not admit.
    expect(c.frame_excluded).toBe(true);
    expect(c.frame_exclusion_reason).toBe('critic_unavailable');
    expect(c.frame_exclusion_rationale).toBe(
      'Critic call failed; conservatively excluded from synthesis evidence.',
    );
    expect(result.criticTally?.critic_call_failed).toBe(1);
    expect(result.criticTally?.supports_section).toBe(0);
  });

  it('does NOT use envelope.frame_alignment to fill in for a failed critic call — system-state critic_unavailable is the reason regardless of envelope', async () => {
    // The doctrine ratchet: even when envelope.frame_alignment.on_topic === false,
    // a critic call failure must NOT inherit that signal. Independent decision:
    // absence of judgement routes to EXCLUDE with critic_unavailable.
    const capture: ToolCall[] = [];
    const ex = makeExtractor(
      capture,
      () =>
        extractEnvelope({
          on_topic: false,
          claims: [
            {
              asserts: 'envelope-flagged claim',
              evidence_excerpt_ids: ['ex_abcdef012345_001'],
              confidence: 'low',
            },
          ],
        }),
      [() => criticErrorEnvelope()],
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'purpose',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.claims[0]!;
    expect(c.frame_excluded).toBe(true);
    expect(c.frame_exclusion_reason).toBe('critic_unavailable');
    expect(result.criticTally?.critic_call_failed).toBe(1);
  });
});
