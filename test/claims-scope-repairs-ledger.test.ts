/**
 * v0.10 Slice 2 — R-001: claim-scope-repairs.jsonl append-only ledger.
 *
 * Mirrors the v0.4 source-card-overrides.jsonl pattern (append-only, latest-
 * wins by (claim_id, decided_at), schema-validated, frozen-pack-compatible).
 *
 * The ledger is the audit trail for the scope-repair CLI. Every repair —
 * whether auto, interactive-accept, interactive-edit, or interactive-skip —
 * appends a record. The claim row in claims.jsonl carries the resolved
 * scope, but the ledger is the durable history.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  appendScopeRepair,
  readScopeRepairs,
  latestScopeRepairPerClaim,
} from '../src/claims/scope-repairs.js';
import { ScopeRepairSchema } from '../src/claims/scope-repairs-schema.js';

let packPath: string;

beforeEach(async () => {
  packPath = await mkdtemp(join(tmpdir(), 'ros-r001-ledger-'));
});

afterEach(async () => {
  await rm(packPath, { recursive: true, force: true });
});

function fixtureRepair(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
    section_id: '03-blocked',
    repaired_at: '2026-05-15T12:00:00.000Z',
    mode: 'auto',
    source_signals: ['publisher:APA', 'source_type:primary', 'section_purpose:dst-effects'],
    proposed_scope: 'per APA primary studies on DST effects on workplace injury',
    applied_scope: 'per APA primary studies on DST effects on workplace injury',
    operator_confirmed: false,
    reason: null,
    operator: 'cli',
    research_os_version: '0.9.0',
    ...overrides,
  };
}

describe('scope-repairs schema validation', () => {
  it('accepts a well-formed auto-mode record', () => {
    expect(() => ScopeRepairSchema.parse(fixtureRepair())).not.toThrow();
  });

  it('accepts an interactive-edit record with operator_confirmed=true', () => {
    const rec = fixtureRepair({
      mode: 'interactive',
      operator_confirmed: true,
      applied_scope: 'narrowed: DST autumn-back transitions, US BLS data 2010-2020',
    });
    expect(() => ScopeRepairSchema.parse(rec)).not.toThrow();
  });

  it('accepts an interactive-skip record (applied_scope=null, confirmed=false)', () => {
    const rec = fixtureRepair({
      mode: 'interactive',
      applied_scope: null,
      operator_confirmed: false,
      reason: 'operator skipped — needs source contact first',
    });
    expect(() => ScopeRepairSchema.parse(rec)).not.toThrow();
  });

  it('rejects mode outside {auto, interactive}', () => {
    expect(() => ScopeRepairSchema.parse(fixtureRepair({ mode: 'bulk' }))).toThrow();
  });

  it('rejects empty proposed_scope', () => {
    expect(() => ScopeRepairSchema.parse(fixtureRepair({ proposed_scope: '' }))).toThrow();
  });

  it('rejects empty operator', () => {
    expect(() => ScopeRepairSchema.parse(fixtureRepair({ operator: '' }))).toThrow();
  });

  it('rejects malformed claim_id', () => {
    expect(() => ScopeRepairSchema.parse(fixtureRepair({ claim_id: 'not-a-claim-id' }))).toThrow();
  });

  it('rejects non-ISO repaired_at', () => {
    expect(() => ScopeRepairSchema.parse(fixtureRepair({ repaired_at: 'yesterday' }))).toThrow();
  });
});

describe('scope-repairs ledger I/O', () => {
  it('returns [] when the ledger file does not exist (frozen-pack-compatible)', async () => {
    const records = await readScopeRepairs(packPath);
    expect(records).toEqual([]);
  });

  it('appends a record and reads it back', async () => {
    const rec = fixtureRepair();
    await appendScopeRepair(packPath, ScopeRepairSchema.parse(rec));
    const records = await readScopeRepairs(packPath);
    expect(records).toHaveLength(1);
    expect(records[0]?.claim_id).toBe(rec.claim_id);
  });

  it('append-only: a second repair on the same claim preserves the first record', async () => {
    // Operator-aloneness acceptance test 4: running repair-scope twice on
    // the same claim doesn't destroy the first repair record.
    const first = ScopeRepairSchema.parse(
      fixtureRepair({
        repaired_at: '2026-05-15T12:00:00.000Z',
        applied_scope: 'first proposal',
        operator_confirmed: false,
      }),
    );
    const second = ScopeRepairSchema.parse(
      fixtureRepair({
        repaired_at: '2026-05-15T13:00:00.000Z',
        applied_scope: 'second proposal',
        operator_confirmed: true,
        mode: 'interactive',
      }),
    );
    await appendScopeRepair(packPath, first);
    await appendScopeRepair(packPath, second);
    const records = await readScopeRepairs(packPath);
    expect(records).toHaveLength(2);
    expect(records[0]?.applied_scope).toBe('first proposal');
    expect(records[1]?.applied_scope).toBe('second proposal');
    expect(records[0]?.repaired_at < records[1]!.repaired_at).toBe(true);
  });

  it('latestScopeRepairPerClaim returns the most recent record per claim_id', async () => {
    const r1 = ScopeRepairSchema.parse(
      fixtureRepair({
        claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
        repaired_at: '2026-05-15T12:00:00.000Z',
        applied_scope: 'old',
      }),
    );
    const r2 = ScopeRepairSchema.parse(
      fixtureRepair({
        claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
        repaired_at: '2026-05-15T13:00:00.000Z',
        applied_scope: 'new',
        operator_confirmed: true,
      }),
    );
    const r3 = ScopeRepairSchema.parse(
      fixtureRepair({
        claim_id: 'clm_bbbbbbbbbbbb_heuristic_1',
        repaired_at: '2026-05-15T12:30:00.000Z',
        applied_scope: 'only',
      }),
    );
    await appendScopeRepair(packPath, r1);
    await appendScopeRepair(packPath, r3);
    await appendScopeRepair(packPath, r2);
    const latest = latestScopeRepairPerClaim(await readScopeRepairs(packPath));
    expect(latest.get('clm_aaaaaaaaaaaa_heuristic_1')?.applied_scope).toBe('new');
    expect(latest.get('clm_bbbbbbbbbbbb_heuristic_1')?.applied_scope).toBe('only');
  });

  it('persists JSON in JSONL format (one record per line)', async () => {
    await appendScopeRepair(
      packPath,
      ScopeRepairSchema.parse(fixtureRepair({ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' })),
    );
    await appendScopeRepair(
      packPath,
      ScopeRepairSchema.parse(fixtureRepair({ claim_id: 'clm_bbbbbbbbbbbb_heuristic_1' })),
    );
    const text = await readFile(
      join(packPath, 'evidence', 'claim-scope-repairs.jsonl'),
      'utf8',
    );
    const lines = text.split(/\r?\n/).filter(Boolean);
    expect(lines).toHaveLength(2);
    // Each line is a valid standalone JSON document.
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('rejects malformed records at write time (validation before append)', async () => {
    await expect(
      // @ts-expect-error — intentionally malformed
      appendScopeRepair(packPath, { claim_id: 'bogus' }),
    ).rejects.toThrow();
  });

  it('throws with line-number context when a corrupt ledger is read', async () => {
    // Plant a clean record + a malformed line via raw write.
    await appendScopeRepair(packPath, ScopeRepairSchema.parse(fixtureRepair()));
    const ledgerPath = join(packPath, 'evidence', 'claim-scope-repairs.jsonl');
    const { appendFile } = await import('node:fs/promises');
    await appendFile(ledgerPath, 'this is not json\n', 'utf8');
    await expect(readScopeRepairs(packPath)).rejects.toThrow(/line 2/);
  });
});
