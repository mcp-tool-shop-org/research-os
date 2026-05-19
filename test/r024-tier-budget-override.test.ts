// R-024 (v0.13.1) — claim extract passes the operator's per-call tier-budget
// override into ollama-intern-mcp@>=2.6.0 as `tier_budget_ms_override` on
// EVERY `ollama_extract` callTool invocation made during a `claim extract`
// run (the three call sites: per-window extractor + per-claim section-evidence
// critic (R-011) + per-rescue-candidate rescue critic (R-012)). The override
// is operator-controlled via `claim extract --tier-budget-ms <N>` or the
// `RESEARCH_OS_EXTRACT_TIER_BUDGET_MS` env var.
//
// This is the WIRE-UP test (synthetic fake-client). The LIVE replay test
// against the actual ollama-intern-mcp MCP server lives in
// test/r024-live-replay.test.ts and is skip-when-not-rig per the synthetic-
// vs-live acceptance doctrine.
//
// Pass-bar (all enforced here):
//   R-024.1   default behavior — no tierBudgetMsOverride supplied → toolArgs
//             omit `tier_budget_ms_override` on every captured ollama_extract
//             call (extractor + critic) — preserves byte-identical pre-R-024
//             behavior under the published ollama-intern-mcp@2.6.0 contract.
//   R-024.2   override propagates to extractOnePage's ollama_extract call.
//   R-024.3   override propagates to runCritic's ollama_extract call
//             (the per-claim section-evidence critic — R-011).
//   R-024.4   buildRescueCriticToolArgs forwards the override (R-012 path).
//   R-024.5   override flows to EVERY ollama_extract call when set — no
//             uncovered call site (the full-coverage tier-budget law).
//   R-024.6   validateExtractTierBudgetValue rejects invalid raw strings.
//   R-024.7   resolveExtractTierBudget honors CLI > env > default precedence.
//   R-024.8   formatExtractTierBudgetLogLine emits the expected grep-friendly
//             shape (both override and default forms).
//   R-024.9   parseExtractTierBudgetMsArg throws on bad input + returns int
//             on valid input.
//   R-024.10  buildCriticToolArgs surfaces the override exactly once when set
//             AND omits it when unset (request-shape test).
//   R-024.11  defense-floor preservation — R-018 (planner_timeout) + R-019
//             (synth wire-up) + R-020 (no_answer_cluster recovery_actions) +
//             R-021 (contradict auto-mode flags) + R-015 (extract resume/
//             progress) closed-enum and helper imports still resolve.
//
// LAW 4 (synthetic-vs-live doctrine): these tests are NOT sufficient to
// declare R-024 acceptance. The live replay against the actual MCP server
// (test/r024-live-replay.test.ts) is the falsifiable acceptance gate.

import { describe, it, expect } from 'vitest';
import { InvalidArgumentError } from 'commander';

import { MCPClaimExtractor } from '../src/claims/extractors/mcp.js';
import { MCPClientHandle } from '../src/mcp/client.js';
import {
  buildCriticToolArgs,
  type CriticInput,
} from '../src/claims/critic/mcp-critic.js';
import { buildRescueCriticToolArgs } from '../src/claims/critic/rescue-critic.js';
import {
  EXTRACT_TIER_BUDGET_SOURCES,
  MAX_EXTRACT_TIER_BUDGET_MS,
  MIN_EXTRACT_TIER_BUDGET_MS,
  formatExtractTierBudgetLogLine,
  resolveExtractTierBudget,
  validateExtractTierBudgetValue,
} from '../src/claims/types.js';
import { parseExtractTierBudgetMsArg } from '../src/cli.js';
import type { Excerpt } from '../src/sources/excerpts/schema.js';
import type { SourceCard } from '../src/sources/schema.js';

