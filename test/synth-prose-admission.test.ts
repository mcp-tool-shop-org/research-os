// Admission gate regression tests (Slice 1d requirement).
//
// Verifies the planner's answer-role admission rule:
//   - accepted_for_synthesis is necessary support eligibility but not sufficient
//     for answer eligibility.
//   - Claims that do not help answer the section purpose must receive role=unused.
//   - role_rationale is required for every assignment; empty rationale is rejected.
//   - Unused claims never appear in any paragraph's support_bundle.
//   - If no claim earns role=answer, prose generation fails with no_answer_cluster.
//   - Disclosures include unused_claims in both the ProseBlock (JSON) and the
//     failure payload.

import { describe, it, expect } from 'vitest';
import { runPlanner } from '../src/synth/prose/planner.js';
import { runProseSynthesis } from '../src/synth/prose/run.js';
import type {
  AcceptedClaimInput,
  PlannerAssignment,
  ProseCallToolClient,
} from '../src/synth/prose/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeClaim(id: string, asserts: string): AcceptedClaimInput {
  return {
    claim_id: id,
    asserts,
    scope: null,
    not: null,
    source_ids: [`src_${id.slice(4, 16)}`],
    confidence: 'medium',
  };
}

function plannerEnvelope(assignments: PlannerAssignment[]): string {
  return JSON.stringify({ result: { ok: true, data: { assignments } } });
}

function drafterEnvelope(paragraph: string): string {
  return JSON.stringify({ result: { ok: true, data: { paragraph } } });
}

function verifierEnvelope(): string {
  return JSON.stringify({ result: { ok: true, data: { decision: 'faithful', rationale: 'ok' } } });
}

