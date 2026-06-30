import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { handoff as coworkHandoff } from '../../src/cowork/index.js';
import { workspace as synthWorkspace } from '../../src/synth/index.js';
import { audit } from '../../src/audit/index.js';
import { freeze } from '../../src/freeze/index.js';
import { ResearchYamlSchema } from '../../src/intake/schema.js';

let workDir: string;
let packPath: string;

interface PassFixtureOpts {
  finalReport?: string;
}

// Builds a pack that freezes cleanly. Mirrors test/freeze-run.ts's fixture so
// the Stage-A regressions can mutate the clean baseline and assert the new
// refusals fire, while the unmodified baseline still PASSES (both halves).
async function makeReadyToFreezePack(opts: PassFixtureOpts = {}): Promise<void> {
  const r = await init({
    topic: 'How does the freeze integrity layer behave under malformed inputs?',
    decision: 'Lock the freeze integrity contract',
    outDir: workDir,
  });
  packPath = r.packPath;
  await sectionAdd({ id: '01-test', purpose: 'probe', packPath });

  const sourceId = 'src_aaaaaaaaaaaa';
  const claimId = 'clm_aaaaaaaaaaaa_heuristic_1';

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

  const yamlPath = join(packPath, 'research.yaml');
  const research = ResearchYamlSchema.parse(yamlParse(await readFile(yamlPath, 'utf8')));
  research.sections[0]!.status = 'gated';
  await writeFile(yamlPath, yamlStringify(research, { lineWidth: 0 }), 'utf8');

  await coworkHandoff({ packPath });
  await synthWorkspace({ packPath });
  await audit({ packPath });

  const finalReport = opts.finalReport
    ?? `# Final Report\n\nThe accepted claim is [claim:${claimId}], which the pack supports.\n`;
  await writeFile(join(packPath, 'synthesis', 'final-report.md'), finalReport, 'utf8');

  await audit({ packPath });
}

const reviewsPath = () => join(packPath, 'sections', '01-test', 'claim-reviews.jsonl');

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-freeze-integrity-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('A-FREEZE: freeze integrity invariants', () => {
  // Good-half: the unmodified clean baseline still PASSES. Guards against an
  // over-broad fix that would refuse on a healthy pack.
  it('a clean pack still FREEZES (good half)', async () => {
    await makeReadyToFreezePack();
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('frozen');
    expect(result.refusalPayload).toBeNull();
  });

  // A-FREEZE-001: a malformed (corrupt-but-uncited) live claim-reviews.jsonl
  // line is pushed to invalidArtifacts AFTER the canonical-artifact conversion
  // loop. Before the fix it was swallowed and the pack froze; now it must
  // refuse with FREEZE_MALFORMED_ARTIFACT.
  it('A-FREEZE-001: refuses on a malformed live claim-reviews.jsonl line', async () => {
    await makeReadyToFreezePack();
    // Append a corrupt JSONL line that is never cited anywhere.
    await appendFile(reviewsPath(), '{ this is not valid json\n', 'utf8');
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    expect(
      result.refusalPayload?.reason_records.some(
        (rr) => rr.reason_code === 'FREEZE_MALFORMED_ARTIFACT',
      ),
    ).toBe(true);
    expect(
      result.refusalPayload?.invalid_artifacts.some((ia) =>
        ia.path.includes('claim-reviews.jsonl'),
      ),
    ).toBe(true);
  });

  // A-FREEZE-001 (claims): a malformed live claims.jsonl line must also refuse.
  it('A-FREEZE-001: refuses on a malformed live claims.jsonl line', async () => {
    await makeReadyToFreezePack();
    await appendFile(
      join(packPath, 'sections', '01-test', 'claims.jsonl'),
      'not-json-at-all{{\n',
      'utf8',
    );
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    expect(
      result.refusalPayload?.reason_records.some(
        (rr) => rr.reason_code === 'FREEZE_MALFORMED_ARTIFACT',
      ),
    ).toBe(true);
  });

  // A-FREEZE-002: two review rows for the same claim_id at the SAME created_at
  // disagree on decision. The latest-decision-wins tie-breaker is undefined;
  // freeze must refuse (it previously resolved by line order and emitted a
  // receipt pack publish would reject).
  it('A-FREEZE-002: refuses on same-timestamp conflicting review decisions', async () => {
    await makeReadyToFreezePack();
    // Conflicting row for the accepted claim, SAME created_at as the original.
    await appendFile(
      reviewsPath(),
      JSON.stringify({
        claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
        decision: 'rejected',
        reason: 'conflict at same ms',
        finding_ids: [],
        reviewer: 'heuristic',
        review_method: 'heuristic_field_and_grounding_checks',
        created_at: '2026-05-06T22:00:01.000Z',
      }) + '\n',
      'utf8',
    );
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    expect(
      result.refusalPayload?.reason_records.some(
        (rr) => rr.reason_code === 'FREEZE_INCOMPATIBLE_REVIEW_DECISIONS',
      ),
    ).toBe(true);
  });

  // A-FREEZE-003: a malformed [claim:...] citation (id not a well-formed
  // claim_id) previously passed every refusal filter and was written verbatim
  // into cited_claim_ids. Now it must refuse AND never reach the receipt.
  it('A-FREEZE-003: refuses on a malformed [claim:...] citation', async () => {
    await makeReadyToFreezePack({
      finalReport:
        '# Final\n\nThe claim is [claim:clm_aaaaaaaaaaaa_heuristic_1] and also [claim:see-above].\n',
    });
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    expect(
      result.refusalPayload?.reason_records.some(
        (rr) => rr.reason_code === 'FREEZE_MALFORMED_CITATION',
      ),
    ).toBe(true);
    // The malformed id must never appear in the (refusal) payload's cited list
    // — there is no cited_claim_ids on a refusal, but the receipt is the thing
    // we are protecting; assert no receipt was emitted.
    expect(result.receiptPayload).toBeNull();
  });
});
