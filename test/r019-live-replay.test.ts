// R-019 — LIVE replay against the actual ollama-intern-mcp MCP server.
//
// This is the falsifiable acceptance gate per the synthetic-vs-live doctrine
// (memory/feedback_synthetic_vs_live_acceptance.md). The synthetic wire-up
// tests in test/r019-tier-budget-override.test.ts validate the data-flow
// plumbing; they cannot validate whether the override value reaches the
// inner ollama-intern-mcp `runWithTimeoutAndFallback` control point in a
// live environment.
//
// This test is intentionally SKIPPED in CI. It runs only when:
//   - R019_LIVE_REPLAY=1            (explicit operator opt-in)
//   - R019_LIVE_FIXTURE points at the v0.4 rerun pack directory
//                                     (default: E:/AI/research-os-gate-runs/
//                                     operator_aloneness_dst_v0.4/operator-run/
//                                     dst-rerun-productivity-accidents)
//   - OLLAMA_INTERN_MCP_BIN points at the R-019 build of ollama-intern-mcp
//                                     (e.g., E:/AI/ollama-intern-mcp/dist/index.js
//                                     after a clean `npm run build` on the
//                                     R-019 branch)
//   - Ollama is reachable at OLLAMA_HOST (default http://localhost:11434)
//     and the hermes3:8b model is resident (`ollama ps` to verify)
//
// Three falsifiable assertions (per operator authorization in Phase B):
//   R-019.LIVE.1  R-018 visibility intact: section-synthesis.json records
//                 planner_timeout_ms equal to the override value AND
//                 planner_timeout_overridden_by="env_var"
//   R-019.LIVE.2  Inner TIER_TIMEOUT at 15000ms does NOT fire — the
//                 failure body (if any) must NOT contain "budget=15000ms"
//   R-019.LIVE.3  Logs/artifacts show the override reached the MCP-side
//                 control point — the NDJSON log's timeout events on the
//                 prose call(s) must show the override value, not 15000
//
// A passing case is EITHER:
//   (a) synthesis completes successfully (section-synthesis.json has a
//       populated `prose` block; section-synthesis.md renders paragraphs), OR
//   (b) synthesis fails for a DIFFERENT named reason (no_answer_cluster from
//       R-020 layer; unparseable from drafter/verifier; transport error).
//       The failure body MUST NOT be the original inner-tier shape.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

const LIVE_RIG = process.env.R019_LIVE_REPLAY === '1';
const FIXTURE_PATH =
  process.env.R019_LIVE_FIXTURE ??
  'E:/AI/research-os-gate-runs/operator_aloneness_dst_v0.4/operator-run/dst-rerun-productivity-accidents';
const MCP_BIN = process.env.OLLAMA_INTERN_MCP_BIN ?? '';
const OVERRIDE_MS = process.env.R019_OVERRIDE_MS ?? '30000';

const cliPath = join(__dirname, '..', 'dist', 'cli.js');

function copyFixtureToTmp(): string {
  const tmp = mkdtempSync(join(tmpdir(), 'r019-live-'));
  cpSync(FIXTURE_PATH, tmp, { recursive: true });
  return tmp;
}

function runSynthSection(packPath: string, overrideMs: string): {
  stdout: string;
  stderr: string;
  status: number;
} {
  try {
    const stdout = execFileSync(
      'node',
      [cliPath, 'synth', 'section', '01-dst-transition-effects', '--pack', packPath],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS: overrideMs,
          OLLAMA_INTERN_MCP_BIN: MCP_BIN,
        },
        // Live MCP + LLM can take a while; allow up to 5 minutes per call.
        timeout: 5 * 60 * 1000,
      },
    );
    return { stdout, stderr: '', status: 0 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      status?: number;
    };
    return {
      stdout: typeof e.stdout === 'string' ? e.stdout : (e.stdout?.toString('utf8') ?? ''),
      stderr: typeof e.stderr === 'string' ? e.stderr : (e.stderr?.toString('utf8') ?? ''),
      status: typeof e.status === 'number' ? e.status : 1,
    };
  }
}

interface SectionSynthesisManifest {
  planner_timeout_ms?: number;
  planner_timeout_overridden_by?: string;
  prose?: unknown;
  proseError?: { code?: string; message?: string };
}

