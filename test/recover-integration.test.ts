/**
 * v0.9 Slice 3 — integration tests for the recovery orchestrator.
 *
 * Covers:
 *   - Retry path: invalid output on call 1, valid on call 2.
 *   - Deterministic fallback: invalid on both calls → advisor_verifier_exhausted.
 *   - Healthy-section skip: no advisor call for healthy sections.
 *   - Full 5-section pack run with mixed shapes.
 *   - Retry prompt does NOT contain previous output (Kim 2025).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { handoff as coworkHandoff } from '../src/cowork/index.js';
import { recoverPack } from '../src/recover/index.js';
import type { ProseCallToolClient } from '../src/synth/prose/types.js';
import type { RecoveryAdvice } from '../src/recover/types.js';

let workDir: string;
let packPath: string;

// ── Fake clients ───────────────────────────────────────────────────────────

interface CallRecord {
  text: string;
  hasAddendum: boolean;
}

function fakeMCPResponse(advice: RecoveryAdvice): { content: Array<{ type: string; text: string }> } {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ result: { ok: true, data: advice } }),
      },
    ],
  };
}

function makeRecordingClient(generate: (call: number, section_id: string) => RecoveryAdvice): {
  client: ProseCallToolClient;
  calls: CallRecord[];
  callsPerSection: () => Map<string, number>;
} {
  const calls: CallRecord[] = [];
  const client: ProseCallToolClient = {
    async callTool(params) {
      const args = params.arguments as Record<string, unknown>;
      const text = typeof args.text === 'string' ? args.text : '';
      const hasAddendum = text.includes('RETRY ADDENDUM');
      calls.push({ text, hasAddendum });
      // Extract the section_id from the prompt to drive per-section behavior.
      const sectionMatch = text.match(/section_id:\s+(\S+)/);
      const sectionId = sectionMatch ? sectionMatch[1]! : 'unknown';
      const callNo = calls.filter((c) => c.text.includes(`section_id:       ${sectionId}`)).length;
      const advice = generate(callNo, sectionId);
      return fakeMCPResponse(advice);
    },
  };
  const callsPerSection = (): Map<string, number> => {
    const map = new Map<string, number>();
    for (const c of calls) {
      const m = c.text.match(/section_id:\s+(\S+)/);
      if (!m) continue;
      const sid = m[1]!;
      map.set(sid, (map.get(sid) ?? 0) + 1);
    }
    return map;
  };
  return { client, calls, callsPerSection };
}

// ── Fixture pack builders ──────────────────────────────────────────────────

async function writeGate(
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

async function writeClaim(sectionId: string, srcId: string, i: number): Promise<string> {
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

async function writeReview(sectionId: string, cid: string, decision: string): Promise<void> {
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

async function writeSourceCard(sectionId: string, srcId: string, publisher: string): Promise<void> {
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

async function writeSynthesis(sectionId: string, content: Record<string, unknown>): Promise<void> {
  const dir = join(packPath, 'sections', sectionId, 'synthesis');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'section-synthesis.json'), JSON.stringify(content), 'utf8');
}

/**
 * Build a 5-section synthetic pack covering:
 *   01-floor   → accepted_claim_floor
 *   02-pubs    → min_independent_publishers
 *   03-noans   → prose_error_no_answer_cluster (gate passed)
 *   04-unrun   → unrun
 *   05-healthy → healthy
 */
