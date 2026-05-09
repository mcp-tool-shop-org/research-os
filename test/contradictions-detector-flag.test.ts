/**
 * Tests for the --detector flag on `contradict map`.
 * Covers: heuristic, ollama-intern (available + unavailable), auto (llm + fallback),
 * invalid value, and the high-overlap regression fixture (XRPL/ComfyUI narrow-topic pattern).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { map } from '../src/contradictions/index.js';
import { ContradictionSchema } from '../src/contradictions/schema.js';

let workDir: string;
let packPath: string;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function makePackWithClaims(claims: object[]) {
  const result = await init({
    topic: 'detector flag test pack',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({ id: '01-landscape', purpose: 'Probe detector flag', packPath });
  const claimsPath = join(packPath, 'sections', '01-landscape', 'claims.jsonl');
  for (const c of claims) {
    await appendFile(claimsPath, JSON.stringify(c) + '\n', 'utf8');
  }
}

function claim(id: string, asserts: string, scope: string | null = null) {
  const sourceHash = createHash('sha256').update(id).digest('hex');
  return {
    claim_id: id,
    section_id: '01-landscape',
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
    created_at: '2026-05-09T10:00:00.000Z',
    review_state: 'candidate',
  };
}

// Conflicting pair: high Jaccard, negation mismatch, same scope — heuristic finds direct_conflict
const CONFLICTING_CLAIMS = [
  claim(
    'clm_aaaaaaaaaaaa_heuristic_1',
    'WAL provides high concurrency for SQLite readers and writers',
    'SQLite WAL mode',
  ),
  claim(
    'clm_bbbbbbbbbbbb_heuristic_1',
    'WAL does not provide high concurrency for SQLite readers and writers',
    'SQLite WAL mode',
  ),
];

// ---------------------------------------------------------------------------
// Ollama fetch mocks
// ---------------------------------------------------------------------------

const TEST_HOST = 'http://test-ollama:11434';
const TEST_MODEL = 'test-model:7b';

function makeTagsResponse(models: string[]): Response {
  return new Response(
    JSON.stringify({ models: models.map((name) => ({ name })) }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function makeUnavailableFetch(): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ models: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

function makeLlmFetch(contradictResponse?: object): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/tags')) return makeTagsResponse([TEST_MODEL]);
    if (url.endsWith('/api/chat')) {
      const body = contradictResponse ?? { type: 'none' };
      return new Response(
        JSON.stringify({ message: { content: JSON.stringify(body) } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-det-flag-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. --detector heuristic
// ---------------------------------------------------------------------------

describe('--detector heuristic', () => {
  it('runs heuristic path without touching Ollama', async () => {
    // Arrange: use a fetchImpl that throws if ever called, proving no Ollama contact
    const assertNoOllamaFetch: typeof fetch = (async () => {
      throw new Error('Ollama fetch must not be called in heuristic mode');
    }) as unknown as typeof fetch;

    await makePackWithClaims(CONFLICTING_CLAIMS);
    const summary = await map({
      sectionId: '01-landscape',
      packPath,
      detectorMode: 'heuristic',
      ollamaConfig: { host: TEST_HOST, fetchImpl: assertNoOllamaFetch },
    });

    expect(summary.detector).toBe('heuristic');
    expect(summary.detectorAnnouncement).toBe('contradict map: using heuristic detector');
    expect(summary.contradictionsAdded).toBe(1);
  });

  it('writes a valid contradictions.jsonl ledger', async () => {
    await makePackWithClaims(CONFLICTING_CLAIMS);
    await map({ sectionId: '01-landscape', packPath, detectorMode: 'heuristic' });

    const raw = await readFile(
      join(packPath, 'sections', '01-landscape', 'contradictions.jsonl'),
      'utf8',
    );
    const lines = raw.trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(() => ContradictionSchema.parse(JSON.parse(lines[0]!))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. --detector ollama-intern (model available)
// ---------------------------------------------------------------------------

describe('--detector ollama-intern (model available)', () => {
  it('uses the LLM path and writes the correct announcement', async () => {
    await makePackWithClaims(CONFLICTING_CLAIMS);

    const summary = await map({
      sectionId: '01-landscape',
      packPath,
      detectorMode: 'ollama-intern',
      ollamaConfig: {
        host: TEST_HOST,
        model: TEST_MODEL,
        fetchImpl: makeLlmFetch({
          type: 'direct_conflict',
          summary: 'One claim negates the other',
          scope_analysis: 'Both scoped to SQLite WAL mode',
          overlap_assessment: 'fully_overlapping',
          severity: 'medium',
          confidence: 'medium',
          evidence: 'negation mismatch on "provides"',
        }),
      },
    });

    expect(summary.detector).toBe('ollama-intern');
    expect(summary.detectorAnnouncement).toBe(
      `contradict map: using ollama-intern detector with model ${TEST_MODEL}`,
    );
  });

  it('writes a valid contradictions.jsonl when LLM returns a contradiction', async () => {
    await makePackWithClaims(CONFLICTING_CLAIMS);

    await map({
      sectionId: '01-landscape',
      packPath,
      detectorMode: 'ollama-intern',
      ollamaConfig: {
        host: TEST_HOST,
        model: TEST_MODEL,
        fetchImpl: makeLlmFetch({
          type: 'direct_conflict',
          summary: 'Negation mismatch',
          scope_analysis: 'Fully overlapping',
          overlap_assessment: 'fully_overlapping',
          severity: 'high',
          confidence: 'high',
          evidence: 'claims share core tokens with negation',
        }),
      },
    });

    const raw = await readFile(
      join(packPath, 'sections', '01-landscape', 'contradictions.jsonl'),
      'utf8',
    );
    const lines = raw.trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const cnt = ContradictionSchema.parse(JSON.parse(lines[0]!));
    expect(cnt.detector).toBe('ollama-intern');
  });
});

// ---------------------------------------------------------------------------
// 3. --detector ollama-intern (model unavailable)
// ---------------------------------------------------------------------------

describe('--detector ollama-intern (model unavailable)', () => {
  it('throws a visible error without falling back to heuristic', async () => {
    await makePackWithClaims(CONFLICTING_CLAIMS);

    await expect(
      map({
        sectionId: '01-landscape',
        packPath,
        detectorMode: 'ollama-intern',
        ollamaConfig: {
          host: TEST_HOST,
          model: TEST_MODEL,
          fetchImpl: makeUnavailableFetch(),
        },
      }),
    ).rejects.toThrow(
      `ollama-intern detector requested but model ${TEST_MODEL} is unavailable; aborting (use --detector heuristic to bypass)`,
    );
  });

  it('does not write contradictions.jsonl when model is unavailable', async () => {
    await makePackWithClaims(CONFLICTING_CLAIMS);

    await map({
      sectionId: '01-landscape',
      packPath,
      detectorMode: 'ollama-intern',
      ollamaConfig: { host: TEST_HOST, model: TEST_MODEL, fetchImpl: makeUnavailableFetch() },
    }).catch(() => {/* expected */});

    const exists = await readFile(
      join(packPath, 'sections', '01-landscape', 'contradictions.jsonl'),
      'utf8',
    ).catch(() => null);
    expect(exists).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. --detector auto (LLM path taken)
