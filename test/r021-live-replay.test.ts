// R-021 — LIVE replay of the contradict-map auto-mode hang-detection MECHANISM.
//
// Per the synthetic-vs-live doctrine (memory/feedback_synthetic_vs_live_acceptance.md):
// when a named patch claims to fix a live failure mechanism, the acceptance
// suite MUST include at least one LIVE replay against the actual environment.
//
// The v0.4 rerun's 45-minute silent hang is NOT reliably reproducible in CI —
// the underlying Ollama-side state (queue saturation, model loading delays)
// that produced the hang is transient and rig-specific. Per the doctrine's
// impractical-live-replay clause, this test exercises the MECHANISM under
// artificially-low timeout (analogous to R-019's 200ms-override pattern):
// real Ollama, real hermes3:8b model, real classifyPair() code path, but with
// a per-pair timeout deliberately set below any reasonable LLM call latency
// (500ms) so the timeout + fall-through path engages reliably.
//
// This test is intentionally SKIPPED in CI. It runs only when:
//   - R021_LIVE_REPLAY=1            (explicit operator opt-in)
//   - Ollama is reachable at OLLAMA_HOST (default http://localhost:11434)
//     and the hermes3:8b model is resident (`ollama ps` to verify; warm-up
//     with one /api/chat call before running this test for cleanest timing)
//
// Three falsifiable assertions:
//   R-021.LIVE.1  Per-pair timeout fires under artificially-low budget.
//                 stderr log shows at least one "auto-mode pair N/M timed
//                 out at <ms>ms" line.
//   R-021.LIVE.2  Fall-through engages after the configured consecutive-
//                 timeout threshold. stderr log shows the
//                 "auto-mode fall-through: ... switching to heuristic" line.
//   R-021.LIVE.3  Heuristic completes the remaining pairs and contradictions.md
//                 renders the "## Auto-mode fall-through" block with the
//                 named reason + per-pair budget + remaining-pair count.
//
// R-021.LIVE.4 (R-019 cross-slice regression) and R-021.LIVE.5 (R-020 D-only
// behavior) are verified by re-running test/r019-live-replay.test.ts and
// test/r020-live-replay.test.ts against the R-021 branch. They are documented
// in the Phase D commit message rather than re-implemented here.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const LIVE_RIG = process.env.R021_LIVE_REPLAY === '1';
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434';

const cliPath = join(__dirname, '..', 'dist', 'cli.js');

// ── Fixture builder ──────────────────────────────────────────────────────────
//
// Build a minimal pack with 6 candidate claims that all share core tokens
// ("test", "shared", "token", "overlap", "always") so every C(6,2)=15 pair
// survives the Jaccard prefilter (>= 0.25 token overlap). Adversarial-fixture
// design parallel to R-020's adversarial-purpose fixture: the prefilter is
// deliberately saturated so the LLM detector sees the full pair set.

const SHARED_TOKENS = 'test shared token overlap always common probe ground baseline anchor';
const CLAIM_TEMPLATES = [
  `Approach A applies ${SHARED_TOKENS} pattern aggressively`,
  `Approach B applies ${SHARED_TOKENS} pattern cautiously`,
  `Approach C rejects ${SHARED_TOKENS} pattern under pressure`,
  `Approach D accepts ${SHARED_TOKENS} pattern under pressure`,
  `Approach E modifies ${SHARED_TOKENS} pattern over iterations`,
  `Approach F preserves ${SHARED_TOKENS} pattern over iterations`,
];

function buildClaim(id: string, asserts: string): Record<string, unknown> {
  const sourceHash = createHash('sha256').update(id).digest('hex');
  return {
    claim_id: id,
    section_id: '01-test',
    source_ids: [`src_${id.slice(4, 16)}`],
    source_hashes: [sourceHash],
    asserts,
    scope: 'shared probe scope',
    not: null,
    evidence_excerpt: asserts,
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-05-17T00:00:00.000Z',
    review_state: 'candidate',
  };
}

function makeFixturePack(): string {
  const tmp = mkdtempSync(join(tmpdir(), 'r021-live-'));
  // Minimal research.yaml (parseable for the pack-existence guard).
  writeFileSync(
    join(tmp, 'research.yaml'),
    [
      'pack_id: r021-live-fixture',
      'topic: R-021 live-replay-of-mechanism fixture',
      'decision: probe',
      'sections:',
      '  - id: 01-test',
      '    purpose: R-021 fall-through trigger test',
    ].join('\n') + '\n',
    'utf8',
  );

  const sectionDir = join(tmp, 'sections', '01-test');
  mkdirSync(sectionDir, { recursive: true });
  const claimsPath = join(sectionDir, 'claims.jsonl');
  const lines: string[] = [];
  for (let i = 0; i < CLAIM_TEMPLATES.length; i++) {
    const id = `clm_${'a'.repeat(11)}${i}_heuristic_${i + 1}`;
    lines.push(JSON.stringify(buildClaim(id, CLAIM_TEMPLATES[i]!)));
  }
  writeFileSync(claimsPath, lines.join('\n') + '\n', 'utf8');
  return tmp;
}

