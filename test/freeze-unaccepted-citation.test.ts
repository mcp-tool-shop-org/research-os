import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { handoff as coworkHandoff } from '../src/cowork/index.js';
import { workspace as synthWorkspace } from '../src/synth/index.js';
import { audit } from '../src/audit/index.js';
import { freeze } from '../src/freeze/index.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';

// ---------------------------------------------------------------------------
// C-002: cite-allowed = accepted only. A claim that exists in claims.jsonl
// but has NO review record (or has a non-terminal decision such as
// `candidate`) must NOT be citable in a frozen pack.
// ---------------------------------------------------------------------------

let workDir: string;
let packPath: string;

interface ReadyPackOpts {
  finalReport?: string;
  extraUnreviewedClaimId?: string;
  extraAcceptedClaimId?: string;
}

async function makeReadyToFreezePack(opts: ReadyPackOpts = {}): Promise<void> {
  const r = await init({
    topic: 'C-002 freeze cite-allowed = accepted only',
    decision: 'Lock cite-allowed = accepted only',
    outDir: workDir,
  });
  packPath = r.packPath;
  await sectionAdd({ id: '01-c002', purpose: 'probe', packPath });

  const sourceId = 'src_aaaaaaaaaaaa';
  const acceptedClaimId = 'clm_aaaaaaaaaaaa_heuristic_1';

  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  await writeFile(
    join(cardDir, `${sourceId}.json`),
    JSON.stringify({
      source_id: sourceId,
      receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1`,
      section_id: '01-c002',
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
    join(packPath, 'sections', '01-c002', 'sources.jsonl'),
    JSON.stringify({ source_id: sourceId, added_at: '2026-05-06T22:00:01.000Z' }) + '\n',
    'utf8',
  );
  await appendFile(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    JSON.stringify({
      receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1`,
      source_id: sourceId,
      section_id: '01-c002',
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
    join(packPath, 'sections', '01-c002', 'claims.jsonl'),
    JSON.stringify({
      claim_id: acceptedClaimId,
      section_id: '01-c002',
      source_ids: [sourceId],
      source_hashes: ['a'.repeat(64)],
      asserts: 'baseline claim',
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
    join(packPath, 'sections', '01-c002', 'claim-reviews.jsonl'),
    JSON.stringify({
      claim_id: acceptedClaimId,
      decision: 'accepted_for_synthesis',
      reason: 'test',
      finding_ids: [],
      reviewer: 'heuristic',
      review_method: 'heuristic_field_and_grounding_checks',
      created_at: '2026-05-06T22:00:01.000Z',
    }) + '\n',
    'utf8',
  );

  const gate = {
    section_id: '01-c002',
    verdict: 'pass',
    summary: 'mock',
    checked_at: '2026-05-06T22:00:00.000Z',
    synthesis_eligible: true,
    gate_results: [],
    failures: [],
    warnings: [],
    waivers_applied: [],
    blocking_reasons: [],
    claim_counts: {
      total: 1,
      candidate: 1,
      with_evidence_excerpt: 1,
      with_source_hashes: 1,
      with_scope: 1,
      with_not: 1,
      universal_scope_null: 0,
      orphans: 0,
    },
    source_counts: {
      total: 1,
      primary: 0,
      secondary: 1,
      forum: 0,
      benchmark: 0,
      docs: 0,
      unknown: 0,
      independent_publishers: 1,
      failed_fetches: 0,
      section_primary: 0,
      section_independent_publishers: 1,
    },
    contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
    freshness_summary: {
      policy_required: false,
      max_source_age_months: null,
      stale_source_policy: 'warn',
      stale_count: 0,
      unknown_date_count: 0,
    },
    scope_integrity_summary: {
      universal_claims: 0,
      scoped_claims: 1,
      with_not_constraint: 1,
      overgen_risks_total: 0,
      overgen_risks_blocking: 0,
    },
    next_actions: [],
  };
  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(
    join(packPath, 'audits', '01-c002-gate.json'),
    JSON.stringify(gate, null, 2),
    'utf8',
  );

  const yamlPath = join(packPath, 'research.yaml');
  const research = ResearchYamlSchema.parse(yamlParse(await readFile(yamlPath, 'utf8')));
  research.sections[0]!.status = 'gated';
  await writeFile(yamlPath, yamlStringify(research, { lineWidth: 0 }), 'utf8');

  await coworkHandoff({ packPath });
  await synthWorkspace({ packPath });
  await audit({ packPath });

  if (opts.extraUnreviewedClaimId) {
    await appendFile(
      join(packPath, 'sections', '01-c002', 'claims.jsonl'),
      JSON.stringify({
        claim_id: opts.extraUnreviewedClaimId,
        section_id: '01-c002',
        source_ids: [sourceId],
        source_hashes: ['a'.repeat(64)],
        asserts: 'unreviewed claim',
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
  }
  if (opts.extraAcceptedClaimId) {
    await appendFile(
      join(packPath, 'sections', '01-c002', 'claims.jsonl'),
      JSON.stringify({
        claim_id: opts.extraAcceptedClaimId,
        section_id: '01-c002',
        source_ids: [sourceId],
        source_hashes: ['a'.repeat(64)],
        asserts: 'extra accepted claim',
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
      join(packPath, 'sections', '01-c002', 'claim-reviews.jsonl'),
      JSON.stringify({
        claim_id: opts.extraAcceptedClaimId,
        decision: 'accepted_for_synthesis',
        reason: 'test',
        finding_ids: [],
        reviewer: 'heuristic',
        review_method: 'heuristic_field_and_grounding_checks',
        created_at: '2026-05-06T22:00:02.000Z',
      }) + '\n',
      'utf8',
    );
  }

  const finalReport =
    opts.finalReport ??
    `# Final Report\n\nThe accepted claim is [claim:${acceptedClaimId}], which the pack supports.\n`;
  await writeFile(join(packPath, 'synthesis', 'final-report.md'), finalReport, 'utf8');

  await audit({ packPath });
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-freeze-c002-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('freeze: cite-allowed = accepted only (C-002)', () => {
  it('REFUSES when final-report cites a claim that exists in claims.jsonl but has NO review record', async () => {
    const unreviewedId = 'clm_cccccccccccc_heuristic_1';
    await makeReadyToFreezePack({
      extraUnreviewedClaimId: unreviewedId,
      finalReport:
        '# Final\n\nBaseline: [claim:clm_aaaaaaaaaaaa_heuristic_1].\nUnreviewed (must refuse): [claim:' +
        unreviewedId +
        '].\n',
    });
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    const reasons = result.refusalPayload?.reasons ?? [];
    expect(
      reasons.some((r) => /no acceptance decision/.test(r)),
    ).toBe(true);
    expect(
      reasons.some((r) => r.includes(unreviewedId)),
    ).toBe(true);
    expect(
      reasons.some((r) => /unknown claim_id/.test(r) && r.includes(unreviewedId)),
    ).toBe(false);
  });

  it('ACCEPTS when the same claim has an accepted review record (positive control)', async () => {
    const extraAcceptedId = 'clm_dddddddddddd_heuristic_1';
    await makeReadyToFreezePack({
      extraAcceptedClaimId: extraAcceptedId,
      finalReport:
        '# Final\n\nBaseline: [claim:clm_aaaaaaaaaaaa_heuristic_1].\nExtra accepted: [claim:' +
        extraAcceptedId +
        '].\n',
    });
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('frozen');
    expect(result.receiptPayload?.cited_claim_ids).toContain(extraAcceptedId);
  });

  it('REGRESSION: still refuses on unknown claim_id (existing refusal preserved)', async () => {
    await makeReadyToFreezePack({
      finalReport:
        '# Final\n\nBaseline: [claim:clm_aaaaaaaaaaaa_heuristic_1].\nUnknown: [claim:clm_deadbeefcafe_heuristic_1].\n',
    });
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    expect(
      result.refusalPayload?.reasons.some((r) => /unknown claim_id/.test(r)),
    ).toBe(true);
  });

  it('REGRESSION: still refuses on repair/rejected claim citation (existing refusal preserved)', async () => {
    const repairId = 'clm_eeeeeeeeeeee_heuristic_1';
    await makeReadyToFreezePack();
    await appendFile(
      join(packPath, 'sections', '01-c002', 'claims.jsonl'),
      JSON.stringify({
        claim_id: repairId,
        section_id: '01-c002',
        source_ids: ['src_aaaaaaaaaaaa'],
        source_hashes: ['a'.repeat(64)],
        asserts: 'repair claim',
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
      join(packPath, 'sections', '01-c002', 'claim-reviews.jsonl'),
      JSON.stringify({
        claim_id: repairId,
        decision: 'needs_source_repair',
        reason: 'test',
        finding_ids: [],
        reviewer: 'heuristic',
        review_method: 'heuristic_field_and_grounding_checks',
        created_at: '2026-05-06T22:00:03.000Z',
      }) + '\n',
      'utf8',
    );
    await coworkHandoff({ packPath });
    await synthWorkspace({ packPath });
    await audit({ packPath });
    await writeFile(
      join(packPath, 'synthesis', 'final-report.md'),
      '# Final\n\n[claim:clm_aaaaaaaaaaaa_heuristic_1] and [claim:' + repairId + '].',
      'utf8',
    );
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    expect(
      result.refusalPayload?.reasons.some((r) => /repair or rejected/.test(r)),
    ).toBe(true);
    expect(
      result.refusalPayload?.reasons.some(
        (r) => /no acceptance decision/.test(r) && r.includes(repairId),
      ),
    ).toBe(false);
  });
});