// ---------------------------------------------------------------------------

describe('--detector auto (LLM available)', () => {
  it('selects ollama-intern and emits the LLM announcement', async () => {
    await makePackWithClaims(CONFLICTING_CLAIMS);

    const summary = await map({
      sectionId: '01-landscape',
      packPath,
      detectorMode: 'auto',
      ollamaConfig: {
        host: TEST_HOST,
        model: TEST_MODEL,
        fetchImpl: makeLlmFetch(),
      },
    });

    expect(summary.detector).toBe('ollama-intern');
    expect(summary.detectorAnnouncement).toContain(
      'contradict map: using ollama-intern detector with model',
    );
  });

  it('preserves v0.2.0 behavior: default (no detectorMode) also uses auto path', async () => {
    await makePackWithClaims(CONFLICTING_CLAIMS);

    // Without detectorMode, existing detectors override mimics "auto with heuristic"
    const { HeuristicContradictionDetector } = await import(
      '../src/contradictions/detectors/heuristic.js'
    );
    const summary = await map({
      sectionId: '01-landscape',
      packPath,
      detectors: [new HeuristicContradictionDetector()],
    });

    expect(summary.detector).toBe('heuristic');
    expect(summary.contradictionsAdded).toBe(1);
    expect(summary.detectorAnnouncement).toBe(
      'contradict map: ollama-intern unavailable; using heuristic detector',
    );
  });
});

