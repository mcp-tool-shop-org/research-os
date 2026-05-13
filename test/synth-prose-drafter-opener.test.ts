// Banned-opener regression test (Slice 1c requirement).
//
// Verifies that runDrafter returns ok:false when the model produces an
// answer paragraph that opens with a generic meta-description phrase
// ("This guide aims", "This section discusses", etc.) instead of directly
// answering the section purpose.
//
// The check applies ONLY to role=answer. All other roles are unconstrained.

import { describe, it, expect } from 'vitest';
import { runDrafter } from '../src/synth/prose/drafter.js';
import { BANNED_OPENERS } from '../src/synth/prose/prompt.js';
import type { AcceptedClaimInput, ProseCallToolClient } from '../src/synth/prose/types.js';

const CLAIM: AcceptedClaimInput = {
  claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
  asserts: 'Reproducibility tools track ML artifacts by content hash.',
  scope: 'ML pipelines',
  not: null,
  source_ids: ['src_aaaaaaaaaaaa'],
  confidence: 'medium',
};

function makeClient(paragraph: string): ProseCallToolClient {
  return {
    async callTool() {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ result: { ok: true, data: { paragraph } } }),
        }],
      };
    },
  };
}

describe('BANNED_OPENERS exports', () => {
  it('contains at least the 4 dispatch-mandated openers', () => {
    const list = BANNED_OPENERS as readonly string[];
    expect(list.some((o) => o.includes('this guide aims'))).toBe(true);
    expect(list.some((o) => o.includes('this section discusses'))).toBe(true);
    expect(list.some((o) => o.includes('this synthesis provides'))).toBe(true);
    expect(list.some((o) => o.includes('this report explores'))).toBe(true);
  });
});

describe('runDrafter — banned opener rejection for role=answer', () => {
  for (const opener of BANNED_OPENERS as readonly string[]) {
    const capitalized = opener.charAt(0).toUpperCase() + opener.slice(1);
    it(`rejects: "${capitalized}..."`, async () => {
      const paragraph = `${capitalized} the topic in detail and provides an overview of key findings.`;
      const result = await runDrafter(makeClient(paragraph), 'section purpose', 'answer', [CLAIM], []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/meta-description/);
    });
  }

  it('check is case-insensitive (ALL-CAPS opener)', async () => {
    const paragraph = 'THIS GUIDE AIMS to summarize the findings of this section.';
    const result = await runDrafter(makeClient(paragraph), 'section purpose', 'answer', [CLAIM], []);
    expect(result.ok).toBe(false);
  });

  it('check is case-insensitive (mixed case)', async () => {
    const paragraph = 'This Section Discusses the evidence for artifact tracking.';
    const result = await runDrafter(makeClient(paragraph), 'section purpose', 'answer', [CLAIM], []);
    expect(result.ok).toBe(false);
  });

  it('accepts an answer paragraph that directly answers the purpose', async () => {
    const paragraph = 'Reproducibility in ML pipelines is achieved by tracking artifacts by content hash, ensuring identical outputs for identical inputs across runs.';
    const result = await runDrafter(makeClient(paragraph), 'section purpose', 'answer', [CLAIM], []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.paragraph).toBe(paragraph);
  });

  it('accepts an answer paragraph beginning with a subject + verb (no meta-preamble)', async () => {
    const paragraph = 'Content-addressable artifact stores prevent silent data corruption in ML reproducibility workflows by verifying artifact identity at every pipeline stage.';
    const result = await runDrafter(makeClient(paragraph), 'section purpose', 'answer', [CLAIM], []);
    expect(result.ok).toBe(true);
  });
});

describe('runDrafter — banned opener NOT applied to non-answer roles', () => {
  it('passes for role=evidence even with banned opener text', async () => {
    const paragraph = 'This guide aims to clarify the evidence basis for artifact tracking.';
    const result = await runDrafter(makeClient(paragraph), 'section purpose', 'evidence', [CLAIM], []);
    expect(result.ok).toBe(true);
  });

  it('passes for role=caveat even with banned opener text', async () => {
    const paragraph = 'This section discusses a known limitation of hash-based tracking.';
    const result = await runDrafter(makeClient(paragraph), 'section purpose', 'caveat', [CLAIM], []);
    expect(result.ok).toBe(true);
  });

  it('passes for role=qualifier even with banned opener text', async () => {
    const paragraph = 'This synthesis provides context scoped to deterministic pipelines only.';
    const result = await runDrafter(makeClient(paragraph), 'section purpose', 'qualifier', [CLAIM], []);
    expect(result.ok).toBe(true);
  });
});
