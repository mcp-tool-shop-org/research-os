import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { applyProgressFlags } from '../../src/cli.js';
import { InvalidArgumentError } from 'commander';

// C2-RE-001 regression test. Phase 4 caught that Wave 4 (commit dd22582) landed
// the --no-progress / --progress env-var plumbing in src/util/progress.ts but
// did NOT register the corresponding Commander options on review, gather,
// contradict map, or pack publish. This test asserts the registration is in
// place on all four commands and that the action-entry helper translates the
// flags to the env vars that shouldEmitProgress() inspects.
//
// The reproduction-flip assertion: before this fix, each of the four
// "<command> --no-progress" invocations failed with "error: unknown option
// '--no-progress'". After this fix, each fails for non-flag-related reasons
// (missing required positional or required option). The flag itself is no
// longer rejected. The same goes for --progress.
//
// Test isolation: env vars are mutated by applyProgressFlags. Save and restore
// the originals so other suites are not contaminated.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const cliEntry = path.join(repoRoot, 'dist', 'cli.js');

function runCli(args: string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync('node', [cliEntry, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, RESEARCH_OS_NO_PROGRESS: '', RESEARCH_OS_FORCE_PROGRESS: '' },
    });
    return { stdout, stderr: '', status: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: string | Buffer; stderr?: string | Buffer; status?: number };
    return {
      stdout: typeof err.stdout === 'string' ? err.stdout : err.stdout?.toString('utf8') ?? '',
      stderr: typeof err.stderr === 'string' ? err.stderr : err.stderr?.toString('utf8') ?? '',
      status: typeof err.status === 'number' ? err.status : 1,
    };
  }
}

const originalNoProgress = process.env.RESEARCH_OS_NO_PROGRESS;
const originalForceProgress = process.env.RESEARCH_OS_FORCE_PROGRESS;

beforeEach(() => {
  delete process.env.RESEARCH_OS_NO_PROGRESS;
  delete process.env.RESEARCH_OS_FORCE_PROGRESS;
});

afterEach(() => {
  if (originalNoProgress !== undefined) process.env.RESEARCH_OS_NO_PROGRESS = originalNoProgress;
  else delete process.env.RESEARCH_OS_NO_PROGRESS;
  if (originalForceProgress !== undefined) process.env.RESEARCH_OS_FORCE_PROGRESS = originalForceProgress;
  else delete process.env.RESEARCH_OS_FORCE_PROGRESS;
});

describe('applyProgressFlags — env-var translation', () => {
  it('--no-progress sets RESEARCH_OS_NO_PROGRESS=1', () => {
    applyProgressFlags(['node', 'cli.js', 'gather', '--no-progress', 'sec']);
    expect(process.env.RESEARCH_OS_NO_PROGRESS).toBe('1');
    expect(process.env.RESEARCH_OS_FORCE_PROGRESS).toBeUndefined();
  });

  it('--progress sets RESEARCH_OS_FORCE_PROGRESS=1', () => {
    applyProgressFlags(['node', 'cli.js', 'gather', '--progress', 'sec']);
    expect(process.env.RESEARCH_OS_FORCE_PROGRESS).toBe('1');
    expect(process.env.RESEARCH_OS_NO_PROGRESS).toBeUndefined();
  });

  it('no flags → no env-var mutation', () => {
    applyProgressFlags(['node', 'cli.js', 'gather', 'sec']);
    expect(process.env.RESEARCH_OS_NO_PROGRESS).toBeUndefined();
    expect(process.env.RESEARCH_OS_FORCE_PROGRESS).toBeUndefined();
  });

  it('--no-progress AND --progress → throws InvalidArgumentError (mutually exclusive)', () => {
    expect(() =>
      applyProgressFlags(['node', 'cli.js', 'gather', '--no-progress', '--progress', 'sec']),
    ).toThrow(InvalidArgumentError);
    expect(() =>
      applyProgressFlags(['node', 'cli.js', 'gather', '--no-progress', '--progress', 'sec']),
    ).toThrow(/mutually exclusive/);
    // Neither env var should be set when the mutex check fails.
    expect(process.env.RESEARCH_OS_NO_PROGRESS).toBeUndefined();
    expect(process.env.RESEARCH_OS_FORCE_PROGRESS).toBeUndefined();
  });
});

describe('Commander registration — four commands accept --no-progress / --progress', () => {
  // The reproduction-flip assertion: BEFORE the fix, each of these invocations
  // emitted "error: unknown option '--no-progress'" (or --progress). AFTER the
  // fix, they emit a non-flag-related error (missing required arg/option) or
  // succeed. The assertion is: stderr must NOT contain "unknown option".

  const cases: Array<{ name: string; args: string[] }> = [
    { name: 'gather --no-progress', args: ['gather', '--no-progress'] },
    { name: 'gather --progress', args: ['gather', '--progress'] },
    { name: 'review --no-progress', args: ['review', '--no-progress'] },
    { name: 'review --progress', args: ['review', '--progress'] },
    { name: 'contradict map --no-progress', args: ['contradict', 'map', '--no-progress'] },
    { name: 'contradict map --progress', args: ['contradict', 'map', '--progress'] },
    { name: 'pack publish --no-progress', args: ['pack', 'publish', '--no-progress'] },
    { name: 'pack publish --progress', args: ['pack', 'publish', '--progress'] },
  ];

  for (const { name, args } of cases) {
    it(`${name} → no "unknown option" error`, () => {
      const result = runCli(args);
      expect(result.stderr).not.toMatch(/unknown option/i);
    });
  }

  it('passing both --no-progress and --progress → mutually-exclusive usage error', () => {
    const result = runCli(['gather', '--no-progress', '--progress', 'dummy-section']);
    expect(result.stderr).toMatch(/--no-progress and --progress are mutually exclusive/);
    expect(result.status).not.toBe(0);
  });
});
