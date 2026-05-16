// Phase 1b-b (v0.8.0): drift-prevention test for the locked critic prompt.
//
// CRITIC_PROMPT_TEMPLATE in src/claims/critic/prompt.ts is the source of
// truth for what the per-claim section-evidence critic asks the model.
// Future refactors must NOT quiet-paraphrase the prompt; this test fails
// loudly if the constant drifts from the locked text.
//
// If you NEED to change the prompt, change the LOCKED_TEXT constant here in
// the same commit AND surface the change in your release notes. Quiet
// paraphrases are forbidden by the doctrine ratchet.

import { describe, it, expect } from 'vitest';
import {
  CRITIC_PROMPT_TEMPLATE,
  CRITIC_LABELS,
  CRITIC_RESULT_SCHEMA,
  CRITIC_EXCLUSION_LABELS,
  FRAME_EXCLUSION_REASONS,
  renderCriticPrompt,
  isExclusionLabel,
} from '../src/claims/critic/prompt.js';
import { ClaimSchema } from '../src/claims/schema.js';

const LOCKED_TEXT = `Section purpose:
{section.purpose}

Claim:
{claim.asserts}

Source title: {source.title}
Publisher: {source.publisher}
Source type: {source.source_type}

Decide whether this claim could be cited as evidence for the section purpose.

Return one label:
- supports_section: the claim directly helps answer the section purpose.
- off_topic: the claim is true or plausible but about a different subject.
- background_only: the claim is generally related but too broad or contextual to support synthesis.
- source_chrome: the claim describes website UI, platform boilerplate, navigation, arXivLabs text, license text, or other non-content chrome.

Do not mark a claim supports_section merely because it contains words related to research, evidence, openness, tooling, or reproducibility. It must help answer the section purpose.

Return one-sentence rationale explaining your label choice.`;

describe('CRITIC_PROMPT_TEMPLATE (drift prevention)', () => {
  it('matches the locked verbatim text byte-for-byte', () => {
    expect(CRITIC_PROMPT_TEMPLATE).toBe(LOCKED_TEXT);
  });

  it('contains the load-bearing imperative about supports_section', () => {
    expect(CRITIC_PROMPT_TEMPLATE).toContain(
      'Do not mark a claim supports_section merely because it contains words related to research',
    );
  });

  it('enumerates exactly the four canonical labels in CRITIC_LABELS', () => {
    expect(CRITIC_LABELS).toEqual([
      'supports_section',
      'off_topic',
      'background_only',
      'source_chrome',
    ]);
  });

  it('exposes the three exclusion labels (NOT including supports_section, NOT including critic_unavailable)', () => {
    // The CRITIC_EXCLUSION_LABELS constant is the MODEL-OUTPUT menu. It is
    // intentionally three entries — the model never returns
    // critic_unavailable. That value is system-state, set by the extractor
    // on critic-call failure; it lives in FRAME_EXCLUSION_REASONS (the
    // schema-persistence enum) but not here.
    expect(CRITIC_EXCLUSION_LABELS).toEqual([
      'off_topic',
      'background_only',
      'source_chrome',
    ]);
    expect(CRITIC_EXCLUSION_LABELS).toHaveLength(3);
    expect(isExclusionLabel('supports_section')).toBe(false);
    expect(isExclusionLabel('off_topic')).toBe(true);
    expect(isExclusionLabel('background_only')).toBe(true);
    expect(isExclusionLabel('source_chrome')).toBe(true);
    expect(isExclusionLabel('hallucinated')).toBe(false);
    // critic_unavailable is NOT a model-output label.
    expect(isExclusionLabel('critic_unavailable')).toBe(false);
  });

  it('exposes the FIVE schema-persistence reasons in FRAME_EXCLUSION_REASONS (model labels PLUS critic_unavailable PLUS source_content_mismatch)', () => {
    // FRAME_EXCLUSION_REASONS is the wider enum the schema uses to persist
    // ClaimSchema.frame_exclusion_reason. It includes the three model
    // labels plus two system-state values:
    //   - critic_unavailable (v0.8.0 phase 1b-b): set on critic-call failure
    //   - source_content_mismatch (v0.11 Slice 3 — R-011): set when the
    //     deterministic precheck fires before the LLM critic call.
    // The model never emits the system-state values.
    expect(FRAME_EXCLUSION_REASONS).toEqual([
      'off_topic',
      'background_only',
      'source_chrome',
      'critic_unavailable',
      'source_content_mismatch',
    ]);
    expect(FRAME_EXCLUSION_REASONS).toHaveLength(5);
  });

  it('the critic prompt template does NOT advertise critic_unavailable as a label option to the model', () => {
    // Drift guard: if a future edit accidentally adds critic_unavailable to
    // the prompt's label menu, this fails. The model must never see it as
    // an option — it is set by code on critic-call failure, not chosen.
    expect(CRITIC_PROMPT_TEMPLATE).not.toContain('critic_unavailable');
  });

  it('ClaimSchema.frame_exclusion_reason enum exactly matches FRAME_EXCLUSION_REASONS (four entries)', () => {
    // The schema enum is the persistence contract; FRAME_EXCLUSION_REASONS
    // is the source of truth. Parses must accept all four.
    for (const reason of FRAME_EXCLUSION_REASONS) {
      const claim = {
        claim_id: 'clm_abcdef012345_heuristic_1',
        section_id: '01-test',
        source_ids: ['src_abcdef012345'],
        source_hashes: ['a'.repeat(64)],
        asserts: 'x',
        scope: null,
        not: null,
        evidence_excerpt_ids: [],
        evidence_excerpt: 'x',
        evidence_location: null,
        confidence: 'low' as const,
        extractor: 'heuristic' as const,
        extraction_method: 'heuristic_key_point',
        created_at: '2026-05-12T00:00:00.000Z',
        review_state: 'candidate' as const,
        frame_excluded: true,
        frame_exclusion_reason: reason,
        frame_exclusion_rationale: 'r',
      };
      expect(() => ClaimSchema.parse(claim)).not.toThrow();
    }
    // And a non-enum value still rejects.
    const claim = {
      claim_id: 'clm_abcdef012345_heuristic_1',
      section_id: '01-test',
      source_ids: ['src_abcdef012345'],
      source_hashes: ['a'.repeat(64)],
      asserts: 'x',
      scope: null,
      not: null,
      evidence_excerpt_ids: [],
      evidence_excerpt: 'x',
      evidence_location: null,
      confidence: 'low' as const,
      extractor: 'heuristic' as const,
      extraction_method: 'heuristic_key_point',
      created_at: '2026-05-12T00:00:00.000Z',
      review_state: 'candidate' as const,
      frame_excluded: true,
      frame_exclusion_reason: 'hallucinated_reason',
      frame_exclusion_rationale: 'r',
    };
    expect(() => ClaimSchema.parse(claim)).toThrow();
  });

  it('schema enum on label exactly matches CRITIC_LABELS', () => {
    const enumValues = (CRITIC_RESULT_SCHEMA.properties as { label: { enum: unknown[] } }).label
      .enum;
    expect(enumValues).toEqual([...CRITIC_LABELS]);
  });

  it('schema marks both label and rationale required', () => {
    expect((CRITIC_RESULT_SCHEMA as { required: string[] }).required).toEqual([
      'label',
      'rationale',
    ]);
  });
});

