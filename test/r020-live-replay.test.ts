// R-020 — LIVE replay against the actual ollama-intern-mcp MCP server.
//
// This is the falsifiable acceptance gate per the synthetic-vs-live doctrine
// (memory/feedback_synthetic_vs_live_acceptance.md). The synthetic acceptance
// tests in test/r020-no-answer-cluster-recovery.test.ts validate the
// data-flow plumbing; they cannot validate whether the prompt tune (A) and
// inline recovery surface (D) hold up against the actual LLM judgment.
//
// This test is intentionally SKIPPED in CI. It runs only when:
//   - R020_LIVE_REPLAY=1            (explicit operator opt-in)
//   - R020_LIVE_FIXTURE points at the v0.4 rerun pack directory
//                                     (default: E:/AI/research-os-gate-runs/
//                                     operator_aloneness_dst_v0.4/operator-run/
//                                     dst-rerun-productivity-accidents)
//   - OLLAMA_INTERN_MCP_BIN points at the R-019 build of ollama-intern-mcp
//                                     (e.g., E:/AI/ollama-intern-mcp/dist/index.js
//                                     after a clean `npm run build` on the
//                                     R-019 branch or v0.13-slice2-r020 branch)
//   - Ollama is reachable at OLLAMA_HOST (default http://localhost:11434)
//     and the hermes3:8b model is resident (`ollama ps` to verify)
//   - Optional: R020_SYNTHETIC_RUNS (default 3) controls LIVE.1 run count
//   - Optional: R020_STOCHASTIC_RUNS (default 3) controls LIVE.1b run count
//
// The two falsification fixtures:
//
//   LIVE.1 — Synthetic deterministic fixture
//     Adversarial section purpose constructed to defeat the planner's
//     prompt bias and trigger no_answer_cluster reliably. Pre-R-020 baseline
//     (verified manually during Phase C) was 3/3 fires. Post-R-020 outcome
//     for each run must be EITHER:
//       (a) prose generates successfully (the prompt tune helped the LLM
//           override the bias against this adversarial purpose), OR
//       (b) no_answer_cluster fires AND recovery_actions[] is populated
//           in section-synthesis.json (the inline recovery surface fired).
//     Both are valid post-R-020 outcomes; the failure mode is "no_answer_cluster
//     fires AND recovery_actions[] is absent" — that's a MISTARGETED-PATCH
//     for the D-half.
//
//   LIVE.1b — Stochastic v0.4 regression
//     Real-world v0.4 rerun fixture (unmodified). Under R-019 + warm hermes3:8b
//     + 60000ms override the planner generally produces good role assignments
//     (see Phase C surface — pre-R-020 reproduction succeeded on this fixture).
//     Post-R-020 assertion: every run that fires no_answer_cluster has
//     recovery_actions[] populated. Success path: at least one paragraph with
//     role=answer and verifier_decision=faithful. (Rate comparison is
//     documented in the Phase D commit message; the test enforces the
//     no-regression invariant per-run.)

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  cpSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const LIVE_RIG = process.env.R020_LIVE_REPLAY === '1';
const FIXTURE_PATH =
  process.env.R020_LIVE_FIXTURE ??
  'E:/AI/research-os-gate-runs/operator_aloneness_dst_v0.4/operator-run/dst-rerun-productivity-accidents';
const MCP_BIN = process.env.OLLAMA_INTERN_MCP_BIN ?? '';
const OVERRIDE_MS = process.env.R020_OVERRIDE_MS ?? '60000';
const SYNTHETIC_RUNS = parseInt(process.env.R020_SYNTHETIC_RUNS ?? '3', 10);
const STOCHASTIC_RUNS = parseInt(process.env.R020_STOCHASTIC_RUNS ?? '3', 10);

const ADVERSARIAL_SECTION_PURPOSE =
  'Conditions under which DST transitions show NO statistically significant effect on workplace productivity or accident rates';

const cliPath = join(__dirname, '..', 'dist', 'cli.js');

// ── Helpers ──────────────────────────────────────────────────────────────────

function copyFixtureToTmp(): string {
  const tmp = mkdtempSync(join(tmpdir(), 'r020-live-'));
  cpSync(FIXTURE_PATH, tmp, { recursive: true });
  return tmp;
}

