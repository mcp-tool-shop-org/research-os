import { describe, it, expect } from 'vitest';
import { chunkRawText } from '../src/sources/excerpts/chunk.js';
import { evidenceGrounded } from '../src/claims/extract.js';

// Hostile fetched pages (up to 25 MB) must not hang the text-cleaning paths.
// The inputs are sized so the former regex chains took multiple seconds, yet a
// restored regression only slows the suite rather than hanging it.
const BUDGET_MS = 1500;

function timed<T>(fn: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}

describe('hostile-page text cleaning stays linear', () => {
  it('chunkRawText survives a page of unclosed "<"', () => {
    const { ms } = timed(() => chunkRawText('<p>' + '<'.repeat(100_000)));
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('chunkRawText survives a page of unclosed "<script"', () => {
    const { ms } = timed(() => chunkRawText('<p>' + '<script'.repeat(25_000)));
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('evidenceGrounded survives a page of unclosed "<"', () => {
    const { ms } = timed(() => evidenceGrounded('some excerpt text', '<'.repeat(100_000)));
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('chunkRawText keeps paragraph and line breaks for normal HTML', () => {
    const html =
      '<html><head><style>p{color:red}</style><script>var a = "<p>";</script></head>' +
      '<body><p>First paragraph.</p><div>Second<br/>line</div><span>inline</span></body></html>';
    expect(chunkRawText(html).cleaned).toBe('First paragraph.\n\nSecond\nline\n\ninline');
  });

  it('chunkRawText keeps the paragraph break after a stray "<" in prose', () => {
    const { cleaned } = chunkRawText('<p>if a < b then</p><p>next paragraph here.</p>');
    expect(cleaned).toContain('\n\n');
  });

  it('evidenceGrounded still strips tags and matches normal HTML', () => {
    const raw = '<p>The  <b>quick</b> brown fox</p>';
    expect(evidenceGrounded('the quick brown fox', raw)).toBe(true);
  });
});
