/**
 * B-CLAIMS-003 (Stage B forward-compat hardening) — claims.jsonl rewrite paths
 * must preserve unknown additive keys across the read→mutate→rewrite cycle.
 *
 * Before the fix: writeClaims() (rescue-ledger.ts) and writeClaimsJsonl()
 * (repair-scope.ts) re-serialized objects produced by a STRICT ClaimSchema.parse,
 * which strips any field this version of research-os doesn't know. Under version
 * skew (a newer research-os wrote a forward-compat field), the next
 * rescue/decline or scope-repair rewrite would silently drop that field
 * permanently.
 *
 * After the fix: both readers parse with ClaimSchema.passthrough(), so unknown
 * keys ride along on the runtime object and survive JSON.stringify on rewrite.
 *
 * Both halves proven per writer:
 *  - GAP HANDLED: an unknown additive key survives the rewrite.
 *  - HAPPY PATH: the intended mutation still applies (scope set / rescue
 *    flips frame_excluded) and known fields round-trip unchanged.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { runScopeRepair } from '../../src/claims/repair-scope.js';
import { rescueClaimByOperator } from '../../src/claims/rescue-ledger.js';

let workDir: string;
let packPath: string;

const SECTION_ID = '01-stageb3';
const SRC = 'src_abcdef012345';

function baseClaim(idx: number, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    claim_id: `clm_abcdef012345_ollama_intern_${idx}`,
    section_id: SECTION_ID,
    source_ids: [SRC],
    source_hashes: [],
    asserts: `Claim number ${idx} asserts something substantive about the topic.`,
    scope: 'some scope',
    not: 'some boundary',
    evidence_excerpt_ids: [],
    evidence_excerpt: 'evidence text for the claim',
    evidence_location: null,
    confidence: 'high',
    extractor: 'ollama-intern',
    extraction_method: 'mcp_ollama_extract',
    created_at: '2026-06-29T03:00:00.000Z',
    review_state: 'candidate',
    ...extra,
  };
}

async function buildPack(claims: Record<string, unknown>[]): Promise<void> {
  const result = await init({
    topic: 'B-CLAIMS-003 rewrite forward-compat fixture',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({ id: SECTION_ID, purpose: 'Stage B rewrite bed', packPath });
  const sectionDir = join(packPath, 'sections', SECTION_ID);
  await mkdir(sectionDir, { recursive: true });
  await writeFile(
    join(sectionDir, 'claims.jsonl'),
    claims.map((c) => JSON.stringify(c)).join('\n') + '\n',
    'utf8',
  );
}

async function readClaimsRaw(): Promise<Array<Record<string, unknown>>> {
  const text = await readFile(join(packPath, 'sections', SECTION_ID, 'claims.jsonl'), 'utf8');
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-stageb3-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const FUTURE_KEY = 'future_calibration_band';
const FUTURE_VAL = { band: 'amber', model_skew_version: '99.0.0' };

describe('B-CLAIMS-003 — writeClaimsJsonl (repair-scope) preserves unknown keys', () => {
  it('GAP HANDLED + HAPPY PATH: scope-repair rewrite keeps the unknown key AND applies the scope', async () => {
    // Candidate for scope repair: scope === null. Carries a forward-compat key.
    await buildPack([
      baseClaim(1, { scope: null, not: null, [FUTURE_KEY]: FUTURE_VAL }),
    ]);

    const result = await runScopeRepair({
      sectionId: SECTION_ID,
      packPath,
      mode: 'auto',
      operator: 'stage-b-test',
    });
    expect(result.claimsRepaired).toBe(1);

    const rows = await readClaimsRaw();
    expect(rows).toHaveLength(1);
    // GAP HANDLED: unknown key survived the rewrite.
    expect(rows[0]![FUTURE_KEY]).toEqual(FUTURE_VAL);
    // HAPPY PATH: the scope mutation was actually applied (no longer null).
    expect(rows[0]!.scope).not.toBeNull();
    expect(typeof rows[0]!.scope).toBe('string');
  });
});

describe('B-CLAIMS-003 — writeClaims (rescue-ledger) preserves unknown keys', () => {
  it('GAP HANDLED + HAPPY PATH: operator rescue rewrite keeps the unknown key AND flips frame_excluded', async () => {
    // Target: source_content_mismatch + not_rescued, with 2 non-excluded peers
    // from the same source (eligibility threshold >= 2). Carries a future key.
    await buildPack([
      baseClaim(1, {
        frame_excluded: true,
        frame_exclusion_reason: 'source_content_mismatch',
        frame_exclusion_rationale: 'low overlap with source body',
        rescue_status: 'not_rescued',
        [FUTURE_KEY]: FUTURE_VAL,
      }),
      baseClaim(2, { frame_excluded: false }),
      baseClaim(3, { frame_excluded: false }),
    ]);

    const outcome = await rescueClaimByOperator({
      packPath,
      sectionId: SECTION_ID,
      claimId: 'clm_abcdef012345_ollama_intern_1',
      rescueScope: 'admit within the moderator-claim boundary',
      rescueReason: 'peer evidence proves topical relevance',
      rescueBoundary: 'does not extend to the off-topic tail',
      operator: 'stage-b-test',
    });
    expect(outcome.kind).toBe('rescued');

    const rows = await readClaimsRaw();
    const target = rows.find(
      (r) => r.claim_id === 'clm_abcdef012345_ollama_intern_1',
    )!;
    // GAP HANDLED: unknown key survived the full-file rewrite.
    expect(target[FUTURE_KEY]).toEqual(FUTURE_VAL);
    // HAPPY PATH: the rescue mutation was applied.
    expect(target.frame_excluded).toBe(false);
    expect(target.rescue_status).toBe('rescued_by_operator');
    // Untouched peers round-trip intact.
    const peer = rows.find((r) => r.claim_id === 'clm_abcdef012345_ollama_intern_2')!;
    expect(peer.frame_excluded).toBe(false);
  });
});
