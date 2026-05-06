import * as cheerio from 'cheerio';
import { URL } from 'node:url';

import type {
  Extractor,
  ExtractionInput,
  ExtractionResult,
  Relevance,
  SourceType,
} from '../types.js';

function deriveSourceType(rawUrl: string, finalUrl: string | null): SourceType {
  const u = finalUrl ?? rawUrl;
  let host: string;
  try {
    host = new URL(u).hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
  if (host.startsWith('docs.') || host.endsWith('.readthedocs.io')) return 'docs';
  if (host === 'github.com' && /\/(issues|pull|discussions)\//.test(u)) return 'forum';
  if (host === 'news.ycombinator.com' || host.endsWith('reddit.com') || host.endsWith('stackoverflow.com'))
    return 'forum';
  if (host.endsWith('arxiv.org') || host.endsWith('semanticscholar.org')) return 'primary';
  if (host.endsWith('paperswithcode.com')) return 'benchmark';
  if (host.endsWith('anthropic.com') || host.endsWith('openai.com') || host.endsWith('claude.com'))
    return 'primary';
  return 'secondary';
}

function clean(text: string | undefined | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

export class HeuristicExtractor implements Extractor {
  readonly name = 'heuristic' as const;

  async available(): Promise<boolean> {
    return true;
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    if (!input.rawText) {
      return { ok: false, error: 'No raw text available for extraction' };
    }
    const isHtml = (input.contentType ?? '').includes('text/html') || /<html/i.test(input.rawText);

    if (!isHtml) {
      const title = clean(input.rawText.split(/\r?\n/, 1)[0] || '').slice(0, 200);
      const asserts = title || clean(input.rawText).slice(0, 240);
      const keyPoints = clean(input.rawText)
        .split(/(?<=[.!?])\s+/)
        .slice(0, 3)
        .map((s) => clean(s))
        .filter((s) => s.length > 0);
      return {
        ok: true,
        publisher: null,
        published_at: null,
        title: title || '(untitled)',
        source_type: deriveSourceType(input.url, input.finalUrl),
        relevance: 'unknown',
        key_points: keyPoints,
        limitations: [],
        asserts: asserts || '(empty)',
        scope: null,
        not: null,
      };
    }

    const $ = cheerio.load(input.rawText);

    $('script, style, noscript, nav, header, footer').remove();

    const title =
      clean($('meta[property="og:title"]').attr('content')) ||
      clean($('meta[name="twitter:title"]').attr('content')) ||
      clean($('title').first().text()) ||
      clean($('h1').first().text()) ||
      '(untitled)';

    const description =
      clean($('meta[property="og:description"]').attr('content')) ||
      clean($('meta[name="description"]').attr('content')) ||
      '';

    let publisher: string | null =
      clean($('meta[property="og:site_name"]').attr('content')) || null;
    if (!publisher) {
      try {
        publisher = new URL(input.finalUrl ?? input.url).hostname;
      } catch {
        publisher = null;
      }
    }

    let publishedAt: string | null =
      clean($('meta[property="article:published_time"]').attr('content')) ||
      clean($('meta[name="date"]').attr('content')) ||
      clean($('time[datetime]').first().attr('datetime')) ||
      null;
    if (publishedAt === '') publishedAt = null;

    const mainNode =
      $('article').first().length > 0
        ? $('article').first()
        : $('main').first().length > 0
          ? $('main').first()
          : $('body');

    const paragraphs = mainNode
      .find('p')
      .map((_, el) => clean($(el).text()))
      .get()
      .filter((t) => t.length > 40);

    const keyPoints = paragraphs.slice(0, 5);
    const asserts = description || paragraphs[0] || title;

    return {
      ok: true,
      publisher,
      published_at: publishedAt,
      title,
      source_type: deriveSourceType(input.url, input.finalUrl),
      relevance: 'unknown' as Relevance,
      key_points: keyPoints,
      limitations: [],
      asserts: asserts.slice(0, 600),
      scope: null,
      not: null,
    };
  }
}
