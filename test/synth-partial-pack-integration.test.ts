/**
 * v0.9 Slice 2 — partial-pack synthesis integration tests.
 *
 * Covers:
 *   - End-to-end run against a fixture pack with included + excluded sections.
 *   - Hard invariants: not_freezable_as_pack, not_publishable_as_pack always true.
 *   - Support bundles reference section paragraph IDs only — never claim IDs.
 *   - Markdown top callout discloses partial status, no banned-opener leakage.
 *   - "What this synthesis excludes" always present, even when empty.
 *   - Pack freeze STILL refuses after partial-pack synthesis runs.
 *   - Zero-included-sections produces a structured no_included_sections error
 *     and writes a failure-marker Markdown body.
 *   - Banned opener in the answer paragraph trips the drafter's guard.
 *   - Existing pack-level synthesis files in synthesis/ are NEVER overwritten.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir, appendFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { handoff as coworkHandoff } from '../src/cowork/index.js';
import { partialPackSynthesis } from '../src/synth/index.js';
import { freeze as runFreeze } from '../src/freeze/index.js';
import type { ProseCallToolClient } from '../src/synth/prose/types.js';

let workDir: string;
let packPath: string;

const SECTION_GOOD = '06-good-section';
const SECTION_BLOCKED = '01-blocked-section';

/**
 * Fake MCP client for the partial-pack drafter. Returns a single answer-role
 * paragraph that cites the section paragraph IDs visible in the prompt.
 */
