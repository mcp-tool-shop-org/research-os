import { describe, it, expect } from 'vitest';
import { removeHtmlElements, stripHtmlTags } from '../src/util/html-text.js';

describe('stripHtmlTags', () => {
  it('replaces tags with a space and keeps text', () => {
    expect(stripHtmlTags('<p>Hello <b>world</b></p>')).toBe(' Hello  world  ');
  });

  it('matches the regex <[^>]+> on edge shapes', () => {
    const re = (s: string) => s.replace(/<[^>]+>/g, ' ');
    for (const s of ['a<>b', '<<>', 'a < b > c', 'x<y', '<a>>', '<a\n b>c', '', 'plain', '<', '>', '<a><b', '<><a>']) {
      expect(stripHtmlTags(s)).toBe(re(s));
    }
  });

  it('passes the inner text to a custom replacer', () => {
    expect(stripHtmlTags('a<br/>b<i>c', (inner) => `[${inner}]`)).toBe('a[br/]b[i]c');
  });

  it('leaves a trailing "<" with no ">" as text', () => {
    expect(stripHtmlTags('one <two')).toBe('one <two');
  });

  it('is linear on unclosed "<"', () => {
    const start = performance.now();
    const out = stripHtmlTags('<'.repeat(2_000_000));
    expect(out.length).toBe(2_000_000);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('is linear on many "<>" pairs and nested openers', () => {
    const start = performance.now();
    stripHtmlTags('<>'.repeat(500_000));
    stripHtmlTags('<'.repeat(500_000) + '>');
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe('removeHtmlElements', () => {
  it('drops script and style blocks case-insensitively', () => {
    const html = 'a<SCRIPT type="x">alert(1)</Script>b<style>p{}</style>c';
    expect(removeHtmlElements(html, ['script', 'style'])).toBe('a b c');
  });

  it('removes several blocks in one text', () => {
    expect(removeHtmlElements('<script>1</script>x<script>2</script>', ['script'])).toBe(' x ');
  });

  it('leaves an unclosed block as text', () => {
    expect(removeHtmlElements('keep <script>no close', ['script'])).toBe('keep <script>no close');
  });

  it('is linear on repeated unclosed "<script"', () => {
    const start = performance.now();
    const input = '<script'.repeat(1_000_000);
    expect(removeHtmlElements(input, ['script', 'style'])).toBe(input);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('keeps indices aligned when the text has non-ASCII characters that change length when lowercased', () => {
    expect(removeHtmlElements('İİİ<script>x</script>end', ['script'])).toBe('İİİ end');
  });
});
