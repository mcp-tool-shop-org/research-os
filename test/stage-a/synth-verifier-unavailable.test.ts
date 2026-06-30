// A-SYNTH-003 (LOW, quality) regression.
//
// Invariant: when the verifier MCP CALL ITSELF fails (transport / TIER_TIMEOUT
// / parse), the resulting paragraph's `verifier_decision` MUST record the
// distinct `verification_unavailable` value — NOT 'faithful'. Conflating
// "verification unavailable" with "verified faithful" let downstream consumers
// (which filter on `=== 'faithful'`) miscount unverified prose as verified.
//
// Both halves proven:
//   BAD : verifier callTool throws  → decision === 'verification_unavailable' (not 'faithful')
//   GOOD: verifier returns faithful → decision === 'faithful' (happy path still works)

import { describe, it, expect } from 'vitest';

import { runProseSynthesis } from '../../src/synth/prose/run.js';
import type {
  AcceptedClaimInput,
  ProseCallToolClient,
  ProseRunInput,
  SourceCardMeta,
} from '../../src/synth/prose/types.js';

const CLAIM: AcceptedClaimInput = {
  claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
  asserts: 'DVC tracks large files via content hashes rather than embedding them in git',
  scope: 'machine learning pipeline artifact tracking',
  not: 'general-purpose file synchronization',
  source_ids: ['src_bbbbbbbbbbbb'],
  confidence: 'high',
};

const CARD: SourceCardMeta = {
  source_id: 'src_bbbbbbbbbbbb',
  title: 'DVC docs',
  publisher: 'DVC',
  source_type: 'docs',
  url: 'https://example.com/dvc',
};

// Planner assigns the single claim the `answer` role; drafter returns a
// paragraph. The `verifierBehavior` argument controls whether the verifier
// call succeeds ('faithful') or throws (transport failure).
function makeClient(verifierBehavior: 'faithful' | 'throw'): ProseCallToolClient {
  return {
    async callTool(params) {
      const args = params.arguments as Record<string, unknown>;
      const text = typeof args.text === 'string' ? args.text : '';

      // Planner.
      if (text.includes('Assign each') || text.includes('Admission rule')) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                result: {
                  ok: true,
                  data: {
                    assignments: [
                      {
                        claim_id: CLAIM.claim_id,
                        role: 'answer',
                        role_rationale: 'directly answers the section purpose',
                      },
                    ],
                  },
                },
              }),
            },
          ],
        };
      }

      // Drafter.
      if (text.includes('Write ONE readable')) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                result: { ok: true, data: { paragraph: 'A faithful paragraph about content-hash tracking.' } },
              }),
            },
          ],
        };
      }

      // Verifier — this is the call under test.
      if (verifierBehavior === 'throw') {
        throw new Error('TIER_TIMEOUT: synth prose MCP call (ollama_extract) timed out — elapsed=99ms budget=50ms');
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              result: { ok: true, data: { decision: 'faithful', rationale: 'restates the accepted claim' } },
            }),
          },
        ],
      };
    },
  };
}

function baseInput(client: ProseCallToolClient): ProseRunInput {
  return {
    sectionPurpose: 'How does DVC track large files?',
    acceptedClaims: [CLAIM],
    sourceCards: [CARD],
    waivers: [],
    gateVerdict: 'pass',
    packMode: 'synthesis_ready',
    client,
    // Large budget so the R-018 wrapper never fires; the thrown error comes
    // from the verifier call itself, exercising the !verifyResult.ok branch.
    plannerTimeoutMs: 600_000,
  };
}

describe('A-SYNTH-003 — verifier-call failure records verification_unavailable', () => {
  it('BAD: verifier call throwing yields verification_unavailable, NOT faithful', async () => {
    const result = await runProseSynthesis(baseInput(makeClient('throw')));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const answer = result.block.paragraphs.find((p) => p.role === 'answer');
    expect(answer).toBeDefined();
    expect(answer!.verifier_decision).toBe('verification_unavailable');
    expect(answer!.verifier_decision).not.toBe('faithful');
    // It is still disclosed as thin evidence (admitted but flagged).
    expect(result.block.disclosures.thin_evidence_paragraphs).toContain(answer!.paragraph_id);
  });

  it('GOOD: a successful faithful verification still records faithful', async () => {
    const result = await runProseSynthesis(baseInput(makeClient('faithful')));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const answer = result.block.paragraphs.find((p) => p.role === 'answer');
    expect(answer).toBeDefined();
    expect(answer!.verifier_decision).toBe('faithful');
  });
});