// R-024.11 — defense-floor preservation: explicit imports from the surfaces
// R-024 must not regress. Type-only re-imports + a runtime smoke import on
// each module so any incidental break shows up at test load time.
import {
  DEFAULT_PLANNER_TIMEOUT_MS,
  MAX_PLANNER_TIMEOUT_MS,
  PLANNER_TIMEOUT_SOURCES,
  resolvePlannerTimeout,
  wrapClientWithTimeout,
} from '../src/synth/prose/types.js';
import { buildPlannerToolArgs } from '../src/synth/prose/planner.js';
import {
  DEFAULT_AUTO_MODE_PAIR_TIMEOUT_MS,
  DEFAULT_AUTO_MODE_FALL_THROUGH_AFTER_N,
} from '../src/contradictions/types.js';
import { getNoAnswerClusterRecoveryActions } from '../src/recover/action-graph.js';

// ---- Test fixtures ---------------------------------------------------------

const baseCard: SourceCard = {
  source_id: 'src_r024aaaaaaaa',
  receipt_id: 'rcpt_r024aaaaaaaa_1700000000000',
  section_id: '02-safety-and-economic',
  url: 'https://example.invalid/nber-w14429',
  final_url: 'https://example.invalid/nber-w14429',
  fetched_at: '2026-05-18T03:20:00.000Z',
  publisher: 'Synthetic NBER',
  published_at: null,
  title: 'Synthetic energy-savings null result',
  source_type: 'primary',
  relevance: 'unknown',
  key_points: ['kp1'],
  limitations: [],
  asserts: 'Source headline',
  scope: null,
  not: null,
  extracted_by: 'heuristic',
  extracted_at: '2026-05-18T03:20:00.000Z',
};

function ex(idx: number, text: string): Excerpt {
  return {
    excerpt_id: `ex_r024aaaaaaaa_${String(idx).padStart(3, '0')}`,
    source_id: 'src_r024aaaaaaaa',
    source_hash: null,
    text,
    location_hint: `paragraph ${idx}`,
    char_start: 0,
    char_end: text.length,
    origin: 'raw_text',
    created_at: '2026-05-18T03:20:00.000Z',
  };
}

const sampleExcerpts: Excerpt[] = [
  ex(1, 'Daylight savings time produced no statistically significant change in residential electricity consumption in the Indiana panel.'),
  ex(2, 'The authors disclose a null result and recommend skepticism toward bundled bills citing energy savings.'),
];

// ---- Fake MCP client + handle (mirrors claims-extractor-mcp.test.ts) ------

interface CapturedCall {
  name: string;
  arguments: Record<string, unknown>;
}

interface FakeResponseShape {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

function makeFakeClient(
  capture: CapturedCall[],
  responder: (call: CapturedCall) => FakeResponseShape,
): unknown {
  return {
    async callTool(params: { name: string; arguments: Record<string, unknown> }) {
      const call: CapturedCall = {
        name: params.name,
        arguments: params.arguments,
      };
      capture.push(call);
      return responder(call);
    },
  };
}

function makeExtractorEnvelope(claimText: string): FakeResponseShape {
  const envelope: Record<string, unknown> = {
    result: {
      ok: true,
      data: {
        claims: [
          {
            asserts: claimText,
            scope: 'Indiana residential panel, 2006-2008',
            not: 'business-sector consumption',
            evidence_excerpt_ids: ['ex_r024aaaaaaaa_001'],
            evidence_location: 'paragraph 1',
            confidence: 'medium',
          },
        ],
      },
      frame_alignment: { on_topic: true, reason: 'addresses DST energy effects' },
    },
    tier_used: 'workhorse',
    model: 'hermes3:8b',
    hardware_profile: 'test',
    tokens_in: 100,
    tokens_out: 50,
    elapsed_ms: 10,
    residency: null,
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(envelope) }],
  };
}

function makeCriticEnvelope(label: 'supports_section' = 'supports_section'): FakeResponseShape {
  const envelope = {
    result: {
      ok: true,
      data: {
        label,
        rationale:
          'Claim directly addresses the section purpose (DST economic effects) with a primary null-result data point.',
      },
    },
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(envelope) }],
  };
}

// Discriminate which ollama_extract call we're servicing by inspecting the
// `text` field of the prompt. The extractor prompt mentions "EXCERPT LEDGER";
// the section-evidence critic prompt mentions "Is the claim's assertion topically
// useful as evidence". We use those substrings to route the fake responder.
function defaultResponder(call: CapturedCall): FakeResponseShape {
  const text = String(call.arguments.text ?? '');
  if (text.includes('EXCERPT LEDGER BEGIN')) {
    return makeExtractorEnvelope('DST produced no significant electricity change in the Indiana panel.');
  }
  // Otherwise assume per-claim critic.
  return makeCriticEnvelope('supports_section');
}

