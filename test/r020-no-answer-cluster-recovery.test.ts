// R-020 synthetic acceptance tests — no_answer_cluster recovery surface.
//
// R-020 ships D-half only. A-half (planner prompt tune) was attempted in two
// iterations on `v0.13-slice2-r020` and reverted on operator authorization
// after live replay surfaced a defense-floor regression: the tuned prompt
// drove the LLM to fabricate null-effect answers from positive-effect claims
// on an adversarial section purpose. Verifier blessed the inverted negation
// as `faithful` — silent-wrong synthesis. The doctrine that earned this
// fallback: "Live replay test passing on structural success is necessary but
// not sufficient for patch acceptance. For any prompt-tune patch claiming
// to change LLM semantic output, manual inspection of synthesized content
// against input claims is part of the live-replay acceptance gate."
// (memory/feedback_synthetic_vs_live_acceptance.md, R-020 corollary.)
//
// These are synthetic mock-client tests; they validate the D-half data-flow
// wiring (recovery_actions[] structured field on ProseNoAnswerClusterError +
// markdown render + action-graph helper). The live replay test
// (test/r020-live-replay.test.ts) exercises the end-to-end behavior against
// the actual MCP + Ollama environment per LAW 4 of the R-020 protocol.

import { describe, it, expect } from 'vitest';

import { renderNoAnswerClusterMarker } from '../src/synth/prose/markdown.js';
import type {
  ProseNoAnswerClusterError,
  NoAnswerClusterRecoveryAction,
} from '../src/synth/prose/types.js';
import { getNoAnswerClusterRecoveryActions } from '../src/recover/action-graph.js';
import { buildActionGraph } from '../src/recover/action-graph.js';
import type { SectionDiagnosis } from '../src/recover/types.js';

// ── D-half: recovery_actions[] surface + markdown render + action-graph helper

describe('R-020 D — getNoAnswerClusterRecoveryActions helper', () => {
  it('returns exactly 2 actions matching the action-graph allowed_actions for prose_error_no_answer_cluster', () => {
    const actions = getNoAnswerClusterRecoveryActions('01-test-section');
    expect(actions).toHaveLength(2);
    expect(actions[0]!.action_id).toBe('narrow_section_purpose');
    expect(actions[1]!.action_id).toBe('add_on_topic_sources');
  });

  it('every action has non-empty why + command_hint fields', () => {
    const actions = getNoAnswerClusterRecoveryActions('01-test-section');
    for (const a of actions) {
      expect(a.action_id).toBeTruthy();
      expect(a.why.length).toBeGreaterThan(20);
      expect(a.command_hint.length).toBeGreaterThan(10);
    }
  });

  it('command_hint embeds the section_id passed in', () => {
    const actions = getNoAnswerClusterRecoveryActions('01-my-special-section');
    const allHints = actions.map((a) => a.command_hint).join(' | ');
    expect(allHints).toContain('01-my-special-section');
  });

  it('command_hint values match the existing commandHint() shape for the synthesis stage', () => {
    const actions = getNoAnswerClusterRecoveryActions('01-test-section');
    const narrowAction = actions.find((a) => a.action_id === 'narrow_section_purpose');
    const addSourcesAction = actions.find((a) => a.action_id === 'add_on_topic_sources');
    expect(narrowAction?.command_hint).toContain('research.yaml');
    expect(narrowAction?.command_hint).toContain('01-test-section');
    expect(addSourcesAction?.command_hint).toContain('research-os gather');
    expect(addSourcesAction?.command_hint).toContain('01-test-section');
  });
});

describe('R-020 D — action-graph and helper share single source of truth', () => {
  // After R-020's refactor, the buildActionGraph case for
  // prose_error_no_answer_cluster spreads PROSE_NO_ANSWER_CLUSTER_ACTIONS.
  // Verify both paths emit the same (action_id, why) pairs so they cannot
  // drift apart in future commits.
  const diagnosis: SectionDiagnosis = {
    section_id: '01-test-section',
    section_purpose: 'Test section purpose',
    failure_shape: 'prose_error_no_answer_cluster',
    blocking: true,
    waiveable: false,
    stage: 'synthesis',
    evidence_state: {
      extracted_claims: 12,
      accepted_claims: 12,
      frame_excluded_claims: 0,
      needs_repair_claims: 0,
      sources: 4,
      distinct_publishers: 4,
      distinct_primary_publishers: 2,
    },
    detail: 'Synthesis returned no_answer_cluster on a 12-claim section.',
  };

  it('buildActionGraph allowed_actions[*].action_id and helper return same set + order', () => {
    const graph = buildActionGraph(diagnosis);
    const helperActions = getNoAnswerClusterRecoveryActions('01-test-section');
    const graphIds = graph.allowed_actions.map((a) => a.action_id);
    const helperIds = helperActions.map((a) => a.action_id);
    expect(graphIds).toEqual(helperIds);
  });

  it('buildActionGraph allowed_actions[*].why matches helper why text byte-for-byte', () => {
    const graph = buildActionGraph(diagnosis);
    const helperActions = getNoAnswerClusterRecoveryActions('01-test-section');
    for (let i = 0; i < graph.allowed_actions.length; i++) {
      expect(graph.allowed_actions[i]!.why).toBe(helperActions[i]!.why);
    }
  });

  it('rerun_stage remains forbidden for prose_error_no_answer_cluster (refactor preserves pack law)', () => {
    const graph = buildActionGraph(diagnosis);
    const forbidden = graph.forbidden_actions.find((f) => f.action_id === 'rerun_stage');
    expect(forbidden).toBeDefined();
    expect(forbidden?.why_forbidden).toContain('gate already passed');
  });
});

