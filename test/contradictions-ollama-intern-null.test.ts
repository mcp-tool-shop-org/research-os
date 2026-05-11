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
    evidence_excerpt_ids: [],
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

// B-001 regression: JSON.parse('null') yields null, and the prior code then
// dereferenced parsed.type → TypeError outside the try/catch. The fix must
// treat any non-object JSON value as a soft failure (returns null draft).
describe('OllamaInternContradictionDetector — null-deref guard (B-001)', () => {
  it('returns no drafts when the model emits literal "null"', async () => {
    const detector = new OllamaInternContradictionDetector({
      host: TEST_HOST,
      model: TEST_MODEL,
      fetchImpl: makeFetch((url) => {
        if (url === `${TEST_HOST}/api/tags`) {
          return new Response(JSON.stringify({ models: [{ name: TEST_MODEL }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url === `${TEST_HOST}/api/chat`) {
          // Note: the OUTER response.json() expects valid JSON; INSIDE the
          // chat response, message.content is the model's raw output string,
          // which is the literal 'null'.
          return new Response(
            JSON.stringify({ message: { content: 'null' } }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return null;
      }),
    });
    const result = await detector.detect([
      makeClaim({ claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1' }),
      makeClaim({ claim_id: 'clm_bbbbbbbbbbbb_ollama_intern_1' }),
    ]);
    if (!result.ok) throw new Error('detector should not surface an error for soft per-pair failure');
    expect(result.drafts).toHaveLength(0);
  });

  it('returns no drafts when the model emits a JSON array (not an object)', async () => {
    const detector = new OllamaInternContradictionDetector({
      host: TEST_HOST,
      model: TEST_MODEL,
      fetchImpl: makeFetch((url) => {
        if (url === `${TEST_HOST}/api/tags`) {
          return new Response(JSON.stringify({ models: [{ name: TEST_MODEL }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url === `${TEST_HOST}/api/chat`) {
          return new Response(
            JSON.stringify({ message: { content: '[]' } }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return null;
      }),
    });
    const result = await detector.detect([
      makeClaim({ claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1' }),
      makeClaim({ claim_id: 'clm_bbbbbbbbbbbb_ollama_intern_1' }),
    ]);
    if (!result.ok) throw new Error('detector should not surface an error for soft per-pair failure');
    expect(result.drafts).toHaveLength(0);
  });
});