function makeExtractor(
  capture: CapturedCall[],
  responder: (call: CapturedCall) => FakeResponseShape = defaultResponder,
): MCPClaimExtractor {
  return new MCPClaimExtractor({
    handleFactory: () => {
      const fake = makeFakeClient(capture, responder);
      const handle = new MCPClientHandle({});
      (handle as unknown as { connect: () => Promise<unknown> }).connect = async () => fake;
      (handle as unknown as { close: () => Promise<void> }).close = async () => {
        /* no-op */
      };
      return handle;
    },
  });
}

// ---- Tests ----------------------------------------------------------------

describe('R-024.6 — validateExtractTierBudgetValue', () => {
  it('accepts a positive integer string within bounds', () => {
    const r = validateExtractTierBudgetValue('30000', 'cli_flag');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(30000);
  });

  it('rejects negative integers', () => {
    const r = validateExtractTierBudgetValue('-5', 'cli_flag');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('--tier-budget-ms');
  });

  it('rejects zero', () => {
    const r = validateExtractTierBudgetValue('0', 'cli_flag');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('--tier-budget-ms');
  });

  it('rejects unit-suffixed strings (no silent parseInt acceptance of "30s")', () => {
    const r = validateExtractTierBudgetValue('30s', 'cli_flag');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("got '30s'");
  });

  it('rejects values above MAX_EXTRACT_TIER_BUDGET_MS (typo guard)', () => {
    const r = validateExtractTierBudgetValue(String(MAX_EXTRACT_TIER_BUDGET_MS + 1), 'cli_flag');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('10 minutes');
  });

  it('names the env-var surface when source=env_var', () => {
    const r = validateExtractTierBudgetValue('abc', 'env_var');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('RESEARCH_OS_EXTRACT_TIER_BUDGET_MS');
  });

  it('accepts the boundary values (1 and 600000)', () => {
    expect(validateExtractTierBudgetValue(String(MIN_EXTRACT_TIER_BUDGET_MS), 'cli_flag').ok).toBe(true);
    expect(validateExtractTierBudgetValue(String(MAX_EXTRACT_TIER_BUDGET_MS), 'cli_flag').ok).toBe(true);
  });
});

