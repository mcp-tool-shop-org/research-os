import { describe, it, expect } from 'vitest';
import { HeuristicExtractor } from '../src/sources/extractors/heuristic.js';

const extractor = new HeuristicExtractor();

describe('HeuristicExtractor', () => {
  it('is always available', async () => {
    expect(await extractor.available()).toBe(true);
  });

  it('extracts title, publisher, and key points from a typical HTML page', async () => {
    const html = `<!doctype html>
<html><head>
<title>Example Article</title>
<meta property="og:site_name" content="Example Pub" />
<meta property="og:title" content="A More Specific Title" />
<meta name="description" content="The article argues that X works in context Y." />
<meta property="article:published_time" content="2025-06-01T12:00:00Z" />
</head><body>
<article>
<h1>A More Specific Title</h1>
<p>This is the first substantive paragraph that explains the main argument with at least forty characters of meaningful content.</p>
<p>This is the second paragraph that provides supporting reasoning for the position taken in the article body.</p>
<p>Short.</p>
</article>
</body></html>`;
    const result = await extractor.extract({
      url: 'https://example.com/article',
      finalUrl: 'https://example.com/article',
      rawText: html,
      contentType: 'text/html',
    });
    if (!result.ok) throw new Error('extraction failed');
    expect(result.title).toBe('A More Specific Title');
    expect(result.publisher).toBe('Example Pub');
    expect(result.published_at).toBe('2025-06-01T12:00:00Z');
    expect(result.asserts).toContain('article argues that X');
    expect(result.key_points.length).toBeGreaterThan(0);
    expect(result.key_points[0]).toContain('first substantive paragraph');
    expect(result.scope).toBeNull();
    expect(result.not).toBeNull();
  });

  it('classifies known hosts into source_type buckets', async () => {
    const cases: Array<[string, string]> = [
      ['https://docs.anthropic.com/en/docs/claude-code', 'docs'],
      ['https://github.com/owner/repo/issues/1', 'forum'],
      ['https://news.ycombinator.com/item?id=1', 'forum'],
      ['https://arxiv.org/abs/2401.0001', 'primary'],
      ['https://anthropic.com/news/research', 'primary'],
      ['https://random-blog.example/post', 'secondary'],
    ];
    for (const [url, expected] of cases) {
      const result = await extractor.extract({
        url,
        finalUrl: url,
        rawText: '<html><head><title>x</title></head><body><p>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</p></body></html>',
        contentType: 'text/html',
      });
      if (!result.ok) throw new Error('extraction failed');
      expect(result.source_type, `for ${url}`).toBe(expected);
    }
  });

  it('returns ok:false when raw text is empty', async () => {
    const result = await extractor.extract({
      url: 'https://example.com/x',
      finalUrl: null,
      rawText: '',
      contentType: 'text/html',
    });
    expect(result.ok).toBe(false);
  });

  it('handles plain text content without HTML', async () => {
    const result = await extractor.extract({
      url: 'https://example.com/plain.txt',
      finalUrl: null,
      rawText: 'A plain title line.\n\nThis is the body. Another sentence here. And a third.',
      contentType: 'text/plain',
    });
    if (!result.ok) throw new Error('extraction failed');
    expect(result.title).toBe('A plain title line.');
    expect(result.scope).toBeNull();
  });
});