// ---------------------------------------------------------------------------
// 5. --detector auto (heuristic fallback)
// ---------------------------------------------------------------------------

describe('--detector auto (LLM unavailable, heuristic fallback)', () => {
  it('falls back to heuristic and emits the fallback announcement', async () => {
    await makePackWithClaims(CONFLICTING_CLAIMS);

    // Fake ollama-intern detector that is always unavailable
    const unavailableMock = {
      name: 'ollama-intern' as const,
      async available() { return false; },
      async detect() { throw new Error('should not be called'); },
    };
    const { HeuristicContradictionDetector } = await import(
      '../src/contradictions/detectors/heuristic.js'
    );

    const summary = await map({
      sectionId: '01-landscape',
      packPath,
      detectorMode: 'auto',
      detectors: [unavailableMock, new HeuristicContradictionDetector()],
    });

    expect(summary.detector).toBe('heuristic');
    expect(summary.detectorAnnouncement).toBe(
      'contradict map: ollama-intern unavailable; using heuristic detector',
    );
    expect(summary.contradictionsAdded).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Invalid --detector value
// ---------------------------------------------------------------------------

describe('invalid --detector value', () => {
  it('throws with a clear error naming the invalid value', async () => {
    await makePackWithClaims(CONFLICTING_CLAIMS);

    await expect(
      map({
        sectionId: '01-landscape',
        packPath,
        // Type-cast to simulate a CLI validation bypass or runtime bad value
        detectorMode: 'banana' as 'auto',
      }),
    ).rejects.toThrow('invalid --detector value "banana"');
  });

  it('error message lists valid options', async () => {
    await makePackWithClaims(CONFLICTING_CLAIMS);

    let errorMessage = '';
    await map({
      sectionId: '01-landscape',
      packPath,
      detectorMode: 'banana' as 'auto',
    }).catch((e: Error) => { errorMessage = e.message; });

    expect(errorMessage).toContain('auto');
    expect(errorMessage).toContain('heuristic');
    expect(errorMessage).toContain('ollama-intern');
  });
});

// ---------------------------------------------------------------------------
// 7. High-overlap regression fixture (XRPL/ComfyUI narrow-topic pattern)
// ---------------------------------------------------------------------------

describe('high-overlap regression fixture', () => {
  it('completes via heuristic in under 30s on 60 claims with high vocabulary overlap', async () => {
    // Simulate the XRPL Section 01 pattern: ~60 claims all sharing tokens
    // like "token", "xrpl", "trustline", "issuer", "ledger" — same vocabulary
    // that caused Jaccard prefilter saturation on the LLM detector.
    const xrplClaims = Array.from({ length: 60 }, (_, i) => {
      const variant = i % 4;
      const asserts = [
        `XRPL trustline token issuance requires issuer account on ledger (variant ${i})`,
        `token holder must extend trustline to issuer on XRPL ledger (variant ${i})`,
        `issuer can freeze token trustline on XRPL via ledger flag (variant ${i})`,
        `XRPL token transfer requires active trustline between holder and issuer (variant ${i})`,
      ][variant]!;
      return claim(`clm_${'a'.repeat(10)}${i.toString().padStart(2, '0')}_heuristic_1`, asserts, 'XRPL token mechanics');
    });

    await makePackWithClaims(xrplClaims);

    const start = Date.now();
    const summary = await map({
      sectionId: '01-landscape',
      packPath,
      detectorMode: 'heuristic',
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(30_000);
    expect(summary.detector).toBe('heuristic');
    expect(summary.candidateClaims).toBe(60);
    expect(summary.detectorAnnouncement).toBe('contradict map: using heuristic detector');

    // Ledger is valid regardless of contradiction count (0 is fine for complementary claims)
    const raw = await readFile(
      join(packPath, 'sections', '01-landscape', 'contradictions.jsonl'),
      'utf8',
    ).catch(() => '');
    for (const line of raw.split('\n').filter(Boolean)) {
      expect(() => ContradictionSchema.parse(JSON.parse(line))).not.toThrow();
    }
  });
});