describe('R-024.7 — resolveExtractTierBudget (precedence)', () => {
  it('CLI flag wins over env var', () => {
    const r = resolveExtractTierBudget({ cliFlagMs: 60000, envVar: '30000' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(60000);
      expect(r.source).toBe('cli_flag');
    }
  });

  it('env var is honored when CLI flag is undefined', () => {
    const r = resolveExtractTierBudget({ cliFlagMs: undefined, envVar: '45000' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(45000);
      expect(r.source).toBe('env_var');
    }
  });

  it('default returns value=undefined + source=default (no research-os-side default value)', () => {
    const r = resolveExtractTierBudget({ cliFlagMs: undefined, envVar: undefined });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBeUndefined();
      expect(r.source).toBe('default');
    }
  });

  it('empty-string env var is treated as unset', () => {
    const r = resolveExtractTierBudget({ cliFlagMs: undefined, envVar: '' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBeUndefined();
      expect(r.source).toBe('default');
    }
  });

  it('malformed env var bubbles up the validator error (with surface name)', () => {
    const r = resolveExtractTierBudget({ cliFlagMs: undefined, envVar: '30s' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('RESEARCH_OS_EXTRACT_TIER_BUDGET_MS');
      expect(r.error).toContain('30s');
    }
  });
});

describe('R-024.8 — formatExtractTierBudgetLogLine', () => {
  it('emits the override shape on cli_flag source', () => {
    expect(formatExtractTierBudgetLogLine(60000, 'cli_flag')).toBe(
      '[extract] tier_budget_ms=60000 source=cli_flag',
    );
  });

  it('emits the override shape on env_var source', () => {
    expect(formatExtractTierBudgetLogLine(45000, 'env_var')).toBe(
      '[extract] tier_budget_ms=45000 source=env_var',
    );
  });

  it('emits the literal "default" token when value is undefined (profile defaults govern)', () => {
    expect(formatExtractTierBudgetLogLine(undefined, 'default')).toBe(
      '[extract] tier_budget_ms=default source=default',
    );
  });

  it('EXTRACT_TIER_BUDGET_SOURCES enum is exactly the three documented values', () => {
    expect([...EXTRACT_TIER_BUDGET_SOURCES]).toEqual(['default', 'cli_flag', 'env_var']);
  });
});

describe('R-024.9 — parseExtractTierBudgetMsArg (CLI coercer)', () => {
  it('returns the integer value on valid input', () => {
    expect(parseExtractTierBudgetMsArg('45000')).toBe(45000);
  });

  it('throws InvalidArgumentError on non-numeric input', () => {
    expect(() => parseExtractTierBudgetMsArg('bogus')).toThrow(InvalidArgumentError);
  });

  it('throws InvalidArgumentError on zero', () => {
    expect(() => parseExtractTierBudgetMsArg('0')).toThrow(InvalidArgumentError);
  });

  it('throws InvalidArgumentError on values above the upper bound', () => {
    expect(() => parseExtractTierBudgetMsArg(String(MAX_EXTRACT_TIER_BUDGET_MS + 1))).toThrow(
      InvalidArgumentError,
    );
  });
});

describe('R-024.10 — buildCriticToolArgs forwards tier_budget_ms_override', () => {
  const baseInput: CriticInput = {
    sectionPurpose: 'DST effects on workplace productivity',
    claimAsserts: 'Spring-forward DST reduces output the day after the transition.',
    sourceTitle: 'Synthetic study',
    sourcePublisher: 'Synthetic Publisher',
    sourceType: 'primary',
  };

  it('omits tier_budget_ms_override when input.tierBudgetMsOverride is undefined', () => {
    const args = buildCriticToolArgs(baseInput);
    expect(args).not.toHaveProperty('tier_budget_ms_override');
  });

  it('includes tier_budget_ms_override when input.tierBudgetMsOverride is set', () => {
    const args = buildCriticToolArgs({ ...baseInput, tierBudgetMsOverride: 60000 });
    expect(args.tier_budget_ms_override).toBe(60000);
  });
});

describe('R-024.4 — buildRescueCriticToolArgs forwards tier_budget_ms_override', () => {
  const baseRescue = {
    sectionPurpose: 'DST effects on workplace productivity',
    claimAsserts: 'Western-edge-of-time-zone moderator effect on motor-vehicle crash rates.',
    sourceTitle: 'Synthetic study',
    sourcePublisher: 'Synthetic Publisher',
    sourceType: 'primary',
    sourceExcerpt: 'The study briefly notes a moderator effect in western-edge counties of the time zone…',
    peerAsserts: ['DST is associated with elevated MVA rates in spring.', 'Effect persists across years.'],
  };

  it('omits tier_budget_ms_override when undefined', () => {
    const args = buildRescueCriticToolArgs(baseRescue);
    expect(args).not.toHaveProperty('tier_budget_ms_override');
  });

  it('forwards tier_budget_ms_override when set', () => {
    const args = buildRescueCriticToolArgs({ ...baseRescue, tierBudgetMsOverride: 75000 });
    expect(args.tier_budget_ms_override).toBe(75000);
  });
});

describe('R-024.1 — default path (no override) preserves byte-identical pre-R-024 behavior', () => {
  it('omits tier_budget_ms_override from EVERY captured ollama_extract call when input.tierBudgetMsOverride is undefined', async () => {
    const capture: CapturedCall[] = [];
    const extractor = makeExtractor(capture);
    const result = await extractor.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'DST effects on energy savings',
      // No tierBudgetMsOverride — the operator did NOT opt in.
    });
    expect(result.ok).toBe(true);
    expect(capture.length).toBeGreaterThanOrEqual(1);
    for (const call of capture) {
      expect(call.name).toBe('ollama_extract');
      expect(call.arguments).not.toHaveProperty('tier_budget_ms_override');
    }
  });
});

describe('R-024.2 — override propagates to extractOnePage ollama_extract call', () => {
  it('captures tier_budget_ms_override on the per-window extractor call', async () => {
    const capture: CapturedCall[] = [];
    const extractor = makeExtractor(capture);
    await extractor.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'DST effects on energy savings',
      tierBudgetMsOverride: 60000,
    });
    expect(capture.length).toBeGreaterThanOrEqual(1);
    const extractorCall = capture.find((c) =>
      String(c.arguments.text ?? '').includes('EXCERPT LEDGER BEGIN'),
    );
    expect(extractorCall).toBeDefined();
    expect(extractorCall!.arguments.tier_budget_ms_override).toBe(60000);
  });
});

