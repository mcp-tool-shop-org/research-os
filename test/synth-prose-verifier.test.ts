// Test class 3: Verifier unit tests.
// Key cases: synthetic test where paragraph asserts an uncited claim →
// unsupported_connective; paragraph faithfully restates cluster → faithful.

import { describe, it, expect } from 'vitest';
import { runVerifier, buildVerifierToolArgs } from '../src/synth/prose/verifier.js';
import { VERIFIER_DECISIONS_ENUM } from '../src/synth/prose/prompt.js';
import type { AcceptedClaimInput, ProseCallToolClient } from '../src/synth/prose/types.js';

const CLAIM: AcceptedClaimInput = {
  claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
  asserts: 'DVC tracks large files via content hashes rather than embedding them in git',
  scope: 'machine learning pipeline artifact tracking',
  not: 'general-purpose file synchronization',
  source_ids: ['src_bbbbbbbbbbbb'],
  confidence: 'high',
};

function envelopeOk(decision: string, rationale: string): string {
  return JSON.stringify({ result: { ok: true, data: { decision, rationale } } });
}

function envelopeError(msg: string): string {
  return JSON.stringify({ result: { ok: false, error: msg } });
}

function makeClient(text: string): ProseCallToolClient {
  return {
    async callTool() {
      return { content: [{ type: 'text', text }] };
    },
  };
}

describe('buildVerifierToolArgs', () => {
  it('includes the paragraph text in the prompt', () => {
    const args = buildVerifierToolArgs('purpose', 'evidence', 'my paragraph', [CLAIM]);
    expect(args.text as string).toContain('my paragraph');
  });

  it('includes claim asserts in the prompt', () => {
    const args = buildVerifierToolArgs('purpose', 'evidence', 'paragraph', [CLAIM]);
    expect(args.text as string).toContain(CLAIM.asserts);
  });

  it('includes scope and not constraints', () => {
    const args = buildVerifierToolArgs('purpose', 'evidence', 'para', [CLAIM]);
    const text = args.text as string;
    expect(text).toContain(CLAIM.scope!);
    expect(text).toContain(CLAIM.not!);
  });

  it('includes the conservative-exclude rule (when in doubt, reject)', () => {
    const args = buildVerifierToolArgs('purpose', 'evidence', 'para', [CLAIM]);
    expect(args.text as string).toContain('unsupported_connective');
  });

  it('threads model through', () => {
    const args = buildVerifierToolArgs('purpose', 'evidence', 'para', [CLAIM], 'hermes3:8b');
    expect(args.model).toBe('hermes3:8b');
  });
});

describe('runVerifier', () => {
  it('returns faithful when paragraph faithfully restates the cluster', async () => {
    const faithfulParagraph =
      'DVC tracks large files via content hashes rather than embedding them in git, ' +
      'scoped to machine learning pipeline artifact tracking and not general-purpose file sync.';
    const result = await runVerifier(
      makeClient(envelopeOk('faithful', 'Paragraph directly restates the claim without widening.')),
      'evidence custody in ML pipelines',
      'evidence',
      faithfulParagraph,
      [CLAIM],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision).toBe('faithful');
      expect(result.rationale).toBeTruthy();
    }
  });

  it('returns unsupported_connective when paragraph asserts a claim not in support', async () => {
    const unsupportedParagraph =
      'DVC is the industry standard for ML artifact tracking and is used by 90% of Fortune 500 companies.';
    const result = await runVerifier(
      makeClient(envelopeOk('unsupported_connective', 'The 90% statistic is not in any support claim.')),
      'evidence custody in ML pipelines',
      'evidence',
      unsupportedParagraph,
      [CLAIM],
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.decision).toBe('unsupported_connective');
  });

  it('returns omits_critical_qualifier when paragraph drops a scope constraint', async () => {
    // Paragraph drops the "not general-purpose file sync" constraint.
    const result = await runVerifier(
      makeClient(envelopeOk('omits_critical_qualifier', 'Drops the not-constraint on file sync.')),
      'evidence custody',
      'evidence',
      'DVC tracks large files via content hashes.',
      [CLAIM],
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.decision).toBe('omits_critical_qualifier');
  });

  it('returns one of the three valid decisions', async () => {
    for (const decision of VERIFIER_DECISIONS_ENUM) {
      const result = await runVerifier(
        makeClient(envelopeOk(decision, 'rationale text')),
        'purpose',
        'evidence',
        'paragraph',
        [CLAIM],
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.decision).toBe(decision);
    }
  });

  it('returns ok:false on MCP transport error', async () => {
    const client: ProseCallToolClient = {
      async callTool() { throw new Error('socket closed'); },
    };
    const result = await runVerifier(client, 'purpose', 'evidence', 'para', [CLAIM]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('socket closed');
  });

  it('returns ok:false for invalid decision label', async () => {
    const result = await runVerifier(
      makeClient(envelopeOk('completely_wrong_label', 'rationale')),
      'purpose',
      'evidence',
      'para',
      [CLAIM],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('invalid decision');
  });

  it('returns ok:false when rationale is empty', async () => {
    const emptyRationale = JSON.stringify({
      result: { ok: true, data: { decision: 'faithful', rationale: '   ' } },
    });
    const result = await runVerifier(
      makeClient(emptyRationale),
      'purpose',
      'evidence',
      'para',
      [CLAIM],
    );
    expect(result.ok).toBe(false);
  });

  it('returns ok:false when response is not valid JSON', async () => {
    const result = await runVerifier(
      makeClient('not json'),
      'purpose',
      'evidence',
      'para',
      [CLAIM],
    );
    expect(result.ok).toBe(false);
  });

  it('returns ok:false when envelope reports ok:false', async () => {
    const result = await runVerifier(
      makeClient(envelopeError('model failed')),
      'purpose',
      'evidence',
      'para',
      [CLAIM],
    );
    expect(result.ok).toBe(false);
  });
});
