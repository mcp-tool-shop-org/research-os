import { describe, it, expect } from 'vitest';

import { derive } from '../../src/cowork/derive.js';
import { deriveCrossSectionMap } from '../../src/synth/derive.js';
import { getEffectiveDecisionMap } from '../../src/closure-ledger/effective-accepted.js';
import type { ClaimReview } from '../../src/review/schema.js';
import type { Claim } from '../../src/claims/schema.js';
import type { ResearchYaml } from '../../src/intake/schema.js';
import type { CoworkHandoffPayload } from '../../src/cowork/types.js';

const TS = '2026-05-06T22:00:01.000Z';
const CID = 'clm_aaaaaaaaaaaa_heuristic_1';

function review(decision: ClaimReview['decision']): ClaimReview {
  return {
    claim_id: CID,
    decision,
    reason: 'r',
    finding_ids: [],
    reviewer: 'heuristic',
    review_method: 'heuristic_field_and_grounding_checks',
    created_at: TS,
  };
}

function claim(): Claim {
  return {
    claim_id: CID,
    section_id: '01-test',
    source_ids: ['src_aaaaaaaaaaaa'],
    source_hashes: ['a'.repeat(64)],
    asserts: 'something',
    scope: 'narrow',
    not: 'broad',
    evidence_excerpt: 'literal',
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
  } as Claim;
}

const research: ResearchYaml = {
  topic: 't',
  decision: 'd',
  created_at: '2026-05-06T22:00:00.000Z',
  frozen_at: null,
  sections: [{ id: '01-test', purpose: 'probe', status: 'gated' }],
  primary_source_waiver: { status: 'not_requested' },
} as unknown as ResearchYaml;

describe('A-COWORK-001: equal-created_at tie direction is last-appended-wins everywhere', () => {
  // The canonical join: last appended wins on an equal-timestamp tie.
  it('getEffectiveDecisionMap keeps the LAST-appended row on a created_at tie', () => {
    const map = getEffectiveDecisionMap([review('accepted_for_synthesis'), review('rejected')]);
    expect(map.get(CID)?.decision).toBe('rejected');
    // And the reverse order resolves the other way — proving order, not value.
    const map2 = getEffectiveDecisionMap([review('rejected'), review('accepted_for_synthesis')]);
    expect(map2.get(CID)?.decision).toBe('accepted_for_synthesis');
  });

  // cowork/derive.ts call site: a same-ms corrective decision (last appended)
  // must win. First-appended rejected -> last-appended accepted means the
  // claim is ACCEPTED, not rejected.
  it('cowork derive: a same-ms corrective accept (last) overrides an earlier reject (first)', () => {
    const out = derive({
      research,
      perSection: new Map([
        [
          '01-test',
          {
            gate: null,
            candidateClaims: [claim()],
            // first reject, then accept at the SAME created_at
            claimReviews: [review('rejected'), review('accepted_for_synthesis')],
            contradictions: [],
          },
        ],
      ]),
      indexStatus: 'missing',
      generatedAt: TS,
      warnings: [],
    });
    expect(out.accepted_claim_ids).toContain(CID);
    expect(out.blocked_claim_ids).not.toContain(CID);
  });

  // synth/derive.ts call site (deriveCrossSectionMap.forbidden_inputs): the
  // resolved decision for a non-accepted claim must reflect the LAST-appended
  // row. First accept, then reject at same ms -> forbidden decision = rejected.
  it('synth deriveCrossSectionMap: forbidden decision reflects the LAST-appended row on a tie', () => {
    const handoff: CoworkHandoffPayload = {
      pack_id: 'p',
      pack_topic: 't',
      generated_at: TS,
      mode: 'repair_required',
      synthesis_allowed: false,
      summary: '',
      sections: [],
      accepted_claim_ids: [], // claim is NOT accepted (last decision is reject)
      repair_claim_ids: [],
      blocked_claim_ids: [],
      dispositioned_claim_ids: [],
      unresolved_contradiction_ids: [],
      waivers: [],
      gate_verdicts: [],
      review_decisions: [],
      recommended_next_actions: [],
      allowed_write_paths: [],
      forbidden_actions: [],
      index_status: 'missing',
      warnings: [],
    };
    const map = deriveCrossSectionMap({
      research,
      handoff,
      claimsBySection: new Map([['01-test', [claim()]]]),
      // first accept, then reject at the SAME created_at
      reviewsBySection: new Map([['01-test', [review('accepted_for_synthesis'), review('rejected')]]]),
      contradictionsBySection: new Map(),
      sources: [],
      generatedAt: TS,
    });
    const forbidden = map.forbidden_inputs.find((f) => f.claim_id === CID);
    expect(forbidden).toBeDefined();
    expect(forbidden?.decision).toBe('rejected');
  });
});
