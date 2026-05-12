// v0.8.0 phase 1b-b correctness fix: soft-fail-admit was INVERTED to
// conservative fail-EXCLUDE. Live evidence on 2026-05-12 showed that
// admitting a claim on critic-call failure let off-topic chrome content
// ("contact arXiv Click here to contact arXiv") through marked
// frame_excluded:false / high-confidence. The safe default when
// topicality cannot be determined is to EXCLUDE.
//
// This test covers ALL FIVE locked failure modes. Each MUST route to
// frame_excluded=true, frame_exclusion_reason='critic_unavailable',
// frame_exclusion_rationale set to the documented string, AND increment
// criticTally.critic_call_failed (the counter still tracks event volume
// for telemetry even though the routing decision is uniform):
//
//   1. MCP transport error (callTool throws)
//   2. Parse error (malformed JSON)
//   3. Invalid label (returned string not in the 4-label enum)
//   4. Empty rationale (whitespace-only or empty string)
//   5. Timeout (TIER_TIMEOUT cascade shape from ollama-intern-mcp)

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
  fetched_at: '2026-05-12T22:00:00.000Z',
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
  extracted_at: '2026-05-12T22:00:00.000Z',
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
    created_at: '2026-05-12T22:00:00.000Z',
  };
}

const sampleExcerpts: Excerpt[] = [
  ex(1, 'For role-os rollout specifically: any code fix discovered post-publish ships in a patch.'),
];

interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

// Scripted client. Distinguishes extractor calls from critic calls by
// inspecting the schema shape (critic schema has a `label` property).
function scriptedClient(opts: {
  capture: ToolCall[];
  extractResponse: () => unknown;
  criticResponse: () => unknown | Promise<unknown>;
}): unknown {
  return {
    async callTool(params: { name: string; arguments: Record<string, unknown> }) {
      opts.capture.push({ name: params.name, arguments: params.arguments });
      const schema = params.arguments.schema as
        | { properties?: Record<string, unknown> }
        | undefined;
      const isCritic = !!schema?.properties && 'label' in schema.properties;
      if (isCritic) return await opts.criticResponse();
      return opts.extractResponse();
    },
  };
}

function makeExtractor(
  capture: ToolCall[],
  extractResponse: () => unknown,
  criticResponse: () => unknown | Promise<unknown>,
): MCPClaimExtractor {
  return new MCPClaimExtractor({
    handleFactory: () => {
      const fake = scriptedClient({ capture, extractResponse, criticResponse });
      const handle = new MCPClientHandle({});
      (handle as unknown as { connect: () => Promise<unknown> }).connect = async () => fake;
      (handle as unknown as { close: () => Promise<void> }).close = async () => {
        /* no-op */
      };
      return handle;
    },
  });
}

function extractEnvelopeResponse() {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          result: {
            ok: true,
            data: {
              claims: [
                {
                  asserts: 'a single test claim',
                  evidence_excerpt_ids: ['ex_abcdef012345_001'],
                  confidence: 'medium',
                },
              ],
            },
          },
          tier_used: 'workhorse',
          model: 'hermes3:8b',
          hardware_profile: 'test',
          tokens_in: 100,
          tokens_out: 30,
          elapsed_ms: 10,
        }),
      },
    ],
  };
}

function expectConservativeExclude(claim: {
  frame_excluded?: boolean;
  frame_exclusion_reason?: string;
  frame_exclusion_rationale?: string;
}) {
  expect(claim.frame_excluded).toBe(true);
  expect(claim.frame_exclusion_reason).toBe('critic_unavailable');
  expect(claim.frame_exclusion_rationale).toBe(
    'Critic call failed; conservatively excluded from synthesis evidence.',
  );
}

