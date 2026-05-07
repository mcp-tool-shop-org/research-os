import { describe, it, expect } from 'vitest';
import { renderCoworkMaster } from '../src/cowork/markdown.js';
import { CoworkHandoffPayloadSchema } from '../src/cowork/schema.js';

function basePayload(overrides: Partial<Parameters<typeof CoworkHandoffPayloadSchema.parse>[0]> = {}) {
  return CoworkHandoffPayloadSchema.parse({
    pack_id: 'abcdef012345',
    pack_topic: 'Test pack topic that is long enough',
    generated_at: '2026-05-06T22:00:00.000Z',
    mode: 'repair_required',
    synthesis_allowed: false,
    summary: 'mock summary',
    sections: [
      {
        section_id: '01-test',
        purpose: 'p',
        status: 'draft',
        has_gate_run: true,
        has_review_run: true,
        gate_verdict: 'blocked',
        synthesis_eligible: false,
        accepted_claim_ids: [],
        repair_claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1'],
        rejected_claim_ids: [],
        candidate_claims_total: 1,
        unresolved_contradiction_ids: [],
        blocking_reasons: ['source_floor.min_sources: too few'],
        blocking_contradictions_unresolved: 0,
      },
    ],
    accepted_claim_ids: [],
    repair_claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1'],
    blocked_claim_ids: [],
    unresolved_contradiction_ids: [],
    waivers: [],
    gate_verdicts: [{ section_id: '01-test', verdict: 'blocked', synthesis_eligible: false }],
    review_decisions: [{ section_id: '01-test', decision: 'needs_source_repair', count: 1 }],
    recommended_next_actions: ['Run `research-os gather 01-test --url ...`'],
    allowed_write_paths: ['handoffs/cowork-options.md', 'sections/<id>/open_questions.md'],
    forbidden_actions: ['Mutate sections/<id>/claims.jsonl directly'],
    index_status: 'present',
    warnings: [],
    ...overrides,
  });
}

describe('renderCoworkMaster', () => {
  it('emits the mode banner and synthesis-allowed line', () => {
    const md = renderCoworkMaster(basePayload());
    expect(md).toContain('# Cowork Handoff: Test pack topic');
    expect(md).toContain('repair_required');
    expect(md).toContain('Synthesis allowed:** no');
  });

  it('renders the forbidden_actions block in every mode', () => {
    for (const mode of ['repair_required', 'synthesis_ready', 'human_review_required'] as const) {
      const md = renderCoworkMaster(basePayload({ mode, synthesis_allowed: mode === 'synthesis_ready' }));
      expect(md).toContain('What you may not do (always');
      expect(md).toContain('Mutate sections/<id>/claims.jsonl directly');
    }
  });

  it('says "synthesis is not allowed" when no claims are accepted', () => {
    const md = renderCoworkMaster(basePayload());
    expect(md).toContain('No claims have been accepted for synthesis');
  });

  it('lists accepted claim ids when in synthesis_ready mode', () => {
    const md = renderCoworkMaster(
      basePayload({
        mode: 'synthesis_ready',
        synthesis_allowed: true,
        accepted_claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1'],
        sections: [
          {
            section_id: '01-test',
            purpose: 'p',
            status: 'gated',
            has_gate_run: true,
            has_review_run: true,
            gate_verdict: 'pass',
            synthesis_eligible: true,
            accepted_claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1'],
            repair_claim_ids: [],
            rejected_claim_ids: [],
            candidate_claims_total: 1,
            unresolved_contradiction_ids: [],
            blocking_reasons: [],
            blocking_contradictions_unresolved: 0,
          },
        ],
      }),
    );
    expect(md).toContain('clm_aaaaaaaaaaaa_heuristic_1');
    expect(md).toContain('Synthesis allowed:** yes');
  });

  it('flags invalid waivers in markdown rendering', () => {
    const md = renderCoworkMaster(
      basePayload({
        waivers: [
          {
            scope: 'pack',
            family: 'source_floor',
            reason: '',
            compensating_controls: [],
            applied_to: 'primary_sources_required',
          },
        ],
      }),
    );
    expect(md).toContain('INVALID');
  });

  it('renders the index status', () => {
    const md = renderCoworkMaster(basePayload({ index_status: 'missing' }));
    expect(md).toContain('Index:** missing');
  });

  it('includes useful index query examples', () => {
    const md = renderCoworkMaster(basePayload());
    expect(md).toContain('research-os query "source_floor"');
    expect(md).toContain('research-os query "source_cluster_monopoly"');
  });

  it('includes the do-not-introduce-unsupported-claims final instruction', () => {
    const md = renderCoworkMaster(basePayload());
    expect(md).toContain('Do not introduce unsupported claims');
    expect(md).toContain('Preserve unresolved contradictions');
    expect(md).toContain('Do not widen scope');
  });
});
