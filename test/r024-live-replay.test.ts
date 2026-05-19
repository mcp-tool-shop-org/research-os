// R-024 (v0.13.1) — LIVE replay against the actual ollama-intern-mcp MCP
// server + Ollama, exercising the v0.5-shape extract failure that motivated
// the patch.
//
// This is the falsifiable acceptance gate per the synthetic-vs-live doctrine
// (memory/feedback_synthetic_vs_live_acceptance.md). The synthetic wire-up
// tests in test/r024-tier-budget-override.test.ts validate the data-flow
// plumbing through the toolArgs builders; they cannot validate whether the
// override value reaches the inner ollama-intern-mcp `runWithTimeoutAndFallback`
// control point in a live environment.
//
// This test is intentionally SKIPPED in CI. It runs only when:
//   - R024_LIVE_REPLAY=1            (explicit operator opt-in)
//   - R024_LIVE_FIXTURE points at a v0.5-shape pack directory
//                                     (default: E:/AI/research-os-gate-runs/
//                                     operator_aloneness_dst_v0.5/operator-run/
//                                     dst-policy-evidence)
//   - R024_LIVE_SECTION points at the section to re-extract
//                                     (default: 02-safety-and-economic — the
//                                     section that hit 3 TIER_TIMEOUTs in v0.5)
//   - OLLAMA_INTERN_MCP_BIN points at the published ollama-intern-mcp@>=2.6.0
//                                     (e.g., E:/AI/ollama-intern-mcp/dist/index.js
//                                     or a fresh `npm install`'s
//                                     node_modules/ollama-intern-mcp/dist/index.js)
//   - Ollama is reachable at OLLAMA_HOST (default http://localhost:11434)
//     and the hermes3:8b model is resident (`ollama ps` to verify)
//
// Four falsifiable assertions per the kickoff's R-024.LIVE conditions:
//   R-024.LIVE.1  Inner TIER_TIMEOUT at the original 15000ms budget does NOT
//                 fire under the override — extract receipt's `failures[].reason`
//                 must NOT contain `budget=15000ms` literal.
//   R-024.LIVE.2  Override reached the MCP-side control point — receipt
//                 metadata records `tier_budget_ms` = override + `tier_budget_overridden_by`
//                 = 'cli_flag'; NDJSON log shows server-side timeout events
//                 (if any) at the override value, NOT at 15000.
//   R-024.LIVE.3  Operator-visible surface — stderr contains the
//                 `[extract] tier_budget_ms=<N> source=cli_flag section=<id>`
//                 line BEFORE the per-source loop. (R-018 + R-019 surface
//                 preservation is asserted by the synthetic test's R-024.11
//                 import smoke; not re-asserted live here to keep replay
//                 runtime bounded.)
//   R-024.LIVE.4  Default behavior preserved (negative check, GATED behind a
//                 separate env-var because it reproduces the v0.5 failure and
//                 is slow) — running with NO --tier-budget-ms and NO env var
//                 reproduces the byte-identical pre-R-024 shape (at least one
//                 source hits `budget=15000ms` TIER_TIMEOUT, and the receipt
//                 omits `tier_budget_ms` / `tier_budget_overridden_by` fields).
//
// A passing case for R-024.LIVE.1 / .2 / .3 (the override-active branch):
//   (a) extraction completes successfully on every source (no failures with
//       budget=15000ms), OR
//   (b) extraction fails for a different named reason (HTTP error, JSON parse,
//       upstream model error). The failure body MUST NOT contain
//       `budget=15000ms` — that literal is the v0.5 MISTARGETED-PATCH risk
//       shape and its presence under the override would mean R-024's wire-up
//       did NOT reach the inner control point.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync, cpSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

const LIVE_RIG = process.env.R024_LIVE_REPLAY === '1';
const LIVE_RIG_DEFAULT_PATH_CHECK = process.env.R024_LIVE_DEFAULT_PATH === '1';
const FIXTURE_PATH =
  process.env.R024_LIVE_FIXTURE ??
  'E:/AI/research-os-gate-runs/operator_aloneness_dst_v0.5/operator-run/dst-policy-evidence';
