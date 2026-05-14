/**
 * v0.9 Slice 3b — embed recovery advisor output into partial-pack synthesis.
 *
 * Tests (8 categories per dispatch):
 *   1. Integration — synth pack --partial writes both partial-pack-synthesis.json
 *      AND recovery/blocked-section-recovery.{md,json} from the same in-memory
 *      recovery object. Each excluded section in partial-pack-synthesis.json
 *      has a populated recovery_summary.
 *   2. Invariant — accepted_claim_floor still bans apply_waiver in do_not[],
 *      and the recommended_action is never apply_waiver.
 *   3. Invariant — prose_error_no_answer_cluster still bans rerun_stage in
 *      do_not[], and the recommended_action is never rerun_stage.
 *   4. Schema backward-compat — a partial-pack-synthesis.json artifact WITHOUT
 *      recovery_summary parses cleanly (older Slice 2 outputs still load).
 *   5. Deterministic fallback path — when the advisor fails the verifier twice,
 *      recovery_summary.advisor_path === 'deterministic_fallback' and the
 *      recommended_action_id still comes from the action graph.
 *   6. Markdown rendering — the partial-pack-synthesis.md has "Recommended
 *      next action:" + "Do not:" + full-recovery link under each excluded
 *      section heading.
 *   7. Source-of-truth — for each excluded section, recovery_summary.
 *      recommended_action_id matches blocked-section-recovery.json's advice.
 *      recommended_action.action_id for the same section. No drift between
 *      the standalone and embedded paths.
 *   8. recovery_unavailable when the canonical engine cannot produce a result
 *      for a section. The orchestrator MUST surface an explicit
 *      recovery_unavailable block — silent omission is forbidden.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { handoff as coworkHandoff } from '../src/cowork/index.js';
import { partialPackSynthesis } from '../src/synth/index.js';
import { freeze as runFreeze } from '../src/freeze/index.js';
import {
  PartialPackArtifactSchema,
  PartialPackExcludedSectionSchema,
  RecoverySummarySchema,
  recoveryUnavailableSummary,
  RECOVERY_SUMMARY_SOURCE,
  RECOVERY_SUMMARY_MARKDOWN_SOURCE,
} from '../src/synth/partial-pack/index.js';
import type { ProseCallToolClient } from '../src/synth/prose/types.js';
import type { RecoveryActionId } from '../src/recover/types.js';

let workDir: string;
let packPath: string;

// Section ids — keep numeric prefixes so the [section_id:p_id] regex in the
// drafter prompt parsing still matches.
const SECTION_GOOD = '06-good-section';
const SECTION_FLOOR = '01-floor-blocked';
const SECTION_NOANS = '02-noans-prose-error';
const SECTION_UNRUN = '03-unrun-section';

interface FakeClientOptions {
  bannedOpener?: boolean;
  // When true, the advisor returns advice with empty contrastive_framing so
  // the verifier rejects it. Retry produces the same invalid output → falls
  // back to deterministic.
  advisorFailsVerifier?: boolean;
}

/**
 * Parse the recovery advisor prompt to extract section_id, failure_shape,
 * allowed action ids (sorted by rank), and forbidden actions. This lets the
 * mock advisor produce verifier-passing advice regardless of which failure
 * shape is being diagnosed.
 */
function parseAdvisorPrompt(text: string): {
  sectionId: string;
  failureShape: string;
  allowedActionIds: string[];
  forbiddenActions: Array<{ action_id: string; why_forbidden: string }>;
} {
  const sectionId = text.match(/section_id:\s+(\S+)/)?.[1] ?? '';
  const failureShape = text.match(/failure_shape:\s+(\S+)/)?.[1] ?? '';

  const allowedMatches = Array.from(
    text.matchAll(/\[rank (\d+)\] action_id=([a-z_]+)/g),
  );
  const allowedActionIds = allowedMatches
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map((m) => m[2]!);

  const forbiddenActions: Array<{ action_id: string; why_forbidden: string }> = [];
  const forbiddenBlockMatch = text.match(
    /=====\s*FORBIDDEN ACTIONS[^=]*=====\s*([\s\S]*?)(?:=====|$)/,
  );
  if (forbiddenBlockMatch) {
    const forbiddenBlock = forbiddenBlockMatch[1]!;
    const actionMatches = Array.from(
      forbiddenBlock.matchAll(
        /action_id=([a-z_]+)\s*\n\s*why_forbidden:\s*([^\n]+)/g,
      ),
    );
    for (const m of actionMatches) {
      forbiddenActions.push({
        action_id: m[1]!,
        why_forbidden: m[2]!.trim(),
      });
    }
  }

  return { sectionId, failureShape, allowedActionIds, forbiddenActions };
}

/**
 * Fake MCP client that handles BOTH drafter calls and recovery advisor calls.
 * The drafter is identified by the absence of "===== SECTION DIAGNOSIS" in
 * the prompt; the advisor is identified by its presence.
 */
