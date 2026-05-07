import { describe, it, expect } from 'vitest';
import { OllamaInternClaimExtractor } from '../src/claims/extractors/ollama-intern.js';
import type { Excerpt } from '../src/sources/excerpts/schema.js';
import type { SourceCard } from '../src/sources/schema.js';

const TEST_HOST = 'http://test-ollama:11434';
const TEST_MODEL = 'hermes3:8b';

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

function makeFetch(map: Map<string, () => Response>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const handler = map.get(url);
    if (!handler) throw new Error(`Unexpected fetch: ${url}`);
    return handler();
  }) as unknown as typeof fetch;
}

function makeExtractor(map: Map<string, () => Response>): OllamaInternClaimExtractor {
  return new OllamaInternClaimExtractor({
    host: TEST_HOST,
    model: TEST_MODEL,
    fetchImpl: makeFetch(map),
  });
}

describe('OllamaInternClaimExtractor.available', () => {
  it('detects model by exact name match', async () => {
    const map = new Map<string, () => Response>([
      [
        `${TEST_HOST}/api/tags`,
        () =>
          new Response(JSON.stringify({ models: [{ name: 'hermes3:8b' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ],
    ]);
    expect(await makeExtractor(map).available()).toBe(true);
  });

  it('detects model by family prefix (hermes3:latest matches hermes3:8b family)', async () => {
    const map = new Map<string, () => Response>([
      [
        `${TEST_HOST}/api/tags`,
        () =>
          new Response(JSON.stringify({ models: [{ name: 'hermes3:latest' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ],
    ]);
    expect(await makeExtractor(map).available()).toBe(true);
  });

  it('returns false when model family is missing', async () => {
    const map = new Map<string, () => Response>([
      [
        `${TEST_HOST}/api/tags`,
        () =>
          new Response(JSON.stringify({ models: [{ name: 'llama3:8b' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ],
    ]);
    expect(await makeExtractor(map).available()).toBe(false);
  });

  it('returns false when /api/tags is unreachable', async () => {
    const fetchImpl = (async () => {
      throw new Error('connect ECONNREFUSED');
    }) as unknown as typeof fetch;
    const ex = new OllamaInternClaimExtractor({
      host: TEST_HOST,
      model: TEST_MODEL,
      fetchImpl,
    });
    expect(await ex.available()).toBe(false);
  });
});

describe('OllamaInternClaimExtractor.extract (span-first)', () => {
  it('parses a well-formed claims array carrying excerpt IDs and scope/not', async () => {
    const ollamaPayload = {
      message: {
        content: JSON.stringify({
          claims: [
            {
              asserts: 'patch publish before next repo',
              scope: 'role-os rollout lockdown fixes',
              not: 'universal publish policy',
              evidence_excerpt_ids: ['ex_abcdef012345_001'],
              evidence_location: 'paragraph 1',
              confidence: 'high',
            },
            {
              asserts: 'tests ship with code',
              scope: 'all repos',
              not: 'documentation-only changes',
              evidence_excerpt_ids: ['ex_abcdef012345_002'],
              evidence_location: null,
              confidence: 'medium',
            },
          ],
        }),
      },
    };
    const map = new Map<string, () => Response>([
      [
        `${TEST_HOST}/api/chat`,
        () =>
          new Response(JSON.stringify(ollamaPayload), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ],
    ]);
    const ex = makeExtractor(map);
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: 'a'.repeat(64),
      excerpts: sampleExcerpts,
    });
    if (!result.ok) throw new Error(`failed: ${result.error}`);
    expect(result.method).toBe('ollama_intern_propositional');
    expect(result.claims).toHaveLength(2);
    expect(result.claims[0]?.scope).toBe('role-os rollout lockdown fixes');
    expect(result.claims[0]?.not).toBe('universal publish policy');
    expect(result.claims[0]?.confidence).toBe('high');
    expect(result.claims[0]?.evidence_excerpt_ids).toEqual(['ex_abcdef012345_001']);
  });

  it('returns ok:false when ledger is empty (no spans to choose from)', async () => {
    const map = new Map<string, () => Response>();
    const ex = makeExtractor(map);
    const result = await ex.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: [],
    });
    expect(result.ok).toBe(false);
  });

  it('skips claims with missing asserts or empty evidence_excerpt_ids', async () => {
    const payload = {
      message: {
        content: JSON.stringify({
          claims: [
            { asserts: 'kept', evidence_excerpt_ids: ['ex_abcdef012345_001'] },
            { asserts: '', evidence_excerpt_ids: ['ex_abcdef012345_001'] },
            { asserts: 'no ids', evidence_excerpt_ids: [] },
          ],
        }),
      },
    };
    const map = new Map<string, () => Response>([
      [
        `${TEST_HOST}/api/chat`,
        () =>
          new Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ],
    ]);
    const result = await makeExtractor(map).extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
    });
    if (!result.ok) throw new Error('should succeed');
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.asserts).toBe('kept');
  });

  it('returns ok:false when response is not valid JSON', async () => {
    const map = new Map<string, () => Response>([
      [
        `${TEST_HOST}/api/chat`,
        () =>
          new Response(JSON.stringify({ message: { content: 'not-json' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ],
    ]);
    const result = await makeExtractor(map).extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
    });
    expect(result.ok).toBe(false);
  });

  it('returns ok:false when claims array is missing', async () => {
    const map = new Map<string, () => Response>([
      [
        `${TEST_HOST}/api/chat`,
        () =>
          new Response(JSON.stringify({ message: { content: JSON.stringify({}) } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ],
    ]);
    const result = await makeExtractor(map).extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
    });
    expect(result.ok).toBe(false);
  });

  it('coerces "null" string scope back to actual null', async () => {
    const payload = {
      message: {
        content: JSON.stringify({
          claims: [
            {
              asserts: 'something',
              scope: 'null',
              not: 'null',
              evidence_excerpt_ids: ['ex_abcdef012345_001'],
            },
          ],
        }),
      },
    };
    const map = new Map<string, () => Response>([
      [
        `${TEST_HOST}/api/chat`,
        () =>
          new Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ],
    ]);
    const result = await makeExtractor(map).extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: sampleExcerpts,
    });
    if (!result.ok) throw new Error('should succeed');
    expect(result.claims[0]?.scope).toBeNull();
    expect(result.claims[0]?.not).toBeNull();
  });
});
