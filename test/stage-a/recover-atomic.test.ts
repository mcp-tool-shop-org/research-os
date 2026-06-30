// A-RECOVER-001 (HIGH, bug) regression.
//
// Invariant: the `recover pack --regenerate-action-graph` path is atomic with
// respect to the canonical recovery artifact. If client resolution or artifact
// construction throws (e.g. the MCP binary is absent so ensureClient throws),
// the existing canonical recovery/blocked-section-recovery.{json,md} files MUST
// remain intact at their canonical path, and there must be NO orphaned archive
// in recovery/history/ without a corresponding ledger entry.
//
// Before the fix, the archive (rename into history/) happened BEFORE
// ensureClient + buildRecoveryArtifact, so an MCP-absent throw stranded the
// canonical files in history/ with no replacement and no ledger record.
//
// Both halves proven:
//   BAD : recoverPack({ regenerate }) where ensureClient throws → canonical
//         artifact still present + unchanged, no orphaned history file, no
//         ledger entry.
//   GOOD: recoverPack({ regenerate }) with a working client succeeds, archives
//         the predecessor, writes a fresh artifact, and appends a ledger entry.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { handoff as coworkHandoff } from '../../src/cowork/index.js';
import { recoverPack } from '../../src/recover/index.js';
import { listRecoveryHistory, readRegenerationLedger } from '../../src/recover/regeneration-ledger.js';
import type { ProseCallToolClient } from '../../src/synth/prose/types.js';
import type { RecoveryAdvice } from '../../src/recover/types.js';

let workDir: string;
let packPath: string;

const SECTION = '01-floor';

// A canonical recovery artifact WITHOUT input_state_hash → the regenerate
// classifier returns `missing_input_hash` (non-null), so the regenerate path
// proceeds to the archive step. This is the precondition that exercises the
// archive-before-build bug.
const ORIGINAL_RECOVERY_JSON = JSON.stringify(
  {
    status: 'blocked_section_recovery',
    pack_id: 'pack_fixture',
    pack_topic: 'fixture topic',
    pack_mode: 'repair_required',
    generated_at: '2026-05-13T00:00:00.000Z',
    research_os_version: '0.0.0-fixture',
    sections: [
      {
        section_id: SECTION,
        section_purpose: 'Purpose of 01-floor',
        status: 'recovery_advised',
        diagnosis: null,
        action_graph: null,
        advice: null,
        advisor_path: null,
      },
    ],
  },
  null,
  2,
);
const ORIGINAL_RECOVERY_MD = '# Original recovery markdown (fixture)\n';

async function writeGate(sectionId: string): Promise<void> {
  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(
    join(packPath, 'audits', `${sectionId}-gate.json`),
    JSON.stringify({
      section_id: sectionId,
      verdict: 'blocked',
      summary: `fixture gate for ${sectionId}`,
      checked_at: '2026-05-13T00:00:02.000Z',
      synthesis_eligible: false,
      gate_results: [],
      failures: [
        { family: 'accepted_claim_floor', check: 'min_accepted_claims', status: 'fail', detail: 'fixture', evidence: [], blocks_synthesis: true },
      ],
      warnings: [],
      waivers_applied: [],
      blocking_reasons: ['accepted_claim_floor: 0/3'],
      claim_counts: { total: 0, candidate: 0, with_evidence_excerpt: 0, with_source_hashes: 0, with_scope: 0, with_not: 0, universal_scope_null: 0, orphans: 0 },
      source_counts: { total: 0, primary: 0, secondary: 0, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 0, failed_fetches: 0, section_primary: 0, section_independent_publishers: 0 },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 0 },
      scope_integrity_summary: { universal_claims: 0, scoped_claims: 0, with_not_constraint: 0, overgen_risks_total: 0, overgen_risks_blocking: 0 },
      next_actions: [],
    }),
    'utf8',
  );
}

async function buildFixture(): Promise<void> {
  const r = await init({ topic: 'recover atomicity test', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: SECTION, purpose: 'Purpose of 01-floor', packPath });
  await writeGate(SECTION);
  await coworkHandoff({ packPath });

  // Seed a pre-existing canonical recovery artifact (no input_state_hash).
  const recoverDir = join(packPath, 'recovery');
  await mkdir(recoverDir, { recursive: true });
  await writeFile(join(recoverDir, 'blocked-section-recovery.json'), ORIGINAL_RECOVERY_JSON, 'utf8');
  await writeFile(join(recoverDir, 'blocked-section-recovery.md'), ORIGINAL_RECOVERY_MD, 'utf8');
}

// A working fake advisor client for the GOOD half.
function makeWorkingClient(): ProseCallToolClient {
  return {
    async callTool() {
      const advice: RecoveryAdvice = {
        recommended_action: {
          action_id: 'repair_accepted_claim_floor',
          why: 'fixture',
          command_hint: 'research-os ...',
        },
        alternative_actions: [],
        rationale: 'fixture rationale that is sufficiently long to pass any min checks.',
        what_changes_when_resolved: 'fixture',
      } as unknown as RecoveryAdvice;
      return { content: [{ type: 'text', text: JSON.stringify({ result: { ok: true, data: advice } }) }] };
    },
  };
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-recover-atomic-'));
  await buildFixture();
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('A-RECOVER-001 — regenerate is atomic; client/build failure leaves canonical artifact intact', () => {
  const canonicalJson = (): string => join(packPath, 'recovery', 'blocked-section-recovery.json');
  const canonicalMd = (): string => join(packPath, 'recovery', 'blocked-section-recovery.md');

  it('BAD: ensureClient throwing during regenerate leaves the canonical artifact intact with no orphan archive and no ledger entry', async () => {
    // No mcpClient and no spawnMcpClient → ensureClient throws ("requires an
    // MCP client"). This stands in for the MCP-binary-absent CLI path.
    const err = await recoverPack({ packPath, regenerateActionGraph: true }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).not.toBeNull();
    expect(err).toBeInstanceOf(Error);

    // Canonical files still present AND unchanged.
    expect(existsSync(canonicalJson())).toBe(true);
    expect(existsSync(canonicalMd())).toBe(true);
    expect(await readFile(canonicalJson(), 'utf8')).toBe(ORIGINAL_RECOVERY_JSON);
    expect(await readFile(canonicalMd(), 'utf8')).toBe(ORIGINAL_RECOVERY_MD);

    // No orphaned archive without a ledger entry. Either nothing was archived,
    // or the compensator restored it — in both cases history must not hold a
    // stranded predecessor while the ledger stays empty.
    const history = await listRecoveryHistory(packPath);
    const ledger = await readRegenerationLedger(packPath);
    expect(ledger.length).toBe(0);
    expect(history.length).toBe(0);
  });

  it('GOOD: regenerate with a working client archives, rewrites, and appends a ledger entry', async () => {
    const result = await recoverPack({
      packPath,
      regenerateActionGraph: true,
      mcpClient: makeWorkingClient(),
    });

    expect(result.regenerated).toBe(true);
    // Canonical artifact rewritten (now carries an input_state_hash, so its
    // content differs from the seeded predecessor).
    expect(existsSync(canonicalJson())).toBe(true);
    expect(await readFile(canonicalJson(), 'utf8')).not.toBe(ORIGINAL_RECOVERY_JSON);

    // Predecessor archived + ledger entry appended.
    const history = await listRecoveryHistory(packPath);
    const ledger = await readRegenerationLedger(packPath);
    expect(history.length).toBeGreaterThan(0);
    expect(ledger.length).toBe(1);
  });
});
