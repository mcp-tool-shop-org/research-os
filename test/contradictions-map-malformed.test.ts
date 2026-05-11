import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { map } from '../src/contradictions/index.js';
import { HeuristicContradictionDetector } from '../src/contradictions/detectors/heuristic.js';

let workDir: string;
let packPath: string;

function makeValidClaim(id: string, asserts: string, scope: string | null): object {
  const sourceHash = createHash('sha256').update(id).digest('hex');
  return {
    claim_id: id,
    section_id: '01-landscape',
    source_ids: [id.replace(/^clm_/, 'src_').replace(/_(heuristic|ollama_intern)_\d+$/, '')],
    source_hashes: [sourceHash],
    asserts,
    scope,
    not: null,
    evidence_excerpt_ids: [],
    evidence_excerpt: asserts,
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
  };
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-contradict-malformed-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

// B-003 regression: readCandidateClaims used to bubble JSON.parse / schema
// errors out of the loop, crashing the entire map() call on any single bad
// line. The fix wraps each line in try/catch matching the sibling pattern in
// triage/run.ts and density/run.ts.
describe('contradict map — malformed-line skip (B-003)', () => {
  it('processes valid lines, silently skips invalid JSON and schema-incompatible lines', async () => {
    const result = await init({
      topic: 'Malformed line skip test',
      outDir: workDir,
    });
    packPath = result.packPath;
    await sectionAdd({
      id: '01-landscape',
      purpose: 'Probe malformed-line handling',
      packPath,
    });

    const claimsPath = join(packPath, 'sections', '01-landscape', 'claims.jsonl');

    // Three lines: one valid, one not-JSON, one valid-JSON-but-schema-bad.
    const validA = makeValidClaim(
      'clm_aaaaaaaaaaaa_heuristic_1',
      'WAL provides high concurrency for SQLite readers and writers',
      'SQLite WAL mode',
    );
    const validB = makeValidClaim(
      'clm_bbbbbbbbbbbb_heuristic_1',
      'WAL does not provide high concurrency for SQLite readers and writers',
      'SQLite WAL mode',
    );

    await appendFile(claimsPath, JSON.stringify(validA) + '\n', 'utf8');
    // Not parseable as JSON.
    await appendFile(claimsPath, 'this is not json at all\n', 'utf8');
    // Parseable but not a Claim.
    await appendFile(claimsPath, JSON.stringify({ not_a_claim: true }) + '\n', 'utf8');
    await appendFile(claimsPath, JSON.stringify(validB) + '\n', 'utf8');

    const summary = await map({
      sectionId: '01-landscape',
      packPath,
      detectors: [new HeuristicContradictionDetector()],
    });

    // Two valid candidate claims survived; the other two lines were skipped.
    expect(summary.candidateClaims).toBe(2);
    // The two valid claims directly contradict each other, so one
    // contradiction should be detected — proves valid lines still process.
    expect(summary.contradictionsAdded).toBe(1);
  });

  it('returns empty when every line is malformed (no crash)', async () => {
    const result = await init({
      topic: 'All-malformed line test',
      outDir: workDir,
    });
    packPath = result.packPath;
    await sectionAdd({
      id: '01-landscape',
      purpose: 'Probe all-malformed handling',
      packPath,
    });

    const claimsPath = join(packPath, 'sections', '01-landscape', 'claims.jsonl');
    await writeFile(
      claimsPath,
      'totally not json\n' + JSON.stringify({ wrong_shape: 1 }) + '\n',
      'utf8',
    );

    const summary = await map({
      sectionId: '01-landscape',
      packPath,
      detectors: [new HeuristicContradictionDetector()],
    });
    expect(summary.candidateClaims).toBe(0);
    expect(summary.contradictionsAdded).toBe(0);
  });
});
