// R-018 — synth planner timeout override / visibility.
//
// One-knob patch for v0.12.1. The synth pipeline (planner → drafter →
// verifier) wraps each MCP callTool with a research-os-side timeout. The
// default value (15000ms) matches the de-facto observed Instant-tier budget
// the v0.4 gate hit; operators can raise the ceiling via --planner-timeout-ms
// on `research-os synth section <id>` or the equivalent env var
// RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS.
//
// Pass-bar (all enforced here):
//   R-018.1  default behavior unchanged — metadata records 15000ms, no override annotation
//   R-018.2  CLI flag → metadata records value + overridden_by=cli_flag
//   R-018.3  env var → metadata records value + overridden_by=env_var
//   R-018.4  CLI flag wins when both set
//   R-018.5  invalid values fail with clear surface + value naming
//   R-018.6  active timeout reflected in stderr log line
//   R-018.7  --help text documents flag, default, upper bound, env var
//   R-018.8  v0.4 replay condition — synthetic ~15010ms callTool times out at default 15000ms, succeeds at 30000ms override
//   R-018.9  R-010 TIER_TIMEOUT visibility unchanged on default path
//   R-018.10 R-014 regenerate-action-graph unchanged
//   R-018.11 R-012 / R-013 / R-015 / R-016 / R-017 surfaces untouched
//   R-018.12 baseline tests still pass (separately enforced by the full test run)
//   R-018.13 4-pack regression byte-identical (separately enforced by the 4-pack runner)
//
// The CLI flag + env var surface is tested via the pure resolver
// (resolvePlannerTimeout) rather than spawning the CLI subprocess — this
// mirrors test/cli/parse-int-validation.test.ts's D-006 precedent (unit-test
// the coercer rather than mock commander.action). The integration path is
// exercised via the runProseSynthesis fake-MCP-client harness.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  DEFAULT_PLANNER_TIMEOUT_MS,
  MIN_PLANNER_TIMEOUT_MS,
  MAX_PLANNER_TIMEOUT_MS,
  PLANNER_TIMEOUT_SOURCES,
  validatePlannerTimeoutValue,
  resolvePlannerTimeout,
  wrapClientWithTimeout,
  formatPlannerTimeoutLogLine,
} from '../src/synth/prose/types.js';
import { runProseSynthesis } from '../src/synth/prose/run.js';
import type {
  AcceptedClaimInput,
  ProseCallToolClient,
  ProseRunInput,
  SourceCardMeta,
} from '../src/synth/prose/types.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const cliPath = join(__dirname, '..', 'dist', 'cli.js');

function runCli(args: string[], env: Record<string, string> = {}): {
  stdout: string;
  stderr: string;
  status: number;
} {
  try {
    const stdout = execFileSync('node', [cliPath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    return { stdout, stderr: '', status: 0 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      status?: number;
    };
    return {
      stdout: typeof e.stdout === 'string' ? e.stdout : (e.stdout?.toString('utf8') ?? ''),
      stderr: typeof e.stderr === 'string' ? e.stderr : (e.stderr?.toString('utf8') ?? ''),
      status: typeof e.status === 'number' ? e.status : 1,
    };
  }
}

// ── Synthetic fixtures ──────────────────────────────────────────────────────

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

// A fake MCP client that responds INSTANTLY (no delay). Used by the
// happy-path tests where the wrapper should never fire.
function makeFastClient(): ProseCallToolClient {
  return {
    async callTool(params) {
      const args = params.arguments as Record<string, unknown>;
      const text = typeof args.text === 'string' ? args.text : '';

      // Planner: assign one claim as answer, rest as evidence.
      if (text.includes('Assign each') || text.includes('Admission rule')) {
        const matches = text.match(/clm_\w+/g) ?? [];
        const ids = Array.from(new Set(matches));
        const assignments = ids.map((id, i) => ({
          claim_id: id,
          role: i === 0 ? 'answer' : 'evidence',
          role_rationale: i === 0 ? 'directly answers the section purpose' : 'provides supporting evidence',
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
            text: JSON.stringify({ result: { ok: true, data: { paragraph: 'DST transitions reduce productivity in the days that follow the spring-forward clock change.' } } }),
          }],
        };
      }

      // Verifier: bless the paragraph.
      if (text.includes('Does this paragraph faithfully')) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ result: { ok: true, data: { decision: 'faithful', rationale: 'every proposition supported' } } }),
          }],
        };
      }

      // Unknown prompt — return a generic ok envelope to avoid blocking.
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ result: { ok: true, data: {} } }),
        }],
      };
    },
  };
}