async function buildFiveSectionPack(): Promise<void> {
  const r = await init({
    topic: 'Five-section recovery acceptance pack — multiple failure shapes',
    outDir: workDir,
  });
  packPath = r.packPath;

  for (const id of ['01-floor', '02-pubs', '03-noans', '04-unrun', '05-healthy']) {
    await sectionAdd({ id, purpose: `Purpose of ${id}`, packPath });
  }

  // 01-floor: zero accepted; gate-blocked on min_accepted_claims.
  await writeGate('01-floor', {
    verdict: 'blocked',
    synthesis_eligible: false,
    failures: [{ family: 'accepted_claim_floor', check: 'min_accepted_claims' }],
  });

  // 02-pubs: 3 accepted claims, but only 1 publisher.
  for (let i = 1; i <= 3; i++) {
    const cid = await writeClaim('02-pubs', 'src_bbbbbbbbbbbb', i);
    await writeReview('02-pubs', cid, 'accepted_for_synthesis');
  }
  await writeSourceCard('02-pubs', 'src_bbbbbbbbbbbb', 'OnlyPub');
  await writeGate('02-pubs', {
    verdict: 'blocked',
    synthesis_eligible: false,
    failures: [{ family: 'source_floor', check: 'independent_publishers' }],
  });

  // 03-noans: gate passed; synthesis returned no_answer_cluster.
  for (let i = 1; i <= 3; i++) {
    const cid = await writeClaim('03-noans', 'src_cccccccccccc', i);
    await writeReview('03-noans', cid, 'accepted_for_synthesis');
  }
  await writeSourceCard('03-noans', 'src_cccccccccccc', 'PubC');
  await writeGate('03-noans', { verdict: 'pass', synthesis_eligible: true });
  await writeSynthesis('03-noans', {
    status: 'partial_synthesis',
    proseError: { code: 'no_answer_cluster', message: 'no accepted claim earns answer role' },
  });

  // 04-unrun: no claims, no gate audit.

  // 05-healthy: 3 accepted, gate pass, faithful synthesis.
  for (let i = 1; i <= 3; i++) {
    const cid = await writeClaim('05-healthy', 'src_dddddddddddd', i);
    await writeReview('05-healthy', cid, 'accepted_for_synthesis');
  }
  await writeSourceCard('05-healthy', 'src_dddddddddddd', 'PubD');
  await writeGate('05-healthy', { verdict: 'pass', synthesis_eligible: true });
  await writeSynthesis('05-healthy', {
    status: 'partial_synthesis',
    prose: {
      paragraphs: [
        {
          paragraph_id: 'p1',
          role: 'answer',
          text: 'healthy answer',
          verifier_decision: 'faithful',
          support_bundle: { claim_ids: ['clm_dddddddddddd_heuristic_1'], source_card_ids: ['src_dddddddddddd'], waiver_ids: [], thin_evidence: false },
        },
      ],
    },
  });
}

// ── Advice generators for tests ────────────────────────────────────────────

