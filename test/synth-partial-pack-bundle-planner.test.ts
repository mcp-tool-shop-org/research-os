/**
 * v0.9 Slice 2c — bundle planner + validator unit tests.
 *
 * The bundle planner is a pure function that selects which section paragraphs
 * MUST support the answer paragraph when ≥2 sections are included. Selection
 * priority: faithful role=answer → faithful role=evidence → section drops out.
 * If <2 sections qualify, an `insufficient_cross_section_candidates` proseError
 * is emitted.
 *
 * The validator runs post-generation against the drafter's answer paragraph
 * to enforce the contract. Three rejection reasons:
 *   - single_section_support_when_multi_included
 *   - missing_required_support_id
 *   - extra_support_ids_added
 */
import { describe, it, expect } from 'vitest';

import {
  planAnswerBundle,
  validateAnswerBundle,
} from '../src/synth/partial-pack/bundle-planner.js';
import type { PartialPackSectionInput, RequiredAnswerBundle } from '../src/synth/partial-pack/types.js';

function sectionInput(args: {
  id: string;
  purpose?: string;
  paragraphs: Array<{ pid: string; role: string; decision?: string; text?: string }>;
}): PartialPackSectionInput {
  return {
    section_id: args.id,
    section_purpose: args.purpose ?? `Purpose of ${args.id}`,
    section_synthesis_path: `sections/${args.id}/synthesis/section-synthesis.json`,
    paragraphs: args.paragraphs.map((p) => ({
      section_paragraph_id: `${args.id}:${p.pid}`,
      role: p.role,
      text: p.text ?? `Paragraph ${p.pid} of ${args.id}`,
      verifier_decision: p.decision ?? 'faithful',
    })),
  };
}

