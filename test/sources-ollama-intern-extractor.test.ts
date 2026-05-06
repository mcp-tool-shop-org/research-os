import { describe, it, expect } from 'vitest';
import { OllamaInternExtractor } from '../src/sources/extractors/ollama-intern.js';

const TEST_HOST = 'http://test-ollama:11434';
const TEST_MODEL = 'hermes3:8b';

function makeFetch(map: Map<string, () => Response>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const handler = map.get(url);
    if (!handler) throw new Error(`Unexpected fetch: ${url}`);
    return handler();
  }) as unknown as typeof fetch;
}

function makeExtractor(map: Map<string, () => Response>): OllamaInternExtractor {
  return new OllamaInternExtractor({
    host: TEST_HOST,
    model: TEST_MODEL,
    fetchImpl: makeFetch(map),
  });
}

describe('OllamaInternExtractor.available', () => {
  it('returns true when /api/tags lists the model', async () => {
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
    const ex = makeExtractor(map);
    expect(await ex.available()).toBe(true);
  });

  it('returns false when /api/tags is unreachable', async () => {
    const fetchImpl = (async () => {
      throw new Error('connect ECONNREFUSED');
    }) as unknown as typeof fetch;
    const ex = new OllamaInternExtractor({ host: TEST_HOST, model: TEST_MODEL, fetchImpl });
    expect(await ex.available()).toBe(false);
  });

  it('returns false when /api/tags returns 500', async () => {
    const map = new Map<string, () => Response>([
      [
        `${TEST_HOST}/api/tags`,
        () => new Response('boom', { status: 500 }),
      ],
    ]);
    const ex = makeExtractor(map);
    expect(await ex.available()).toBe(false);
  });
});

describe('OllamaInternExtractor.extract', () => {
  it('parses a well-formed JSON response into an extraction result with scope', async () => {
    const ollamaPayload = {
      message: {
        content: JSON.stringify({
          publisher: 'Test Pub',
          published_at: '2025-01-15T00:00:00Z',
          title: 'Strict Boundary',
          source_type: 'primary',
          relevance: 'high',
          key_points: ['point one', 'point two'],
          limitations: ['narrow scope'],
          asserts: 'patch publish before next repo',
          scope: 'role-os rollout lockdown fixes',
          not: 'universal publish policy',
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
      url: 'https://example.com/x',
      finalUrl: 'https://example.com/x',
      rawText: 'some real text',
      contentType: 'text/html',
    });
    if (!result.ok) throw new Error(`extract failed: ${result.error}`);
    expect(result.publisher).toBe('Test Pub');
    expect(result.scope).toBe('role-os rollout lockdown fixes');
    expect(result.not).toBe('universal publish policy');
    expect(result.asserts).toBe('patch publish before next repo');
    expect(result.source_type).toBe('primary');
  });

  it('returns ok:false when the response is not valid JSON', async () => {
    const map = new Map<string, () => Response>([
      [
        `${TEST_HOST}/api/chat`,
        () =>
          new Response(JSON.stringify({ message: { content: 'not json at all' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ],
    ]);
    const ex = makeExtractor(map);
    const result = await ex.extract({
      url: 'https://example.com/x',
      finalUrl: null,
      rawText: 'text',
      contentType: 'text/html',
    });
    expect(result.ok).toBe(false);
  });

  it('coerces unknown source_type and relevance values to "unknown"', async () => {
    const payload = {
      message: {
        content: JSON.stringify({
          publisher: null,
          published_at: null,
          title: 'X',
          source_type: 'gibberish',
          relevance: 'maximum',
          key_points: [],
          limitations: [],
          asserts: 'something',
          scope: null,
          not: null,
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
    const ex = makeExtractor(map);
    const result = await ex.extract({
      url: 'https://example.com/x',
      finalUrl: null,
      rawText: 'text',
      contentType: 'text/html',
    });
    if (!result.ok) throw new Error('extract failed');
    expect(result.source_type).toBe('unknown');
    expect(result.relevance).toBe('unknown');
  });
});
