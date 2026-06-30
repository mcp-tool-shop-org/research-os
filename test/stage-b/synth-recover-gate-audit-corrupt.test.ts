/**
 * Stage B — B-RECOVER-002 (degradation): readGateAudit() best-effort posture.
 *
 * A single corrupt audits/<id>-gate.json must NOT throw a raw SyntaxError
 * that aborts the whole diagnose/recover-pack run. Instead diagnose() degrades
 * that one section to the downstream/legacy classification (gate signal absent)
 * — mirroring the other diagnose readers (readJsonl skips bad lines,
 * readSectionSourceCards swallows, readSectionSynthesis returns null).
 *
 * Both halves proven:
 *   RED   — without the try/catch, JSON.parse throws and diagnoseSection rejects.
 *   GREEN — diagnoseSection resolves; the section degrades to a downstream shape
 *           (source_card_classification_gap here) rather than crashing.
 *   Happy path — a well-formed gate audit still classifies via the gate signal.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { diagnoseSection, isHealthy } from '../../src/recover/diagnose.js';
import type { CoworkHandoffPayload } from '../../src/cowork/schema.js';

let packPath: string;

beforeEach(async () => {
  packPath = await mkdtemp(join(tmpdir(), 'ros-synth-gate-corrupt-'));
});

afterEach(async () => {
  await rm(packPath, { recursive: true, force: true });
});

function handoffSection(args: {
  section_id: string;
  gate_verdict?: string | null;
  blocking_reasons?: string[];
}): CoworkHandoffPayload['sections'][number] {
  return {
    section_id: args.section_id,
    purpose: 'fixture',
    status: 'gated',
    has_gate_run: true,
    has_review_run: true,
    gate_verdict: args.gate_verdict ?? 'blocked',
    synthesis_eligible: false,
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

function makeHandoff(sections: CoworkHandoffPayload['sections']): CoworkHandoffPayload {
  return {
    pack_id: 'pack_test',
    pack_topic: 'fixture',
    generated_at: '2026-06-29T00:00:00.000Z',
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

async function writeCorruptGateAudit(sectionId: string): Promise<void> {
  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(
    join(packPath, 'audits', `${sectionId}-gate.json`),
    '{ this is not valid json :: <<< truncated',
    'utf8',
  );
}

async function writeValidGateAudit(sectionId: string): Promise<void> {
  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(
    join(packPath, 'audits', `${sectionId}-gate.json`),
    JSON.stringify({
      section_id: sectionId,
      verdict: 'blocked',
      synthesis_eligible: false,
      failures: [
        { family: 'accepted_claim_floor', check: 'min_accepted_claims', status: 'fail', detail: '0/3', evidence: [], blocks_synthesis: true },
      ],
      warnings: [],
      waivers_applied: [],
      blocking_reasons: ['accepted_claim_floor.min_accepted_claims: 0/3'],
    }),
    'utf8',
  );
}

// A source card with an unknown publisher → downstream
// source_card_classification_gap signal (the shape diagnose falls through to
// once the gate signal is absent because the gate audit is corrupt).
async function writeUnknownPublisherCard(sectionId: string): Promise<void> {
  const dir = join(packPath, 'evidence', 'source-cards');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'src_abcdef012345.json'),
    JSON.stringify({
      source_id: 'src_abcdef012345',
      receipt_id: 'rcpt_abcdef012345_1',
      section_id: sectionId,
      url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      fetched_at: '2026-06-29T00:00:00.000Z',
      publisher: 'unknown',
      published_at: null,
      title: 'unknown publisher card',
      source_type: 'unknown',
      relevance: 'high',
      key_points: ['k'],
      limitations: [],
      asserts: 'x',
      scope: 'y',
      not: 'z',
      extracted_by: 'ollama-intern',
      extracted_at: '2026-06-29T00:00:00.000Z',
    }),
    'utf8',
  );
}

describe('B-RECOVER-002 — corrupt gate audit degrades instead of crashing', () => {
  const SECTION = '01-corrupt-gate';

  it('does NOT throw when audits/<id>-gate.json is corrupt; degrades to a downstream shape', async () => {
    await writeCorruptGateAudit(SECTION);
    await writeUnknownPublisherCard(SECTION);
    const handoff = makeHandoff([handoffSection({ section_id: SECTION })]);

    // The whole point: this resolves rather than rejecting with a SyntaxError.
    const result = await diagnoseSection({
      packPath,
      sectionId: SECTION,
      sectionPurpose: 'fixture',
      handoff,
    });

    expect(isHealthy(result)).toBe(false);
    // Gate signal absent (corrupt) → falls through to the downstream
    // source_card_classification_gap signal rather than crashing.
    expect((result as { failure_shape: string }).failure_shape).toBe(
      'source_card_classification_gap',
    );
  });

  it('happy path: a well-formed gate audit still classifies via the gate signal', async () => {
    await writeValidGateAudit(SECTION);
    const handoff = makeHandoff([
      handoffSection({
        section_id: SECTION,
        blocking_reasons: ['accepted_claim_floor.min_accepted_claims: 0/3'],
      }),
    ]);

    const result = await diagnoseSection({
      packPath,
      sectionId: SECTION,
      sectionPurpose: 'fixture',
      handoff,
    });

    expect(isHealthy(result)).toBe(false);
    expect((result as { failure_shape: string }).failure_shape).toBe('accepted_claim_floor');
  });
});
