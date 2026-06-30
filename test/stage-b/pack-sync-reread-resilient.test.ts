import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// B-IDX-003 — syncRepoKnowledge re-reads the just-written export JSONL with
// JSON.parse per line. It was the one indexer read path with NO per-line
// try/catch: a single corrupt line threw a raw SyntaxError out of sync. We
// mock the export writer (to plant a malformed middle line) and the optional
// @mcptoolshop/repo-knowledge peer dep (to capture the facts handed to ingest)
// so we can assert per-line skip-with-warning parity with build.ts/run.ts.

let exportOutPath = '';
const ingestSpy = vi.fn(async (args: { facts: unknown[]; namespace?: string }) => ({
  count: args.facts.length,
}));

vi.mock('../../src/indexer/export.js', () => ({
  exportRepoKnowledge: vi.fn(async () => ({
    outPath: exportOutPath,
    factCount: 0,
    byType: {},
  })),
}));

vi.mock('@mcptoolshop/repo-knowledge', () => ({
  ingestFacts: (args: { facts: unknown[]; namespace?: string }) => ingestSpy(args),
}));

import { syncRepoKnowledge } from '../../src/indexer/sync.js';

let workDir: string;

beforeEach(async () => {
  ingestSpy.mockClear();
  workDir = await mkdtemp(join(tmpdir(), 'research-os-pack-sync-'));
  await mkdir(join(workDir, 'evidence', 'repo-knowledge'), { recursive: true });
  exportOutPath = join(workDir, 'evidence', 'repo-knowledge', 'research-os-facts.jsonl');
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('B-IDX-003 — syncRepoKnowledge per-line resilient re-read', () => {
  // RED-half target: a corrupt line in the just-written export JSONL used to
  // throw a raw SyntaxError out of sync. It must now skip the bad line, ingest
  // the healthy ones, and note the skip in the summary reason.
  it('skips a malformed export line, ingests the rest, and notes it in the reason', async () => {
    await writeFile(
      exportOutPath,
      [
        JSON.stringify({ id: 'fact-1', text: 'one' }),
        '{ this is not valid json',
        JSON.stringify({ id: 'fact-3', text: 'three' }),
      ].join('\n') + '\n',
      'utf8',
    );

    // Must NOT throw.
    const summary = await syncRepoKnowledge({ packPath: workDir });

    expect(summary.attempted).toBe(true);
    expect(summary.ok).toBe(true);
    // Two healthy lines ingested; the malformed middle line dropped.
    expect(ingestSpy).toHaveBeenCalledTimes(1);
    const handed = ingestSpy.mock.calls[0][0].facts;
    expect(handed).toHaveLength(2);
    expect(summary.factsSynced).toBe(2);
    // The skip is surfaced (line 2 was the malformed one).
    expect(summary.reason).toMatch(/skipped 1 malformed export line/i);
    expect(summary.reason).toMatch(/\b2\b/);
  });

  // HAPPY-half: a fully valid export JSONL ingests every line with no skip
  // suffix — default behavior is byte-identical.
  it('ingests every line and adds no skip suffix when the export is clean', async () => {
    await writeFile(
      exportOutPath,
      [
        JSON.stringify({ id: 'fact-1', text: 'one' }),
        JSON.stringify({ id: 'fact-2', text: 'two' }),
      ].join('\n') + '\n',
      'utf8',
    );

    const summary = await syncRepoKnowledge({ packPath: workDir });

    expect(summary.ok).toBe(true);
    expect(summary.factsSynced).toBe(2);
    expect(ingestSpy.mock.calls[0][0].facts).toHaveLength(2);
    expect(summary.reason).not.toMatch(/malformed/i);
  });
});
