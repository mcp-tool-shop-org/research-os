/**
 * v0.11 Slice 1 — R-007: scope/boundary repair alignment.
 *
 * Operator-aloneness DST gate v0.2 (2026-05-15) found that R-001's repair-scope
 * CLI shipped but did not semantically close the operator-aloneness loop. The
 * triage layer requires BOTH `scope` AND `not` for substantive claims:
 *
 *   triage rule 1.2 (parked_weak_scope):  scope=null AND not=null AND asserts>40
 *   triage rule 1.3 (needs_scope_repair): (scope=null AND not!=null)
 *                                         OR (scope!=null AND not=null AND asserts>80)
 *
 * R-001's `repair-scope --auto` filled only `scope`. A claim originally in
 * `parked_weak_scope` (both null, asserts>80) became `needs_scope_repair`
 * after the repair (scope=set, not=null, asserts>80) — the operator ran the
 * instructed repair and remained blocked. v0.2 evidence: 46 Section-01 claims
 * stuck in this loop, both sections gate-blocked on accepted_claim_floor.
 *
 * R-007's product law: when the system tells the operator a claim is
 * repaired, the claim must satisfy the triage condition that caused the
 * repair.
 *
 * Chosen alignment shape (Option A — see project memory for the trade-off):
 *   repair-scope fills BOTH `scope` AND `not` when both are null at repair
 *   time. The reverse-asymmetric case (scope=set, not=null) remains outside
 *   repair-scope's candidate set — a future slice can add a sibling repair
 *   action if operator evidence demands it.
 *
 * Tests in this file:
 *   1. v0.2 regression replay — both-null + asserts>80 claims unblock cleanly
 *   2. Schema back-compat — existing scope-repair ledger records parse cleanly
 *   3. Auto-mode fills both fields on both-null claims
 *   4. Auto-mode fills only scope on asymmetric (scope=null, not=set) claims
 *   5. Interactive mode accept applies both proposals when both null
 *   6. Interactive mode edit supports new_not alongside new_scope
 *   7. Ledger discipline — applied_not is recorded; repair twice records both
 *   8. Recover advisor routing — repair_claim_scope still surfaces, command_hint unchanged
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import {
  runScopeRepair,
  type ScopeRepairPrompter,
  type ScopeRepairPrompterResponse,
} from '../src/claims/repair-scope.js';
import { readScopeRepairs } from '../src/claims/scope-repairs.js';
import { ScopeRepairSchema } from '../src/claims/scope-repairs-schema.js';
import { proposeScopeForClaim } from '../src/claims/scope-proposer.js';
import { triage } from '../src/triage/index.js';
import { ClaimSchema, type Claim } from '../src/claims/schema.js';
import { buildActionGraph } from '../src/recover/action-graph.js';
import type { FailureShape, SectionDiagnosis } from '../src/recover/types.js';
import type { SourceCard } from '../src/sources/schema.js';

let workDir: string;
let packPath: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'ros-r007-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const SECTION_ID = '01-dst-productivity';
const SECTION_PURPOSE =
  'Daylight savings time effects on workplace productivity and accident rates in the US';

async function setupPack(): Promise<void> {
  const r = await init({ topic: 'R-007 alignment fixture', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: SECTION_ID, purpose: SECTION_PURPOSE, packPath });
}

async function plantSourceCard(args: {
  source_id: string;
  publisher: string;
  source_type: 'primary' | 'docs' | 'secondary' | 'forum' | 'unknown';
  title: string;
}): Promise<void> {
  const dir = join(packPath, 'evidence', 'source-cards');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${args.source_id}.json`),
    JSON.stringify({
      source_id: args.source_id,
      receipt_id: `rcpt_${args.source_id.slice(4)}_1`,
      section_id: SECTION_ID,
      url: `https://example.com/${args.source_id}`,
      final_url: `https://example.com/${args.source_id}`,
      fetched_at: '2026-05-15T00:00:00.000Z',
      publisher: args.publisher,
      published_at: null,
      title: args.title,
      source_type: args.source_type,
      relevance: 'high',
      key_points: ['x'],
      limitations: [],
      asserts: 'fixture',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-15T00:00:00.000Z',
    }),
    'utf8',
  );
}

async function plantClaim(args: {
  claim_id: string;
  source_id: string;
  asserts: string;
  scope?: string | null;
  not?: string | null;
}): Promise<void> {
  await mkdir(join(packPath, 'sections', SECTION_ID), { recursive: true });
  await appendFile(
    join(packPath, 'sections', SECTION_ID, 'claims.jsonl'),
    JSON.stringify({
      claim_id: args.claim_id,
      section_id: SECTION_ID,
      source_ids: [args.source_id],
      source_hashes: ['a'.repeat(64)],
      asserts: args.asserts,
      scope: args.scope ?? null,
      not: args.not ?? null,
      evidence_excerpt_ids: [`ex_${args.source_id.replace(/^src_/, '')}_001`],
      evidence_excerpt: 'literal evidence excerpt',
      evidence_location: null,
      confidence: 'medium',
      extractor: 'ollama-intern',
      extraction_method: 'ollama_intern_propositional',
      created_at: '2026-05-15T00:00:00.000Z',
      review_state: 'candidate',
    }) + '\n',
    'utf8',
  );
}

async function readClaim(claim_id: string): Promise<Claim | undefined> {
  const path = join(packPath, 'sections', SECTION_ID, 'claims.jsonl');
  const text = await readFile(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = ClaimSchema.parse(JSON.parse(line));
    if (parsed.claim_id === claim_id) return parsed;
  }
  return undefined;
}

function scriptedPrompter(
  script: ScopeRepairPrompterResponse[],
): ScopeRepairPrompter {
  let i = 0;
  return {
    promptScopeProposal: async () => {
      if (i >= script.length) throw new Error('prompter script exhausted');
      const response = script[i++]!;
      return response;
    },
  };
}

function diag(
  failure_shape: FailureShape,
  overrides: Partial<SectionDiagnosis> = {},
): SectionDiagnosis {
  return {
    section_id: 'fixture',
    section_purpose: 'fixture purpose',
    failure_shape,
    blocking: true,
    waiveable: false,
    stage: 'gate',
    evidence_state: {
      extracted_claims: 0,
      accepted_claims: 0,
      frame_excluded_claims: 0,
      needs_repair_claims: 0,
      sources: 0,
      distinct_publishers: 0,
      distinct_primary_publishers: 0,
    },
    detail: 'fixture detail',
    ...overrides,
  };
}

// Distinct DST asserts long enough (>80 chars) to hit triage rule 1.3 if
// `not` is left null after a scope-only repair. This is the exact v0.2
// failure shape.
const LONG_DST_ASSERTS = [
  'Spring-forward DST transitions are associated with elevated workplace injury rates in mining and construction sectors during the immediate post-transition week',
  'Acute myocardial infarction registrations rise measurably in the week following the spring-forward transition in Scandinavian populations of working-age adults',
  'Traffic-fatality rates in the United States show a statistically significant increase on the Monday following DST shifts compared with control Mondays in the same month',
  'Cognitive performance on attention and working-memory tasks degrades on the day after a spring-forward transition relative to pre-transition baselines',
  'Workplace incidents in heavy industry trend higher during the week of the DST transition than during matched non-transition weeks in the same calendar quarter',
  'Self-reported sleep duration drops by approximately forty minutes on the night before spring-forward and recovers over the following three to five days',
];

describe('R-007 — v0.2 regression replay: parked_weak_scope claims unblock after a single repair-scope pass', () => {
  it('46-shape: claims with both scope=null AND not=null + asserts>80 are repaired AND triage advances them', async () => {
    // The exact v0.2 originating shape: 6 claims (scaled-down 46), all with
    // scope=null AND not=null AND asserts>80. Pre-R-007 they were
    // parked_weak_scope; after repair-scope --auto only `scope` got filled,
    // and re-triage classified them as needs_scope_repair (scope=set, not=null,
    // asserts>80) — the operator was stuck in a loop. R-007 fills both fields
    // so the same repair pass unblocks them.
    await setupPack();
    await plantSourceCard({
      source_id: 'src_aaaaaaaaaaaa',
      publisher: 'APA',
      source_type: 'primary',
      title: 'DST and workplace injury, APA 2009',
    });
    const claimIds: string[] = [];
    for (let i = 1; i <= 6; i += 1) {
      const claim_id = `clm_${i.toString().padStart(12, 'a')}_ollama_intern_${i}`;
      claimIds.push(claim_id);
      await plantClaim({
        claim_id,
        source_id: 'src_aaaaaaaaaaaa',
        asserts: LONG_DST_ASSERTS[i - 1]!,
        scope: null,
        not: null,
      });
    }

    // Sanity check: these 6 claims start in parked_weak_scope (both null,
    // asserts>40).
    const triagePre = await triage({ sectionId: SECTION_ID, packPath });
    expect(triagePre.decisions['parked_weak_scope']).toBe(6);

    // Run R-001 auto-mode repair. The operator-instructed path.
    const result = await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'auto',
      operator: 'cli',
      now: () => new Date('2026-05-15T15:00:00.000Z'),
    });
    expect(result.claimsRepaired).toBe(6);

    // Claims.jsonl now carries BOTH scope AND not on every repaired claim.
    // This is the core R-007 invariant: the repair surface must align with
    // triage's "substantive claim" requirement (both fields).
    for (const claim_id of claimIds) {
      const claim = await readClaim(claim_id);
      expect(claim?.scope).not.toBeNull();
      expect(claim?.not).not.toBeNull();
    }

    // Re-running triage no longer parks any of the 6 claims. They advance to
    // selected_for_review on the next pass — the v0.2 loop is closed.
    const triagePost = await triage({ sectionId: SECTION_ID, packPath });
    expect(triagePost.decisions['parked_weak_scope'] ?? 0).toBe(0);
    expect(triagePost.decisions['needs_scope_repair'] ?? 0).toBe(0);
    expect(triagePost.selectedCount).toBe(6);
  });

  it('mixed fixture: both-null claims fill both; asymmetric (scope=null, not=set) claims fill only scope', async () => {
    // R-007 must not over-apply. Claims that already have `not` set retain
    // their operator-authored boundary; only the missing `scope` is filled.
    // This preserves the R-001 asymmetric-case behavior and proves the
    // alignment fix is targeted.
    await setupPack();
    await plantSourceCard({
      source_id: 'src_aaaaaaaaaaaa',
      publisher: 'CDC',
      source_type: 'primary',
      title: 'CDC weekly mortality report',
    });
    const operatorBoundary = 'not US data on shift work; not Antarctic populations';
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: LONG_DST_ASSERTS[0]!,
      scope: null,
      not: null, // both-null — R-007 must fill BOTH
    });
    await plantClaim({
      claim_id: 'clm_bbbbbbbbbbbb_ollama_intern_2',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: LONG_DST_ASSERTS[1]!,
      scope: null,
      not: operatorBoundary, // asymmetric — R-007 must NOT overwrite `not`
    });

    const result = await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'auto',
      operator: 'cli',
    });
    expect(result.claimsRepaired).toBe(2);

    const both = await readClaim('clm_aaaaaaaaaaaa_ollama_intern_1');
    expect(both?.scope).not.toBeNull();
    expect(both?.not).not.toBeNull();

    const asym = await readClaim('clm_bbbbbbbbbbbb_ollama_intern_2');
    expect(asym?.scope).not.toBeNull();
    expect(asym?.not).toBe(operatorBoundary); // PRESERVED — not overwritten

    // Triage advances both claims; neither stays in needs_scope_repair.
    const triagePost = await triage({ sectionId: SECTION_ID, packPath });
    expect(triagePost.decisions['needs_scope_repair'] ?? 0).toBe(0);
    expect(triagePost.decisions['parked_weak_scope'] ?? 0).toBe(0);
    expect(triagePost.selectedCount).toBe(2);
  });

  it('reverse-asymmetric (scope=set, not=null) is NOT in repair-scope candidate set — explicit non-feature', async () => {
    // Out of slice scope by design. The R-001 close memo explicitly bounded
    // repair-scope to scope=null claims; R-007 does not widen into the
    // not-only-null case. If operator evidence demands it, a future sibling
    // action `repair_claim_boundary` can address it without overloading
    // repair-scope further.
    await setupPack();
    await plantSourceCard({
      source_id: 'src_aaaaaaaaaaaa',
      publisher: 'NBER',
      source_type: 'primary',
      title: 'NBER DST working paper',
    });
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: LONG_DST_ASSERTS[0]!,
      scope: 'per NBER working-paper data, US, 2009-2014',
      not: null, // reverse-asymmetric — NOT a candidate for repair-scope
    });

    const result = await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'auto',
      operator: 'cli',
    });
    // Zero claims considered: this claim already has scope set, so it falls
    // outside repair-scope's `scope === null` filter. Pre-R-007 behavior.
    expect(result.claimsConsidered).toBe(0);
    expect(result.claimsRepaired).toBe(0);
  });
});

describe('R-007 — scope-proposer extends with proposed_not', () => {
  it('proposes a templated `not` boundary alongside the existing scope template', () => {
    const claim: Claim = ClaimSchema.parse({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      section_id: SECTION_ID,
      source_ids: ['src_aaaaaaaaaaaa'],
      source_hashes: ['a'.repeat(64)],
      asserts: LONG_DST_ASSERTS[0]!,
      scope: null,
      not: null,
      evidence_excerpt_ids: ['ex_aaaaaaaaaaaa_001'],
      evidence_excerpt: 'literal',
      evidence_location: null,
      confidence: 'medium',
      extractor: 'ollama-intern',
      extraction_method: 'ollama_intern_propositional',
      created_at: '2026-05-15T00:00:00.000Z',
      review_state: 'candidate',
    });
    const sourceCards: SourceCard[] = [
      {
        source_id: 'src_aaaaaaaaaaaa',
        receipt_id: 'rcpt_aaaaaaaaaaaa_1',
        section_id: SECTION_ID,
        url: 'https://example.com',
        final_url: 'https://example.com',
        fetched_at: '2026-05-15T00:00:00.000Z',
        publisher: 'APA',
        published_at: null,
        title: 'fixture',
        source_type: 'primary',
        relevance: 'high',
        key_points: [],
        limitations: [],
        asserts: 'fixture',
        scope: null,
        not: null,
        extracted_by: 'heuristic',
        extracted_at: '2026-05-15T00:00:00.000Z',
      } as SourceCard,
    ];

    const proposal = proposeScopeForClaim({
      claim,
      sectionPurpose: SECTION_PURPOSE,
      sourceCards,
    });

    expect(typeof proposal.proposed_scope).toBe('string');
    expect(proposal.proposed_scope.length).toBeGreaterThan(0);

    // R-007 contract: the proposer ALSO produces a `proposed_not` string.
    expect(typeof proposal.proposed_not).toBe('string');
    expect(proposal.proposed_not.length).toBeGreaterThan(0);

    // The proposed boundary should reference one of the source signals the
    // template was given so the operator can audit the proposal.
    const notLower = proposal.proposed_not.toLowerCase();
    expect(
      notLower.includes('apa') ||
        notLower.includes('primary') ||
        notLower.includes('daylight'),
    ).toBe(true);
  });

  it('degrades gracefully when source-card publisher and source_type are unknown', () => {
    const claim: Claim = ClaimSchema.parse({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      section_id: SECTION_ID,
      source_ids: ['src_aaaaaaaaaaaa'],
      source_hashes: ['a'.repeat(64)],
      asserts: LONG_DST_ASSERTS[0]!,
      scope: null,
      not: null,
      evidence_excerpt_ids: ['ex_aaaaaaaaaaaa_001'],
      evidence_excerpt: 'literal',
      evidence_location: null,
      confidence: 'medium',
      extractor: 'ollama-intern',
      extraction_method: 'ollama_intern_propositional',
      created_at: '2026-05-15T00:00:00.000Z',
      review_state: 'candidate',
    });
    // No source cards — proposer must still return non-empty proposals.
    const proposal = proposeScopeForClaim({
      claim,
      sectionPurpose: SECTION_PURPOSE,
      sourceCards: [],
    });
    expect(proposal.proposed_scope.length).toBeGreaterThan(0);
    expect(proposal.proposed_not.length).toBeGreaterThan(0);
  });
});

describe('R-007 — interactive mode prompter contract extends with proposed_not + new_not', () => {
  it('accept on a both-null claim applies BOTH proposed_scope AND proposed_not', async () => {
    await setupPack();
    await plantSourceCard({
      source_id: 'src_aaaaaaaaaaaa',
      publisher: 'APA',
      source_type: 'primary',
      title: 'APA fixture',
    });
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: LONG_DST_ASSERTS[0]!,
      scope: null,
      not: null,
    });
    const prompter = scriptedPrompter([{ action: 'accept' }]);
    await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'interactive',
      operator: 'tester',
      prompter,
    });
    const claim = await readClaim('clm_aaaaaaaaaaaa_ollama_intern_1');
    expect(claim?.scope).not.toBeNull();
    expect(claim?.not).not.toBeNull();

    // The ledger captures BOTH proposed_not and applied_not.
    const ledger = await readScopeRepairs(packPath);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.applied_scope).not.toBeNull();
    expect(ledger[0]?.proposed_not).toBeTruthy();
    expect(ledger[0]?.applied_not).not.toBeNull();
    expect(ledger[0]?.applied_not).toBe(ledger[0]?.proposed_not);
  });

  it('edit accepts new_not alongside new_scope on a both-null claim', async () => {
    await setupPack();
    await plantSourceCard({
      source_id: 'src_aaaaaaaaaaaa',
      publisher: 'APA',
      source_type: 'primary',
      title: 'APA fixture',
    });
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: LONG_DST_ASSERTS[0]!,
      scope: null,
      not: null,
    });
    const customScope = 'narrowed: US BLS data, mining/construction 2010-2020';
    const customNot = 'not pre-2010 data; not non-shift-work occupations';
    const prompter = scriptedPrompter([
      { action: 'edit', new_scope: customScope, new_not: customNot },
    ]);
    await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'interactive',
      operator: 'tester',
      prompter,
    });
    const claim = await readClaim('clm_aaaaaaaaaaaa_ollama_intern_1');
    expect(claim?.scope).toBe(customScope);
    expect(claim?.not).toBe(customNot);

    const ledger = await readScopeRepairs(packPath);
    expect(ledger[0]?.applied_scope).toBe(customScope);
    expect(ledger[0]?.applied_not).toBe(customNot);
    expect(ledger[0]?.operator_confirmed).toBe(true);
  });

  it('edit without new_not falls back to the proposed_not when both fields are needed', async () => {
    // Back-compat: legacy interactive flows that only supply new_scope must
    // still produce a complete repair (the proposed_not fills in). This
    // preserves the v0.10 interactive prompter contract while honoring
    // R-007's alignment.
    await setupPack();
    await plantSourceCard({
      source_id: 'src_aaaaaaaaaaaa',
      publisher: 'APA',
      source_type: 'primary',
      title: 'APA fixture',
    });
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: LONG_DST_ASSERTS[0]!,
      scope: null,
      not: null,
    });
    const customScope = 'narrowed: US BLS data, mining/construction 2010-2020';
    const prompter = scriptedPrompter([{ action: 'edit', new_scope: customScope }]);
    await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'interactive',
      operator: 'tester',
      prompter,
    });
    const claim = await readClaim('clm_aaaaaaaaaaaa_ollama_intern_1');
    expect(claim?.scope).toBe(customScope);
    expect(claim?.not).not.toBeNull(); // proposed_not filled in
    const ledger = await readScopeRepairs(packPath);
    expect(ledger[0]?.applied_not).toBe(ledger[0]?.proposed_not);
  });

  it('skip leaves BOTH fields null and the claim row is untouched', async () => {
    await setupPack();
    await plantSourceCard({
      source_id: 'src_aaaaaaaaaaaa',
      publisher: 'APA',
      source_type: 'primary',
      title: 'APA fixture',
    });
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: LONG_DST_ASSERTS[0]!,
      scope: null,
      not: null,
    });
    const prompter = scriptedPrompter([{ action: 'skip', reason: 'unclear evidence' }]);
    await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'interactive',
      operator: 'tester',
      prompter,
    });
    const claim = await readClaim('clm_aaaaaaaaaaaa_ollama_intern_1');
    expect(claim?.scope).toBeNull();
    expect(claim?.not).toBeNull();

    const ledger = await readScopeRepairs(packPath);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.applied_scope).toBeNull();
    expect(ledger[0]?.applied_not ?? null).toBeNull();
  });
});

describe('R-007 — append-only ledger discipline preserved with new fields', () => {
  it('schema accepts new records with proposed_not + applied_not', () => {
    expect(() =>
      ScopeRepairSchema.parse({
        claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
        section_id: '01-fixture',
        repaired_at: '2026-05-15T12:00:00.000Z',
        mode: 'auto',
        source_signals: ['publisher:APA', 'source_type:primary', 'section_purpose:dst'],
        proposed_scope: 'per APA primary studies on DST',
        applied_scope: 'per APA primary studies on DST',
        proposed_not: 'not generalizing outside APA primary context',
        applied_not: 'not generalizing outside APA primary context',
        operator_confirmed: false,
        reason: null,
        operator: 'cli',
        research_os_version: '0.11.0',
      }),
    ).not.toThrow();
  });

  it('schema back-compat: legacy records WITHOUT proposed_not/applied_not still parse', () => {
    // Frozen-pack-compatible: a v0.10.0 ledger written before R-007 must
    // still load cleanly. The new fields are optional.
    expect(() =>
      ScopeRepairSchema.parse({
        claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
        section_id: '01-fixture',
        repaired_at: '2026-05-15T12:00:00.000Z',
        mode: 'auto',
        source_signals: ['publisher:APA', 'source_type:primary', 'section_purpose:dst'],
        proposed_scope: 'per APA primary studies on DST',
        applied_scope: 'per APA primary studies on DST',
        operator_confirmed: false,
        reason: null,
        operator: 'cli',
        research_os_version: '0.10.0',
      }),
    ).not.toThrow();
  });

  it('repair twice on the same both-null claim preserves both ledger entries', async () => {
    // R-007 must preserve R-001's append-only invariant. Running repair
    // twice records two entries; neither is destroyed.
    await setupPack();
    await plantSourceCard({
      source_id: 'src_aaaaaaaaaaaa',
      publisher: 'APA',
      source_type: 'primary',
      title: 'APA fixture',
    });
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: LONG_DST_ASSERTS[0]!,
      scope: null,
      not: null,
    });
    await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'auto',
      operator: 'cli',
      now: () => new Date('2026-05-15T12:00:00.000Z'),
    });
    // After the first run, scope+not are set. Re-running repair finds zero
    // candidates because the candidate filter is `scope === null`. To
    // exercise the append-only path with a new repair, manually re-null the
    // claim and run again — emulates an operator who re-extracted and wants
    // a second repair pass.
    const path = join(packPath, 'sections', SECTION_ID, 'claims.jsonl');
    const text = await readFile(path, 'utf8');
    const claim = ClaimSchema.parse(JSON.parse(text.trim()));
    const reNulled: Claim = { ...claim, scope: null, not: null };
    await writeFile(path, JSON.stringify(reNulled) + '\n', 'utf8');

    await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'auto',
      operator: 'cli',
      now: () => new Date('2026-05-15T13:00:00.000Z'),
    });

    const ledger = await readScopeRepairs(packPath);
    expect(ledger).toHaveLength(2);
    expect(ledger[0]?.repaired_at < ledger[1]!.repaired_at).toBe(true);
    expect(ledger[0]?.applied_not).not.toBeNull();
    expect(ledger[1]?.applied_not).not.toBeNull();
  });
});

describe('R-007 — recover advisor routing unchanged (Option A preserves the closed enum)', () => {
  it('accepted_claim_floor + needs_repair_claims>=3 still surfaces repair_claim_scope at rank 1', () => {
    const d = diag('accepted_claim_floor', {
      section_id: '01-blocked',
      evidence_state: {
        extracted_claims: 8,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 6,
        sources: 3,
        distinct_publishers: 2,
        distinct_primary_publishers: 1,
      },
    });
    const ag = buildActionGraph(d);
    expect(ag.allowed_actions[0]?.action_id).toBe('repair_claim_scope');
    expect(ag.allowed_actions[0]?.command_hint).toContain('research-os claim repair-scope');
    expect(ag.allowed_actions[0]?.command_hint).toContain('01-blocked');
    // No new `repair_claim_boundary` / `repair_claim_fit` actions added by
    // R-007 — Option A preserves the closed `RECOVERY_ACTIONS` enum at 8 values.
    expect(ag.allowed_actions.map((a) => a.action_id)).not.toContain('repair_claim_boundary');
    expect(ag.allowed_actions.map((a) => a.action_id)).not.toContain('repair_claim_fit');
  });

  it('apply_waiver remains permanently forbidden on accepted_claim_floor (pack law unchanged)', () => {
    const d = diag('accepted_claim_floor', {
      evidence_state: {
        extracted_claims: 8,
        accepted_claims: 0,
        frame_excluded_claims: 0,
        needs_repair_claims: 6,
        sources: 3,
        distinct_publishers: 2,
        distinct_primary_publishers: 1,
      },
    });
    const ag = buildActionGraph(d);
    expect(ag.forbidden_actions.map((f) => f.action_id)).toContain('apply_waiver');
  });
});
