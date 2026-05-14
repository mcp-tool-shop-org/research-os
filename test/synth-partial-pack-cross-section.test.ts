/**
 * v0.9 Slice 2b — cross-section synthesis regression tests for prompt-v2.
 *
 * The Slice 2 prompt (v1) under-specified cross-section combination when
 * multiple sections are included. The Slice 2b live multi-section run
 * produced answer paragraphs drawing from only one section. Slice 2b's
 * prompt-v2 adjustment adds an explicit CROSS-SECTION RULE: when ≥2
 * sections are included, the answer paragraph MUST cite at least two
 * distinct section IDs in its support bundle.
 *
 * These tests assert:
 *   1. The rendered prompt contains the cross-section instruction.
 *   2. The prompt version is bumped to v2.
 *   3. The drafter hint mentions the cross-section rule.
 *   4. When run with a multi-section fake client that cites IDs from
 *      both sections, the answer paragraph's support_bundle.section_ids
 *      contains ≥ 2 distinct IDs.
 *   5. Single-section input still produces a single-section_id support
 *      bundle (the v2 rule is conditional, not blanket).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { handoff as coworkHandoff } from '../src/cowork/index.js';
import { partialPackSynthesis } from '../src/synth/index.js';
import {
  renderPartialPackPrompt,
  PARTIAL_PACK_PROMPT_VERSION,
  PARTIAL_PACK_DRAFTER_HINT,
} from '../src/synth/partial-pack/prompt.js';
import type { ProseCallToolClient } from '../src/synth/prose/types.js';
import type { PartialPackSectionInput } from '../src/synth/partial-pack/types.js';

// ── Static prompt-shape tests (no MCP, no filesystem) ─────────────────────

describe('partial-pack prompt v2 — shape contract', () => {
  it('PARTIAL_PACK_PROMPT_VERSION is "partial-pack-prose-v3" (Slice 2c contract change)', () => {
    expect(PARTIAL_PACK_PROMPT_VERSION).toBe('partial-pack-prose-v3');
  });

  it('rendered prompt includes the structural cross-section rule', () => {
    const inputs: PartialPackSectionInput[] = [
      {
        section_id: '01-a',
        section_purpose: 'A',
        section_synthesis_path: 'sections/01-a/synthesis/section-synthesis.json',
        paragraphs: [
          { section_paragraph_id: '01-a:p1', role: 'answer', text: 'x', verifier_decision: 'faithful' },
        ],
      },
      {
        section_id: '02-b',
        section_purpose: 'B',
        section_synthesis_path: 'sections/02-b/synthesis/section-synthesis.json',
        paragraphs: [
          { section_paragraph_id: '02-b:p1', role: 'answer', text: 'y', verifier_decision: 'faithful' },
        ],
      },
    ];
    const prompt = renderPartialPackPrompt({
      packTopic: 'test',
      packMode: 'repair_required',
      includedSections: inputs,
      excludedSections: [],
    });
    // Structural constraint must be present (substrings — the prompt
    // line-wraps so the full sentence may not appear as a flat substring).
    expect(prompt).toContain('CROSS-SECTION RULE');
    expect(prompt).toContain('When more than one section is included');
    expect(prompt).toContain('at least two included sections');
    expect(prompt).toContain('A single-section answer paragraph');
    expect(prompt).toContain('only when exactly one section is included');
    // Product reason must be present.
    expect(prompt).toContain('Do not merely restate the strongest included section');
    expect(prompt).toContain('combine what the included sections');
  });

  it('drafter hint references the required answer support bundle (v3 contract)', () => {
    // v3 hint focuses on the required-bundle contract; the v2 natural-language
    // "at least two different included sections" phrasing was replaced by the
    // structural "use the REQUIRED ANSWER SUPPORT BUNDLE" language.
    expect(PARTIAL_PACK_DRAFTER_HINT).toContain('REQUIRED ANSWER SUPPORT BUNDLE');
    expect(PARTIAL_PACK_DRAFTER_HINT).toContain('no omissions, no additions');
  });

  it('the structural rule survives the single-section call (text is self-conditioning)', () => {
    // The rule text reads "When more than one section is included" — it
    // self-conditions, so we render it identically regardless of input size.
    const oneSection: PartialPackSectionInput[] = [
      {
        section_id: '01-a',
        section_purpose: 'A',
        section_synthesis_path: 'sections/01-a/synthesis/section-synthesis.json',
        paragraphs: [
          { section_paragraph_id: '01-a:p1', role: 'answer', text: 'x', verifier_decision: 'faithful' },
        ],
      },
    ];
    const prompt = renderPartialPackPrompt({
      packTopic: 'test',
      packMode: 'repair_required',
      includedSections: oneSection,
      excludedSections: [],
    });
    // The instruction is present (self-conditioning); the model is expected
    // to recognize that with one section, single-section support is allowed.
    // Substrings may span line breaks in the rendered prompt; check phrases.
    expect(prompt).toContain('A single-section answer paragraph');
    expect(prompt).toContain('only when exactly one section is included');
  });
});

// ── End-to-end pipeline tests with multi-section fake client ──────────────

let workDir: string;
let packPath: string;
const SECTION_A = '01-section-a';
const SECTION_B = '02-section-b';
const SECTION_BLOCKED = '03-blocked';

/**
 * Fake MCP client that produces a multi-paragraph response where the answer
 * paragraph cites section paragraph IDs from BOTH included sections (good
 * v2 behavior). Used to verify the integration assertions pass when the
 * model obeys the new rule.
 */
