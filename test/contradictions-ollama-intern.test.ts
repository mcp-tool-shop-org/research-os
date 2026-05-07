import { describe, it, expect } from 'vitest';
import { OllamaInternContradictionDetector } from '../src/contradictions/detectors/ollama-intern.js';
import type { Claim } from '../src/claims/schema.js';

const TEST_HOST = 'http://test-ollama:11434';
const TEST_MODEL = 'hermes3:8b';

function makeClaim(overrides: Partial<Claim>): Claim {
  return {
    claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
    section_id: '01-landscape',
    source_ids: ['src_aaaaaaaaaaaa'],
    source_hashes: ['a'.repeat(64)],
    asserts: 'placeholder',
    scope: null,
    not: null,
    evidence_excerpt: 'literal text',
    evidence_location: null,
    confidence: 'medium',
    extractor: 'ollama-intern',
    extraction_method: 'ollama_intern_propositional',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
    ...overrides,
  };
}

function makeFetch(responder: (url: string) => Response | null): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const res = responder(url);
    if (!res) throw new Error(`Unexpected fetch: ${url}`);
    return res;
  }) as unknown as typeof fetch;
}

function makeAvailableFetch(chatResponder: () => Response): typeof fetch {
  return makeFetch((url) => {
    if (url === `${TEST_HOST}/api/tags`) {
      return new Response(JSON.stringify({ models: [{ name: TEST_MODEL }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === `${TEST_HOST}/api/chat`) return chatResponder();
    return null;
  });
}

describe('OllamaInternContradictionDetector.available', () => {
  it('returns true when model is present', async () => {
    const detector = new OllamaInternContradictionDetector({
      host: TEST_HOST,
      model: TEST_MODEL,
      fetchImpl: makeAvailableFetch(
        () => new Response(JSON.stringify({}), { status: 200 }),
      ),
    });
    expect(await detector.available()).toBe(true);
  });

  it('returns false when host is unreachable', async () => {
    const detector = new OllamaInternContradictionDetector({
      host: TEST_HOST,
      model: TEST_MODEL,
      fetchImpl: (async () => {
        throw new Error('connect ECONNREFUSED');
      }) as unknown as typeof fetch,
    });
    expect(await detector.available()).toBe(false);
  });
});

describe('OllamaInternContradictionDetector.detect', () => {
  it('returns no drafts when LLM says type=none', async () => {
    const detector = new OllamaInternContradictionDetector({
      host: TEST_HOST,
      model: TEST_MODEL,
      fetchImpl: makeAvailableFetch(
        () =>
          new Response(JSON.stringify({ message: { content: JSON.stringify({ type: 'none' }) } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    });
    const result = await detector.detect([
      makeClaim({ claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1' }),
      makeClaim({ claim_id: 'clm_bbbbbbbbbbbb_ollama_intern_1' }),
    ]);
    if (!result.ok) throw new Error('failed');
    expect(result.drafts).toHaveLength(0);
  });

  it('classifies overgeneralization_risk and preserves scope_analysis', async () => {
    const detector = new OllamaInternContradictionDetector({
      host: TEST_HOST,
      model: TEST_MODEL,
      fetchImpl: makeAvailableFetch(
        () =>
          new Response(
            JSON.stringify({
              message: {
                content: JSON.stringify({
                  type: 'overgeneralization_risk',
                  summary: 'Claim B widens contextual claim A.',
                  scope_analysis: 'A is scoped to role-os rollout; B asserts universally.',
                  overlap_assessment: 'partially_overlapping',
                  severity: 'high',
                  confidence: 'high',
                  evidence: 'B drops the role-os qualifier present in A.',
                }),
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    });
    const result = await detector.detect([
      makeClaim({ claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1' }),
      makeClaim({ claim_id: 'clm_bbbbbbbbbbbb_ollama_intern_1' }),
    ]);
    if (!result.ok) throw new Error('failed');
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]?.draft.type).toBe('overgeneralization_risk');
    expect(result.drafts[0]?.draft.scope_analysis).toContain('role-os');
    expect(result.method).toBe('ollama_intern_pairwise_classification');
  });

  it('skips a pair when the LLM returns malformed JSON', async () => {
    const detector = new OllamaInternContradictionDetector({
      host: TEST_HOST,
      model: TEST_MODEL,
      fetchImpl: makeAvailableFetch(
        () =>
          new Response(
            JSON.stringify({ message: { content: 'not json' } }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    });
    const result = await detector.detect([
      makeClaim({ claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1' }),
      makeClaim({ claim_id: 'clm_bbbbbbbbbbbb_ollama_intern_1' }),
    ]);
    if (!result.ok) throw new Error('failed');
    expect(result.drafts).toHaveLength(0);
  });
});
