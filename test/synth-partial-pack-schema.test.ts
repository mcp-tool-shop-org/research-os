/**
 * v0.9 Slice 2 — schema + support-bundle contract tests.
 *
 * Covers:
 *   - The Zod schema accepts the locked artifact shape.
 *   - The Zod schema rejects raw-claim or source-card support bundles.
 *   - Backward-compat: reader tolerates Slice 1's section-synthesis.json shape.
 *   - Forward-tolerance: reader passes through unknown Slice 1 fields.
 *   - Section paragraph IDs follow "<section_id>:<paragraph_id>" format.
 */
import { describe, it, expect } from 'vitest';

import {
  PartialPackArtifactSchema,
  PartialPackParagraphSchema,
  PartialPackSupportBundleSchema,
  SectionSynthesisProsePartSchema,
} from '../src/synth/partial-pack/schema.js';

function makeArtifactBase(): unknown {
  return {
    status: 'partial_pack_synthesis',
    scope: 'pack',
    pack_id: 'pack_x',
    pack_topic: 'topic',
    pack_mode: 'repair_required',
    not_freezable_as_pack: true,
    not_publishable_as_pack: true,
    included_sections: [
      {
        section_id: '06-good',
        section_purpose: 'good purpose',
        section_synthesis_path: 'sections/06-good/synthesis/section-synthesis.json',
        paragraph_count: 1,
      },
    ],
    excluded_sections: [
      {
        section_id: '01-blocked',
        section_purpose: 'blocked',
        reason: 'gate_blocked',
        detail: 'accepted_claim_floor: 0/3',
      },
    ],
    source_section_syntheses: ['sections/06-good/synthesis/section-synthesis.json'],
    required_answer_bundle: null,
    prose: {
      paragraphs: [
        {
          paragraph_id: 'pp1',
          role: 'answer',
          text: 'Pack-level answer paragraph.',
          support_bundle: {
            section_ids: ['06-good'],
            section_paragraph_ids: ['06-good:p1'],
            section_synthesis_paths: ['sections/06-good/synthesis/section-synthesis.json'],
          },
        },
      ],
    },
    generated_at: '2026-05-13T01:00:00.000Z',
    research_os_version: '0.8.0',
  };
}

describe('PartialPackArtifactSchema — accepted shapes', () => {
  it('accepts the locked artifact shape', () => {
    expect(() => PartialPackArtifactSchema.parse(makeArtifactBase())).not.toThrow();
  });

  it('accepts an artifact with both prose:null and proseError', () => {
    const base = makeArtifactBase() as Record<string, unknown>;
    base.prose = null;
    base.proseError = {
      code: 'no_included_sections',
      message: 'No section has valid section-level prose.',
      excluded_sections: [
        { section_id: '01-blocked', section_purpose: 'x', reason: 'gate_blocked', detail: 'x' },
      ],
    };
    expect(() => PartialPackArtifactSchema.parse(base)).not.toThrow();
  });

  it('accepts an empty included_sections list', () => {
    const base = makeArtifactBase() as Record<string, unknown>;
    base.included_sections = [];
    base.prose = null;
    expect(() => PartialPackArtifactSchema.parse(base)).not.toThrow();
  });
});

describe('PartialPackArtifactSchema — rejected shapes', () => {
  it('rejects status !== "partial_pack_synthesis"', () => {
    const base = makeArtifactBase() as Record<string, unknown>;
    base.status = 'partial_synthesis';
    expect(() => PartialPackArtifactSchema.parse(base)).toThrow();
  });

  it('rejects not_freezable_as_pack !== true', () => {
    const base = makeArtifactBase() as Record<string, unknown>;
    base.not_freezable_as_pack = false;
    expect(() => PartialPackArtifactSchema.parse(base)).toThrow();
  });

  it('rejects not_publishable_as_pack !== true', () => {
    const base = makeArtifactBase() as Record<string, unknown>;
    base.not_publishable_as_pack = false;
    expect(() => PartialPackArtifactSchema.parse(base)).toThrow();
  });

  it('rejects an excluded_section with an unknown reason', () => {
    const base = makeArtifactBase() as Record<string, unknown>;
    (base.excluded_sections as Array<Record<string, unknown>>)[0]!.reason = 'unknown_reason';
    expect(() => PartialPackArtifactSchema.parse(base)).toThrow();
  });
});

