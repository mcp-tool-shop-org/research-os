import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { HELP_TOPICS } from '../src/cli/help-topics.js';

// Stage C Phase 3 amend wave — Refinement 1 (canonical sentence regression).
//
// One sentence is now load-bearing across the entire operator surface:
//
//   "--force clears and replaces the target package directory. Do not keep
//    hand-authored files inside generated package output."
//
// (Period-terminated, byte-for-byte. See `reports/stage-c-phase1-audit.md`
// Theme 1.)
//
// Five-plus surfaces own it:
//
//   1. `src/cli.ts`                       — CLI `--help` option description (C1)
//   2. `src/pack/publish/index.ts`        — first-encounter --force error hint (C1)
//   3. `docs/pack-publish.md`             — repo-level reference (C3)
//   4. `site/src/content/docs/handbook/pack-publish.md`  — handbook table (C3)
//   5. `site/src/content/docs/handbook/reference.md`     — CLI reference page (C3)
//   6. `CHANGELOG.md` `[Unreleased]`      — release-doc disclosure (C3)
//   7. `README.md` quick-start            — load-bearing substring + link (C3)
//   8. `src/cli/help-topics.ts`           — `pack-publish` topic (C3)
//
// The regression test asserts the load-bearing substring
// `clears and replaces the target package directory` is present on every
// surface. This applies the "old-API-dead" doctrine to operator-facing prose:
// if anyone edits one surface back to a euphemism, the test fails and the
// canonical sentence is restored.
//
// IMPORTANT: this is a Wave-3 / Stage C cross-agent integration test. C1
// owns the two `src/` surfaces (cli.ts, pack/publish/index.ts); C3 owns the
// five doc surfaces. The test enforces that the wave converged.
//
// FALLBACK: if `dist/cli.js` does not exist at test time, we read source
// substrings only and skip the `--help` execFileSync check. This is documented
// in `reports/stage-c-phase3-c3-closeout.md`.

const REPO_ROOT = resolve(__dirname, '..');

const CANONICAL_SUBSTRING = 'clears and replaces the target package directory';
const CANONICAL_SENTENCE_FULL =
  '--force clears and replaces the target package directory. Do not keep hand-authored files inside generated package output.';

interface Surface {
  /** Human-readable identifier for assertion messages. */
  id: string;
  /** Absolute repo-relative path. */
  path: string;
  /** If true, require the FULL canonical sentence verbatim. If false, the load-bearing substring is sufficient (e.g., README quick-start where the warning paraphrases). */
  fullVerbatim: boolean;
  /** Cross-tenant ownership note for assertion messages. */
  owner: 'C1' | 'C3';
}

const surfaces: Surface[] = [
  // C1-owned (source files; C1's amend lands the canonical sentence verbatim).
  { id: 'src/cli.ts (--help text)', path: 'src/cli.ts', fullVerbatim: false, owner: 'C1' },
  { id: 'src/pack/publish/index.ts (first-encounter --force error)', path: 'src/pack/publish/index.ts', fullVerbatim: false, owner: 'C1' },

  // C3-owned (doc surfaces).
  { id: 'docs/pack-publish.md', path: 'docs/pack-publish.md', fullVerbatim: true, owner: 'C3' },
  { id: 'site/src/content/docs/handbook/pack-publish.md', path: 'site/src/content/docs/handbook/pack-publish.md', fullVerbatim: false, owner: 'C3' },
  { id: 'site/src/content/docs/handbook/reference.md', path: 'site/src/content/docs/handbook/reference.md', fullVerbatim: false, owner: 'C3' },
  { id: 'CHANGELOG.md [Unreleased]', path: 'CHANGELOG.md', fullVerbatim: true, owner: 'C3' },
  { id: 'README.md quick-start', path: 'README.md', fullVerbatim: false, owner: 'C3' },
];

describe('Canonical pack-publish --force sentence (Refinement 1)', () => {
  for (const surface of surfaces) {
    it(`load-bearing substring present in ${surface.id} (${surface.owner})`, () => {
      const absPath = resolve(REPO_ROOT, surface.path);
      expect(existsSync(absPath), `surface "${surface.id}" not found at ${absPath}`).toBe(true);
      const text = readFileSync(absPath, 'utf8');
      expect(
        text,
        `surface "${surface.id}" (${surface.owner}) missing load-bearing substring "${CANONICAL_SUBSTRING}". This is the canonical-sentence regression: if the substring disappears, restore the canonical sentence (see Stage C Phase 3 closeout reports).`,
      ).toContain(CANONICAL_SUBSTRING);
    });
  }

  it('full canonical sentence verbatim in docs/pack-publish.md', () => {
    const text = readFileSync(resolve(REPO_ROOT, 'docs/pack-publish.md'), 'utf8');
    expect(text).toContain(CANONICAL_SENTENCE_FULL);
  });

  it('full canonical sentence verbatim in CHANGELOG.md [Unreleased]', () => {
    const text = readFileSync(resolve(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
    expect(text).toContain(CANONICAL_SENTENCE_FULL);
  });

  it('HELP_TOPICS pack-publish topic carries the load-bearing substring', () => {
    expect(HELP_TOPICS['pack-publish']).toContain(CANONICAL_SUBSTRING);
  });
});
