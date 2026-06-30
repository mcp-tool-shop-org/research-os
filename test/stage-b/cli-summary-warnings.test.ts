// Stage B regression — B-IDX-001 (index build warnings block) +
// B-SOURCES-002 (gather summary invalid-url line).
//
// B-IDX-001 invariant: the `index build` success path prints record counts but
// previously NEVER iterated result.warnings (malformed_jsonl /
// malformed_source_card / section_index_failed) — every OTHER warning-bearing
// command prints a "\nwarnings:\n  - ..." block. The build path now prints the
// same block (rendering the structured IndexBuildWarning into one line each).
//   GAP half  — when indexBuild returns warnings, they appear in stdout under a
//               `warnings:` header.
//   HAPPY half — when there are no warnings, NO `warnings:` header is printed
//               and the counts block is byte-identical to before.
//
// B-SOURCES-002 invariant: the `gather` summary prints rejected-invalid URLs
// from GatherSummary.invalidUrls, mirroring the discover summary's invalid-url
// line.
//   GAP half  — non-empty invalidUrls produce a `urls rejected (invalid): N`
//               line plus the offending URLs.
//   HAPPY half — an empty invalidUrls array prints NO such line.
//
// Both fixes are display-only; they drive the real commander `program` with the
// underlying domain functions mocked, asserting exactly what reaches stdout.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const indexBuildMock = vi.fn();
const gatherMock = vi.fn();

// Mock only the two domain modules whose results these display blocks render.
// Everything else in cli.ts loads normally (the module guards its auto-run, so
// importing it under vitest does not call parseAsync).
vi.mock('../../src/indexer/index.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, build: (...a: unknown[]) => indexBuildMock(...a) };
});
vi.mock('../../src/sources/index.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, gather: (...a: unknown[]) => gatherMock(...a) };
});

let out: string[];
let stdoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  out = [];
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    out.push(String(chunk));
    return true;
  }) as never);
  // Quiet any stderr progress noise.
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  process.exitCode = undefined;
});

function fullOutput(): string {
  return out.join('');
}

const BASE_INDEX_RESULT = {
  packPath: '/pack',
  dbPath: '/pack/.research-os/index.db',
  sectionsIndexed: 2,
  sources: 5,
  claims: 10,
  contradictions: 0,
  reviewFindings: 0,
  claimReviews: 0,
  gateResults: 0,
  fetchReceipts: 5,
  artifacts: 3,
  warnings: [] as Array<Record<string, unknown>>,
};

describe('index build warnings block (B-IDX-001)', () => {
  it('prints a warnings block when indexBuild returns warnings (GAP half)', async () => {
    indexBuildMock.mockResolvedValue({
      ...BASE_INDEX_RESULT,
      warnings: [
        {
          kind: 'malformed_jsonl',
          path: 'sections/01/claims.jsonl',
          line: 4,
          reason: 'Unexpected end of JSON input',
        },
        {
          kind: 'section_index_failed',
          section_id: '02-foo',
          reason: 'SQLITE_CONSTRAINT: UNIQUE',
        },
      ],
    });

    const { program } = await import('../../src/cli.js');
    await program.parseAsync(['node', 'research-os', 'index', 'build', '--pack', '/pack']);

    const text = fullOutput();
    expect(text).toContain('index build complete');
    expect(text).toContain('warnings:');
    expect(text).toContain('[malformed_jsonl]');
    expect(text).toContain('sections/01/claims.jsonl');
    expect(text).toContain('line 4');
    expect(text).toContain('Unexpected end of JSON input');
    expect(text).toContain('[section_index_failed]');
    expect(text).toContain('section 02-foo');
    expect(text).toContain('SQLITE_CONSTRAINT: UNIQUE');
  });

  it('prints NO warnings block on the clean happy path (HAPPY half)', async () => {
    indexBuildMock.mockResolvedValue({ ...BASE_INDEX_RESULT, warnings: [] });

    const { program } = await import('../../src/cli.js');
    await program.parseAsync(['node', 'research-os', 'index', 'build', '--pack', '/pack']);

    const text = fullOutput();
    expect(text).toContain('index build complete');
    expect(text).toContain('claims:            10');
    // Byte-identical happy path — no warnings header at all.
    expect(text).not.toContain('warnings:');
  });
});

const BASE_GATHER_RESULT = {
  sectionId: '01-landscape',
  attempted: 2,
  fetchedOk: 2,
  fetchedFailed: 0,
  extractedOk: 2,
  extractedFailed: 0,
  cardsWritten: 2,
  receiptsAppended: 2,
  sourceIds: ['s1', 's2'],
  invalidUrls: [] as string[],
};

describe('gather summary invalid-url line (B-SOURCES-002)', () => {
  it('prints rejected-invalid URLs when invalidUrls is non-empty (GAP half)', async () => {
    gatherMock.mockResolvedValue({
      ...BASE_GATHER_RESULT,
      invalidUrls: ['ftp://nope.example', '   '],
    });

    const { program } = await import('../../src/cli.js');
    await program.parseAsync([
      'node',
      'research-os',
      'gather',
      '01-landscape',
      '--pack',
      '/pack',
      '--url',
      'https://ok.example',
    ]);

    const text = fullOutput();
    expect(text).toContain('gather complete');
    expect(text).toContain('urls rejected (invalid): 2');
    expect(text).toContain('ftp://nope.example');
  });

  it('prints NO invalid-url line when invalidUrls is empty (HAPPY half)', async () => {
    gatherMock.mockResolvedValue({ ...BASE_GATHER_RESULT, invalidUrls: [] });

    const { program } = await import('../../src/cli.js');
    await program.parseAsync([
      'node',
      'research-os',
      'gather',
      '01-landscape',
      '--pack',
      '/pack',
      '--url',
      'https://ok.example',
    ]);

    const text = fullOutput();
    expect(text).toContain('gather complete');
    expect(text).toContain('receipts appended: 2');
    expect(text).not.toContain('urls rejected (invalid)');
  });
});