describe('Critic soft-fail inversion — conservative fail-EXCLUDE (5 failure modes)', () => {
  it('Mode 1: MCP transport error (callTool throws) → frame_excluded:true, reason=critic_unavailable, counter++', async () => {
    const capture: ToolCall[] = [];
    const ex = makeExtractor(
      capture,
      () => extractEnvelopeResponse(),
      () => {
        throw new Error('subprocess crash: broken pipe');
      },
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
    expectConservativeExclude(result.claims[0]!);
    expect(result.criticTally?.critic_call_failed).toBe(1);
    expect(result.criticTally?.supports_section).toBe(0);
  });

  it('Mode 2: parse error (malformed JSON body) → frame_excluded:true, reason=critic_unavailable, counter++', async () => {
    const capture: ToolCall[] = [];
    const ex = makeExtractor(
      capture,
      () => extractEnvelopeResponse(),
      () => ({
        content: [{ type: 'text', text: 'this is not valid JSON at all' }],
      }),
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'purpose',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectConservativeExclude(result.claims[0]!);
    expect(result.criticTally?.critic_call_failed).toBe(1);
  });

  it('Mode 3: invalid label (string not in the 4-label enum) → frame_excluded:true, reason=critic_unavailable, counter++', async () => {
    const capture: ToolCall[] = [];
    const ex = makeExtractor(
      capture,
      () => extractEnvelopeResponse(),
      () => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              result: {
                ok: true,
                data: {
                  label: 'hallucinated_extra_label',
                  rationale: 'model invented its own label',
                },
              },
            }),
          },
        ],
      }),
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'purpose',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectConservativeExclude(result.claims[0]!);
    expect(result.criticTally?.critic_call_failed).toBe(1);
  });

  it('Mode 4a: empty rationale (empty string) → frame_excluded:true, reason=critic_unavailable, counter++', async () => {
    const capture: ToolCall[] = [];
    const ex = makeExtractor(
      capture,
      () => extractEnvelopeResponse(),
      () => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              result: {
                ok: true,
                data: { label: 'off_topic', rationale: '' },
              },
            }),
          },
        ],
      }),
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'purpose',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectConservativeExclude(result.claims[0]!);
    expect(result.criticTally?.critic_call_failed).toBe(1);
  });

  it('Mode 4b: empty rationale (whitespace-only) → frame_excluded:true, reason=critic_unavailable, counter++', async () => {
    const capture: ToolCall[] = [];
    const ex = makeExtractor(
      capture,
      () => extractEnvelopeResponse(),
      () => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              result: {
                ok: true,
                data: { label: 'off_topic', rationale: '   \t  \n  ' },
              },
            }),
          },
        ],
      }),
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'purpose',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectConservativeExclude(result.claims[0]!);
    expect(result.criticTally?.critic_call_failed).toBe(1);
  });

  it('Mode 5: TIER_TIMEOUT cascade shape (callTool throws timeout) → frame_excluded:true, reason=critic_unavailable, counter++', async () => {
    // The ollama-intern-mcp TIER_TIMEOUT path surfaces as a thrown error
    // bearing the literal "TIER_TIMEOUT" tag. We replicate that shape here.
    const capture: ToolCall[] = [];
    const ex = makeExtractor(
      capture,
      () => extractEnvelopeResponse(),
      () => {
        const err = new Error('TIER_TIMEOUT: workhorse tier exceeded timeout budget');
        (err as Error & { code?: string }).code = 'TIER_TIMEOUT';
        throw err;
      },
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'purpose',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectConservativeExclude(result.claims[0]!);
    expect(result.criticTally?.critic_call_failed).toBe(1);
  });

  it('the rationale on the conservatively-excluded claim is the locked string verbatim', async () => {
    // Drift guard for the operator-facing rationale text. If a future
    // refactor accidentally changes the wording, this fails.
    const capture: ToolCall[] = [];
    const ex = makeExtractor(
      capture,
      () => extractEnvelopeResponse(),
      () => {
        throw new Error('any failure');
      },
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'purpose',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims[0]?.frame_exclusion_rationale).toBe(
      'Critic call failed; conservatively excluded from synthesis evidence.',
    );
  });
});
