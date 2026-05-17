// R-019 — synth prose passes plannerTimeoutMs to MCP `ollama_extract` calls
// as `tier_budget_ms_override`, so the inner ollama-intern-mcp tier budget
// (default DEV_RTX5080_TIMEOUTS.instant = 15000) is overridden per-call.
//
// This is the WIRE-UP test (synthetic fake-client). The LIVE replay test
// against the actual ollama-intern-mcp MCP server lives in
// test/r019-live-replay.test.ts and is skip-when-not-rig.
//
// Pass-bar (all enforced here):
//   R-019.1  default behavior — no plannerTimeoutMs supplied → toolArgs do NOT
//            include `tier_budget_ms_override` (backward compat; ollama-intern-mcp
//            pre-R-019 callers' shape preserved byte-identically)
//   R-019.2  override propagates to PLANNER ollama_extract call
//   R-019.3  override propagates to DRAFTER ollama_extract call
//   R-019.4  override propagates to VERIFIER ollama_extract call
//   R-019.5  R-018 wrapper still wraps and fires when underlying call hangs
//            past the wrapper budget (orthogonal layer; defensive smoke test)
//   R-019.6  R-018 visibility surface unchanged — planner_timeout_ms + source
//            still populated correctly on synth result block
//   R-019.7  default vs override path produces byte-identical synth result
//            shape (no schema regression on the happy path)
//
// LAW 4 (synthetic-vs-live doctrine): these tests are NOT sufficient to
// declare R-019 acceptance. The live replay against the actual MCP server
// (test/r019-live-replay.test.ts) is the falsifiable acceptance gate.

import { describe, it, expect } from 'vitest';
import { runProseSynthesis } from '../src/synth/prose/run.js';
import {
  DEFAULT_PLANNER_TIMEOUT_MS,
} from '../src/synth/prose/types.js';
import type {
  AcceptedClaimInput,
  ProseCallToolClient,
  ProseRunInput,
  SourceCardMeta,
} from '../src/synth/prose/types.js';

const SECTION_PURPOSE = 'How does daylight-savings-time affect workplace productivity?';

function makeClaims(n: number): AcceptedClaimInput[] {
  return Array.from({ length: n }, (_, i) => ({
    claim_id: `clm_aaaaaaaaaaaa_heuristic_${i + 1}`,
    asserts: `Synthetic assertion ${i + 1} about DST and productivity`,
    scope: i % 2 === 0 ? `scope ${i}` : null,
    not: i % 3 === 0 ? `not ${i}` : null,
    source_ids: ['src_aaaaaaaaaaaa'],
    confidence: 'high' as const,
  }));
}

const SOURCE_CARDS: SourceCardMeta[] = [
  {
    source_id: 'src_aaaaaaaaaaaa',
    title: 'DST productivity study',
    publisher: 'Synthetic Publisher',
    source_type: 'peer_reviewed',
    url: 'https://example.invalid/dst-productivity',
  },
];

interface CapturedCall {
  name: string;
  arguments: Record<string, unknown>;
}

// A fake MCP client that records every callTool invocation and responds with
// a valid envelope so the synth pipeline runs end-to-end. The captured
// calls are inspected to verify tier_budget_ms_override propagation.
function makeCapturingClient(): {
  client: ProseCallToolClient;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const client: ProseCallToolClient = {
    async callTool(params) {
      calls.push({
        name: params.name,
        arguments: params.arguments as Record<string, unknown>,
      });
      const args = params.arguments as Record<string, unknown>;
      const text = typeof args.text === 'string' ? args.text : '';

      // Planner: assign one claim as answer, rest as evidence.
      if (text.includes('Assign each') || text.includes('Admission rule')) {
        const matches = text.match(/clm_\w+/g) ?? [];
        const ids = Array.from(new Set(matches));
        const assignments = ids.map((id, i) => ({
          claim_id: id,
          role: i === 0 ? 'answer' : 'evidence',
          role_rationale: i === 0
            ? 'directly answers the section purpose'
            : 'provides supporting evidence',
        }));
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ result: { ok: true, data: { assignments } } }),
          }],
        };
      }

      // Drafter: return a non-banned-opener paragraph.
      if (text.includes('Write ONE readable')) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              result: {
                ok: true,
                data: {
                  paragraph: 'DST transitions reduce productivity in the days that follow the spring-forward clock change.',
                },
              },
            }),
          }],
        };
      }

      // Verifier: bless the paragraph.
      if (text.includes('Does this paragraph faithfully')) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              result: {
                ok: true,
                data: { decision: 'faithful', rationale: 'every proposition supported' },
              },
            }),
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ result: { ok: true, data: {} } }),
        }],
      };
    },
  };
  return { client, calls };
}

