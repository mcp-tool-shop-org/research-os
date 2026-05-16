/**
 * R-014 (v0.12 Slice 3) — `recover pack --regenerate-action-graph` +
 * distinct-shape heuristic for needs_repair_claims.
 *
 * Closes C4 from the operator-aloneness DST gate v0.3 run:
 *
 *   - Part 1: action graph's `accepted_claim_floor` heuristic now routes by
 *     which repair shape DOMINATES (needs_scope_repair vs needs_source_repair)
 *     instead of OR'ing them into one count. v0.3 regression replay test
 *     proves source-only-blocked no longer (wrongly) recommends
 *     repair_claim_scope.
 *
 *   - Part 2: opt-in `--regenerate-action-graph` flag re-computes the
 *     recovery action graph against current pack state with state-hash
 *     staleness detection, on-disk history archive, and an append-only
 *     regeneration ledger.
 *
 *   - Part 3: additive `input_state_hash` field on the recovery artifact;
 *     pre-R-014 artifacts without the field are treated as "stale,
 *     regenerate" for backward compat.
 *
 * Acceptance tests (mirrors the R-014 kickoff):
 *   #1 distinct-shape — scope-only blocked
 *   #2 distinct-shape — source-only blocked (v0.3 REGRESSION REPLAY)
 *   #3 distinct-shape — mixed blocked
 *   #4 --regenerate-action-graph — state changed
 *   #5 --regenerate-action-graph — no state change (clean exit)
 *   #6 --regenerate-action-graph — missing input_state_hash (backward compat)
 *   #7 history archive immutability across 3 regenerations
 *   #8 append-only ledger discipline (no-regen runs don't write ledger)
 *   #9 default `recover pack` unchanged
 *  #10 RECOVERY_ACTIONS enum snapshot stable
 *  #11 AI advisor prompt + verifier snapshot stable
 *  (#12-#14 covered by the broader vitest run + 4-pack regression)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  appendFile,
  mkdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { handoff as coworkHandoff } from '../src/cowork/index.js';
import { recoverPack } from '../src/recover/index.js';
import {
  buildActionGraph,
  RECOVERY_ACTIONS,
  renderRecoveryAdvisorPrompt,
  RECOVERY_ADVISOR_PROMPT_VERSION,
  verifyRecoveryAdvice,
} from '../src/recover/index.js';
import {
  archiveExistingRecoveryFiles,
  classifyRegenerationReason,
  computeInputStateHash,
  listRecoveryHistory,
  readExistingRecoveryArtifact,
  readRegenerationLedger,
} from '../src/recover/regeneration-ledger.js';
import { REGENERATION_REASONS } from '../src/recover/types.js';
import type {
  RecoveryAdvice,
  RecoveryArtifact,
  SectionDiagnosis,
  FailureShape,
} from '../src/recover/index.js';
import type { ProseCallToolClient } from '../src/synth/prose/types.js';

// ── Pure-function helpers ───────────────────────────────────────────────────

function diag(
  failure_shape: FailureShape,
  overrides: Partial<SectionDiagnosis> = {},
): SectionDiagnosis {
  return {
    section_id: 'fixture',
    section_purpose: 'fixture purpose',
    failure_shape,
    blocking: true,
    waiveable: false,
    stage: 'gate',
    evidence_state: {
      extracted_claims: 0,
      accepted_claims: 0,
      frame_excluded_claims: 0,
      needs_repair_claims: 0,
      sources: 0,
      distinct_publishers: 0,
      distinct_primary_publishers: 0,
    },
    detail: 'fixture detail',
    ...overrides,
  };
}

// ── §1 Distinct-shape heuristic (Acceptance #1–#3) ─────────────────────────

describe('R-014 §1 — distinct-shape heuristic for needs_repair_claims (accepted_claim_floor)', () => {
  it('#1 scope-only blocked (5 scope + 0 source) → top action is repair_claim_scope', () => {
    const d = diag('accepted_claim_floor', {
      evidence_state: {
        extracted_claims: 8,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 5,
        sources: 3,
        distinct_publishers: 2,
        distinct_primary_publishers: 1,
        scope_repair_blocked: 5,
        source_repair_blocked: 0,
      },
    });
    const ag = buildActionGraph(d);
    expect(ag.allowed_actions[0]?.action_id).toBe('repair_claim_scope');
    // The diagnostic block is observable via evidence_state on the artifact.
    expect(d.evidence_state.scope_repair_blocked).toBe(5);
    expect(d.evidence_state.source_repair_blocked).toBe(0);
  });

  it('#2 source-only blocked (0 scope + 5 source) → top is add_on_topic_sources [v0.3 REGRESSION REPLAY]', () => {
    // This is the EXACT shape the v0.3 operator hit: scope already repaired
    // (needs_scope_repair=0) but needs_source_repair still pending. Under
    // the pre-R-014 aggregate heuristic this would have wrongly recommended
    // repair_claim_scope (because the OR'd needs_repair_claims=5 >= 3).
    // Post-R-014 it must route to the source-side action.
    const d = diag('accepted_claim_floor', {
      evidence_state: {
        extracted_claims: 8,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 5,
        sources: 3,
        distinct_publishers: 2,
        distinct_primary_publishers: 1,
        scope_repair_blocked: 0,
        source_repair_blocked: 5,
      },
    });
    const ag = buildActionGraph(d);
    expect(ag.allowed_actions[0]?.action_id).toBe('add_on_topic_sources');
    // repair_claim_scope MUST NOT appear when scope-shape has zero claims to act on.
    expect(ag.allowed_actions.map((a) => a.action_id)).not.toContain('repair_claim_scope');
  });

  it('#3 mixed blocked (3 scope + 7 source) → top is add_on_topic_sources; repair_claim_scope in also_consider plumbing', () => {
    const d = diag('accepted_claim_floor', {
      evidence_state: {
        extracted_claims: 10,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 10,
        sources: 3,
        distinct_publishers: 2,
        distinct_primary_publishers: 1,
        scope_repair_blocked: 3,
        source_repair_blocked: 7,
      },
    });
    const ag = buildActionGraph(d);
    expect(ag.allowed_actions[0]?.action_id).toBe('add_on_topic_sources');
    // Existing also_consider plumbing in fallback.ts takes slice(1, 3) of
    // allowed_actions; repair_claim_scope should appear as a secondary
    // since scope-count meets the gate threshold (>= 3).
    expect(ag.allowed_actions.map((a) => a.action_id)).toContain('repair_claim_scope');
    expect(ag.allowed_actions.map((a) => a.action_id)).toContain('narrow_section_purpose');
  });

  it('legacy fixture without distinct counts (needs_repair_claims=6) preserves R-001 behavior → repair_claim_scope', () => {
    // This is the EXACT R-001 test from recover-action-graph-repair-claim-scope.test.ts.
    // The new heuristic MUST stay byte-identical for legacy callers that
    // don't carry scope_repair_blocked / source_repair_blocked.
    const d = diag('accepted_claim_floor', {
      evidence_state: {
        extracted_claims: 8,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 6,
        sources: 3,
        distinct_publishers: 2,
        distinct_primary_publishers: 1,
      },
    });
    const ag = buildActionGraph(d);
    expect(ag.allowed_actions[0]?.action_id).toBe('repair_claim_scope');
  });

  it('apply_waiver still permanently forbidden on accepted_claim_floor regardless of repair shape', () => {
    for (const evidence_state of [
      {
        extracted_claims: 8,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 5,
        sources: 3,
        distinct_publishers: 2,
        distinct_primary_publishers: 1,
        scope_repair_blocked: 5,
        source_repair_blocked: 0,
      },
      {
        extracted_claims: 8,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 5,
        sources: 3,
        distinct_publishers: 2,
        distinct_primary_publishers: 1,
        scope_repair_blocked: 0,
        source_repair_blocked: 5,
      },
    ]) {
      const d = diag('accepted_claim_floor', { evidence_state });
      const ag = buildActionGraph(d);
      expect(ag.forbidden_actions.map((f) => f.action_id)).toContain('apply_waiver');
    }
  });
});

// ── §2 State-hash + classifier (pure helpers) ──────────────────────────────

describe('R-014 §2 — state-hash + regeneration classifier (pure helpers)', () => {
  it('computeInputStateHash is deterministic across input order', () => {
    const a = diag('accepted_claim_floor', { section_id: 'a' });
    const b = diag('source_card_classification_gap', { section_id: 'b' });
    const h1 = computeInputStateHash([a, b]);
    const h2 = computeInputStateHash([b, a]);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('computeInputStateHash differs when evidence_state changes', () => {
    const a = diag('accepted_claim_floor', { section_id: 'a' });
    const aRepaired = diag('accepted_claim_floor', {
      section_id: 'a',
      evidence_state: { ...a.evidence_state, scope_repair_blocked: 0, source_repair_blocked: 5 },
    });
    expect(computeInputStateHash([a])).not.toBe(computeInputStateHash([aRepaired]));
  });

  it('computeInputStateHash ignores section_purpose + detail wording', () => {
    const a = diag('accepted_claim_floor', { section_id: 'a' });
    const aReworded = diag('accepted_claim_floor', {
      section_id: 'a',
      section_purpose: 'reworded purpose',
      detail: 'reworded detail',
    });
    expect(computeInputStateHash([a])).toBe(computeInputStateHash([aReworded]));
  });

  it('classifyRegenerationReason — null prior artifact → no_prior_artifact', () => {
    const reason = classifyRegenerationReason({
      previousArtifact: null,
      currentStateHash: 'h1',
    });
    expect(reason).toBe('no_prior_artifact');
  });

  it('classifyRegenerationReason — prior without input_state_hash → missing_input_hash', () => {
    const reason = classifyRegenerationReason({
      previousArtifact: {
        status: 'recovery_advisor_complete',
        pack_id: 'p',
        pack_topic: 't',
        pack_mode: 'm',
        generated_at: 'g',
        research_os_version: '0.11.0',
        sections: [],
      } as RecoveryArtifact,
      currentStateHash: 'h1',
    });
    expect(reason).toBe('missing_input_hash');
  });

  it('classifyRegenerationReason — prior hash matches → null (skip)', () => {
    const reason = classifyRegenerationReason({
      previousArtifact: {
        status: 'recovery_advisor_complete',
        pack_id: 'p',
        pack_topic: 't',
        pack_mode: 'm',
        generated_at: 'g',
        research_os_version: '0.12.0',
        sections: [],
        input_state_hash: 'h1',
      } as RecoveryArtifact,
      currentStateHash: 'h1',
    });
    expect(reason).toBeNull();
  });

  it('classifyRegenerationReason — prior hash differs → state_changed', () => {
    const reason = classifyRegenerationReason({
      previousArtifact: {
        status: 'recovery_advisor_complete',
        pack_id: 'p',
        pack_topic: 't',
        pack_mode: 'm',
        generated_at: 'g',
        research_os_version: '0.12.0',
        sections: [],
        input_state_hash: 'h_old',
      } as RecoveryArtifact,
      currentStateHash: 'h_new',
    });
    expect(reason).toBe('state_changed');
  });
});

// ── §3 archive helper (pure file ops) ──────────────────────────────────────

describe('R-014 §3 — archiveExistingRecoveryFiles', () => {
  let workDir: string;
  let packPath: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'r014-archive-'));
    packPath = join(workDir, 'pack');
    await mkdir(join(packPath, 'recovery'), { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('archives both .json + .md when present, preserving timestamps + hash prefix', async () => {
    await writeFile(
      join(packPath, 'recovery', 'blocked-section-recovery.json'),
      '{"prior":"json"}',
      'utf8',
    );
    await writeFile(
      join(packPath, 'recovery', 'blocked-section-recovery.md'),
      '# prior md',
      'utf8',
    );
    const now = new Date('2026-05-16T04:28:13.144Z');
    const archive = await archiveExistingRecoveryFiles(packPath, 'a06196c42cb6abcdef', now);

    expect(archive.archivedJsonPath).toMatch(/recovery[\\/]history[\\/]blocked-section-recovery-2026-05-16T04-28-13Z-a06196c4\.json$/);
    expect(archive.archivedMarkdownPath).toMatch(/recovery[\\/]history[\\/]blocked-section-recovery-2026-05-16T04-28-13Z-a06196c4\.md$/);

    // Originals moved (not copied).
    expect(existsSync(join(packPath, 'recovery', 'blocked-section-recovery.json'))).toBe(false);
    expect(existsSync(join(packPath, 'recovery', 'blocked-section-recovery.md'))).toBe(false);
    expect(existsSync(archive.archivedJsonPath!)).toBe(true);
    expect(existsSync(archive.archivedMarkdownPath!)).toBe(true);
  });

  it('uses "noprehash" filename suffix when previous hash is null', async () => {
    await writeFile(
      join(packPath, 'recovery', 'blocked-section-recovery.json'),
      '{"prior":"json"}',
      'utf8',
    );
    const now = new Date('2026-05-16T04:28:13.144Z');
    const archive = await archiveExistingRecoveryFiles(packPath, null, now);
    expect(archive.archivedJsonPath).toMatch(/-noprehash\.json$/);
  });

  it('returns null paths when no prior files exist', async () => {
    const archive = await archiveExistingRecoveryFiles(packPath, 'hashabc');
    expect(archive.archivedJsonPath).toBeNull();
    expect(archive.archivedMarkdownPath).toBeNull();
  });
});

// ── §4 + §5 + §7 + §8 — recoverPack regenerate-flow integration ─────────────

// Pack-building helpers (adapted from recover-integration.test.ts).
async function writeGate(
  packPath: string,
  sectionId: string,
  args: { verdict: 'pass' | 'warn' | 'fail' | 'blocked'; synthesis_eligible: boolean; failures?: Array<{ family: string; check: string }> },
): Promise<void> {
  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(
    join(packPath, 'audits', `${sectionId}-gate.json`),
    JSON.stringify({
      section_id: sectionId,
      verdict: args.verdict,
      summary: `fixture gate for ${sectionId}`,
      checked_at: '2026-05-13T00:00:02.000Z',
      synthesis_eligible: args.synthesis_eligible,
      gate_results: [],
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
      blocking_reasons: args.synthesis_eligible ? [] : ['fixture-blocking-reason'],
      claim_counts: { total: 0, candidate: 0, with_evidence_excerpt: 0, with_source_hashes: 0, with_scope: 0, with_not: 0, universal_scope_null: 0, orphans: 0 },
      source_counts: {
        total: 0, primary: 0, secondary: 0, forum: 0, benchmark: 0, docs: 0, unknown: 0,
        independent_publishers: 0, failed_fetches: 0, section_primary: 0, section_independent_publishers: 0,
      },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 0 },
      scope_integrity_summary: { universal_claims: 0, scoped_claims: 0, with_not_constraint: 0, overgen_risks_total: 0, overgen_risks_blocking: 0 },
      next_actions: [],
    }),
    'utf8',
  );
}

async function writeClaim(packPath: string, sectionId: string, srcId: string, i: number): Promise<string> {
  const cid = `clm_${srcId.slice(4)}_heuristic_${i}`;
  await appendFile(
    join(packPath, 'sections', sectionId, 'claims.jsonl'),
    JSON.stringify({
      claim_id: cid,
      section_id: sectionId,
      source_ids: [srcId],
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
  return cid;
}

async function writeReview(packPath: string, sectionId: string, cid: string, decision: string): Promise<void> {
  await appendFile(
    join(packPath, 'sections', sectionId, 'claim-reviews.jsonl'),
    JSON.stringify({
      claim_id: cid,
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

async function writeSourceCard(packPath: string, sectionId: string, srcId: string, publisher: string): Promise<void> {
  const dir = join(packPath, 'evidence', 'source-cards');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${srcId}.json`),
    JSON.stringify({
      source_id: srcId,
      receipt_id: `rcpt_${srcId.slice(4)}_1`,
      section_id: sectionId,
      url: `https://example.com/${srcId}`,
      final_url: `https://example.com/${srcId}`,
      fetched_at: '2026-05-13T00:00:00.000Z',
      publisher,
      published_at: null,
      title: `Title for ${srcId}`,
      source_type: 'docs',
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
  await appendFile(
    join(packPath, 'sections', sectionId, 'sources.jsonl'),
    JSON.stringify({ source_id: srcId, added_at: '2026-05-13T00:00:00.000Z' }) + '\n',
    'utf8',
  );
  await appendFile(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    JSON.stringify({
      receipt_id: `rcpt_${srcId.slice(4)}_1`,
      source_id: srcId,
      section_id: sectionId,
      requested_url: `https://example.com/${srcId}`,
      final_url: `https://example.com/${srcId}`,
      status: 200,
      status_text: 'OK',
      content_type: 'text/html',
      fetched_at: '2026-05-13T00:00:00.000Z',
      byte_count: 100,
      sha256: createHash('sha256').update(srcId).digest('hex'),
      title: `Title for ${srcId}`,
      raw_text_path: `evidence/raw/${srcId}.html`,
      fetch_outcome: 'ok',
      fetch_error: null,
      extraction_outcome: 'ok',
      extraction_extractor: 'heuristic',
      extraction_error: null,
    }) + '\n',
    'utf8',
  );
}

// Build a minimal pack with one blocked section (accepted_claim_floor).
async function buildOneFloorPack(workDir: string): Promise<string> {
  const r = await init({
    topic: 'R-014 single-floor regenerate-test pack',
    outDir: workDir,
  });
  const packPath = r.packPath;
  await sectionAdd({ id: '01-floor', purpose: 'Test section', packPath });
  await writeGate(packPath, '01-floor', {
    verdict: 'blocked',
    synthesis_eligible: false,
    failures: [{ family: 'accepted_claim_floor', check: 'min_accepted_claims' }],
  });
  // recoverPack reads handoffs/cowork-handoff.json — generate it from the
  // current pack state so the diagnose layer has its authoritative input.
  await coworkHandoff({ packPath });
  return packPath;
}

// Re-derive the cowork handoff after a state mutation (added claims /
// reviews / source cards). recoverPack reads handoffs/cowork-handoff.json
// and the existing handoff would still reflect pre-mutation state.
async function refreshHandoff(packPath: string): Promise<void> {
  await coworkHandoff({ packPath });
}

// A fake MCP client that returns compliant advice for the test pack.
function makeFakeAdviceClient(actionId: string): ProseCallToolClient {
  return {
    async callTool(params) {
      const args = params.arguments as Record<string, unknown>;
      const text = typeof args.text === 'string' ? args.text : '';
      const sectionMatch = text.match(/section_id:\s+(\S+)/);
      const sectionId = sectionMatch ? sectionMatch[1]! : '01-floor';
      const advice: RecoveryAdvice = {
        section_id: sectionId,
        failure_summary: 'fixture',
        recommended_action: {
          action_id: actionId as RecoveryAdvice['recommended_action']['action_id'],
          rank_taken: 1,
          contrastive_framing:
            'You might think this needs a waiver. It does not — accepted_claim_floor is unwaiveable.',
          why_smallest_reversible: 'High-reversibility action.',
          command_hint: 'fixture command',
          expected_outcome: 'fixture outcome',
        },
        also_consider: [],
        do_not: [{ action_id: 'apply_waiver', why_not: 'unwaiveable' }],
        system_cannot_see: ['fixture'],
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
    },
  };
}

describe('R-014 §4-§8 — recoverPack regenerate-action-graph integration', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'r014-regen-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('#4 state changed → regenerate + archive prior + ledger entry', async () => {
    const packPath = await buildOneFloorPack(workDir);
    const client = makeFakeAdviceClient('add_on_topic_sources');

    // First run: no prior artifact, no flag — populates input_state_hash.
    const first = await recoverPack({ packPath, mcpClient: client });
    expect(first.regenerated).toBeUndefined();
    const firstArtifact = await readExistingRecoveryArtifact(packPath);
    const firstHash = firstArtifact!.input_state_hash!;
    expect(firstHash).toMatch(/^[0-9a-f]{64}$/);

    // Mutate state: add an accepted claim. This should change diagnoses
    // (evidence_state.accepted_claims goes 0 → 1) and therefore the hash.
    const cid = await writeClaim(packPath, '01-floor', 'src_aaaaaaaaaaaa', 1);
    await writeReview(packPath, '01-floor', cid, 'accepted_for_synthesis');
    await writeSourceCard(packPath, '01-floor', 'src_aaaaaaaaaaaa', 'PubA');
    await refreshHandoff(packPath);

    // Regenerate run: should detect state change, archive, write new + ledger.
    const second = await recoverPack({
      packPath,
      mcpClient: client,
      regenerateActionGraph: true,
    });
    expect(second.regenerated).toBe(true);
    expect(second.regenerationReason).toBe('state_changed');
    expect(second.archivedJsonPath).toBeTruthy();
    expect(second.archivedMarkdownPath).toBeTruthy();
    expect(second.previousInputStateHash).toBe(firstHash);
    expect(second.inputStateHash).not.toBe(firstHash);
    // Archive contents are the prior artifact JSON byte-for-byte.
    const archived = JSON.parse(await readFile(second.archivedJsonPath!, 'utf8'));
    expect(archived.input_state_hash).toBe(firstHash);
    // Ledger has exactly one entry.
    const ledger = await readRegenerationLedger(packPath);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.previous_state_hash).toBe(firstHash);
    expect(ledger[0]!.new_state_hash).toBe(second.inputStateHash);
    expect(ledger[0]!.regeneration_reason).toBe('state_changed');
  });

  it('#5 no state change → clean exit, no mutation, no ledger entry', async () => {
    const packPath = await buildOneFloorPack(workDir);
    const client = makeFakeAdviceClient('add_on_topic_sources');

    const first = await recoverPack({ packPath, mcpClient: client });
    const firstJson = await readFile(
      join(packPath, 'recovery', 'blocked-section-recovery.json'),
      'utf8',
    );

    const second = await recoverPack({
      packPath,
      mcpClient: client,
      regenerateActionGraph: true,
    });
    expect(second.regenerated).toBe(false);
    expect(second.regenerationReason).toBeNull();
    expect(second.archivedJsonPath).toBeNull();
    expect(second.archivedMarkdownPath).toBeNull();

    // On-disk artifact untouched — byte-identical.
    const afterJson = await readFile(
      join(packPath, 'recovery', 'blocked-section-recovery.json'),
      'utf8',
    );
    expect(afterJson).toBe(firstJson);

    // No history archive.
    expect(await listRecoveryHistory(packPath)).toHaveLength(0);
    // No ledger entry.
    expect(await readRegenerationLedger(packPath)).toHaveLength(0);
    // Suppresses unused warning for the unused first variable.
    expect(first.totalSections).toBeGreaterThanOrEqual(1);
  });

  it('#6 prior artifact without input_state_hash (pre-R-014) → treated as stale, regenerated', async () => {
    const packPath = await buildOneFloorPack(workDir);
    const client = makeFakeAdviceClient('add_on_topic_sources');

    // Hand-craft a pre-R-014 recovery artifact (no input_state_hash).
    await mkdir(join(packPath, 'recovery'), { recursive: true });
    const preArtifact = {
      status: 'recovery_advisor_complete',
      pack_id: 'p',
      pack_topic: 't',
      pack_mode: 'synthesis_ready',
      generated_at: '2026-05-15T00:00:00.000Z',
      research_os_version: '0.11.0',
      sections: [
        {
          section_id: '01-floor',
          section_purpose: 'Test section',
          status: 'recovery_advised',
          diagnosis: {
            section_id: '01-floor',
            section_purpose: 'Test section',
            failure_shape: 'accepted_claim_floor',
            blocking: true,
            waiveable: false,
            stage: 'gate',
            evidence_state: {
              extracted_claims: 0,
              accepted_claims: 0,
              frame_excluded_claims: 0,
              needs_repair_claims: 0,
              sources: 0,
              distinct_publishers: 0,
              distinct_primary_publishers: 0,
            },
            detail: 'legacy',
          },
          action_graph: {
            section_id: '01-floor',
            allowed_actions: [],
            forbidden_actions: [],
          },
          advice: null,
          advisor_path: 'ai_with_verifier_pass',
        },
      ],
    };
    await writeFile(
      join(packPath, 'recovery', 'blocked-section-recovery.json'),
      JSON.stringify(preArtifact, null, 2),
      'utf8',
    );
    await writeFile(
      join(packPath, 'recovery', 'blocked-section-recovery.md'),
      '# legacy md',
      'utf8',
    );

    const result = await recoverPack({
      packPath,
      mcpClient: client,
      regenerateActionGraph: true,
    });
    expect(result.regenerated).toBe(true);
    expect(result.regenerationReason).toBe('missing_input_hash');
    expect(result.previousInputStateHash).toBeNull();
    expect(result.inputStateHash).toMatch(/^[0-9a-f]{64}$/);

    // Archive captured the pre-R-014 file with "noprehash" suffix.
    expect(result.archivedJsonPath).toMatch(/-noprehash\.json$/);
    // Fresh artifact has the new field populated.
    const fresh = await readExistingRecoveryArtifact(packPath);
    expect(fresh!.input_state_hash).toBe(result.inputStateHash);
  });

  it('#7 history archive immutable across 3 regenerations', async () => {
    const packPath = await buildOneFloorPack(workDir);
    const client = makeFakeAdviceClient('add_on_topic_sources');

    // Round 1: build initial artifact.
    await recoverPack({ packPath, mcpClient: client });

    // Round 2: mutate + regenerate.
    const cid1 = await writeClaim(packPath, '01-floor', 'src_aaaaaaaaaaaa', 1);
    await writeReview(packPath, '01-floor', cid1, 'accepted_for_synthesis');
    await writeSourceCard(packPath, '01-floor', 'src_aaaaaaaaaaaa', 'PubA');
    await refreshHandoff(packPath);
    const r2 = await recoverPack({ packPath, mcpClient: client, regenerateActionGraph: true });
    expect(r2.regenerated).toBe(true);

    // Round 3: mutate again + regenerate.
    const cid2 = await writeClaim(packPath, '01-floor', 'src_bbbbbbbbbbbb', 2);
    await writeReview(packPath, '01-floor', cid2, 'accepted_for_synthesis');
    await writeSourceCard(packPath, '01-floor', 'src_bbbbbbbbbbbb', 'PubB');
    await refreshHandoff(packPath);
    const r3 = await recoverPack({ packPath, mcpClient: client, regenerateActionGraph: true });
    expect(r3.regenerated).toBe(true);

    // Round 4: regenerate without state mutation → skip path (no archive add).
    const r4 = await recoverPack({ packPath, mcpClient: client, regenerateActionGraph: true });
    expect(r4.regenerated).toBe(false);

    // History should contain 2 pairs (json + md) = 4 entries, ordered.
    const history = await listRecoveryHistory(packPath);
    const jsonFiles = history.filter((f) => f.endsWith('.json'));
    const mdFiles = history.filter((f) => f.endsWith('.md'));
    expect(jsonFiles).toHaveLength(2);
    expect(mdFiles).toHaveLength(2);
    // Each archived JSON is intact (parseable, has input_state_hash on the
    // ones from R-014-era runs, or null on legacy).
    for (const f of jsonFiles) {
      const content = await readFile(
        join(packPath, 'recovery', 'history', f),
        'utf8',
      );
      expect(() => JSON.parse(content)).not.toThrow();
    }

    // Ledger has exactly 2 entries (rounds 2 + 3; round 4 was skip).
    const ledger = await readRegenerationLedger(packPath);
    expect(ledger).toHaveLength(2);
    expect(ledger[0]!.regeneration_reason).toBe('state_changed');
    expect(ledger[1]!.regeneration_reason).toBe('state_changed');
    // Each ledger entry references the archive it produced.
    expect(ledger[0]!.archived_json_path).toBeTruthy();
    expect(ledger[1]!.archived_json_path).toBeTruthy();
  });

  it('#8 append-only ledger discipline: no-regen runs do NOT write ledger entries', async () => {
    const packPath = await buildOneFloorPack(workDir);
    const client = makeFakeAdviceClient('add_on_topic_sources');

    // Initial run (no flag).
    await recoverPack({ packPath, mcpClient: client });
    expect(await readRegenerationLedger(packPath)).toHaveLength(0);

    // Default-flag run (no flag) — ledger still empty.
    await recoverPack({ packPath, mcpClient: client });
    expect(await readRegenerationLedger(packPath)).toHaveLength(0);

    // Regen with matching state → skip path, ledger stays empty.
    await recoverPack({ packPath, mcpClient: client, regenerateActionGraph: true });
    expect(await readRegenerationLedger(packPath)).toHaveLength(0);

    // Mutate + regen → exactly 1 entry appears.
    const cid = await writeClaim(packPath, '01-floor', 'src_cccccccccccc', 1);
    await writeReview(packPath, '01-floor', cid, 'accepted_for_synthesis');
    await writeSourceCard(packPath, '01-floor', 'src_cccccccccccc', 'PubC');
    await refreshHandoff(packPath);
    await recoverPack({ packPath, mcpClient: client, regenerateActionGraph: true });
    expect(await readRegenerationLedger(packPath)).toHaveLength(1);
  });

  it('#9 default recover pack (no --regenerate-action-graph) is unchanged behavior', async () => {
    const packPath = await buildOneFloorPack(workDir);
    const client = makeFakeAdviceClient('add_on_topic_sources');
    const result = await recoverPack({ packPath, mcpClient: client });
    // No regenerate fields populated on the summary.
    expect(result.regenerated).toBeUndefined();
    expect(result.regenerationReason).toBeUndefined();
    expect(result.archivedJsonPath).toBeUndefined();
    expect(result.archivedMarkdownPath).toBeUndefined();
    // Artifact still has input_state_hash (additive field always populated
    // going forward, even on the legacy path — this is the v0.4 fresh-pack
    // win that lets future regenerate-flag invocations skip correctly).
    const artifact = await readExistingRecoveryArtifact(packPath);
    expect(artifact!.input_state_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('regenerate with no prior artifact (first-time invocation) → no_prior_artifact reason', async () => {
    const packPath = await buildOneFloorPack(workDir);
    const client = makeFakeAdviceClient('add_on_topic_sources');
    const result = await recoverPack({
      packPath,
      mcpClient: client,
      regenerateActionGraph: true,
    });
    expect(result.regenerated).toBe(true);
    expect(result.regenerationReason).toBe('no_prior_artifact');
    expect(result.previousInputStateHash).toBeNull();
    expect(result.archivedJsonPath).toBeNull();
    expect(result.archivedMarkdownPath).toBeNull();
    // Ledger entry still written (it's the regenerate signal — even though
    // there's nothing to archive, the operator-trail captures that the
    // artifact was produced under the regenerate flag).
    const ledger = await readRegenerationLedger(packPath);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.regeneration_reason).toBe('no_prior_artifact');
  });
});

// ── §6 enum + prompt + verifier snapshot stability ─────────────────────────

describe('R-014 §6 — closed enums + advisor prompt + verifier unchanged', () => {
  it('#10 RECOVERY_ACTIONS enum snapshot — exactly 8 values in the canonical order', () => {
    expect([...RECOVERY_ACTIONS]).toEqual([
      'add_on_topic_sources',
      'apply_source_card_override',
      'repair_claim_scope',
      'rerun_stage',
      'apply_waiver',
      'narrow_section_purpose',
      'mark_section_out_of_scope',
      'defer_to_human_review',
    ]);
    // R-014 MUST NOT add new entries to the closed enum.
    expect(RECOVERY_ACTIONS.length).toBe(8);
  });

  it('REGENERATION_REASONS enum — exactly 3 values', () => {
    expect([...REGENERATION_REASONS]).toEqual([
      'state_changed',
      'missing_input_hash',
      'no_prior_artifact',
    ]);
  });

  it('#11 AI advisor prompt version + content snapshot stable', () => {
    expect(RECOVERY_ADVISOR_PROMPT_VERSION).toBe('recovery-advisor-v1');
    const d = diag('accepted_claim_floor', {
      section_id: 'snapshot-test',
      evidence_state: {
        extracted_claims: 5,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 5,
        sources: 3,
        distinct_publishers: 2,
        distinct_primary_publishers: 1,
        scope_repair_blocked: 0,
        source_repair_blocked: 5,
      },
    });
    const ag = buildActionGraph(d);
    const prompt = renderRecoveryAdvisorPrompt({
      packTopic: 'snapshot',
      packMode: 'synthesis_ready',
      diagnosis: d,
      actionGraph: ag,
      systemCannotSee: ['snapshot disclosure'],
      rejectionAddendum: null,
    });
    // R-014 specifically must NOT add the new fields to the rendered prompt.
    expect(prompt).not.toContain('scope_repair_blocked');
    expect(prompt).not.toContain('source_repair_blocked');
    // The existing 7-line evidence block is still present.
    expect(prompt).toContain('extracted_claims:');
    expect(prompt).toContain('needs_repair_claims:');
    expect(prompt).toContain('distinct_primary_publishers:');
  });

  it('#11 verifier still passes legitimate advice on the new source-dominant path', () => {
    const d = diag('accepted_claim_floor', {
      section_id: 'verifier-test',
      evidence_state: {
        extracted_claims: 5,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 5,
        sources: 3,
        distinct_publishers: 2,
        distinct_primary_publishers: 1,
        scope_repair_blocked: 0,
        source_repair_blocked: 5,
      },
    });
    const ag = buildActionGraph(d);
    // Compliant advice that picks the new source-dominant top action.
    const advice: RecoveryAdvice = {
      section_id: d.section_id,
      failure_summary: 'source-dominant',
      recommended_action: {
        action_id: 'add_on_topic_sources',
        rank_taken: 1,
        contrastive_framing:
          'You might think this needs a waiver. It does not — accepted_claim_floor is unwaiveable. The smallest reversible move is to add sources.',
        why_smallest_reversible: 'Adding sources is high-reversibility.',
        command_hint: ag.allowed_actions[0]!.command_hint,
        expected_outcome: 'fixture outcome',
      },
      also_consider: [],
      do_not: [{ action_id: 'apply_waiver', why_not: 'unwaiveable' }],
      system_cannot_see: ['fixture'],
      confidence: 'high',
    };
    const result = verifyRecoveryAdvice({ advice, actionGraph: ag, diagnosis: d });
    expect(result.valid).toBe(true);
  });
});
