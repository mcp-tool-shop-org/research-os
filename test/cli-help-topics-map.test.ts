import { describe, it, expect } from 'vitest';
import { HELP_TOPICS } from '../src/cli/help-topics.js';

// Stage C Phase 3 amend wave — C3-006 Option C part B regression.
//
// The help-topics map is the static content backing `research-os help <topic>`.
// It is the OPERATOR-FACING DISCOVERY SURFACE at the moment of failure — every
// pointer must stay short, plain-text, and accurate. The test enforces:
//   1. The map ships exactly 4 topics in v1.0 (recovery, pack-publish, review,
//      gather). No silent additions; no silent removals.
//   2. Each value is ≤500 characters (CLI fits in a typical terminal page).
//   3. Each value is non-empty.
//   4. The map is frozen at module load (operator help text is not patchable
//      at runtime).
//   5. The pack-publish topic CARRIES the canonical --force sentence (load-
//      bearing substring), so the 5+ surface canonical-sentence regression
//      stays anchored to a discoverable surface.

describe('HELP_TOPICS map (C3-006)', () => {
  const expectedKeys = ['recovery', 'pack-publish', 'review', 'gather'];

  it('ships exactly the 4 expected topics — no extras, no drops', () => {
    const actualKeys = Object.keys(HELP_TOPICS).sort();
    expect(actualKeys).toEqual([...expectedKeys].sort());
  });

  it('every value is non-empty', () => {
    for (const key of expectedKeys) {
      const value = HELP_TOPICS[key];
      expect(value, `topic "${key}" must be non-empty`).toBeTruthy();
      expect(value.length, `topic "${key}" must be non-empty`).toBeGreaterThan(0);
    }
  });

  it('every value stays ≤500 characters', () => {
    for (const key of expectedKeys) {
      const value = HELP_TOPICS[key];
      expect(
        value.length,
        `topic "${key}" exceeded 500-char budget (${value.length} chars)`,
      ).toBeLessThanOrEqual(500);
    }
  });

  it('values contain no ANSI escape sequences', () => {
    // eslint-disable-next-line no-control-regex
    const ansi = /\[/;
    for (const key of expectedKeys) {
      expect(ansi.test(HELP_TOPICS[key]), `topic "${key}" must not contain ANSI codes`).toBe(false);
    }
  });

  it('map is frozen (Object.isFrozen) so runtime mutation is impossible', () => {
    expect(Object.isFrozen(HELP_TOPICS)).toBe(true);
  });

  it('pack-publish topic carries the canonical --force load-bearing substring', () => {
    // Refinement 1: the canonical sentence (or load-bearing substring) is
    // anchored on every operator-facing surface that mentions --force. The
    // CLI help-topic IS such a surface; the substring below is the test
    // anchor for the canonical-sentence regression test.
    expect(HELP_TOPICS['pack-publish']).toContain('clears and replaces the target package directory');
  });
});
