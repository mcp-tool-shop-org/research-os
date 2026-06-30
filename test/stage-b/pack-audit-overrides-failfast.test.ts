import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { audit } from '../../src/audit/index.js';

let workDir: string;
let packPath: string;

async function makePack(): Promise<void> {
  const r = await init({
    topic: 'How does the pack audit behave on a malformed override ledger?',
    outDir: workDir,
  });
  packPath = r.packPath;
  await sectionAdd({ id: '01-test', purpose: 'probe', packPath });
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-pack-audit-overrides-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('B-AUD-001 — readOverrides failure no longer ships a misleading audit', () => {
  // RED-half target: readOverrides() used to run AFTER all 16 core audit files
  // were written, and it throws a plain Error on a malformed
  // evidence/source-card-overrides.jsonl line — leaving a fresh-looking
  // pack-audit.json (possibly ready_for_synthesis) beside missing
  // missing-policy-sources files, with a raw stack. The read is now hoisted
  // above the writes and wrapped: audit() completes, escalates the verdict to
  // human_review_required, and surfaces a malformed-class warning.
  it('escalates to human_review_required and warns instead of throwing on a malformed overrides ledger', async () => {
    await makePack();
    await mkdir(join(packPath, 'evidence'), { recursive: true });
    await writeFile(
      join(packPath, 'evidence', 'source-card-overrides.jsonl'),
      '{ this is not valid json\n',
      'utf8',
    );

    // Must NOT throw — degradation, not a raw stack.
    const summary = await audit({ packPath });

    // Verdict escalated via determineVerdict's /malformed|invalid|parse/ grep.
    expect(summary.verdict).toBe('human_review_required');
    expect(
      summary.warnings.some((w) => /malformed source-card-overrides\.jsonl/i.test(w)),
    ).toBe(true);

    // The transactionally-consistent single pass still wrote the audit set,
    // including the missing-policy-sources files reflecting the unread state.
    expect(existsSync(join(packPath, 'audits', 'pack-audit.json'))).toBe(true);
    expect(existsSync(join(packPath, 'audits', 'missing-policy-sources.json'))).toBe(true);
  });

  // HAPPY-half: with NO overrides file present, the audit behaves exactly as
  // before — readOverrides returns [] and no spurious malformed warning fires.
  it('runs cleanly with no overrides file (default behavior unchanged)', async () => {
    await makePack();

    const summary = await audit({ packPath });

    // No override-malformed warning on the clean path.
    expect(
      summary.warnings.some((w) => /malformed source-card-overrides\.jsonl/i.test(w)),
    ).toBe(false);
    // Whatever the baseline verdict for an empty pack is, it is NOT escalated
    // by an override-read failure.
    expect(summary.verdict).not.toBe('human_review_required');
    expect(existsSync(join(packPath, 'audits', 'missing-policy-sources.json'))).toBe(true);
  });

  // HAPPY-half: a well-formed (empty-but-present) overrides file also reads
  // cleanly — no warning, no escalation.
  it('runs cleanly with a valid (empty) overrides file', async () => {
    await makePack();
    await mkdir(join(packPath, 'evidence'), { recursive: true });
    await writeFile(join(packPath, 'evidence', 'source-card-overrides.jsonl'), '', 'utf8');

    const summary = await audit({ packPath });
    expect(
      summary.warnings.some((w) => /malformed source-card-overrides\.jsonl/i.test(w)),
    ).toBe(false);
    expect(summary.verdict).not.toBe('human_review_required');
  });
});
