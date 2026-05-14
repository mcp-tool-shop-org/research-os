/**
 * v0.9 Slice 2c — drafter retry + cross_section_answer_support_missing
 * integration tests.
 *
 * Covers the failure mode the prior session flagged as missing: a fake
 * drafter client that DISOBEYS the cross-section rule. The orchestrator
 * should:
 *   - Detect via validator after the first call
 *   - Retry once with a strengthened addendum
 *   - On persistent failure: emit cross_section_answer_support_missing
 *     proseError, write the failure marker, leave prose null
 *
 * Also covers the success retry path: disobedient on call 1, obedient on
 * call 2 → prose admitted with no proseError.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { handoff as coworkHandoff } from '../src/cowork/index.js';
import { partialPackSynthesis } from '../src/synth/index.js';
import type { ProseCallToolClient } from '../src/synth/prose/types.js';

let workDir: string;
let packPath: string;

const SECTION_A = '01-section-a';
const SECTION_B = '02-section-b';
const SECTION_BLOCKED = '03-blocked';

/**
 * Disobeying client: ALWAYS returns an answer paragraph citing ONLY Section A,
 * even with the required-bundle prompt in front of it. Used to exercise the
 * validator + retry + proseError path.
 *
 * After two calls of this output, the orchestrator must emit
 * `cross_section_answer_support_missing` and write a null prose block.
 */
function makeAlwaysDisobeyingClient(): { client: ProseCallToolClient; callCount: () => number } {
  let calls = 0;
  const client: ProseCallToolClient = {
    async callTool(params) {
      calls += 1;
      const args = params.arguments as Record<string, unknown>;
      const text = typeof args.text === 'string' ? args.text : '';
      // Find Section A's IDs from the rendered prompt.
      const allIds = Array.from(
        new Set((text.match(/\[(\d{2}-[a-z0-9-]+:p\d+)\]/g) ?? []).map((m) => m.slice(1, -1))),
      );
      const sectionAIds = allIds.filter((id) => id.startsWith(`${SECTION_A}:`));
      // Always cite ONLY Section A on the answer paragraph.
      const data = {
        paragraphs: [
          {
            role: 'answer',
            text: 'Disobedient answer paragraph citing only Section A.',
            section_paragraph_ids: [sectionAIds[0] ?? `${SECTION_A}:p1`],
          },
        ],
      };
      return {
        content: [
          { type: 'text', text: JSON.stringify({ result: { ok: true, data } }) },
        ],
      };
    },
  };
  return { client, callCount: () => calls };
}

/**
 * Eventually-obeying client: disobeys on call 1, obeys on call 2.
 * Used to verify the retry path admits the corrected output.
 */
function makeRetryRecoverClient(): { client: ProseCallToolClient; callCount: () => number } {
  let calls = 0;
  const client: ProseCallToolClient = {
    async callTool(params) {
      calls += 1;
      const args = params.arguments as Record<string, unknown>;
      const text = typeof args.text === 'string' ? args.text : '';
      const allIds = Array.from(
        new Set((text.match(/\[(\d{2}-[a-z0-9-]+:p\d+)\]/g) ?? []).map((m) => m.slice(1, -1))),
      );
      const sectionAIds = allIds.filter((id) => id.startsWith(`${SECTION_A}:`));
      const sectionBIds = allIds.filter((id) => id.startsWith(`${SECTION_B}:`));

      if (calls === 1) {
        // Disobey first call.
        const data = {
          paragraphs: [
            {
              role: 'answer',
              text: 'Disobedient first attempt.',
              section_paragraph_ids: [sectionAIds[0] ?? `${SECTION_A}:p1`],
            },
          ],
        };
        return {
          content: [
            { type: 'text', text: JSON.stringify({ result: { ok: true, data } }) },
          ],
        };
      }
      // Obey on retry: cite BOTH sections (the required-bundle IDs are
      // surfaced in the prompt under "REQUIRED ANSWER SUPPORT BUNDLE").
      // Extract them so we cite exactly the required set.
      const bundleSection = text.split('===== REQUIRED ANSWER SUPPORT BUNDLE =====')[1] ?? '';
      const requiredIds = Array.from(
        new Set(
          (bundleSection.match(/\b(\d{2}-[a-z0-9-]+:p\d+)\b/g) ?? [])
            // Take only IDs that appear BEFORE the next "=====" marker.
            .filter((_, i) => true),
        ),
      ).slice(0, 2);
      const idsToCite = requiredIds.length >= 2
        ? requiredIds
        : [sectionAIds[0] ?? `${SECTION_A}:p1`, sectionBIds[0] ?? `${SECTION_B}:p1`];
      const data = {
        paragraphs: [
          {
            role: 'answer',
            text: 'Obedient retry citing both sections per required bundle.',
            section_paragraph_ids: idsToCite,
          },
          {
            role: 'evidence',
            text: 'Evidence drawing from Section A.',
            section_paragraph_ids: [sectionAIds[0] ?? `${SECTION_A}:p1`],
          },
        ],
      };
      return {
        content: [
          { type: 'text', text: JSON.stringify({ result: { ok: true, data } }) },
        ],
      };
    },
  };
  return { client, callCount: () => calls };
}

