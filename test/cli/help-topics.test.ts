/**
 * Stage C Phase 3 Theme 4 (C3-006 Option C part B): `research-os help <topic>`
 * subcommand integration test.
 *
 * - Invokes via execFileSync against the built `dist/cli.js`.
 * - Positive: each of the 4 frozen HELP_TOPICS keys returns its plain-text
 *   value to stdout, exit 0.
 * - Negative: `research-os help nonexistent` exits 2 with the available-topics
 *   list on stderr.
 *
 * NOTE: this is an end-to-end-through-actual-caller test — it spawns the
 * CLI binary, not a library-level helper.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { HELP_TOPICS } from '../../src/cli/help-topics.js';

const cliPath = join(__dirname, '..', '..', 'dist', 'cli.js');

function runCli(args: string[]): {
  stdout: string;
  stderr: string;
  status: number;
} {
  try {
    const stdout = execFileSync('node', [cliPath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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

describe('research-os help <topic>', () => {
  it('dist/cli.js exists (build prerequisite)', () => {
    expect(existsSync(cliPath)).toBe(true);
  });

  for (const topic of Object.keys(HELP_TOPICS)) {
    it(`help ${topic} prints the snippet and exits 0`, () => {
      const { stdout, status } = runCli(['help', topic]);
      const expected = HELP_TOPICS[topic]!;
      // Substring assertion against a load-bearing portion: first 60 chars
      // is sufficient to distinguish topics from each other while tolerating
      // a trailing newline appended by the CLI.
      const loadBearing = expected.slice(0, 60);
      expect(stdout).toContain(loadBearing);
      expect(status).toBe(0);
    });
  }

  it('help nonexistent prints the available-topics list and exits 2', () => {
    const { stderr, status } = runCli(['help', 'nonexistent']);
    expect(status).toBe(2);
    // Every known topic name must appear in the listing.
    for (const topic of Object.keys(HELP_TOPICS)) {
      expect(stderr).toContain(topic);
    }
    // The error line itself must call out the unknown input.
    expect(stderr).toContain('nonexistent');
  });
});
