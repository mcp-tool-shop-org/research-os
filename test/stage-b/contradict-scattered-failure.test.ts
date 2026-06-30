// B-CNT-002 (Stage B verifier follow-up) — scattered per-pair LLM failures.
//
// The auto-mode contradiction detector resets its consecutive-failure counter on
// every success, so a scattered/alternating failure pattern (fail-ok-fail-ok)
// never reaches fallThroughAfterN and so never triggered fall-through. Before the
// fix those failed pairs were dropped silently: not in unprocessedPairs, not
// heuristic-backfilled, classified by NEITHER detector, with zero durable signal.
//
// FIX: the detector threads a total `pairsFailed` count onto the ok:true result;
// map.ts runs the SAME full-space heuristic backfill it uses on fall-through
// whenever pairsFailed>0, surfaces summary.autoModePairsFailed, and emits a
// forced (un-gated) stderr line.
//
// Both halves:
//   - BAD : a scattered-failure run (no fall-through) now reports
//     summary.autoModePairsFailed>0 and emits the forced warning (was silent).
//   - GOOD: a fully-clean run leaves autoModePairsFailed AND autoModeFallThrough
//     undefined (byte-identical happy path).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { map } from '../../src/contradictions/index.js';

const TEST_HOST = 'http://test-ollama:11434';
const TEST_MODEL = 'hermes3:8b';

let workDir: string;
let packPath: string;

function makeClaim(id: string, asserts: string): object {
  return {
    claim_id: id,
    section_id: '01-test',
    source_ids: [`src_${id.slice(4, 16)}`],
    source_hashes: [createHash('sha256').update(id).digest('hex')],
    asserts,
    scope: 'test scope',
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

// 6 claims sharing tokens so the prefilter yields many pairs (≈ C(6,2)=15).
const SHARED = 'shared probe token overlap baseline anchor';
const SIX_CLAIMS = [
  makeClaim('clm_aaaaaaaaaaa0_heuristic_1', `Approach A applies ${SHARED} aggressively`),
  makeClaim('clm_aaaaaaaaaaa1_heuristic_1', `Approach B applies ${SHARED} cautiously`),
  makeClaim('clm_aaaaaaaaaaa2_heuristic_1', `Approach C rejects ${SHARED} under load`),
  makeClaim('clm_aaaaaaaaaaa3_heuristic_1', `Approach D accepts ${SHARED} under load`),
  makeClaim('clm_aaaaaaaaaaa4_heuristic_1', `Approach E modifies ${SHARED} iteratively`),
  makeClaim('clm_aaaaaaaaaaa5_heuristic_1', `Approach F preserves ${SHARED} iteratively`),
];

async function makePack(claims: object[]): Promise<void> {
  const r = await init({ topic: 'B-CNT-002 scattered-failure test', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: '01-test', purpose: 'probe', packPath });
  const claimsPath = join(packPath, 'sections', '01-test', 'claims.jsonl');
  for (const c of claims) await appendFile(claimsPath, JSON.stringify(c) + '\n', 'utf8');
}

function tagsResponse(): Response {
  return new Response(JSON.stringify({ models: [{ name: TEST_MODEL }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
function noneResponse(): Response {
  return new Response(JSON.stringify({ message: { content: JSON.stringify({ type: 'none' }) } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

// Alternating fetch: odd chat calls fail (HTTP 500 -> http_error), even succeed
// ('none'). Failures never land 5-consecutive, so fall-through never triggers.
function makeAlternatingFailFetch(): typeof fetch {
  let chat = 0;
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/tags')) return tagsResponse();
    if (url.endsWith('/api/chat')) {
      chat += 1;
      return chat % 2 === 1 ? new Response('upstream boom', { status: 500 }) : noneResponse();
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
}
function makeAllNoneFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/tags')) return tagsResponse();
    if (url.endsWith('/api/chat')) return noneResponse();
    throw new Error(`Unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-cnt002-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('B-CNT-002 — scattered auto-mode failures are surfaced, not silently dropped', () => {
  it('BAD: scattered per-pair failures (no fall-through) report autoModePairsFailed + forced warning', async () => {
    await makePack(SIX_CLAIMS);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const summary = await map({
        sectionId: '01-test',
        packPath,
        detectorMode: 'auto',
        ollamaConfig: { host: TEST_HOST, model: TEST_MODEL, fetchImpl: makeAlternatingFailFetch() },
      });
      // No fall-through (failures never 5-consecutive)...
      expect(summary.autoModeFallThrough).toBeUndefined();
      // ...but the scattered failures are now durably surfaced.
      expect(summary.autoModePairsFailed).toBeGreaterThan(0);
      const stderrText = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderrText).toContain('failed LLM classification');
    } finally {
      stderrSpy.mockRestore();
      stdoutSpy.mockRestore();
    }
  });

  it('GOOD: a fully-clean auto-mode run leaves autoModePairsFailed + autoModeFallThrough undefined', async () => {
    await makePack(SIX_CLAIMS);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const summary = await map({
        sectionId: '01-test',
        packPath,
        detectorMode: 'auto',
        ollamaConfig: { host: TEST_HOST, model: TEST_MODEL, fetchImpl: makeAllNoneFetch() },
      });
      expect(summary.autoModeFallThrough).toBeUndefined();
      expect(summary.autoModePairsFailed).toBeUndefined();
    } finally {
      stderrSpy.mockRestore();
      stdoutSpy.mockRestore();
    }
  });
});