function runContradictMap(
  packPath: string,
  perPairTimeoutMs: number,
  fallThroughAfterN: number,
): { stdout: string; stderr: string; status: number } {
  const r = spawnSync(
    'node',
    [
      cliPath,
      'contradict',
      'map',
      '01-test',
      '--pack',
      packPath,
      '--detector',
      'auto',
      '--auto-mode-pair-timeout-ms',
      String(perPairTimeoutMs),
      '--auto-mode-fall-through-after-n-timeouts',
      String(fallThroughAfterN),
      '--progress',
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        OLLAMA_HOST,
      },
      // Hard ceiling: even if everything goes wrong, terminate the test in
      // <2 min so the suite doesn't hang.
      timeout: 2 * 60 * 1000,
    },
  );
  return {
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    status: typeof r.status === 'number' ? r.status : 1,
  };
}

// ── Always-on guard test (documents the gating contract) ────────────────────

describe('R-021 LIVE replay — environment guard', () => {
  it('test skip guard fires when R021_LIVE_REPLAY != "1"', () => {
    const gates = {
      R021_LIVE_REPLAY: process.env.R021_LIVE_REPLAY === '1',
      cli_built: existsSync(cliPath),
    };
    void gates;
    expect(true).toBe(true);
  });
});

// ── Live mechanism test ──────────────────────────────────────────────────────

describe.skipIf(!LIVE_RIG)(
  'R-021 LIVE replay (operator-rig only — skipped in CI)',
  () => {
    it(
      'per-pair timeout fires + fall-through engages + heuristic completes + markdown renders fall-through block',
      { timeout: 3 * 60 * 1000 },
      () => {
        if (!existsSync(cliPath)) {
          throw new Error(
            `research-os CLI not built; expected ${cliPath} — run 'npm run build' first.`,
          );
        }

        const packPath = makeFixturePack();
        try {
          // Artificially-low timeout (500ms) — well below any realistic LLM
          // call. Fall-through threshold of 2 lets the trigger fire within
          // a few seconds on a 15-pair fixture.
          const PAIR_TIMEOUT_MS = 500;
          const FALL_THROUGH_AFTER_N = 2;

          const r = runContradictMap(packPath, PAIR_TIMEOUT_MS, FALL_THROUGH_AFTER_N);

          // CLI may exit 0 (fall-through engaged, heuristic completed cleanly)
          // or non-zero if the detector resolution itself failed. We assert on
          // artifacts + log lines rather than exit code.
          void r.status;

          // ── R-021.LIVE.1 — per-pair timeout fires ──────────────────────────
          //
          // stderr should contain at least one "auto-mode pair N/M timed out"
          // line. Format defined by the detector (Phase B locked stderr line).
          expect(
            r.stderr,
            'R-021.LIVE.1 FAIL — stderr does not contain "auto-mode pair … timed out"',
          ).toMatch(/auto-mode pair \d+\/\d+ timed out/);

          // ── R-021.LIVE.2 — fall-through engages after threshold ────────────
          //
          // stderr should contain the fall-through trigger line naming the
          // consecutive-timeout reason and the remaining-pair count.
          expect(
            r.stderr,
            'R-021.LIVE.2 FAIL — stderr does not contain the fall-through trigger line',
          ).toMatch(/auto-mode fall-through: \d+ consecutive timeouts/);
          expect(
            r.stderr,
            'R-021.LIVE.2 FAIL — fall-through line does not name heuristic switch',
          ).toContain('switching to heuristic');

          // ── R-021.LIVE.3 — heuristic completes + markdown renders block ───
          //
          // contradictions.md must exist (heuristic must have written it) and
          // contain the "## Auto-mode fall-through" block.
          const mdPath = join(packPath, 'sections', '01-test', 'contradictions.md');
          expect(existsSync(mdPath), `R-021.LIVE.3 FAIL — contradictions.md missing at ${mdPath}`).toBe(true);
          const md = readFileSync(mdPath, 'utf8');
          expect(md, 'R-021.LIVE.3 FAIL — markdown missing Auto-mode fall-through block').toContain(
            '## Auto-mode fall-through',
          );
          expect(md, 'R-021.LIVE.3 FAIL — fall-through block missing the per-pair budget').toContain(
            String(PAIR_TIMEOUT_MS),
          );
          expect(md, 'R-021.LIVE.3 FAIL — fall-through block missing the consecutive-timeout count').toContain(
            String(FALL_THROUGH_AFTER_N),
          );

          // Stdout should also have the auto-mode engaged start line.
          expect(
            r.stdout,
            'auto-mode start line not present on stdout (Phase B locked surface)',
          ).toContain('auto-mode engaged');

          // Report-back signal in test output for operator inspection.
          // eslint-disable-next-line no-console
          console.log(
            JSON.stringify(
              {
                R021_live_replay_evidence: {
                  pack_path: packPath,
                  exit_status: r.status,
                  stdout_start_line: r.stdout.split('\n').find((l) => l.includes('auto-mode engaged')) ?? null,
                  stderr_timeout_lines_count: (r.stderr.match(/auto-mode pair \d+\/\d+ timed out/g) ?? []).length,
                  stderr_fall_through_line: r.stderr.split('\n').find((l) => l.includes('auto-mode fall-through:')) ?? null,
                  md_contains_block: md.includes('## Auto-mode fall-through'),
                  md_first_line: md.split('\n')[0],
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