function makeFakeClient(opts?: { bannedOpener?: boolean }): ProseCallToolClient {
  return {
    async callTool(params) {
      const args = params.arguments as Record<string, unknown>;
      const text = typeof args.text === 'string' ? args.text : '';

      // The partial-pack drafter renders prompts containing [<section_id>:<p_id>]
      // markers. Extract them and cite back in the response.
      const idMatches = text.match(/\[([0-9]{2}-[a-z0-9-]+:p\d+)\]/g) ?? [];
      const ids = Array.from(new Set(idMatches.map((m) => m.slice(1, -1))));

      const answerText = opts?.bannedOpener
        ? 'This synthesis provides a pack-level summary of what the included sections taught us about evidence custody.'
        : 'Evidence custody in this pack requires both content-hash version control of artifacts and PROV-derived provenance records, with cross-publisher confirmation from DVC and The Turing Way.';

      const data = {
        paragraphs: [
          {
            role: 'answer',
            text: answerText,
            section_paragraph_ids: ids,
          },
          {
            role: 'evidence',
            text: 'The included section paragraphs converge on artifact-tracking via content hashes, with PROV-O extending the trail for cross-organization sharing.',
            section_paragraph_ids: ids,
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
 * Build a fixture pack:
 * - SECTION_GOOD: has Slice 1 prose, included.
 * - SECTION_BLOCKED: has 0 accepted claims, gate-blocked, excluded.
 * - Pack mode: repair_required (driven by SECTION_BLOCKED).
 */
async function buildPackFixture(): Promise<void> {
  const r = await init({
    topic: 'Partial-pack synthesis fixture — evidence custody',
    outDir: workDir,
  });
  packPath = r.packPath;

  // Add sections in research.yaml order: blocked then good.
  await sectionAdd({ id: SECTION_BLOCKED, purpose: 'Section deliberately blocked to test exclusion', packPath });
  await sectionAdd({ id: SECTION_GOOD, purpose: 'What does evidence custody require in a local-first workflow?', packPath });

  // Set up source cards for the good section.
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  const sources = [
    { id: 'src_aaaaaaaaaaaa', publisher: 'DVC' },
    { id: 'src_bbbbbbbbbbbb', publisher: 'The Turing Way' },
  ];
  for (const s of sources) {
    await writeFile(
      join(cardDir, `${s.id}.json`),
      JSON.stringify({
        source_id: s.id,
        receipt_id: `rcpt_${s.id.replace(/^src_/, '')}_1`,
        section_id: SECTION_GOOD,
        url: `https://example.com/${s.id}`,
        final_url: `https://example.com/${s.id}`,
        fetched_at: '2026-05-12T00:00:00.000Z',
        publisher: s.publisher,
        published_at: null,
        title: `${s.publisher} docs on evidence custody`,
        source_type: 'docs',
        relevance: 'high',
        key_points: ['key point'],
        limitations: [],
        asserts: 'Evidence custody matters for reproducibility',
        scope: 'ML pipeline artifact tracking',
        not: 'general file backup',
        extracted_by: 'ollama-intern',
        extracted_at: '2026-05-12T00:00:00.000Z',
      }),
      'utf8',
    );
    await appendFile(
      join(packPath, 'sections', SECTION_GOOD, 'sources.jsonl'),
      JSON.stringify({ source_id: s.id, added_at: '2026-05-12T00:00:00.000Z' }) + '\n',
      'utf8',
    );
    await appendFile(
      join(packPath, 'evidence', 'fetch-log.jsonl'),
      JSON.stringify({
        receipt_id: `rcpt_${s.id.replace(/^src_/, '')}_1`,
        source_id: s.id,
        section_id: SECTION_GOOD,
        requested_url: `https://example.com/${s.id}`,
        final_url: `https://example.com/${s.id}`,
        status: 200,
        status_text: 'OK',
        content_type: 'text/html',
        fetched_at: '2026-05-12T00:00:00.000Z',
        byte_count: 100,
        sha256: createHash('sha256').update(s.id).digest('hex'),
        title: `${s.publisher} docs`,
        raw_text_path: `evidence/raw/${s.id}.html`,
        fetch_outcome: 'ok',
        fetch_error: null,
        extraction_outcome: 'ok',
        extraction_extractor: 'heuristic',
        extraction_error: null,
      }) + '\n',
      'utf8',
    );
  }

  // Claims + reviews for SECTION_GOOD: 3 accepted.
  const goodClaimIds = ['clm_good_1', 'clm_good_2', 'clm_good_3'];
  for (const cid of goodClaimIds) {
    await appendFile(
      join(packPath, 'sections', SECTION_GOOD, 'claims.jsonl'),
      JSON.stringify({
        claim_id: cid,
        section_id: SECTION_GOOD,
        source_ids: ['src_aaaaaaaaaaaa'],
        source_hashes: ['a'.repeat(64)],
        asserts: `Claim ${cid} — artifacts tracked by content hash`,
        scope: 'ML pipeline artifact tracking',
        not: 'general-purpose file backup',
        evidence_excerpt: `Excerpt for ${cid}`,
        evidence_location: null,
        confidence: 'medium',
        extractor: 'heuristic',
        extraction_method: 'heuristic_key_point',
        created_at: '2026-05-12T00:00:00.000Z',
        review_state: 'candidate',
      }) + '\n',
      'utf8',
    );
    await appendFile(
      join(packPath, 'sections', SECTION_GOOD, 'claim-reviews.jsonl'),
      JSON.stringify({
        claim_id: cid,
        decision: 'accepted_for_synthesis',
        reason: 'fixture',
        finding_ids: [],
        reviewer: 'heuristic',
        review_method: 'heuristic_field_and_grounding_checks',
        created_at: '2026-05-12T00:00:01.000Z',
      }) + '\n',
      'utf8',
    );
  }

  // Write Slice 1 section-synthesis.json directly for SECTION_GOOD (so we
  // don't have to spin up the MCP-backed section prose pipeline).
  const goodSynthDir = join(packPath, 'sections', SECTION_GOOD, 'synthesis');
  await mkdir(goodSynthDir, { recursive: true });
  await writeFile(
    join(goodSynthDir, 'section-synthesis.json'),
    JSON.stringify({
      status: 'partial_synthesis',
      scope: 'section',
      section_id: SECTION_GOOD,
      section_purpose: 'What does evidence custody require in a local-first workflow?',
      pack_id: 'pack_fixture',
      pack_topic: 'fixture',
      pack_mode: 'repair_required',
      not_freezable_as_pack: true,
      not_publishable_as_pack: true,
      accepted_claim_ids: goodClaimIds,
      source_ids: ['src_aaaaaaaaaaaa', 'src_bbbbbbbbbbbb'],
      waivers_applied: [],
      gate_verdict: 'pass',
      generated_at: '2026-05-13T01:00:00.000Z',
      research_os_version: '0.8.0',
      prose: {
        section_purpose: 'What does evidence custody require in a local-first workflow?',
        paragraphs: [
          {
            paragraph_id: 'p1',
            role: 'answer',
            text: 'Evidence custody requires content-hash-based artifact tracking.',
            support_bundle: { claim_ids: ['clm_good_1'], source_card_ids: ['src_aaaaaaaaaaaa'], waiver_ids: [], thin_evidence: false },
            verifier_decision: 'faithful',
          },
          {
            paragraph_id: 'p2',
            role: 'evidence',
            text: 'DVC stores checksums in git while caching the actual outputs.',
            support_bundle: { claim_ids: ['clm_good_2', 'clm_good_3'], source_card_ids: ['src_aaaaaaaaaaaa', 'src_bbbbbbbbbbbb'], waiver_ids: [], thin_evidence: false },
            verifier_decision: 'faithful',
          },
        ],
        disclosures: { waivers: [], thin_evidence_paragraphs: [], unused_claims: [] },
        generator: { activity_id: 'prose_x', drafter_model: 'unknown', verifier_model: 'unknown', prompt_version: 'section-prose-v3' },
      },
    }, null, 2),
    'utf8',
  );
  await writeFile(join(goodSynthDir, 'section-brief.md'), '# Section brief\n', 'utf8');
  await writeFile(join(goodSynthDir, 'section-synthesis.md'), '# Section synthesis\n', 'utf8');

  // Gate audits: blocked for 01, pass for 06.
  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(
    join(packPath, 'audits', `${SECTION_BLOCKED}-gate.json`),
    JSON.stringify({
      section_id: SECTION_BLOCKED,
      verdict: 'blocked',
      summary: 'no accepted claims',
      checked_at: '2026-05-12T00:00:02.000Z',
      synthesis_eligible: false,
      gate_results: [],
      failures: [
        {
          family: 'accepted_claim_floor',
          check: 'min_accepted_claims',
          status: 'fail',
          detail: '0 of 3',
          evidence: [],
          blocks_synthesis: true,
        },
      ],
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
  await writeFile(
    join(packPath, 'audits', `${SECTION_GOOD}-gate.json`),
    JSON.stringify({
      section_id: SECTION_GOOD,
      verdict: 'pass',
      summary: 'fixture',
      checked_at: '2026-05-12T00:00:02.000Z',
      synthesis_eligible: true,
      gate_results: [],
      failures: [],
      warnings: [],
      waivers_applied: [],
      blocking_reasons: [],
      claim_counts: { total: 3, candidate: 0, with_evidence_excerpt: 3, with_source_hashes: 3, with_scope: 3, with_not: 3, universal_scope_null: 0, orphans: 0 },
      source_counts: { total: 2, primary: 0, secondary: 0, forum: 0, benchmark: 0, docs: 2, unknown: 0, independent_publishers: 2, failed_fetches: 0, section_primary: 0, section_independent_publishers: 2 },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 2 },
      scope_integrity_summary: { universal_claims: 0, scoped_claims: 3, with_not_constraint: 3, overgen_risks_total: 0, overgen_risks_blocking: 0 },
      next_actions: [],
    }, null, 2),
    'utf8',
  );
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'ros-partial-pack-integration-'));
  await buildPackFixture();
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('partial-pack synthesis — Outcome A (production proven)', () => {
  it('produces partial-pack-synthesis.md and partial-pack-synthesis.json', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    expect(existsSync(result.jsonPath)).toBe(true);
    expect(existsSync(result.markdownPath)).toBe(true);
    expect(result.jsonPath.endsWith('partial-pack-synthesis.json')).toBe(true);
    expect(result.markdownPath.endsWith('partial-pack-synthesis.md')).toBe(true);
  });

  it('classifies the good section as included and blocked section as excluded', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    expect(result.includedCount).toBe(1);
    expect(result.excludedCount).toBe(1);

    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const included = artifact.included_sections as Array<{ section_id: string }>;
    const excluded = artifact.excluded_sections as Array<{ section_id: string; reason: string }>;
    expect(included.map((s) => s.section_id)).toEqual([SECTION_GOOD]);
    expect(excluded.map((s) => s.section_id)).toEqual([SECTION_BLOCKED]);
    expect(excluded[0]!.reason).toBe('gate_blocked');
  });

  it('always sets not_freezable_as_pack and not_publishable_as_pack to true', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    expect(artifact.not_freezable_as_pack).toBe(true);
    expect(artifact.not_publishable_as_pack).toBe(true);
    expect(artifact.status).toBe('partial_pack_synthesis');
    expect(result.notFreezableAsPack).toBe(true);
    expect(result.notPublishableAsPack).toBe(true);
  });

  it('support_bundle references section paragraph IDs only, never claim IDs', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const prose = artifact.prose as { paragraphs: Array<Record<string, unknown>> } | null;
    expect(prose).not.toBeNull();
    expect(prose!.paragraphs.length).toBeGreaterThan(0);

    for (const p of prose!.paragraphs) {
      const support = p.support_bundle as Record<string, unknown>;
      // Must have these keys.
      expect(Array.isArray(support.section_ids)).toBe(true);
      expect(Array.isArray(support.section_paragraph_ids)).toBe(true);
      expect(Array.isArray(support.section_synthesis_paths)).toBe(true);
      // Must NOT have these keys.
      expect(support).not.toHaveProperty('claim_ids');
      expect(support).not.toHaveProperty('source_card_ids');

      // Every section_paragraph_id matches "<section_id>:<p_id>".
      for (const id of support.section_paragraph_ids as string[]) {
        expect(id).toMatch(/^[^:]+:[^:]+$/);
      }
    }
  });

  it('every cited section_paragraph_id exists in the corresponding section-synthesis.json', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const prose = artifact.prose as { paragraphs: Array<{ support_bundle: { section_paragraph_ids: string[] } }> };

    const allCitedIds = new Set<string>();
    for (const p of prose.paragraphs) {
      for (const id of p.support_bundle.section_paragraph_ids) allCitedIds.add(id);
    }

    // Load the good section's section-synthesis.json and confirm every cited
    // id exists there as "<section_id>:<paragraph_id>".
    const sectionSynth = JSON.parse(
      await readFile(
        join(packPath, 'sections', SECTION_GOOD, 'synthesis', 'section-synthesis.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    const sectionProse = sectionSynth.prose as { paragraphs: Array<{ paragraph_id: string }> };
    const validIds = new Set(sectionProse.paragraphs.map((p) => `${SECTION_GOOD}:${p.paragraph_id}`));

    for (const cited of allCitedIds) {
      expect(validIds.has(cited)).toBe(true);
    }
  });

  it('writes a Markdown top callout with status, freezable=no, publishable=no, partial', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    const md = await readFile(result.markdownPath, 'utf8');
    expect(md).toMatch(/Status:\s*\*\*\s*partial_pack_synthesis/i);
    expect(md).toMatch(/Freezable:\*\*\s*no/);
    expect(md).toMatch(/Publishable:\*\*\s*no/);
    expect(md).toMatch(/partial pack synthesis/i);
    expect(md).toMatch(/NOT freezable/);
    expect(md).toMatch(/NOT publishable/);
  });

  it('Markdown lists included and excluded sections with reasons', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    const md = await readFile(result.markdownPath, 'utf8');
    expect(md).toMatch(/## What this synthesis covers/);
    expect(md).toMatch(/## What this synthesis excludes/);
    expect(md).toContain(SECTION_GOOD);
    expect(md).toContain(SECTION_BLOCKED);
    expect(md).toContain('gate_blocked');
  });

  it('renders "None." for excluded section list when there are no exclusions', async () => {
    // Build a separate fixture where the blocked section is removed entirely.
    // Reuse the existing pack but remove the section file & gate audit, and
    // rewrite the handoff with only the good section. Easiest: rerun handoff
    // after stripping the audit; but the section is still in research.yaml.
    // Instead, render markdown manually via the renderer with no exclusions.
    const { renderPartialPackMarkdown } = await import('../src/synth/partial-pack/markdown.js');
    const md = renderPartialPackMarkdown({
      artifact: {
        status: 'partial_pack_synthesis',
        scope: 'pack',
        pack_id: 'pack_x',
        pack_topic: 'topic',
        pack_mode: 'repair_required',
        not_freezable_as_pack: true,
        not_publishable_as_pack: true,
        included_sections: [
          { section_id: '06', section_purpose: 'x', section_synthesis_path: 'a', paragraph_count: 1 },
        ],
        excluded_sections: [],
        source_section_syntheses: ['a'],
        prose: {
          paragraphs: [
            {
              paragraph_id: 'pp1',
              role: 'answer',
              text: 'Direct answer.',
              support_bundle: {
                section_ids: ['06'],
                section_paragraph_ids: ['06:p1'],
                section_synthesis_paths: ['a'],
              },
            },
          ],
        },
        generated_at: '2026-05-13T00:00:00.000Z',
        research_os_version: '0.8.0',
      },
    });
    // The excluded section heading is present, and the list renders "None.".
    expect(md).toMatch(/## What this synthesis excludes/);
    const excludedSection = md.split('## What this synthesis excludes')[1] ?? '';
    expect(excludedSection).toMatch(/_None\._/);
  });

  it('answer paragraph does NOT open with a banned meta-preamble', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const prose = artifact.prose as { paragraphs: Array<{ role: string; text: string }> };
    const answer = prose.paragraphs.find((p) => p.role === 'answer');
    expect(answer).toBeTruthy();
    const lower = answer!.text.trim().toLowerCase();
    const bannedPrefixes = [
      'this synthesis provides',
      'this synthesis explores',
      'this report explores',
      'this report provides',
      'this document',
      'in this section',
      'this section discusses',
    ];
    for (const banned of bannedPrefixes) {
      expect(lower.startsWith(banned)).toBe(false);
    }
  });

  it('pack freeze still refuses after partial-pack synthesis runs', async () => {
    await coworkHandoff({ packPath });
    await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    const freezeResult = await runFreeze({ packPath });
    expect(freezeResult.verdict).toBe('refused');
  });

  it('does not overwrite existing pack-level synthesis files', async () => {
    // Pre-populate synthesis/cross-section-map.json to simulate a pre-existing
    // full-pack synthesis run (if any). Partial-pack must not overwrite it.
    const synthDir = join(packPath, 'synthesis');
    await mkdir(synthDir, { recursive: true });
    const preExistingPath = join(synthDir, 'cross-section-map.json');
    const preExistingContent = '{"preexisting":"do_not_overwrite"}';
    await writeFile(preExistingPath, preExistingContent, 'utf8');

    await coworkHandoff({ packPath });
    await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });

    const afterContent = await readFile(preExistingPath, 'utf8');
    expect(afterContent).toBe(preExistingContent);
  });

  it('drafter rejects answer paragraphs that open with banned meta-preamble', async () => {
    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({
      packPath,
      mcpClient: makeFakeClient({ bannedOpener: true }),
    });
    // Drafter should fail; artifact should still be written with prose=null
    // and a recorded proseError.
    expect(result.proseGenerated).toBe(false);
    expect(result.proseError).toContain('meta-description');
    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    expect(artifact.prose).toBeNull();
    // The artifact still records its included/excluded counts — refusal stays
    // honest even when production fails.
    expect((artifact.included_sections as unknown[]).length).toBe(1);
    expect((artifact.excluded_sections as unknown[]).length).toBe(1);
  });
});

describe('partial-pack synthesis — Outcome B (zero included sections)', () => {
  it('writes no_included_sections proseError when all sections are excluded', async () => {
    // Build a fixture where SECTION_GOOD has prose_error and SECTION_BLOCKED
    // is gate_blocked. Zero included → Outcome B.
    const goodSynthPath = join(packPath, 'sections', SECTION_GOOD, 'synthesis', 'section-synthesis.json');
    const good = JSON.parse(await readFile(goodSynthPath, 'utf8'));
    // Remove prose and add proseError instead.
    delete good.prose;
    good.proseError = {
      code: 'no_answer_cluster',
      message: 'No accepted claim was assigned the answer role.',
    };
    await writeFile(goodSynthPath, JSON.stringify(good, null, 2), 'utf8');

    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });

    expect(result.includedCount).toBe(0);
    expect(result.excludedCount).toBe(2);
    expect(result.proseGenerated).toBe(false);
    expect(result.proseError).toContain('No section has valid section-level prose');

    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    expect(artifact.prose).toBeNull();
    expect(artifact.proseError).toBeTruthy();
    const proseError = artifact.proseError as Record<string, unknown>;
    expect(proseError.code).toBe('no_included_sections');
    // Excluded list is present.
    const excludedSections = proseError.excluded_sections as Array<{ reason: string }>;
    expect(excludedSections.length).toBe(2);
    const reasons = excludedSections.map((s) => s.reason).sort();
    expect(reasons).toEqual(['gate_blocked', 'prose_error']);
  });

  it('Markdown renders the no_included_sections failure marker', async () => {
    // Same setup as above.
    const goodSynthPath = join(packPath, 'sections', SECTION_GOOD, 'synthesis', 'section-synthesis.json');
    const good = JSON.parse(await readFile(goodSynthPath, 'utf8'));
    delete good.prose;
    good.proseError = { code: 'no_answer_cluster', message: 'x' };
    await writeFile(goodSynthPath, JSON.stringify(good, null, 2), 'utf8');

    await coworkHandoff({ packPath });
    const result = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    const md = await readFile(result.markdownPath, 'utf8');
    expect(md).toMatch(/generation_failed/);
    expect(md).toMatch(/no_included_sections/);
    // Excluded sections are still disclosed.
    expect(md).toMatch(/## What this synthesis excludes/);
    expect(md).toContain(SECTION_BLOCKED);
    expect(md).toContain(SECTION_GOOD);
    // The pack remains repair_required.
    expect(md).toMatch(/Freezable:\*\*\s*no/);
    expect(md).toMatch(/Publishable:\*\*\s*no/);
  });

  it('pack freeze STILL refuses after Outcome B', async () => {
    const goodSynthPath = join(packPath, 'sections', SECTION_GOOD, 'synthesis', 'section-synthesis.json');
    const good = JSON.parse(await readFile(goodSynthPath, 'utf8'));
    delete good.prose;
    good.proseError = { code: 'no_answer_cluster', message: 'x' };
    await writeFile(goodSynthPath, JSON.stringify(good, null, 2), 'utf8');

    await coworkHandoff({ packPath });
    await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    const freezeResult = await runFreeze({ packPath });
    expect(freezeResult.verdict).toBe('refused');
  });
});