describe('planAnswerBundle — selection priority', () => {
  it('picks the answer-role paragraph when present in each section', () => {
    const sections = [
      sectionInput({ id: '01-a', paragraphs: [
        { pid: 'p1', role: 'answer' },
        { pid: 'p2', role: 'evidence' },
      ] }),
      sectionInput({ id: '02-b', paragraphs: [
        { pid: 'p1', role: 'answer' },
        { pid: 'p2', role: 'evidence' },
      ] }),
    ];

    const result = planAnswerBundle(sections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.required_section_ids).toEqual(['01-a', '02-b']);
    expect(result.bundle.required_section_paragraph_ids).toEqual(['01-a:p1', '02-b:p1']);
    expect(result.selectionTrail.every((t) => t.priority === 'answer')).toBe(true);
  });

  it('falls back to evidence-role when a section has no faithful answer paragraph', () => {
    const sections = [
      sectionInput({ id: '01-a', paragraphs: [
        { pid: 'p1', role: 'answer' },
      ] }),
      sectionInput({ id: '02-b', paragraphs: [
        // No answer; only evidence.
        { pid: 'p1', role: 'evidence' },
        { pid: 'p2', role: 'qualifier' },
      ] }),
    ];

    const result = planAnswerBundle(sections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.required_section_paragraph_ids).toEqual(['01-a:p1', '02-b:p1']);
    expect(result.selectionTrail[0]!.priority).toBe('answer');
    expect(result.selectionTrail[1]!.priority).toBe('evidence');
  });

  it('ignores non-faithful paragraphs in the priority cascade', () => {
    const sections = [
      sectionInput({ id: '01-a', paragraphs: [
        { pid: 'p1', role: 'answer', decision: 'unsupported_connective' },
        { pid: 'p2', role: 'evidence' }, // first faithful one
      ] }),
      sectionInput({ id: '02-b', paragraphs: [
        { pid: 'p1', role: 'answer' },
      ] }),
    ];

    const result = planAnswerBundle(sections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.required_section_paragraph_ids).toEqual(['01-a:p2', '02-b:p1']);
  });

  it('drops sections with neither faithful answer nor faithful evidence paragraphs', () => {
    const sections = [
      sectionInput({ id: '01-a', paragraphs: [{ pid: 'p1', role: 'answer' }] }),
      sectionInput({ id: '02-b', paragraphs: [{ pid: 'p1', role: 'answer' }] }),
      sectionInput({ id: '03-c', paragraphs: [{ pid: 'p1', role: 'qualifier' }] }),
    ];

    const result = planAnswerBundle(sections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only the first two sections contribute; the third (qualifier-only) drops.
    expect(result.bundle.required_section_ids).toEqual(['01-a', '02-b']);
  });

  it('ties on paragraph_id lexicographically when multiple candidates share priority', () => {
    const sections = [
      sectionInput({ id: '01-a', paragraphs: [
        // Two answer paragraphs — pick the lexicographically first.
        { pid: 'p3', role: 'answer' },
        { pid: 'p1', role: 'answer' },
        { pid: 'p2', role: 'answer' },
      ] }),
      sectionInput({ id: '02-b', paragraphs: [{ pid: 'p1', role: 'answer' }] }),
    ];

    const result = planAnswerBundle(sections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Tie-break sorts section_paragraph_ids lexicographically; "01-a:p1" wins.
    expect(result.bundle.required_section_paragraph_ids[0]).toBe('01-a:p1');
  });
});

describe('planAnswerBundle — insufficient_cross_section_candidates', () => {
  it('emits proseError when only 1 of N sections has viable candidates', () => {
    const sections = [
      sectionInput({ id: '01-a', paragraphs: [{ pid: 'p1', role: 'answer' }] }),
      sectionInput({ id: '02-b', paragraphs: [{ pid: 'p1', role: 'qualifier' }] }),
      sectionInput({ id: '03-c', paragraphs: [{ pid: 'p1', role: 'caveat' }] }),
    ];

    const result = planAnswerBundle(sections);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('insufficient_cross_section_candidates');
    expect(result.error.message).toContain('only 1 qualified');
    // The candidate pool records why each section qualified or didn't.
    expect(result.error.candidate_pool).toHaveLength(3);
    expect(result.error.candidate_pool.find((c) => c.section_id === '01-a')!.qualified).toBe(true);
    expect(result.error.candidate_pool.find((c) => c.section_id === '02-b')!.qualified).toBe(false);
  });

  it('emits proseError defensively when called with <2 sections', () => {
    const sections = [
      sectionInput({ id: '01-a', paragraphs: [{ pid: 'p1', role: 'answer' }] }),
    ];

    const result = planAnswerBundle(sections);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('insufficient_cross_section_candidates');
  });
});

describe('validateAnswerBundle — multi-section enforcement', () => {
  const required: RequiredAnswerBundle = {
    role: 'answer',
    required_section_paragraph_ids: ['01-a:p1', '02-b:p1'],
    required_section_ids: ['01-a', '02-b'],
  };

  it('passes when answer cites both required section paragraphs', () => {
    const result = validateAnswerBundle({
      answerSupportSectionIds: ['01-a', '02-b'],
      answerSupportSectionParagraphIds: ['01-a:p1', '02-b:p1'],
      required,
      includedSectionsCount: 2,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects single-section support when ≥2 sections are included', () => {
    const result = validateAnswerBundle({
      answerSupportSectionIds: ['02-b'],
      answerSupportSectionParagraphIds: ['02-b:p1'],
      required,
      includedSectionsCount: 2,
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe('single_section_support_when_multi_included');
  });

  it('rejects when a required support id is missing', () => {
    const result = validateAnswerBundle({
      // Two distinct section IDs — passes the section-count check — but the
      // ids are not the required-bundle ids.
      answerSupportSectionIds: ['01-a', '02-b'],
      answerSupportSectionParagraphIds: ['01-a:p2', '02-b:p1'], // 01-a:p1 missing
      required,
      includedSectionsCount: 2,
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe('missing_required_support_id');
    expect(result.detail).toContain('01-a:p1');
  });

  it('rejects when extra support ids are added beyond the required set', () => {
    const result = validateAnswerBundle({
      answerSupportSectionIds: ['01-a', '02-b'],
      answerSupportSectionParagraphIds: ['01-a:p1', '02-b:p1', '01-a:p2'],
      required,
      includedSectionsCount: 2,
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe('extra_support_ids_added');
    expect(result.detail).toContain('01-a:p2');
  });
});

describe('validateAnswerBundle — single-section pass-through', () => {
  it('accepts single-section support when only 1 section is included', () => {
    const result = validateAnswerBundle({
      answerSupportSectionIds: ['06-good'],
      answerSupportSectionParagraphIds: ['06-good:p1'],
      required: null,
      includedSectionsCount: 1,
    });
    expect(result.valid).toBe(true);
  });

  it('accepts single-section support when required is null (Slice 2 fallback)', () => {
    const result = validateAnswerBundle({
      answerSupportSectionIds: ['06-good'],
      answerSupportSectionParagraphIds: ['06-good:p1'],
      required: null,
      includedSectionsCount: 1,
    });
    expect(result.valid).toBe(true);
  });
});
