/**
 * R-012 — Rescue eligibility gate pure-function tests (v0.12 Slice 1).
 *
 * The gate is the LOAD-BEARING component of R-012: both the LLM rescue
 * critic and the operator rescue command must consult it before firing.
 * These tests assert the defense-floor preservation properties before
 * any LLM rescue or operator rescue logic is wired up — the gate alone
 * must hold the line.
 *
 * Acceptance tests covered (per memory/r012_slice_kickoff_prompt.md):
 *   - #1 isolated off-topic body → gate fails (peer_count=0)
 *   - #2 below-threshold eligibility (1 non-excluded peer) → gate fails
 *   - Closed enum discipline (FRAME_RESCUE_STATUSES = exactly 5 values)
 *
 * The v0.3 Healthline regression shape (acceptance test #6) is exercised
 * here via a pure-function fixture: 4 non-excluded peers → gate passes.
 * The full integration replay (LLM rescue critic + extractor wiring) is
 * tested separately in r012-frame-rescue-integration.test.ts.
 */
import { describe, it, expect } from 'vitest';

import {
  checkRescueEligibility,
  DEFAULT_RESCUE_ELIGIBILITY_THRESHOLD,
  FRAME_RESCUE_STATUSES,
  type FrameRescueStatus,
  type PeerSnapshot,
} from '../src/claims/critic/rescue-eligibility.js';

describe('R-012 rescue eligibility gate — pure function', () => {
  it('default threshold is 2 (per kickoff — law, not a tunable knob)', () => {
    expect(DEFAULT_RESCUE_ELIGIBILITY_THRESHOLD).toBe(2);
  });

  it('gate fails when peer list is empty (acceptance test #1 — isolated off-topic body)', () => {
    const result = checkRescueEligibility({ peers: [] });
    expect(result.peer_count).toBe(0);
    expect(result.threshold).toBe(2);
    expect(result.passed).toBe(false);
  });

  it('gate fails when all peers are frame_excluded', () => {
    const peers: PeerSnapshot[] = [
      { frame_excluded: true },
      { frame_excluded: true },
      { frame_excluded: true },
    ];
    const result = checkRescueEligibility({ peers });
    expect(result.peer_count).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('gate fails on 1 non-excluded peer (acceptance test #2 — below threshold)', () => {
    const peers: PeerSnapshot[] = [
      { frame_excluded: false },
      { frame_excluded: true },
      { frame_excluded: true },
    ];
    const result = checkRescueEligibility({ peers });
    expect(result.peer_count).toBe(1);
    expect(result.threshold).toBe(2);
    expect(result.passed).toBe(false);
  });

  it('gate passes on exactly 2 non-excluded peers (threshold boundary)', () => {
    const peers: PeerSnapshot[] = [
      { frame_excluded: false },
      { frame_excluded: false },
      { frame_excluded: true },
    ];
    const result = checkRescueEligibility({ peers });
    expect(result.peer_count).toBe(2);
    expect(result.passed).toBe(true);
  });

  it('gate passes on 4 non-excluded peers (v0.3 Healthline regression fixture shape)', () => {
    // Mirrors the v0.3 fixture: clm_f6ffc9e9d86f_ollama_intern_8 (western-edge
    // moderator, frame_excluded=true at 11% overlap) from a Healthline body
    // that also produced 4 OTHER claims that passed the critic.
    const peers: PeerSnapshot[] = [
      { frame_excluded: false }, // motor-vehicle crash increase
      { frame_excluded: false }, // sleep-vs-light decomposition
      { frame_excluded: false }, // Monday spike
      { frame_excluded: false }, // Fritz et al. 6-day window
    ];
    const result = checkRescueEligibility({ peers });
    expect(result.peer_count).toBe(4);
    expect(result.threshold).toBe(2);
    expect(result.passed).toBe(true);
  });

  it('mixed peers — counts only frame_excluded:false', () => {
    const peers: PeerSnapshot[] = [
      { frame_excluded: false },
      { frame_excluded: true },
      { frame_excluded: false },
      { frame_excluded: true },
      { frame_excluded: true },
      { frame_excluded: false },
    ];
    const result = checkRescueEligibility({ peers });
    expect(result.peer_count).toBe(3);
    expect(result.passed).toBe(true);
  });

  it('respects an explicit threshold override (test-only knob)', () => {
    const peers: PeerSnapshot[] = [{ frame_excluded: false }];
    const result = checkRescueEligibility({ peers, threshold: 1 });
    expect(result.peer_count).toBe(1);
    expect(result.threshold).toBe(1);
    expect(result.passed).toBe(true);
  });

  it('defensive: if the target draft is accidentally included as frame_excluded=true, it does not inflate the count', () => {
    // The caller is responsible for removing the target from peers. This
    // test documents that a defensive failure of that responsibility does
    // NOT lead to inflated peer counts: the target is frame_excluded=true
    // (since it's a source_content_mismatch exclusion) and doesn't count
    // as a non-excluded peer.
    const peers: PeerSnapshot[] = [
      { frame_excluded: false },
      { frame_excluded: false },
      { frame_excluded: true }, // simulated target accidentally included
    ];
    const result = checkRescueEligibility({ peers });
    expect(result.peer_count).toBe(2);
    expect(result.passed).toBe(true);
  });
});

describe('R-012 FrameRescueStatus closed enum', () => {
  it('contains exactly 5 values (per kickoff locked architecture)', () => {
    expect(FRAME_RESCUE_STATUSES).toHaveLength(5);
  });

  it('contains the 5 documented states in canonical order', () => {
    expect(FRAME_RESCUE_STATUSES).toEqual([
      'not_rescued',
      'rescued_by_llm',
      'rescued_by_operator',
      'operator_declined',
      'ineligible_for_rescue',
    ]);
  });

  it('type FrameRescueStatus accepts all 5 documented values', () => {
    const cases: FrameRescueStatus[] = [
      'not_rescued',
      'rescued_by_llm',
      'rescued_by_operator',
      'operator_declined',
      'ineligible_for_rescue',
    ];
    expect(cases).toHaveLength(5);
  });
});
