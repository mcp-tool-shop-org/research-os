import { describe, it, expect } from 'vitest';
import { chunkKeyPoints, chunkRawText } from '../src/sources/excerpts/chunk.js';

describe('chunkRawText', () => {
  it('splits HTML on paragraph boundaries and yields excerpts that match the cleaned text', () => {
    const html = '<html><body><p>First substantive paragraph that is long enough.</p><p>Second substantive paragraph that is also long enough.</p></body></html>';
    const { cleaned, drafts } = chunkRawText(html);
    expect(drafts.length).toBeGreaterThanOrEqual(2);
    for (const d of drafts) {
      expect(cleaned.slice(d.char_start, d.char_end)).toContain(d.text.split(' ')[0]!);
    }
    expect(drafts[0]?.text).toContain('First substantive paragraph');
    expect(drafts[1]?.text).toContain('Second substantive paragraph');
  });

  it('returns no drafts for empty input', () => {
    expect(chunkRawText('').drafts).toEqual([]);
  });

  it('drops fragments below the minimum length', () => {
    const text = 'Tiny.';
    const { drafts } = chunkRawText(text);
    expect(drafts).toEqual([]);
  });

  it('is deterministic — same input yields the same drafts', () => {
    const text = 'Paragraph one is long enough to count.\n\nParagraph two is also long enough to count.';
    const a = chunkRawText(text).drafts;
    const b = chunkRawText(text).drafts;
    expect(b).toEqual(a);
  });

  it('decodes common HTML entities in cleaned output', () => {
    const html = '<p>Tom &amp; Jerry are a long-running cartoon duo with frequent appearances.</p>';
    const { cleaned } = chunkRawText(html);
    expect(cleaned).toContain('Tom & Jerry');
  });
});

describe('chunkKeyPoints', () => {
  it('produces one draft per non-empty key point in order', () => {
    const drafts = chunkKeyPoints(['First point', '   ', '', 'Second point']);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.text).toBe('First point');
    expect(drafts[1]?.text).toBe('Second point');
    expect(drafts[0]?.location_hint).toBe('key_point 1');
    expect(drafts[1]?.location_hint).toBe('key_point 2');
  });
});
