// Stage A regression — A-IDX-001 (package-entry error-class re-exports).
//
// Invariant: every error class that a publicly-exported function (review() /
// promote / calibration) can throw must be re-exported from the package entry
// (src/index.ts) so library consumers can `instanceof`-narrow it. Six classes
// were thrown but not re-exported; the 'review' help topic even documents
// ReviewerCascadeFailedError as the retryable contract.
//   BAD half  — each of the six classes must be importable from the package
//               entry (a missing re-export is `undefined`, failing the
//               constructor / instanceof assertions below).
//   GOOD half — each is a real constructor whose instances are ResearchOSError.

import { describe, it, expect } from 'vitest';
import * as entry from '../../src/index.js';
import * as srcErrors from '../../src/errors.js';
import { ResearchOSError } from '../../src/errors.js';

const NEWLY_EXPORTED = [
  'UnsupportedReceiptVersionError',
  'ReviewerCascadeFailedError',
  'ReviewerProfileInvalidError',
  'ReviewerProfileNotFoundError',
  'CalibrationReceiptMalformedError',
  'NoReviewerAvailableError',
] as const;

describe('package entry error-class re-exports (A-IDX-001)', () => {
  for (const name of NEWLY_EXPORTED) {
    it(`re-exports ${name} as a constructor`, () => {
      const Ctor = (entry as Record<string, unknown>)[name];
      // BAD half: a missing re-export is undefined, not a function.
      expect(typeof Ctor).toBe('function');
    });

    it(`${name} re-export is identity-equal to the source-module class`, () => {
      // A re-export that pointed at a different-but-also-function symbol would
      // pass the typeof check above; pin it to the canonical source class.
      expect((entry as Record<string, unknown>)[name]).toBe(
        (srcErrors as Record<string, unknown>)[name],
      );
    });

    it(`${name} extends ResearchOSError (the documented instanceof contract)`, () => {
      // GOOD half — the whole point of the re-export is that consumers can
      // `instanceof ResearchOSError`-narrow the failure class. Assert the
      // prototype chain directly (constructor arg shapes differ per class, so we
      // don't instantiate): a class whose instances are NOT ResearchOSError
      // would fail here even though it is a function.
      const Ctor = (entry as Record<string, unknown>)[name] as { prototype: object };
      expect(Ctor.prototype instanceof ResearchOSError).toBe(true);
    });
  }

  it('also still re-exports ResearchOSError (sanity / no regression)', () => {
    expect(typeof (entry as Record<string, unknown>).ResearchOSError).toBe('function');
  });

  it('the re-exported entry class is the same constructor as the source class', () => {
    // GOOD half: ResearchOSError from the entry is the canonical base, and the
    // newly-exported classes extend it.
    expect((entry as Record<string, unknown>).ResearchOSError).toBe(ResearchOSError);
  });
});