function baseInput(client: ProseCallToolClient): ProseRunInput {
  return {
    sectionPurpose: SECTION_PURPOSE,
    acceptedClaims: makeClaims(2),
    sourceCards: SOURCE_CARDS,
    waivers: [],
    gateVerdict: 'warn',
    packMode: 'repair_required',
    client,
  };
}

// ── R-019.1 — default behavior preserved ────────────────────────────────────

describe('R-019.1 — default behavior preserved (no plannerTimeoutMs)', () => {
  it('toolArgs for planner/drafter/verifier do NOT include tier_budget_ms_override when plannerTimeoutMs is undefined', async () => {
    const { client, calls } = makeCapturingClient();
    const result = await runProseSynthesis(baseInput(client));
    expect(result.ok).toBe(true);
    // At least planner, drafter (1+ paragraphs), verifier (1+ paragraphs).
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const c of calls) {
      expect(c.name).toBe('ollama_extract');
      expect(c.arguments).not.toHaveProperty('tier_budget_ms_override');
    }
  });

  it('synth result block records planner_timeout_ms=DEFAULT_PLANNER_TIMEOUT_MS and NO planner_timeout_overridden_by', async () => {
    const { client } = makeCapturingClient();
    const result = await runProseSynthesis(baseInput(client));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.block.planner_timeout_ms).toBe(DEFAULT_PLANNER_TIMEOUT_MS);
      expect(result.block.planner_timeout_overridden_by).toBeUndefined();
    }
  });
});

// ── R-019.2 — override propagates to PLANNER ollama_extract ─────────────────

describe('R-019.2 — override propagates to planner ollama_extract', () => {
  it('plannerTimeoutMs=30000 → planner toolArgs include tier_budget_ms_override=30000', async () => {
    const { client, calls } = makeCapturingClient();
    const result = await runProseSynthesis({
      ...baseInput(client),
      plannerTimeoutMs: 30000,
      plannerTimeoutSource: 'env_var',
    });
    expect(result.ok).toBe(true);
    // The planner call is the first ollama_extract whose prompt mentions the assignment vocabulary.
    const plannerCall = calls.find((c) => {
      const text = c.arguments.text as string | undefined;
      return typeof text === 'string' && (text.includes('Assign each') || text.includes('Admission rule'));
    });
    expect(plannerCall, 'planner ollama_extract call should exist').toBeDefined();
    if (plannerCall) {
      expect(plannerCall.arguments).toHaveProperty('tier_budget_ms_override', 30000);
    }
  });
});

// ── R-019.3 — override propagates to DRAFTER ollama_extract ─────────────────

describe('R-019.3 — override propagates to drafter ollama_extract', () => {
  it('plannerTimeoutMs=30000 → drafter toolArgs include tier_budget_ms_override=30000', async () => {
    const { client, calls } = makeCapturingClient();
    const result = await runProseSynthesis({
      ...baseInput(client),
      plannerTimeoutMs: 30000,
      plannerTimeoutSource: 'env_var',
    });
    expect(result.ok).toBe(true);
    const drafterCalls = calls.filter((c) => {
      const text = c.arguments.text as string | undefined;
      return typeof text === 'string' && text.includes('Write ONE readable');
    });
    expect(drafterCalls.length).toBeGreaterThanOrEqual(1);
    for (const c of drafterCalls) {
      expect(c.arguments).toHaveProperty('tier_budget_ms_override', 30000);
    }
  });
});