// Mock client that returns planner assignments first, then drafter, then verifier.
function makeSequencedClient(plannerResponse: string): ProseCallToolClient {
  let plannerDone = false;
  let drafterCount = 0;
  return {
    async callTool(params) {
      const text = typeof (params.arguments as Record<string, unknown>).text === 'string'
        ? (params.arguments as Record<string, unknown>).text as string
        : '';
      if (!plannerDone && (text.includes('Assign each') || text.includes('Admission rule'))) {
        plannerDone = true;
        return { content: [{ type: 'text', text: plannerResponse }] };
      }
      if (text.includes('Write ONE readable')) {
        drafterCount += 1;
        return { content: [{ type: 'text', text: drafterEnvelope(`Paragraph ${drafterCount} about the section topic.`) }] };
      }
      return { content: [{ type: 'text', text: verifierEnvelope() }] };
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const SECTION_PURPOSE = 'Evidence custody / local-first vs cloud research workflows with operator-curated sources';

const CLAIM_CLAUDE_GENERAL = makeClaim(
  'clm_test000claude_heuristic_1',
  'Claude can ask questions, use Google Drive, and help complete tasks.',
);
const CLAIM_PROV = makeClaim(
  'clm_test000prov00_heuristic_1',
  'PROV defines interoperable provenance records consisting of entities, activities, and agents.',
);

describe('runPlanner — role_rationale validation', () => {
  it('returns ok:false when role_rationale is empty string', async () => {
    const client: ProseCallToolClient = {
      async callTool() {
        return {
          content: [{
            type: 'text',
            text: plannerEnvelope([
              { claim_id: CLAIM_PROV.claim_id, role: 'answer', role_rationale: '' },
            ]),
          }],
        };
      },
    };
    const result = await runPlanner(client, SECTION_PURPOSE, [CLAIM_PROV]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/role_rationale/);
  });

  it('returns ok:false when role_rationale is whitespace only', async () => {
    const client: ProseCallToolClient = {
      async callTool() {
        return {
          content: [{
            type: 'text',
            text: plannerEnvelope([
              { claim_id: CLAIM_PROV.claim_id, role: 'answer', role_rationale: '   \t  ' },
            ]),
          }],
        };
      },
    };
    const result = await runPlanner(client, SECTION_PURPOSE, [CLAIM_PROV]);
    expect(result.ok).toBe(false);
  });

  it('accepts assignments when role_rationale is non-empty', async () => {
    const client: ProseCallToolClient = {
      async callTool() {
        return {
          content: [{
            type: 'text',
            text: plannerEnvelope([
              { claim_id: CLAIM_PROV.claim_id, role: 'answer', role_rationale: 'PROV defines provenance records directly relevant to evidence custody.' },
            ]),
          }],
        };
      },
    };
    const result = await runPlanner(client, SECTION_PURPOSE, [CLAIM_PROV]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.assignments[0]?.role_rationale).toBe('PROV defines provenance records directly relevant to evidence custody.');
  });

  it('unused role is accepted as a valid planner role', async () => {
    const client: ProseCallToolClient = {
      async callTool() {
        return {
          content: [{
            type: 'text',
            text: plannerEnvelope([
              {
                claim_id: CLAIM_CLAUDE_GENERAL.claim_id,
                role: 'unused',
                role_rationale: 'General assistant capability; does not address evidence custody purpose.',
              },
            ]),
          }],
        };
      },
    };
    const result = await runPlanner(client, SECTION_PURPOSE, [CLAIM_CLAUDE_GENERAL]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.assignments[0]?.role).toBe('unused');
  });
});

describe('runProseSynthesis — no_answer_cluster failure mode', () => {
  it('returns ok:false with no_answer_cluster when all claims are unused', async () => {
    const claims = [CLAIM_CLAUDE_GENERAL, CLAIM_PROV];
    const plannerResp = plannerEnvelope([
      {
        claim_id: CLAIM_CLAUDE_GENERAL.claim_id,
        role: 'unused',
        role_rationale: 'General assistant capability; not about evidence custody.',
      },
      {
        claim_id: CLAIM_PROV.claim_id,
        role: 'unused',
        role_rationale: 'PROV is about provenance format, not directly answering evidence custody workflow comparison.',
      },
    ]);
    const client = makeSequencedClient(plannerResp);
    const result = await runProseSynthesis({
      sectionPurpose: SECTION_PURPOSE,
      acceptedClaims: claims,
      sourceCards: [],
      waivers: [],
      gateVerdict: 'warn',
      packMode: 'repair_required',
      client,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.noAnswerCluster).toBeDefined();
    expect(result.noAnswerCluster?.code).toBe('no_answer_cluster');
    expect(result.noAnswerCluster?.accepted_claim_count).toBe(2);
    expect(result.noAnswerCluster?.unused_count).toBe(2);
    expect(result.noAnswerCluster?.unused_claims).toHaveLength(2);
  });

  it('no_answer_cluster: unused_claims contains all claims with their rationale', async () => {
    const plannerResp = plannerEnvelope([
      {
        claim_id: CLAIM_CLAUDE_GENERAL.claim_id,
        role: 'unused',
        role_rationale: 'General assistant capability; not about evidence custody.',
      },
    ]);
    const client = makeSequencedClient(plannerResp);
    const result = await runProseSynthesis({
      sectionPurpose: SECTION_PURPOSE,
      acceptedClaims: [CLAIM_CLAUDE_GENERAL],
      sourceCards: [],
      waivers: [],
      gateVerdict: 'warn',
      packMode: 'repair_required',
      client,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const unusedEntry = result.noAnswerCluster?.unused_claims[0];
    expect(unusedEntry?.claim_id).toBe(CLAIM_CLAUDE_GENERAL.claim_id);
    expect(unusedEntry?.role_rationale).toContain('General assistant');
  });
});

describe('runProseSynthesis — admission: unused claims excluded from support', () => {
  it('unused claim does not appear in any paragraph support_bundle', async () => {
    // Planner assigns PROV to answer, Claude general to unused.
    const plannerResp = plannerEnvelope([
      {
        claim_id: CLAIM_PROV.claim_id,
        role: 'answer',
        role_rationale: 'PROV provenance record format directly supports evidence custody traceability.',
      },
      {
        claim_id: CLAIM_CLAUDE_GENERAL.claim_id,
        role: 'unused',
        role_rationale: 'General assistant capability; does not address evidence custody purpose.',
      },
    ]);
    const client = makeSequencedClient(plannerResp);
    const result = await runProseSynthesis({
      sectionPurpose: SECTION_PURPOSE,
      acceptedClaims: [CLAIM_PROV, CLAIM_CLAUDE_GENERAL],
      sourceCards: [],
      waivers: [],
      gateVerdict: 'warn',
      packMode: 'repair_required',
      client,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const allSupportIds = result.block.paragraphs.flatMap((p) => p.support_bundle.claim_ids);
    expect(allSupportIds).not.toContain(CLAIM_CLAUDE_GENERAL.claim_id);
    expect(allSupportIds).toContain(CLAIM_PROV.claim_id);
  });

  it('unused claims appear in disclosures.unused_claims with rationale', async () => {
    const plannerResp = plannerEnvelope([
      {
        claim_id: CLAIM_PROV.claim_id,
        role: 'answer',
        role_rationale: 'Directly addresses provenance and evidence traceability.',
      },
      {
        claim_id: CLAIM_CLAUDE_GENERAL.claim_id,
        role: 'unused',
        role_rationale: 'General assistant capability; not about evidence custody workflow.',
      },
    ]);
    const client = makeSequencedClient(plannerResp);
    const result = await runProseSynthesis({
      sectionPurpose: SECTION_PURPOSE,
      acceptedClaims: [CLAIM_PROV, CLAIM_CLAUDE_GENERAL],
      sourceCards: [],
      waivers: [],
      gateVerdict: 'warn',
      packMode: 'repair_required',
      client,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const unusedClaims = result.block.disclosures.unused_claims;
    expect(unusedClaims).toHaveLength(1);
    expect(unusedClaims[0]?.claim_id).toBe(CLAIM_CLAUDE_GENERAL.claim_id);
    expect(unusedClaims[0]?.role_rationale).toContain('General assistant');
  });

  it('zero unused claims → unused_claims is empty array', async () => {
    const plannerResp = plannerEnvelope([
      {
        claim_id: CLAIM_PROV.claim_id,
        role: 'answer',
        role_rationale: 'Directly addresses provenance and evidence traceability.',
      },
    ]);
    const client = makeSequencedClient(plannerResp);
    const result = await runProseSynthesis({
      sectionPurpose: SECTION_PURPOSE,
      acceptedClaims: [CLAIM_PROV],
      sourceCards: [],
      waivers: [],
      gateVerdict: 'warn',
      packMode: 'repair_required',
      client,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.block.disclosures.unused_claims).toEqual([]);
  });
});
