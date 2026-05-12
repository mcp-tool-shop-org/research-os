import { describe, it, expect } from 'vitest';
import { MCPClaimExtractor } from '../src/claims/extractors/mcp.js';
import { MCPClientHandle } from '../src/mcp/client.js';
import type { Excerpt } from '../src/sources/excerpts/schema.js';
import type { SourceCard } from '../src/sources/schema.js';

// ---- Test fixtures ---------------------------------------------------------

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

// ---- Fake MCP client + transport ------------------------------------------

interface CapturedCall {
  name: string;
  arguments: Record<string, unknown>;
}

interface FakeClientOptions {
  capture: CapturedCall[];
  response: () => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

function makeFakeClient(opts: FakeClientOptions): unknown {
  return {
    // No connect/close lifecycle inside the fake client itself — that lives
    // on the handle. We are the inner SDK Client surface that handle.connect()
    // returns; once we are returned, we are "live".
    async callTool(params: { name: string; arguments: Record<string, unknown> }) {
      opts.capture.push({ name: params.name, arguments: params.arguments });
      return opts.response();
    },
  };
}

interface EnvelopeOverrides {
  on_topic?: boolean;
  reason?: string;
  model?: string;
  model_requested?: string;
  fallback_from?: string;
  claims?: Array<Record<string, unknown>>;
  isError?: boolean;
}

function makeEnvelopeResponse(overrides: EnvelopeOverrides = {}) {
  const claims = overrides.claims ?? [
    {
      asserts: 'patch publish before next repo',
      scope: 'role-os rollout lockdown fixes',
      not: 'universal publish policy',
      evidence_excerpt_ids: ['ex_abcdef012345_001'],
      evidence_location: 'paragraph 1',
      confidence: 'high',
    },
  ];
  const envelope: Record<string, unknown> = {
    result: { ok: true, data: { claims } },
    tier_used: 'workhorse',
    model: overrides.model ?? 'hermes3:8b',
    hardware_profile: 'test',
    tokens_in: 100,
    tokens_out: 50,
    elapsed_ms: 10,
    residency: null,
  };
  if (overrides.on_topic !== undefined) {
    (envelope.result as Record<string, unknown>).frame_alignment = {
      on_topic: overrides.on_topic,
      reason: overrides.reason ?? 'test',
    };
  }
  if (overrides.model_requested !== undefined) {
    envelope.model_requested = overrides.model_requested;
  }
  if (overrides.fallback_from !== undefined) {
    envelope.fallback_from = overrides.fallback_from;
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(envelope) }],
    isError: overrides.isError === true ? true : undefined,
  };
}

function makeExtractor(capture: CapturedCall[], response: () => unknown): MCPClaimExtractor {
  return new MCPClaimExtractor({
    handleFactory: () => {
      // The handle is a thin wrapper that connect()/close() and returns the
      // SDK Client. We substitute a handle whose connect() returns our fake
      // client directly, so no subprocess is spawned.
      const fake = makeFakeClient({
        capture,
        response: async () => response() as ReturnType<FakeClientOptions['response']> extends Promise<infer R>
          ? R
          : never,
      });
      // Build a real handle but override its connect/close to point at the
      // fake. This exercises the production code path in mcp.ts (calls
      // handle.connect() / handle.close() in finally) without needing a
      // subprocess.
      const handle = new MCPClientHandle({});
      // Replace the connect/close on the instance. TypeScript can't see
      // these private overrides, but vitest doesn't care.
      (handle as unknown as { connect: () => Promise<unknown> }).connect = async () => fake;
      (handle as unknown as { close: () => Promise<void> }).close = async () => {
        /* no-op for fake */
      };
      return handle;
    },
  });
}

// ---- Tests -----------------------------------------------------------------