function compliantAdviceFor(section_id: string): RecoveryAdvice {
  // We craft advice per failure shape implicitly via section_id mapping.
  const isFloor = section_id === '01-floor';
  const isPubs = section_id === '02-pubs';
  const isNoans = section_id === '03-noans';
  const isUnrun = section_id === '04-unrun';

  if (isFloor) {
    return {
      section_id,
      failure_summary: 'accepted_claim_floor — 0 accepted',
      recommended_action: {
        action_id: 'add_on_topic_sources',
        rank_taken: 1,
        contrastive_framing:
          'You might think this needs a waiver. It does not — accepted_claim_floor is unwaiveable. Add 2-3 on-topic sources.',
        why_smallest_reversible: 'High-reversibility action; operators can remove sources or rerun freely.',
        command_hint: 'research-os gather 01-floor --url <URL>',
        expected_outcome: '≥3 accepted claims after extract+review+gate.',
      },
      also_consider: [{ action_id: 'narrow_section_purpose', when_to_prefer: 'When claims are off-purpose' }],
      do_not: [{ action_id: 'apply_waiver', why_not: 'accepted_claim_floor is unwaiveable' }],
      system_cannot_see: ['Operator drafts'],
      confidence: 'high',
    };
  }
  if (isPubs) {
    return {
      section_id,
      failure_summary: 'min_independent_publishers',
      recommended_action: {
        action_id: 'add_on_topic_sources',
        rank_taken: 1,
        contrastive_framing:
          'You might reach for a waiver first. Try adding 1-2 sources from different publishers first; waiver is the third move.',
        why_smallest_reversible: 'Adding is reversible; waivers are durable artifacts.',
        command_hint: 'research-os gather 02-pubs --url <URL>',
        expected_outcome: 'distinct_publishers ≥ 4.',
      },
      also_consider: [{ action_id: 'apply_source_card_override', when_to_prefer: 'If sources are misclassified' }],
      do_not: [],
      system_cannot_see: ['Available publishers'],
      confidence: 'high',
    };
  }
  if (isNoans) {
    return {
      section_id,
      failure_summary: 'no_answer_cluster',
      recommended_action: {
        action_id: 'narrow_section_purpose',
        rank_taken: 1,
        contrastive_framing:
          "You might want to rerun the gate. Don't — the gate already passed. Narrow the section purpose so existing accepted claims can earn an answer role.",
        why_smallest_reversible: 'research.yaml edit is reversible; reruns are cheap.',
        command_hint: '# tighten purpose in research.yaml',
        expected_outcome: 'At least one accepted claim earns role=answer in section synthesis.',
      },
      also_consider: [{ action_id: 'add_on_topic_sources', when_to_prefer: 'If new on-topic claims are easy to gather' }],
      do_not: [{ action_id: 'rerun_stage', why_not: 'Gate passed; rerunning fixes nothing' }],
      system_cannot_see: ['Operator intent for the purpose'],
      confidence: 'high',
    };
  }
  if (isUnrun) {
    return {
      section_id,
      failure_summary: 'unrun',
      recommended_action: {
        action_id: 'rerun_stage',
        rank_taken: 1,
        contrastive_framing:
          'You might consider marking this out of scope. Run gather → extract → review → gate first to see if the section can be salvaged.',
        why_smallest_reversible: 'Pipeline stages are idempotent and reversible.',
        command_hint: 'research-os gather 04-unrun --url <URL>',
        expected_outcome: 'Section enters the cowork handoff with a gate verdict.',
      },
      also_consider: [{ action_id: 'mark_section_out_of_scope', when_to_prefer: 'If section is no longer in scope' }],
      do_not: [],
      system_cannot_see: ['Operator intent for this section'],
      confidence: 'high',
    };
  }
  // Fallback for any other id — shouldn't be reached in this test.
  return compliantAdviceFor('01-floor');
}

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'ros-recover-integration-'));
  await buildFiveSectionPack();
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('recoverPack — full 5-section integration', () => {
  it('produces recovery artifacts at recovery/blocked-section-recovery.{json,md}', async () => {
    await coworkHandoff({ packPath });
    const { client } = makeRecordingClient((_call, sid) => compliantAdviceFor(sid));
    const result = await recoverPack({ packPath, mcpClient: client });
    expect(result.jsonPath.endsWith('blocked-section-recovery.json')).toBe(true);
    expect(result.markdownPath.endsWith('blocked-section-recovery.md')).toBe(true);
    expect(result.totalSections).toBe(5);
    expect(result.advisedSections).toBe(4);
    expect(result.healthySections).toBe(1);
  });

  it('healthy section gets status: healthy and no advisor call', async () => {
    await coworkHandoff({ packPath });
    const { client, callsPerSection } = makeRecordingClient((_call, sid) => compliantAdviceFor(sid));
    const result = await recoverPack({ packPath, mcpClient: client });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const sections = artifact.sections as Array<Record<string, unknown>>;
    const healthy = sections.find((s) => s.section_id === '05-healthy');
    expect(healthy).toBeTruthy();
    expect(healthy!.status).toBe('healthy');
    expect(healthy!.diagnosis).toBeNull();
    expect(healthy!.advice).toBeNull();
    // No advisor call should have been made for 05-healthy.
    expect(callsPerSection().get('05-healthy') ?? 0).toBe(0);
  });

  it('each advised section gets an AI-with-verifier-pass result on compliant first attempt', async () => {
    await coworkHandoff({ packPath });
    const { client, callsPerSection } = makeRecordingClient((_call, sid) => compliantAdviceFor(sid));
    const result = await recoverPack({ packPath, mcpClient: client });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const sections = artifact.sections as Array<Record<string, unknown>>;
    for (const sid of ['01-floor', '02-pubs', '03-noans', '04-unrun']) {
      const s = sections.find((x) => x.section_id === sid)!;
      expect(s.status).toBe('recovery_advised');
      expect(s.advisor_path).toBe('ai_with_verifier_pass');
      expect(s.diagnosis).not.toBeNull();
      expect(s.action_graph).not.toBeNull();
      expect(s.advice).not.toBeNull();
      // Exactly one call per section.
      expect(callsPerSection().get(sid)).toBe(1);
    }
    expect(result.verifierRejections).toBe(0);
  });

  it('accepted_claim_floor section has apply_waiver in do_not[]', async () => {
    await coworkHandoff({ packPath });
    const { client } = makeRecordingClient((_call, sid) => compliantAdviceFor(sid));
    const result = await recoverPack({ packPath, mcpClient: client });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const sections = artifact.sections as Array<Record<string, unknown>>;
    const floor = sections.find((s) => s.section_id === '01-floor')!;
    const advice = floor.advice as Record<string, unknown>;
    const doNot = advice.do_not as Array<Record<string, unknown>>;
    expect(doNot.some((d) => d.action_id === 'apply_waiver')).toBe(true);
  });

  it('no_answer_cluster section has rerun_stage in do_not[]', async () => {
    await coworkHandoff({ packPath });
    const { client } = makeRecordingClient((_call, sid) => compliantAdviceFor(sid));
    const result = await recoverPack({ packPath, mcpClient: client });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const sections = artifact.sections as Array<Record<string, unknown>>;
    const noans = sections.find((s) => s.section_id === '03-noans')!;
    const advice = noans.advice as Record<string, unknown>;
    const doNot = advice.do_not as Array<Record<string, unknown>>;
    expect(doNot.some((d) => d.action_id === 'rerun_stage')).toBe(true);
  });
});