function makeFakeClient(opts: FakeClientOptions = {}): ProseCallToolClient {
  return {
    async callTool(params) {
      const args = params.arguments as Record<string, unknown>;
      const text = typeof args.text === 'string' ? args.text : '';

      const isAdvisor = text.includes('===== SECTION DIAGNOSIS');

      if (isAdvisor) {
        const parsed = parseAdvisorPrompt(text);
        const topAllowed = parsed.allowedActionIds[0] ?? 'defer_to_human_review';

        const contrastiveFraming = opts.advisorFailsVerifier
          ? '' // rule 4 fails → verifier rejects → triggers retry → also fails → fallback
          : 'You might think the right fix is X. It is not, because the diagnosis shows Y. The smallest reversible move is to take the top-ranked allowed action.';

        const advice = {
          section_id: parsed.sectionId,
          failure_summary: `Mock failure summary for ${parsed.failureShape}.`,
          recommended_action: {
            action_id: topAllowed,
            rank_taken: 1,
            contrastive_framing: contrastiveFraming,
            why_smallest_reversible:
              'Mock rationale: this is the most reversible action available per the action graph.',
            command_hint: 'mock-command',
            expected_outcome:
              'Mock expected outcome — after applying this, re-run diagnose and the section should advance.',
          },
          also_consider: [],
          // Surface every forbidden action in do_not so verifier rule 3 passes
          // (operator-tempting forbidden actions must be present).
          do_not: parsed.forbiddenActions.map((f) => ({
            action_id: f.action_id,
            why_not: f.why_forbidden,
          })),
          system_cannot_see: [
            'Mock disclosure: the operator may have uncommitted edits the system cannot see.',
          ],
          confidence: 'high',
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ result: { ok: true, data: advice } }),
            },
          ],
        };
      }

      // Drafter call — reuse the existing pattern from
      // synth-partial-pack-integration.test.ts.
      const idMatches = text.match(/\[([0-9]{2}-[a-z0-9-]+:p\d+)\]/g) ?? [];
      const ids = Array.from(new Set(idMatches.map((m) => m.slice(1, -1))));

      const answerText = opts.bannedOpener
        ? 'This synthesis provides a pack-level summary of the included sections.'
        : 'Evidence custody in this pack requires both content-hash version control and PROV-derived provenance records.';

      const data = {
        paragraphs: [
          {
            role: 'answer',
            text: answerText,
            section_paragraph_ids: ids,
          },
          {
            role: 'evidence',
            text: 'The included section paragraphs converge on artifact-tracking via content hashes.',
            section_paragraph_ids: ids,
          },
        ],
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ result: { ok: true, data } }),
          },
        ],
      };
    },
  };
}

/**
 * Build a fixture pack with 1 included section + 3 excluded sections covering
 * 3 different failure shapes:
 *   - 01-floor-blocked   → accepted_claim_floor (gate_blocked)
 *   - 02-noans-prose-err → prose_error_no_answer_cluster (prose_error)
 *   - 03-unrun-section   → unrun
 *   - 06-good-section    → healthy / included (drives the drafter)
 */
