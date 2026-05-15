/**
 * v0.10 Slice 2 — R-001 interactive-mode scope-repair.
 *
 * Interactive mode is the default surface — operators new to the tool see
 * each proposed scope and choose accept / edit / skip / quit. The kickoff
 * lists "Interactive mode: a synthetic test that drives interactive prompts
 * confirms operator skip / edit / accept paths all work" as an acceptance
 * test.
 *
 * The engine accepts an injectable Prompter for testability. The CLI's
 * real prompter (readline-based) is exercised at the CLI level; this
 * test uses a synthetic prompter that scripts the operator's responses.
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
import { ClaimSchema } from '../src/claims/schema.js';

let workDir: string;
let packPath: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'ros-r001-interact-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const SECTION_ID = '03-dst-injury';

async function setupFixture(): Promise<string[]> {
  const r = await init({ topic: 'DST interactive fixture', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({
    id: SECTION_ID,
    purpose: 'DST effects on workplace injury',
    packPath,
  });
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  await writeFile(
    join(cardDir, 'src_aaaaaaaaaaaa.json'),
    JSON.stringify({
      source_id: 'src_aaaaaaaaaaaa',
      receipt_id: 'rcpt_aaaaaaaaaaaa_1',
      section_id: SECTION_ID,
      url: 'https://apa.org/dst',
      final_url: 'https://apa.org/dst',
      fetched_at: '2026-05-15T00:00:00.000Z',
      publisher: 'APA',
      published_at: null,
      title: 'APA DST primer',
      source_type: 'primary',
      relevance: 'high',
      key_points: ['injury'],
      limitations: [],
      asserts: 'fixture',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-15T00:00:00.000Z',
    }),
    'utf8',
  );
  const claimIds = [
    'clm_aaaaaaaaaaaa_ollama_intern_1',
    'clm_bbbbbbbbbbbb_ollama_intern_2',
    'clm_cccccccccccc_ollama_intern_3',
  ];
  await mkdir(join(packPath, 'sections', SECTION_ID), { recursive: true });
  for (const claim_id of claimIds) {
    await appendFile(
      join(packPath, 'sections', SECTION_ID, 'claims.jsonl'),
      JSON.stringify({
        claim_id,
        section_id: SECTION_ID,
        source_ids: ['src_aaaaaaaaaaaa'],
        source_hashes: ['a'.repeat(64)],
        asserts: 'Long substantive claim about DST and workplace injury rates.',
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
      }) + '\n',
      'utf8',
    );
  }
  return claimIds;
}

async function claimScope(claim_id: string): Promise<string | null> {
  const path = join(packPath, 'sections', SECTION_ID, 'claims.jsonl');
  const text = await readFile(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = ClaimSchema.parse(JSON.parse(line));
    if (parsed.claim_id === claim_id) return parsed.scope;
  }
  return null;
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

describe('R-001 interactive mode — accept / edit / skip / quit', () => {
  it('accept applies the proposed scope and marks operator_confirmed=true', async () => {
    const [claimA] = await setupFixture();
    const prompter = scriptedPrompter([{ action: 'accept' }, { action: 'accept' }, { action: 'accept' }]);
    const result = await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'interactive',
      operator: 'tester',
      prompter,
    });
    expect(result.claimsRepaired).toBe(3);
    expect(result.claimsSkipped).toBe(0);
    const ledger = await readScopeRepairs(packPath);
    for (const rec of ledger) {
      expect(rec.mode).toBe('interactive');
      expect(rec.operator_confirmed).toBe(true);
      expect(rec.applied_scope).toBe(rec.proposed_scope);
    }
    expect(await claimScope(claimA!)).toBe(ledger[0]?.applied_scope ?? null);
  });

  it('edit replaces the proposed scope with the operator-supplied scope', async () => {
    const [claimA] = await setupFixture();
    const custom = 'narrowed: spring-forward DST, US BLS data, mining/construction 2010-2020';
    const prompter = scriptedPrompter([
      { action: 'edit', new_scope: custom },
      { action: 'accept' },
      { action: 'accept' },
    ]);
    const result = await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'interactive',
      operator: 'tester',
      prompter,
    });
    expect(result.claimsRepaired).toBe(3);
    expect(result.claimsSkipped).toBe(0);
    const ledger = await readScopeRepairs(packPath);
    const editedRec = ledger.find((r) => r.claim_id === claimA);
    expect(editedRec?.applied_scope).toBe(custom);
    expect(editedRec?.operator_confirmed).toBe(true);
    // proposed_scope still records what the engine suggested — auditability
    // requires preserving the engine's proposal even when the operator
    // overrides it.
    expect(editedRec?.proposed_scope).not.toBe(custom);
    expect(await claimScope(claimA!)).toBe(custom);
  });

  it('skip leaves the claim scope null and records a skip in the ledger', async () => {
    const [claimA, claimB] = await setupFixture();
    const prompter = scriptedPrompter([
      { action: 'skip', reason: 'needs source contact first' },
      { action: 'accept' },
      { action: 'accept' },
    ]);
    const result = await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'interactive',
      operator: 'tester',
      prompter,
    });
    expect(result.claimsRepaired).toBe(2);
    expect(result.claimsSkipped).toBe(1);

    const ledger = await readScopeRepairs(packPath);
    expect(ledger).toHaveLength(3); // skip ALSO records a ledger entry
    const skipped = ledger.find((r) => r.claim_id === claimA);
    expect(skipped?.applied_scope).toBeNull();
    expect(skipped?.operator_confirmed).toBe(false);
    expect(skipped?.reason).toMatch(/source contact/);
    // Claim row is untouched.
    expect(await claimScope(claimA!)).toBeNull();
    // The next claim was accepted, so its scope is now populated.
    expect(await claimScope(claimB!)).not.toBeNull();
  });

  it('quit halts processing and commits only what was already decided', async () => {
    const [claimA, claimB, claimC] = await setupFixture();
    const prompter = scriptedPrompter([
      { action: 'accept' },
      { action: 'quit' },
      // Third proposal should never be requested — quit halts iteration.
    ]);
    const result = await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'interactive',
      operator: 'tester',
      prompter,
    });
    expect(result.claimsRepaired).toBe(1);
    expect(result.claimsSkipped).toBe(0);
    expect(result.quitEarly).toBe(true);

    const ledger = await readScopeRepairs(packPath);
    expect(ledger).toHaveLength(1);
    expect(await claimScope(claimA!)).not.toBeNull();
    expect(await claimScope(claimB!)).toBeNull();
    expect(await claimScope(claimC!)).toBeNull();
  });

  it('prompter receives the section_purpose + source_card_summary as context', async () => {
    await setupFixture();
    const seen: Array<Record<string, unknown>> = [];
    const prompter: ScopeRepairPrompter = {
      promptScopeProposal: async (args) => {
        seen.push({ ...args });
        return { action: 'accept' };
      },
    };
    await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'interactive',
      operator: 'tester',
      prompter,
    });
    expect(seen).toHaveLength(3);
    for (const ctx of seen) {
      expect(ctx.section_purpose).toMatch(/DST/i);
      expect(String(ctx.source_card_summary)).toMatch(/APA/i);
      expect(typeof ctx.proposed_scope).toBe('string');
      expect((ctx.proposed_scope as string).length).toBeGreaterThan(0);
    }
  });
});
