import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { triage, readTriagedClaimIds } from '../src/triage/index.js';
import { ClaimTriageSchema, TriageSummarySchema } from '../src/triage/schema.js';
import { PackNotFoundError, SectionNotFoundError } from '../src/errors.js';

let workDir: string;
let packPath: string;

interface FixtureClaim {
  claim_id: string;
  source_id: string;
  asserts: string;
  scope?: string | null;
  not?: string | null;
  confidence?: 'low' | 'medium' | 'high';
}

async function setupPack() {
  const r = await init({ topic: 'Triage fixture pack', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: '01-test', purpose: 'triage', packPath });
}

async function plantClaim(c: FixtureClaim) {
  const claim = {
    claim_id: c.claim_id,
    section_id: '01-test',
    source_ids: [c.source_id],
    source_hashes: ['a'.repeat(64)],
    asserts: c.asserts,
    scope: c.scope ?? null,
    not: c.not ?? null,
    evidence_excerpt_ids: [`ex_${c.source_id.replace(/^src_/, '')}_001`],
    evidence_excerpt: 'literal',
    evidence_location: null,
    confidence: c.confidence ?? 'low',
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

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-triage-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('triage', () => {
  it('rejects when pack does not exist', async () => {
    await expect(
      triage({ sectionId: '01-test', packPath: join(workDir, 'nope') }),
    ).rejects.toBeInstanceOf(PackNotFoundError);
  });

  it('rejects when section does not exist', async () => {
    await setupPack();
    await expect(
      triage({ sectionId: '99-no', packPath }),
    ).rejects.toBeInstanceOf(SectionNotFoundError);
  });

  it('produces valid triage records when there are no claims', async () => {
    await setupPack();
    const result = await triage({ sectionId: '01-test', packPath });
    expect(result.candidateClaims).toBe(0);
    expect(result.selectedCount).toBe(0);
    expect(existsSync(result.triageJsonlPath)).toBe(true);
    expect(existsSync(result.summaryJsonPath)).toBe(true);
  });

  it('parks claims with scope=null AND not=null on a substantive assert as parked_weak_scope', async () => {
    await setupPack();
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: 'A long substantive assertion with neither scope nor not.',
      scope: null,
      not: null,
    });
    const result = await triage({ sectionId: '01-test', packPath });
    expect(result.decisions.parked_weak_scope).toBe(1);
    expect(result.selectedCount).toBe(0);
  });

  it('parks normalised-asserts duplicates as parked_duplicate, keeping highest quality', async () => {
    await setupPack();
    // All three normalise to the same key. The middle claim has scope+not so
    // it outranks the others; the rest get parked_duplicate.
    const baseAssert = 'A substantive assertion about the same underlying point and topic';
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: baseAssert + '.',
      scope: 'narrow',
      not: 'broad',
    });
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_2',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: baseAssert.toUpperCase() + '!',
      scope: 'narrow',
      not: 'broad',
      confidence: 'high',
    });
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_3',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: baseAssert + '?',
      scope: 'narrow',
      not: 'broad',
    });
    const result = await triage({ sectionId: '01-test', packPath });
    expect(result.decisions.parked_duplicate).toBe(2);
    expect(result.decisions.selected_for_review).toBe(1);
    // The selected one is the scope/not-bearing claim.
    const triageText = await readFile(result.triageJsonlPath, 'utf8');
    const lines = triageText.trim().split('\n').filter(Boolean);
    const selected = lines
      .map((l) => JSON.parse(l))
      .find((r) => r.decision === 'selected_for_review');
    expect(selected.claim_id).toBe('clm_aaaaaaaaaaaa_ollama_intern_2');
  });

  it('parks claims beyond the per-source cap as parked_overdense_source', async () => {
    await setupPack();
    for (let i = 1; i <= 12; i += 1) {
      await plantClaim({
        claim_id: `clm_aaaaaaaaaaaa_ollama_intern_${i}`,
        source_id: 'src_aaaaaaaaaaaa',
        asserts: `Substantive assertion variant number ${i} that is unique.`,
        scope: 'narrow scope',
        not: 'broad scope',
        confidence: 'medium',
      });
    }
    const result = await triage({
      sectionId: '01-test',
      packPath,
      perSourceCap: 5,
    });
    expect(result.decisions.selected_for_review).toBe(5);
    expect(result.decisions.parked_overdense_source).toBe(7);
  });

  it('routes asymmetric scope/not as needs_scope_repair (not parked)', async () => {
    await setupPack();
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: 'A claim with not boundary but no scope.',
      scope: null,
      not: 'something it is not',
    });
    const result = await triage({ sectionId: '01-test', packPath });
    expect(result.decisions.needs_scope_repair).toBe(1);
    expect(result.decisions.parked_weak_scope ?? 0).toBe(0);
  });

  it('parks short-asserts as parked_low_value', async () => {
    await setupPack();
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: 'A is B.',
    });
    const result = await triage({ sectionId: '01-test', packPath, minAssertChars: 30 });
    expect(result.decisions.parked_low_value).toBe(1);
  });

  it('writes a section summary that parses against the schema', async () => {
    await setupPack();
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: 'A long substantive assertion that has scope and not boundaries.',
      scope: 'narrow',
      not: 'broad',
    });
    const result = await triage({ sectionId: '01-test', packPath });
    const summary = JSON.parse(await readFile(result.summaryJsonPath, 'utf8'));
    expect(() => TriageSummarySchema.parse(summary)).not.toThrow();
    expect(summary.candidate_claims).toBe(1);
  });

  it('does not mutate claims.jsonl', async () => {
    await setupPack();
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: 'Substantive assertion with proper scope and not boundary.',
      scope: 'narrow',
      not: 'broad',
    });
    const claimsBefore = await readFile(join(packPath, 'sections', '01-test', 'claims.jsonl'), 'utf8');
    await triage({ sectionId: '01-test', packPath });
    const claimsAfter = await readFile(join(packPath, 'sections', '01-test', 'claims.jsonl'), 'utf8');
    expect(claimsAfter).toBe(claimsBefore);
  });

  it('readTriagedClaimIds returns only the selected_for_review subset', async () => {
    await setupPack();
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: 'A long substantive assertion with full triple.',
      scope: 'narrow',
      not: 'broad',
    });
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_2',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: 'A long substantive assertion missing scope and not.',
    });
    await triage({ sectionId: '01-test', packPath });
    const allowed = await readTriagedClaimIds(packPath, '01-test');
    expect(allowed.has('clm_aaaaaaaaaaaa_ollama_intern_1')).toBe(true);
    expect(allowed.has('clm_aaaaaaaaaaaa_ollama_intern_2')).toBe(false);
  });

  it('every record in claim-triage.jsonl parses against the schema', async () => {
    await setupPack();
    for (let i = 1; i <= 4; i += 1) {
      await plantClaim({
        claim_id: `clm_aaaaaaaaaaaa_ollama_intern_${i}`,
        source_id: 'src_aaaaaaaaaaaa',
        asserts: `Variant assertion ${i} carrying scope and not.`,
        scope: 'narrow',
        not: 'broad',
      });
    }
    const result = await triage({ sectionId: '01-test', packPath });
    const text = await readFile(result.triageJsonlPath, 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      expect(() => ClaimTriageSchema.parse(JSON.parse(line))).not.toThrow();
    }
  });
});
