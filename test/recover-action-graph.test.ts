/**
 * v0.9 Slice 3 — action graph layer tests.
 *
 * For each failure shape, assert:
 *   - The top-ranked action (rank 1) is the expected one.
 *   - The expected forbidden actions are present with non-empty why_forbidden.
 *   - The pack-law anchors hold:
 *       - accepted_claim_floor       → apply_waiver forbidden
 *       - prose_error_no_answer_cluster → rerun_stage forbidden
 *
 * Also tests operatorTemptingForbiddenActions for the verifier-rule-3 path.
 */
import { describe, it, expect } from 'vitest';

import { buildActionGraph, operatorTemptingForbiddenActions } from '../src/recover/action-graph.js';
import type { FailureShape, RecoveryActionId, SectionDiagnosis } from '../src/recover/types.js';

function diag(failure_shape: FailureShape, overrides: Partial<SectionDiagnosis> = {}): SectionDiagnosis {
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

describe('buildActionGraph — top-ranked allowed action per failure shape', () => {
  const cases: Array<{
    shape: FailureShape;
    expectedTop: RecoveryActionId;
  }> = [
    { shape: 'accepted_claim_floor', expectedTop: 'add_on_topic_sources' },
    { shape: 'min_independent_publishers', expectedTop: 'add_on_topic_sources' },
    { shape: 'primary_sources_required', expectedTop: 'add_on_topic_sources' },
    { shape: 'high_frame_excluded_rate', expectedTop: 'narrow_section_purpose' },
    { shape: 'prose_error_no_answer_cluster', expectedTop: 'narrow_section_purpose' },
    { shape: 'prose_error_cross_section_missing', expectedTop: 'rerun_stage' },
    { shape: 'unrun', expectedTop: 'rerun_stage' },
    { shape: 'source_card_classification_gap', expectedTop: 'apply_source_card_override' },
    { shape: 'reviewer_needs_human_review', expectedTop: 'defer_to_human_review' },
  ];

  for (const c of cases) {
    it(`${c.shape} → top action is ${c.expectedTop}`, () => {
      const graph = buildActionGraph(diag(c.shape));
      const top = graph.allowed_actions.find((a) => a.rank === 1);
      expect(top).toBeTruthy();
      expect(top!.action_id).toBe(c.expectedTop);
    });
  }
});

describe('buildActionGraph — pack-law forbiddings', () => {
  it('accepted_claim_floor permanently forbids apply_waiver', () => {
    const graph = buildActionGraph(diag('accepted_claim_floor'));
    const waiver = graph.forbidden_actions.find((f) => f.action_id === 'apply_waiver');
    expect(waiver).toBeTruthy();
    expect(waiver!.why_forbidden).toContain('unwaiveable');
    expect(waiver!.why_forbidden.length).toBeGreaterThan(20);
  });

  it('high_frame_excluded_rate permanently forbids apply_waiver', () => {
    const graph = buildActionGraph(diag('high_frame_excluded_rate'));
    expect(graph.forbidden_actions.some((f) => f.action_id === 'apply_waiver')).toBe(true);
  });

  it('prose_error_no_answer_cluster permanently forbids rerun_stage', () => {
    const graph = buildActionGraph(diag('prose_error_no_answer_cluster'));
    const rerun = graph.forbidden_actions.find((f) => f.action_id === 'rerun_stage');
    expect(rerun).toBeTruthy();
    expect(rerun!.why_forbidden).toContain('gate');
  });

  it('reviewer_needs_human_review forbids rerun_stage (won\'t fix itself)', () => {
    const graph = buildActionGraph(diag('reviewer_needs_human_review'));
    expect(graph.forbidden_actions.some((f) => f.action_id === 'rerun_stage')).toBe(true);
  });

  it('source_card_classification_gap forbids apply_waiver (correctable, not waiveable)', () => {
    const graph = buildActionGraph(diag('source_card_classification_gap'));
    expect(graph.forbidden_actions.some((f) => f.action_id === 'apply_waiver')).toBe(true);
  });

  it('min_independent_publishers does NOT permanently forbid any action (waiveable shape)', () => {
    const graph = buildActionGraph(diag('min_independent_publishers'));
    expect(graph.forbidden_actions).toHaveLength(0);
  });

  it('primary_sources_required does NOT permanently forbid any action (waiveable shape)', () => {
    const graph = buildActionGraph(diag('primary_sources_required'));
    expect(graph.forbidden_actions).toHaveLength(0);
  });
});

describe('buildActionGraph — allowed actions are deterministic + ranked', () => {
  it('ranks increase monotonically from 1', () => {
    for (const shape of ['accepted_claim_floor', 'min_independent_publishers', 'primary_sources_required'] as const) {
      const graph = buildActionGraph(diag(shape));
      for (let i = 0; i < graph.allowed_actions.length; i++) {
        expect(graph.allowed_actions[i]!.rank).toBe(i + 1);
      }
    }
  });

  it('command_hint is always present + non-empty', () => {
    const graph = buildActionGraph(diag('accepted_claim_floor'));
    for (const a of graph.allowed_actions) {
      expect(a.command_hint.trim().length).toBeGreaterThan(0);
    }
  });

  it('forbidden_actions are sorted alphabetically by action_id', () => {
    // Construct a synthetic diagnosis where multiple actions would be
    // forbidden — accepted_claim_floor only has apply_waiver, so use a shape
    // that has multiple. None of the current 9 shapes have multiple
    // forbiddings, so this test asserts the sort is stable for the single-
    // entry case; if we add a multi-forbidden shape later, the sort
    // contract should still hold.
    const graph = buildActionGraph(diag('accepted_claim_floor'));
    const ids = graph.forbidden_actions.map((f) => f.action_id);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
  });
});

describe('operatorTemptingForbiddenActions', () => {
  it('returns apply_waiver for accepted_claim_floor', () => {
    expect(operatorTemptingForbiddenActions('accepted_claim_floor')).toEqual(['apply_waiver']);
  });

  it('returns apply_waiver for high_frame_excluded_rate', () => {
    expect(operatorTemptingForbiddenActions('high_frame_excluded_rate')).toEqual(['apply_waiver']);
  });

  it('returns rerun_stage for prose_error_no_answer_cluster', () => {
    expect(operatorTemptingForbiddenActions('prose_error_no_answer_cluster')).toEqual(['rerun_stage']);
  });

  it('returns rerun_stage for reviewer_needs_human_review', () => {
    expect(operatorTemptingForbiddenActions('reviewer_needs_human_review')).toEqual(['rerun_stage']);
  });

  it('returns empty list for waiveable shapes (no tempting forbidden actions)', () => {
    expect(operatorTemptingForbiddenActions('min_independent_publishers')).toEqual([]);
    expect(operatorTemptingForbiddenActions('primary_sources_required')).toEqual([]);
  });
});
