/**
 * v0.9 Slice 2 — classifier unit tests.
 *
 * The classifier is a pure function over the pack's filesystem state +
 * cowork-handoff. These tests drive it with synthetic state covering all
 * 7 dispatch cases (1 included + 6 exclusion reasons).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { classifySections } from '../src/synth/partial-pack/classifier.js';
import type { ResearchYaml } from '../src/intake/schema.js';
import type { CoworkHandoffPayload } from '../src/cowork/schema.js';

let packPath: string;

beforeEach(async () => {
  packPath = await mkdtemp(join(tmpdir(), 'ros-partial-pack-classifier-'));
});

afterEach(async () => {
  await rm(packPath, { recursive: true, force: true });
});

function makeResearch(sections: Array<{ id: string; purpose: string }>): ResearchYaml {
  return {
    research_os_version: '0.8.0',
    created_at: '2026-05-13T00:00:00.000Z',
    topic: 'partial-pack classifier fixture',
    decision: '',
    audience: 'self',
    desired_output: '',
    max_runtime_minutes: 240,
    freshness: { required_for_current_topics: true, max_source_age_months: 24, stale_source_policy: 'warn' } as any,
    excluded_sources: [],
    primary_source_waiver: {} as any,
    sections: sections.map((s) => ({
      id: s.id,
      purpose: s.purpose,
      max_time_minutes: 45,
      min_sources: 8,
      primary_sources_required: 2,
      contradictions_required: true,
      status: 'draft',
    })),
    gates: {} as any,
    review_profiles: {},
    frozen_at: null,
  } as ResearchYaml;
}

function makeHandoffSection(args: {
  section_id: string;
  purpose: string;
  has_gate_run?: boolean;
  has_review_run?: boolean;
  gate_verdict?: string | null;
  synthesis_eligible?: boolean;
  blocking_reasons?: string[];
  active_blockers?: string[];
}): CoworkHandoffPayload['sections'][number] {
  return {
    section_id: args.section_id,
    purpose: args.purpose,
    status: 'gated',
    has_gate_run: args.has_gate_run ?? true,
    has_review_run: args.has_review_run ?? true,
    gate_verdict: args.gate_verdict ?? 'pass',
    synthesis_eligible: args.synthesis_eligible ?? true,
    accepted_claim_ids: [],
    repair_claim_ids: [],
    rejected_claim_ids: [],
    frame_excluded_claim_ids: [],
    dispositioned_claim_ids: [],
    candidate_claims_total: 0,
    unresolved_contradiction_ids: [],
    blocking_reasons: args.blocking_reasons ?? [],
    active_blockers: args.active_blockers ?? [],
    blocking_contradictions_unresolved: 0,
  };
}

function makeHandoff(sections: CoworkHandoffPayload['sections']): CoworkHandoffPayload {
  return {
    pack_id: 'pack_test',
    pack_topic: 'fixture',
    generated_at: '2026-05-13T00:00:00.000Z',
    mode: 'repair_required',
    synthesis_allowed: false,
    summary: 'fixture',
    sections,
    accepted_claim_ids: [],
    repair_claim_ids: [],
    blocked_claim_ids: [],
    frame_excluded_claim_ids: [],
    dispositioned_claim_ids: [],
    unresolved_contradiction_ids: [],
    waivers: [],
    gate_verdicts: [],
    review_decisions: [],
    recommended_next_actions: [],
    allowed_write_paths: [],
    forbidden_actions: [],
    index_status: 'present',
    warnings: [],
  };
}

async function writeSectionSynthesis(
  sectionId: string,
  content: Record<string, unknown>,
): Promise<void> {
  const dir = join(packPath, 'sections', sectionId, 'synthesis');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'section-synthesis.json'), JSON.stringify(content), 'utf8');
}

async function writeSectionBrief(sectionId: string, content: string): Promise<void> {
  const dir = join(packPath, 'sections', sectionId, 'synthesis');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'section-brief.md'), content, 'utf8');
}

describe('partial-pack classifier — included sections', () => {
  it('includes a section with valid section-synthesis.json having ≥1 faithful paragraph', async () => {
    await writeSectionSynthesis('06-good', {
      status: 'partial_synthesis',
      section_id: '06-good',
      section_purpose: 'good section',
      prose: {
        paragraphs: [
          {
            paragraph_id: 'p1',
            role: 'answer',
            text: 'Answer paragraph.',
            verifier_decision: 'faithful',
            support_bundle: { claim_ids: ['c1'], source_card_ids: ['s1'], waiver_ids: [], thin_evidence: false },
          },
          {
            paragraph_id: 'p2',
            role: 'evidence',
            text: 'Evidence paragraph.',
            verifier_decision: 'faithful',
            support_bundle: { claim_ids: ['c2'], source_card_ids: ['s1'], waiver_ids: [], thin_evidence: false },
          },
        ],
      },
    });

    const research = makeResearch([{ id: '06-good', purpose: 'good section' }]);
    const handoff = makeHandoff([
      makeHandoffSection({ section_id: '06-good', purpose: 'good section' }),
    ]);

    const result = await classifySections({ packPath, research, handoff });
    expect(result.included).toHaveLength(1);
    expect(result.excluded).toHaveLength(0);
    expect(result.included[0]!.section_id).toBe('06-good');
    expect(result.included[0]!.paragraph_count).toBe(2);
    expect(result.drafterInputs).toHaveLength(1);
    expect(result.drafterInputs[0]!.paragraphs).toHaveLength(2);
    expect(result.drafterInputs[0]!.paragraphs[0]!.section_paragraph_id).toBe('06-good:p1');
    expect(result.drafterInputs[0]!.paragraphs[1]!.section_paragraph_id).toBe('06-good:p2');
  });

  it('filters non-faithful paragraphs from drafter inputs (still includes section)', async () => {
    await writeSectionSynthesis('06-good', {
      status: 'partial_synthesis',
      section_id: '06-good',
      section_purpose: 'good section',
      prose: {
        paragraphs: [
          {
            paragraph_id: 'p1',
            role: 'answer',
            text: 'Faithful answer.',
            verifier_decision: 'faithful',
            support_bundle: { claim_ids: ['c1'], source_card_ids: ['s1'], waiver_ids: [], thin_evidence: false },
          },
          {
            paragraph_id: 'p2',
            role: 'evidence',
            text: 'Unsupported text.',
            verifier_decision: 'unsupported_connective',
            support_bundle: { claim_ids: ['c2'], source_card_ids: ['s1'], waiver_ids: [], thin_evidence: false },
          },
        ],
      },
    });

    const research = makeResearch([{ id: '06-good', purpose: 'good section' }]);
    const handoff = makeHandoff([
      makeHandoffSection({ section_id: '06-good', purpose: 'good section' }),
    ]);

    const result = await classifySections({ packPath, research, handoff });
    expect(result.included).toHaveLength(1);
    expect(result.included[0]!.paragraph_count).toBe(1); // only the faithful one
    expect(result.drafterInputs[0]!.paragraphs).toHaveLength(1);
    expect(result.drafterInputs[0]!.paragraphs[0]!.section_paragraph_id).toBe('06-good:p1');
  });
});

describe('partial-pack classifier — exclusion: gate_blocked', () => {
  it('excludes a section whose handoff gate_verdict is "blocked"', async () => {
    const research = makeResearch([{ id: '01-blocked', purpose: 'blocked section' }]);
    const handoff = makeHandoff([
      makeHandoffSection({
        section_id: '01-blocked',
        purpose: 'blocked section',
        gate_verdict: 'blocked',
        synthesis_eligible: false,
        blocking_reasons: ['accepted_claim_floor.min_accepted_claims: 0/3'],
      }),
    ]);

    const result = await classifySections({ packPath, research, handoff });
    expect(result.included).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe('gate_blocked');
    expect(result.excluded[0]!.detail).toContain('accepted_claim_floor');
  });

  it('excludes a section with has_gate_run + synthesis_eligible=false even if verdict is "warn"', async () => {
    const research = makeResearch([{ id: '02-warned', purpose: 'warned section' }]);
    const handoff = makeHandoff([
      makeHandoffSection({
        section_id: '02-warned',
        purpose: 'warned section',
        gate_verdict: 'warn',
        synthesis_eligible: false,
        blocking_reasons: ['source_floor: insufficient publishers'],
      }),
    ]);
    const result = await classifySections({ packPath, research, handoff });
    expect(result.excluded[0]!.reason).toBe('gate_blocked');
  });
});

describe('partial-pack classifier — exclusion: unrun', () => {
  it('excludes a section with no handoff entry', async () => {
    const research = makeResearch([{ id: '03-orphan', purpose: 'orphan section' }]);
    const handoff = makeHandoff([]); // no entry for 03-orphan

    const result = await classifySections({ packPath, research, handoff });
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe('unrun');
    expect(result.excluded[0]!.detail).toContain('No cowork handoff entry');
  });

  it('excludes a section whose handoff entry has no gate AND no review run', async () => {
    const research = makeResearch([{ id: '04-untouched', purpose: 'untouched section' }]);
    const handoff = makeHandoff([
      makeHandoffSection({
        section_id: '04-untouched',
        purpose: 'untouched section',
        has_gate_run: false,
        has_review_run: false,
        gate_verdict: null,
      }),
    ]);

    const result = await classifySections({ packPath, research, handoff });
    expect(result.excluded[0]!.reason).toBe('unrun');
  });
});

describe('partial-pack classifier — exclusion: repair_required', () => {
  it('excludes a section with gate/review run + active_blockers but no synthesis artifacts', async () => {
    const research = makeResearch([{ id: '05-repair', purpose: 'repair section' }]);
    const handoff = makeHandoff([
      makeHandoffSection({
        section_id: '05-repair',
        purpose: 'repair section',
        gate_verdict: 'fail',
        synthesis_eligible: true,
        active_blockers: ['contradiction_unresolved: c_42'],
      }),
    ]);

    const result = await classifySections({ packPath, research, handoff });
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe('repair_required');
    expect(result.excluded[0]!.detail).toContain('contradiction_unresolved');
  });
});

describe('partial-pack classifier — exclusion: prose_error', () => {
  it('excludes a section whose section-synthesis.json has proseError populated', async () => {
    await writeSectionSynthesis('06-prose-err', {
      status: 'partial_synthesis',
      section_id: '06-prose-err',
      section_purpose: 'failed prose section',
      proseError: {
        code: 'no_answer_cluster',
        message: 'No accepted claim was assigned the answer role.',
        accepted_claim_count: 20,
        unused_count: 1,
        section_purpose: 'failed prose section',
        unused_claims: [],
      },
    });

    const research = makeResearch([{ id: '06-prose-err', purpose: 'failed prose section' }]);
    const handoff = makeHandoff([
      makeHandoffSection({ section_id: '06-prose-err', purpose: 'failed prose section' }),
    ]);

    const result = await classifySections({ packPath, research, handoff });
    expect(result.included).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe('prose_error');
    expect(result.excluded[0]!.detail).toContain('no_answer_cluster');
  });
});

describe('partial-pack classifier — exclusion: no_section_synthesis', () => {
  it('excludes a section that has section-brief.md but no section-synthesis.json', async () => {
    await writeSectionBrief('07-brief-only', '# Section brief\n');

    const research = makeResearch([{ id: '07-brief-only', purpose: 'brief only section' }]);
    const handoff = makeHandoff([
      makeHandoffSection({ section_id: '07-brief-only', purpose: 'brief only section' }),
    ]);

    const result = await classifySections({ packPath, research, handoff });
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe('no_section_synthesis');
    expect(result.excluded[0]!.detail).toContain('section-brief.md exists');
  });
});

describe('partial-pack classifier — exclusion: brief_only', () => {
  it('excludes a section whose section-synthesis.json has zero prose paragraphs', async () => {
    await writeSectionSynthesis('08-empty-prose', {
      status: 'partial_synthesis',
      section_id: '08-empty-prose',
      section_purpose: 'empty prose section',
      prose: { paragraphs: [] },
    });

    const research = makeResearch([{ id: '08-empty-prose', purpose: 'empty prose section' }]);
    const handoff = makeHandoff([
      makeHandoffSection({ section_id: '08-empty-prose', purpose: 'empty prose section' }),
    ]);

    const result = await classifySections({ packPath, research, handoff });
    expect(result.excluded[0]!.reason).toBe('brief_only');
    expect(result.excluded[0]!.detail).toContain('no prose paragraphs');
  });

  it('excludes a section whose prose paragraphs are all non-faithful', async () => {
    await writeSectionSynthesis('09-all-unfaithful', {
      status: 'partial_synthesis',
      section_id: '09-all-unfaithful',
      section_purpose: 'all unfaithful section',
      prose: {
        paragraphs: [
          {
            paragraph_id: 'p1',
            role: 'answer',
            text: 'Unsupported.',
            verifier_decision: 'unsupported_connective',
            support_bundle: { claim_ids: ['c1'], source_card_ids: ['s1'], waiver_ids: [], thin_evidence: false },
          },
        ],
      },
    });

    const research = makeResearch([{ id: '09-all-unfaithful', purpose: 'all unfaithful section' }]);
    const handoff = makeHandoff([
      makeHandoffSection({ section_id: '09-all-unfaithful', purpose: 'all unfaithful section' }),
    ]);

    const result = await classifySections({ packPath, research, handoff });
    expect(result.excluded[0]!.reason).toBe('brief_only');
    expect(result.excluded[0]!.detail).toContain('none passed verification');
  });
});

describe('partial-pack classifier — mixed pack', () => {
  it('produces the correct included + excluded mix for a real-shaped pack', async () => {
    // One good section + one gate_blocked + one prose_error + one unrun.
    await writeSectionSynthesis('06-good', {
      status: 'partial_synthesis',
      prose: {
        paragraphs: [
          {
            paragraph_id: 'p1',
            role: 'answer',
            text: 'Pack-level answer.',
            verifier_decision: 'faithful',
            support_bundle: { claim_ids: [], source_card_ids: [], waiver_ids: [], thin_evidence: false },
          },
        ],
      },
    });
    await writeSectionSynthesis('07-prose-err', {
      status: 'partial_synthesis',
      proseError: { code: 'no_answer_cluster', message: 'No accepted claim was assigned the answer role.' },
    });

    const research = makeResearch([
      { id: '01-blocked', purpose: 'blocked' },
      { id: '06-good', purpose: 'good' },
      { id: '07-prose-err', purpose: 'failed prose' },
      { id: '08-orphan', purpose: 'orphan' },
    ]);
    const handoff = makeHandoff([
      makeHandoffSection({
        section_id: '01-blocked',
        purpose: 'blocked',
        gate_verdict: 'blocked',
        synthesis_eligible: false,
        blocking_reasons: ['floor'],
      }),
      makeHandoffSection({ section_id: '06-good', purpose: 'good' }),
      makeHandoffSection({ section_id: '07-prose-err', purpose: 'failed prose' }),
      // 08-orphan deliberately missing from handoff.
    ]);

    const result = await classifySections({ packPath, research, handoff });
    expect(result.included.map((s) => s.section_id)).toEqual(['06-good']);
    const excludedIds = result.excluded.map((s) => `${s.section_id}:${s.reason}`).sort();
    expect(excludedIds).toEqual(
      ['01-blocked:gate_blocked', '07-prose-err:prose_error', '08-orphan:unrun'].sort(),
    );
  });
});