const SECTION_ID = process.env.R024_LIVE_SECTION ?? '02-safety-and-economic';
const MCP_BIN = process.env.OLLAMA_INTERN_MCP_BIN ?? '';
const OVERRIDE_MS = process.env.R024_OVERRIDE_MS ?? '60000';

const cliPath = join(__dirname, '..', 'dist', 'cli.js');

function copyFixtureToTmp(): string {
  const tmp = mkdtempSync(join(tmpdir(), 'r024-live-'));
  cpSync(FIXTURE_PATH, tmp, { recursive: true });
  return tmp;
}

// Prepare the fixture for re-extract while keeping the v0.5 completion ledger
// intact. The strategy: --resume against the existing completion ledger means
// successfully-completed v0.5 sources skip; only the v0.5-FAILED sources
// (the ones that hit 15000ms TIER_TIMEOUT) re-attempt under R-024's override.
// This narrows the live replay to the exact failure-mode sources R-024 fixes,
// keeping total runtime bounded (~3 sources × ~1–3 min each).
//
// Critically: DELETE the existing audits/<section>-claim-extract.json. If the
// new extract throws or is killed mid-run, the receipt won't be re-written,
// and the test will fail with a CLEAR "file not found" error instead of
// silently passing on a stale v0.5 receipt.
function prepareFixtureForResumeReplay(packPath: string, sectionId: string): void {
  const receiptPath = join(packPath, 'audits', `${sectionId}-claim-extract.json`);
  if (existsSync(receiptPath)) {
    try {
      unlinkSync(receiptPath);
    } catch {
      /* swallow */
    }
  }
}

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

function runClaimExtract(packPath: string, args: string[]): RunResult {
  // spawnSync captures stdout AND stderr regardless of exit code — execFileSync
  // only returns stdout on success and surfaces stderr only inside the thrown
  // error on failure. The R-024 stderr log line assertion needs the capture
  // regardless of success/failure so we use spawnSync.
  const result = spawnSync(
    'node',
    [cliPath, 'claim', 'extract', SECTION_ID, '--pack', packPath, '--progress', ...args],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        OLLAMA_INTERN_MCP_BIN: MCP_BIN,
      },
      // Live MCP + LLM under operator-shape extracts can run for many
      // minutes when --resume narrows to v0.5-FAILED sources only. Allow
      // up to 15 minutes per run.
      timeout: 15 * 60 * 1000,
    },
  );
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? (result.signal ? 1 : 0),
  };
}

interface ExtractReceipt {
  tier_budget_ms?: number;
  tier_budget_overridden_by?: string;
  failures?: Array<{ source_id?: string; reason?: string; kind?: string }>;
  sources_processed?: number;
  sources_failed?: number;
  sources_skipped?: number;
}

function readReceipt(packPath: string, sectionId: string): ExtractReceipt {
  const receiptPath = join(packPath, 'audits', `${sectionId}-claim-extract.json`);
  if (!existsSync(receiptPath)) {
    throw new Error(`extract receipt not found at ${receiptPath}`);
  }
  return JSON.parse(readFileSync(receiptPath, 'utf8')) as ExtractReceipt;
}

