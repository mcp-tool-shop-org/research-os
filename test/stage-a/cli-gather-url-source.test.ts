// Stage A regression — A-CLI-002 (gather --approved / --urls-file exclusivity).
//
// Invariant: gather accepts URLs from exactly ONE source. Passing both
// --approved and --urls-file previously ran the approved-file stat (which can
// throw APPROVED_URLS_NOT_FOUND) and then discarded the approved value in favor
// of urlsFile (urlsFile ?? candidate) — a confusing throw-then-ignore path.
// assertGatherUrlSourceExclusive rejects the combination up front, mirroring
// the --no-progress/--progress mutual-exclusion guard.
//   BAD half  — --approved AND --urls-file together throws InvalidArgumentError.
//   GOOD half — either flag alone (or neither) passes the guard cleanly.

import { describe, it, expect } from 'vitest';
import { InvalidArgumentError } from 'commander';

import { assertGatherUrlSourceExclusive } from '../../src/cli.js';

describe('assertGatherUrlSourceExclusive (A-CLI-002)', () => {
  it('throws when both --approved and --urls-file are set (BAD half)', () => {
    expect(() => assertGatherUrlSourceExclusive(true, '/path/to/urls.txt')).toThrow(
      InvalidArgumentError,
    );
    expect(() => assertGatherUrlSourceExclusive(true, '/path/to/urls.txt')).toThrow(
      /mutually exclusive/,
    );
  });

  it('passes for --approved alone (GOOD half)', () => {
    expect(() => assertGatherUrlSourceExclusive(true, undefined)).not.toThrow();
  });

  it('passes for --urls-file alone (GOOD half)', () => {
    expect(() => assertGatherUrlSourceExclusive(false, '/path/to/urls.txt')).not.toThrow();
  });

  it('passes when neither is set (GOOD half)', () => {
    expect(() => assertGatherUrlSourceExclusive(false, undefined)).not.toThrow();
  });
});