function makeGoodCrossSectionClient(): ProseCallToolClient {
  return {
    async callTool(params) {
      const args = params.arguments as Record<string, unknown>;
      const text = typeof args.text === 'string' ? args.text : '';
      const idMatches = text.match(/\[([0-9]{2}-[a-z0-9-]+:p\d+)\]/g) ?? [];
      const ids = Array.from(new Set(idMatches.map((m) => m.slice(1, -1))));
      // Group ids by section
      const idsBySection = new Map<string, string[]>();
      for (const id of ids) {
        const sid = id.split(':')[0]!;
        const arr = idsBySection.get(sid) ?? [];
        arr.push(id);
        idsBySection.set(sid, arr);
      }
      const sectionIds = Array.from(idsBySection.keys());
      // Answer paragraph cites IDs from ALL included sections.
      const answerIds: string[] = [];
      for (const sid of sectionIds) {
        const first = idsBySection.get(sid)![0]!;
        answerIds.push(first);
      }

      const data = {
        paragraphs: [
          {
            role: 'answer',
            text:
              'Cross-section answer that combines material from each included section into a single pack-level conclusion.',
            section_paragraph_ids: answerIds,
          },
          {
            role: 'evidence',
            text: 'Evidence paragraph drawing from the first included section\'s material.',
            section_paragraph_ids: sectionIds.length > 0 ? [idsBySection.get(sectionIds[0]!)![0]!] : ids,
          },
        ],
      };
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ result: { ok: true, data } }),
          },
        ],
      };
    },
  };
}

/**
 * Build a 3-section fixture pack:
 *   01-section-a: included, has 2 faithful section-prose paragraphs
 *   02-section-b: included, has 2 faithful section-prose paragraphs
 *   03-blocked:   excluded, gate-blocked
 */
