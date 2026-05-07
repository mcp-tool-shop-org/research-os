import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { map } from '../src/contradictions/index.js';
import { HeuristicContradictionDetector } from '../src/contradictions/detectors/heuristic.js';
import {
  PackNotFoundError,
  SectionNotFoundError,
} from '../src/errors.js';
import { ContradictionSchema } from '../src/contradictions/schema.js';

let workDir: string;
let packPath: string;

async function makePackWithClaims(claims: object[]) {
  const result = await init({
    topic: 'How does contradiction mapping handle real claim sets?',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({
    id: '01-landscape',
    purpose: 'Probe contradiction mapping',
    packPath,
  });
  const claimsPath = join(packPath, 'sections', '01-landscape', 'claims.jsonl');
  for (const c of claims) {
    await appendFile(claimsPath, JSON.stringify(c) + '\n', 'utf8');
  }
}

function claim(id: string, asserts: string, scope: string | null = null, reviewState = 'candidate') {
  const sourceHash = createHash('sha256').update(id).digest('hex');
  return {
    claim_id: id,
    section_id: '01-landscape',
    source_ids: [id.replace(/^clm_/, 'src_').replace(/_(heuristic|ollama_intern)_\d+$/, '')],
    source_hashes: [sourceHash],
    asserts,
    scope,
    not: null,
    evidence_excerpt: asserts,
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: reviewState,
  };
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-contradict-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('contradict map', () => {
  it('finds direct_conflict between contradictory claims with overlapping scope', async () => {
    await makePackWithClaims([
      claim(
        'clm_aaaaaaaaaaaa_heuristic_1',
        'WAL provides high concurrency for SQLite readers and writers',
        'SQLite WAL mode',
      ),
      claim(
        'clm_bbbbbbbbbbbb_heuristic_1',
        'WAL does not provide high concurrency for SQLite readers and writers',
        'SQLite WAL mode',
      ),
    ]);
    const summary = await map({
      sectionId: '01-landscape',
      packPath,
      detectors: [new HeuristicContradictionDetector()],
    });
    expect(summary.contradictionsAdded).toBe(1);
    expect(summary.candidateClaims).toBe(2);
    expect(summary.pairsCompared).toBe(1);
    const ledger = await readFile(
      join(packPath, 'sections', '01-landscape', 'contradictions.jsonl'),
      'utf8',
    );
    const lines = ledger.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const cnt = ContradictionSchema.parse(JSON.parse(lines[0]!));
    expect(cnt.type).toBe('direct_conflict');
    expect(cnt.status).toBe('unresolved');
  });

  it('does not flag direct_conflict when scopes do not overlap', async () => {
    await makePackWithClaims([
      claim(
        'clm_aaaaaaaaaaaa_heuristic_1',
        'tests must ship with code changes',
        'star-freight production code',
      ),
      claim(
        'clm_bbbbbbbbbbbb_heuristic_1',
        'tests do not ship with code changes',
        'archived motif spike branches',
      ),
    ]);
    const summary = await map({
      sectionId: '01-landscape',
      packPath,
      detectors: [new HeuristicContradictionDetector()],
    });
    const ledger = (await readFile(
      join(packPath, 'sections', '01-landscape', 'contradictions.jsonl'),
      'utf8',
    ).catch(() => ''))
      .trim()
      .split('\n')
      .filter(Boolean);
    for (const line of ledger) {
      const cnt = ContradictionSchema.parse(JSON.parse(line));
      expect(cnt.type).not.toBe('direct_conflict');
    }
    expect(summary.contradictionsAdded).toBeLessThanOrEqual(0);
  });

  it('detects overgeneralization_risk when one claim is universal and the other is scoped', async () => {
    await makePackWithClaims([
      claim(
        'clm_aaaaaaaaaaaa_heuristic_1',
        'patch publish before next repo for any code change',
        null,
      ),
      claim(
        'clm_bbbbbbbbbbbb_heuristic_1',
        'patch publish before next repo during role-os rollout lockdown',
        'role-os rollout lockdown',
      ),
    ]);
    const summary = await map({
      sectionId: '01-landscape',
      packPath,
      detectors: [new HeuristicContradictionDetector()],
    });
    expect(summary.contradictionsAdded).toBe(1);
    const ledger = (
      await readFile(join(packPath, 'sections', '01-landscape', 'contradictions.jsonl'), 'utf8')
    )
      .trim()
      .split('\n')
      .filter(Boolean);
    const cnt = ContradictionSchema.parse(JSON.parse(ledger[0]!));
    expect(cnt.type).toBe('overgeneralization_risk');
  });

  it('writes an honest empty markdown view when no contradictions found', async () => {
    await makePackWithClaims([
      claim('clm_aaaaaaaaaaaa_heuristic_1', 'FTS5 supports prefix queries', 'SQLite FTS5'),
      claim('clm_bbbbbbbbbbbb_heuristic_1', 'WAL improves concurrency', 'SQLite WAL mode'),
    ]);
    await map({
      sectionId: '01-landscape',
      packPath,
      detectors: [new HeuristicContradictionDetector()],
    });
    const md = await readFile(
      join(packPath, 'sections', '01-landscape', 'contradictions.md'),
      'utf8',
    );
    expect(md).toContain('No contradiction candidates detected');
    expect(md).toContain('clean section is a valid result');
  });

  it('produces a markdown view with ledger entries when contradictions exist', async () => {
    await makePackWithClaims([
      claim(
        'clm_aaaaaaaaaaaa_heuristic_1',
        'WAL provides high concurrency for SQLite readers and writers',
        'SQLite WAL mode',
      ),
      claim(
        'clm_bbbbbbbbbbbb_heuristic_1',
        'WAL does not provide high concurrency for SQLite readers and writers',
        'SQLite WAL mode',
      ),
    ]);
    await map({
      sectionId: '01-landscape',
      packPath,
      detectors: [new HeuristicContradictionDetector()],
    });
    const md = await readFile(
      join(packPath, 'sections', '01-landscape', 'contradictions.md'),
      'utf8',
    );
    expect(md).toContain('direct_conflict');
    expect(md).toContain('clm_aaaaaaaaaaaa_heuristic_1');
    expect(md).toContain('Status: all unresolved');
  });

  it('is idempotent — re-running with same detector dedupes by contradiction_id', async () => {
    await makePackWithClaims([
      claim(
        'clm_aaaaaaaaaaaa_heuristic_1',
        'WAL provides high concurrency for SQLite readers and writers',
        'SQLite WAL mode',
      ),
      claim(
        'clm_bbbbbbbbbbbb_heuristic_1',
        'WAL does not provide high concurrency for SQLite readers and writers',
        'SQLite WAL mode',
      ),
    ]);
    const first = await map({
      sectionId: '01-landscape',
      packPath,
      detectors: [new HeuristicContradictionDetector()],
    });
    expect(first.contradictionsAdded).toBe(1);
    const second = await map({
      sectionId: '01-landscape',
      packPath,
      detectors: [new HeuristicContradictionDetector()],
    });
    expect(second.contradictionsAdded).toBe(0);
    expect(second.contradictionsDeduped).toBe(1);
  });

  it('does not mutate or delete original claims', async () => {
    await makePackWithClaims([
      claim(
        'clm_aaaaaaaaaaaa_heuristic_1',
        'WAL provides high concurrency for SQLite readers and writers',
        'SQLite WAL mode',
      ),
      claim(
        'clm_bbbbbbbbbbbb_heuristic_1',
        'WAL does not provide high concurrency for SQLite readers and writers',
        'SQLite WAL mode',
      ),
    ]);
    const claimsPath = join(packPath, 'sections', '01-landscape', 'claims.jsonl');
    const before = await readFile(claimsPath, 'utf8');
    await map({
      sectionId: '01-landscape',
      packPath,
      detectors: [new HeuristicContradictionDetector()],
    });
    const after = await readFile(claimsPath, 'utf8');
    expect(after).toBe(before);
  });

  it('skips non-candidate claims', async () => {
    await makePackWithClaims([
      claim(
        'clm_aaaaaaaaaaaa_heuristic_1',
        'WAL provides high concurrency for SQLite readers and writers',
        'SQLite WAL mode',
        'rejected',
      ),
      claim(
        'clm_bbbbbbbbbbbb_heuristic_1',
        'WAL does not provide high concurrency for SQLite readers and writers',
        'SQLite WAL mode',
      ),
    ]);
    const summary = await map({
      sectionId: '01-landscape',
      packPath,
      detectors: [new HeuristicContradictionDetector()],
    });
    expect(summary.candidateClaims).toBe(1);
    expect(summary.contradictionsAdded).toBe(0);
  });

  it('handles empty claims file with honest summary and empty md', async () => {
    await makePackWithClaims([]);
    const summary = await map({
      sectionId: '01-landscape',
      packPath,
      detectors: [new HeuristicContradictionDetector()],
    });
    expect(summary.candidateClaims).toBe(0);
    expect(summary.contradictionsAdded).toBe(0);
    const md = await readFile(
      join(packPath, 'sections', '01-landscape', 'contradictions.md'),
      'utf8',
    );
    expect(md).toContain('Contradictions: 01-landscape');
  });

  it('refuses malformed claims (schema-level)', async () => {
    const result = await init({
      topic: 'Malformed claims test',
      outDir: workDir,
    });
    packPath = result.packPath;
    await sectionAdd({
      id: '01-landscape',
      purpose: 'Probe',
      packPath,
    });
    const claimsPath = join(packPath, 'sections', '01-landscape', 'claims.jsonl');
    await writeFile(claimsPath, JSON.stringify({ not_a_claim: true }) + '\n', 'utf8');
    await expect(
      map({
        sectionId: '01-landscape',
        packPath,
        detectors: [new HeuristicContradictionDetector()],
      }),
    ).rejects.toThrow();
  });

  it('rejects when pack does not exist', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'research-os-cnt-empty-'));
    try {
      await expect(
        map({
          sectionId: '01-landscape',
          packPath: empty,
          detectors: [new HeuristicContradictionDetector()],
        }),
      ).rejects.toBeInstanceOf(PackNotFoundError);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('rejects when section does not exist', async () => {
    await makePackWithClaims([]);
    await expect(
      map({
        sectionId: '99-not-real',
        packPath,
        detectors: [new HeuristicContradictionDetector()],
      }),
    ).rejects.toBeInstanceOf(SectionNotFoundError);
  });

  it('falls back from ollama-intern to heuristic when ollama is unavailable', async () => {
    await makePackWithClaims([
      claim(
        'clm_aaaaaaaaaaaa_heuristic_1',
        'WAL provides high concurrency for SQLite readers and writers',
        'SQLite WAL mode',
      ),
      claim(
        'clm_bbbbbbbbbbbb_heuristic_1',
        'WAL does not provide high concurrency for SQLite readers and writers',
        'SQLite WAL mode',
      ),
    ]);
    const ollamaUnavail = {
      name: 'ollama-intern' as const,
      async available() {
        return false;
      },
      async detect() {
        throw new Error('should not be called when unavailable');
      },
    };
    const summary = await map({
      sectionId: '01-landscape',
      packPath,
      detectors: [ollamaUnavail, new HeuristicContradictionDetector()],
    });
    expect(summary.detector).toBe('heuristic');
    expect(summary.contradictionsAdded).toBe(1);
  });
});
