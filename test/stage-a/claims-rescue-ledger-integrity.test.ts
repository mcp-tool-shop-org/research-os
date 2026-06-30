/**
 * A-CLAIMS-001 (operator side) + A-CLAIMS-002 regressions for rescue-ledger.ts.
 *
 * A-CLAIMS-001 — peersForEligibility (via listRescueCandidates) must count
 * frame-critic SURVIVORS, not already-rescued claims. A claim that earned
 * frame_excluded=false via a PRIOR rescue (rescue_status=rescued_by_llm /
 * rescued_by_operator) is NOT independent topical-relevance proof and must
 * not be counted toward another candidate's eligibility.
 *   (bad)  1 genuine survivor + 1 already-rescued peer → candidate stays
 *          ineligible (peer_count=1), because the rescued peer doesn't count.
 *   (good) 2 genuine survivors → candidate is eligible (peer_count=2).
 *
 * A-CLAIMS-002 — readClaims (used by the operator rescue/decline rewrite
 * paths) must NOT silently drop an unparseable / forward-incompatible claim
 * line and then rewrite the whole file from only the parsed claims. It must
 * fail loud with a line number before any destructive rewrite.
 *   (bad)  a hand-edited/forward-incompat line present → rescueClaimByOperator
 *          throws (line number in message); the file is left intact.
 *   (good) a clean file → rescueClaimByOperator succeeds.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  listRescueCandidates,
  rescueClaimByOperator,
} from '../../src/claims/rescue-ledger.js';
import { ClaimSchema, type Claim } from '../../src/claims/schema.js';

function makeClaim(args: {
  claimId: string;
  sourceIds?: string[];
  asserts?: string;
  frame_excluded?: boolean;
  frame_exclusion_reason?: Claim['frame_exclusion_reason'];
  rescue_status?: Claim['rescue_status'];
}): Claim {
  return ClaimSchema.parse({
    claim_id: args.claimId,
    section_id: '01-test',
    source_ids: args.sourceIds ?? ['src_f6ffc9e9d86f'],
    source_hashes: [],
    asserts: args.asserts ?? 'A claim',
    scope: null,
    not: null,
    evidence_excerpt_ids: [`ex_${args.claimId.split('_')[1] ?? 'aaaaaaaaaaaa'}_001`],
    evidence_excerpt: 'evidence body',
    evidence_location: null,
    confidence: 'medium',
    extractor: 'ollama-intern',
    extraction_method: 'mcp_ollama_extract',
    created_at: '2026-05-15T10:00:00.000Z',
    review_state: 'candidate',
    frame_excluded: args.frame_excluded ?? false,
    ...(args.frame_exclusion_reason
      ? { frame_exclusion_reason: args.frame_exclusion_reason }
      : {}),
    ...(args.rescue_status ? { rescue_status: args.rescue_status } : {}),
  });
}

describe('A-CLAIMS-001 — peersForEligibility ignores already-rescued peers', () => {
  let pack: string;
  beforeEach(() => {
    pack = mkdtempSync(join(tmpdir(), 'claims-ledger-integrity-'));
    mkdirSync(join(pack, 'sections', '01-test'), { recursive: true });
  });
  afterEach(() => rmSync(pack, { recursive: true, force: true }));

  function writeClaims(claims: Claim[]): void {
    writeFileSync(
      join(pack, 'sections', '01-test', 'claims.jsonl'),
      claims.map((c) => JSON.stringify(c)).join('\n') + '\n',
      'utf8',
    );
  }

  it('bad-input half: 1 genuine survivor + 1 already-rescued peer → candidate stays ineligible', async () => {
    writeClaims([
      // genuine frame-critic survivor
      makeClaim({ claimId: 'clm_f6ffc9e9d86f_ollama_intern_1', frame_excluded: false }),
      // already rescued — frame_excluded=false BUT not an independent survivor
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_2',
        frame_excluded: false,
        frame_exclusion_reason: 'source_content_mismatch',
        rescue_status: 'rescued_by_llm',
      }),
      // candidate under evaluation
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_3',
        frame_excluded: true,
        frame_exclusion_reason: 'source_content_mismatch',
      }),
    ]);
    const candidates = await listRescueCandidates({ packPath: pack, sectionId: '01-test' });
    const c3 = candidates.find(
      (c) => c.claim.claim_id === 'clm_f6ffc9e9d86f_ollama_intern_3',
    )!;
    expect(c3).toBeTruthy();
    // peer_count must be 1 (the rescued peer is excluded from the count).
    expect(c3.eligibility.peer_count).toBe(1);
    expect(c3.eligibility.passed).toBe(false);
  });

  it('good-input half: 2 genuine survivors → candidate is eligible (peer_count=2)', async () => {
    writeClaims([
      makeClaim({ claimId: 'clm_f6ffc9e9d86f_ollama_intern_1', frame_excluded: false }),
      makeClaim({ claimId: 'clm_f6ffc9e9d86f_ollama_intern_2', frame_excluded: false }),
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_3',
        frame_excluded: true,
        frame_exclusion_reason: 'source_content_mismatch',
      }),
    ]);
    const candidates = await listRescueCandidates({ packPath: pack, sectionId: '01-test' });
    const c3 = candidates.find(
      (c) => c.claim.claim_id === 'clm_f6ffc9e9d86f_ollama_intern_3',
    )!;
    expect(c3.eligibility.peer_count).toBe(2);
    expect(c3.eligibility.passed).toBe(true);
  });
});

describe('A-CLAIMS-002 — readClaims fails loud instead of silently dropping unparseable lines', () => {
  let pack: string;
  beforeEach(() => {
    pack = mkdtempSync(join(tmpdir(), 'claims-readclaims-loud-'));
    mkdirSync(join(pack, 'sections', '01-test'), { recursive: true });
  });
  afterEach(() => rmSync(pack, { recursive: true, force: true }));

  const claimsPath = () => join(pack, 'sections', '01-test', 'claims.jsonl');

  it('bad-input half: a forward-incompatible/hand-edited line makes rescue throw with the line number; file untouched', async () => {
    const survivor1 = makeClaim({ claimId: 'clm_f6ffc9e9d86f_ollama_intern_1', frame_excluded: false });
    const survivor2 = makeClaim({ claimId: 'clm_f6ffc9e9d86f_ollama_intern_2', frame_excluded: false });
    const target = makeClaim({
      claimId: 'clm_f6ffc9e9d86f_ollama_intern_3',
      frame_excluded: true,
      frame_exclusion_reason: 'source_content_mismatch',
    });
    // Line 2 is a forward-incompatible record: valid JSON but fails ClaimSchema
    // (an unknown-shaped hand edit). Pre-fix this line would be silently
    // dropped, then the rescue rewrite would permanently destroy it.
    const forwardIncompatLine = JSON.stringify({
      claim_id: 'clm_f6ffc9e9d86f_future_1',
      some_future_only_field: true,
    });
    const body =
      [JSON.stringify(survivor1), forwardIncompatLine, JSON.stringify(survivor2), JSON.stringify(target)].join(
        '\n',
      ) + '\n';
    writeFileSync(claimsPath(), body, 'utf8');

    await expect(
      rescueClaimByOperator({
        packPath: pack,
        sectionId: '01-test',
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_3',
        rescueScope: 'scope',
        rescueReason: 'reason',
        rescueBoundary: 'boundary',
        operator: 'test-operator',
      }),
    ).rejects.toThrow(/line 2/);

    // The file must be byte-for-byte untouched (no destructive rewrite ran).
    expect(readFileSync(claimsPath(), 'utf8')).toBe(body);
  });

  it('good-input half: a fully-parseable file lets the operator rescue succeed', async () => {
    const claims = [
      makeClaim({ claimId: 'clm_f6ffc9e9d86f_ollama_intern_1', frame_excluded: false }),
      makeClaim({ claimId: 'clm_f6ffc9e9d86f_ollama_intern_2', frame_excluded: false }),
      makeClaim({
        claimId: 'clm_f6ffc9e9d86f_ollama_intern_3',
        frame_excluded: true,
        frame_exclusion_reason: 'source_content_mismatch',
      }),
    ];
    writeFileSync(
      claimsPath(),
      claims.map((c) => JSON.stringify(c)).join('\n') + '\n',
      'utf8',
    );
    const outcome = await rescueClaimByOperator({
      packPath: pack,
      sectionId: '01-test',
      claimId: 'clm_f6ffc9e9d86f_ollama_intern_3',
      rescueScope: 'scope',
      rescueReason: 'reason',
      rescueBoundary: 'boundary',
      operator: 'test-operator',
      now: '2026-05-16T03:00:00.000Z',
    });
    expect(outcome.kind).toBe('rescued');
    const rewritten = readFileSync(claimsPath(), 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => ClaimSchema.parse(JSON.parse(l)));
    expect(rewritten).toHaveLength(3);
    expect(
      rewritten.find((c) => c.claim_id === 'clm_f6ffc9e9d86f_ollama_intern_3')!.frame_excluded,
    ).toBe(false);
  });
});