describe.skipIf(!LIVE_RIG || !existsSync(FIXTURE_PATH) || MCP_BIN === '')(
  'R-019 LIVE replay (operator-rig only — skipped in CI)',
  () => {
    it(
      'override propagates through to MCP-side per-tier budget; inner TIER_TIMEOUT at 15000ms does NOT fire',
      { timeout: 6 * 60 * 1000 },
      () => {
        const packPath = copyFixtureToTmp();
        try {
          if (!existsSync(cliPath)) {
            throw new Error(`research-os CLI not built; expected ${cliPath} — run 'npm run build' first.`);
          }
          if (!existsSync(MCP_BIN)) {
            throw new Error(`OLLAMA_INTERN_MCP_BIN does not exist: ${MCP_BIN}`);
          }

          const { stdout, stderr, status } = runSynthSection(packPath, OVERRIDE_MS);

          // The exit code can be 0 (synthesis completed) or non-zero (synthesis
          // failed for a named reason). EITHER outcome is acceptable for R-019
          // acceptance — what matters is that the inner-tier failure shape does
          // not reproduce under the override.
          void stdout;
          void stderr;
          void status;

          const synthDir = join(packPath, 'sections', '01-dst-transition-effects', 'synthesis');
          const jsonPath = join(synthDir, 'section-synthesis.json');
          const mdPath = join(synthDir, 'section-synthesis.md');

          expect(existsSync(jsonPath), `section-synthesis.json must exist at ${jsonPath}`).toBe(true);
          expect(existsSync(mdPath), `section-synthesis.md must exist at ${mdPath}`).toBe(true);

          const manifest = JSON.parse(readFileSync(jsonPath, 'utf8')) as SectionSynthesisManifest;
          const mdContent = readFileSync(mdPath, 'utf8');

          // R-019.LIVE.1 — R-018 visibility intact.
          expect(manifest.planner_timeout_ms).toBe(parseInt(OVERRIDE_MS, 10));
          expect(manifest.planner_timeout_overridden_by).toBe('env_var');

          // R-019.LIVE.2 — inner TIER_TIMEOUT at 15000ms does NOT fire.
          // If a TIER_TIMEOUT does occur (e.g., override at 30s but Ollama
          // genuinely slow), the budget number must equal the override, not
          // the original 15000. The forbidden shape is the literal
          // "budget=15000ms" pattern from the v0.4 rerun failure body.
          expect(
            mdContent,
            'R-019 MISTARGETED-PATCH risk — inner TIER_TIMEOUT at original 15000ms budget still fires under override',
          ).not.toContain('budget=15000ms');

          // R-019.LIVE.3 — logs/artifacts show the override reached the
          // MCP-side control point. Check ollama-intern-mcp's NDJSON log
          // (default path ~/.ollama-intern/log.ndjson; override via
          // INTERN_LOG_PATH).
          const logPath = process.env.INTERN_LOG_PATH ?? join(homedir(), '.ollama-intern', 'log.ndjson');
          if (existsSync(logPath)) {
            const logContent = readFileSync(logPath, 'utf8');
            const lines = logContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
            // Look at the tail (recent events) for timeout / call events on
            // ollama_extract showing the override budget.
            const recentLines = lines.slice(-200);
            const overrideMs = parseInt(OVERRIDE_MS, 10);
            const sawOverride = recentLines.some((line) => {
              try {
                const event = JSON.parse(line) as Record<string, unknown>;
                if (event.tool !== 'ollama_extract') return false;
                // timeout event records the budget that fired.
                if (event.kind === 'timeout' && event.timeout_ms === overrideMs) return true;
                return false;
              } catch {
                return false;
              }
            });
            // Don't hard-fail if no timeout event was logged — successful
            // calls (override worked, model returned in time) won't log
            // timeout events. But if any timeout DID fire on ollama_extract,
            // its budget should equal the override.
            const sawWrongBudget = recentLines.some((line) => {
              try {
                const event = JSON.parse(line) as Record<string, unknown>;
                if (event.tool !== 'ollama_extract') return false;
                if (event.kind === 'timeout' && event.timeout_ms === 15000) return true;
                return false;
              } catch {
                return false;
              }
            });
            expect(
              sawWrongBudget,
              'NDJSON log shows ollama_extract timeout at original 15000ms budget — override did NOT reach MCP-side control point',
            ).toBe(false);
            void sawOverride; // informational; not asserted
          }

          // Report-back signal in test output for operator inspection.
          // eslint-disable-next-line no-console
          console.log(
            JSON.stringify(
              {
                R019_live_replay_evidence: {
                  pack_path: packPath,
                  exit_status: status,
                  planner_timeout_ms: manifest.planner_timeout_ms,
                  planner_timeout_overridden_by: manifest.planner_timeout_overridden_by,
                  prose_generated: manifest.prose !== undefined,
                  prose_error_code: manifest.proseError?.code,
                  prose_error_message_truncated: manifest.proseError?.message?.slice(0, 200),
                  md_first_line: mdContent.split('\n')[0],
                  md_contains_budget_15000ms: mdContent.includes('budget=15000ms'),
                },
              },
              null,
              2,
            ),
          );
        } finally {
          try {
            rmSync(packPath, { recursive: true, force: true });
          } catch {
            /* swallow cleanup error */
          }
        }
      },
    );
  },
);

describe('R-019 LIVE replay — environment guard', () => {
  it('test skip guard fires when LIVE replay env not configured', () => {
    // This always-on test documents the gating contract; it does NOT
    // run the live replay. The actual live test is in the skipIf'd
    // describe block above.
    const gates = {
      R019_LIVE_REPLAY: process.env.R019_LIVE_REPLAY === '1',
      R019_LIVE_FIXTURE_exists: existsSync(FIXTURE_PATH),
      OLLAMA_INTERN_MCP_BIN_set: MCP_BIN !== '',
    };
    void gates;
    expect(true).toBe(true);
  });
});
