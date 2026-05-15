/**
 * v0.10 Slice 2 — R-001 auto-mode scope-repair E2E.
 *
 * Operator-aloneness DST gate v0.1 found that 51 of 52 LLM-extracted claims
 * arrived with scope=null. The triage stage parked them as parked_weak_scope
 * (when both scope and not were null) or needs_scope_repair (asymmetric).
 * The operator had to hand-edit claims.jsonl to add scope on 5 claims to
 * unblock the gate. R-001 surfaces this as a first-class CLI repair surface.
 *
 * Acceptance test from the slice mission:
 *   "Synthetic blocked section: 6 claims in `needs_scope_repair`, gate
 *    blocked on `accepted_claim_floor` → `research-os claim repair-scope
 *    --auto` produces scope on all 6 → re-run review → re-run gate → gate
 *    now passes (accepted_claim_floor satisfied)."
 *
 * This test exercises the engine (NOT the CLI process boundary) but covers
 * the same loop: a synthetic pack with 6 claims missing scope → run
 * `repairScopeAuto()` → assert claims.jsonl now has scope populated on all
 * 6 AND the claim-scope-repairs.jsonl ledger has 6 records AND running
 * triage again no longer parks any of them as parked_weak_scope /
 * needs_scope_repair.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { runScopeRepair } from '../src/claims/repair-scope.js';
import { readScopeRepairs } from '../src/claims/scope-repairs.js';
import { triage } from '../src/triage/index.js';
import { ClaimSchema } from '../src/claims/schema.js';

let workDir: string;
let packPath: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'ros-r001-auto-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const SECTION_ID = '03-dst-injury';
const SECTION_PURPOSE =
  'Daylight savings time effects on workplace productivity and accident rates in the US';

async function setupPack(): Promise<void> {
  const r = await init({ topic: 'DST repair-scope fixture', outDir: workDir });
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

async function readClaimsJsonl(): Promise<Array<{ claim_id: string; scope: string | null }>> {
  const path = join(packPath, 'sections', SECTION_ID, 'claims.jsonl');
  const text = await readFile(path, 'utf8');
  const out: Array<{ claim_id: string; scope: string | null }> = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = ClaimSchema.parse(JSON.parse(line));
    out.push({ claim_id: parsed.claim_id, scope: parsed.scope });
  }
  return out;
}

describe('R-001 auto-mode — full repair loop on synthetic DST claims', () => {
  it('populates scope on all 6 needs-scope claims and writes the repair ledger', async () => {
    await setupPack();
    await plantSourceCard({
      source_id: 'src_aaaaaaaaaaaa',
      publisher: 'APA',
      source_type: 'primary',
      title: 'DST and workplace injury, APA 2009',
    });
    // 6 claims with scope=null AND not=set AND asserts long enough to trip
    // triage's needs_scope_repair classification. Use DISTINCT assert text
    // per claim so triage's dedup pass doesn't collapse them — operator-
    // aloneness DST v0.1 had 51 distinct claims, not 51 copies of one.
    //
    // The kickoff's acceptance test envisions claims sitting in
    // needs_scope_repair (the asymmetric case: scope null, not set). After
    // R-001 fills scope, both fields are populated and triage promotes the
    // claims to selected_for_review on the next pass. This is the canonical
    // population R-001 is built to repair.
    const distinctAsserts = [
      'Spring-forward DST transitions are associated with elevated workplace injury rates in mining and construction',
      'Acute myocardial infarction registrations rise in the week following spring-forward in Scandinavian populations',
      'Traffic-fatality rates in the United States show a measurable increase in the Monday following DST',
      'Cognitive performance on attention tasks degrades on the day after a spring-forward transition',
      'Workplace incidents in heavy industry trend higher during the week of the DST transition',
      'Self-reported sleep duration drops by approximately forty minutes on the night before spring-forward',
    ];
    const claimIds: string[] = [];
    for (let i = 1; i <= 6; i += 1) {
      const claim_id = `clm_${i.toString().padStart(12, 'a')}_ollama_intern_${i}`;
      claimIds.push(claim_id);
      await plantClaim({
        claim_id,
        source_id: 'src_aaaaaaaaaaaa',
        asserts: distinctAsserts[i - 1]!,
        scope: null,
        not: 'not pre-2009 data; not non-shift-work occupations',
      });
    }

    // Sanity check: triage parks these as needs_scope_repair (asymmetric
    // case — not is set, scope is null).
    const triagePre = await triage({ sectionId: SECTION_ID, packPath });
    expect(triagePre.decisions['needs_scope_repair']).toBe(6);

    // Run R-001 auto-mode scope-repair.
    const result = await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'auto',
      operator: 'cli',
      now: () => new Date('2026-05-15T15:00:00.000Z'),
    });

    expect(result.claimsConsidered).toBe(6);
    expect(result.claimsRepaired).toBe(6);
    expect(result.claimsSkipped).toBe(0);
    expect(result.ledgerPath).toMatch(/claim-scope-repairs\.jsonl$/);

    // Claims.jsonl now carries scope on all 6 claims.
    const updated = await readClaimsJsonl();
    expect(updated).toHaveLength(6);
    for (const c of updated) {
      expect(c.scope).not.toBeNull();
      expect(c.scope?.length ?? 0).toBeGreaterThan(0);
    }

    // Ledger has 6 records.
    const ledger = await readScopeRepairs(packPath);
    expect(ledger).toHaveLength(6);
    for (const rec of ledger) {
      expect(rec.mode).toBe('auto');
      expect(rec.operator_confirmed).toBe(false);
      expect(rec.applied_scope).not.toBeNull();
      expect(rec.proposed_scope).not.toBe('');
      // Source signals should reference the source-card publisher + the
      // section purpose (the two heuristic inputs).
      const signalText = rec.source_signals.join(' ');
      expect(signalText.toLowerCase()).toContain('apa');
      expect(signalText.toLowerCase()).toContain('section_purpose');
    }

    // Re-running triage no longer parks the claims as needs_scope_repair
    // OR parked_weak_scope — scope is now set on all 6, and (because the
    // fixture pre-populated `not`) they pass through the asymmetric guard
    // too. The claims advance to selected_for_review on the next pass.
    const triagePost = await triage({ sectionId: SECTION_ID, packPath });
    expect(triagePost.decisions['parked_weak_scope'] ?? 0).toBe(0);
    expect(triagePost.decisions['needs_scope_repair'] ?? 0).toBe(0);
    expect(triagePost.selectedCount).toBe(6);
  });

  it('skips claims that already have scope set (idempotent across runs)', async () => {
    await setupPack();
    await plantSourceCard({
      source_id: 'src_aaaaaaaaaaaa',
      publisher: 'NBER',
      source_type: 'primary',
      title: 'NBER working paper on DST',
    });
    // 3 claims: 2 with scope=null, 1 already scoped. Auto-mode should only
    // touch the 2 null-scope claims; the scoped claim must not appear in
    // the ledger.
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: 'DST transitions increase traffic fatalities in the spring-forward week.',
      scope: null,
      not: null,
    });
    await plantClaim({
      claim_id: 'clm_bbbbbbbbbbbb_ollama_intern_2',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: 'Workplace injury rates increase in mining and construction post-DST shift.',
      scope: null,
      not: null,
    });
    await plantClaim({
      claim_id: 'clm_cccccccccccc_ollama_intern_3',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: 'Cardiovascular events show a statistically significant uptick post-DST shift.',
      scope: 'per Janszky 2008 AMI registry data, Sweden, 1996-2006',
      not: null,
    });

    const result = await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'auto',
      operator: 'cli',
    });

    expect(result.claimsConsidered).toBe(2);
    expect(result.claimsRepaired).toBe(2);
    const ledger = await readScopeRepairs(packPath);
    expect(ledger).toHaveLength(2);
    expect(ledger.map((r) => r.claim_id)).not.toContain('clm_cccccccccccc_ollama_intern_3');

    // The pre-scoped claim's scope is preserved.
    const updated = await readClaimsJsonl();
    const preScoped = updated.find((c) => c.claim_id === 'clm_cccccccccccc_ollama_intern_3');
    expect(preScoped?.scope).toBe('per Janszky 2008 AMI registry data, Sweden, 1996-2006');
  });

  it('repairs both parked_weak_scope (null+null) and needs_scope_repair (asymmetric) claims', async () => {
    // The triage stage produces parked_weak_scope when BOTH scope and not are
    // null. It produces needs_scope_repair when ONE of them is null while
    // the other is set on a substantive claim. R-001 must address both
    // states — scope is missing in both, and operator-aloneness DST v0.1
    // observed both populations.
    await setupPack();
    await plantSourceCard({
      source_id: 'src_aaaaaaaaaaaa',
      publisher: 'CDC',
      source_type: 'primary',
      title: 'CDC weekly mortality report',
    });
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: 'A long substantive claim about DST and injury rates with no scope and no not boundary set.',
      scope: null,
      not: null,
    });
    await plantClaim({
      claim_id: 'clm_bbbbbbbbbbbb_ollama_intern_2',
      source_id: 'src_aaaaaaaaaaaa',
      asserts:
        'Another long substantive claim about DST and injury rates with a not boundary but no scope. Includes enough text to meet the 80-character substantive bar.',
      scope: null,
      not: 'not US data on shift work',
    });

    const result = await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'auto',
      operator: 'cli',
    });
    expect(result.claimsRepaired).toBe(2);

    const updated = await readClaimsJsonl();
    for (const c of updated) {
      expect(c.scope).not.toBeNull();
    }
  });

  it('refuses to run on a frozen pack', async () => {
    await setupPack();
    await plantSourceCard({
      source_id: 'src_aaaaaaaaaaaa',
      publisher: 'APA',
      source_type: 'primary',
      title: 'fixture',
    });
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: 'A long substantive claim about DST and injury rates with no scope and no not boundary set.',
      scope: null,
      not: null,
    });
    // Plant a freeze receipt to mark the pack frozen (matches the
    // source-card audit's frozen-pack guard pattern).
    await mkdir(join(packPath, 'audits'), { recursive: true });
    await writeFile(
      join(packPath, 'audits', 'freeze-receipt.json'),
      JSON.stringify({ pack_id: 'frozen', frozen_at: '2026-05-15T00:00:00.000Z' }),
      'utf8',
    );

    await expect(
      runScopeRepair({
        sectionId: SECTION_ID,
        packPath,
        mode: 'auto',
        operator: 'cli',
      }),
    ).rejects.toThrow(/frozen/i);

    // No ledger should have been written.
    expect(existsSync(join(packPath, 'evidence', 'claim-scope-repairs.jsonl'))).toBe(false);
  });

  it('reports zero repairs when no claims need scope (and writes no ledger entries)', async () => {
    await setupPack();
    await plantSourceCard({
      source_id: 'src_aaaaaaaaaaaa',
      publisher: 'APA',
      source_type: 'primary',
      title: 'fixture',
    });
    await plantClaim({
      claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
      source_id: 'src_aaaaaaaaaaaa',
      asserts: 'Already-scoped claim with full structure.',
      scope: 'per APA 2009 study, US shift workers, spring-forward week',
      not: 'not Antarctic shift workers',
    });

    const result = await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'auto',
      operator: 'cli',
    });
    expect(result.claimsConsidered).toBe(0);
    expect(result.claimsRepaired).toBe(0);
    const ledger = await readScopeRepairs(packPath);
    expect(ledger).toHaveLength(0);
  });
});