describe('PartialPackSupportBundleSchema — no raw-claim support', () => {
  it('rejects a support bundle that includes claim_ids', () => {
    const bad = {
      section_ids: ['06-good'],
      section_paragraph_ids: ['06-good:p1'],
      section_synthesis_paths: ['x'],
      claim_ids: ['c1'], // forbidden — must not be present
    };
    expect(() => PartialPackSupportBundleSchema.parse(bad)).toThrow();
  });

  it('rejects a support bundle that includes source_card_ids', () => {
    const bad = {
      section_ids: ['06-good'],
      section_paragraph_ids: ['06-good:p1'],
      section_synthesis_paths: ['x'],
      source_card_ids: ['s1'], // forbidden
    };
    expect(() => PartialPackSupportBundleSchema.parse(bad)).toThrow();
  });

  it('rejects section_paragraph_id without a colon', () => {
    const bad = {
      section_ids: ['06-good'],
      section_paragraph_ids: ['p1-no-section-prefix'],
      section_synthesis_paths: ['x'],
    };
    expect(() => PartialPackSupportBundleSchema.parse(bad)).toThrow();
  });

  it('accepts a support bundle with valid section_paragraph_ids', () => {
    const ok = {
      section_ids: ['06-good'],
      section_paragraph_ids: ['06-good:p1', '06-good:p2'],
      section_synthesis_paths: ['sections/06-good/synthesis/section-synthesis.json'],
    };
    expect(() => PartialPackSupportBundleSchema.parse(ok)).not.toThrow();
  });
});

describe('PartialPackParagraphSchema — role enum', () => {
  it('rejects an unknown role', () => {
    const bad = {
      paragraph_id: 'pp1',
      role: 'unknown_role',
      text: 'x',
      support_bundle: {
        section_ids: ['06-good'],
        section_paragraph_ids: ['06-good:p1'],
        section_synthesis_paths: ['x'],
      },
    };
    expect(() => PartialPackParagraphSchema.parse(bad)).toThrow();
  });

  it('accepts the role enum values', () => {
    for (const role of ['answer', 'evidence', 'qualifier', 'caveat', 'implication']) {
      const ok = {
        paragraph_id: 'pp1',
        role,
        text: 'x',
        support_bundle: {
          section_ids: ['06-good'],
          section_paragraph_ids: ['06-good:p1'],
          section_synthesis_paths: ['x'],
        },
      };
      expect(() => PartialPackParagraphSchema.parse(ok)).not.toThrow();
    }
  });
});

describe('SectionSynthesisProsePartSchema — Slice 1 compat', () => {
  it('tolerates a real Slice 1 section-synthesis.json shape', () => {
    // Shape verified against E:/AI/research-os-prose-acceptance Slice 1e output.
    const slice1Shape = {
      status: 'partial_synthesis',
      scope: 'section',
      section_id: '01-evidence-custody-local-first',
      section_purpose: 'What does evidence custody require?',
      pack_id: 'fa6f08d7e63b',
      pack_topic: 'local-first evidence custody vs cloud deep-research',
      pack_mode: 'synthesis_ready',
      not_freezable_as_pack: true,
      not_publishable_as_pack: true,
      accepted_claim_ids: ['clm_abc'],
      source_ids: ['src_abc'],
      waivers_applied: [],
      gate_verdict: 'pass',
      generated_at: '2026-05-13T05:41:51.830Z',
      research_os_version: '0.8.0',
      prose: {
        section_purpose: 'x',
        paragraphs: [
          {
            paragraph_id: 'p1',
            role: 'answer',
            text: 'Real Slice 1 prose.',
            support_bundle: { claim_ids: ['clm_abc'], source_card_ids: ['src_abc'], waiver_ids: [], thin_evidence: false },
            verifier_decision: 'faithful',
          },
        ],
        disclosures: { waivers: [], thin_evidence_paragraphs: [], unused_claims: [] },
        generator: { activity_id: 'x', drafter_model: 'unknown', verifier_model: 'unknown', prompt_version: 'section-prose-v3' },
      },
    };
    const parsed = SectionSynthesisProsePartSchema.parse(slice1Shape);
    expect(parsed.prose?.paragraphs).toHaveLength(1);
    expect(parsed.prose?.paragraphs[0]!.verifier_decision).toBe('faithful');
  });

  it('tolerates a proseError variant from Slice 1d', () => {
    const slice1dShape = {
      status: 'partial_synthesis',
      proseError: {
        code: 'no_answer_cluster',
        message: 'No accepted claim was assigned the answer role.',
        accepted_claim_count: 20,
        unused_count: 1,
        section_purpose: 'x',
        unused_claims: [],
      },
    };
    const parsed = SectionSynthesisProsePartSchema.parse(slice1dShape);
    expect(parsed.proseError?.code).toBe('no_answer_cluster');
  });

  it('forward-tolerates added Slice 1 fields (passthrough)', () => {
    const futureShape = {
      status: 'partial_synthesis',
      prose: {
        paragraphs: [
          {
            paragraph_id: 'p1',
            role: 'answer',
            text: 'x',
            verifier_decision: 'faithful',
            future_field: 'whatever',
          },
        ],
        future_top_field: { anything: true },
      },
      future_top_level_field: 'value',
    };
    expect(() => SectionSynthesisProsePartSchema.parse(futureShape)).not.toThrow();
  });
});
