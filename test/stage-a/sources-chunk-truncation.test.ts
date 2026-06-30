/**
 * A-SOURCES-003 regression — char span consistent with truncated excerpt text.
 *
 * The truncation path previously left char_end = char_start + FULL sentence
 * length while `text` was truncated (and an ellipsis appended), so
 * cleaned.slice(char_start, char_end) !== text. The invariant every excerpt
 * draft must satisfy: cleaned.slice(char_start, char_end) === text.
 *
 * Both halves:
 *   - BAD: a sentence longer than MAX_EXCERPT_CHARS (800) is truncated; the
 *     produced draft's slice must equal its text exactly.
 *   - GOOD: a normal short sentence still slices back exactly.
 */
import { describe, it, expect } from 'vitest';
import { chunkRawText } from '../../src/sources/excerpts/chunk.js';

describe('A-SOURCES-003 — truncated excerpt char span matches text', () => {
  it('cleaned.slice(char_start,char_end) === text for a truncated long sentence', () => {
    // One long run with no sentence boundary -> stays a single >800-char
    // sentence -> hits the truncation branch in chunkRawText.
    const longWord = 'lorem ipsum dolor sit amet consectetur '.repeat(40); // ~1560 chars, no .!?
    const raw = `${longWord.trim()}`;
    const { cleaned, drafts } = chunkRawText(raw);

    expect(drafts.length).toBeGreaterThan(0);
    const truncated = drafts.find((d) => d.char_end - d.char_start > 0 && d.text.length >= 800);
    expect(truncated).toBeDefined();
    // The load-bearing invariant: the recorded span re-slices to the text.
    expect(cleaned.slice(truncated!.char_start, truncated!.char_end)).toBe(truncated!.text);
    // And char_end reflects the truncated length, not the full sentence length.
    expect(truncated!.char_end - truncated!.char_start).toBe(truncated!.text.length);
  });

  it('GOOD half: a normal sentence slices back exactly', () => {
    const raw =
      'Daylight saving time shifts measurably reduce next-morning workplace alertness in shift workers.';
    const { cleaned, drafts } = chunkRawText(raw);
    expect(drafts.length).toBeGreaterThan(0);
    for (const d of drafts) {
      expect(cleaned.slice(d.char_start, d.char_end)).toBe(d.text);
    }
  });
});