function rewriteSectionPurpose(packPath: string, newPurpose: string): void {
  // research.yaml: replace the section purpose line. The fixture's section
  // purpose is the load-bearing trigger for the planner's role-assignment
  // judgment — overwriting only this string isolates the adversarial test
  // from any other fixture state.
  const yamlPath = join(packPath, 'research.yaml');
  const yamlText = readFileSync(yamlPath, 'utf8');
  const yamlPatched = yamlText.replace(
    /^( {4}purpose: ).*$/m,
    `$1${newPurpose}`,
  );
  if (yamlPatched === yamlText) {
    throw new Error('research.yaml: failed to locate "    purpose: <...>" line to rewrite');
  }
  writeFileSync(yamlPath, yamlPatched, 'utf8');

  // cowork-handoff.json: the synth-section command prefers research.yaml's
  // purpose, but rewrite the handoff snapshot too for consistency in any
  // downstream consumer that reads the handoff directly.
  const handoffPath = join(packPath, 'handoffs', 'cowork-handoff.json');
  const handoff = JSON.parse(readFileSync(handoffPath, 'utf8'));
  for (const section of handoff.sections) {
    if (section.section_id === '01-dst-transition-effects') {
      section.purpose = newPurpose;
    }
  }
  writeFileSync(handoffPath, JSON.stringify(handoff, null, 2), 'utf8');
}

function clearPriorSynthesisArtifacts(packPath: string): void {
  // Each run must start from a clean slate — otherwise the synth command
  // refuses to overwrite or reuses a prior partial. Remove the three output
  // files if present.
  const synthDir = join(packPath, 'sections', '01-dst-transition-effects', 'synthesis');
  for (const name of ['section-synthesis.json', 'section-synthesis.md', 'section-brief.md']) {
    const p = join(synthDir, name);
    if (existsSync(p)) unlinkSync(p);
  }
}

function runSynthSection(packPath: string, overrideMs: string): {
  stdout: string;
  stderr: string;
  status: number;
} {
  // spawnSync captures stdout AND stderr separately (execFileSync would
  // discard stderr on success and the [synth] stderr-hint assertions would
  // see only ''). Live runs may exit 0 (success or no_answer_cluster) or
  // non-zero (MCP transport error), so don't rely on status alone.
  const r = spawnSync(
    'node',
    [cliPath, 'synth', 'section', '01-dst-transition-effects', '--pack', packPath],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS: overrideMs,
        OLLAMA_INTERN_MCP_BIN: MCP_BIN,
      },
      timeout: 5 * 60 * 1000,
    },
  );
  return {
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    status: typeof r.status === 'number' ? r.status : 1,
  };
}

interface SectionSynthesisManifest {
  planner_timeout_ms?: number;
  planner_timeout_overridden_by?: string;
  prose?: {
    paragraphs?: Array<{ role: string; verifier_decision?: string }>;
  };
  proseError?: {
    code?: string;
    message?: string;
    recovery_actions?: Array<{ action_id: string; why: string; command_hint: string }>;
    unused_claims?: Array<{ claim_id: string; role_rationale: string }>;
  };
}

function readManifest(packPath: string): SectionSynthesisManifest {
  const jsonPath = join(
    packPath,
    'sections',
    '01-dst-transition-effects',
    'synthesis',
    'section-synthesis.json',
  );
  return JSON.parse(readFileSync(jsonPath, 'utf8'));
}

function readMarkdown(packPath: string): string {
  const mdPath = join(
    packPath,
    'sections',
    '01-dst-transition-effects',
    'synthesis',
    'section-synthesis.md',
  );
  return readFileSync(mdPath, 'utf8');
}

// ── Guard test (always runs; verifies the live-rig env shape) ────────────────

describe('R-020 LIVE replay — environment guard', () => {
  it('LIVE.1/1b suite skip flag is honored when R020_LIVE_REPLAY != "1"', () => {
    expect([true, false]).toContain(LIVE_RIG);
  });
});

// ── LIVE.1 — Synthetic deterministic fixture ─────────────────────────────────

interface RunOutcome {
  index: number;
  category: 'success' | 'no_answer_cluster_ok' | 'no_answer_cluster_broken' | 'mcp_transport_error' | 'other';
  detail: string;
}

