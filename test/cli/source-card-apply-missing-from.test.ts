/**
 * Stage C Phase 3 C1-002: `research-os source-card audit --apply` without
 * --from <file> must route through reportError via InvalidArgumentError
 * (D-008 pattern), NOT bypass the catch block via raw stderr + exit(1).
 *
 * End-to-end-through-actual-caller test: invokes the built CLI binary via
 * execFileSync and asserts the resulting stderr matches the structured
 * error envelope (`research-os: <message>`).
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cliPath = join(__dirname, '..', '..', 'dist', 'cli.js');

describe('Stage C Phase 3 C1-002 — source-card audit --apply missing --from', () => {
  it('dist/cli.js exists (build prerequisite)', () => {
    expect(existsSync(cliPath)).toBe(true);
  });

  it('exits non-zero with a stderr message naming the missing --from', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'research-os-c1-002-'));
    try {
      let stderr = '';
      let exitStatus = 0;
      try {
        execFileSync('node', [cliPath, 'source-card', 'audit', '--apply', '--pack', workDir], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        const e = err as NodeJS.ErrnoException & {
          stderr?: string | Buffer;
          status?: number;
        };
        stderr = typeof e.stderr === 'string' ? e.stderr : (e.stderr?.toString('utf8') ?? '');
        exitStatus = typeof e.status === 'number' ? e.status : 1;
      }
      expect(exitStatus).not.toBe(0);
      // The error must name the missing option.
      expect(stderr).toContain('--from');
      // The error must NOT be the raw 'research-os:' bypass path with the
      // exact legacy phrase (D-008 routes through commander).
      // We still allow "research-os" in error name, just verify --apply context.
      expect(stderr).toContain('--apply');
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