async function buildFixture(): Promise<void> {
  const r = await init({
    topic: 'Partial-pack recovery embed fixture',
    outDir: workDir,
  });
  packPath = r.packPath;

  // Add sections in research.yaml order.
  await sectionAdd({
    id: SECTION_FLOOR,
    purpose: 'Section blocked on accepted_claim_floor for testing recovery embed',
    packPath,
  });
  await sectionAdd({
    id: SECTION_NOANS,
    purpose: 'Section with prose_error_no_answer_cluster for testing recovery embed',
    packPath,
  });
  await sectionAdd({
    id: SECTION_UNRUN,
    purpose: 'Section deliberately left unrun to test recovery embed',
    packPath,
  });
  await sectionAdd({
    id: SECTION_GOOD,
    purpose: 'What does evidence custody require in a local-first workflow?',
    packPath,
  });

  // ── SECTION_GOOD: 2 sources, 3 accepted claims, section-synthesis with prose
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  for (const s of [
    { id: 'src_aaaaaaaaaaaa', publisher: 'DVC' },
    { id: 'src_bbbbbbbbbbbb', publisher: 'The Turing Way' },
  ]) {
    await writeFile(
      join(cardDir, `${s.id}.json`),
      JSON.stringify({
        source_id: s.id,
        receipt_id: `rcpt_${s.id.replace(/^src_/, '')}_1`,
        section_id: SECTION_GOOD,
        url: `https://example.com/${s.id}`,
        final_url: `https://example.com/${s.id}`,
        fetched_at: '2026-05-12T00:00:00.000Z',
        publisher: s.publisher,
        published_at: null,
        title: `${s.publisher} docs on evidence custody`,
        source_type: 'docs',
        relevance: 'high',
        key_points: ['key point'],
        limitations: [],
        asserts: 'Evidence custody matters for reproducibility',
        scope: 'ML pipeline artifact tracking',
        not: 'general file backup',
        extracted_by: 'ollama-intern',
        extracted_at: '2026-05-12T00:00:00.000Z',
      }),
      'utf8',
    );
    await appendFile(
      join(packPath, 'sections', SECTION_GOOD, 'sources.jsonl'),
      JSON.stringify({ source_id: s.id, added_at: '2026-05-12T00:00:00.000Z' }) +
        '\n',
      'utf8',
    );
    await appendFile(
      join(packPath, 'evidence', 'fetch-log.jsonl'),
      JSON.stringify({
        receipt_id: `rcpt_${s.id.replace(/^src_/, '')}_1`,
        source_id: s.id,
        section_id: SECTION_GOOD,
        requested_url: `https://example.com/${s.id}`,
        final_url: `https://example.com/${s.id}`,
        status: 200,
        status_text: 'OK',
        content_type: 'text/html',
        fetched_at: '2026-05-12T00:00:00.000Z',
        byte_count: 100,
        sha256: createHash('sha256').update(s.id).digest('hex'),
        title: `${s.publisher} docs`,
        raw_text_path: `evidence/raw/${s.id}.html`,
        fetch_outcome: 'ok',
        fetch_error: null,
        extraction_outcome: 'ok',
        extraction_extractor: 'heuristic',
        extraction_error: null,
      }) + '\n',
      'utf8',
    );
  }

  for (const cid of ['clm_aaaaaaaaaaaa_heuristic_1', 'clm_aaaaaaaaaaaa_heuristic_2', 'clm_aaaaaaaaaaaa_heuristic_3']) {
    await appendFile(
      join(packPath, 'sections', SECTION_GOOD, 'claims.jsonl'),
      JSON.stringify({
        claim_id: cid,
        section_id: SECTION_GOOD,
        source_ids: ['src_aaaaaaaaaaaa'],
        source_hashes: ['a'.repeat(64)],
        asserts: `Claim ${cid} — artifacts tracked by content hash`,
        scope: 'ML pipeline artifact tracking',
        not: 'general-purpose file backup',
        evidence_excerpt: `Excerpt for ${cid}`,
        evidence_location: null,
        confidence: 'medium',
        extractor: 'heuristic',
        extraction_method: 'heuristic_key_point',
        created_at: '2026-05-12T00:00:00.000Z',
        review_state: 'candidate',
      }) + '\n',
      'utf8',
    );
    await appendFile(
      join(packPath, 'sections', SECTION_GOOD, 'claim-reviews.jsonl'),
      JSON.stringify({
        claim_id: cid,
        decision: 'accepted_for_synthesis',
        reason: 'fixture',
        finding_ids: [],
        reviewer: 'heuristic',
        review_method: 'heuristic_field_and_grounding_checks',
        created_at: '2026-05-12T00:00:01.000Z',
      }) + '\n',
      'utf8',
    );
  }

  const goodSynthDir = join(packPath, 'sections', SECTION_GOOD, 'synthesis');
  await mkdir(goodSynthDir, { recursive: true });
  await writeFile(
    join(goodSynthDir, 'section-synthesis.json'),
    JSON.stringify(
      {
        status: 'partial_synthesis',
        scope: 'section',
        section_id: SECTION_GOOD,
        section_purpose:
          'What does evidence custody require in a local-first workflow?',
        pack_id: 'pack_fixture',
        pack_topic: 'fixture',
        pack_mode: 'repair_required',
        not_freezable_as_pack: true,
        not_publishable_as_pack: true,
        accepted_claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1', 'clm_aaaaaaaaaaaa_heuristic_2', 'clm_aaaaaaaaaaaa_heuristic_3'],
        source_ids: ['src_aaaaaaaaaaaa', 'src_bbbbbbbbbbbb'],
        waivers_applied: [],
        gate_verdict: 'pass',
        generated_at: '2026-05-13T01:00:00.000Z',
        research_os_version: '0.8.0',
        prose: {
          section_purpose:
            'What does evidence custody require in a local-first workflow?',
          paragraphs: [
            {
              paragraph_id: 'p1',
              role: 'answer',
              text: 'Evidence custody requires content-hash-based artifact tracking.',
              support_bundle: {
                claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1'],
                source_card_ids: ['src_aaaaaaaaaaaa'],
                waiver_ids: [],
                thin_evidence: false,
              },
              verifier_decision: 'faithful',
            },
            {
              paragraph_id: 'p2',
              role: 'evidence',
              text: 'DVC stores checksums in git while caching outputs.',
              support_bundle: {
                claim_ids: ['clm_aaaaaaaaaaaa_heuristic_2', 'clm_aaaaaaaaaaaa_heuristic_3'],
                source_card_ids: ['src_aaaaaaaaaaaa', 'src_bbbbbbbbbbbb'],
                waiver_ids: [],
                thin_evidence: false,
              },
              verifier_decision: 'faithful',
            },
          ],
          disclosures: {
            waivers: [],
            thin_evidence_paragraphs: [],
            unused_claims: [],
          },
          generator: {
            activity_id: 'prose_x',
            drafter_model: 'unknown',
            verifier_model: 'unknown',
            prompt_version: 'section-prose-v3',
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );
  await writeFile(join(goodSynthDir, 'section-brief.md'), '# Section brief\n', 'utf8');

  // ── SECTION_NOANS: gate passed but section-synthesis has no_answer_cluster
  const noansDir = join(packPath, 'sections', SECTION_NOANS, 'synthesis');
  await mkdir(noansDir, { recursive: true });
  await writeFile(
    join(noansDir, 'section-synthesis.json'),
    JSON.stringify(
      {
        status: 'partial_synthesis',
        scope: 'section',
        section_id: SECTION_NOANS,
        section_purpose:
          'Section with prose_error_no_answer_cluster for testing recovery embed',
        pack_id: 'pack_fixture',
        pack_topic: 'fixture',
        pack_mode: 'repair_required',
        not_freezable_as_pack: true,
        not_publishable_as_pack: true,
        accepted_claim_ids: ['clm_cccccccccccc_heuristic_1'],
        source_ids: ['src_cccccccccccc'],
        waivers_applied: [],
        gate_verdict: 'pass',
        generated_at: '2026-05-13T01:00:00.000Z',
        research_os_version: '0.8.0',
        proseError: {
          code: 'no_answer_cluster',
          message:
            'No accepted claim was assigned the answer role for this section purpose.',
        },
      },
      null,
      2,
    ),
    'utf8',
  );
  await writeFile(join(noansDir, 'section-brief.md'), '# Section brief\n', 'utf8');
  // Source + claim + review for noans section (so diagnose sees a real shape)
  await writeFile(
    join(cardDir, 'src_cccccccccccc.json'),
    JSON.stringify({
      source_id: 'src_cccccccccccc',
      receipt_id: 'rcpt_cccccccccccc_1',
      section_id: SECTION_NOANS,
      url: 'https://example.com/noans',
      final_url: 'https://example.com/noans',
      fetched_at: '2026-05-12T00:00:00.000Z',
      publisher: 'Example Publisher',
      published_at: null,
      title: 'noans source',
      source_type: 'docs',
      relevance: 'high',
      key_points: ['noans key point'],
      limitations: [],
      asserts: 'noans asserts',
      scope: 'noans scope',
      not: 'noans not',
      extracted_by: 'ollama-intern',
      extracted_at: '2026-05-12T00:00:00.000Z',
    }),
    'utf8',
  );
  await appendFile(
    join(packPath, 'sections', SECTION_NOANS, 'claims.jsonl'),
    JSON.stringify({
      claim_id: 'clm_cccccccccccc_heuristic_1',
      section_id: SECTION_NOANS,
      source_ids: ['src_cccccccccccc'],
      source_hashes: ['c'.repeat(64)],
      asserts: 'Claim about noans content',
      scope: 'noans scope',
      not: 'not noans scope',
      evidence_excerpt: 'noans excerpt',
      evidence_location: null,
      confidence: 'medium',
      extractor: 'heuristic',
      extraction_method: 'heuristic_key_point',
      created_at: '2026-05-12T00:00:00.000Z',
      review_state: 'candidate',
    }) + '\n',
    'utf8',
  );
  await appendFile(
    join(packPath, 'sections', SECTION_NOANS, 'claim-reviews.jsonl'),
    JSON.stringify({
      claim_id: 'clm_cccccccccccc_heuristic_1',
      decision: 'accepted_for_synthesis',
      reason: 'fixture',
      finding_ids: [],
      reviewer: 'heuristic',
      review_method: 'heuristic_field_and_grounding_checks',
      created_at: '2026-05-12T00:00:01.000Z',
    }) + '\n',
    'utf8',
  );

  // Gate audits.
  const auditsDir = join(packPath, 'audits');
  await mkdir(auditsDir, { recursive: true });

  // SECTION_FLOOR: gate-blocked on min_accepted_claims.
  await writeFile(
    join(auditsDir, `${SECTION_FLOOR}-gate.json`),
    JSON.stringify({
      section_id: SECTION_FLOOR,
      verdict: 'blocked',
      summary: 'no accepted claims',
      checked_at: '2026-05-12T00:00:02.000Z',
      synthesis_eligible: false,
      gate_results: [],
      failures: [
        {
          family: 'accepted_claim_floor',
          check: 'min_accepted_claims',
          status: 'fail',
          detail: '0 of 3',
          evidence: [],
          blocks_synthesis: true,
        },
      ],
      warnings: [],
      waivers_applied: [],
      blocking_reasons: ['accepted_claim_floor.min_accepted_claims: 0/3'],
      claim_counts: {
        total: 0,
        candidate: 0,
        with_evidence_excerpt: 0,
        with_source_hashes: 0,
        with_scope: 0,
        with_not: 0,
        universal_scope_null: 0,
        orphans: 0,
      },
      source_counts: {
        total: 0,
        primary: 0,
        secondary: 0,
        forum: 0,
        benchmark: 0,
        docs: 0,
        unknown: 0,
        independent_publishers: 0,
        failed_fetches: 0,
        section_primary: 0,
        section_independent_publishers: 0,
      },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: {
        policy_required: false,
        max_source_age_months: null,
        stale_source_policy: 'warn',
        stale_count: 0,
        unknown_date_count: 0,
      },
      scope_integrity_summary: {
        universal_claims: 0,
        scoped_claims: 0,
        with_not_constraint: 0,
        overgen_risks_total: 0,
        overgen_risks_blocking: 0,
      },
      next_actions: [],
    }),
    'utf8',
  );

  // SECTION_NOANS: gate passed (synthesis fails downstream).
  await writeFile(
    join(auditsDir, `${SECTION_NOANS}-gate.json`),
    JSON.stringify({
      section_id: SECTION_NOANS,
      verdict: 'pass',
      summary: 'gate passed',
      checked_at: '2026-05-12T00:00:02.000Z',
      synthesis_eligible: true,
      gate_results: [],
      failures: [],
      warnings: [],
      waivers_applied: [],
      blocking_reasons: [],
      claim_counts: {
        total: 1,
        candidate: 0,
        with_evidence_excerpt: 1,
        with_source_hashes: 1,
        with_scope: 1,
        with_not: 1,
        universal_scope_null: 0,
        orphans: 0,
      },
      source_counts: {
        total: 1,
        primary: 0,
        secondary: 0,
        forum: 0,
        benchmark: 0,
        docs: 1,
        unknown: 0,
        independent_publishers: 1,
        failed_fetches: 0,
        section_primary: 0,
        section_independent_publishers: 1,
      },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: {
        policy_required: false,
        max_source_age_months: null,
        stale_source_policy: 'warn',
        stale_count: 0,
        unknown_date_count: 1,
      },
      scope_integrity_summary: {
        universal_claims: 0,
        scoped_claims: 1,
        with_not_constraint: 1,
        overgen_risks_total: 0,
        overgen_risks_blocking: 0,
      },
      next_actions: [],
    }),
    'utf8',
  );

  // SECTION_GOOD: gate pass.
  await writeFile(
    join(auditsDir, `${SECTION_GOOD}-gate.json`),
    JSON.stringify({
      section_id: SECTION_GOOD,
      verdict: 'pass',
      summary: 'fixture',
      checked_at: '2026-05-12T00:00:02.000Z',
      synthesis_eligible: true,
      gate_results: [],
      failures: [],
      warnings: [],
      waivers_applied: [],
      blocking_reasons: [],
      claim_counts: {
        total: 3,
        candidate: 0,
        with_evidence_excerpt: 3,
        with_source_hashes: 3,
        with_scope: 3,
        with_not: 3,
        universal_scope_null: 0,
        orphans: 0,
      },
      source_counts: {
        total: 2,
        primary: 0,
        secondary: 0,
        forum: 0,
        benchmark: 0,
        docs: 2,
        unknown: 0,
        independent_publishers: 2,
        failed_fetches: 0,
        section_primary: 0,
        section_independent_publishers: 2,
      },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: {
        policy_required: false,
        max_source_age_months: null,
        stale_source_policy: 'warn',
        stale_count: 0,
        unknown_date_count: 2,
      },
      scope_integrity_summary: {
        universal_claims: 0,
        scoped_claims: 3,
        with_not_constraint: 3,
        overgen_risks_total: 0,
        overgen_risks_blocking: 0,
      },
      next_actions: [],
    }),
    'utf8',
  );

  // SECTION_UNRUN: no gate audit at all → diagnose reports unrun.
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'ros-pp-recovery-'));
  await buildFixture();
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ── Test 1: Integration ─────────────────────────────────────────────────────
describe('Slice 3b · Test 1 — integration: both surfaces produced from the same recovery object', () => {
  it('writes partial-pack-synthesis.{md,json} AND recovery/blocked-section-recovery.{md,json}', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });

    // Partial-pack outputs.
    expect(existsSync(result.jsonPath)).toBe(true);
    expect(existsSync(result.markdownPath)).toBe(true);

    // Canonical recovery outputs.
    const recoveryJsonPath = join(packPath, 'recovery', 'blocked-section-recovery.json');
    const recoveryMdPath = join(packPath, 'recovery', 'blocked-section-recovery.md');
    expect(existsSync(recoveryJsonPath)).toBe(true);
    expect(existsSync(recoveryMdPath)).toBe(true);
  });

  it('every excluded section in partial-pack-synthesis.json has a populated recovery_summary', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });

    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const excluded = artifact.excluded_sections as Array<Record<string, unknown>>;
    expect(excluded.length).toBeGreaterThan(0);

    for (const e of excluded) {
      expect(e.recovery_summary).toBeTruthy();
      const summary = e.recovery_summary as Record<string, unknown>;
      expect(summary.advisor_path).toBeTruthy();
      expect(summary.source).toBe(RECOVERY_SUMMARY_SOURCE);
    }
  });

  it('recovery_summary parses cleanly via RecoverySummarySchema for every excluded section', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });

    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const excluded = artifact.excluded_sections as Array<Record<string, unknown>>;
    for (const e of excluded) {
      // Should parse via the top-level schema AND the recovery_summary union.
      expect(() => PartialPackExcludedSectionSchema.parse(e)).not.toThrow();
      expect(() => RecoverySummarySchema.parse(e.recovery_summary)).not.toThrow();
    }
  });

  it('full partial-pack-synthesis.json parses via PartialPackArtifactSchema', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8'));
    expect(() => PartialPackArtifactSchema.parse(artifact)).not.toThrow();
  });

  it('pack freeze STILL refuses after partial-pack synthesis with embedded recovery', async () => {
    await coworkHandoff({ packPath });
    await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    const freezeResult = await runFreeze({ packPath });
    expect(freezeResult.verdict).toBe('refused');
  });
});

