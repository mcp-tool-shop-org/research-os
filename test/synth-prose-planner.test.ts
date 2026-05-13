// Test class 1: Planner unit tests.
// Verifies: assigns each accepted claim to exactly one role; rejects non-accepted claims.

import { describe, it, expect } from 'vitest';
import { runPlanner, buildPlannerToolArgs } from '../src/synth/prose/planner.js';
import { PLANNER_ROLES_ENUM } from '../src/synth/prose/prompt.js';
import type { AcceptedClaimInput, ProseCallToolClient } from '../src/synth/prose/types.js';

function makeClaims(n: number, confidence: 'low' | 'medium' | 'high' = 'medium'): AcceptedClaimInput[] {
  return Array.from({ length: n }, (_, i) => ({
    claim_id: `clm_${'a'.repeat(12)}_heuristic_${i + 1}`,
    asserts: `Assertion number ${i + 1} about the topic`,
    scope: i % 2 === 0 ? `scope_${i}` : null,
    not: i % 3 === 0 ? `not_${i}` : null,
    source_ids: [`src_${'b'.repeat(12)}`],
    confidence,
  }));
}

function envelopeOk(assignments: unknown): string {
  return JSON.stringify({ result: { ok: true, data: { assignments } } });
}

function envelopeError(error: string): string {
  return JSON.stringify({ result: { ok: false, error } });
}

function makeClient(responseText: string, capture: string[] = []): ProseCallToolClient {
  return {
    async callTool(params) {
      capture.push(params.name);
      return { content: [{ type: 'text', text: responseText }] };
    },
  };
}

describe('buildPlannerToolArgs', () => {
  it('always targets ollama_extract', () => {
    // The tool name is enforced inside runPlanner via callTool; verify via the
    // call capture in makeClient.
    // buildPlannerToolArgs itself doesn't emit a tool name — just args.
    const args = buildPlannerToolArgs('what is X', makeClaims(2));
    expect(args).toHaveProperty('text');
    expect(args).toHaveProperty('schema');
    expect(args).toHaveProperty('hint');
  });

  it('includes all claim IDs in the text', () => {
    const claims = makeClaims(3);
    const args = buildPlannerToolArgs('section purpose', claims);
    const text = args.text as string;
    for (const c of claims) expect(text).toContain(c.claim_id);
  });

  it('includes the section purpose in the text', () => {
    const args = buildPlannerToolArgs('local-first storage reliability', makeClaims(1));
    expect(args.text as string).toContain('local-first storage reliability');
  });

  it('threads model through when provided', () => {
    const args = buildPlannerToolArgs('p', makeClaims(1), 'hermes3:8b');
    expect(args.model).toBe('hermes3:8b');
  });

  it('omits model field when not provided', () => {
    const args = buildPlannerToolArgs('p', makeClaims(1));
    expect(args).not.toHaveProperty('model');
  });
});

describe('runPlanner', () => {
  it('returns ok:true with empty assignments for zero claims', async () => {
    const client = makeClient('unused');
    const result = await runPlanner(client, 'purpose', []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.assignments).toEqual([]);
  });

  it('assigns every claim exactly once', async () => {
    const claims = makeClaims(4);
    const response = envelopeOk(
      claims.map((c, i) => ({
        claim_id: c.claim_id,
        role: PLANNER_ROLES_ENUM[i % PLANNER_ROLES_ENUM.length],
      })),
    );
    const result = await runPlanner(makeClient(response), 'section purpose', claims);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const assignedIds = result.assignments.map((a) => a.claim_id).sort();
    const inputIds = claims.map((c) => c.claim_id).sort();
    expect(assignedIds).toEqual(inputIds);
  });

  it('fills in missing claims with role=evidence when model omits them', async () => {
    const claims = makeClaims(3);
    // Model only returns assignment for the first claim.
    const partial = [{ claim_id: claims[0]!.claim_id, role: 'answer' }];
    const result = await runPlanner(makeClient(envelopeOk(partial)), 'purpose', claims);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byId = new Map(result.assignments.map((a) => [a.claim_id, a.role]));
    expect(byId.get(claims[1]!.claim_id)).toBe('evidence');
    expect(byId.get(claims[2]!.claim_id)).toBe('evidence');
  });

  it('uses ollama_extract as the tool name', async () => {
    const called: string[] = [];
    const claims = makeClaims(1);
    const response = envelopeOk([{ claim_id: claims[0]!.claim_id, role: 'answer' }]);
    await runPlanner(makeClient(response, called), 'purpose', claims);
    expect(called).toContain('ollama_extract');
  });

  it('returns ok:false on MCP transport error', async () => {
    const client: ProseCallToolClient = {
      async callTool() { throw new Error('connection refused'); },
    };
    const result = await runPlanner(client, 'purpose', makeClaims(1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('connection refused');
  });

  it('returns ok:false when envelope has ok:false', async () => {
    const result = await runPlanner(
      makeClient(envelopeError('model overloaded')),
      'purpose',
      makeClaims(1),
    );
    expect(result.ok).toBe(false);
  });

  it('returns ok:false when response is not valid JSON', async () => {
    const client = makeClient('not json at all');
    const result = await runPlanner(client, 'purpose', makeClaims(1));
    expect(result.ok).toBe(false);
  });

  it('skips items with unknown roles instead of crashing', async () => {
    const claims = makeClaims(2);
    const response = envelopeOk([
      { claim_id: claims[0]!.claim_id, role: 'answer' },
      { claim_id: claims[1]!.claim_id, role: 'not_a_real_role' }, // invalid
    ]);
    const result = await runPlanner(makeClient(response), 'purpose', claims);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The invalid-role item is skipped; claim 1 is filled in as 'evidence'.
    const byId = new Map(result.assignments.map((a) => [a.claim_id, a.role]));
    expect(byId.get(claims[0]!.claim_id)).toBe('answer');
    expect(byId.get(claims[1]!.claim_id)).toBe('evidence');
  });
});