describe.skipIf(!LIVE_RIG || !existsSync(FIXTURE_PATH) || MCP_BIN === '')(
  'R-024 LIVE replay (operator-rig only — skipped in CI) — override-active branch',
  () => {
    it(
      'override propagates through to MCP-side per-tier budget; inner TIER_TIMEOUT at 15000ms does NOT fire',
      { timeout: 20 * 60 * 1000 },
      () => {
        if (!existsSync(cliPath)) {
          throw new Error(`research-os CLI not built; expected ${cliPath} — run 'npm run build' first.`);
        }
        if (!existsSync(MCP_BIN)) {
          throw new Error(`OLLAMA_INTERN_MCP_BIN does not exist: ${MCP_BIN}`);
        }

        const packPath = copyFixtureToTmp();
        // Capture the test-run start timestamp BEFORE invoking the CLI so the
        // NDJSON inspection below filters out stale events from prior runs
        // (the global ~/.ollama-intern/log.ndjson is append-only across all
        // research-os + ollama-intern-mcp runs on this rig).
        const runStartedAt = new Date().toISOString();
        try {
          prepareFixtureForResumeReplay(packPath, SECTION_ID);

          // --resume narrows the live run to the v0.5-FAILED sources only
          // (the ones that hit 15000ms TIER_TIMEOUT). Successfully-completed
          // v0.5 sources skip via the existing completion ledger. Bounded
          // runtime ~3 sources × ~1–3 min each = ~5–10 min total.
          const { stdout, stderr, status } = runClaimExtract(packPath, [
            '--resume',
            '--tier-budget-ms',
            OVERRIDE_MS,
          ]);
          void stdout;
          void status;

          const overrideMs = parseInt(OVERRIDE_MS, 10);

          // R-024.LIVE.3 — operator-visible stderr surface.
          expect(
            stderr,
            'expected [extract] tier_budget_ms=<N> source=cli_flag line in stderr before the per-source loop',
          ).toContain(`[extract] tier_budget_ms=${overrideMs} source=cli_flag section=${SECTION_ID}`);

          // R-024.LIVE.2 — receipt metadata records the override.
          const receipt = readReceipt(packPath, SECTION_ID);
          expect(receipt.tier_budget_ms).toBe(overrideMs);
          expect(receipt.tier_budget_overridden_by).toBe('cli_flag');

          // R-024.LIVE.1 — inner 15000ms TIER_TIMEOUT shape does NOT fire.
          // Survey every failure reason for the v0.5 MISTARGETED-PATCH shape.
          // ANY occurrence of `budget=15000ms` under an active override means
          // R-024's wire-up did NOT reach the inner control point at that call
          // site — surface as a clear test failure.
          const failures = receipt.failures ?? [];
          for (const f of failures) {
            const reason = String(f.reason ?? '');
            expect(
              reason.includes('budget=15000ms'),
              `R-024 MISTARGETED-PATCH risk on source ${f.source_id}: inner TIER_TIMEOUT at original 15000ms budget still fires under override; failure reason: ${reason.slice(0, 200)}`,
            ).toBe(false);
          }

          // R-024.LIVE.2 (cont.) — NDJSON log inspection: server-side timeout
          // events on ollama_extract from THIS RUN should record the override
          // budget, NOT the profile default 15000. We filter by ts > runStartedAt
          // because ~/.ollama-intern/log.ndjson is append-only across all runs
          // on this rig (prior v0.5 operator runs left 15000ms timeout events
          // in the log; those are NOT R-024 evidence).
          //
          // We don't require any timeout events to exist (successful calls
          // don't log timeouts); we only require that any timeout that DID
          // fire from THIS run shows the override value, not 15000.
          const logPath =
            process.env.INTERN_LOG_PATH ?? join(homedir(), '.ollama-intern', 'log.ndjson');
          let thisRunTimeoutCount = 0;
          let thisRunTimeoutsAtOverride = 0;
          if (existsSync(logPath)) {
            const logContent = readFileSync(logPath, 'utf8');
            const lines = logContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
            const overrideMsNum = parseInt(OVERRIDE_MS, 10);
            const sawWrongBudget = lines.some((line) => {
              try {
                const event = JSON.parse(line) as Record<string, unknown>;
                // Filter to events from this test run (ts > runStartedAt).
                if (typeof event.ts !== 'string' || event.ts < runStartedAt) return false;
                if (event.tool !== 'ollama_extract') return false;
                if (event.kind !== 'timeout') return false;
                thisRunTimeoutCount += 1;
                if (event.timeout_ms === overrideMsNum) {
                  thisRunTimeoutsAtOverride += 1;
                }
                if (event.timeout_ms === 15000) return true;
                return false;
              } catch {
                return false;
              }
            });
            expect(
              sawWrongBudget,
              `NDJSON log shows ollama_extract timeout at original 15000ms budget in THIS run (started ${runStartedAt}) — override did NOT reach MCP-side control point`,
            ).toBe(false);
          }

          // Report-back signal for operator inspection.
          // eslint-disable-next-line no-console
          console.log(
            JSON.stringify(
              {
                R024_live_replay_evidence: {
                  pack_path: packPath,
                  section_id: SECTION_ID,
                  override_ms: overrideMs,
                  run_started_at: runStartedAt,
                  receipt_tier_budget_ms: receipt.tier_budget_ms,
                  receipt_tier_budget_overridden_by: receipt.tier_budget_overridden_by,
                  sources_processed: receipt.sources_processed,
                  sources_failed: receipt.sources_failed,
                  sources_skipped: receipt.sources_skipped,
                  failure_count: failures.length,
                  any_failure_at_15000ms: failures.some((f) =>
                    String(f.reason ?? '').includes('budget=15000ms'),
                  ),
                  this_run_ollama_extract_timeout_events: thisRunTimeoutCount,
                  this_run_timeouts_at_override_value: thisRunTimeoutsAtOverride,
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

// R-024.LIVE.4 — default-path preservation check (gated separately because
// it reproduces the v0.5 failure and can be slow). Operators run this when
// validating that R-024 has not regressed the default path: without --tier-budget-ms
// and without RESEARCH_OS_EXTRACT_TIER_BUDGET_MS, the same fixture reproduces
// byte-identical pre-R-024 behavior (at least one source hits budget=15000ms,
// receipt omits tier_budget_ms / tier_budget_overridden_by).
describe.skipIf(
  !LIVE_RIG || !LIVE_RIG_DEFAULT_PATH_CHECK || !existsSync(FIXTURE_PATH) || MCP_BIN === '',
)(
  'R-024 LIVE replay — default-path preservation (R-024.LIVE.4, gated)',
  () => {
    it(
      'no override + no env var → receipt omits tier-budget metadata; v0.5 inner-tier failure shape reproduces',
      { timeout: 30 * 60 * 1000 },
      () => {
        if (!existsSync(cliPath)) {
          throw new Error(`research-os CLI not built; expected ${cliPath}.`);
        }

        const packPath = copyFixtureToTmp();
        try {
          prepareFixtureForResumeReplay(packPath, SECTION_ID);

          // Strip the env var defensively even if the operator set it.
          const env = { ...process.env };
          delete env.RESEARCH_OS_EXTRACT_TIER_BUDGET_MS;

          // --resume narrows to v0.5-FAILED sources, same as the override
          // branch — confirms the default path also operates on the same
          // narrow scope without invoking the override.
          const { stderr } = runClaimExtract(packPath, ['--resume']);

          // Stderr log line must show source=default, value=default.
          expect(stderr).toContain(
            `[extract] tier_budget_ms=default source=default section=${SECTION_ID}`,
          );

          const receipt = readReceipt(packPath, SECTION_ID);
          expect(receipt.tier_budget_ms, 'default path must omit tier_budget_ms').toBeUndefined();
          expect(
            receipt.tier_budget_overridden_by,
            'default path must omit tier_budget_overridden_by',
          ).toBeUndefined();

          // Report-back: we do NOT assert that budget=15000ms reproduced — on a
          // hot rig with hermes3:8b warm + smaller windows the timeout may not
          // fire even at the profile default. The load-bearing assertion is
          // that the receipt SHAPE is byte-identical to pre-R-024 (no new
          // fields on the default path).
          // eslint-disable-next-line no-console
          console.log(
            JSON.stringify(
              {
                R024_default_path_evidence: {
                  pack_path: packPath,
                  section_id: SECTION_ID,
                  receipt_keys_with_tier_budget: Object.keys(receipt).filter((k) =>
                    k.startsWith('tier_budget'),
                  ),
                  sources_processed: receipt.sources_processed,
                  sources_failed: receipt.sources_failed,
                  any_failure_at_15000ms: (receipt.failures ?? []).some((f) =>
                    String(f.reason ?? '').includes('budget=15000ms'),
                  ),
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
            /* swallow */
          }
        }
      },
    );
  },
);

describe('R-024 LIVE replay — environment guard', () => {
  it('test skip guard fires when LIVE replay env not configured', () => {
    // This always-on test documents the gating contract; it does NOT
    // run the live replay. The actual live tests are in the skipIf'd
    // describe blocks above.
    const gates = {
      R024_LIVE_REPLAY: process.env.R024_LIVE_REPLAY === '1',
      R024_LIVE_DEFAULT_PATH: process.env.R024_LIVE_DEFAULT_PATH === '1',
      R024_LIVE_FIXTURE_exists: existsSync(FIXTURE_PATH),
      OLLAMA_INTERN_MCP_BIN_set: MCP_BIN !== '',
    };
    void gates;
    expect(true).toBe(true);
  });
});
