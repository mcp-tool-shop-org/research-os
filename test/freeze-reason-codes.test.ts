import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
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
  FreezeRefusalPayloadSchema,
  type FreezeReasonCode,
} from '../src/freeze/schema.js';

// B-C-003 regression: each freeze refusal carries a stable `reason_code` on
// its structured reason_records[] entry. buildRefusalNextActions dispatches
// on reason_code instead of substring-matching prose. Legacy payloads
// without reason_code parse cleanly (additive-optional field).

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
    topic: 'B-C-003 freeze reason-codes regression',
    decision: 'Test reason-code stability',
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

  if (opts.decisionBrief !== undefined) {
    await writeFile(join(packPath, 'synthesis', 'decision-brief.md'), opts.decisionBrief, 'utf8');
  }
  if (opts.workingReport !== undefined) {
    await writeFile(join(packPath, 'synthesis', 'working-report.md'), opts.workingReport, 'utf8');
  }

  await audit({ packPath });
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'ro-bc003-test-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

function reasonCodes(payload: { reason_records: Array<{ reason_code?: string }> }): string[] {
  return payload.reason_records.map((r) => r.reason_code ?? '<absent>');
}

describe('B-C-003 — reason_code coverage across refusal types', () => {
  it('FREEZE_MISSING_REQUIRED_ARTIFACT fires when audit/handoff/synthesis are absent', async () => {
    const r = await init({
      topic: 'B-C-003 missing-artifacts case',
      outDir: workDir,
    });
    packPath = r.packPath;
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    const codes = reasonCodes(result.refusalPayload!);
    expect(codes).toContain('FREEZE_MISSING_REQUIRED_ARTIFACT');
  });

  it('FREEZE_MISSING_SYNTHESIS_ARTIFACT fires for missing synthesis files', async () => {
    const r = await init({
      topic: 'B-C-003 missing-synthesis case',
      outDir: workDir,
    });
    packPath = r.packPath;
    await sectionAdd({ id: '01-test', purpose: 'probe', packPath });
    await coworkHandoff({ packPath });
    await audit({ packPath });
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    const codes = reasonCodes(result.refusalPayload!);
    expect(codes).toContain('FREEZE_MISSING_SYNTHESIS_ARTIFACT');
  });

  it('FREEZE_UNKNOWN_CLAIM_CITED fires when synthesis cites a non-existent claim', async () => {
    await makeReadyToFreezePack({
      finalReport: '# Final\n\nCiting [claim:clm_deadbeefcafe_heuristic_1] which does not exist.',
    });
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    const codes = reasonCodes(result.refusalPayload!);
    expect(codes).toContain('FREEZE_UNKNOWN_CLAIM_CITED');
  });

  it('FREEZE_REPAIR_CLAIM_CITED fires when synthesis cites a repair/rejected claim', async () => {
    await makeReadyToFreezePack();
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
    const codes = reasonCodes(result.refusalPayload!);
    expect(codes).toContain('FREEZE_REPAIR_CLAIM_CITED');
  });

  it('FREEZE_FINAL_REPORT_NO_CITATIONS fires when final-report has no citations', async () => {
    await makeReadyToFreezePack({
      finalReport: '# Final\n\nProse without any claim citations whatsoever.',
    });
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    const codes = reasonCodes(result.refusalPayload!);
    expect(codes).toContain('FREEZE_FINAL_REPORT_NO_CITATIONS');
  });

  it('FREEZE_UNACCEPTED_CITED (Stage A C-002 territory) fires when synthesis cites a no-review-record claim', async () => {
    await makeReadyToFreezePack();
    // Add a claim with NO review record — neither in repair set nor in
    // accepted set. Then cite it. Should land on FREEZE_UNACCEPTED_CITED.
    await appendFile(
      join(packPath, 'sections', '01-test', 'claims.jsonl'),
      JSON.stringify({
        claim_id: 'clm_cccccccccccc_heuristic_1',
        section_id: '01-test',
        source_ids: ['src_aaaaaaaaaaaa'],
        source_hashes: ['a'.repeat(64)],
        asserts: 'no-review claim',
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
    // No review record for clm_cccccccccccc; it should be neither
    // repair-or-rejected nor accepted.
    await writeFile(
      join(packPath, 'synthesis', 'final-report.md'),
      '# Final\n\n[claim:clm_aaaaaaaaaaaa_heuristic_1] and [claim:clm_cccccccccccc_heuristic_1].',
      'utf8',
    );
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    const codes = reasonCodes(result.refusalPayload!);
    expect(codes).toContain('FREEZE_UNACCEPTED_CITED');
    // Verify the next-action was derived from the code, not prose-grep
    expect(
      result.refusalPayload!.next_actions.some((a) =>
        a.includes('unaccepted claims'),
      ),
    ).toBe(true);
  });
});

describe('B-C-003 — backward compat with legacy refusal payloads', () => {
  it('FreezeRefusalPayloadSchema parses a v0.6-shape payload (no reason_records)', () => {
    const legacy = {
      pack_id: 'abc123',
      pack_topic: 'legacy',
      checked_at: '2026-05-01T00:00:00.000Z',
      verdict: 'refused' as const,
      reasons: ['Some prose reason'],
      blocking_reasons: ['Some prose reason'],
      missing_artifacts: [],
      invalid_artifacts: [],
      next_actions: ['Re-run audit'],
      would_freeze: false as const,
    };
    const parsed = FreezeRefusalPayloadSchema.parse(legacy);
    // reason_records defaults to []
    expect(parsed.reason_records).toEqual([]);
  });
});

describe('B-C-003 — next_actions dispatch is code-based, not prose-based', () => {
  it('each emitted reason_code maps to a specific next-action via NEXT_ACTION_BY_CODE', async () => {
    await makeReadyToFreezePack({
      finalReport: '# Final\n\nCiting [claim:clm_deadbeefcafe_heuristic_1] which does not exist.',
    });
    const result = await freeze({ packPath });
    expect(result.verdict).toBe('refused');
    expect(
      result.refusalPayload!.next_actions.some((a) =>
        a.includes('claim_id that exists'),
      ),
    ).toBe(true);
  });
});

// Substring-match-elimination proof: read the freeze/run.ts source and assert
// buildRefusalNextActions contains zero `.includes(` calls inside its body
// (the forward-compat fallback uses a generic else branch — no substring
// match against prose).
describe('B-C-003 — substring-match-elimination grep proof', () => {
  it('buildRefusalNextActions body contains no .includes( calls (against prose)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src', 'freeze', 'run.ts'),
      'utf8',
    );
    // Slice the function body by anchor + brace counting (regex can't match
    // balanced braces).
    const anchor = 'function buildRefusalNextActions(';
    const startIdx = src.indexOf(anchor);
    expect(startIdx).toBeGreaterThanOrEqual(0);
    const openBraceIdx = src.indexOf('{', startIdx);
    let depth = 0;
    let endIdx = -1;
    for (let i = openBraceIdx; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    expect(endIdx).toBeGreaterThan(openBraceIdx);
    const body = src.slice(openBraceIdx, endIdx + 1);
    // String `.includes(` must not appear in the body — dispatch is via
    // `record.reason_code in NEXT_ACTION_BY_CODE`, not substring-match.
    const includesCount = (body.match(/\.includes\(/g) ?? []).length;
    expect(includesCount).toBe(0);
  });
});
