// Shape A tier-assertion regression test (Slice 1b requirement).
//
// Verifies that the planner chunks accepted claims into batches of
// PLANNER_CHUNK_SIZE and makes one MCP call per chunk for 30+ claims.
//
// This test fails if a future change reverts chunking (e.g., by sending all
// claims in a single call) or increases the chunk size beyond the dispatch
// limit of 12. It does NOT require a live Ollama instance — the MCP client
// is a mock that records call payloads.

import { describe, it, expect } from 'vitest';
import { runPlanner, buildPlannerToolArgs, PLANNER_CHUNK_SIZE } from '../src/synth/prose/planner.js';
import type { AcceptedClaimInput, ProseCallToolClient } from '../src/synth/prose/types.js';

function makeClaims(n: number): AcceptedClaimInput[] {
  return Array.from({ length: n }, (_, i) => ({
    claim_id: `clm_${'abcdef012345'.slice(0, 12)}_heuristic_${String(i + 1).padStart(3, '0')}`,
    asserts: `Evidence custody claim ${i + 1}: tools track artifacts by content hash for ML pipeline reproducibility.`,
    scope: 'ML pipeline artifact tracking',
    not: 'general-purpose file backup',
    source_ids: [`src_${'a'.repeat(12)}`],
    confidence: 'medium' as const,
  }));
}

// A mock client that records each call's text, extracts claim IDs from it,
// and returns valid planner assignments for exactly the claims it sees.
function makeCapturingClient(): {
  client: ProseCallToolClient;
  callTexts: string[];
  claimIdsPerCall: string[][];
} {
  const callTexts: string[] = [];
  const claimIdsPerCall: string[][] = [];

  const client: ProseCallToolClient = {
    async callTool(params) {
      const args = params.arguments as Record<string, unknown>;
      const text = typeof args.text === 'string' ? args.text : '';
      callTexts.push(text);

      // Extract claim IDs visible in this chunk's prompt text.
      // Use \w+ (word chars) not [a-f0-9_]+ so that IDs containing 'heuristic'
      // are captured in full (e.g. clm_abcdef012345_heuristic_001).
      const ids = Array.from(new Set(text.match(/clm_\w+/g) ?? []));
      claimIdsPerCall.push(ids);

      // Return valid assignments for the claims we see.
      const assignments = ids.map((id, i) => ({
        claim_id: id,
        role: i === 0 ? 'answer' as const : 'evidence' as const,
        role_rationale: i === 0 ? 'directly answers the section purpose' : 'provides supporting evidence',
      }));
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ result: { ok: true, data: { assignments } } }),
        }],
      };
    },
  };

  return { client, callTexts, claimIdsPerCall };
}

describe('Shape A: planner chunks large claim lists (Slice 1b regression)', () => {
  it('PLANNER_CHUNK_SIZE is at most 12 (Slice 1b upper bound)', () => {
    expect(PLANNER_CHUNK_SIZE).toBeGreaterThanOrEqual(1);
    expect(PLANNER_CHUNK_SIZE).toBeLessThanOrEqual(12);
  });

  it('PLANNER_CHUNK_SIZE is exactly 5 (Slice 1f operationally-proven value)', () => {
    // Locked at 5 after Slice 2b's multi-section bed surfaced TIER_TIMEOUT
    // at chunk size 10 under real-world generation-rate variance. Drift to a
    // larger value re-introduces the brittleness; drift to a smaller value
    // multiplies MCP round-trips without product justification. Any change
    // requires a fresh multi-section live run + advisor sign-off.
    expect(PLANNER_CHUNK_SIZE).toBe(5);
  });

  it('makes multiple calls for 30+ claims', async () => {
    const claims = makeClaims(30);
    const { client, claimIdsPerCall } = makeCapturingClient();

    const result = await runPlanner(client, 'Evidence custody and reproducibility in ML pipelines', claims);

    expect(result.ok).toBe(true);
    // Must have made more than 1 call (chunking is happening).
    expect(claimIdsPerCall.length).toBeGreaterThan(1);
  });

  it('no single call exceeds PLANNER_CHUNK_SIZE claims', async () => {
    const claims = makeClaims(35);
    const { client, claimIdsPerCall } = makeCapturingClient();

    await runPlanner(client, 'Evidence custody and reproducibility in ML pipelines', claims);

    for (const ids of claimIdsPerCall) {
      expect(ids.length).toBeLessThanOrEqual(PLANNER_CHUNK_SIZE);
    }
  });

  it('all 30+ claims are assigned exactly once in the merged result', async () => {
    const claims = makeClaims(30);
    const { client } = makeCapturingClient();

    const result = await runPlanner(client, 'Evidence custody in ML pipelines', claims);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const assignedIds = result.assignments.map((a) => a.claim_id).sort();
    const inputIds = claims.map((c) => c.claim_id).sort();
    expect(assignedIds).toEqual(inputIds);
  });

  it('number of calls equals ceil(claims / PLANNER_CHUNK_SIZE)', async () => {
    const N = 35;
    const claims = makeClaims(N);
    const { client, claimIdsPerCall } = makeCapturingClient();

    await runPlanner(client, 'Evidence custody in ML pipelines', claims);

    const expectedCalls = Math.ceil(N / PLANNER_CHUNK_SIZE);
    expect(claimIdsPerCall.length).toBe(expectedCalls);
  });

  it('single-chunk input (≤ PLANNER_CHUNK_SIZE) makes exactly 1 call', async () => {
    const claims = makeClaims(PLANNER_CHUNK_SIZE);
    const { client, claimIdsPerCall } = makeCapturingClient();

    await runPlanner(client, 'Evidence custody in ML pipelines', claims);

    expect(claimIdsPerCall.length).toBe(1);
  });

  it('chunk error propagates as planner failure', async () => {
    const claims = makeClaims(15);
    let callCount = 0;

    const failingClient: ProseCallToolClient = {
      async callTool() {
        callCount += 1;
        if (callCount === 2) {
          // Second chunk fails.
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ result: { ok: false, error: 'chunk 2 inference failed' } }),
            }],
          };
        }
        const ids = Array.from({ length: Math.min(PLANNER_CHUNK_SIZE, 15) }, (_, i) =>
          makeClaims(15)[(callCount - 1) * PLANNER_CHUNK_SIZE + i]?.claim_id,
        ).filter(Boolean);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ result: { ok: true, data: { assignments: ids.map((id, i) => ({ claim_id: id, role: i === 0 ? 'answer' : 'evidence', role_rationale: i === 0 ? 'answers the purpose' : 'supporting evidence' })) } } }),
          }],
        };
      },
    };

    const result = await runPlanner(failingClient, 'Evidence custody', claims);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('chunk 2 inference failed');
  });

  it('buildPlannerToolArgs with ≤ PLANNER_CHUNK_SIZE claims contains all IDs', () => {
    const claims = makeClaims(PLANNER_CHUNK_SIZE);
    const args = buildPlannerToolArgs('section purpose', claims);
    const text = args.text as string;
    for (const c of claims) {
      expect(text).toContain(c.claim_id);
    }
  });
});