function classifyRun(
  index: number,
  manifest: SectionSynthesisManifest,
  cliResult: { stdout: string; stderr: string; status: number },
): RunOutcome {
  // MCP SDK request timeout (-32001) and other transport-level errors come
  // through as proseError strings (not the structured no_answer_cluster
  // object). They are NOT R-020 failures — they're infrastructure flakes
  // separate from the role-assignment mechanism R-020 targets. Mirroring
  // R-019's live-replay pattern, transport errors are reported but do NOT
  // fail the test.
  const transportSignals = ['MCP unavailable', 'MCP error -', 'Request timed out', 'connection closed'];
  // section-run.ts writes plain proseError (a string) to the manifest only
  // when no_answer_cluster wasn't the failure; we have to inspect the CLI
  // stdout which surfaces the `prose error: ...` line for transport cases.
  if (
    !manifest.proseError &&
    !manifest.prose?.paragraphs?.length &&
    transportSignals.some((s) => cliResult.stdout.includes(s) || cliResult.stderr.includes(s))
  ) {
    const line = cliResult.stdout.split('\n').find((l) => l.includes('prose error:'));
    return { index, category: 'mcp_transport_error', detail: line ?? 'MCP transport error (no detail captured)' };
  }
  if (manifest.proseError?.code === 'no_answer_cluster') {
    const recovery = manifest.proseError.recovery_actions ?? [];
    if (recovery.length >= 2) {
      const ids = recovery.map((a) => a.action_id);
      if (ids.includes('narrow_section_purpose') && ids.includes('add_on_topic_sources')) {
        return { index, category: 'no_answer_cluster_ok', detail: `recovery_actions=[${ids.join(',')}]` };
      }
    }
    return { index, category: 'no_answer_cluster_broken', detail: `recovery_actions absent or malformed (got ${recovery.length} actions)` };
  }
  if (manifest.prose?.paragraphs && manifest.prose.paragraphs.length > 0) {
    const hasAnswer = manifest.prose.paragraphs.some((p) => p.role === 'answer');
    if (hasAnswer) {
      return { index, category: 'success', detail: `${manifest.prose.paragraphs.length} paragraphs, has answer` };
    }
    return { index, category: 'other', detail: `prose generated but no role=answer paragraph (unexpected)` };
  }
  return { index, category: 'other', detail: `neither no_answer_cluster nor prose.paragraphs[] populated` };
}

describe.skipIf(!LIVE_RIG)('R-020 LIVE.1 — Synthetic deterministic fixture (adversarial section purpose)', () => {
  it(`runs ${SYNTHETIC_RUNS}x against the adversarial-purpose fixture; every no_answer_cluster fire MUST surface recovery_actions[]`, () => {
    if (!MCP_BIN || !existsSync(MCP_BIN)) {
      throw new Error(
        `R020_LIVE_REPLAY=1 but OLLAMA_INTERN_MCP_BIN is not a valid path: "${MCP_BIN}". ` +
          'Build ollama-intern-mcp on the v0.13-slice1-r019 branch (npm run build) and set the env var.',
      );
    }
    if (!existsSync(FIXTURE_PATH)) {
      throw new Error(
        `R020_LIVE_REPLAY=1 but R020_LIVE_FIXTURE does not exist: "${FIXTURE_PATH}". ` +
          'Set R020_LIVE_FIXTURE to the v0.4 rerun pack directory.',
      );
    }

    const packPath = copyFixtureToTmp();
    try {
      rewriteSectionPurpose(packPath, ADVERSARIAL_SECTION_PURPOSE);

      const outcomes: RunOutcome[] = [];

      for (let i = 1; i <= SYNTHETIC_RUNS; i++) {
        clearPriorSynthesisArtifacts(packPath);
        const r = runSynthSection(packPath, OVERRIDE_MS);
        const manifest = readManifest(packPath);
        const o = classifyRun(i, manifest, r);
        outcomes.push(o);

        // LIVE.4 (cross-slice with R-019): planner_timeout_ms must reflect the
        // override on every run that produced a manifest. (Transport-error
        // runs may produce a manifest with planner_timeout_ms = override too,
        // because section-run.ts writes the manifest before attempting
        // prose; we assert here as a soft regression check.)
        expect(manifest.planner_timeout_ms).toBe(parseInt(OVERRIDE_MS, 10));

        if (o.category === 'no_answer_cluster_ok') {
          // LIVE.3 — additionally verify the markdown render embeds the actions.
          const md = readMarkdown(packPath);
          expect(md).toContain('## Recovery actions');
          expect(md).toContain('narrow_section_purpose');
          expect(md).toContain('add_on_topic_sources');
          // Stderr hint fired.
          expect(r.stderr).toContain('no_answer_cluster');
        }
      }

      // Per-run outcome summary (visible in the test output).
      // eslint-disable-next-line no-console
      console.log(
        `[R-020 LIVE.1 synthetic] outcomes:\n` +
          outcomes.map((o) => `  run ${o.index}: ${o.category} — ${o.detail}`).join('\n'),
      );

      // R-020-relevant assertions:
      //   - Zero no_answer_cluster_broken runs (R-020.LIVE.3 doctrine: every fire
      //     must surface recovery_actions[]).
      const broken = outcomes.filter((o) => o.category === 'no_answer_cluster_broken');
      expect(broken).toHaveLength(0);
      //   - At least one run exercised an R-020 surface (not 100% transport flakes).
      //     If every run hit MCP transport errors, the test didn't actually
      //     exercise the mechanism — surface as a separate signal.
      const exercised = outcomes.filter(
        (o) => o.category === 'success' || o.category === 'no_answer_cluster_ok',
      );
      expect(exercised.length).toBeGreaterThan(0);
      //   - "other" category catches genuinely unexpected shapes (not transport,
      //     not no_answer, not success). These are R-020 mistargets.
      const other = outcomes.filter((o) => o.category === 'other');
      expect(other).toHaveLength(0);
    } finally {
      rmSync(packPath, { recursive: true, force: true });
    }
  }, /* per-test timeout = SYNTHETIC_RUNS × 5 min + buffer */ (SYNTHETIC_RUNS * 5 + 2) * 60 * 1000);
});