// ── Test 2: Invariant — accepted_claim_floor ─────────────────────────────────
describe('Slice 3b · Test 2 — invariant: accepted_claim_floor never recommends apply_waiver', () => {
  it('do_not[] contains apply_waiver with unwaiveable reason; recommended_action_id != apply_waiver', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });

    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const excluded = artifact.excluded_sections as Array<Record<string, unknown>>;
    const floorSection = excluded.find((e) => e.section_id === SECTION_FLOOR);
    expect(floorSection).toBeTruthy();

    const summary = floorSection!.recovery_summary as Record<string, unknown>;
    expect(summary.recommended_action_id).not.toBe('apply_waiver');

    const doNot = summary.do_not as Array<{ action_id: string; reason: string }>;
    const waiver = doNot.find((d) => d.action_id === 'apply_waiver');
    expect(waiver).toBeTruthy();
    expect(waiver!.reason.toLowerCase()).toMatch(/unwaiveable|waivers cannot create/);
  });
});

// ── Test 3: Invariant — prose_error_no_answer_cluster ────────────────────────
describe('Slice 3b · Test 3 — invariant: no_answer_cluster never recommends rerun_stage as primary', () => {
  it('do_not[] contains rerun_stage with gate-already-passed reason; recommended_action_id != rerun_stage', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });

    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const excluded = artifact.excluded_sections as Array<Record<string, unknown>>;
    const noansSection = excluded.find((e) => e.section_id === SECTION_NOANS);
    expect(noansSection).toBeTruthy();

    const summary = noansSection!.recovery_summary as Record<string, unknown>;
    expect(summary.recommended_action_id).not.toBe('rerun_stage');

    const doNot = summary.do_not as Array<{ action_id: string; reason: string }>;
    const rerun = doNot.find((d) => d.action_id === 'rerun_stage');
    expect(rerun).toBeTruthy();
    expect(rerun!.reason.toLowerCase()).toMatch(/gate already passed|rerunning gate fixes nothing/);
  });
});

