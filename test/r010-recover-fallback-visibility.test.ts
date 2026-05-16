/**
 * v0.11 Slice 4 — R-010 recover advisor TIER_TIMEOUT visibility.
 *
 * Coverage:
 *   - Pure-function classification of `last_rejection_reason` strings into
 *     a closed FallbackCause enum + optional timing extraction.
 *   - Orchestrator populates the new structured fields on prose_error when
 *     the deterministic fallback fires (purely additive — no logic changes
 *     to recovery selection or recommendations).
 *   - Markdown renderer surfaces the cause + timing in operator-facing
 *     output so the v0.2 TIER_TIMEOUT-buried-in-JSON case is no longer
 *     invisible. AI-advisor-success path renders unchanged.
 *   - v0.2 ground-truth replay: the actual last_rejection_reason string
 *     captured in the v0.2 gate-run pack classifies cleanly.
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
import { classifyFallbackCause } from '../src/recover/fallback-cause.js';
import { renderRecoveryMarkdown } from '../src/recover/markdown.js';
import type { ProseCallToolClient } from '../src/synth/prose/types.js';
import type { RecoveryAdvice, RecoveryArtifact } from '../src/recover/types.js';

// ── Pure-function classifier tests ──────────────────────────────────────────

describe('classifyFallbackCause — pure classifier', () => {
  it('classifies TIER_TIMEOUT with parseable elapsed/budget as tier_timeout + timing', () => {
    const reason =
      'mcp_error: {\n  "error": true,\n  "code": "TIER_TIMEOUT",\n  "message": "Tool ollama_extract timed out on tier instant elapsed=15012ms budget=15000ms fallback_attempted=true no cheaper tier available"\n}';
    const result = classifyFallbackCause(reason);
    expect(result.cause).toBe('tier_timeout');
    expect(result.timing).toEqual({ elapsed_ms: 15012, budget_ms: 15000 });
  });

  it('classifies TIER_TIMEOUT without parseable timing as tier_timeout (no timing)', () => {
    const reason = 'mcp_error: TIER_TIMEOUT: workhorse tier exceeded timeout budget';
    const result = classifyFallbackCause(reason);
    expect(result.cause).toBe('tier_timeout');
    expect(result.timing).toBeUndefined();
  });

  it('classifies non-TIER_TIMEOUT MCP errors as mcp_error', () => {
    const reason = 'mcp_error: connection refused at 127.0.0.1:11434';
    const result = classifyFallbackCause(reason);
    expect(result.cause).toBe('mcp_error');
    expect(result.timing).toBeUndefined();
  });

  it('classifies verifier-rejection format as retry_exhausted', () => {
    const reason = 'recommended_action_not_allowed: action_id apply_waiver not in allowed_actions';
    const result = classifyFallbackCause(reason);
    expect(result.cause).toBe('retry_exhausted');
    expect(result.timing).toBeUndefined();
  });

  it('handles other verifier rejection reasons as retry_exhausted', () => {
    const reasons = [
      'also_consider_contains_forbidden: ...',
      'do_not_missing_tempting_forbidden: ...',
      'empty_contrastive_framing: ...',
      'empty_system_cannot_see: ...',
      'pack_readiness_claim: ...',
      'top_action_skipped_without_rationale: ...',
    ];
    for (const r of reasons) {
      expect(classifyFallbackCause(r).cause).toBe('retry_exhausted');
    }
  });

  it('v0.2 ground-truth replay: section 01-productivity-effects last_rejection_reason classifies as tier_timeout with elapsed=15012 budget=15000', () => {
    // Verbatim from operator_aloneness_dst_v0.2 gate-run pack.
    const v02Reason =
      'mcp_error: {\n  "error": true,\n  "code": "TIER_TIMEOUT",\n  "message": "Tool ollama_extract timed out on tier instant elapsed=15012ms budget=15000ms fallback_attempted=true no cheaper tier available",\n  "hint": "Increase the tier\'s timeout (switch INTERN_PROFILE — dev profiles run Instant at 15s, m5-max at 5s), reduce input size, or ensure the model is resident (\'ollama ps\' / check /api/ps). Fallback target (none — terminal tier) was exhausted.",\n  "retryable": true\n}';
    const result = classifyFallbackCause(v02Reason);
    expect(result.cause).toBe('tier_timeout');
    expect(result.timing).toEqual({ elapsed_ms: 15012, budget_ms: 15000 });
  });

  it('v0.2 ground-truth replay: section 02-accident-rates last_rejection_reason classifies as tier_timeout with elapsed=15009', () => {
    const v02Reason =
      'mcp_error: {\n  "error": true,\n  "code": "TIER_TIMEOUT",\n  "message": "Tool ollama_extract timed out on tier instant elapsed=15009ms budget=15000ms fallback_attempted=true no cheaper tier available"\n}';
    const result = classifyFallbackCause(v02Reason);
    expect(result.cause).toBe('tier_timeout');
    expect(result.timing).toEqual({ elapsed_ms: 15009, budget_ms: 15000 });
  });

  it('handles whitespace variations in elapsed/budget patterns', () => {
    const reason = 'mcp_error: TIER_TIMEOUT elapsed = 30000 ms budget = 5000 ms';
    const result = classifyFallbackCause(reason);
    expect(result.cause).toBe('tier_timeout');
    expect(result.timing).toEqual({ elapsed_ms: 30000, budget_ms: 5000 });
  });
});

// ── Markdown rendering tests (pure function over RecoveryArtifact) ──────────

function makeBaseArtifact(): RecoveryArtifact {
  return {
    status: 'recovery_advisor_complete',
    pack_id: 'pkg_test',
    pack_topic: 'Test pack',
    pack_mode: 'repair_required',
    generated_at: '2026-05-15T00:00:00.000Z',
    research_os_version: '0.11.0',
    sections: [],
  };
}

function makeFallbackSection(args: {
  section_id: string;
  cause?: 'tier_timeout' | 'mcp_error' | 'retry_exhausted';
  timing?: { elapsed_ms: number; budget_ms: number };
  last_rejection_reason: string;
}) {
  return {
    section_id: args.section_id,
    section_purpose: `Purpose of ${args.section_id}`,
    status: 'recovery_advised' as const,
    diagnosis: {
      section_id: args.section_id,
      section_purpose: `Purpose of ${args.section_id}`,
      failure_shape: 'accepted_claim_floor' as const,
      blocking: true,
      waiveable: false,
      stage: 'gate' as const,
      evidence_state: {
        extracted_claims: 0,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 0,
        sources: 0,
        distinct_publishers: 0,
        distinct_primary_publishers: 0,
      },
      detail: 'fixture',
    },
    action_graph: {
      section_id: args.section_id,
      allowed_actions: [
        {
          action_id: 'add_on_topic_sources' as const,
          rank: 1,
          reversibility: 'high' as const,
          command_hint: `research-os gather ${args.section_id} --url <URL>`,
          why: 'Adds evidence.',
        },
      ],
      forbidden_actions: [
        { action_id: 'apply_waiver' as const, why_forbidden: 'unwaiveable' },
      ],
    },
    advice: {
      section_id: args.section_id,
      failure_summary: 'fixture',
      recommended_action: {
        action_id: 'add_on_topic_sources' as const,
        rank_taken: 1,
        contrastive_framing: 'fallback rendered deterministically.',
        why_smallest_reversible: 'High reversibility.',
        command_hint: `research-os gather ${args.section_id} --url <URL>`,
        expected_outcome: 'Re-run gate.',
      },
      also_consider: [],
      do_not: [{ action_id: 'apply_waiver' as const, why_not: 'unwaiveable' }],
      system_cannot_see: ['fixture'],
      confidence: 'medium' as const,
    },
    advisor_path: 'deterministic_fallback' as const,
    prose_error: {
      code: 'advisor_verifier_exhausted' as const,
      message: 'Recovery advisor failed verifier checks twice. Deterministic recovery rendering applied.',
      attempts: 2,
      last_rejection_reason: args.last_rejection_reason,
      ...(args.cause ? { fallback_cause: args.cause } : {}),
      ...(args.timing ? { timing_ms: args.timing } : {}),
    },
  };
}

describe('renderRecoveryMarkdown — R-010 fallback-cause visibility', () => {
  it('TIER_TIMEOUT case surfaces "AI advisor timed out" + elapsed/budget in MD', () => {
    const artifact = makeBaseArtifact();
    artifact.sections.push(
      makeFallbackSection({
        section_id: '01-floor',
        cause: 'tier_timeout',
        timing: { elapsed_ms: 15012, budget_ms: 15000 },
        last_rejection_reason:
          'mcp_error: {"code":"TIER_TIMEOUT","message":"... elapsed=15012ms budget=15000ms ..."}',
      }),
    );
    const md = renderRecoveryMarkdown(artifact);

    // The MD must distinguish the fallback case cleanly:
    expect(md).toMatch(/AI advisor timed out/i);
    // Elapsed + budget surfaced verbatim:
    expect(md).toContain('15012');
    expect(md).toContain('15000');
    // Cause keyword surfaced:
    expect(md).toContain('TIER_TIMEOUT');
    // Pointer to raw timing data is visible for operators who want details:
    expect(md).toMatch(/blocked-section-recovery\.json/);
    // The existing fallback messaging is still there (no regression on
    // R-002 disclosure):
    expect(md).toContain('Deterministic fallback');
  });

  it('retry-exhausted (verifier rejected twice) surfaces retry-exhaustion cause + does NOT claim timeout', () => {
    const artifact = makeBaseArtifact();
    artifact.sections.push(
      makeFallbackSection({
        section_id: '01-floor',
        cause: 'retry_exhausted',
        last_rejection_reason:
          'recommended_action_not_allowed: action_id apply_waiver not in allowed_actions',
      }),
    );
    const md = renderRecoveryMarkdown(artifact);

    // The retry-exhausted cause is named explicitly:
    expect(md).toMatch(/retry|verifier/i);
    // Must NOT claim a timeout (regression guard):
    expect(md).not.toMatch(/AI advisor timed out/i);
    expect(md).not.toContain('TIER_TIMEOUT');
    // Existing deterministic-fallback disclosure preserved:
    expect(md).toContain('Deterministic fallback');
    // Pointer to raw JSON for full detail:
    expect(md).toMatch(/blocked-section-recovery\.json/);
  });

  it('mcp_error (non-timeout) surfaces a generic MCP-error cause without timeout claim', () => {
    const artifact = makeBaseArtifact();
    artifact.sections.push(
      makeFallbackSection({
        section_id: '01-floor',
        cause: 'mcp_error',
        last_rejection_reason: 'mcp_error: connection refused at 127.0.0.1:11434',
      }),
    );
    const md = renderRecoveryMarkdown(artifact);

    expect(md).toMatch(/MCP|advisor (error|unavailable|failed)/i);
    expect(md).not.toMatch(/AI advisor timed out/i);
    expect(md).not.toContain('TIER_TIMEOUT');
    expect(md).toContain('Deterministic fallback');
  });

  it('AI-advisor-success path (no prose_error) — NO fallback cause messaging (regression guard)', () => {
    const artifact = makeBaseArtifact();
    artifact.sections.push({
      section_id: '01-floor',
      section_purpose: 'Purpose of 01-floor',
      status: 'recovery_advised' as const,
      diagnosis: {
        section_id: '01-floor',
        section_purpose: 'Purpose of 01-floor',
        failure_shape: 'accepted_claim_floor' as const,
        blocking: true,
        waiveable: false,
        stage: 'gate' as const,
        evidence_state: {
          extracted_claims: 0,
          accepted_claims: 0,
          frame_excluded_claims: 0,
          needs_repair_claims: 0,
          sources: 0,
          distinct_publishers: 0,
          distinct_primary_publishers: 0,
        },
        detail: 'fixture',
      },
      action_graph: {
        section_id: '01-floor',
        allowed_actions: [
          {
            action_id: 'add_on_topic_sources' as const,
            rank: 1,
            reversibility: 'high' as const,
            command_hint: 'research-os gather 01-floor --url <URL>',
            why: 'Adds evidence.',
          },
        ],
        forbidden_actions: [],
      },
      advice: {
        section_id: '01-floor',
        failure_summary: 'fixture',
        recommended_action: {
          action_id: 'add_on_topic_sources' as const,
          rank_taken: 1,
          contrastive_framing: 'You might think this needs a waiver. It does not.',
          why_smallest_reversible: 'High reversibility.',
          command_hint: 'research-os gather 01-floor --url <URL>',
          expected_outcome: 'Re-run gate.',
        },
        also_consider: [],
        do_not: [],
        system_cannot_see: ['fixture'],
        confidence: 'high' as const,
      },
      advisor_path: 'ai_with_verifier_pass' as const,
    });
    const md = renderRecoveryMarkdown(artifact);

    // NO fallback-cause messaging when the advisor succeeded:
    expect(md).not.toMatch(/AI advisor timed out/i);
    expect(md).not.toContain('TIER_TIMEOUT');
    expect(md).not.toContain('Deterministic fallback');
    expect(md).not.toMatch(/Why the AI advisor fell back/i);
    expect(md).not.toMatch(/AI advisor unavailable/i);
    // But the section is still rendered:
    expect(md).toContain('## 01-floor');
  });

  it('TIER_TIMEOUT without parseable timing surfaces cause but no fabricated numbers', () => {
    const artifact = makeBaseArtifact();
    artifact.sections.push(
      makeFallbackSection({
        section_id: '01-floor',
        cause: 'tier_timeout',
        // no timing_ms — classifier could not parse elapsed/budget
        last_rejection_reason: 'mcp_error: TIER_TIMEOUT: tier exceeded timeout budget',
      }),
    );
    const md = renderRecoveryMarkdown(artifact);

    expect(md).toMatch(/AI advisor timed out/i);
    expect(md).toContain('TIER_TIMEOUT');
    // Cause surfaces; no fabricated timing numbers:
    expect(md).not.toMatch(/elapsed \d+ms over \d+ms/i);
  });

  it('top-level callout breaks down fallback counts by cause when fallbacks present', () => {
    const artifact = makeBaseArtifact();
    artifact.sections.push(
      makeFallbackSection({
        section_id: '01-floor',
        cause: 'tier_timeout',
        timing: { elapsed_ms: 15012, budget_ms: 15000 },
        last_rejection_reason: 'mcp_error: TIER_TIMEOUT elapsed=15012ms budget=15000ms',
      }),
      makeFallbackSection({
        section_id: '02-pubs',
        cause: 'tier_timeout',
        timing: { elapsed_ms: 15009, budget_ms: 15000 },
        last_rejection_reason: 'mcp_error: TIER_TIMEOUT elapsed=15009ms budget=15000ms',
      }),
    );
    const md = renderRecoveryMarkdown(artifact);

    // Top callout still has the existing fallback line:
    expect(md).toContain('Deterministic fallback applied to:');
    // Cause breakdown surfaced near the top so operators see at a glance
    // that the AI advisor timed out:
    expect(md).toMatch(/timeout/i);
  });
});

// ── Integration tests through recoverPack — fallback wiring + MD output ────

let workDir: string;
let packPath: string;

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

function fakeMCPErrorResponse(errorPayload: string): {
  content: Array<{ type: string; text: string }>;
} {
  // Mimics ollama-intern-mcp's structured-error envelope: result.ok=false
  // with result.error containing a JSON-stringified error object.
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ result: { ok: false, error: errorPayload } }),
      },
    ],
  };
}

async function writeGate(
  sectionId: string,
  args: {
    verdict: 'pass' | 'warn' | 'fail' | 'blocked';
    synthesis_eligible: boolean;
    failures?: Array<{ family: string; check: string }>;
  },
): Promise<void> {
  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(
    join(packPath, 'audits', `${sectionId}-gate.json`),
    JSON.stringify({
      section_id: sectionId,
      verdict: args.verdict,
      summary: `fixture gate for ${sectionId}`,
      checked_at: '2026-05-15T00:00:02.000Z',
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
}

async function buildOneSectionFloorPack(): Promise<void> {
  const r = await init({
    topic: 'R-010 single-section fallback visibility pack',
    outDir: workDir,
  });
  packPath = r.packPath;

  await sectionAdd({ id: '01-floor', purpose: 'Purpose of 01-floor', packPath });
  await writeGate('01-floor', {
    verdict: 'blocked',
    synthesis_eligible: false,
    failures: [{ family: 'accepted_claim_floor', check: 'min_accepted_claims' }],
  });
  // Touch the receipt hash util so the unused import lint isn't tripped.
  createHash('sha256').update('r010').digest('hex');
  // appendFile import is used for parity with peer tests but unused here —
  // reference it harmlessly to keep tooling quiet.
  void appendFile;
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'ros-r010-'));
  await buildOneSectionFloorPack();
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('recoverPack — R-010 prose_error structural fields + MD wiring', () => {
  it('TIER_TIMEOUT MCP error response → prose_error.fallback_cause === "tier_timeout" + timing_ms populated + MD surfaces it', async () => {
    await coworkHandoff({ packPath });

    const client: ProseCallToolClient = {
      async callTool() {
        // Mimic the v0.2 ollama-intern-mcp TIER_TIMEOUT envelope shape.
        const errPayload = JSON.stringify({
          error: true,
          code: 'TIER_TIMEOUT',
          message:
            'Tool ollama_extract timed out on tier instant elapsed=15012ms budget=15000ms fallback_attempted=true no cheaper tier available',
          hint: 'Increase tier timeout or reduce input size.',
          retryable: true,
        });
        return fakeMCPErrorResponse(errPayload);
      },
    };

    const result = await recoverPack({ packPath, mcpClient: client });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const sections = artifact.sections as Array<Record<string, unknown>>;
    const floor = sections.find((s) => s.section_id === '01-floor')!;

    expect(floor.advisor_path).toBe('deterministic_fallback');
    expect(result.fallbackSections).toBe(1);

    const proseError = floor.prose_error as Record<string, unknown>;
    expect(proseError).toBeTruthy();
    expect(proseError.code).toBe('advisor_verifier_exhausted');
    // Structural cause classification — R-010 additive:
    expect(proseError.fallback_cause).toBe('tier_timeout');
    expect(proseError.timing_ms).toEqual({ elapsed_ms: 15012, budget_ms: 15000 });
    // The raw last_rejection_reason still preserved for raw inspection:
    expect(proseError.last_rejection_reason as string).toContain('TIER_TIMEOUT');
    expect(proseError.last_rejection_reason as string).toContain('elapsed=15012ms');

    // MD now surfaces the cause + timing for operator visibility:
    const md = await readFile(result.markdownPath, 'utf8');
    expect(md).toMatch(/AI advisor timed out/i);
    expect(md).toContain('15012');
    expect(md).toContain('15000');
    expect(md).toContain('TIER_TIMEOUT');
    // Pointer to raw JSON for full inspection:
    expect(md).toMatch(/blocked-section-recovery\.json/);
    // Pack-readiness invariants preserved (no regression):
    expect(md).toContain('NOT freezable');
    expect(md).toContain('NOT publishable');
  });

  it('verifier-rejected-twice path → prose_error.fallback_cause === "retry_exhausted" (no timing) + MD surfaces retry-exhaustion', async () => {
    await coworkHandoff({ packPath });

    // Always return a forbidden recommended_action so the verifier rejects.
    const client: ProseCallToolClient = {
      async callTool(params) {
        const args = params.arguments as Record<string, unknown>;
        const text = typeof args.text === 'string' ? args.text : '';
        const sectionMatch = text.match(/section_id:\s+(\S+)/);
        const sectionId = sectionMatch ? sectionMatch[1]! : '01-floor';
        const bad: RecoveryAdvice = {
          section_id: sectionId,
          failure_summary: 'fixture',
          recommended_action: {
            action_id: 'apply_waiver', // forbidden on accepted_claim_floor
            rank_taken: 1,
            contrastive_framing: 'Forbidden advice for testing.',
            why_smallest_reversible: 'fixture',
            command_hint: '# fixture',
            expected_outcome: 'fixture',
          },
          also_consider: [],
          do_not: [], // also strip the do_not disclosure
          system_cannot_see: ['fixture'],
          confidence: 'medium',
        };
        return fakeMCPResponse(bad);
      },
    };

    const result = await recoverPack({ packPath, mcpClient: client });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const sections = artifact.sections as Array<Record<string, unknown>>;
    const floor = sections.find((s) => s.section_id === '01-floor')!;

    expect(floor.advisor_path).toBe('deterministic_fallback');
    const proseError = floor.prose_error as Record<string, unknown>;
    expect(proseError.code).toBe('advisor_verifier_exhausted');
    expect(proseError.fallback_cause).toBe('retry_exhausted');
    expect(proseError.timing_ms).toBeUndefined();

    const md = await readFile(result.markdownPath, 'utf8');
    expect(md).toMatch(/retry|verifier/i);
    expect(md).not.toMatch(/AI advisor timed out/i);
    expect(md).not.toContain('TIER_TIMEOUT');
    expect(md).toContain('Deterministic fallback');
  });

  it('AI-advisor-success path → no prose_error, no fallback messaging in MD (regression guard)', async () => {
    await coworkHandoff({ packPath });

    const client: ProseCallToolClient = {
      async callTool(params) {
        const args = params.arguments as Record<string, unknown>;
        const text = typeof args.text === 'string' ? args.text : '';
        const sectionMatch = text.match(/section_id:\s+(\S+)/);
        const sectionId = sectionMatch ? sectionMatch[1]! : '01-floor';
        const good: RecoveryAdvice = {
          section_id: sectionId,
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
          also_consider: [
            { action_id: 'narrow_section_purpose', when_to_prefer: 'When claims are off-purpose' },
          ],
          do_not: [{ action_id: 'apply_waiver', why_not: 'accepted_claim_floor is unwaiveable' }],
          system_cannot_see: ['Operator drafts'],
          confidence: 'high',
        };
        return fakeMCPResponse(good);
      },
    };

    const result = await recoverPack({ packPath, mcpClient: client });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const sections = artifact.sections as Array<Record<string, unknown>>;
    const floor = sections.find((s) => s.section_id === '01-floor')!;

    expect(floor.advisor_path).toBe('ai_with_verifier_pass');
    expect(floor.prose_error).toBeUndefined();

    const md = await readFile(result.markdownPath, 'utf8');
    // Absolutely no fallback messaging when the advisor succeeded:
    expect(md).not.toMatch(/AI advisor timed out/i);
    expect(md).not.toContain('TIER_TIMEOUT');
    expect(md).not.toContain('Deterministic fallback');
    expect(md).not.toMatch(/Why the AI advisor fell back/i);
    expect(md).not.toMatch(/AI advisor unavailable/i);
    // Section still appears, and the AI advice still appears:
    expect(md).toContain('## 01-floor');
    expect(md).toMatch(/AI advice \(verified\)/i);
  });
});

// ── Pack-law invariants preserved (no regression on R-002 routing) ─────────

describe('R-010 invariants — fallback recovery behavior unchanged (no logic regression)', () => {
  it('TIER_TIMEOUT fallback still recommends add_on_topic_sources for accepted_claim_floor (R-002 behavior)', async () => {
    await coworkHandoff({ packPath });

    const client: ProseCallToolClient = {
      async callTool() {
        const errPayload = JSON.stringify({
          error: true,
          code: 'TIER_TIMEOUT',
          message:
            'Tool ollama_extract timed out on tier instant elapsed=15012ms budget=15000ms fallback_attempted=true no cheaper tier available',
        });
        return fakeMCPErrorResponse(errPayload);
      },
    };

    const result = await recoverPack({ packPath, mcpClient: client });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const sections = artifact.sections as Array<Record<string, unknown>>;
    const floor = sections.find((s) => s.section_id === '01-floor')!;
    const advice = floor.advice as Record<string, unknown>;
    const rec = advice.recommended_action as Record<string, unknown>;
    // R-002 behavior preserved: accepted_claim_floor → add_on_topic_sources is rank 1.
    expect(rec.action_id).toBe('add_on_topic_sources');
    // apply_waiver remains in do_not[]:
    const doNot = advice.do_not as Array<Record<string, unknown>>;
    expect(doNot.some((d) => d.action_id === 'apply_waiver')).toBe(true);
  });
});
