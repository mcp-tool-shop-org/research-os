// R-021 — synthetic acceptance tests for contradict-map auto-mode hang-timeout,
// fall-through, and progress visibility (Direction E).
//
// Pairs with test/r021-live-replay.test.ts. These tests use mocked fetch
// implementations to validate the data-flow plumbing without requiring a live
// Ollama server. The live-replay test exercises the same surfaces against a
// real Ollama under artificially-low timeout (the MECHANISM test).
//
// Per the synthetic-vs-live doctrine: synthetic tests validate the wrapper /
// surface / data flow but cannot validate whether the patch's effective
// behavior reaches the actual mechanism. Both layers are required.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { map } from '../src/contradictions/index.js';
import { OllamaInternContradictionDetector } from '../src/contradictions/detectors/ollama-intern.js';
import {
  DEFAULT_AUTO_MODE_PAIR_TIMEOUT_MS,
  DEFAULT_AUTO_MODE_FALL_THROUGH_AFTER_N,
} from '../src/contradictions/types.js';
import type { Claim } from '../src/claims/schema.js';

let workDir: string;
let packPath: string;

const TEST_HOST = 'http://test-ollama:11434';
const TEST_MODEL = 'hermes3:8b';

// ── Fixture helpers ─────────────────────────────────────────────────────────

function makeClaim(id: string, asserts: string, scope: string | null = 'test scope'): object {
  const sourceHash = createHash('sha256').update(id).digest('hex');
  return {
    claim_id: id,
    section_id: '01-test',
    source_ids: [`src_${id.slice(4, 16)}`],
    source_hashes: [sourceHash],
    asserts,
    scope,
    not: null,
    evidence_excerpt: asserts,
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-05-17T00:00:00.000Z',
    review_state: 'candidate',
  };
}

async function makePackWithClaims(claims: object[]): Promise<void> {
  const result = await init({ topic: 'R-021 auto-mode test', outDir: workDir });
  packPath = result.packPath;
  await sectionAdd({ id: '01-test', purpose: 'R-021 probe', packPath });
  const claimsPath = join(packPath, 'sections', '01-test', 'claims.jsonl');
  for (const c of claims) {
    await appendFile(claimsPath, JSON.stringify(c) + '\n', 'utf8');
  }
}

// 6 claims with shared tokens so prefilter yields all C(6,2)=15 pairs.
const SHARED = 'shared probe token overlap baseline anchor';
const SIX_CLAIMS = [
  makeClaim('clm_aaaaaaaaaaa0_heuristic_1', `Approach A applies ${SHARED} aggressively`),
  makeClaim('clm_aaaaaaaaaaa1_heuristic_1', `Approach B applies ${SHARED} cautiously`),
  makeClaim('clm_aaaaaaaaaaa2_heuristic_1', `Approach C rejects ${SHARED} under load`),
  makeClaim('clm_aaaaaaaaaaa3_heuristic_1', `Approach D accepts ${SHARED} under load`),
  makeClaim('clm_aaaaaaaaaaa4_heuristic_1', `Approach E modifies ${SHARED} iteratively`),
  makeClaim('clm_aaaaaaaaaaa5_heuristic_1', `Approach F preserves ${SHARED} iteratively`),
];

// 2 claims with the same shape as the SQLite WAL contradiction fixture.
const CONFLICTING_PAIR = [
  makeClaim(
    'clm_aaaaaaaaaaaa_heuristic_1',
    'WAL provides high concurrency for SQLite readers and writers',
    'SQLite WAL mode',
  ),
  makeClaim(
    'clm_bbbbbbbbbbbb_heuristic_1',
    'WAL does not provide high concurrency for SQLite readers and writers',
    'SQLite WAL mode',
  ),
];

// ── Fetch mock factories ────────────────────────────────────────────────────