// ── Test 4: Schema backward-compat ───────────────────────────────────────────
describe('Slice 3b · Test 4 — schema backward-compat for pre-Slice-3b artifacts', () => {
  it('parses a partial-pack-synthesis.json without recovery_summary on excluded_sections', () => {
    // A pre-Slice-3b artifact: excluded section has no recovery_summary field.
    const preSlice3bArtifact = {
      status: 'partial_pack_synthesis' as const,
      scope: 'pack' as const,
      pack_id: 'p_xyz',
      pack_topic: 'topic',
      pack_mode: 'repair_required',
      not_freezable_as_pack: true as const,
      not_publishable_as_pack: true as const,
      included_sections: [
        {
          section_id: '01',
          section_purpose: 'x',
          section_synthesis_path: 'sections/01/synthesis/section-synthesis.json',
          paragraph_count: 1,
        },
      ],
      excluded_sections: [
        {
          section_id: '02',
          section_purpose: 'y',
          reason: 'gate_blocked' as const,
          detail: 'something',
          // intentionally no recovery_summary
        },
      ],
      source_section_syntheses: ['sections/01/synthesis/section-synthesis.json'],
      required_answer_bundle: null,
      prose: {
        paragraphs: [
          {
            paragraph_id: 'pp1',
            role: 'answer' as const,
            text: 'A direct answer.',
            support_bundle: {
              section_ids: ['01'],
              section_paragraph_ids: ['01:p1'],
              section_synthesis_paths: [
                'sections/01/synthesis/section-synthesis.json',
              ],
            },
          },
        ],
      },
      generated_at: '2026-05-13T00:00:00.000Z',
      research_os_version: '0.8.0',
    };

    expect(() => PartialPackArtifactSchema.parse(preSlice3bArtifact)).not.toThrow();
  });

  it('accepts recovery_summary as optional on PartialPackExcludedSectionSchema', () => {
    const withSummary = {
      section_id: '02',
      section_purpose: 'y',
      reason: 'gate_blocked' as const,
      detail: 'd',
      recovery_summary: {
        advisor_path: 'ai_with_verifier_pass' as const,
        recommended_action_id: 'add_on_topic_sources' as const,
        recommended_action: 'Add sources.',
        why_this_action: 'No evidence yet.',
        do_not: [],
        source: RECOVERY_SUMMARY_SOURCE,
      },
    };
    const withoutSummary = {
      section_id: '02',
      section_purpose: 'y',
      reason: 'gate_blocked' as const,
      detail: 'd',
    };
    expect(() => PartialPackExcludedSectionSchema.parse(withSummary)).not.toThrow();
    expect(() => PartialPackExcludedSectionSchema.parse(withoutSummary)).not.toThrow();
  });
});