describe('R-020 D — renderNoAnswerClusterMarker emits Recovery actions block', () => {
  function makeError(
    recoveryActions?: NoAnswerClusterRecoveryAction[],
  ): ProseNoAnswerClusterError {
    const err: ProseNoAnswerClusterError = {
      code: 'no_answer_cluster',
      message: 'No accepted claim was assigned the answer role.',
      accepted_claim_count: 12,
      unused_count: 2,
      section_purpose: 'Test section purpose',
      unused_claims: [
        {
          claim_id: 'clm_unused_1',
          source_card_ids: ['src_1'],
          role_rationale: 'Off-topic for the section question.',
        },
      ],
    };
    if (recoveryActions !== undefined) {
      err.recovery_actions = recoveryActions;
    }
    return err;
  }

  it('renders a "## Recovery actions" block when recovery_actions is populated', () => {
    const err = makeError(getNoAnswerClusterRecoveryActions('01-test-section'));
    const md = renderNoAnswerClusterMarker(err, 'Test section purpose');
    expect(md).toContain('## Recovery actions');
    expect(md).toContain('narrow_section_purpose');
    expect(md).toContain('add_on_topic_sources');
  });

  it('embeds each action_id, why text, AND command_hint in the rendered block', () => {
    const actions = getNoAnswerClusterRecoveryActions('01-special-section');
    const err = makeError(actions);
    const md = renderNoAnswerClusterMarker(err, 'Test section purpose');
    for (const a of actions) {
      expect(md).toContain(a.action_id);
      expect(md).toContain(a.why);
      expect(md).toContain(a.command_hint);
    }
    // Section id propagation
    expect(md).toContain('01-special-section');
  });

  it('renders body text pointing operators to the Recovery actions block', () => {
    const err = makeError(getNoAnswerClusterRecoveryActions('01-test-section'));
    const md = renderNoAnswerClusterMarker(err, 'Test section purpose');
    expect(md).toContain('Recovery actions');
    // The v3 gestural "consider sourcing on-topic evidence" wording is gone.
    expect(md).not.toContain('consider sourcing on-topic evidence');
  });

  it('omits the Recovery actions block when recovery_actions is absent (bare-error path)', () => {
    const err = makeError(undefined);
    const md = renderNoAnswerClusterMarker(err, 'Test section purpose');
    expect(md).not.toContain('## Recovery actions');
    // But the unused-claims block still renders.
    expect(md).toContain('## Unused accepted claims');
  });

  it('still renders unused claims after the Recovery actions block', () => {
    const err = makeError(getNoAnswerClusterRecoveryActions('01-test-section'));
    const md = renderNoAnswerClusterMarker(err, 'Test section purpose');
    expect(md).toContain('## Unused accepted claims');
    expect(md).toContain('clm_unused_1');
    // Recovery block appears BEFORE the unused-claims block.
    expect(md.indexOf('## Recovery actions')).toBeLessThan(md.indexOf('## Unused accepted claims'));
  });

  it('emits the command_hint inside a fenced code block (for operator copy/paste)', () => {
    const err = makeError(getNoAnswerClusterRecoveryActions('01-test-section'));
    const md = renderNoAnswerClusterMarker(err, 'Test section purpose');
    // Each command_hint is fenced with triple-backticks.
    const matches = md.match(/```\n.*?\n```/gs) ?? [];
    // At minimum one fenced block per recovery action.
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe('R-020 — invariants preserved (defense-floor cross-check)', () => {
  it('R-019 tier_budget_ms_override remains threaded through buildPlannerToolArgs (not regressed)', async () => {
    // Lightweight regression: import buildPlannerToolArgs and confirm the
    // override field still serializes. Full R-019 wire test is in
    // test/r019-tier-budget-override.test.ts.
    const { buildPlannerToolArgs } = await import('../src/synth/prose/planner.js');
    const args = buildPlannerToolArgs(
      'Test section purpose',
      [
        {
          claim_id: 'clm_demo',
          asserts: 'demo',
          scope: null,
          not: null,
          source_ids: ['src_demo'],
          confidence: 'medium',
        },
      ],
      undefined,
      45000,
    );
    expect(args.tier_budget_ms_override).toBe(45000);
  });

  it('R-018 wrapClientWithTimeout still exports at its named entry point', async () => {
    const types = await import('../src/synth/prose/types.js');
    expect(typeof types.wrapClientWithTimeout).toBe('function');
    expect(types.DEFAULT_PLANNER_TIMEOUT_MS).toBe(15000);
  });
});