// A fake MCP client whose callTool resolves after `delayMs`. Used by the
// timeout-firing tests — the wrapper's race-against-clock is the unit under
// test, so we DO NOT use vi.useFakeTimers (which would also fake the
// wrapper's setTimeout).
function makeDelayedClient(delayMs: number): ProseCallToolClient {
  const fast = makeFastClient();
  return {
    async callTool(params) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      return fast.callTool(params);
    },
  };
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

// ── R-018 pure helpers ───────────────────────────────────────────────────────

describe('R-018 — constants', () => {
  it('default planner timeout is 15000ms (matches v0.4 observed Instant-tier budget)', () => {
    expect(DEFAULT_PLANNER_TIMEOUT_MS).toBe(15000);
  });

  it('min planner timeout is 1ms (zero is rejected)', () => {
    expect(MIN_PLANNER_TIMEOUT_MS).toBe(1);
  });

  it('max planner timeout is 600000ms (10 minute safety rail)', () => {
    expect(MAX_PLANNER_TIMEOUT_MS).toBe(600_000);
  });

  it('PLANNER_TIMEOUT_SOURCES is the closed-enum vocabulary', () => {
    expect(PLANNER_TIMEOUT_SOURCES).toEqual(['default', 'cli_flag', 'env_var']);
  });
});

describe('R-018.5 — validatePlannerTimeoutValue (invalid values fail clearly)', () => {
  it('rejects negative numbers — names surface + value', () => {
    const r = validatePlannerTimeoutValue('-1', 'cli_flag');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('--planner-timeout-ms');
      expect(r.error).toContain('-1');
    }
  });

  it('rejects zero', () => {
    const r = validatePlannerTimeoutValue('0', 'cli_flag');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('--planner-timeout-ms');
      expect(r.error).toContain('0');
    }
  });

  it('rejects non-numeric strings', () => {
    const r = validatePlannerTimeoutValue('abc', 'cli_flag');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('--planner-timeout-ms');
      expect(r.error).toContain('abc');
    }
  });

  it('rejects unit-suffixed strings like "10s" or "30000ms"', () => {
    for (const bad of ['10s', '30000ms', '15s', '15 s']) {
      const r = validatePlannerTimeoutValue(bad, 'cli_flag');
      expect(r.ok, `expected reject for ${bad}`).toBe(false);
    }
  });

  it('rejects values above the 600000ms safety rail', () => {
    const r = validatePlannerTimeoutValue('700000', 'cli_flag');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('--planner-timeout-ms');
      expect(r.error).toContain('700000');
      expect(r.error).toContain('600000');
    }
  });

  it('env var surface — error message names env var + value', () => {
    const r = validatePlannerTimeoutValue('-1', 'env_var');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS');
      expect(r.error).toContain('-1');
    }
  });

  it('accepts valid values at the boundaries (1, 15000, 600000)', () => {
    for (const good of ['1', '15000', '600000', '30000']) {
      const r = validatePlannerTimeoutValue(good, 'cli_flag');
      expect(r.ok, `expected accept for ${good}`).toBe(true);
      if (r.ok) expect(r.value).toBe(parseInt(good, 10));
    }
  });
});