// ── Test 5: Deterministic fallback path ──────────────────────────────────────
describe('Slice 3b · Test 5 — deterministic fallback when advisor verifier fails twice', () => {
  it('each recovery_summary.advisor_path === "deterministic_fallback" but recommended_action_id is still valid', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({
      packPath,
      mcpClient: makeFakeClient({ advisorFailsVerifier: true }),
    });

    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const excluded = artifact.excluded_sections as Array<Record<string, unknown>>;
    expect(excluded.length).toBeGreaterThan(0);

    for (const e of excluded) {
      const summary = e.recovery_summary as Record<string, unknown>;
      expect(summary.advisor_path).toBe('deterministic_fallback');
      // recommended_action_id must still come from the action graph (non-empty
      // value in the closed RecoveryActionId enum).
      expect(typeof summary.recommended_action_id).toBe('string');
      expect((summary.recommended_action_id as string).length).toBeGreaterThan(0);
    }
  });

  it('canonical recovery artifact agrees: advisor_path is deterministic_fallback for the same sections', async () => {
    await coworkHandoff({ packPath });
    await partialPackSynthesis({
      packPath,
      mcpClient: makeFakeClient({ advisorFailsVerifier: true }),
    });

    const canonical = JSON.parse(
      await readFile(join(packPath, 'recovery', 'blocked-section-recovery.json'), 'utf8'),
    ) as { sections: Array<{ section_id: string; status: string; advisor_path: string | null }> };

    const advised = canonical.sections.filter((s) => s.status === 'recovery_advised');
    expect(advised.length).toBeGreaterThan(0);
    for (const s of advised) {
      expect(s.advisor_path).toBe('deterministic_fallback');
    }
  });
});