async function buildMultiSectionFixture(): Promise<void> {
  const r = await init({
    topic: 'Cross-section partial-pack synthesis regression fixture',
    outDir: workDir,
  });
  packPath = r.packPath;

  await sectionAdd({ id: SECTION_A, purpose: 'Section A — first half of the comparison', packPath });
  await sectionAdd({ id: SECTION_B, purpose: 'Section B — second half of the comparison', packPath });
  await sectionAdd({ id: SECTION_BLOCKED, purpose: 'Section deliberately blocked', packPath });

  // Source cards + claims + reviews for A and B.
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

    // Two accepted claims per section.
    for (let i = 1; i <= 2; i += 1) {
      const claimId = `clm_${srcId.slice(4)}_heuristic_${i}`;
      await appendFile(
        join(packPath, 'sections', section, 'claims.jsonl'),
        JSON.stringify({
          claim_id: claimId,
          section_id: section,
          source_ids: [srcId],
          source_hashes: ['a'.repeat(64)],
          asserts: `Claim ${i} for ${section}`,
          scope: 's',
          not: 'n',
          evidence_excerpt: `excerpt ${i}`,
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
    }

    // Pre-baked section-synthesis.json with 2 faithful paragraphs.
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
              support_bundle: { claim_ids: [`clm_${srcId.slice(4)}_heuristic_1`], source_card_ids: [srcId], waiver_ids: [], thin_evidence: false },
            },
            {
              paragraph_id: 'p2',
              role: 'evidence',
              text: `Evidence paragraph from ${section}.`,
              verifier_decision: 'faithful',
              support_bundle: { claim_ids: [`clm_${srcId.slice(4)}_heuristic_2`], source_card_ids: [srcId], waiver_ids: [], thin_evidence: false },
            },
          ],
        },
      }),
      'utf8',
    );
    await writeFile(join(synthDir, 'section-brief.md'), '# brief\n', 'utf8');

    // Gate audit for the section.
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
        claim_counts: { total: 2, candidate: 0, with_evidence_excerpt: 2, with_source_hashes: 2, with_scope: 2, with_not: 2, universal_scope_null: 0, orphans: 0 },
        source_counts: { total: 1, primary: 0, secondary: 0, forum: 0, benchmark: 0, docs: 1, unknown: 0, independent_publishers: 1, failed_fetches: 0, section_primary: 0, section_independent_publishers: 1 },
        contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
        freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 1 },
        scope_integrity_summary: { universal_claims: 0, scoped_claims: 2, with_not_constraint: 2, overgen_risks_total: 0, overgen_risks_blocking: 0 },
        next_actions: [],
      }, null, 2),
      'utf8',
    );
  }

  // Section 03 blocked gate.
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
  workDir = await mkdtemp(join(tmpdir(), 'ros-partial-pack-cross-section-'));
  await buildMultiSectionFixture();
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('partial-pack v2 — multi-section answer paragraph must cite both sections', () => {
  it('answer paragraph support_bundle.section_ids has >= 2 distinct IDs when 2 sections are included', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({
      packPath,
      mcpClient: makeGoodCrossSectionClient(),
    });

    expect(result.includedCount).toBe(2);
    expect(result.excludedCount).toBe(1);
    expect(result.proseGenerated).toBe(true);

    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const prose = artifact.prose as { paragraphs: Array<Record<string, unknown>> };
    expect(prose.paragraphs.length).toBeGreaterThan(0);

    // The answer paragraph is the first one (and is role=answer per the
    // drafter contract — runPartialPackDrafter reorders if needed).
    const answerPara = prose.paragraphs[0]!;
    expect(answerPara.role).toBe('answer');

    const support = answerPara.support_bundle as Record<string, unknown>;
    const sectionIds = support.section_ids as string[];
    const distinct = new Set(sectionIds);
    expect(distinct.size).toBeGreaterThanOrEqual(2);
    expect(distinct.has(SECTION_A)).toBe(true);
    expect(distinct.has(SECTION_B)).toBe(true);
  });

  it('every section_paragraph_id in the answer support bundle resolves to a valid section paragraph', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({
      packPath,
      mcpClient: makeGoodCrossSectionClient(),
    });

    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const prose = artifact.prose as { paragraphs: Array<{ support_bundle: { section_paragraph_ids: string[] } }> };
    const answer = prose.paragraphs[0]!;
    for (const id of answer.support_bundle.section_paragraph_ids) {
      expect(id).toMatch(/^(01-section-a|02-section-b):p[12]$/);
    }
  });
});
