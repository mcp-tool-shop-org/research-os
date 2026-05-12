import { describe, it, expect } from 'vitest';
import { OllamaInternClaimExtractor } from '../src/claims/extractors/direct-ollama-legacy-extractor.js';
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

const sampleExcerpts: Excerpt[] = [
  {
    excerpt_id: 'ex_abcdef012345_001',
    source_id: 'src_abcdef012345',
    source_hash: null,
    text: 'A literal excerpt of the source body for the test.',
    location_hint: 'paragraph 1',
    char_start: 0,
    char_end: 49,
    origin: 'raw_text',
    created_at: '2026-05-06T22:00:00.000Z',
  },
];

function makeFetch(map: Map<string, () => Response>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const handler = map.get(url);
    if (!handler) throw new Error(`Unexpected fetch: ${url}`);
    return handler();
  }) as unknown as typeof fetch;
}

// B-002 regression: JSON.parse('null') yields null, and the prior code then
// did parsed.claims → TypeError outside the try/catch. The fix must return
// { ok: false, error: ... } for any non-object JSON value.
describe('OllamaInternClaimExtractor — null-deref guard (B-002)', () => {
  it('returns ok:false when the model emits literal "null"', async () => {
    const extractor = new OllamaInternClaimExtractor({
      host: TEST_HOST,
      model: TEST_MODEL,
      fetchImpl: makeFetch(
        new Map<string, () => Response>([
          [
            `${TEST_HOST}/api/chat`,
            () =>
              new Response(
                JSON.stringify({ message: { content: 'null' } }),
                { status: 200, headers: { 'content-type': 'application/json' } },
              ),
          ],
        ]),
      ),
    });
    const result = await extractor.extract({
      sourceCard: baseCard,
      excerpts: sampleExcerpts,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('extract should report soft failure');
    expect(result.error).toContain('JSON object');
  });

  it('returns ok:false when the model emits a JSON array (not an object)', async () => {
    const extractor = new OllamaInternClaimExtractor({
      host: TEST_HOST,
      model: TEST_MODEL,
      fetchImpl: makeFetch(
        new Map<string, () => Response>([
          [
            `${TEST_HOST}/api/chat`,
            () =>
              new Response(
                JSON.stringify({ message: { content: '[]' } }),
                { status: 200, headers: { 'content-type': 'application/json' } },
              ),
          ],
        ]),
      ),
    });
    const result = await extractor.extract({
      sourceCard: baseCard,
      excerpts: sampleExcerpts,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('extract should report soft failure');
    expect(result.error).toContain('JSON object');
  });
});