// ── Test 6: Markdown rendering ───────────────────────────────────────────────
describe('Slice 3b · Test 6 — partial-pack-synthesis.md renders recovery summary under each excluded section', () => {
  it('renders "### <section_id>" + Recommended next action + Do not + canonical link', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    const md = await readFile(result.markdownPath, 'utf8');

    // Each excluded section gets its own heading.
    expect(md).toContain(`### ${SECTION_FLOOR}`);
    expect(md).toContain(`### ${SECTION_NOANS}`);
    expect(md).toContain(`### ${SECTION_UNRUN}`);

    // Recovery block lines.
    expect(md).toMatch(/\*\*Recommended next action:\*\*/);
    expect(md).toMatch(/\*\*Do not:\*\*/);
    expect(md).toContain(RECOVERY_SUMMARY_MARKDOWN_SOURCE);
  });

  it('"Why excluded" line carries both partial-pack reason and detail', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    const md = await readFile(result.markdownPath, 'utf8');
    expect(md).toMatch(/\*\*Why excluded:\*\*\s+`gate_blocked`/);
    expect(md).toMatch(/\*\*Why excluded:\*\*\s+`prose_error`/);
    expect(md).toMatch(/\*\*Why excluded:\*\*\s+`unrun`/);
  });
});

// ── Test 7: Source-of-truth — embed matches canonical ────────────────────────
describe('Slice 3b · Test 7 — source-of-truth: embedded recovery_summary matches canonical advice', () => {
  it('recommended_action_id matches between embed and canonical for each excluded section', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });

    const partialPack = JSON.parse(await readFile(result.jsonPath, 'utf8')) as {
      excluded_sections: Array<{
        section_id: string;
        recovery_summary?: { recommended_action_id?: string; advisor_path: string };
      }>;
    };
    const canonical = JSON.parse(
      await readFile(join(packPath, 'recovery', 'blocked-section-recovery.json'), 'utf8'),
    ) as {
      sections: Array<{
        section_id: string;
        status: string;
        advice: { recommended_action: { action_id: string } } | null;
      }>;
    };

    for (const e of partialPack.excluded_sections) {
      const summary = e.recovery_summary;
      expect(summary).toBeTruthy();
      // For happy paths, the embed should match the canonical's action_id.
      if (
        summary &&
        summary.advisor_path !== 'recovery_unavailable' &&
        summary.recommended_action_id !== undefined
      ) {
        const canonicalSection = canonical.sections.find(
          (s) => s.section_id === e.section_id,
        );
        expect(canonicalSection).toBeTruthy();
        expect(canonicalSection!.status).toBe('recovery_advised');
        expect(canonicalSection!.advice).toBeTruthy();
        expect(canonicalSection!.advice!.recommended_action.action_id).toBe(
          summary.recommended_action_id,
        );
      }
    }
  });
});

