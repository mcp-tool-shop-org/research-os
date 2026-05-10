import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { handoff as coworkHandoff } from '../src/cowork/index.js';
import { workspace as synthWorkspace } from '../src/synth/index.js';
import { audit } from '../src/audit/index.js';
import { freeze } from '../src/freeze/index.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';
import {
  FreezeReceiptPayloadSchema,
  FreezeRefusalPayloadSchema,
} from '../src/freeze/schema.js';
import { PackNotFoundError } from '../src/errors.js';

let workDir: string;
let packPath: string;

interface PassFixtureOpts {
  finalReport?: string;
  decisionBrief?: string;
  workingReport?: string;
  acceptedClaimId?: string;
}

async function makeReadyToFreezePack(opts: PassFixtureOpts = {}): Promise<void> {
  const r = await init({
    topic: 'How does the freeze layer behave end-to-end across pass and refuse?',
    decision: 'Lock the freeze contract',
    outDir: workDir,
  });
  packPath = r.packPath;
  await sectionAdd({ id: '01-test', purpose: 'probe', packPath });

  const sourceId = 'src_aaaaaaaaaaaa';
  const claimId = opts.acceptedClaimId ?? 'clm_aaaaaaaaaaaa_heuristic_1';

  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  await writeFile(
    join(cardDir, `${sourceId}.json`),
    JSON.stringify({
      source_id: sourceId,
      receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1`,
      section_id: '01-test',
      url: 'https://example.com',
      final_url: 'https://example.com',
      fetched_at: '2026-05-06T22:00:00.000Z',
      publisher: 'p1',
      published_at: null,
      title: 'T',
      source_type: 'secondary',
      relevance: 'unknown',
      key_points: [],
      limitations: [],
      asserts: 'A',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-06T22:00:00.000Z',
    }),
    'utf8',
  );
  await appendFile(
    join(packPath, 'sections', '01-test', 'sources.jsonl'),
    JSON.stringify({ source_id: sourceId, added_at: '2026-05-06T22:00:01.000Z' }) + '\n',
    'utf8',
  );
  await appendFile(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    JSON.stringify({
      receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1`,
      source_id: sourceId,
      section_id: '01-test',
      requested_url: 'https://example.com',
      final_url: 'https://example.com',
      status: 200,
      status_text: 'OK',
      content_type: 'text/html',
      fetched_at: '2026-05-06T22:00:00.000Z',
      byte_count: 100,
      sha256: createHash('sha256').update(sourceId).digest('hex'),
      title: 'T',
      raw_text_path: null,
      fetch_outcome: 'ok',
      fetch_error: null,
      extraction_outcome: 'ok',
      extraction_extractor: 'heuristic',
      extraction_error: null,
    }) + '\n',
    'utf8',
  );

  await appendFile(
    join(packPath, 'sections', '01-test', 'claims.jsonl'),
    JSON.stringify({
      claim_id: claimId,
      section_id: '01-test',
      source_ids: [sourceId],
      source_hashes: ['a'.repeat(64)],
      asserts: 'something',
      scope: 'narrow',
      not: 'broad',
      evidence_excerpt: 'literal',
      evidence_location: null,
      confidence: 'low',
      extractor: 'heuristic',
      extraction_method: 'heuristic_key_point',
      created_at: '2026-05-06T22:00:00.000Z',
      review_state: 'candidate',
    }) + '\n',
    'utf8',
  );
  await appendFile(
    join(packPath, 'sections', '01-test', 'claim-reviews.jsonl'),
    JSON.stringify({
      claim_id: claimId,
      decision: 'accepted_for_synthesis',
      reason: 'test',
      finding_ids: [],
      reviewer: 'heuristic',
      review_method: 'heuristic_field_and_grounding_checks',
      created_at: '2026-05-06T22:00:01.000Z',
    }) + '\n',
    'utf8',
  );

  // Gate result (synthesis_eligible)
  const gate = {
    section_id: '01-test',
    verdict: 'pass',
    summary: 'mock',
    checked_at: '2026-05-06T22:00:00.000Z',
    synthesis_eligible: true,
    gate_results: [],
    failures: [],
    warnings: [],
    waivers_applied: [],
    blocking_reasons: [],
    claim_counts: { total: 1, candidate: 1, with_evidence_excerpt: 1, with_source_hashes: 1, with_scope: 1, with_not: 1, universal_scope_null: 0, orphans: 0 },
    source_counts: { total: 1, primary: 0, secondary: 1, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 1, failed_fetches: 0, section_primary: 0, section_independent_publishers: 1 },
    contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
    freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 0 },
    scope_integrity_summary: { universal_claims: 0, scoped_claims: 1, with_not_constraint: 1, overgen_risks_total: 0, overgen_risks_blocking: 0 },
    next_actions: [],
  };
  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(join(packPath, 'audits', '01-test-gate.json'), JSON.stringify(gate, null, 2), 'utf8');

  // Promote section to gated (so audit verdict can become ready_for_synthesis when review marks all accepted)
  const yamlPath = join(packPath, 'research.yaml');
  const research = ResearchYamlSchema.parse(yamlParse(await readFile(yamlPath, 'utf8')));
  research.sections[0]!.status = 'gated';
  await writeFile(yamlPath, yamlStringify(research, { lineWidth: 0 }), 'utf8');

  // Cowork handoff (will read the above and produce synthesis_ready)
  await coworkHandoff({ packPath });
  // Synthesis workspace
  await synthWorkspace({ packPath });
  // Audit
  await audit({ packPath });

  // Now write a final-report that cites the accepted claim
  const finalReport = opts.finalReport
    ?? `# Final Report\n\nThe accepted claim is [claim:${claimId}], which the pack supports.\n`;
  await writeFile(join(packPath, 'synthesis', 'final-report.md'), finalReport, 'utf8');

  if (opts.decisionBrief !== undefined) {
    await writeFile(join(packPath, 'synthesis', 'decision-brief.md'), opts.decisionBrief, 'utf8');
  }
  if (opts.workingReport !== undefined) {
    await writeFile(join(packPath, 'synthesis', 'working-report.md'), opts.workingReport, 'utf8');
  }

  // Re-run audit so pack-audit verdict reflects the now-ready state
  await audit({ packPath });
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-freeze-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('freeze (refusal paths)', () => {
  it('refuses when nothing has been done — no audit, no handoff, no synthesis', async () => {
    const r = await init({ topic: 'How does freeze refuse on a fresh pack?', outDir: workDir });
    packPath = r.packPath;
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    expect(result.refusalPayload?.would_freeze).toBe(false);
    expect(result.refusalPayload?.missing_artifacts).toContain('audits/pack-audit.json');
    expect(existsSync(join(packPath, 'audits', 'freeze-receipt.json'))).toBe(false);
  });

  it('writes freeze-refusal.{json,md} on refusal and does NOT mark the pack frozen', async () => {
    const r = await init({ topic: 'How does freeze write the refusal artifacts on refusal?', outDir: workDir });
    packPath = r.packPath;
    await freeze({ packPath });
    expect(existsSync(join(packPath, 'audits', 'freeze-refusal.json'))).toBe(true);
    expect(existsSync(join(packPath, 'audits', 'freeze-refusal.md'))).toBe(true);
    const yaml = ResearchYamlSchema.parse(yamlParse(await readFile(join(packPath, 'research.yaml'), 'utf8')));
    expect(yaml.frozen_at).toBeNull();
  });

  it('refuses when final-report cites an unknown claim_id', async () => {
    await makeReadyToFreezePack({
      finalReport: '# Final\n\nCiting [claim:clm_deadbeefcafe_heuristic_1] which does not exist.',
    });
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    expect(
      result.refusalPayload?.reasons.some((r) => /unknown claim_id/.test(r)),
    ).toBe(true);
  });

  it('refuses when final-report cites a repair/rejected claim', async () => {
    await makeReadyToFreezePack();
    // Now add a repair claim and cite it
    await appendFile(
      join(packPath, 'sections', '01-test', 'claims.jsonl'),
      JSON.stringify({
        claim_id: 'clm_bbbbbbbbbbbb_heuristic_1',
        section_id: '01-test',
        source_ids: ['src_aaaaaaaaaaaa'],
        source_hashes: ['a'.repeat(64)],
        asserts: 'second claim',
        scope: 'narrow',
        not: 'broad',
        evidence_excerpt: 'literal',
        evidence_location: null,
        confidence: 'low',
        extractor: 'heuristic',
        extraction_method: 'heuristic_key_point',
        created_at: '2026-05-06T22:00:00.000Z',
        review_state: 'candidate',
      }) + '\n',
      'utf8',
    );
    await appendFile(
      join(packPath, 'sections', '01-test', 'claim-reviews.jsonl'),
      JSON.stringify({
        claim_id: 'clm_bbbbbbbbbbbb_heuristic_1',
        decision: 'needs_source_repair',
        reason: 'test',
        finding_ids: [],
        reviewer: 'heuristic',
        review_method: 'heuristic_field_and_grounding_checks',
        created_at: '2026-05-06T22:00:01.000Z',
      }) + '\n',
      'utf8',
    );
    // Re-run cowork handoff + synth + audit + cite the repair claim in final-report
    await coworkHandoff({ packPath });
    await synthWorkspace({ packPath });
    await audit({ packPath });
    await writeFile(
      join(packPath, 'synthesis', 'final-report.md'),
      '# Final\n\n[claim:clm_aaaaaaaaaaaa_heuristic_1] and [claim:clm_bbbbbbbbbbbb_heuristic_1].',
      'utf8',
    );
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    expect(
      result.refusalPayload?.reasons.some((r) => /repair or rejected/.test(r)),
    ).toBe(true);
  });

  it('refuses when final-report has no citations even though accepted claims exist', async () => {
    await makeReadyToFreezePack({ finalReport: '# Final\n\nProse without any claim citations whatsoever.' });
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    expect(
      result.refusalPayload?.reasons.some((r) => /no \[claim:\.\.\.\] citations/.test(r)),
    ).toBe(true);
  });

  it('refuses when synthesis files are missing', async () => {
    const r = await init({ topic: 'Pack without synthesis files but with handoff and audit', outDir: workDir });
    packPath = r.packPath;
    await sectionAdd({ id: '01-test', purpose: 'probe', packPath });
    await coworkHandoff({ packPath });
    await audit({ packPath });
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    expect(result.refusalPayload?.missing_artifacts).toContain('synthesis/final-report.md');
  });

  it('rejects when pack does not exist', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'research-os-freeze-empty-'));
    try {
      await expect(freeze({ packPath: empty })).rejects.toBeInstanceOf(PackNotFoundError);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('refusal next_actions are concrete and non-empty', async () => {
    const r = await init({ topic: 'How does freeze produce next-actions on refusal?', outDir: workDir });
    packPath = r.packPath;
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    expect(result.refusalPayload?.next_actions.length).toBeGreaterThan(0);
  });

  it('refusal payload schema-validates', async () => {
    const r = await init({ topic: 'How does freeze refusal payload validate against the schema?', outDir: workDir });
    packPath = r.packPath;
    await freeze({ packPath });
    const json = JSON.parse(await readFile(join(packPath, 'audits', 'freeze-refusal.json'), 'utf8'));
    expect(() => FreezeRefusalPayloadSchema.parse(json)).not.toThrow();
  });
});

