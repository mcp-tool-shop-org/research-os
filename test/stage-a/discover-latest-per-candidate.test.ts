// Stage A verifier follow-up — latestPerCandidate tie-break coverage (A-SOURCES-004).
//
// The A-SOURCES-004 fix changed discover/run.ts latestPerCandidate from strict
// `<` to `<=` so that on an equal discovered_at a same-millisecond status update
// (the later-APPENDED ledger entry) wins rather than being dropped. That
// behavioral invariant had no dedicated test (reverting it stayed green).
//
// Both halves:
//   - BAD : two entries for one candidate_id at the SAME discovered_at — the
//           later-appended (approved) status must win over the earlier (candidate).
//   - GOOD: distinct discovered_at still resolves to the newer timestamp.

import { describe, it, expect } from 'vitest';
import { latestPerCandidate } from '../../src/discover/run.js';
import { DiscoveryCandidateSchema, type DiscoveryCandidate } from '../../src/discover/schema.js';

function cand(
  status: 'candidate' | 'approved' | 'rejected',
  discoveredAt: string,
): DiscoveryCandidate {
  return DiscoveryCandidateSchema.parse({
    candidate_id: 'disc_aaaaaaaaaaaa',
    section_id: '01-test',
    url: 'https://example.com/paper',
    title: 'A paper',
    publisher: null,
    source_type_guess: 'docs',
    why_relevant: 'fixture',
    query: 'fixture query',
    rank: 1,
    discovered_at: discoveredAt,
    status,
    discovered_by: 'fixture',
    reason: null,
  });
}

const TIE = '2026-05-06T22:05:00.000Z';

describe('latestPerCandidate — append-order tie-break (A-SOURCES-004)', () => {
  it('BAD: same discovered_at → the later-appended status wins (not the earlier)', () => {
    // Ledger append order: candidate first, then a same-ms approval.
    const out = latestPerCandidate([cand('candidate', TIE), cand('approved', TIE)]);
    expect(out.get('disc_aaaaaaaaaaaa')!.status).toBe('approved');
  });

  it('GOOD: distinct discovered_at → the newer timestamp wins', () => {
    const out = latestPerCandidate([
      cand('candidate', '2026-05-06T22:00:00.000Z'),
      cand('approved', '2026-05-06T22:10:00.000Z'),
    ]);
    expect(out.get('disc_aaaaaaaaaaaa')!.status).toBe('approved');
  });
});