async function buildMultiSectionFixture(): Promise<void> {
  const r = await init({
    topic: 'Retry-path regression fixture for partial-pack',
    outDir: workDir,
  });
  packPath = r.packPath;
  await sectionAdd({ id: SECTION_A, purpose: 'Purpose of section A', packPath });
  await sectionAdd({ id: SECTION_B, purpose: 'Purpose of section B', packPath });
  await sectionAdd({ id: SECTION_BLOCKED, purpose: 'Blocked', packPath });

  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });

  for (const [section, srcId, pub] of [
    [SECTION_A, 'src_aaaaaaaaaaaa', 'Pub A'] as const,
    [SECTION_B, 'src_bbbbbbbbbbbb', 'Pub B'] as const,
  ]) {
    await writeFile(
      join(cardDir, `${srcId}.json`),
      JSON.stringify({
        source_id: srcId,
        receipt_id: `rcpt_${srcId.slice(4)}_1`,
        section_id: section,
        url: `https://example.com/${srcId}`,
        final_url: `https://example.com/${srcId}`,
        fetched_at: '2026-05-13T00:00:00.000Z',
        publisher: pub,
        published_at: null,
        title: `Title for ${srcId}`,
        source_type: 'docs',
        relevance: 'high',
        key_points: ['x'],
        limitations: [],
        asserts: 'fixture',
        scope: null,
        not: null,
        extracted_by: 'heuristic',
        extracted_at: '2026-05-13T00:00:00.000Z',
      }),
      'utf8',
    );
    await appendFile(
      join(packPath, 'sections', section, 'sources.jsonl'),
      JSON.stringify({ source_id: srcId, added_at: '2026-05-13T00:00:00.000Z' }) + '\n',
      'utf8',
    );
    await appendFile(
      join(packPath, 'evidence', 'fetch-log.jsonl'),
      JSON.stringify({
        receipt_id: `rcpt_${srcId.slice(4)}_1`,
        source_id: srcId,
        section_id: section,
        requested_url: `https://example.com/${srcId}`,
        final_url: `https://example.com/${srcId}`,
        status: 200,
        status_text: 'OK',
        content_type: 'text/html',
        fetched_at: '2026-05-13T00:00:00.000Z',
        byte_count: 100,
        sha256: createHash('sha256').update(srcId).digest('hex'),
        title: `Title for ${srcId}`,
        raw_text_path: `evidence/raw/${srcId}.html`,
        fetch_outcome: 'ok',
        fetch_error: null,
        extraction_outcome: 'ok',
        extraction_extractor: 'heuristic',
        extraction_error: null,
      }) + '\n',
      'utf8',
    );

    const claimId = `clm_${srcId.slice(4)}_heuristic_1`;
    await appendFile(
      join(packPath, 'sections', section, 'claims.jsonl'),
      JSON.stringify({
        claim_id: claimId,
        section_id: section,
        source_ids: [srcId],
        source_hashes: ['a'.repeat(64)],
        asserts: `Claim for ${section}`,
        scope: 's',
        not: 'n',
        evidence_excerpt: 'x',
        evidence_location: null,
        confidence: 'medium',
        extractor: 'heuristic',
        extraction_method: 'heuristic_key_point',
        created_at: '2026-05-13T00:00:00.000Z',
        review_state: 'candidate',
      }) + '\n',
      'utf8',
    );
    await appendFile(
      join(packPath, 'sections', section, 'claim-reviews.jsonl'),
      JSON.stringify({
        claim_id: claimId,
        decision: 'accepted_for_synthesis',
        reason: 'fixture',
        finding_ids: [],
        reviewer: 'heuristic',
        review_method: 'heuristic_field_and_grounding_checks',
        created_at: '2026-05-13T00:00:01.000Z',
      }) + '\n',
      'utf8',
    );

    const synthDir = join(packPath, 'sections', section, 'synthesis');
    await mkdir(synthDir, { recursive: true });
    await writeFile(
      join(synthDir, 'section-synthesis.json'),
      JSON.stringify({
        status: 'partial_synthesis',
        section_id: section,
        section_purpose: `Purpose of ${section}`,
        prose: {
          paragraphs: [
            {
              paragraph_id: 'p1',
              role: 'answer',
              text: `Answer paragraph from ${section}.`,
              verifier_decision: 'faithful',
              support_bundle: { claim_ids: [claimId], source_card_ids: [srcId], waiver_ids: [], thin_evidence: false },
            },
          ],
        },
      }),
      'utf8',
    );
    await writeFile(join(synthDir, 'section-brief.md'), '# brief\n', 'utf8');

    await mkdir(join(packPath, 'audits'), { recursive: true });
    await writeFile(
      join(packPath, 'audits', `${section}-gate.json`),
      JSON.stringify({
        section_id: section,
        verdict: 'pass',
        summary: 'fixture',
        checked_at: '2026-05-13T00:00:02.000Z',
        synthesis_eligible: true,
        gate_results: [],
        failures: [],
        warnings: [],
        waivers_applied: [],
        blocking_reasons: [],
        claim_counts: { total: 1, candidate: 0, with_evidence_excerpt: 1, with_source_hashes: 1, with_scope: 1, with_not: 1, universal_scope_null: 0, orphans: 0 },
        source_counts: { total: 1, primary: 0, secondary: 0, forum: 0, benchmark: 0, docs: 1, unknown: 0, independent_publishers: 1, failed_fetches: 0, section_primary: 0, section_independent_publishers: 1 },
        contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
        freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 1 },
        scope_integrity_summary: { universal_claims: 0, scoped_claims: 1, with_not_constraint: 1, overgen_risks_total: 0, overgen_risks_blocking: 0 },
        next_actions: [],
      }, null, 2),
      'utf8',
    );
  }

  await writeFile(
    join(packPath, 'audits', `${SECTION_BLOCKED}-gate.json`),
    JSON.stringify({
      section_id: SECTION_BLOCKED,
      verdict: 'blocked',
      summary: 'fixture',
      checked_at: '2026-05-13T00:00:02.000Z',
      synthesis_eligible: false,
      gate_results: [],
      failures: [{ family: 'accepted_claim_floor', check: 'min_accepted_claims', status: 'fail', detail: '0/3', evidence: [], blocks_synthesis: true }],
      warnings: [],
      waivers_applied: [],
      blocking_reasons: ['accepted_claim_floor.min_accepted_claims: 0/3'],
      claim_counts: { total: 0, candidate: 0, with_evidence_excerpt: 0, with_source_hashes: 0, with_scope: 0, with_not: 0, universal_scope_null: 0, orphans: 0 },
      source_counts: { total: 0, primary: 0, secondary: 0, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 0, failed_fetches: 0, section_primary: 0, section_independent_publishers: 0 },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 0 },
      scope_integrity_summary: { universal_claims: 0, scoped_claims: 0, with_not_constraint: 0, overgen_risks_total: 0, overgen_risks_blocking: 0 },
      next_actions: [],
    }, null, 2),
    'utf8',
  );
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'ros-partial-pack-retry-'));
  await buildMultiSectionFixture();
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('partial-pack drafter retry path (Slice 2c)', () => {
  it('retries once and admits the corrected output when the second call obeys', async () => {
    await coworkHandoff({ packPath });
    const { client, callCount } = makeRetryRecoverClient();

    const result = await partialPackSynthesis({ packPath, mcpClient: client });

    expect(callCount()).toBe(2);
    expect(result.proseGenerated).toBe(true);
    expect(result.proseError).toBeNull();

    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const prose = artifact.prose as { paragraphs: Array<Record<string, unknown>> };
    const answer = prose.paragraphs[0]!;
    const support = answer.support_bundle as Record<string, unknown>;
    const sectionIds = new Set(support.section_ids as string[]);
    expect(sectionIds.size).toBeGreaterThanOrEqual(2);
    expect(sectionIds.has(SECTION_A)).toBe(true);
    expect(sectionIds.has(SECTION_B)).toBe(true);
  });

  it('emits cross_section_answer_support_missing after two disobedient calls', async () => {
    await coworkHandoff({ packPath });
    const { client, callCount } = makeAlwaysDisobeyingClient();

    const result = await partialPackSynthesis({ packPath, mcpClient: client });

    expect(callCount()).toBe(2);
    expect(result.proseGenerated).toBe(false);
    expect(result.proseError).toBeTruthy();

    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    expect(artifact.prose).toBeNull();
    const proseError = artifact.proseError as Record<string, unknown>;
    expect(proseError.code).toBe('cross_section_answer_support_missing');

    const required = proseError.required_section_paragraph_ids as string[];
    const observed = proseError.observed_section_paragraph_ids as string[];
    expect(required.length).toBeGreaterThanOrEqual(2);
    // Observed bundle came from the disobedient final attempt (single section).
    expect(observed.length).toBeLessThan(required.length);
  });

  it('failure-marker Markdown discloses required vs observed bundles', async () => {
    await coworkHandoff({ packPath });
    const { client } = makeAlwaysDisobeyingClient();
    const result = await partialPackSynthesis({ packPath, mcpClient: client });
    const md = await readFile(result.markdownPath, 'utf8');

    expect(md).toMatch(/cross_section_answer_support_missing/);
    expect(md).toMatch(/Required answer support bundle/);
    expect(md).toMatch(/Observed answer support bundle/);
    // Freezable/Publishable invariants still hold even when prose generation fails.
    expect(md).toMatch(/Freezable:\*\*\s*no/);
    expect(md).toMatch(/Publishable:\*\*\s*no/);
  });

  it('required_answer_bundle is populated in the artifact for ≥2 included sections', async () => {
    await coworkHandoff({ packPath });
    const { client } = makeRetryRecoverClient();
    const result = await partialPackSynthesis({ packPath, mcpClient: client });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    expect(artifact.required_answer_bundle).not.toBeNull();
    const bundle = artifact.required_answer_bundle as Record<string, unknown>;
    expect((bundle.required_section_ids as string[]).length).toBeGreaterThanOrEqual(2);
  });
});