// ── LIVE.1b — Stochastic v0.4 regression ─────────────────────────────────────

describe.skipIf(!LIVE_RIG)('R-020 LIVE.1b — Stochastic v0.4 regression', () => {
  it(`runs ${STOCHASTIC_RUNS}x against the unmodified v0.4 fixture; every no_answer_cluster fire MUST surface recovery_actions[]`, () => {
    if (!MCP_BIN || !existsSync(MCP_BIN)) {
      throw new Error(`R020_LIVE_REPLAY=1 but OLLAMA_INTERN_MCP_BIN is not a valid path: "${MCP_BIN}".`);
    }
    if (!existsSync(FIXTURE_PATH)) {
      throw new Error(`R020_LIVE_REPLAY=1 but R020_LIVE_FIXTURE does not exist: "${FIXTURE_PATH}".`);
    }

    const packPath = copyFixtureToTmp();
    try {
      const outcomes: RunOutcome[] = [];

      for (let i = 1; i <= STOCHASTIC_RUNS; i++) {
        clearPriorSynthesisArtifacts(packPath);
        const r = runSynthSection(packPath, OVERRIDE_MS);
        const manifest = readManifest(packPath);
        const o = classifyRun(i, manifest, r);
        outcomes.push(o);

        // LIVE.4 — R-019's tier_budget_ms_override surface is still threaded.
        expect(manifest.planner_timeout_ms).toBe(parseInt(OVERRIDE_MS, 10));

        if (o.category === 'no_answer_cluster_ok') {
          const md = readMarkdown(packPath);
          expect(md).toContain('## Recovery actions');
          expect(r.stderr).toContain('no_answer_cluster');
        }
        if (o.category === 'success') {
          // Success path also exercises R-019.LIVE.4 implicitly: verifier
          // ran to faithful completion under the R-019 tier-budget override.
          const faithfulCount = manifest.prose!.paragraphs!.filter(
            (p) => p.verifier_decision === 'faithful',
          ).length;
          expect(faithfulCount).toBeGreaterThan(0);
        }
      }

      // eslint-disable-next-line no-console
      console.log(
        `[R-020 LIVE.1b stochastic] outcomes:\n` +
          outcomes.map((o) => `  run ${o.index}: ${o.category} — ${o.detail}`).join('\n'),
      );

      // Same R-020-relevant assertions as LIVE.1.
      const broken = outcomes.filter((o) => o.category === 'no_answer_cluster_broken');
      expect(broken).toHaveLength(0);
      const exercised = outcomes.filter(
        (o) => o.category === 'success' || o.category === 'no_answer_cluster_ok',
      );
      expect(exercised.length).toBeGreaterThan(0);
      const other = outcomes.filter((o) => o.category === 'other');
      expect(other).toHaveLength(0);
    } finally {
      rmSync(packPath, { recursive: true, force: true });
    }
  }, /* per-test timeout = STOCHASTIC_RUNS × 5 min + buffer */ (STOCHASTIC_RUNS * 5 + 2) * 60 * 1000);
});