describe('R-018.4 — resolvePlannerTimeout (CLI > env > default precedence)', () => {
  it('default when neither cliFlag nor env is set', () => {
    const r = resolvePlannerTimeout({ cliFlagMs: undefined, envVar: undefined });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(15000);
      expect(r.source).toBe('default');
    }
  });

  it('env var when only env is set', () => {
    const r = resolvePlannerTimeout({ cliFlagMs: undefined, envVar: '30000' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(30000);
      expect(r.source).toBe('env_var');
    }
  });

  it('cli flag when only cli flag is set', () => {
    const r = resolvePlannerTimeout({ cliFlagMs: 30000, envVar: undefined });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(30000);
      expect(r.source).toBe('cli_flag');
    }
  });

  it('cli flag wins when both are set (precedence)', () => {
    const r = resolvePlannerTimeout({ cliFlagMs: 30000, envVar: '20000' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(30000);
      expect(r.source).toBe('cli_flag');
    }
  });

  it('rejects invalid env var', () => {
    const r = resolvePlannerTimeout({ cliFlagMs: undefined, envVar: 'abc' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS');
      expect(r.error).toContain('abc');
    }
  });

  it('treats empty string env var as unset (default)', () => {
    const r = resolvePlannerTimeout({ cliFlagMs: undefined, envVar: '' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toBe('default');
      expect(r.value).toBe(15000);
    }
  });
});

// ── R-018 wrapper helper (Promise.race timeout decorator) ────────────────────

describe('R-018 — wrapClientWithTimeout (Promise.race decorator)', () => {
  it('passes through to underlying client when call resolves within budget', async () => {
    const fast = makeFastClient();
    const wrapped = wrapClientWithTimeout(fast, 5000);
    const resp = await wrapped.callTool({ name: 'ollama_extract', arguments: { text: 'Assign each foo' } });
    expect(resp.content?.[0]?.text).toContain('"ok":true');
  });

  it('rejects with a TIER_TIMEOUT-shaped error when call exceeds budget', async () => {
    const slow = makeDelayedClient(120); // resolves after 120ms
    const wrapped = wrapClientWithTimeout(slow, 50); // budget 50ms
    let caught: Error | undefined;
    try {
      await wrapped.callTool({ name: 'ollama_extract', arguments: { text: 'irrelevant' } });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toContain('TIER_TIMEOUT');
    expect(caught!.message).toContain('50');
  });

  it('error message includes elapsed + budget fields (R-010 shape preserved)', async () => {
    const slow = makeDelayedClient(100);
    const wrapped = wrapClientWithTimeout(slow, 30);
    let caught: Error | undefined;
    try {
      await wrapped.callTool({ name: 'ollama_extract', arguments: { text: 'irrelevant' } });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    // R-010's classifyFallbackCause matches /elapsed=(\d+)ms/ and
    // /budget=(\d+)ms/. The wrapper must emit both so R-010 visibility
    // continues to surface a cause for AI-advisor TIER_TIMEOUT downstream.
    expect(caught!.message).toMatch(/elapsed=\d+ms/);
    expect(caught!.message).toMatch(/budget=\d+ms/);
  });

  it('does not eat caller-side errors (passes errors through unchanged)', async () => {
    const erroring: ProseCallToolClient = {
      async callTool() {
        throw new Error('underlying transport failed');
      },
    };
    const wrapped = wrapClientWithTimeout(erroring, 1000);
    let caught: Error | undefined;
    try {
      await wrapped.callTool({ name: 'ollama_extract', arguments: {} });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toContain('underlying transport failed');
  });
});

// ── R-018.1 — default behavior preserved (no override) ───────────────────────

describe('R-018.1 — default behavior unchanged', () => {
  it('synthesis metadata records planner_timeout_ms=15000 + no overridden_by annotation', async () => {
    const result = await runProseSynthesis(baseInput(makeFastClient()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.block.planner_timeout_ms).toBe(15000);
    // Default path: planner_timeout_overridden_by must be absent (undefined) or null,
    // never set to one of the override sources.
    expect(result.block.planner_timeout_overridden_by ?? null).toBeNull();
  });
});

// ── R-018.2 — CLI flag sets planner timeout ──────────────────────────────────

describe('R-018.2 — CLI flag override', () => {
  it('synthesis metadata records value + overridden_by=cli_flag when CLI flag is set', async () => {
    const input: ProseRunInput = {
      ...baseInput(makeFastClient()),
      plannerTimeoutMs: 30000,
      plannerTimeoutSource: 'cli_flag',
    };
    const result = await runProseSynthesis(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.block.planner_timeout_ms).toBe(30000);
    expect(result.block.planner_timeout_overridden_by).toBe('cli_flag');
  });
});

// ── R-018.3 — env var sets planner timeout ───────────────────────────────────

describe('R-018.3 — env var override', () => {
  it('synthesis metadata records value + overridden_by=env_var when env var is set', async () => {
    const input: ProseRunInput = {
      ...baseInput(makeFastClient()),
      plannerTimeoutMs: 30000,
      plannerTimeoutSource: 'env_var',
    };
    const result = await runProseSynthesis(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.block.planner_timeout_ms).toBe(30000);
    expect(result.block.planner_timeout_overridden_by).toBe('env_var');
  });
});

// ── R-018.4 — precedence (covered by resolvePlannerTimeout tests above) ──────
// resolvePlannerTimeout is the precedence source-of-truth and is fully tested
// above; this block is left intentionally documentary.

// ── R-018.8 — v0.4 replay condition (load-bearing) ───────────────────────────

describe('R-018.8 — v0.4 replay (synthetic ~15010ms callTool)', () => {
  // Slow client mirrors the v0.4 prose-generation shape — each MCP call
  // takes ~120ms (a small surrogate for ~15010ms; we test the wrapper
  // mechanism, not the actual production budget). With default budget set
  // to 80ms (synthetic stand-in for 15000ms), the wrapper fires. With
  // override at 250ms (stand-in for 30000ms), the wrapper does NOT fire.
  it('default ~80ms budget triggers TIER_TIMEOUT on ~120ms callTool', async () => {
    const slow = makeDelayedClient(120);
    const input: ProseRunInput = {
      ...baseInput(slow),
      plannerTimeoutMs: 80,
      plannerTimeoutSource: 'default',
    };
    const result = await runProseSynthesis(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/TIER_TIMEOUT|timeout|planner failed/i);
  });

  it('30000ms-stand-in budget (250ms) allows ~120ms callTool to complete', async () => {
    const slow = makeDelayedClient(120);
    const input: ProseRunInput = {
      ...baseInput(slow),
      plannerTimeoutMs: 250,
      plannerTimeoutSource: 'cli_flag',
    };
    const result = await runProseSynthesis(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.block.planner_timeout_ms).toBe(250);
    expect(result.block.planner_timeout_overridden_by).toBe('cli_flag');
  });
});

// ── R-018.9 — R-010 TIER_TIMEOUT visibility unchanged on default path ────────

describe('R-018.9 — R-010 TIER_TIMEOUT visibility on default path', () => {
  it('R-018 wrapper error matches R-010 fallback-cause regex shape (elapsed + budget)', async () => {
    // R-010's classifyFallbackCause uses regexes /elapsed=(\d+)ms/ and
    // /budget=(\d+)ms/ to extract numbers. If R-018's wrapper emits a
    // different error shape, R-010's visibility silently breaks on
    // default-path runs that hit the wrapper. The R-010 module itself is
    // NOT modified by R-018 — this test only asserts schema-compat of the
    // R-018 wrapper's error message with R-010's regexes.
    const slow = makeDelayedClient(50);
    const wrapped = wrapClientWithTimeout(slow, 10);
    let msg = '';
    try {
      await wrapped.callTool({ name: 'ollama_extract', arguments: {} });
    } catch (err) {
      msg = (err as Error).message;
    }
    expect(msg).toMatch(/elapsed=(\d+)ms/);
    expect(msg).toMatch(/budget=(\d+)ms/);
    expect(msg).toMatch(/TIER_TIMEOUT/);
  });
});

// ── R-018.6 — active timeout reflected in stderr log line ───────────────────

describe('R-018.6 — formatPlannerTimeoutLogLine (visibility helper)', () => {
  it('default config renders a single-line stderr-grep-friendly summary', () => {
    const line = formatPlannerTimeoutLogLine({ value: 15000, source: 'default' });
    expect(line).toContain('planner_timeout_ms=15000');
    expect(line).toContain('source=default');
    expect(line).not.toContain('\n'); // single line, grep-friendly
  });

  it('cli_flag override renders source=cli_flag', () => {
    const line = formatPlannerTimeoutLogLine({ value: 30000, source: 'cli_flag' });
    expect(line).toContain('planner_timeout_ms=30000');
    expect(line).toContain('source=cli_flag');
  });

  it('env_var override renders source=env_var', () => {
    const line = formatPlannerTimeoutLogLine({ value: 45000, source: 'env_var' });
    expect(line).toContain('planner_timeout_ms=45000');
    expect(line).toContain('source=env_var');
  });
});

// ── R-018.7 — --help documents flag, default, upper bound, env var ──────────

describe('R-018.7 — research-os synth section --help', () => {
  it('dist/cli.js exists (build prerequisite)', () => {
    expect(existsSync(cliPath)).toBe(true);
  });

  it('research-os synth section --help documents --planner-timeout-ms, default, upper bound, env var', () => {
    const { stdout, status } = runCli(['synth', 'section', '--help']);
    expect(status).toBe(0);
    expect(stdout).toContain('--planner-timeout-ms');
    expect(stdout).toContain('15000');
    expect(stdout).toContain('600000');
    expect(stdout).toContain('RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS');
  });

  it('CLI rejects --planner-timeout-ms with a negative value (exit non-zero, names flag + value)', () => {
    const { stderr, status } = runCli(['synth', 'section', 'foo', '--planner-timeout-ms', '-1']);
    expect(status).not.toBe(0);
    expect(stderr).toContain('--planner-timeout-ms');
    expect(stderr).toContain('-1');
  });

  it('CLI rejects --planner-timeout-ms 0 (exit non-zero)', () => {
    const { stderr, status } = runCli(['synth', 'section', 'foo', '--planner-timeout-ms', '0']);
    expect(status).not.toBe(0);
    expect(stderr).toContain('--planner-timeout-ms');
    expect(stderr).toContain('0');
  });

  it('CLI rejects --planner-timeout-ms 700000 (exceeds upper bound)', () => {
    const { stderr, status } = runCli(['synth', 'section', 'foo', '--planner-timeout-ms', '700000']);
    expect(status).not.toBe(0);
    expect(stderr).toContain('--planner-timeout-ms');
    expect(stderr).toContain('700000');
    expect(stderr).toContain('600000');
  });

  it('CLI rejects RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=-1 (exit non-zero, names env + value)', () => {
    const { stderr, status } = runCli(
      ['synth', 'section', 'foo'],
      { RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS: '-1' },
    );
    expect(status).not.toBe(0);
    expect(stderr).toContain('RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS');
    expect(stderr).toContain('-1');
  });

  it('CLI rejects RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=abc (exit non-zero)', () => {
    const { stderr, status } = runCli(
      ['synth', 'section', 'foo'],
      { RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS: 'abc' },
    );
    expect(status).not.toBe(0);
    expect(stderr).toContain('RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS');
    expect(stderr).toContain('abc');
  });
});

// ── R-018.10 — R-014 regenerate-action-graph unchanged ────────────────────────

describe('R-018.10 — R-014 regenerate-action-graph unchanged', () => {
  it('the regenerate-history-ledger module exports are unaffected by R-018', async () => {
    // R-018 must NOT touch recover/regeneration-ledger.ts. Smoke-import the
    // module and assert its public symbols still resolve; a regression on the
    // R-014 surface would show as an import-time error here.
    const mod = await import('../src/recover/regeneration-ledger.js');
    expect(typeof mod.computeInputStateHash).toBe('function');
    expect(typeof mod.readRegenerationLedger).toBe('function');
    expect(typeof mod.appendRegenerationLedgerRecord).toBe('function');
    expect(typeof mod.archiveExistingRecoveryFiles).toBe('function');
    expect(typeof mod.classifyRegenerationReason).toBe('function');
  });

  it('REGENERATION_REASONS closed enum unchanged at 3 values', async () => {
    const types = await import('../src/recover/types.js');
    expect(Array.isArray(types.REGENERATION_REASONS)).toBe(true);
    expect(types.REGENERATION_REASONS).toEqual([
      'state_changed',
      'missing_input_hash',
      'no_prior_artifact',
    ]);
  });
});

// ── R-018.11 — R-012 / R-013 / R-015 / R-016 / R-017 untouched ───────────────

describe('R-018.11 — v0.12 coverage-recovery surfaces untouched', () => {
  it('R-012 rescue critic module still resolves with expected exports', async () => {
    const mod = await import('../src/claims/critic/rescue-critic.js');
    expect(typeof mod.runRescueCritic).toBe('function');
  });

  it('R-013 source-card rebuild ledger module still resolves with expected exports', async () => {
    const mod = await import('../src/sources/rebuild-ledger.js');
    expect(typeof mod.appendRebuildLedgerRecord).toBe('function');
    expect(typeof mod.readRebuildLedger).toBe('function');
    expect(typeof mod.rebuildSourceCards).toBe('function');
  });

  it('R-015 extract completion ledger module still resolves with expected exports', async () => {
    const mod = await import('../src/claims/extract-completion-ledger.js');
    expect(typeof mod.appendExtractCompletionRecord).toBe('function');
    expect(typeof mod.readExtractCompletionLedger).toBe('function');
    expect(typeof mod.getCompletedSourceIdsForSection).toBe('function');
  });

  it('R-016 example file ships in the source tree', () => {
    const examplePath = join(process.cwd(), 'examples', 'source-card-override.example.json');
    const raw = readFileSync(examplePath, 'utf8');
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThanOrEqual(2);
  });

  it('R-017 missing-policy-sources module still resolves with expected exports', async () => {
    const mod = await import('../src/audit/missing-policy-sources.js');
    expect(Array.isArray(mod.POLICY_KEYWORDS)).toBe(true);
    expect(Array.isArray(mod.POLICY_RELEVANT_SOURCE_TYPES)).toBe(true);
  });
});
