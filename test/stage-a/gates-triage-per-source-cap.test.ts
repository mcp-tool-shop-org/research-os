// Stage A regression — A-TRIAGE-001 + A-CLI-001 (per-source cap, Pass 3).
//
// A-TRIAGE-001 invariant: a multi-source claim is kept for review if ANY of its
// referenced sources still has cap headroom (ranks within top perSourceCap for
// at least one source). It is parked_overdense_source ONLY when NO referenced
// source has headroom. The previous code parked based on the FIRST over-dense
// source processed, dropping a claim that an under-cap source would have kept.
//   BAD half  — a 2-source claim over-dense in source A but under-cap in source
//               B must stay selected_for_review (was wrongly parked before).
//   GOOD half — a single-source claim genuinely over the cap is still parked.
//
// A-CLI-001 invariant: a 0/negative/non-integer perSourceCap must not crash and
// must not over-park; it is clamped to the default at the triage seam.
//   BAD half  — perSourceCap=0 does not crash and does not park a claim that
//               fits under the default cap.
//   GOOD half — a normal positive cap still parks an over-dense source.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, appendFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { triage } from '../../src/triage/index.js';
import { ClaimTriageSchema } from '../../src/triage/schema.js';

let workDir: string;
let packPath: string;

interface PlantSpec {
  claimId: string;
  sourceIds: string[];
  asserts?: string;
  confidence?: 'low' | 'medium' | 'high';
  scope?: string | null;
}

async function setupPack() {
  const r = await init({ topic: 'Per-source-cap regression pack', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: '01-test', purpose: 'triage', packPath });
}

// Substantive, scoped, dedupe-distinct asserts so the only Pass that can park a
// row is Pass 3 (per-source cap). Each asserts string is unique per claim.
async function plant(spec: PlantSpec) {
  const sid0 = spec.sourceIds[0]!.replace(/^src_/, '');
  const claim = {
    claim_id: spec.claimId,
    section_id: '01-test',
    source_ids: spec.sourceIds,
    source_hashes: ['a'.repeat(64)],
    asserts:
      spec.asserts ??
      `Distinct substantive assertion number ${spec.claimId} that comfortably clears the low-value floor.`,
    scope: spec.scope ?? 'a clear scope boundary',
    not: 'an explicit not-constraint',
    evidence_excerpt_ids: [`ex_${sid0}_001`],
    evidence_excerpt: 'literal',
    evidence_location: null,
    confidence: spec.confidence ?? 'low',
    extractor: 'ollama-intern',
    extraction_method: 'ollama_intern_propositional',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
  };
  await appendFile(
    join(packPath, 'sections', '01-test', 'claims.jsonl'),
    JSON.stringify(claim) + '\n',
    'utf8',
  );
}

async function readDecisions(): Promise<Map<string, string>> {
  const text = await readFile(
    join(packPath, 'sections', '01-test', 'claim-triage.jsonl'),
    'utf8',
  );
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const r = ClaimTriageSchema.parse(JSON.parse(line));
    out.set(r.claim_id, r.decision);
  }
  return out;
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-stagea-cap-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const SRC_A = 'src_aaaaaaaaaaaa';
const SRC_B = 'src_bbbbbbbbbbbb';

describe('A-TRIAGE-001 — multi-source claim kept if any source has cap headroom', () => {
  it('BAD half: a 2-source claim over-dense in A but under-cap in B stays selected_for_review', async () => {
    await setupPack();
    // perSourceCap = 1. Source A gets 2 candidates -> one over cap. Source B
    // gets only the shared multi-source claim -> under cap. The shared claim
    // must be RESCUED by B even though A would park it.
    // To force the shared claim to lose A's single slot, give A's single-source
    // claim higher quality (confidence high + good scope) so the shared claim
    // ranks #2 in A.
    await plant({
      claimId: 'clm_111111111111_ollama_intern_1',
      sourceIds: [SRC_A],
      confidence: 'high',
    });
    await plant({
      claimId: 'clm_222222222222_ollama_intern_2',
      sourceIds: [SRC_A, SRC_B],
      confidence: 'low',
    });

    await triage({ sectionId: '01-test', packPath, perSourceCap: 1 });
    const d = await readDecisions();
    // A's high-quality single-source claim takes A's only slot.
    expect(d.get('clm_111111111111_ollama_intern_1')).toBe('selected_for_review');
    // The shared claim is over-cap in A but the only claim in B -> kept.
    expect(d.get('clm_222222222222_ollama_intern_2')).toBe('selected_for_review');
  });

  it('GOOD half: a single-source claim genuinely over the cap is parked_overdense_source', async () => {
    await setupPack();
    // Source A gets 2 single-source claims, cap 1 -> the lower-ranked one parks.
    await plant({
      claimId: 'clm_111111111111_ollama_intern_1',
      sourceIds: [SRC_A],
      confidence: 'high',
    });
    await plant({
      claimId: 'clm_222222222222_ollama_intern_2',
      sourceIds: [SRC_A],
      confidence: 'low',
    });

    await triage({ sectionId: '01-test', packPath, perSourceCap: 1 });
    const d = await readDecisions();
    expect(d.get('clm_111111111111_ollama_intern_1')).toBe('selected_for_review');
    expect(d.get('clm_222222222222_ollama_intern_2')).toBe('parked_overdense_source');
  });
});

describe('A-CLI-001 — non-positive perSourceCap is clamped, not crashing/over-parking', () => {
  it('BAD half: perSourceCap=0 does not crash and does not over-park under-default claims', async () => {
    await setupPack();
    await plant({ claimId: 'clm_111111111111_ollama_intern_1', sourceIds: [SRC_A] });
    await plant({ claimId: 'clm_222222222222_ollama_intern_2', sourceIds: [SRC_A] });

    // cap 0 would, unclamped, drive the parking loop start index negative and
    // over-park everything. Clamped to DEFAULT_PER_SOURCE_CAP=10, both fit.
    const result = await triage({ sectionId: '01-test', packPath, perSourceCap: 0 });
    expect(result.selectedCount).toBe(2);
    const d = await readDecisions();
    expect(d.get('clm_111111111111_ollama_intern_1')).toBe('selected_for_review');
    expect(d.get('clm_222222222222_ollama_intern_2')).toBe('selected_for_review');
  });

  it('BAD half: negative perSourceCap also clamps and does not over-park', async () => {
    await setupPack();
    await plant({ claimId: 'clm_111111111111_ollama_intern_1', sourceIds: [SRC_A] });
    await plant({ claimId: 'clm_222222222222_ollama_intern_2', sourceIds: [SRC_A] });

    const result = await triage({ sectionId: '01-test', packPath, perSourceCap: -5 });
    expect(result.selectedCount).toBe(2);
  });

  it('GOOD half: a normal positive cap still parks an over-dense source', async () => {
    await setupPack();
    await plant({
      claimId: 'clm_111111111111_ollama_intern_1',
      sourceIds: [SRC_A],
      confidence: 'high',
    });
    await plant({
      claimId: 'clm_222222222222_ollama_intern_2',
      sourceIds: [SRC_A],
      confidence: 'low',
    });

    await triage({ sectionId: '01-test', packPath, perSourceCap: 1 });
    const d = await readDecisions();
    expect(d.get('clm_222222222222_ollama_intern_2')).toBe('parked_overdense_source');
  });
});
