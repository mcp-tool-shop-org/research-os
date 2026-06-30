// A-CNT-001 regression: after auto-mode fall-through, the heuristic must run
// over the FULL pair space the LLM did not classify (all i<j minus the LLM's
// own drafts) — NOT only detectionResult.unprocessedPairs (the LLM prefilter's
// subset, scored with a different tokenizer/threshold). A pair the LLM
// prefilter dropped (below its 0.25 threshold) but the heuristic flags (>= its
// 0.4 threshold) was previously classified by NEITHER detector. After the fix
// it appears in contradictions.jsonl, matching --detector heuristic coverage.
//
// Invariant (both halves):
//   - COVERAGE (was broken): a pair NOT in unprocessedPairs but flaggable by
//     the heuristic IS present in contradictions.jsonl after fall-through.
//   - NO-OVER-CLASSIFY: a non-contradicting pair (also dropped by the
//     prefilter) does NOT produce a contradiction (the heuristic still gates).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { map } from '../../src/contradictions/map.js';
import type { Claim } from '../../src/claims/schema.js';
import type {
  ContradictionDetector,
  DetectionResult,
} from '../../src/contradictions/types.js';

let workDir: string;
let packPath: string;

function makeClaim(suffix: number, scope: string | null, asserts: string): Claim {
  const hex = suffix.toString().padStart(12, '0');
  return {
    claim_id: `clm_${hex}_heuristic_1`,
    section_id: '01-test',
    source_ids: [`src_${hex}`],
    source_hashes: [],
    asserts,
    scope,
    not: null,
    evidence_excerpt_ids: [],
    evidence_excerpt: 'x',
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-06-29T00:00:00.000Z',
    review_state: 'candidate',
    frame_excluded: false,
  };
}

// A mock LLM detector that mimics auto-mode fall-through: it classified
// NOTHING into a contradiction (drafts: []) and reports its OWN
// unprocessedPairs as a SUBSET — deliberately EXCLUDING the [0,1] pair the
// prefilter "dropped" below its 0.25 threshold. The buggy map.ts ran the
// heuristic only over this subset, so [0,1] escaped both detectors.
class FallThroughMockDetector implements ContradictionDetector {
  readonly name = 'ollama-intern' as const;
  constructor(private readonly unprocessed: Array<[number, number]>) {}
  async available(): Promise<boolean> {
    return true;
  }
  async detect(_claims: Claim[]): Promise<DetectionResult> {
    return {
      ok: true,
      drafts: [],
      method: 'mock_llm_paired',
      fallThrough: {
        triggeredAtPairIndex: 1,
        consecutiveTimeouts: 5,
        perPairTimeoutMs: 90_000,
        reason: 'consecutive_timeouts',
      },
      unprocessedPairs: this.unprocessed,
    };
  }
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-cnt-fallthrough-'));
  const result = await init({ topic: 'Contradiction fall-through coverage', outDir: workDir });
  packPath = result.packPath;
  await sectionAdd({ id: '01-test', purpose: 'probe', packPath });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function readContradictionsJsonl(): Promise<Array<Record<string, unknown>>> {
  const path = join(packPath, 'sections', '01-test', 'contradictions.jsonl');
  let text = '';
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return [];
  }
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe('A-CNT-001 — fall-through runs heuristic over the FULL unclassified pair space', () => {
  it('COVERAGE: a prefilter-dropped pair the heuristic flags appears after fall-through', async () => {
    // claim 0: universal (scope=null), claim 1: scoped, identical asserts →
    // heuristic compare() → overgeneralization_risk. A third, unrelated claim
    // exists so unprocessedPairs can name a DIFFERENT pair than [0,1].
    const claims: Claim[] = [
      makeClaim(1, null, 'caffeine improves athletic endurance performance significantly'),
      makeClaim(2, 'trained cyclists', 'caffeine improves athletic endurance performance significantly'),
      makeClaim(3, 'unrelated domain', 'mitochondrial density correlates with sprint recovery rates'),
    ];
    await appendFile(
      join(packPath, 'sections', '01-test', 'claims.jsonl'),
      claims.map((c) => JSON.stringify(c)).join('\n') + '\n',
      'utf8',
    );

    // The LLM reports unprocessedPairs WITHOUT [0,1] — it claims to have
    // "handled" [0,1] (prefilter drop), leaving only [0,2] and [1,2] unhandled.
    const summary = await map({
      sectionId: '01-test',
      packPath,
      detectors: [new FallThroughMockDetector([[0, 2], [1, 2]])],
    });

    const rows = await readContradictionsJsonl();
    const pairFlagged = rows.some(
      (r) =>
        Array.isArray(r.claim_ids) &&
        (r.claim_ids as string[]).includes('clm_000000000001_heuristic_1') &&
        (r.claim_ids as string[]).includes('clm_000000000002_heuristic_1'),
    );
    expect(pairFlagged).toBe(true);
    // The fall-through actually engaged (summary records it).
    expect(summary.autoModeFallThrough).toBeDefined();
    expect(summary.contradictionsAdded).toBeGreaterThanOrEqual(1);
  });

  it('NO-OVER-CLASSIFY: a non-contradicting dropped pair produces no contradiction', async () => {
    const claims: Claim[] = [
      makeClaim(1, 'topic one', 'the sky is blue during clear daytime weather'),
      makeClaim(2, 'topic two', 'quarterly revenue grew on stronger subscription demand'),
    ];
    await appendFile(
      join(packPath, 'sections', '01-test', 'claims.jsonl'),
      claims.map((c) => JSON.stringify(c)).join('\n') + '\n',
      'utf8',
    );

    await map({
      sectionId: '01-test',
      packPath,
      detectors: [new FallThroughMockDetector([])],
    });

    const rows = await readContradictionsJsonl();
    expect(rows).toHaveLength(0);
  });
});
