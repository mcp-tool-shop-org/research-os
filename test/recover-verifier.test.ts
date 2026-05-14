/**
 * v0.9 Slice 3 — verifier + retry + fallback + advisor-input tests.
 *
 * Covers all 7 verifier rules with explicit unit tests + the retry path +
 * the deterministic fallback path.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { verifyRecoveryAdvice } from '../src/recover/verifier.js';
import { buildActionGraph } from '../src/recover/action-graph.js';
import { deterministicFallbackAdvice } from '../src/recover/fallback.js';
import { buildAdvisorToolArgs } from '../src/recover/advisor.js';
import { renderRecoveryAdvisorPrompt } from '../src/recover/prompt.js';
import type {
  LawfulActionGraph,
  RecoveryAdvice,
  RecoveryActionId,
  SectionDiagnosis,
} from '../src/recover/types.js';

function diag(): SectionDiagnosis {
  return {
    section_id: 'fixture',
    section_purpose: 'fixture purpose',
    failure_shape: 'accepted_claim_floor',
    blocking: true,
    waiveable: false,
    stage: 'gate',
    evidence_state: {
      extracted_claims: 0,
      accepted_claims: 0,
      frame_excluded_claims: 0,
      needs_repair_claims: 0,
      sources: 2,
      distinct_publishers: 1,
      distinct_primary_publishers: 0,
    },
    detail: 'min_accepted_claims: 0/3',
  };
}

function graph(): LawfulActionGraph {
  return buildActionGraph(diag());
}

function compliantAdvice(): RecoveryAdvice {
  return {
    section_id: 'fixture',
    failure_summary: 'accepted_claim_floor: 0 accepted claims.',
    recommended_action: {
      action_id: 'add_on_topic_sources',
      rank_taken: 1,
      contrastive_framing:
        'You might think this needs a waiver. It does not — accepted_claim_floor is unwaiveable. The smallest reversible move is to add 2-3 on-topic sources.',
      why_smallest_reversible: 'Adding sources is high-reversibility — operators can remove them or rerun.',
      command_hint: 'research-os gather fixture --url <URL>',
      expected_outcome: 'At least 3 accepted claims survive review and gate.',
    },
    also_consider: [
      {
        action_id: 'narrow_section_purpose',
        when_to_prefer: 'If the existing extracted claims are on-topic for the sources but not the purpose.',
      },
    ],
    do_not: [
      {
        action_id: 'apply_waiver',
        why_not: 'accepted_claim_floor is unwaiveable; waivers cannot create evidence.',
      },
    ],
    system_cannot_see: ['Whether the operator has uncommitted research.yaml edits.'],
    confidence: 'high',
  };
}

// ── Rule 1 ─────────────────────────────────────────────────────────────────

describe('verifyRecoveryAdvice — Rule 1: recommended_action_not_allowed', () => {
  it('rejects when recommended_action.action_id is not in allowed_actions', () => {
    const advice = compliantAdvice();
    // Force an action_id that is not in the graph for this shape.
    // For accepted_claim_floor, allowed = [add_on_topic_sources, narrow_section_purpose].
    advice.recommended_action.action_id = 'apply_source_card_override' as RecoveryActionId;
    const result = verifyRecoveryAdvice({ advice, actionGraph: graph(), diagnosis: diag() });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe('recommended_action_not_allowed');
  });

  it('rejects when recommended_action.action_id is explicitly forbidden', () => {
    const advice = compliantAdvice();
    advice.recommended_action.action_id = 'apply_waiver';
    const result = verifyRecoveryAdvice({ advice, actionGraph: graph(), diagnosis: diag() });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe('recommended_action_not_allowed');
  });
});

// ── Rule 2 ─────────────────────────────────────────────────────────────────

describe('verifyRecoveryAdvice — Rule 2: also_consider_contains_forbidden', () => {
  it('rejects when also_consider includes a forbidden action_id', () => {
    const advice = compliantAdvice();
    advice.also_consider.push({
      action_id: 'apply_waiver',
      when_to_prefer: 'If you want to save time.',
    });
    const result = verifyRecoveryAdvice({ advice, actionGraph: graph(), diagnosis: diag() });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe('also_consider_contains_forbidden');
  });

  it('rejects when also_consider includes an action_id not in allowed_actions', () => {
    const advice = compliantAdvice();
    advice.also_consider.push({
      action_id: 'apply_source_card_override',
      when_to_prefer: 'arbitrary',
    });
    const result = verifyRecoveryAdvice({ advice, actionGraph: graph(), diagnosis: diag() });
    expect(result.valid).toBe(false);
  });
});

// ── Rule 3 ─────────────────────────────────────────────────────────────────

describe('verifyRecoveryAdvice — Rule 3: do_not_missing_tempting_forbidden', () => {
  it('rejects when do_not omits the operator-tempting apply_waiver for accepted_claim_floor', () => {
    const advice = compliantAdvice();
    advice.do_not = []; // strip the apply_waiver disclosure
    const result = verifyRecoveryAdvice({ advice, actionGraph: graph(), diagnosis: diag() });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe('do_not_missing_tempting_forbidden');
    expect(result.detail).toContain('apply_waiver');
  });
});

// ── Rule 4 ─────────────────────────────────────────────────────────────────

describe('verifyRecoveryAdvice — Rule 4: empty_contrastive_framing', () => {
  it('rejects when contrastive_framing is whitespace-only', () => {
    const advice = compliantAdvice();
    advice.recommended_action.contrastive_framing = '   ';
    const result = verifyRecoveryAdvice({ advice, actionGraph: graph(), diagnosis: diag() });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe('empty_contrastive_framing');
  });
});

// ── Rule 5 ─────────────────────────────────────────────────────────────────

describe('verifyRecoveryAdvice — Rule 5: empty_system_cannot_see', () => {
  it('rejects when system_cannot_see is empty after trimming', () => {
    const advice = compliantAdvice();
    advice.system_cannot_see = ['   ', '\t'];
    const result = verifyRecoveryAdvice({ advice, actionGraph: graph(), diagnosis: diag() });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe('empty_system_cannot_see');
  });
});

// ── Rule 6 ─────────────────────────────────────────────────────────────────

describe('verifyRecoveryAdvice — Rule 6: pack_readiness_claim', () => {
  for (const phrase of [
    'this pack is freezable',
    'pack is now publishable',
    'ready to freeze',
    'v1-ready',
    'the pack is ready',
  ]) {
    it(`rejects readiness claim: "${phrase}"`, () => {
      const advice = compliantAdvice();
      advice.failure_summary = `Some summary mentioning ${phrase} after the fix.`;
      const result = verifyRecoveryAdvice({ advice, actionGraph: graph(), diagnosis: diag() });
      expect(result.valid).toBe(false);
      if (result.valid) return;
      expect(result.reason).toBe('pack_readiness_claim');
    });
  }
});

// ── Rule 7 ─────────────────────────────────────────────────────────────────

describe('verifyRecoveryAdvice — Rule 7: top_action_skipped_without_rationale', () => {
  it('passes when top-ranked action is also in also_consider', () => {
    const advice = compliantAdvice();
    // Pretend the recommended action is rank 2 and also_consider includes the top.
    advice.recommended_action.action_id = 'narrow_section_purpose';
    advice.recommended_action.rank_taken = 2;
    advice.also_consider = [
      {
        action_id: 'add_on_topic_sources',
        when_to_prefer: 'If sources are available.',
      },
    ];
    const result = verifyRecoveryAdvice({ advice, actionGraph: graph(), diagnosis: diag() });
    expect(result.valid).toBe(true);
  });

  it('passes when why_smallest_reversible explicitly justifies the skip', () => {
    const advice = compliantAdvice();
    advice.recommended_action.action_id = 'narrow_section_purpose';
    advice.recommended_action.rank_taken = 2;
    advice.recommended_action.why_smallest_reversible =
      'I am skipping add_on_topic_sources because the operator already exhausted source candidates per the system_cannot_see disclosure.';
    advice.also_consider = []; // top not in also_consider; rationale carries the load
    const result = verifyRecoveryAdvice({ advice, actionGraph: graph(), diagnosis: diag() });
    expect(result.valid).toBe(true);
  });
});

// ── Compliant advice passes ────────────────────────────────────────────────

describe('verifyRecoveryAdvice — compliant advice passes', () => {
  it('accepts a fully compliant advice object', () => {
    const result = verifyRecoveryAdvice({
      advice: compliantAdvice(),
      actionGraph: graph(),
      diagnosis: diag(),
    });
    expect(result.valid).toBe(true);
  });
});

// ── Deterministic fallback ─────────────────────────────────────────────────

describe('deterministicFallbackAdvice', () => {
  it('produces an advice object that passes the verifier', () => {
    const advice = deterministicFallbackAdvice({ diagnosis: diag(), actionGraph: graph() });
    const result = verifyRecoveryAdvice({ advice, actionGraph: graph(), diagnosis: diag() });
    expect(result.valid).toBe(true);
  });

  it('uses the top-ranked allowed action', () => {
    const g = graph();
    const advice = deterministicFallbackAdvice({ diagnosis: diag(), actionGraph: g });
    expect(advice.recommended_action.action_id).toBe(g.allowed_actions[0]!.action_id);
    expect(advice.recommended_action.rank_taken).toBe(1);
  });

  it('confidence is medium for AI-unavailable fallback', () => {
    const advice = deterministicFallbackAdvice({ diagnosis: diag(), actionGraph: graph() });
    expect(advice.confidence).toBe('medium');
  });

  it('do_not surfaces all forbidden actions', () => {
    const advice = deterministicFallbackAdvice({ diagnosis: diag(), actionGraph: graph() });
    expect(advice.do_not.length).toBe(graph().forbidden_actions.length);
    expect(advice.do_not.some((d) => d.action_id === 'apply_waiver')).toBe(true);
  });

  it('contrastive_framing names the fallback path explicitly', () => {
    const advice = deterministicFallbackAdvice({ diagnosis: diag(), actionGraph: graph() });
    expect(advice.recommended_action.contrastive_framing).toContain('AI recovery advisor was unavailable');
  });
});

// ── Advisor input contract ─────────────────────────────────────────────────

describe('buildAdvisorToolArgs / renderRecoveryAdvisorPrompt — advisor input contract', () => {
  it('rendered prompt contains diagnosis facts (counts, failure shape, stage)', () => {
    const prompt = renderRecoveryAdvisorPrompt({
      packTopic: 'fixture topic',
      packMode: 'repair_required',
      diagnosis: diag(),
      actionGraph: graph(),
      systemCannotSee: ['operator context A', 'operator context B'],
      rejectionAddendum: null,
    });
    expect(prompt).toContain('accepted_claim_floor');
    expect(prompt).toContain('fixture purpose');
    expect(prompt).toContain('accepted_claims:');
    expect(prompt).toContain('distinct_publishers:');
  });

  it('rendered prompt lists allowed actions ranked', () => {
    const prompt = renderRecoveryAdvisorPrompt({
      packTopic: 'fixture topic',
      packMode: 'repair_required',
      diagnosis: diag(),
      actionGraph: graph(),
      systemCannotSee: ['x'],
      rejectionAddendum: null,
    });
    expect(prompt).toContain('ALLOWED ACTIONS');
    expect(prompt).toContain('rank 1');
    expect(prompt).toContain('add_on_topic_sources');
  });

  it('rendered prompt lists forbidden actions for unwaiveable shapes', () => {
    const prompt = renderRecoveryAdvisorPrompt({
      packTopic: 'fixture topic',
      packMode: 'repair_required',
      diagnosis: diag(),
      actionGraph: graph(),
      systemCannotSee: ['x'],
      rejectionAddendum: null,
    });
    expect(prompt).toContain('FORBIDDEN ACTIONS');
    expect(prompt).toContain('apply_waiver');
    expect(prompt).toContain('unwaiveable');
  });

  it('rendered prompt includes rejection addendum on retry', () => {
    const prompt = renderRecoveryAdvisorPrompt({
      packTopic: 'fixture topic',
      packMode: 'repair_required',
      diagnosis: diag(),
      actionGraph: graph(),
      systemCannotSee: ['x'],
      rejectionAddendum: 'recommended_action_not_allowed: action_id "apply_waiver" is forbidden.',
    });
    expect(prompt).toContain('RETRY ADDENDUM');
    expect(prompt).toContain('recommended_action_not_allowed');
  });

  it('rendered prompt does NOT contain raw claim text or source bodies', () => {
    const prompt = renderRecoveryAdvisorPrompt({
      packTopic: 'fixture topic',
      packMode: 'repair_required',
      diagnosis: diag(),
      actionGraph: graph(),
      systemCannotSee: ['x'],
      rejectionAddendum: null,
    });
    // Only typed numeric facts + section_purpose appear. There's no field
    // for raw claim asserts, so this is a contract-level assertion.
    expect(prompt).not.toContain('asserts:');
    expect(prompt).not.toContain('evidence_excerpt');
  });
});

// ── ToolArgs builder ───────────────────────────────────────────────────────

describe('buildAdvisorToolArgs', () => {
  it('includes schema and hint', () => {
    const args = buildAdvisorToolArgs({
      packTopic: 't',
      packMode: 'repair_required',
      diagnosis: diag(),
      actionGraph: graph(),
      systemCannotSee: ['x'],
      rejectionAddendum: null,
    });
    expect(args).toHaveProperty('text');
    expect(args).toHaveProperty('schema');
    expect(args).toHaveProperty('hint');
    expect(typeof args.text).toBe('string');
  });

  it('passes through a model when provided', () => {
    const args = buildAdvisorToolArgs({
      packTopic: 't',
      packMode: 'repair_required',
      diagnosis: diag(),
      actionGraph: graph(),
      systemCannotSee: ['x'],
      rejectionAddendum: null,
      model: 'hermes3:8b',
    });
    expect(args.model).toBe('hermes3:8b');
  });
});

beforeEach(async () => {});
afterEach(async () => {});
