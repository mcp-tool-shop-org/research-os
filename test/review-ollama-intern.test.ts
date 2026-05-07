import { describe, it, expect } from 'vitest';
import { OllamaInternReviewer } from '../src/review/reviewers/ollama-intern.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';
import type { ReviewerInput } from '../src/review/types.js';
import type { Claim } from '../src/claims/schema.js';

const TEST_HOST = 'http://test-ollama:11434';
const TEST_MODEL = 'hermes3:8b';

function makeFetch(responder: (url: string) => Response | null): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const r = responder(url);
    if (!r) throw new Error(`Unexpected fetch: ${url}`);
    return r;
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

function makeReviewer(chatResponder: () => Response): OllamaInternReviewer {
  return new OllamaInternReviewer({
    host: TEST_HOST,
    model: TEST_MODEL,
    fetchImpl: makeAvailableFetch(chatResponder),
  });
}

const research = ResearchYamlSchema.parse({
  research_os_version: '0.1.0',
  created_at: '2026-05-06T22:00:00.000Z',
  topic: 'How does the LLM reviewer behave on synthetic input?',
  sections: [
    {
      id: '01-test',
      purpose: 'p',
      max_time_minutes: 45,
      min_sources: 2,
      primary_sources_required: 1,
      contradictions_required: false,
      status: 'draft',
    },
  ],
});

const claim: Claim = {
  claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
  section_id: '01-test',
  source_ids: ['src_aaaaaaaaaaaa'],
  source_hashes: ['a'.repeat(64)],
  asserts: 'something',
  scope: null,
  not: null,
  evidence_excerpt: 'literal',
  evidence_location: null,
  confidence: 'medium',
  extractor: 'ollama-intern',
  extraction_method: 'ollama_intern_propositional',
  created_at: '2026-05-06T22:00:00.000Z',
  review_state: 'candidate',
};

const baseInput: ReviewerInput = {
  research,
  section: research.sections[0]!,
  candidateClaims: [claim],
  sources: [],
  receipts: [],
  contradictions: [],
  gateResult: null,
  rawTextBySourceId: new Map(),
  briefText: null,
};

describe('OllamaInternReviewer.available', () => {
  it('returns true when model is present', async () => {
    const r = makeReviewer(() => new Response(JSON.stringify({}), { status: 200 }));
    expect(await r.available()).toBe(true);
  });

  it('returns false when host is unreachable', async () => {
    const r = new OllamaInternReviewer({
      host: TEST_HOST,
      model: TEST_MODEL,
      fetchImpl: (async () => {
        throw new Error('connect ECONNREFUSED');
      }) as unknown as typeof fetch,
    });
    expect(await r.available()).toBe(false);
  });
});

describe('OllamaInternReviewer.review', () => {
  it('parses well-formed findings', async () => {
    const payload = {
      message: {
        content: JSON.stringify({
          findings: [
            {
              category: 'overgeneralized_claim',
              severity: 'warn',
              summary: 'Claim widens.',
              evidence: 'asserts is broad.',
              required_action: 'Add scope.',
              claim_ids: ['clm_aaaaaaaaaaaa_ollama_intern_1'],
              source_ids: ['src_aaaaaaaaaaaa'],
              confidence: 'medium',
            },
          ],
        }),
      },
    };
    const r = makeReviewer(() =>
      new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const result = await r.review(baseInput);
    if (!result.ok) throw new Error(`failed: ${result.error}`);
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]?.category).toBe('overgeneralized_claim');
    expect(result.drafts[0]?.claim_ids).toEqual(['clm_aaaaaaaaaaaa_ollama_intern_1']);
  });

  it('returns empty drafts when LLM emits no findings (clean review is valid)', async () => {
    const payload = { message: { content: JSON.stringify({ findings: [] }) } };
    const r = makeReviewer(() =>
      new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const result = await r.review(baseInput);
    if (!result.ok) throw new Error('failed');
    expect(result.drafts).toEqual([]);
  });

  it('skips findings with categories outside the LLM-relevant subset', async () => {
    const payload = {
      message: {
        content: JSON.stringify({
          findings: [
            {
              category: 'unsupported_claim', // heuristic-only category
              severity: 'block',
              summary: 'should be skipped',
              claim_ids: ['clm_aaaaaaaaaaaa_ollama_intern_1'],
              source_ids: [],
              confidence: 'low',
            },
            {
              category: 'overgeneralized_claim',
              severity: 'warn',
              summary: 'kept',
              claim_ids: ['clm_aaaaaaaaaaaa_ollama_intern_1'],
              source_ids: [],
              confidence: 'medium',
            },
          ],
        }),
      },
    };
    const r = makeReviewer(() =>
      new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const result = await r.review(baseInput);
    if (!result.ok) throw new Error('failed');
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]?.category).toBe('overgeneralized_claim');
  });

  it('returns ok:false when response is not valid JSON', async () => {
    const r = makeReviewer(() =>
      new Response(JSON.stringify({ message: { content: 'not json' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await r.review(baseInput);
    expect(result.ok).toBe(false);
  });

  it('returns ok:false when findings array missing', async () => {
    const r = makeReviewer(() =>
      new Response(JSON.stringify({ message: { content: JSON.stringify({}) } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await r.review(baseInput);
    expect(result.ok).toBe(false);
  });
});