describe('renderCriticPrompt (substitution truth table)', () => {
  it('renders all five fields when every value is present', () => {
    const out = renderCriticPrompt({
      sectionPurpose: 'gates and waivers — what blocks synthesis',
      claimAsserts: 'patch publish before next repo',
      sourceTitle: 'role-os Rollout Notes',
      sourcePublisher: 'mcp-tool-shop',
      sourceType: 'primary',
    });
    expect(out).toContain('Section purpose:\ngates and waivers — what blocks synthesis');
    expect(out).toContain('Claim:\npatch publish before next repo');
    expect(out).toContain('Source title: role-os Rollout Notes');
    expect(out).toContain('Publisher: mcp-tool-shop');
    expect(out).toContain('Source type: primary');
    expect(out).toContain('Return one label:');
  });

  it('OMITS the Source title line when title is null', () => {
    const out = renderCriticPrompt({
      sectionPurpose: 'purpose',
      claimAsserts: 'claim text',
      sourceTitle: null,
      sourcePublisher: 'pub',
      sourceType: 'primary',
    });
    expect(out).not.toContain('Source title:');
    expect(out).toContain('Publisher: pub');
    expect(out).toContain('Source type: primary');
  });

  it('OMITS the Publisher line when publisher is empty string', () => {
    const out = renderCriticPrompt({
      sectionPurpose: 'purpose',
      claimAsserts: 'claim text',
      sourceTitle: 't',
      sourcePublisher: '',
      sourceType: 'primary',
    });
    expect(out).toContain('Source title: t');
    expect(out).not.toContain('Publisher:');
    expect(out).toContain('Source type: primary');
  });

  it('OMITS the Source type line when sourceType is undefined', () => {
    const out = renderCriticPrompt({
      sectionPurpose: 'purpose',
      claimAsserts: 'claim text',
      sourceTitle: 't',
      sourcePublisher: 'p',
    });
    expect(out).toContain('Source title: t');
    expect(out).toContain('Publisher: p');
    expect(out).not.toContain('Source type:');
  });

  it('OMITS all three Source lines when all source metadata is missing', () => {
    const out = renderCriticPrompt({
      sectionPurpose: 'purpose',
      claimAsserts: 'claim text',
    });
    expect(out).not.toMatch(/Source title:/);
    expect(out).not.toMatch(/Publisher:/);
    expect(out).not.toMatch(/Source type:/);
    // Surrounding structure still present.
    expect(out).toContain('Section purpose:\npurpose');
    expect(out).toContain('Claim:\nclaim text');
    expect(out).toContain('Decide whether this claim could be cited as evidence');
  });

  it('does NOT render "(none)" or blank-after-colon for absent values', () => {
    const out = renderCriticPrompt({
      sectionPurpose: 'p',
      claimAsserts: 'c',
      sourceTitle: null,
      sourcePublisher: '   ',
      sourceType: 'docs',
    });
    expect(out).not.toContain('(none)');
    expect(out).not.toMatch(/Source title:\s*\n/);
    expect(out).not.toMatch(/Publisher:\s*\n/);
    expect(out).toContain('Source type: docs');
  });
});