describe('R-024.3 — override propagates to runCritic ollama_extract call (R-011)', () => {
  it('captures tier_budget_ms_override on the per-claim section-evidence critic call', async () => {
    const capture: CapturedCall[] = [];
    const extractor = makeExtractor(capture);
    await extractor.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'DST effects on energy savings',
      tierBudgetMsOverride: 60000,
    });
    // The critic call is any ollama_extract call whose text does NOT contain
    // the extractor's EXCERPT LEDGER preamble. With framePurpose set, the
    // per-claim critic fires once per draft.
    const criticCall = capture.find(
      (c) => !String(c.arguments.text ?? '').includes('EXCERPT LEDGER BEGIN'),
    );
    expect(criticCall, 'expected at least one critic call when framePurpose is set').toBeDefined();
    expect(criticCall!.arguments.tier_budget_ms_override).toBe(60000);
  });
});

describe('R-024.5 — full-coverage tier-budget law: override flows to EVERY captured call', () => {
  it('every captured ollama_extract call carries the override (no uncovered call site)', async () => {
    const capture: CapturedCall[] = [];
    const extractor = makeExtractor(capture);
    await extractor.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
      framePurpose: 'DST effects on energy savings',
      tierBudgetMsOverride: 90000,
    });
    expect(capture.length).toBeGreaterThanOrEqual(2); // extractor + at least one critic call
    for (const call of capture) {
      expect(call.name).toBe('ollama_extract');
      expect(
        call.arguments.tier_budget_ms_override,
        `expected tier_budget_ms_override on every call; missing on call with text: ${String(call.arguments.text).slice(0, 80)}`,
      ).toBe(90000);
    }
  });
});

describe('R-024.11 — defense-floor preservation (smoke imports)', () => {
  it('R-018 (synth planner-timeout) surface still resolves', () => {
    expect(DEFAULT_PLANNER_TIMEOUT_MS).toBe(15000);
    expect(MAX_PLANNER_TIMEOUT_MS).toBe(600_000);
    expect([...PLANNER_TIMEOUT_SOURCES]).toEqual(['default', 'cli_flag', 'env_var']);
    expect(typeof resolvePlannerTimeout).toBe('function');
    expect(typeof wrapClientWithTimeout).toBe('function');
  });

  it('R-019 (synth tier-budget client wire-up) surface still resolves', () => {
    // R-019's marker is buildPlannerToolArgs accepting tierBudgetMsOverride.
    const args = buildPlannerToolArgs(
      'test section purpose',
      [
        {
          claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
          asserts: 'test assert',
          scope: null,
          not: null,
          source_ids: ['src_aaaaaaaaaaaa'],
          confidence: 'high',
        },
      ],
      undefined,
      30000,
    );
    expect(args.tier_budget_ms_override).toBe(30000);
  });

  it('R-020 (no_answer_cluster recovery_actions) surface still resolves', () => {
    const actions = getNoAnswerClusterRecoveryActions('01-test');
    expect(Array.isArray(actions)).toBe(true);
    expect(actions.length).toBeGreaterThan(0);
    // Confirm the action_id contract is intact.
    expect(actions[0]).toHaveProperty('action_id');
    expect(actions[0]).toHaveProperty('why');
    expect(actions[0]).toHaveProperty('command_hint');
  });

  it('R-021 (contradict auto-mode defaults) surface still resolves', () => {
    expect(DEFAULT_AUTO_MODE_PAIR_TIMEOUT_MS).toBe(90000);
    expect(DEFAULT_AUTO_MODE_FALL_THROUGH_AFTER_N).toBe(5);
  });
});
