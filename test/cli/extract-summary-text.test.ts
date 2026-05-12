import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// v0.8.0 release-prep — operator-trust text fixes on the `claim extract`
// summary block.
//
// Two defects were corrected:
//
//  1. `critic_call_failed (admit): N` — stale terminology from before the
//     soft-fail policy inversion shipped in commit c92634f. The shipped
//     behavior conservatively EXCLUDES claims when the critic call fails;
//     calling that "admit" misled the operator about what frame_excluded
//     state the claim actually carried on disk.
//
//  2. `supports_section (admitted): N` — the count is the critic's per-draft
//     decision tally, which is taken BEFORE persistence. A draft critic'd as
//     supports_section may still be rejected (ungrounded / excerpt_id_missing
//     / excerpt_id_malformed) or deduped before it lands in claims.jsonl,
//     so the "(admitted)" label was misleading when the persisted count
//     diverged. We now label the critic decision as `(pre-persist)` and
//     additionally print an `admitted (persisted on disk)` line whose source
//     is the actual claims.jsonl write loop.
//
// This is a source-substring inspection (matching the pattern set by
// `test/cli/stage-d-summary-whitespace.test.ts`) rather than an end-to-end
// run, because the CLI summary block is pack-state-aware and would need a
// fixture to invoke end-to-end. The strings are operator-grep-stable so the
// source-text contract is the right testing surface.
describe('v0.8.0 release-prep — extract summary text', () => {
  const cliSource = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'src',
      'cli.ts',
    ),
    'utf8',
  );

  it('critic_call_failed line uses "conservatively excluded" label', () => {
    expect(cliSource).toContain('critic_call_failed (conservatively excluded):');
  });

  it('old "(admit)" label is gone', () => {
    expect(cliSource).not.toContain('critic_call_failed (admit)');
  });

  it('supports_section label is explicitly "(pre-persist)"', () => {
    expect(cliSource).toContain('supports_section (pre-persist):');
  });

  it('old "(admitted)" label on supports_section is gone', () => {
    expect(cliSource).not.toContain('supports_section (admitted):');
  });

  it('persisted-admitted count line is present alongside the critic tally', () => {
    expect(cliSource).toContain('admitted (persisted on disk):');
    expect(cliSource).toContain('${result.claimsAdmittedPersisted}');
  });
});