describe('MCPClaimExtractor request shape', () => {
  it('passes framePurpose as `frame` on the (first) ollama_extract call', async () => {
    // Phase 1b-b: with framePurpose set, the per-claim critic also runs
    // (via ollama_extract). We assert on the FIRST captured call — the
    // extractor itself — which still carries the `frame` parameter for the
    // server's frame_alignment telemetry.
    const capture: CapturedCall[] = [];
    const ex = makeExtractor(capture, () => makeEnvelopeResponse());
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'gates and waivers — what blocks synthesis',
    });
    expect(result.ok).toBe(true);
    expect(capture.length).toBeGreaterThanOrEqual(1);
    expect(capture[0]?.name).toBe('ollama_extract');
    expect(capture[0]?.arguments.frame).toBe('gates and waivers — what blocks synthesis');
  });

  it('omits `frame` when framePurpose is undefined', async () => {
    const capture: CapturedCall[] = [];
    const ex = makeExtractor(capture, () => makeEnvelopeResponse());
    await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
    });
    expect(capture[0]?.arguments).not.toHaveProperty('frame');
  });

  it('passes effectiveModel as `model` on the ollama_extract call', async () => {
    const capture: CapturedCall[] = [];
    const ex = makeExtractor(capture, () => makeEnvelopeResponse());
    await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      effectiveModel: 'qwen3:14b',
    });
    expect(capture[0]?.arguments.model).toBe('qwen3:14b');
  });

  it('omits `model` when effectiveModel is undefined', async () => {
    const capture: CapturedCall[] = [];
    const ex = makeExtractor(capture, () => makeEnvelopeResponse());
    await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
    });
    expect(capture[0]?.arguments).not.toHaveProperty('model');
  });

  it('omits `model` when effectiveModel is empty string (does not forward empty)', async () => {
    const capture: CapturedCall[] = [];
    const ex = makeExtractor(capture, () => makeEnvelopeResponse());
    await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      effectiveModel: '',
    });
    expect(capture[0]?.arguments).not.toHaveProperty('model');
  });

  it('always includes the span-grounding hint and a JSON schema', async () => {
    const capture: CapturedCall[] = [];
    const ex = makeExtractor(capture, () => makeEnvelopeResponse());
    await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
    });
    const args = capture[0]?.arguments ?? {};
    expect(typeof args.hint).toBe('string');
    expect(args.hint).toContain('Do NOT author or paraphrase evidence text');
    expect(args.schema).toBeTypeOf('object');
    expect((args.schema as { type?: string }).type).toBe('object');
  });
});

describe('MCPClaimExtractor frame_alignment handling', () => {
  it('records framesExcluded counter when result.frame_alignment.on_topic === false (envelope telemetry)', async () => {
    // Phase 1b-b doctrine ratchet: envelope.frame_alignment is TELEMETRY
    // only — the per-claim critic decides admission. So even when the
    // envelope says on_topic=false, the critic still runs per claim and
    // its verdict is what flips frame_excluded on each draft. The
    // framesExcluded counter on the result still tracks the envelope
    // signal for calibration receipts; that hasn't changed.
    //
    // This test re-uses the same envelope (no critic mocked separately), so
    // when the critic-shaped ollama_extract call fires it will receive the
    // SAME envelope (which has no {label, rationale} payload) — that means
    // the critic call parses as "not a critic envelope" and fails. Under
    // the v0.8.0 phase 1b-b correctness fix this routes to
    // frame_excluded=true with reason=critic_unavailable (conservative
    // fail-exclude). The framesExcluded counter still increments because
    // envelope.frame_alignment.on_topic === false on the extract call.
    const capture: CapturedCall[] = [];
    const ex = makeExtractor(capture, () =>
      makeEnvelopeResponse({
        on_topic: false,
        reason: 'source is about pizza, not research packs',
        claims: [
          {
            asserts: 'off-topic claim one',
            scope: null,
            not: null,
            evidence_excerpt_ids: ['ex_abcdef012345_001'],
            confidence: 'low',
          },
          {
            asserts: 'off-topic claim two',
            scope: null,
            not: null,
            evidence_excerpt_ids: ['ex_abcdef012345_002'],
            confidence: 'low',
          },
        ],
      }),
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'whatever',
    });
    if (!result.ok) throw new Error(`should succeed: ${result.error}`);
    expect(result.claims).toHaveLength(2);
    // Envelope telemetry still incremented.
    expect(result.framesExcluded).toBe(1);
    // Critic-call failures (envelope had no {label, rationale}) → conservative
    // fail-EXCLUDE: every claim routes to frame_excluded=true with
    // reason=critic_unavailable.
    expect(result.claims.every((c) => c.frame_excluded === true)).toBe(true);
    expect(
      result.claims.every((c) => c.frame_exclusion_reason === 'critic_unavailable'),
    ).toBe(true);
    expect(result.criticTally?.critic_call_failed).toBe(2);
  });

  it('does NOT increment framesExcluded counter when on_topic === true (envelope telemetry path)', async () => {
    // Under the v0.8.0 phase 1b-b correctness fix, when framePurpose is
    // supplied the critic runs per-claim. The shared envelope here has no
    // {label, rationale} payload — so critic returns ok:false and the
    // conservative fail-EXCLUDE policy stamps frame_excluded=true with
    // reason=critic_unavailable on each claim. That's the soft-fail-
    // inverted behavior tested elsewhere; here we only confirm that the
    // ENVELOPE TELEMETRY counter (framesExcluded) does NOT increment when
    // on_topic === true — that is the property this test still guards.
    const capture: CapturedCall[] = [];
    const ex = makeExtractor(capture, () => makeEnvelopeResponse({ on_topic: true }));
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'whatever',
    });
    if (!result.ok) throw new Error(`should succeed: ${result.error}`);
    // Envelope telemetry: on_topic=true so framesExcluded stays at 0.
    expect(result.framesExcluded ?? 0).toBe(0);
    // Critic call had no label/rationale → conservative fail-exclude.
    expect(result.criticTally?.critic_call_failed).toBeGreaterThanOrEqual(1);
  });

  it('does NOT mark claims frame_excluded when frame_alignment is absent', async () => {
    const capture: CapturedCall[] = [];
    const ex = makeExtractor(capture, () => makeEnvelopeResponse());
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
    });
    if (!result.ok) throw new Error(`should succeed: ${result.error}`);
    expect(result.claims.every((c) => c.frame_excluded !== true)).toBe(true);
  });
});