// ── Test 8: recovery_unavailable (no-silent-skip guardrail) ──────────────────
describe('Slice 3b · Test 8 — recovery_unavailable is surfaced explicitly, never silently omitted', () => {
  it('recoveryUnavailableSummary produces a valid RecoverySummary parsed by the union schema', () => {
    const summary = recoveryUnavailableSummary({
      reason: 'engine_error',
      detail: 'Recovery engine crashed during diagnose phase.',
    });
    expect(summary.advisor_path).toBe('recovery_unavailable');
    expect(() => RecoverySummarySchema.parse(summary)).not.toThrow();
  });

  it('all three recovery_unavailable reasons parse and round-trip via the schema', () => {
    for (const reason of ['diagnosis_failed', 'action_graph_empty', 'engine_error'] as const) {
      const summary = recoveryUnavailableSummary({
        reason,
        detail: `Mock detail for ${reason}.`,
      });
      const parsed = RecoverySummarySchema.parse(summary);
      expect(parsed.advisor_path).toBe('recovery_unavailable');
      // discriminated union: in the unavailable branch, `reason` and `detail`
      // are present.
      if (parsed.advisor_path === 'recovery_unavailable') {
        expect(parsed.reason).toBe(reason);
        expect(parsed.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it('partial-pack run uses recovery_unavailable when buildRecoveryArtifact throws', async () => {
    // Mock the recovery engine to throw entirely. The partial-pack run must
    // still produce a partial-pack-synthesis artifact AND must mark every
    // excluded section's recovery_summary as recovery_unavailable. This is
    // the no-silent-skip guardrail.
    const recoverModule = await import('../src/recover/run.js');
    const spy = vi
      .spyOn(recoverModule, 'buildRecoveryArtifact')
      .mockImplementation(async () => {
        throw new Error('mock recovery engine total failure');
      });

    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });

    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const excluded = artifact.excluded_sections as Array<Record<string, unknown>>;
    expect(excluded.length).toBeGreaterThan(0);

    // Every excluded section has recovery_summary populated as
    // recovery_unavailable with engine_error.
    for (const e of excluded) {
      const summary = e.recovery_summary as Record<string, unknown>;
      expect(summary).toBeTruthy();
      expect(summary.advisor_path).toBe('recovery_unavailable');
      expect(summary.reason).toBe('engine_error');
      expect(typeof summary.detail).toBe('string');
      expect((summary.detail as string).length).toBeGreaterThan(0);
      expect((summary.detail as string)).toContain('mock recovery engine total failure');
    }

    spy.mockRestore();
  });

  it('partial-pack-synthesis.md renders "Recovery guidance unavailable" when the engine fails', async () => {
    const recoverModule = await import('../src/recover/run.js');
    const spy = vi
      .spyOn(recoverModule, 'buildRecoveryArtifact')
      .mockImplementation(async () => {
        throw new Error('mock recovery engine total failure');
      });

    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    const md = await readFile(result.markdownPath, 'utf8');

    expect(md).toMatch(/\*\*Recovery guidance unavailable\*\*/);
    expect(md).toMatch(/`engine_error`/);
    // The canonical link is still rendered so the operator can see what
    // (if anything) was produced.
    expect(md).toContain(RECOVERY_SUMMARY_MARKDOWN_SOURCE);

    spy.mockRestore();
  });
});

// ── Pack-readiness invariants (carried over from Slice 2/3a) ────────────────
describe('Slice 3b · pack-readiness invariants stay intact', () => {
  it('partial-pack artifact still asserts not_freezable_as_pack + not_publishable_as_pack', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    expect(artifact.not_freezable_as_pack).toBe(true);
    expect(artifact.not_publishable_as_pack).toBe(true);
  });

  it('recommended_action_id is always a valid RecoveryActionId for happy-path summaries', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const excluded = artifact.excluded_sections as Array<Record<string, unknown>>;
    const validActionIds: RecoveryActionId[] = [
      'add_on_topic_sources',
      'apply_source_card_override',
      'rerun_stage',
      'apply_waiver',
      'narrow_section_purpose',
      'mark_section_out_of_scope',
      'defer_to_human_review',
    ];
    for (const e of excluded) {
      const summary = e.recovery_summary as Record<string, unknown>;
      if (summary.advisor_path !== 'recovery_unavailable') {
        expect(validActionIds).toContain(summary.recommended_action_id as RecoveryActionId);
      }
    }
  });
});