// ── R-019.4 — override propagates to VERIFIER ollama_extract ────────────────

describe('R-019.4 — override propagates to verifier ollama_extract', () => {
  it('plannerTimeoutMs=30000 → verifier toolArgs include tier_budget_ms_override=30000', async () => {
    const { client, calls } = makeCapturingClient();
    const result = await runProseSynthesis({
      ...baseInput(client),
      plannerTimeoutMs: 30000,
      plannerTimeoutSource: 'env_var',
    });
    expect(result.ok).toBe(true);
    const verifierCalls = calls.filter((c) => {
      const text = c.arguments.text as string | undefined;
      return typeof text === 'string' && text.includes('Does this paragraph faithfully');
    });
    expect(verifierCalls.length).toBeGreaterThanOrEqual(1);
    for (const c of verifierCalls) {
      expect(c.arguments).toHaveProperty('tier_budget_ms_override', 30000);
    }
  });

  it('all planner+drafter+verifier calls receive the same override value', async () => {
    const { client, calls } = makeCapturingClient();
    await runProseSynthesis({
      ...baseInput(client),
      plannerTimeoutMs: 45000,
      plannerTimeoutSource: 'cli_flag',
    });
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const c of calls) {
      expect(c.arguments).toHaveProperty('tier_budget_ms_override', 45000);
    }
  });
});

// ── R-019.5 — R-018 wrapper still wraps (defensive smoke test) ─────────────

describe('R-019.5 — R-018 wrapper still active (orthogonal layer)', () => {
  it('wrapper rejects with TIER_TIMEOUT shape when underlying call hangs past wrapper budget', async () => {
    // Fake client whose callTool never resolves (simulates a wedged MCP).
    const hangingClient: ProseCallToolClient = {
      callTool: () => new Promise(() => {/* never resolves */}),
    };
    const start = Date.now();
    const result = await runProseSynthesis({
      ...baseInput(hangingClient),
      plannerTimeoutMs: 80, // very short for fast test
      plannerTimeoutSource: 'cli_flag',
    });
    const elapsed = Date.now() - start;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('planner failed');
      expect(result.error).toContain('TIER_TIMEOUT');
      expect(result.error).toContain('elapsed=');
      expect(result.error).toContain('budget=80ms');
    }
    // Sanity: did not wait the full default 15000ms; wrapper fired at ~80ms.
    expect(elapsed).toBeLessThan(5000);
  });
});

// ── R-019.6 — R-018 visibility surface unchanged ────────────────────────────

describe('R-019.6 — R-018 visibility surface unchanged under R-019', () => {
  it('override path → planner_timeout_ms + planner_timeout_overridden_by populated correctly', async () => {
    const { client } = makeCapturingClient();
    const result = await runProseSynthesis({
      ...baseInput(client),
      plannerTimeoutMs: 30000,
      plannerTimeoutSource: 'env_var',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.block.planner_timeout_ms).toBe(30000);
      expect(result.block.planner_timeout_overridden_by).toBe('env_var');
    }
  });

  it('cli_flag source preserved', async () => {
    const { client } = makeCapturingClient();
    const result = await runProseSynthesis({
      ...baseInput(client),
      plannerTimeoutMs: 60000,
      plannerTimeoutSource: 'cli_flag',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.block.planner_timeout_ms).toBe(60000);
      expect(result.block.planner_timeout_overridden_by).toBe('cli_flag');
    }
  });
});

// ── R-019.7 — schema regression smoke test ──────────────────────────────────

describe('R-019.7 — synth result block schema unchanged on happy path', () => {
  it('default-path result block carries the same keys as before R-019 (no schema regression)', async () => {
    const { client } = makeCapturingClient();
    const result = await runProseSynthesis(baseInput(client));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = Object.keys(result.block).sort();
      // R-018 added planner_timeout_ms and (conditionally) planner_timeout_overridden_by.
      // R-019 must NOT add any new keys to the block.
      expect(keys).toEqual(
        [
          'disclosures',
          'generator',
          'paragraphs',
          'planner_timeout_ms',
          'section_purpose',
        ].sort(),
      );
    }
  });
});