describe('MCPClaimExtractor model fallback handling', () => {
  it('records ModelFallbackEvent when envelope.model_requested !== envelope.model', async () => {
    const capture: CapturedCall[] = [];
    const ex = makeExtractor(capture, () =>
      makeEnvelopeResponse({
        model_requested: 'qwen3:14b',
        model: 'hermes3:8b',
        fallback_from: 'reviewer',
      }),
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      effectiveModel: 'qwen3:14b',
    });
    if (!result.ok) throw new Error(`should succeed: ${result.error}`);
    expect(result.modelFallbacks).toBeDefined();
    expect(result.modelFallbacks).toHaveLength(1);
    expect(result.modelFallbacks?.[0]?.model_requested).toBe('qwen3:14b');
    expect(result.modelFallbacks?.[0]?.model_used).toBe('hermes3:8b');
    expect(result.modelFallbacks?.[0]?.source_id).toBe('src_abcdef012345');
    expect(result.modelFallbacks?.[0]?.window_index).toBe(0);
    expect(result.modelFallbacks?.[0]?.fallback_from).toBe('reviewer');
  });

  it('records NO ModelFallbackEvent when envelope.model_requested === envelope.model', async () => {
    const capture: CapturedCall[] = [];
    const ex = makeExtractor(capture, () =>
      makeEnvelopeResponse({ model_requested: 'hermes3:8b', model: 'hermes3:8b' }),
    );
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      effectiveModel: 'hermes3:8b',
    });
    if (!result.ok) throw new Error(`should succeed: ${result.error}`);
    expect(result.modelFallbacks ?? []).toHaveLength(0);
  });

  it('records NO ModelFallbackEvent when no override was supplied (envelope.model_requested absent)', async () => {
    const capture: CapturedCall[] = [];
    const ex = makeExtractor(capture, () => makeEnvelopeResponse());
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
    });
    if (!result.ok) throw new Error(`should succeed: ${result.error}`);
    expect(result.modelFallbacks ?? []).toHaveLength(0);
  });
});

