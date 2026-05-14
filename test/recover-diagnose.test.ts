/**
 * v0.9 Slice 3 — diagnosis layer tests.
 *
 * Each of the 9 failure shapes gets a minimal-fixture unit test that
 * constructs the smallest possible filesystem + handoff state to trigger
 * that shape, then asserts diagnose() classifies it correctly.
 *
 * Healthy sections are also tested — the diagnosis layer must NOT
 * misclassify a healthy section as a failure.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { diagnoseSection, isHealthy } from '../src/recover/diagnose.js';
import type { CoworkHandoffPayload } from '../src/cowork/schema.js';

let packPath: string;

beforeEach(async () => {
  packPath = await mkdtemp(join(tmpdir(), 'ros-recover-diagnose-'));
});

afterEach(async () => {
  await rm(packPath, { recursive: true, force: true });
});

// ── Fixture helpers ─────────────────────────────────────────────────────────

function handoffSection(args: {
  section_id: string;
  has_gate_run?: boolean;
  has_review_run?: boolean;
  gate_verdict?: string | null;
  synthesis_eligible?: boolean;
  blocking_reasons?: string[];
}): CoworkHandoffPayload['sections'][number] {
  return {
    section_id: args.section_id,
    purpose: 'fixture',
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
    active_blockers: [],
    blocking_contradictions_unresolved: 0,
  };
}

function handoff(sections: CoworkHandoffPayload['sections']): CoworkHandoffPayload {
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

async function writeGateAudit(
  sectionId: string,
  failures: Array<{ family: string; check: string }>,
  verdict: 'pass' | 'warn' | 'fail' | 'blocked' = 'blocked',
): Promise<void> {
  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(
    join(packPath, 'audits', `${sectionId}-gate.json`),
    JSON.stringify({
      section_id: sectionId,
      verdict,
      synthesis_eligible: verdict === 'pass',
      failures: failures.map((f) => ({
        family: f.family,
        check: f.check,
        status: 'fail',
        detail: 'fixture',
        evidence: [],
        blocks_synthesis: true,
      })),
      warnings: [],
      waivers_applied: [],
      blocking_reasons: [],
    }),
    'utf8',
  );
}

async function writeReview(sectionId: string, claimId: string, decision: string): Promise<void> {
  await mkdir(join(packPath, 'sections', sectionId), { recursive: true });
  await appendFile(
    join(packPath, 'sections', sectionId, 'claim-reviews.jsonl'),
    JSON.stringify({
      claim_id: claimId,
      decision,
      reason: 'fixture',
      finding_ids: [],
      reviewer: 'heuristic',
      review_method: 'heuristic_field_and_grounding_checks',
      created_at: '2026-05-13T00:00:01.000Z',
    }) + '\n',
    'utf8',
  );
}

async function writeClaim(sectionId: string, claimId: string): Promise<void> {
  await mkdir(join(packPath, 'sections', sectionId), { recursive: true });
  await appendFile(
    join(packPath, 'sections', sectionId, 'claims.jsonl'),
    JSON.stringify({
      claim_id: claimId,
      section_id: sectionId,
      source_ids: [`src_${'a'.repeat(12)}`],
      source_hashes: ['a'.repeat(64)],
      asserts: 'fixture',
      scope: 's',
      not: 'n',
      evidence_excerpt: 'x',
      evidence_location: null,
      confidence: 'medium',
      extractor: 'heuristic',
      extraction_method: 'heuristic_key_point',
      created_at: '2026-05-13T00:00:00.000Z',
      review_state: 'candidate',
    }) + '\n',
    'utf8',
  );
}

async function writeSourceCard(args: {
  sectionId: string;
  sourceId: string;
  publisher?: string | null;
  sourceType?: string;
}): Promise<void> {
  const dir = join(packPath, 'evidence', 'source-cards');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${args.sourceId}.json`),
    JSON.stringify({
      source_id: args.sourceId,
      receipt_id: `rcpt_${args.sourceId.slice(4)}_1`,
      section_id: args.sectionId,
      url: `https://example.com/${args.sourceId}`,
      final_url: `https://example.com/${args.sourceId}`,
      fetched_at: '2026-05-13T00:00:00.000Z',
      publisher: args.publisher ?? null,
      published_at: null,
      title: `Title for ${args.sourceId}`,
      source_type: args.sourceType ?? 'docs',
      relevance: 'high',
      key_points: ['x'],
      limitations: [],
      asserts: 'fixture',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-13T00:00:00.000Z',
    }),
    'utf8',
  );
}

async function writeSectionSynthesis(sectionId: string, content: Record<string, unknown>): Promise<void> {
  const dir = join(packPath, 'sections', sectionId, 'synthesis');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'section-synthesis.json'), JSON.stringify(content), 'utf8');
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('diagnoseSection — accepted_claim_floor', () => {
  it('classifies a section with min_accepted_claims gate failure', async () => {
    const sectionId = '01-floor';
    await writeGateAudit(sectionId, [{ family: 'accepted_claim_floor', check: 'min_accepted_claims' }]);
    const ho = handoff([handoffSection({
      section_id: sectionId,
      gate_verdict: 'blocked',
      synthesis_eligible: false,
      blocking_reasons: ['accepted_claim_floor.min_accepted_claims: 0/3'],
    })]);
    const result = await diagnoseSection({ packPath, sectionId, sectionPurpose: 'p', handoff: ho });
    expect(isHealthy(result)).toBe(false);
    if (isHealthy(result)) return;
    expect(result.failure_shape).toBe('accepted_claim_floor');
    expect(result.waiveable).toBe(false);
    expect(result.blocking).toBe(true);
    expect(result.stage).toBe('gate');
  });
});

describe('diagnoseSection — min_independent_publishers', () => {
  it('classifies a section with independent_publishers gate failure', async () => {
    const sectionId = '02-pubs';
    await writeGateAudit(sectionId, [{ family: 'source_floor', check: 'independent_publishers' }]);
    await writeClaim(sectionId, 'clm_aaaaaaaaaaaa_heuristic_1');
    await writeReview(sectionId, 'clm_aaaaaaaaaaaa_heuristic_1', 'accepted_for_synthesis');
    await writeSourceCard({ sectionId, sourceId: 'src_aaaaaaaaaaaa', publisher: 'OnlyPub' });
    const ho = handoff([handoffSection({
      section_id: sectionId,
      gate_verdict: 'blocked',
      synthesis_eligible: false,
      blocking_reasons: ['source_floor.independent_publishers: 1/4'],
    })]);
    const result = await diagnoseSection({ packPath, sectionId, sectionPurpose: 'p', handoff: ho });
    if (isHealthy(result)) {
      throw new Error('should not be healthy');
    }
    expect(result.failure_shape).toBe('min_independent_publishers');
    expect(result.waiveable).toBe(true);
  });
});

describe('diagnoseSection — primary_sources_required', () => {
  it('classifies a section with primary_sources_required gate failure', async () => {
    const sectionId = '03-primary';
    await writeGateAudit(sectionId, [{ family: 'source_floor', check: 'primary_sources_required' }]);
    const ho = handoff([handoffSection({
      section_id: sectionId,
      gate_verdict: 'blocked',
      synthesis_eligible: false,
    })]);
    const result = await diagnoseSection({ packPath, sectionId, sectionPurpose: 'p', handoff: ho });
    if (isHealthy(result)) throw new Error('not healthy');
    expect(result.failure_shape).toBe('primary_sources_required');
    expect(result.waiveable).toBe(true);
  });
});

describe('diagnoseSection — high_frame_excluded_rate', () => {
  it('classifies a section where >50% of extracted claims are frame_excluded', async () => {
    const sectionId = '04-framed';
    // 4 extracted, 3 frame_excluded — ratio 0.75 > 0.5.
    for (let i = 1; i <= 4; i++) {
      await writeClaim(sectionId, `clm_aaaaaaaaaaaa_heuristic_${i}`);
    }
    await writeReview(sectionId, 'clm_aaaaaaaaaaaa_heuristic_1', 'accepted_for_synthesis');
    await writeReview(sectionId, 'clm_aaaaaaaaaaaa_heuristic_2', 'frame_excluded');
    await writeReview(sectionId, 'clm_aaaaaaaaaaaa_heuristic_3', 'frame_excluded');
    await writeReview(sectionId, 'clm_aaaaaaaaaaaa_heuristic_4', 'frame_excluded');
    await writeGateAudit(sectionId, [], 'warn'); // gate didn't block on a specific check
    const ho = handoff([handoffSection({
      section_id: sectionId,
      gate_verdict: 'warn',
      synthesis_eligible: false,
    })]);
    const result = await diagnoseSection({ packPath, sectionId, sectionPurpose: 'p', handoff: ho });
    if (isHealthy(result)) throw new Error('not healthy');
    expect(result.failure_shape).toBe('high_frame_excluded_rate');
    expect(result.waiveable).toBe(false);
  });
});

describe('diagnoseSection — prose_error_no_answer_cluster', () => {
  it('classifies a section whose section-synthesis.json has proseError code no_answer_cluster', async () => {
    const sectionId = '05-noanswer';
    await writeSectionSynthesis(sectionId, {
      status: 'partial_synthesis',
      proseError: { code: 'no_answer_cluster', message: 'x' },
    });
    const ho = handoff([handoffSection({
      section_id: sectionId,
      gate_verdict: 'pass',
      synthesis_eligible: true,
    })]);
    const result = await diagnoseSection({ packPath, sectionId, sectionPurpose: 'p', handoff: ho });
    if (isHealthy(result)) throw new Error('not healthy');
    expect(result.failure_shape).toBe('prose_error_no_answer_cluster');
    expect(result.stage).toBe('synthesis');
    expect(result.waiveable).toBe(false);
  });
});

describe('diagnoseSection — prose_error_cross_section_missing', () => {
  it('classifies a section with cross_section_answer_support_missing proseError', async () => {
    const sectionId = '06-xsect';
    await writeSectionSynthesis(sectionId, {
      status: 'partial_synthesis',
      proseError: { code: 'cross_section_answer_support_missing', message: 'x' },
    });
    const ho = handoff([handoffSection({
      section_id: sectionId,
      gate_verdict: 'pass',
      synthesis_eligible: true,
    })]);
    const result = await diagnoseSection({ packPath, sectionId, sectionPurpose: 'p', handoff: ho });
    if (isHealthy(result)) throw new Error('not healthy');
    expect(result.failure_shape).toBe('prose_error_cross_section_missing');
  });
});

describe('diagnoseSection — unrun', () => {
  it('classifies a section with no handoff entry', async () => {
    const ho = handoff([]);
    const result = await diagnoseSection({ packPath, sectionId: '07-orphan', sectionPurpose: 'p', handoff: ho });
    if (isHealthy(result)) throw new Error('not healthy');
    expect(result.failure_shape).toBe('unrun');
  });

  it('classifies a section with handoff entry but no gate or review run', async () => {
    const ho = handoff([handoffSection({
      section_id: '08-untouched',
      has_gate_run: false,
      has_review_run: false,
    })]);
    const result = await diagnoseSection({ packPath, sectionId: '08-untouched', sectionPurpose: 'p', handoff: ho });
    if (isHealthy(result)) throw new Error('not healthy');
    expect(result.failure_shape).toBe('unrun');
  });
});

describe('diagnoseSection — source_card_classification_gap', () => {
  it('classifies a section with a source card lacking publisher', async () => {
    const sectionId = '09-classgap';
    await writeClaim(sectionId, 'clm_aaaaaaaaaaaa_heuristic_1');
    await writeReview(sectionId, 'clm_aaaaaaaaaaaa_heuristic_1', 'accepted_for_synthesis');
    await writeSourceCard({ sectionId, sourceId: 'src_aaaaaaaaaaaa', publisher: null });
    // No gate failure on accepted_claim_floor or independent_publishers in the gate audit —
    // the classifier should look at classification next.
    await writeGateAudit(sectionId, [], 'warn');
    const ho = handoff([handoffSection({
      section_id: sectionId,
      gate_verdict: 'warn',
      synthesis_eligible: false,
    })]);
    const result = await diagnoseSection({ packPath, sectionId, sectionPurpose: 'p', handoff: ho });
    if (isHealthy(result)) throw new Error('not healthy');
    expect(result.failure_shape).toBe('source_card_classification_gap');
  });
});

describe('diagnoseSection — reviewer_needs_human_review', () => {
  it('classifies a section with any needs_human_review decision', async () => {
    const sectionId = '10-needshuman';
    await writeClaim(sectionId, 'clm_aaaaaaaaaaaa_heuristic_1');
    await writeReview(sectionId, 'clm_aaaaaaaaaaaa_heuristic_1', 'needs_human_review');
    const ho = handoff([handoffSection({
      section_id: sectionId,
      gate_verdict: 'warn',
      synthesis_eligible: false,
    })]);
    const result = await diagnoseSection({ packPath, sectionId, sectionPurpose: 'p', handoff: ho });
    if (isHealthy(result)) throw new Error('not healthy');
    expect(result.failure_shape).toBe('reviewer_needs_human_review');
    expect(result.stage).toBe('review');
  });
});

describe('diagnoseSection — healthy', () => {
  it('returns status: healthy for a section with accepted claims + passing gate + no proseError', async () => {
    const sectionId = '11-healthy';
    await writeClaim(sectionId, 'clm_aaaaaaaaaaaa_heuristic_1');
    await writeReview(sectionId, 'clm_aaaaaaaaaaaa_heuristic_1', 'accepted_for_synthesis');
    await writeSourceCard({ sectionId, sourceId: 'src_aaaaaaaaaaaa', publisher: 'GoodPub' });
    await writeGateAudit(sectionId, [], 'pass');
    await writeSectionSynthesis(sectionId, {
      status: 'partial_synthesis',
      prose: {
        paragraphs: [
          {
            paragraph_id: 'p1',
            role: 'answer',
            text: 'answer paragraph',
            verifier_decision: 'faithful',
            support_bundle: { claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1'], source_card_ids: ['src_aaaaaaaaaaaa'], waiver_ids: [], thin_evidence: false },
          },
        ],
      },
    });
    const ho = handoff([handoffSection({
      section_id: sectionId,
      gate_verdict: 'pass',
      synthesis_eligible: true,
      blocking_reasons: [],
    })]);
    const result = await diagnoseSection({ packPath, sectionId, sectionPurpose: 'p', handoff: ho });
    expect(isHealthy(result)).toBe(true);
  });
});

describe('diagnoseSection — priority order', () => {
  it('prioritizes prose_error_no_answer_cluster over a gate failure when both might apply', async () => {
    const sectionId = '12-priority';
    // proseError signals gate passed but synthesis failed; we should pick the
    // synthesis-stage failure shape, not regress to gate.
    await writeSectionSynthesis(sectionId, {
      status: 'partial_synthesis',
      proseError: { code: 'no_answer_cluster', message: 'x' },
    });
    // No gate audit — the priority order should still classify via the
    // synthesis signal first.
    const ho = handoff([handoffSection({
      section_id: sectionId,
      gate_verdict: 'pass',
      synthesis_eligible: true,
    })]);
    const result = await diagnoseSection({ packPath, sectionId, sectionPurpose: 'p', handoff: ho });
    if (isHealthy(result)) throw new Error('not healthy');
    expect(result.failure_shape).toBe('prose_error_no_answer_cluster');
  });
});
