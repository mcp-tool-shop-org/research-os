import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as yamlParse } from 'yaml';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { invalidateExtraction } from '../src/invalidate/index.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';
import { InvalidationReceiptSchema } from '../src/invalidate/schema.js';
import { PackNotFoundError } from '../src/errors.js';

let workDir: string;
let packPath: string;

async function setupPack() {
  const result = await init({
    topic: 'Invalidation receipts preserve superseded research truth',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({ id: '01-landscape', purpose: 'first', packPath });
  await sectionAdd({ id: '02-other', purpose: 'second', packPath });
}

async function writeLegacyClaim(sectionId: string, claimId: string) {
  // A claim authored under the legacy contract has no evidence_excerpt_ids.
  const claim = {
    claim_id: claimId,
    section_id: sectionId,
    source_ids: ['src_abcdef012345'],
    source_hashes: ['a'.repeat(64)],
    asserts: 'a legacy claim',
    scope: null,
    not: null,
    evidence_excerpt: 'literal text',
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
  };
  await appendFile(
    join(packPath, 'sections', sectionId, 'claims.jsonl'),
    JSON.stringify(claim) + '\n',
    'utf8',
  );
}

async function writeSpanFirstClaim(sectionId: string, claimId: string) {
  const claim = {
    claim_id: claimId,
    section_id: sectionId,
    source_ids: ['src_abcdef012345'],
    source_hashes: ['a'.repeat(64)],
    asserts: 'a span-first claim',
    scope: null,
    not: null,
    evidence_excerpt_ids: ['ex_abcdef012345_001'],
    evidence_excerpt: 'literal text',
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
  };
  await appendFile(
    join(packPath, 'sections', sectionId, 'claims.jsonl'),
    JSON.stringify(claim) + '\n',
    'utf8',
  );
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-invalidate-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('invalidateExtraction', () => {
  it('rejects when pack does not exist', async () => {
    await expect(
      invalidateExtraction({ packPath: join(workDir, 'nope'), reason: 'span-first refactor' }),
    ).rejects.toBeInstanceOf(PackNotFoundError);
  });

  it('rejects a too-short reason', async () => {
    await setupPack();
    await expect(
      invalidateExtraction({ packPath, reason: 'short' }),
    ).rejects.toThrow(/at least 8/);
  });

  it('returns no-op when there is nothing to invalidate', async () => {
    await setupPack();
    const result = await invalidateExtraction({
      packPath,
      reason: 'span-first contract refactor',
    });
    expect(result.performed).toBe(false);
    expect(result.message).toMatch(/No legacy artifacts/);
    expect(result.receiptId).toBeNull();
  });

  it('archives legacy claims with a receipt and resets section status to draft', async () => {
    await setupPack();
    // Mark 01-landscape as 'gated' so we can verify rollback.
    const yamlPath = join(packPath, 'research.yaml');
    let text = await readFile(yamlPath, 'utf8');
    text = text.replace(
      /id: 01-landscape\n([\s\S]*?)status: draft/,
      'id: 01-landscape\n$1status: gated',
    );
    await writeFile(yamlPath, text, 'utf8');

    await writeLegacyClaim('01-landscape', 'clm_aaaaaaaaaaaa_heuristic_1');
    await writeSpanFirstClaim('02-other', 'clm_bbbbbbbbbbbb_heuristic_1');

    const fixedNow = () => new Date('2026-05-07T00:00:00.000Z');
    const result = await invalidateExtraction({
      packPath,
      reason: 'span-first extraction supersedes the authored-evidence-excerpt contract',
      now: fixedNow,
    });

    expect(result.performed).toBe(true);
    expect(result.affectedSections).toEqual(['01-landscape']);
    expect(result.archivedCount).toBeGreaterThan(0);
    expect(result.archiveDir).toContain('audits/legacy/pre-span-extraction/');

    // Legacy section's claims.jsonl should be gone from canonical location...
    expect(existsSync(join(packPath, 'sections', '01-landscape', 'claims.jsonl'))).toBe(false);
    // ...and present in the archive.
    const archivedPath = join(packPath, result.archiveDir!, 'sections', '01-landscape', 'claims.jsonl');
    expect(existsSync(archivedPath)).toBe(true);

    // Unaffected section's claims.jsonl is untouched.
    expect(existsSync(join(packPath, 'sections', '02-other', 'claims.jsonl'))).toBe(true);

    // Receipt files exist and parse against the schema.
    const receiptJsonPath = join(packPath, result.archiveDir!, 'invalidation.json');
    const receiptMdPath = join(packPath, result.archiveDir!, 'invalidation.md');
    expect(existsSync(receiptJsonPath)).toBe(true);
    expect(existsSync(receiptMdPath)).toBe(true);

    const receipt = InvalidationReceiptSchema.parse(
      JSON.parse(await readFile(receiptJsonPath, 'utf8')),
    );
    expect(receipt.affected_sections).toEqual(['01-landscape']);
    expect(receipt.new_contract).toBe('span-first-extraction');
    expect(receipt.superseded_contract).toBe('authored-evidence-excerpt');
    expect(receipt.section_status_changes).toEqual([
      { section_id: '01-landscape', before: 'gated', after: 'draft' },
    ]);

    // research.yaml: section status reset, frozen_at remains null (was already null).
    const yaml = ResearchYamlSchema.parse(yamlParse(await readFile(yamlPath, 'utf8')));
    const sec01 = yaml.sections.find((s) => s.id === '01-landscape');
    expect(sec01?.status).toBe('draft');
    const sec02 = yaml.sections.find((s) => s.id === '02-other');
    expect(sec02?.status).toBe('draft');
  });

  it('archives pack-level downstream artifacts (audits/handoffs/synthesis) regardless of which section is affected', async () => {
    await setupPack();
    await writeLegacyClaim('01-landscape', 'clm_aaaaaaaaaaaa_heuristic_1');

    // Plant pack-level downstream artifacts.
    await mkdir(join(packPath, 'audits'), { recursive: true });
    await writeFile(join(packPath, 'audits', 'pack-audit.json'), '{}', 'utf8');
    await writeFile(join(packPath, 'audits', 'pack-audit.md'), '# pack audit', 'utf8');
    await mkdir(join(packPath, 'handoffs'), { recursive: true });
    await writeFile(join(packPath, 'handoffs', 'cowork-handoff.json'), '{}', 'utf8');
    await mkdir(join(packPath, 'synthesis'), { recursive: true });
    await writeFile(join(packPath, 'synthesis', 'cross-section-map.json'), '{}', 'utf8');

    const result = await invalidateExtraction({
      packPath,
      reason: 'span-first extraction contract replaces authored-evidence-excerpt',
    });

    expect(result.performed).toBe(true);
    // Originals gone from canonical locations.
    expect(existsSync(join(packPath, 'audits', 'pack-audit.json'))).toBe(false);
    expect(existsSync(join(packPath, 'handoffs', 'cowork-handoff.json'))).toBe(false);
    expect(existsSync(join(packPath, 'synthesis', 'cross-section-map.json'))).toBe(false);
    // All three are present in the archive.
    expect(existsSync(join(packPath, result.archiveDir!, 'audits', 'pack-audit.json'))).toBe(true);
    expect(existsSync(join(packPath, result.archiveDir!, 'handoffs', 'cowork-handoff.json'))).toBe(true);
    expect(existsSync(join(packPath, result.archiveDir!, 'synthesis', 'cross-section-map.json'))).toBe(true);
  });

  it('clears frozen_at when set, and records that on the receipt', async () => {
    await setupPack();
    const yamlPath = join(packPath, 'research.yaml');
    let text = await readFile(yamlPath, 'utf8');
    text = text.replace(/frozen_at: null/, 'frozen_at: "2026-05-06T00:00:00.000Z"');
    await writeFile(yamlPath, text, 'utf8');

    await writeLegacyClaim('01-landscape', 'clm_aaaaaaaaaaaa_heuristic_1');

    const result = await invalidateExtraction({
      packPath,
      reason: 'span-first extraction contract replaces authored-evidence-excerpt',
    });
    expect(result.performed).toBe(true);

    const yaml = ResearchYamlSchema.parse(yamlParse(await readFile(yamlPath, 'utf8')));
    expect(yaml.frozen_at).toBeNull();

    const receipt = InvalidationReceiptSchema.parse(
      JSON.parse(await readFile(join(packPath, result.archiveDir!, 'invalidation.json'), 'utf8')),
    );
    expect(receipt.frozen_at_cleared).toBe(true);
  });

  it('is idempotent — second run with no remaining legacy artifacts returns no-op', async () => {
    await setupPack();
    await writeLegacyClaim('01-landscape', 'clm_aaaaaaaaaaaa_heuristic_1');
    await invalidateExtraction({
      packPath,
      reason: 'span-first extraction contract replaces authored-evidence-excerpt',
    });
    const second = await invalidateExtraction({
      packPath,
      reason: 'span-first extraction contract replaces authored-evidence-excerpt',
    });
    expect(second.performed).toBe(false);
  });

  it('does NOT archive a span-first-only section', async () => {
    await setupPack();
    await writeSpanFirstClaim('01-landscape', 'clm_bbbbbbbbbbbb_heuristic_1');
    const result = await invalidateExtraction({
      packPath,
      reason: 'span-first extraction contract replaces authored-evidence-excerpt',
    });
    expect(result.performed).toBe(false);
  });
});
