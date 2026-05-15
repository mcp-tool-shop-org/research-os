/**
 * v0.10 Slice 2 — R-001 advisor integration.
 *
 * R-001 adds a new recovery action `repair_claim_scope` and wires it into the
 * action graph for the `accepted_claim_floor` failure shape WHEN the diagnosis
 * shows ≥3 claims in needs_scope_repair. The smallest reversible move at that
 * point is not "add new sources" — it's repairing the scope on claims that
 * were already extracted but parked/needs-repair because scope was null.
 *
 * Acceptance criteria from operator-aloneness DST v0.1:
 *   - When gate is blocked on accepted_claim_floor AND ≥3 claims are in
 *     needs_scope_repair, the action graph's top-ranked action is
 *     repair_claim_scope (NOT add_on_topic_sources, NOT apply_source_card_override).
 *   - When gate is blocked on accepted_claim_floor AND 0 claims are in
 *     needs_scope_repair (claim floor is low for a different reason), the
 *     top-ranked action falls back to add_on_topic_sources — repair_claim_scope
 *     does not appear when there is no scope to repair.
 *   - apply_waiver remains permanently forbidden on accepted_claim_floor
 *     (R-001 does not alter pack law).
 */
import { describe, it, expect } from 'vitest';

import { buildActionGraph } from '../src/recover/action-graph.js';
import type { FailureShape, SectionDiagnosis } from '../src/recover/types.js';

function diag(
  failure_shape: FailureShape,
  overrides: Partial<SectionDiagnosis> = {},
): SectionDiagnosis {
  return {
    section_id: 'fixture',
    section_purpose: 'fixture purpose',
    failure_shape,
    blocking: true,
    waiveable: false,
    stage: 'gate',
    evidence_state: {
      extracted_claims: 0,
      accepted_claims: 0,
      frame_excluded_claims: 0,
      needs_repair_claims: 0,
      sources: 0,
      distinct_publishers: 0,
      distinct_primary_publishers: 0,
    },
    detail: 'fixture detail',
    ...overrides,
  };
}

describe('R-001 — repair_claim_scope action surfaces when needs_repair_claims >= 3', () => {
  it('accepted_claim_floor + 6 needs_repair_claims → top action is repair_claim_scope', () => {
    const d = diag('accepted_claim_floor', {
      evidence_state: {
        extracted_claims: 8,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 6,
        sources: 3,
        distinct_publishers: 2,
        distinct_primary_publishers: 1,
      },
    });
    const ag = buildActionGraph(d);
    expect(ag.allowed_actions[0]?.action_id).toBe('repair_claim_scope');
    expect(ag.allowed_actions[0]?.rank).toBe(1);
    // Operator-tempting alternatives should still appear lower in the ranked list.
    expect(ag.allowed_actions.map((a) => a.action_id)).toContain('add_on_topic_sources');
  });

  it('accepted_claim_floor + 3 needs_repair_claims → top action is repair_claim_scope (threshold inclusive)', () => {
    const d = diag('accepted_claim_floor', {
      evidence_state: {
        extracted_claims: 5,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 3,
        sources: 2,
        distinct_publishers: 2,
        distinct_primary_publishers: 1,
      },
    });
    const ag = buildActionGraph(d);
    expect(ag.allowed_actions[0]?.action_id).toBe('repair_claim_scope');
  });

  it('accepted_claim_floor + 0 needs_repair_claims → top action is add_on_topic_sources (unchanged behavior)', () => {
    const d = diag('accepted_claim_floor', {
      evidence_state: {
        extracted_claims: 0,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 0,
        sources: 0,
        distinct_publishers: 0,
        distinct_primary_publishers: 0,
      },
    });
    const ag = buildActionGraph(d);
    expect(ag.allowed_actions[0]?.action_id).toBe('add_on_topic_sources');
    expect(ag.allowed_actions.map((a) => a.action_id)).not.toContain('repair_claim_scope');
  });

  it('accepted_claim_floor + 2 needs_repair_claims (below threshold) → top action is add_on_topic_sources', () => {
    // The N=3 threshold is the minimum number of accepted claims the gate
    // requires; if fewer than that are in scope-repair, repairing them alone
    // can't get the section past the floor. Recovery should suggest adding
    // sources instead.
    const d = diag('accepted_claim_floor', {
      evidence_state: {
        extracted_claims: 2,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 2,
        sources: 1,
        distinct_publishers: 1,
        distinct_primary_publishers: 1,
      },
    });
    const ag = buildActionGraph(d);
    expect(ag.allowed_actions[0]?.action_id).toBe('add_on_topic_sources');
    expect(ag.allowed_actions.map((a) => a.action_id)).not.toContain('repair_claim_scope');
  });

  it('repair_claim_scope action carries a research-os claim repair-scope command_hint', () => {
    const d = diag('accepted_claim_floor', {
      section_id: '03-deliberately-blocked',
      evidence_state: {
        extracted_claims: 8,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 6,
        sources: 3,
        distinct_publishers: 2,
        distinct_primary_publishers: 1,
      },
    });
    const ag = buildActionGraph(d);
    const top = ag.allowed_actions[0];
    expect(top?.action_id).toBe('repair_claim_scope');
    expect(top?.command_hint).toContain('research-os claim repair-scope');
    expect(top?.command_hint).toContain('03-deliberately-blocked');
  });

  it('repair_claim_scope why text references the count of repairable claims', () => {
    const d = diag('accepted_claim_floor', {
      evidence_state: {
        extracted_claims: 8,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 6,
        sources: 3,
        distinct_publishers: 2,
        distinct_primary_publishers: 1,
      },
    });
    const ag = buildActionGraph(d);
    const top = ag.allowed_actions[0];
    expect(top?.why).toMatch(/6/);
    // High reversibility — the repair trail is append-only and the prior
    // scope (null) is preserved as audit history.
    expect(top?.reversibility).toBe('high');
  });

  it('accepted_claim_floor with repair_claim_scope still forbids apply_waiver (pack law unchanged)', () => {
    const d = diag('accepted_claim_floor', {
      evidence_state: {
        extracted_claims: 8,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 6,
        sources: 3,
        distinct_publishers: 2,
        distinct_primary_publishers: 1,
      },
    });
    const ag = buildActionGraph(d);
    expect(ag.forbidden_actions.map((f) => f.action_id)).toContain('apply_waiver');
  });
});