function tagsResponse(): Response {
  return new Response(
    JSON.stringify({ models: [{ name: TEST_MODEL }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function chatResponse(body: object): Response {
  return new Response(
    JSON.stringify({ message: { content: JSON.stringify(body) } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

// Fetch that always times out via AbortController. Resolves a never-settling
// Promise that respects the abort signal — once aborted, rejects with
// AbortError. This is the canonical "Ollama wedged" simulation for unit tests.
function makeAlwaysTimingOutFetch(): typeof fetch {
  return ((async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/tags')) return tagsResponse();
    if (url.endsWith('/api/chat')) {
      // Hold open until the signal aborts.
      return new Promise<Response>((_resolve, reject) => {
        const sig = init?.signal as AbortSignal | undefined;
        if (sig) {
          if (sig.aborted) {
            reject(new DOMException('aborted', 'AbortError'));
            return;
          }
          sig.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }
        // No fallback timeout — rely on AbortSignal.
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as unknown) as typeof fetch;
}

// Fetch that returns "type: none" (LLM successfully classified no contradiction).
function makeAlwaysNoneFetch(): typeof fetch {
  return ((async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/tags')) return tagsResponse();
    if (url.endsWith('/api/chat')) return chatResponse({ type: 'none' });
    throw new Error(`Unexpected fetch: ${url}`);
  }) as unknown) as typeof fetch;
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-r021-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

// ── R-021.SYN.1 — defaults ───────────────────────────────────────────────────

describe('R-021.SYN.1 — defaults', () => {
  it('DEFAULT_AUTO_MODE_PAIR_TIMEOUT_MS is 90000 (lowered from prior 120000)', () => {
    expect(DEFAULT_AUTO_MODE_PAIR_TIMEOUT_MS).toBe(90_000);
  });

  it('DEFAULT_AUTO_MODE_FALL_THROUGH_AFTER_N is 5 (user-locked Phase B)', () => {
    expect(DEFAULT_AUTO_MODE_FALL_THROUGH_AFTER_N).toBe(5);
  });

  it('OllamaInternContradictionDetector picks up the 90s default when no config passed', () => {
    const d = new OllamaInternContradictionDetector({ host: TEST_HOST, model: TEST_MODEL });
    // Internal field is exposed for assertion via a public accessor.
    expect(d.timeoutMs).toBe(DEFAULT_AUTO_MODE_PAIR_TIMEOUT_MS);
    expect(d.fallThroughAfterN).toBe(DEFAULT_AUTO_MODE_FALL_THROUGH_AFTER_N);
  });
});

// ── R-021.SYN.2 — option flow through detector ──────────────────────────────

describe('R-021.SYN.2 — explicit options reach the detector', () => {
  it('autoModePairTimeoutMs option overrides default', async () => {
    await makePackWithClaims(CONFLICTING_PAIR);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await map({
        sectionId: '01-test',
        packPath,
        detectorMode: 'auto',
        autoModePairTimeoutMs: 1234,
        ollamaConfig: {
          host: TEST_HOST,
          model: TEST_MODEL,
          fetchImpl: makeAlwaysNoneFetch(),
        },
      });
      const stdoutText = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stdoutText).toContain('per-pair timeout=1234ms');
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('autoModeFallThroughAfterNTimeouts option overrides default', async () => {
    await makePackWithClaims(CONFLICTING_PAIR);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await map({
        sectionId: '01-test',
        packPath,
        detectorMode: 'auto',
        autoModeFallThroughAfterNTimeouts: 7,
        ollamaConfig: {
          host: TEST_HOST,
          model: TEST_MODEL,
          fetchImpl: makeAlwaysNoneFetch(),
        },
      });
      const stdoutText = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stdoutText).toContain('fall-through-after=7');
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});

// ── R-021.SYN.3 — stdout start line ─────────────────────────────────────────

describe('R-021.SYN.3 — stdout start line', () => {
  it('emits "auto-mode engaged: N candidate pairs; per-pair timeout=Xms; fall-through-after=Y" on stdout', async () => {
    await makePackWithClaims(SIX_CLAIMS);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await map({
        sectionId: '01-test',
        packPath,
        detectorMode: 'auto',
        ollamaConfig: {
          host: TEST_HOST,
          model: TEST_MODEL,
          fetchImpl: makeAlwaysNoneFetch(),
        },
      });
      const stdoutText = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      // 15 pairs on 6 fully-overlapping claims (Jaccard prefilter is all-pass
      // because SHARED dominates token sets); per-pair=90000; fall-through=5.
      expect(stdoutText).toContain('auto-mode engaged:');
      expect(stdoutText).toContain('candidate pairs');
      expect(stdoutText).toMatch(/per-pair timeout=\d+ms/);
      expect(stdoutText).toMatch(/fall-through-after=\d+/);
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('does NOT emit the auto-mode start line when --detector heuristic is selected', async () => {
    await makePackWithClaims(CONFLICTING_PAIR);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await map({
        sectionId: '01-test',
        packPath,
        detectorMode: 'heuristic',
      });
      const stdoutText = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stdoutText).not.toContain('auto-mode engaged');
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});

// ── R-021.SYN.4 — fall-through fires after N consecutive timeouts ───────────

describe('R-021.SYN.4 — fall-through fires after N consecutive timeouts', () => {
  it('after 3 consecutive timeouts the detector falls through to heuristic', async () => {
    await makePackWithClaims(SIX_CLAIMS);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const summary = await map({
        sectionId: '01-test',
        packPath,
        detectorMode: 'auto',
        autoModePairTimeoutMs: 50,
        autoModeFallThroughAfterNTimeouts: 3,
        ollamaConfig: {
          host: TEST_HOST,
          model: TEST_MODEL,
          fetchImpl: makeAlwaysTimingOutFetch(),
        },
      });
      expect(summary.autoModeFallThrough).toBeDefined();
      expect(summary.autoModeFallThrough?.consecutiveTimeouts).toBe(3);
      expect(summary.autoModeFallThrough?.perPairTimeoutMs).toBe(50);
      expect(summary.autoModeFallThrough?.triggeredAtPairIndex).toBe(3);
      // Heuristic completed the remaining pairs.
      expect(summary.autoModeFallThrough?.remainingPairsHandledBy).toBe('heuristic');
      // stderr surfaced the fall-through line.
      const stderrText = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderrText).toMatch(/auto-mode fall-through: 3 consecutive timeouts/);
      expect(stderrText).toContain('switching to heuristic');
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('successful classifications (type: none) reset the consecutive-timeout counter', async () => {
    await makePackWithClaims(SIX_CLAIMS);
    let callCount = 0;
    // Pattern: timeout, timeout, none, timeout, timeout, none, ...
    // With threshold=3, fall-through should NOT fire because the counter
    // resets after each 'none'.
    const mixedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/tags')) return tagsResponse();
      if (url.endsWith('/api/chat')) {
        callCount++;
        if (callCount % 3 === 0) {
          return chatResponse({ type: 'none' });
        }
        return new Promise<Response>((_resolve, reject) => {
          const sig = init?.signal as AbortSignal | undefined;
          if (sig) {
            sig.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }
        });
      }
      throw new Error(`Unexpected: ${url}`);
    }) as unknown as typeof fetch;

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const summary = await map({
        sectionId: '01-test',
        packPath,
        detectorMode: 'auto',
        autoModePairTimeoutMs: 50,
        autoModeFallThroughAfterNTimeouts: 3,
        ollamaConfig: {
          host: TEST_HOST,
          model: TEST_MODEL,
          fetchImpl: mixedFetch,
        },
      });
      // Fall-through must NOT have fired (the every-3rd 'none' breaks the
      // consecutive run before it hits 3 in a row).
      expect(summary.autoModeFallThrough).toBeUndefined();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});

// ── R-021.SYN.5 — markdown render of fall-through block ─────────────────────

describe('R-021.SYN.5 — markdown render of fall-through block', () => {
  it('contradictions.md contains "## Auto-mode fall-through" block with reason, budget, counts', async () => {
    await makePackWithClaims(SIX_CLAIMS);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await map({
        sectionId: '01-test',
        packPath,
        detectorMode: 'auto',
        autoModePairTimeoutMs: 50,
        autoModeFallThroughAfterNTimeouts: 2,
        ollamaConfig: {
          host: TEST_HOST,
          model: TEST_MODEL,
          fetchImpl: makeAlwaysTimingOutFetch(),
        },
      });
      const md = await readFile(
        join(packPath, 'sections', '01-test', 'contradictions.md'),
        'utf8',
      );
      expect(md).toContain('## Auto-mode fall-through');
      expect(md).toContain('consecutive timeouts');
      expect(md).toContain('per-pair timeout');
      expect(md).toContain('50'); // perPairTimeoutMs
      expect(md).toContain('2');  // consecutiveTimeouts threshold
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('contradictions.md does NOT contain the fall-through block when fall-through did not fire', async () => {
    await makePackWithClaims(CONFLICTING_PAIR);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await map({
        sectionId: '01-test',
        packPath,
        detectorMode: 'auto',
        ollamaConfig: {
          host: TEST_HOST,
          model: TEST_MODEL,
          fetchImpl: makeAlwaysNoneFetch(),
        },
      });
      const md = await readFile(
        join(packPath, 'sections', '01-test', 'contradictions.md'),
        'utf8',
      );
      expect(md).not.toContain('## Auto-mode fall-through');
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});

// ── R-021.SYN.6 — defense floor preservation ────────────────────────────────

describe('R-021.SYN.6 — defense floor preservation', () => {
  it('heuristic-only path (detector=heuristic) unchanged — no auto-mode artifacts', async () => {
    await makePackWithClaims(CONFLICTING_PAIR);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const summary = await map({
        sectionId: '01-test',
        packPath,
        detectorMode: 'heuristic',
      });
      expect(summary.detector).toBe('heuristic');
      expect(summary.autoModeFallThrough).toBeUndefined();
      const md = await readFile(
        join(packPath, 'sections', '01-test', 'contradictions.md'),
        'utf8',
      );
      expect(md).not.toContain('auto-mode engaged');
      expect(md).not.toContain('Auto-mode fall-through');
      const stderrText = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderrText).not.toContain('auto-mode pair');
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('R-019 surface (synth tier_budget_ms_override) — import-smoke test still passes', async () => {
    // R-019's surface lives in src/synth/prose/planner.ts (et al). R-021
    // touches none of those. Smoke-import to confirm the module graph is
    // intact and the load-bearing symbol is exported.
    const { buildPlannerToolArgs } = await import('../src/synth/prose/planner.js');
    expect(typeof buildPlannerToolArgs).toBe('function');
  });

  it('R-020 surface (no_answer_cluster recovery_actions) — import-smoke test still passes', async () => {
    const { getNoAnswerClusterRecoveryActions } = await import('../src/recover/action-graph.js');
    expect(typeof getNoAnswerClusterRecoveryActions).toBe('function');
  });

  it('R-018 surface (wrapClientWithTimeout) — import-smoke test still passes', async () => {
    const { wrapClientWithTimeout, DEFAULT_PLANNER_TIMEOUT_MS } = await import(
      '../src/synth/prose/types.js'
    );
    expect(typeof wrapClientWithTimeout).toBe('function');
    expect(DEFAULT_PLANNER_TIMEOUT_MS).toBe(15000);
  });
});

// ── R-021.SYN.7 — summary shape ─────────────────────────────────────────────

describe('R-021.SYN.7 — MapSummary autoModeFallThrough shape', () => {
  it('summary records perPairTimeoutMs and consecutiveTimeouts on fall-through fire', async () => {
    await makePackWithClaims(SIX_CLAIMS);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const summary = await map({
        sectionId: '01-test',
        packPath,
        detectorMode: 'auto',
        autoModePairTimeoutMs: 75,
        autoModeFallThroughAfterNTimeouts: 4,
        ollamaConfig: {
          host: TEST_HOST,
          model: TEST_MODEL,
          fetchImpl: makeAlwaysTimingOutFetch(),
        },
      });
      expect(summary.autoModeFallThrough).toMatchObject({
        triggeredAtPairIndex: 4,
        consecutiveTimeouts: 4,
        perPairTimeoutMs: 75,
        remainingPairsHandledBy: 'heuristic',
      });
      expect(summary.autoModeFallThrough?.autoClassifiedPairs).toBeGreaterThanOrEqual(0);
      expect(summary.autoModeFallThrough?.heuristicClassifiedPairs).toBeGreaterThanOrEqual(0);
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});
