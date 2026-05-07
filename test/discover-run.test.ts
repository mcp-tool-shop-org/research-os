import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import {
  approve,
  discover,
  exportUrls,
  reject,
  type DiscoverProvider,
  type DiscoverProviderInput,
  type DiscoverProviderResult,
} from '../src/discover/index.js';
import { DiscoveryCandidateSchema } from '../src/discover/schema.js';
import { PackNotFoundError, SectionNotFoundError } from '../src/errors.js';

let workDir: string;
let packPath: string;

class FakeProvider implements DiscoverProvider {
  readonly name = 'fake';
  constructor(private readonly result: DiscoverProviderResult) {}
  async available(): Promise<boolean> {
    return true;
  }
  async propose(_input: DiscoverProviderInput): Promise<DiscoverProviderResult> {
    return this.result;
  }
}

async function setupPack() {
  const r = await init({ topic: 'Discover layer fixture pack', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: '04-test', purpose: 'discovery layer', packPath });
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-discover-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('discover', () => {
  it('rejects when pack does not exist', async () => {
    await expect(
      discover({
        sectionId: '04-test',
        packPath: join(workDir, 'nope'),
        query: 'gates and waivers',
      }),
    ).rejects.toBeInstanceOf(PackNotFoundError);
  });

  it('rejects when section does not exist', async () => {
    await setupPack();
    await expect(
      discover({ sectionId: '99-no', packPath, query: 'something' }),
    ).rejects.toBeInstanceOf(SectionNotFoundError);
  });

  it('rejects too-short query', async () => {
    await setupPack();
    await expect(
      discover({
        sectionId: '04-test',
        packPath,
        query: 'a',
        providers: [new FakeProvider({ ok: true, proposals: [], method: 'm' })],
      }),
    ).rejects.toThrow(/at least 4/);
  });

  it('appends candidates to the ledger and renders the report', async () => {
    await setupPack();
    const provider = new FakeProvider({
      ok: true,
      method: 'fake',
      proposals: [
        {
          url: 'https://example.com/a',
          title: 'Alpha source',
          publisher: 'Example Org',
          source_type_guess: 'docs',
          why_relevant: 'authoritative documentation of gates',
          rank: 1,
        },
        {
          url: 'https://example.com/b',
          title: 'Beta source',
          publisher: null,
          source_type_guess: 'paper',
          why_relevant: 'foundational paper on validation gates',
          rank: 2,
        },
      ],
    });
    const result = await discover({
      sectionId: '04-test',
      packPath,
      query: 'hard gates soft gates waivers',
      providers: [provider],
    });
    expect(result.candidatesAdded).toBe(2);
    expect(result.candidatesRejectedInvalidUrl).toBe(0);
    const ledger = await readFile(result.candidatesPath, 'utf8');
    const parsed = ledger.trim().split('\n').map((l) => DiscoveryCandidateSchema.parse(JSON.parse(l)));
    expect(parsed).toHaveLength(2);
    expect(parsed.every((c) => c.status === 'candidate')).toBe(true);
    const md = await readFile(result.reportPath, 'utf8');
    expect(md).toContain('Discovery report:');
    expect(md).toContain('Alpha source');
    expect(md).toContain('https://example.com/b');
  });

  it('rejects non-https URLs at intake', async () => {
    await setupPack();
    const provider = new FakeProvider({
      ok: true,
      method: 'fake',
      proposals: [
        {
          url: 'ftp://example.com/foo',
          title: 'bad',
          publisher: null,
          source_type_guess: 'unknown',
          why_relevant: 'should fail',
          rank: 1,
        },
        {
          url: 'https://example.com/good',
          title: 'good',
          publisher: null,
          source_type_guess: 'docs',
          why_relevant: 'real',
          rank: 2,
        },
      ],
    });
    const result = await discover({
      sectionId: '04-test',
      packPath,
      query: 'gates',
      providers: [provider],
    });
    expect(result.candidatesAdded).toBe(1);
    expect(result.candidatesRejectedInvalidUrl).toBe(1);
    expect(result.warnings.some((w) => /Rejected non-https/.test(w))).toBe(true);
  });

  it('does not duplicate a previously-proposed url on a second run', async () => {
    await setupPack();
    const provider = new FakeProvider({
      ok: true,
      method: 'fake',
      proposals: [
        {
          url: 'https://example.com/same',
          title: 'same',
          publisher: null,
          source_type_guess: 'docs',
          why_relevant: 'why',
          rank: 1,
        },
      ],
    });
    const a = await discover({ sectionId: '04-test', packPath, query: 'gates', providers: [provider] });
    expect(a.candidatesAdded).toBe(1);
    const b = await discover({ sectionId: '04-test', packPath, query: 'gates', providers: [provider] });
    expect(b.candidatesAdded).toBe(0);
    expect(b.warnings.some((w) => /Skipped duplicate/.test(w))).toBe(true);
  });
});

describe('approve / reject / exportUrls', () => {
  async function seed(): Promise<string[]> {
    await setupPack();
    const provider = new FakeProvider({
      ok: true,
      method: 'fake',
      proposals: Array.from({ length: 5 }, (_, i) => ({
        url: `https://example.com/${i + 1}`,
        title: `Candidate ${i + 1}`,
        publisher: null,
        source_type_guess: 'docs' as const,
        why_relevant: `why ${i + 1}`,
        rank: i + 1,
      })),
    });
    const r = await discover({
      sectionId: '04-test',
      packPath,
      query: 'gates waivers failure states',
      providers: [provider],
    });
    return r.candidates.map((c) => c.candidate_id);
  }

  it('approves the top N and writes urls.approved.txt in rank order', async () => {
    const ids = await seed();
    const result = await approve({ sectionId: '04-test', packPath, topN: 3 });
    expect(result.approved).toBe(3);
    expect(result.approvedIds).toEqual(ids.slice(0, 3));
    const approved = await readFile(join(packPath, 'sections', '04-test', 'urls.approved.txt'), 'utf8');
    const lines = approved.trim().split('\n');
    expect(lines).toEqual([
      'https://example.com/1',
      'https://example.com/2',
      'https://example.com/3',
    ]);
  });

  it('approves a specific candidate by id', async () => {
    const ids = await seed();
    const targetId = ids[2]!;
    const result = await approve({ sectionId: '04-test', packPath, candidateIds: [targetId] });
    expect(result.approved).toBe(1);
    expect(result.approvedIds).toEqual([targetId]);
    const approved = await readFile(join(packPath, 'sections', '04-test', 'urls.approved.txt'), 'utf8');
    expect(approved.trim()).toBe('https://example.com/3');
  });

  it('reject removes an already-approved candidate from the export', async () => {
    const ids = await seed();
    await approve({ sectionId: '04-test', packPath, topN: 3 });
    const result = await reject({
      sectionId: '04-test',
      packPath,
      candidateIds: [ids[1]!],
      reason: 'not actually relevant',
    });
    expect(result.rejected).toBe(1);
    const approved = await readFile(join(packPath, 'sections', '04-test', 'urls.approved.txt'), 'utf8');
    expect(approved.trim().split('\n').sort()).toEqual([
      'https://example.com/1',
      'https://example.com/3',
    ]);
  });

  it('exportUrls is idempotent and writes an empty file when no approvals exist', async () => {
    await seed();
    const result = await exportUrls({ sectionId: '04-test', packPath });
    expect(result.approvedCount).toBe(0);
    expect(existsSync(result.exportPath)).toBe(true);
    const text = await readFile(result.exportPath, 'utf8');
    expect(text).toBe('');
  });

  it('approve requires --candidate or --top', async () => {
    await seed();
    await expect(approve({ sectionId: '04-test', packPath })).rejects.toThrow(/--candidate.*--top/);
  });

  it('reject requires a reason of meaningful length', async () => {
    const ids = await seed();
    await expect(
      reject({ sectionId: '04-test', packPath, candidateIds: [ids[0]!], reason: 'no' }),
    ).rejects.toThrow(/at least 4/);
  });
});