describe('recoverPack — retry path', () => {
  it('retries once when first call has verifier-rejecting output, admits the retry', async () => {
    await coworkHandoff({ packPath });
    const { client, calls, callsPerSection } = makeRecordingClient((call, sid) => {
      if (sid === '01-floor' && call === 1) {
        // First call: return forbidden recommended_action.
        const bad = compliantAdviceFor(sid);
        bad.recommended_action.action_id = 'apply_waiver'; // forbidden
        bad.do_not = []; // also strip the do_not disclosure
        return bad;
      }
      return compliantAdviceFor(sid);
    });
    const result = await recoverPack({ packPath, mcpClient: client });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const sections = artifact.sections as Array<Record<string, unknown>>;
    const floor = sections.find((s) => s.section_id === '01-floor')!;
    expect(floor.advisor_path).toBe('ai_with_retry_pass');
    expect(callsPerSection().get('01-floor')).toBe(2);
    expect(result.verifierRejections).toBe(1);

    // Sycophancy-mitigation: retry prompt must NOT contain the previous output.
    const retryCall = calls.find((c) => c.hasAddendum);
    expect(retryCall).toBeTruthy();
    expect(retryCall!.text).not.toContain('"recommended_action":');
    // It SHOULD contain the rejection reason though.
    expect(retryCall!.text).toContain('recommended_action_not_allowed');
  });
});

describe('recoverPack — deterministic fallback', () => {
  it('falls back to deterministic rendering when both calls are rejected', async () => {
    await coworkHandoff({ packPath });
    const { client, callsPerSection } = makeRecordingClient((call, sid) => {
      if (sid === '01-floor') {
        // Both calls return forbidden action.
        const bad = compliantAdviceFor(sid);
        bad.recommended_action.action_id = 'apply_waiver';
        bad.do_not = [];
        return bad;
      }
      return compliantAdviceFor(sid);
    });
    const result = await recoverPack({ packPath, mcpClient: client });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const sections = artifact.sections as Array<Record<string, unknown>>;
    const floor = sections.find((s) => s.section_id === '01-floor')!;
    expect(floor.advisor_path).toBe('deterministic_fallback');
    expect(callsPerSection().get('01-floor')).toBe(2);
    expect(result.verifierRejections).toBe(2);
    expect(result.fallbackSections).toBe(1);
    // proseError is recorded on the fallback section.
    expect(floor.prose_error).toBeTruthy();
    const proseError = floor.prose_error as Record<string, unknown>;
    expect(proseError.code).toBe('advisor_verifier_exhausted');
    // Fallback advice is still present (so the artifact is usable).
    expect(floor.advice).not.toBeNull();
    const advice = floor.advice as Record<string, unknown>;
    const rec = advice.recommended_action as Record<string, unknown>;
    // Fallback always picks the top-ranked allowed action — add_on_topic_sources.
    expect(rec.action_id).toBe('add_on_topic_sources');
  });
});

describe('recoverPack — Markdown output', () => {
  it('Markdown lists every section and discloses the deterministic-fallback path when used', async () => {
    await coworkHandoff({ packPath });
    const { client } = makeRecordingClient((call, sid) => {
      if (sid === '01-floor') {
        const bad = compliantAdviceFor(sid);
        bad.recommended_action.action_id = 'apply_waiver';
        bad.do_not = [];
        return bad;
      }
      return compliantAdviceFor(sid);
    });
    const result = await recoverPack({ packPath, mcpClient: client });
    const md = await readFile(result.markdownPath, 'utf8');

    expect(md).toContain('# Blocked-Section Recovery');
    expect(md).toContain('## 01-floor');
    expect(md).toContain('## 02-pubs');
    expect(md).toContain('## 03-noans');
    expect(md).toContain('## 04-unrun');
    expect(md).toContain('## 05-healthy — healthy');
    expect(md).toContain('Deterministic fallback');
    expect(md).toContain('Do NOT');
    expect(md).toContain('What this advisor cannot see');
    // Pack-readiness invariants preserved.
    expect(md).toContain('NOT freezable');
    expect(md).toContain('NOT publishable');
  });
});