describe('freeze (pass path)', () => {
  it('writes freeze-receipt.{json,md} when all conditions are met and marks pack frozen', async () => {
    await makeReadyToFreezePack();
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('frozen');
    expect(result.receiptPayload?.verdict).toBe('frozen');
    expect(existsSync(join(packPath, 'audits', 'freeze-receipt.json'))).toBe(true);
    expect(existsSync(join(packPath, 'audits', 'freeze-receipt.md'))).toBe(true);
    const yaml = ResearchYamlSchema.parse(yamlParse(await readFile(join(packPath, 'research.yaml'), 'utf8')));
    expect(yaml.frozen_at).not.toBeNull();
    expect(yaml.sections[0]?.status).toBe('frozen');
  });

  it('receipt payload schema-validates and includes canonical artifact fingerprints', async () => {
    await makeReadyToFreezePack();
    const result = await freeze({ packPath });
    if (result.verdict !== 'frozen') throw new Error('expected frozen');
    const json = JSON.parse(await readFile(result.jsonPath, 'utf8'));
    const parsed = FreezeReceiptPayloadSchema.parse(json);
    expect(parsed.canonical_artifact_hashes.length).toBeGreaterThan(0);
    expect(parsed.synthesis_hashes.length).toBe(5);
    for (const h of parsed.canonical_artifact_hashes) {
      expect(h.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('does not mutate canonical claim/source/review artifacts on pass', async () => {
    await makeReadyToFreezePack();
    const claimsPath = join(packPath, 'sections', '01-test', 'claims.jsonl');
    const reviewsPath = join(packPath, 'sections', '01-test', 'claim-reviews.jsonl');
    const cardPath = join(packPath, 'evidence', 'source-cards', 'src_aaaaaaaaaaaa.json');
    const beforeClaims = await readFile(claimsPath, 'utf8');
    const beforeReviews = await readFile(reviewsPath, 'utf8');
    const beforeCard = await readFile(cardPath, 'utf8');
    await freeze({ packPath });
    expect(await readFile(claimsPath, 'utf8')).toBe(beforeClaims);
    expect(await readFile(reviewsPath, 'utf8')).toBe(beforeReviews);
    expect(await readFile(cardPath, 'utf8')).toBe(beforeCard);
  });

  it('removes any stale freeze-refusal artifact on pass', async () => {
    await makeReadyToFreezePack();
    // Plant a stale refusal first
    await writeFile(join(packPath, 'audits', 'freeze-refusal.json'), '{}', 'utf8');
    await writeFile(join(packPath, 'audits', 'freeze-refusal.md'), 'stale', 'utf8');
    await freeze({ packPath });
    expect(existsSync(join(packPath, 'audits', 'freeze-refusal.json'))).toBe(false);
    expect(existsSync(join(packPath, 'audits', 'freeze-refusal.md'))).toBe(false);
  });

  it('removes any stale freeze-receipt artifact on refusal', async () => {
    const r = await init({ topic: 'How does freeze clean up stale receipts on refusal?', outDir: workDir });
    packPath = r.packPath;
    await mkdir(join(packPath, 'audits'), { recursive: true });
    await writeFile(join(packPath, 'audits', 'freeze-receipt.json'), '{}', 'utf8');
    await writeFile(join(packPath, 'audits', 'freeze-receipt.md'), 'stale', 'utf8');
    await freeze({ packPath });
    expect(existsSync(join(packPath, 'audits', 'freeze-receipt.json'))).toBe(false);
    expect(existsSync(join(packPath, 'audits', 'freeze-receipt.md'))).toBe(false);
  });
});
