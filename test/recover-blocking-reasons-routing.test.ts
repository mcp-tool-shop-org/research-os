/**
 * v0.10 Slice 1 — R-002 (recover advisor / gate diagnose alignment).
 *
 * Bug from operator-aloneness DST gate v0.1 (2026-05-15):
 *   - gate.json.blocking_reasons[] was rooted on accepted_claim_floor
 *     (0 accepted claims, need 3 from 2 sources).
 *   - The recover advisor's diagnose layer found a source_card_classification_gap
 *     signal (source cards with missing/unknown publisher) and recommended
 *     apply_source_card_override.
 *   - Applying that override did not unblock the gate because it didn't
 *     address the actual blocking reason. The advisor was diagnosing a
 *     real-but-non-binding signal.
 *
 * R-002 fix: when gate.json:blocking_reasons[0] is present and maps to a
 * known failure_shape, that shape wins over downstream signals (like a
 * source-card classification gap). The recommendation is therefore causally
 * tied to what is actually blocking the gate.
 *
 * The diagnose layer's priority order remains otherwise unchanged:
 *   - unrun / reviewer_needs_human_review come first (sections that haven't
 *     reached the gate, or the reviewer explicitly escalated)
 *   - prose_error_* shapes come before gate-blocking shapes (gate passed but
 *     synthesis failed — blocking_reasons is necessarily empty in that case)
 *   - gate.blocking_reasons[0] → failure_shape (NEW — this is R-002)
 *   - then the legacy failures[].check-based classification as fallback
 *   - then the non-gate downstream signals (source_card_classification_gap,
 *     high_frame_excluded_rate)
 *
 * The fix also correctly handles the load-bearing real-world check name
 * `min_accepted_claims_and_sources` (the accepted-claim-floor gate check
 * was renamed; the diagnose layer's legacy check name `min_accepted_claims`
 * never matched the actual gate output, which is what surfaced the bug).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { diagnoseSection, isHealthy } from '../src/recover/diagnose.js';
import { buildActionGraph } from '../src/recover/action-graph.js';
import type { CoworkHandoffPayload } from '../src/cowork/schema.js';

let packPath: string;

beforeEach(async () => {
  packPath = await mkdtemp(join(tmpdir(), 'ros-r002-routing-'));
});

afterEach(async () => {
  await rm(packPath, { recursive: true, force: true });
});

// ── Fixture helpers (mirror recover-diagnose.test.ts shape) ────────────────

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
    generated_at: '2026-05-15T00:00:00.000Z',
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
  args: {
    failures?: Array<{ family: string; check: string }>;
    verdict?: 'pass' | 'warn' | 'fail' | 'blocked';
    blocking_reasons?: string[];
  } = {},
): Promise<void> {
  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(
    join(packPath, 'audits', `${sectionId}-gate.json`),
    JSON.stringify({
      section_id: sectionId,
      verdict: args.verdict ?? 'blocked',
      synthesis_eligible: (args.verdict ?? 'blocked') === 'pass',
      failures: (args.failures ?? []).map((f) => ({
        family: f.family,
        check: f.check,
        status: 'fail',
        detail: 'fixture',
        evidence: [],
        blocks_synthesis: true,
      })),
      warnings: [],
      waivers_applied: [],
      blocking_reasons: args.blocking_reasons ?? [],
    }),
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
      fetched_at: '2026-05-15T00:00:00.000Z',
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
      extracted_at: '2026-05-15T00:00:00.000Z',
    }),
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
      created_at: '2026-05-15T00:00:00.000Z',
      review_state: 'candidate',
    }) + '\n',
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
      created_at: '2026-05-15T00:00:01.000Z',
    }) + '\n',
    'utf8',
  );
}

// ── R-002 acceptance tests ──────────────────────────────────────────────────

describe('R-002 — gate.blocking_reasons[0] routes the diagnosis', () => {
  it('accepted_claim_floor blocker beats a co-occurring source_card_classification_gap signal', async () => {
    // Operator-aloneness DST v0.1 bug shape: gate is blocked on accepted-claim-floor
    // AND source cards have missing/unknown publisher (would normally trigger
    // source_card_classification_gap downstream). Diagnose layer must route by
    // the gate-blocking reason, not the secondary signal.
    const sectionId = '01-floor-and-classgap';
    await writeGateAudit(sectionId, {
      verdict: 'blocked',
      // Use the REAL gate check name; legacy diagnose code matched only
      // 'min_accepted_claims' and missed 'min_accepted_claims_and_sources',
      // which is what was actually emitted by the gate.
      failures: [{ family: 'accepted_claim_floor', check: 'min_accepted_claims_and_sources' }],
      blocking_reasons: [
        'accepted_claim_floor.min_accepted_claims_and_sources: 0 accepted claims from 0 sources (minimum: 3 from 2)',
      ],
    });
    // Co-occurring classification-gap signal: a source card without a publisher.
    await writeSourceCard({ sectionId, sourceId: 'src_aaaaaaaaaaaa', publisher: null });
    const ho = handoff([
      handoffSection({
        section_id: sectionId,
        gate_verdict: 'blocked',
        synthesis_eligible: false,
        blocking_reasons: [
          'accepted_claim_floor.min_accepted_claims_and_sources: 0 accepted claims from 0 sources (minimum: 3 from 2)',
        ],
      }),
    ]);
    const result = await diagnoseSection({
      packPath,
      sectionId,
      sectionPurpose: 'p',
      handoff: ho,
    });
    expect(isHealthy(result)).toBe(false);
    if (isHealthy(result)) return;
    expect(result.failure_shape).toBe('accepted_claim_floor');
    expect(result.waiveable).toBe(false);

    // The action graph for accepted_claim_floor must rank add_on_topic_sources
    // first (smallest reversible move). apply_source_card_override must NOT
    // appear in allowed_actions for this shape.
    const ag = buildActionGraph(result);
    expect(ag.allowed_actions[0]?.action_id).toBe('add_on_topic_sources');
    expect(ag.allowed_actions.map((a) => a.action_id)).not.toContain('apply_source_card_override');
    expect(ag.forbidden_actions.map((f) => f.action_id)).toContain('apply_waiver');
  });

  it('classification-gap signal wins when gate has NO claim-floor blocker', async () => {
    // No claim-floor block; gate verdict warn (no blocking_reasons). The
    // only remaining downstream signal is the missing publisher on a source
    // card. Diagnose routes to source_card_classification_gap, action graph
    // recommends apply_source_card_override.
    const sectionId = '02-classgap-only';
    await writeClaim(sectionId, 'clm_aaaaaaaaaaaa_heuristic_1');
    await writeReview(sectionId, 'clm_aaaaaaaaaaaa_heuristic_1', 'accepted_for_synthesis');
    await writeSourceCard({ sectionId, sourceId: 'src_aaaaaaaaaaaa', publisher: null });
    await writeGateAudit(sectionId, { verdict: 'warn', failures: [], blocking_reasons: [] });
    const ho = handoff([
      handoffSection({
        section_id: sectionId,
        gate_verdict: 'warn',
        synthesis_eligible: false,
      }),
    ]);
    const result = await diagnoseSection({
      packPath,
      sectionId,
      sectionPurpose: 'p',
      handoff: ho,
    });
    if (isHealthy(result)) throw new Error('not healthy');
    expect(result.failure_shape).toBe('source_card_classification_gap');

    const ag = buildActionGraph(result);
    expect(ag.allowed_actions[0]?.action_id).toBe('apply_source_card_override');
  });

  it('min_independent_publishers blocker beats a co-occurring classification-gap signal', async () => {
    // A min_independent_publishers gate block plus a source-card without
    // publisher (which would also indicate classification gap). The gate
    // block wins; the action graph recommends adding diverse sources first.
    const sectionId = '03-pubs-and-classgap';
    await writeClaim(sectionId, 'clm_aaaaaaaaaaaa_heuristic_1');
    await writeReview(sectionId, 'clm_aaaaaaaaaaaa_heuristic_1', 'accepted_for_synthesis');
    await writeSourceCard({ sectionId, sourceId: 'src_aaaaaaaaaaaa', publisher: null });
    await writeGateAudit(sectionId, {
      verdict: 'blocked',
      failures: [{ family: 'source_floor', check: 'independent_publishers' }],
      blocking_reasons: ['source_floor.independent_publishers: 0 distinct publishers (minimum: 2)'],
    });
    const ho = handoff([
      handoffSection({
        section_id: sectionId,
        gate_verdict: 'blocked',
        synthesis_eligible: false,
        blocking_reasons: ['source_floor.independent_publishers: 0 distinct publishers (minimum: 2)'],
      }),
    ]);
    const result = await diagnoseSection({
      packPath,
      sectionId,
      sectionPurpose: 'p',
      handoff: ho,
    });
    if (isHealthy(result)) throw new Error('not healthy');
    expect(result.failure_shape).toBe('min_independent_publishers');

    const ag = buildActionGraph(result);
    expect(ag.allowed_actions[0]?.action_id).toBe('add_on_topic_sources');
  });
});

describe('R-002 — real-world check name (min_accepted_claims_and_sources) classifies correctly', () => {
  it('routes accepted_claim_floor when the gate emits min_accepted_claims_and_sources (no _and_sources suffix mismatch)', async () => {
    // Direct regression test for the DST gate v0.1 bug shape: the gate emits
    // the long check name `min_accepted_claims_and_sources`, and the diagnose
    // layer must still classify the section as accepted_claim_floor. Pre-R-002,
    // diagnose checked only for the legacy synthetic name `min_accepted_claims`,
    // so the real gate output fell through to source_card_classification_gap.
    const sectionId = '04-real-check-name';
    await writeGateAudit(sectionId, {
      verdict: 'blocked',
      failures: [{ family: 'accepted_claim_floor', check: 'min_accepted_claims_and_sources' }],
      blocking_reasons: [
        'accepted_claim_floor.min_accepted_claims_and_sources: 0/3',
      ],
    });
    const ho = handoff([
      handoffSection({
        section_id: sectionId,
        gate_verdict: 'blocked',
        synthesis_eligible: false,
        blocking_reasons: [
          'accepted_claim_floor.min_accepted_claims_and_sources: 0/3',
        ],
      }),
    ]);
    const result = await diagnoseSection({
      packPath,
      sectionId,
      sectionPurpose: 'p',
      handoff: ho,
    });
    if (isHealthy(result)) throw new Error('not healthy');
    expect(result.failure_shape).toBe('accepted_claim_floor');
    expect(result.waiveable).toBe(false);
    expect(result.blocking).toBe(true);
    expect(result.stage).toBe('gate');
  });

  it('routes accepted_claim_floor even when only the handoff carries blocking_reasons (gate.json blocking_reasons empty in legacy/test fixtures)', async () => {
    // Some legacy gate fixtures emit failures[] but leave blocking_reasons[]
    // empty (cowork-derive computes the human-readable strings). When the
    // handoff has the blocking_reasons, the diagnose layer should still
    // honor them as the authoritative routing signal — the handoff is the
    // canonical "what is blocking" surface for the pack.
    const sectionId = '05-handoff-only-blocker';
    await writeGateAudit(sectionId, {
      verdict: 'blocked',
      failures: [{ family: 'accepted_claim_floor', check: 'min_accepted_claims_and_sources' }],
      blocking_reasons: [],
    });
    await writeSourceCard({ sectionId, sourceId: 'src_aaaaaaaaaaaa', publisher: null });
    const ho = handoff([
      handoffSection({
        section_id: sectionId,
        gate_verdict: 'blocked',
        synthesis_eligible: false,
        blocking_reasons: [
          'accepted_claim_floor.min_accepted_claims_and_sources: 0/3',
        ],
      }),
    ]);
    const result = await diagnoseSection({
      packPath,
      sectionId,
      sectionPurpose: 'p',
      handoff: ho,
    });
    if (isHealthy(result)) throw new Error('not healthy');
    expect(result.failure_shape).toBe('accepted_claim_floor');
  });
});
