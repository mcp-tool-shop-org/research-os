import { describe, it, expect } from 'vitest';
import { HeuristicExtractor } from '../src/sources/extractors/heuristic.js';

const extractor = new HeuristicExtractor();

async function typeOf(url: string): Promise<string> {
  const result = await extractor.extract({
    url,
    finalUrl: url,
    rawText: 'Plain page text.',
    contentType: 'text/plain',
  });
  if (!result.ok) throw new Error('extraction failed');
  return result.source_type;
}

describe('HeuristicExtractor source_type host matching', () => {
  it.each([
    ['https://arxiv.org/abs/2401.00001', 'primary'],
    ['https://www.arxiv.org/abs/2401.00001', 'primary'],
    ['https://export.arxiv.org/abs/2401.00001', 'primary'],
    ['https://api.semanticscholar.org/graph/v1/paper/1', 'primary'],
    ['https://www.anthropic.com/news/x', 'primary'],
    ['https://openai.com/index/x', 'primary'],
    ['https://code.claude.com/x', 'primary'],
    ['https://www.reddit.com/r/x', 'forum'],
    ['https://stackoverflow.com/questions/1', 'forum'],
    ['https://paperswithcode.com/sota/x', 'benchmark'],
  ])('keeps %s as %s', async (url, expected) => {
    expect(await typeOf(url)).toBe(expected);
  });

  it.each([
    'https://fakearxiv.org/abs/1',
    'https://notanthropic.com/x',
    'https://evilopenai.com/x',
    'https://notclaude.com/x',
    'https://fakesemanticscholar.org/x',
    'https://spreddit.com/x',
    'https://notstackoverflow.com/x',
    'https://fakepaperswithcode.com/x',
    'https://arxiv.org.evil.example/x',
  ])('does not treat lookalike host %s as a trusted type', async (url) => {
    expect(await typeOf(url)).toBe('secondary');
  });
});