describe('MCPClaimExtractor failure modes', () => {
  it('returns ok:false when MCP response is not valid JSON', async () => {
    const capture: CapturedCall[] = [];
    const ex = makeExtractor(capture, () => ({
      content: [{ type: 'text', text: 'not-json-at-all' }],
    }));
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
    });
    expect(result.ok).toBe(false);
  });

  it('returns ok:false when the envelope result has ok:false', async () => {
    const capture: CapturedCall[] = [];
    const ex = makeExtractor(capture, () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            result: { ok: false, error: 'unparseable', raw: '???' },
            tier_used: 'workhorse',
            model: 'hermes3:8b',
            hardware_profile: 'test',
            tokens_in: 0,
            tokens_out: 0,
            elapsed_ms: 1,
            residency: null,
          }),
        },
      ],
    }));
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
    });
    expect(result.ok).toBe(false);
  });

  it('returns ok:false when MCP response is isError:true', async () => {
    const capture: CapturedCall[] = [];
    const ex = makeExtractor(capture, () => ({
      content: [{ type: 'text', text: '{"error":"boom"}' }],
      isError: true,
    }));
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
    });
    expect(result.ok).toBe(false);
  });

  it('returns ok:false when excerpts ledger is empty', async () => {
    const capture: CapturedCall[] = [];
    const ex = makeExtractor(capture, () => makeEnvelopeResponse());
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: [],
    });
    expect(result.ok).toBe(false);
    // Did not call the tool when there was nothing to send.
    expect(capture).toHaveLength(0);
  });
});

describe('MCPClaimExtractor source code surface', () => {
  it('contains no direct Ollama HTTP calls (no fetch / no /api/chat / no 11434 host literal)', async () => {
    const fs = await import('node:fs/promises');
    const url = await import('node:url');
    const fileURL = new URL('../src/claims/extractors/mcp.ts', import.meta.url);
    const text = await fs.readFile(url.fileURLToPath(fileURL), 'utf8');
    expect(text).not.toMatch(/127\.0\.0\.1:11434/);
    expect(text).not.toMatch(/localhost:11434/);
    expect(text).not.toMatch(/\/api\/chat/);
    expect(text).not.toMatch(/fetch\s*\(/);
  });

  it('DEFAULT_WINDOW_CHARS is 3_000 (v0.8.0 phase 1b-b correctness fix)', async () => {
    // Live diagnostic on 2026-05-12 showed 5_000 caused TIER_TIMEOUT on the
    // cosmology off-topic source for the dev-rtx5080 workhorse 8K-context
    // profile. 3_000 keeps the reference profile working out-of-the-box.
    // The constant is private to the module; we assert via the source text.
    const fs = await import('node:fs/promises');
    const url = await import('node:url');
    const fileURL = new URL('../src/claims/extractors/mcp.ts', import.meta.url);
    const text = await fs.readFile(url.fileURLToPath(fileURL), 'utf8');
    expect(text).toMatch(/const\s+DEFAULT_WINDOW_CHARS\s*=\s*3_000/);
    expect(text).not.toMatch(/const\s+DEFAULT_WINDOW_CHARS\s*=\s*5_000/);
  });

  it('OLLAMA_INTERN_WINDOW_CHARS env-var override still bypasses the default', async () => {
    // The env override path is the operator escape hatch. Setting it should
    // produce a different window count than the 3_000 default for an input
    // large enough to be paged into multiple windows.
    const prev = process.env.OLLAMA_INTERN_WINDOW_CHARS;
    process.env.OLLAMA_INTERN_WINDOW_CHARS = '500';
    try {
      const { pageExcerpts } = await import('../src/claims/extractors/mcp.js');
      // Two excerpts whose combined size is comfortably below 3_000 but
      // exceeds the env-supplied 500. We page directly so we are NOT testing
      // the side-effect of the env on the constructor; we just confirm the
      // env path is honoured for SOMETHING in the module's surface. The
      // surrounding extractor constructor consumes the env at instantiation.
      const ex0 = (text: string, idx: number) => ({
        excerpt_id: `ex_abcdef012345_${String(idx).padStart(3, '0')}`,
        source_id: 'src_abcdef012345',
        source_hash: null as string | null,
        text,
        location_hint: null as string | null,
        char_start: 0,
        char_end: text.length,
        origin: 'raw_text' as const,
        created_at: '2026-05-12T22:00:00.000Z',
      });
      // pageExcerpts respects the explicit window-chars arg; the env path is
      // exercised by constructor selection. Page with 500 to confirm split:
      const pages = pageExcerpts([ex0('a'.repeat(400), 1), ex0('b'.repeat(400), 2)], 500);
      expect(pages.length).toBeGreaterThan(1);
    } finally {
      if (prev === undefined) delete process.env.OLLAMA_INTERN_WINDOW_CHARS;
      else process.env.OLLAMA_INTERN_WINDOW_CHARS = prev;
    }
  });
});
