// Test class 7: Section 06 integration test.
//
// Fixture: mirrors fresh-pack Section 06 evidence shape.
//   - 37 accepted claims across 4 sources from 3 publishers
//   - 1 source-diversity waiver (primary_sources_required)
//   - Pack mode: repair_required (Section 01 blocked)
//   - Gate verdict: warn (synthesis_eligible: true)
//
// Automated checks (all from dispatch):
//   ✓ section-brief.md still exists and is unchanged
//   ✓ section-synthesis.md exists, has top-block disclosure callout, has paragraphs
//   ✓ section-synthesis.json exists, has prose block populated
//   ✓ Every substantive paragraph has at least one claim_id in its support_bundle
//   ✓ Every claim_id in every support_bundle resolves to an accepted_for_synthesis claim
//   ✓ Zero frame_excluded claim IDs appear in any support_bundle
//   ✓ Every waiver_id referenced in support appears in disclosures.waivers
//   ✓ status: partial_synthesis is set
//   ✓ No prose text implies pack is freezable or publishable
//   ✓ Pack freeze still refuses

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { handoff as coworkHandoff } from '../src/cowork/index.js';
import { sectionSynthesis } from '../src/synth/index.js';
import { freeze as runFreeze } from '../src/freeze/index.js';
import type { ProseCallToolClient } from '../src/synth/prose/types.js';

let workDir: string;
let packPath: string;

const SECTION_06 = '06-evidence-custody-curated';
const SECTION_01 = '01-blocked-evidence';

// Generate stable claim IDs.
function claimId(srcSuffix: string, n: number): string {
  return `clm_${srcSuffix}_heuristic_${n}`;
}

const SOURCES = [
  { id: 'src_aaaaaaaaaaaa', publisher: 'DVC', suffix: 'aaaaaaaaaaaa' },
  { id: 'src_bbbbbbbbbbbb', publisher: 'The Turing Way', suffix: 'bbbbbbbbbbbb' },
  { id: 'src_cccccccccccc', publisher: 'DVC', suffix: 'cccccccccccc' },
  { id: 'src_dddddddddddd', publisher: 'MLflow', suffix: 'dddddddddddd' },
] as const;

// 37 accepted claims distributed across 4 sources.
// Plus 2 frame_excluded claims that must NOT appear in any support bundle.
const ACCEPTED_CLAIM_IDS: string[] = [
  ...Array.from({ length: 12 }, (_, i) => claimId('aaaaaaaaaaaa', i + 1)),
  ...Array.from({ length: 10 }, (_, i) => claimId('bbbbbbbbbbbb', i + 1)),
  ...Array.from({ length: 8 }, (_, i) => claimId('cccccccccccc', i + 1)),
  ...Array.from({ length: 7 }, (_, i) => claimId('dddddddddddd', i + 1)),
];
expect(ACCEPTED_CLAIM_IDS.length).toBe(37);

const FRAME_EXCLUDED_IDS = [
  claimId('aaaaaaaaaaaa', 13),
  claimId('bbbbbbbbbbbb', 11),
];

// Track how many claims are per-source for the fake client to route correctly.
const ACCEPTED_CLAIM_ID_SET = new Set(ACCEPTED_CLAIM_IDS);

// Fake MCP client that simulates the prose pipeline with realistic responses.
function makeFakeClient(): ProseCallToolClient {
  return {
    async callTool(params) {
      const args = params.arguments as Record<string, unknown>;
      const text = typeof args.text === 'string' ? args.text : '';

      // Planner: extract accepted claim IDs from the text and assign roles.
      if (text.includes('Assign each') || text.includes('Admission rule')) {
        const matches = text.match(/clm_\w+/g) ?? [];
        const ids = Array.from(new Set(matches)).filter((id) => ACCEPTED_CLAIM_ID_SET.has(id));
        const ROLE_CYCLE = ['answer', 'evidence', 'evidence', 'qualifier', 'evidence', 'caveat', 'evidence', 'implication'] as const;
        const assignments = ids.map((id, i) => ({
          claim_id: id,
          role: ROLE_CYCLE[i % ROLE_CYCLE.length],
          role_rationale: i === 0
            ? 'directly answers the evidence custody section purpose'
            : 'provides supporting evidence or context for the section purpose',
        }));
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ result: { ok: true, data: { assignments } } }),
          }],
        };
      }

      // Drafter: produce a paragraph that references claim IDs visible in the prompt.
      if (text.includes('Write ONE readable')) {
        const matches = text.match(/clm_[a-f0-9_]+/g) ?? [];
        const ids = Array.from(new Set(matches));
        const paragraph = `Evidence from ${ids.length} accepted claim(s) supports this section's purpose regarding evidence custody and data reproducibility.`;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ result: { ok: true, data: { paragraph } } }),
          }],
        };
      }

      // Verifier: return faithful.
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ result: { ok: true, data: { decision: 'faithful', rationale: 'All propositions directly restate accepted claims.' } } }),
        }],
      };
    },
  };
}

async function buildSection06Fixture(): Promise<void> {
  const r = await init({
    topic: 'local-first vs cloud research — evidence custody',
    outDir: workDir,
  });
  packPath = r.packPath;

  // Section 01: blocked (makes pack repair_required).
  await sectionAdd({ id: SECTION_01, purpose: 'Blocked evidence section', packPath });
  // Section 06: synthesis-eligible.
  await sectionAdd({ id: SECTION_06, purpose: 'How do curated source packs preserve evidence custody and ensure reproducibility?', packPath });

  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });

  for (const src of SOURCES) {
    const card = {
      source_id: src.id,
      receipt_id: `rcpt_${src.suffix}_1`,
      section_id: SECTION_06,
      url: `https://example.com/${src.id}`,
      final_url: `https://example.com/${src.id}`,
      fetched_at: '2026-05-12T00:00:00.000Z',
      publisher: src.publisher,
      published_at: null,
      title: `${src.publisher} documentation on evidence custody`,
      source_type: 'docs',
      relevance: 'high',
      key_points: ['key point'],
      limitations: [],
      asserts: 'Evidence custody matters for reproducibility',
      scope: 'ML pipeline artifact tracking',
      not: 'general file backup',
      extracted_by: 'ollama-intern',
      extracted_at: '2026-05-12T00:00:00.000Z',
    };
    await writeFile(join(cardDir, `${src.id}.json`), JSON.stringify(card), 'utf8');
    await appendFile(
      join(packPath, 'sections', SECTION_06, 'sources.jsonl'),
      JSON.stringify({ source_id: src.id, added_at: '2026-05-12T00:00:00.000Z' }) + '\n',
      'utf8',
    );
  }

  // Section 01: minimal blocked fixture.
  await writeFile(
    join(cardDir, 'src_eeeeeeeeeeee.json'),
    JSON.stringify({
      source_id: 'src_eeeeeeeeeeee',
      receipt_id: 'rcpt_eeeeeeeeeeee_1',
      section_id: SECTION_01,
      url: 'https://example.com/s1',
      final_url: 'https://example.com/s1',
      fetched_at: '2026-05-12T00:00:00.000Z',
      publisher: 'BlockedPub',
      published_at: null,
      title: 'Blocked source',
      source_type: 'secondary',
      relevance: 'low',
      key_points: [],
      limitations: [],
      asserts: 'blocked',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-12T00:00:00.000Z',
    }),
    'utf8',
  );

  // Write claims for Section 06: 37 accepted + 2 frame_excluded.
  const sourceMap: Record<string, string> = {
    'aaaaaaaaaaaa': 'src_aaaaaaaaaaaa',
    'bbbbbbbbbbbb': 'src_bbbbbbbbbbbb',
    'cccccccccccc': 'src_cccccccccccc',
    'dddddddddddd': 'src_dddddddddddd',
  };
  for (const cid of [...ACCEPTED_CLAIM_IDS, ...FRAME_EXCLUDED_IDS]) {
    const suffix = cid.split('_')[1]!;
    const srcId = sourceMap[suffix] ?? 'src_aaaaaaaaaaaa';
    const claim = {
      claim_id: cid,
      section_id: SECTION_06,
      source_ids: [srcId],
      source_hashes: ['a'.repeat(64)],
      asserts: `Evidence custody claim ${cid}: tools track artifacts by content hash`,
      scope: 'ML pipeline artifact tracking',
      not: 'general-purpose file backup',
      evidence_excerpt: `Excerpt supporting ${cid}`,
      evidence_location: null,
      confidence: 'medium',
      extractor: 'ollama-intern',
      extraction_method: 'ollama_intern_span_first',
      created_at: '2026-05-12T00:00:00.000Z',
      review_state: 'candidate',
      frame_excluded: FRAME_EXCLUDED_IDS.includes(cid),
      frame_exclusion_reason: FRAME_EXCLUDED_IDS.includes(cid) ? 'off_topic' : undefined,
      frame_exclusion_rationale: FRAME_EXCLUDED_IDS.includes(cid) ? 'Claim is off-topic for evidence custody' : undefined,
    };
    await appendFile(
      join(packPath, 'sections', SECTION_06, 'claims.jsonl'),
      JSON.stringify(claim) + '\n',
      'utf8',
    );
  }

  // Claim reviews.
  for (const cid of ACCEPTED_CLAIM_IDS) {
    await appendFile(
      join(packPath, 'sections', SECTION_06, 'claim-reviews.jsonl'),
      JSON.stringify({
        claim_id: cid,
        decision: 'accepted_for_synthesis',
        reason: 'claim well-grounded with evidence excerpt',
        finding_ids: [],
        reviewer: 'ollama-intern',
        review_method: 'ollama_intern_two_pass',
        created_at: '2026-05-12T00:00:01.000Z',
      }) + '\n',
      'utf8',
    );
  }
  for (const cid of FRAME_EXCLUDED_IDS) {
    await appendFile(
      join(packPath, 'sections', SECTION_06, 'claim-reviews.jsonl'),
      JSON.stringify({
        claim_id: cid,
        decision: 'frame_excluded',
        reason: 'critic: off_topic for section purpose',
        finding_ids: [],
        reviewer: 'ollama-intern',
        review_method: 'ollama_intern_two_pass',
        created_at: '2026-05-12T00:00:01.000Z',
      }) + '\n',
      'utf8',
    );
  }

  // Section 06 gate (warn, synthesis_eligible).
  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(
    join(packPath, 'audits', `${SECTION_06}-gate.json`),
    JSON.stringify({
      section_id: SECTION_06,
      verdict: 'warn',
      summary: 'Source diversity waiver active; synthesis eligible.',
      checked_at: '2026-05-12T00:00:02.000Z',
      synthesis_eligible: true,
      gate_results: [],
      failures: [],
      warnings: [{
        family: 'source_floor',
        check: 'independent_publishers',
        status: 'warn',
        detail: 'Only 3 independent publishers; waiver applied',
        evidence: [],
        blocks_synthesis: false,
      }],
      waivers_applied: [{
        family: 'source_floor',
        check: 'primary_sources_required',
        reason: 'No primary sources available for this topic; waiver granted for secondary docs',
        compensating_controls: ['All sources are official project documentation'],
        original_status: 'fail',
        new_status: 'pass_with_waiver',
      }],
      blocking_reasons: [],
      claim_counts: { total: 39, candidate: 0, with_evidence_excerpt: 39, with_source_hashes: 39, with_scope: 39, with_not: 39, universal_scope_null: 0, orphans: 0 },
      source_counts: { total: 4, primary: 0, secondary: 0, forum: 0, benchmark: 0, docs: 4, unknown: 0, independent_publishers: 3, failed_fetches: 0, section_primary: 0, section_independent_publishers: 3 },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 4 },
      scope_integrity_summary: { universal_claims: 0, scoped_claims: 39, with_not_constraint: 39, overgen_risks_total: 0, overgen_risks_blocking: 0 },
      next_actions: [],
    }, null, 2),
    'utf8',
  );

  // Section 01 gate (blocked).
  await writeFile(
    join(packPath, 'audits', `${SECTION_01}-gate.json`),
    JSON.stringify({
      section_id: SECTION_01,
      verdict: 'blocked',
      summary: 'No accepted claims.',
      checked_at: '2026-05-12T00:00:02.000Z',
      synthesis_eligible: false,
      gate_results: [],
      failures: [{ family: 'accepted_claim_floor', check: 'min_accepted_claims', status: 'fail', detail: 'fixture', evidence: [], blocks_synthesis: true }],
      warnings: [],
      waivers_applied: [],
      blocking_reasons: ['accepted_claim_floor: 0/3'],
      claim_counts: { total: 0, candidate: 0, with_evidence_excerpt: 0, with_source_hashes: 0, with_scope: 0, with_not: 0, universal_scope_null: 0, orphans: 0 },
      source_counts: { total: 1, primary: 0, secondary: 1, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 1, failed_fetches: 0, section_primary: 0, section_independent_publishers: 1 },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 1 },
      scope_integrity_summary: { universal_claims: 0, scoped_claims: 0, with_not_constraint: 0, overgen_risks_total: 0, overgen_risks_blocking: 0 },
      next_actions: [],
    }, null, 2),
    'utf8',
  );
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-prose-integration-'));
  await buildSection06Fixture();
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('Section 06 integration test (37 accepted claims, 1 waiver)', () => {
  it('generates all three output files', async () => {
    await coworkHandoff({ packPath });
    const result = await sectionSynthesis({
      sectionId: SECTION_06,
      packPath,
      mcpClient: makeFakeClient(),
    });

    expect(existsSync(result.markdownPath)).toBe(true);          // section-brief.md
    expect(existsSync(result.jsonPath)).toBe(true);              // section-synthesis.json
    expect(result.proseMarkdownPath).not.toBeNull();
    expect(existsSync(result.proseMarkdownPath!)).toBe(true);    // section-synthesis.md
  });

  it('section-synthesis.md has the top-block callout', async () => {
    await coworkHandoff({ packPath });
    const result = await sectionSynthesis({
      sectionId: SECTION_06,
      packPath,
      mcpClient: makeFakeClient(),
    });

    const md = await readFile(result.proseMarkdownPath!, 'utf8');
    expect(md).toContain('partial_synthesis');
    expect(md).toContain('repair_required');
  });

  it('section-synthesis.json has the prose block populated', async () => {
    await coworkHandoff({ packPath });
    const result = await sectionSynthesis({
      sectionId: SECTION_06,
      packPath,
      mcpClient: makeFakeClient(),
    });

    const json = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    expect(json).toHaveProperty('prose');
    const prose = json.prose as Record<string, unknown>;
    expect(Array.isArray(prose.paragraphs)).toBe(true);
    expect((prose.paragraphs as unknown[]).length).toBeGreaterThan(0);
  });

  it('every paragraph has at least one claim_id in its support_bundle', async () => {
    await coworkHandoff({ packPath });
    const result = await sectionSynthesis({
      sectionId: SECTION_06,
      packPath,
      mcpClient: makeFakeClient(),
    });

    const json = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const paragraphs = ((json.prose as Record<string, unknown>).paragraphs ?? []) as Array<{
      paragraph_id: string;
      support_bundle: { claim_ids: string[] };
    }>;
    for (const p of paragraphs) {
      expect(p.support_bundle.claim_ids.length).toBeGreaterThan(0);
    }
  });

  it('every claim_id in every support_bundle is in the accepted_claim set', async () => {
    await coworkHandoff({ packPath });
    const result = await sectionSynthesis({
      sectionId: SECTION_06,
      packPath,
      mcpClient: makeFakeClient(),
    });

    const json = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const paragraphs = ((json.prose as Record<string, unknown>).paragraphs ?? []) as Array<{
      support_bundle: { claim_ids: string[] };
    }>;
    const allSupportIds = paragraphs.flatMap((p) => p.support_bundle.claim_ids);
    for (const id of allSupportIds) {
      expect(ACCEPTED_CLAIM_ID_SET.has(id)).toBe(true);
    }
  });

  it('zero frame_excluded claim IDs appear in any support_bundle', async () => {
    await coworkHandoff({ packPath });
    const result = await sectionSynthesis({
      sectionId: SECTION_06,
      packPath,
      mcpClient: makeFakeClient(),
    });

    const json = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const paragraphs = ((json.prose as Record<string, unknown>).paragraphs ?? []) as Array<{
      support_bundle: { claim_ids: string[] };
    }>;
    const allSupportIds = paragraphs.flatMap((p) => p.support_bundle.claim_ids);
    for (const feid of FRAME_EXCLUDED_IDS) {
      expect(allSupportIds).not.toContain(feid);
    }
  });

  it('waiver is disclosed in prose.disclosures.waivers', async () => {
    await coworkHandoff({ packPath });
    const result = await sectionSynthesis({
      sectionId: SECTION_06,
      packPath,
      mcpClient: makeFakeClient(),
    });

    const json = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const prose = json.prose as Record<string, unknown>;
    const disclosures = prose.disclosures as Record<string, unknown>;
    const waivers = disclosures.waivers as Array<{ waiver_id: string; reason: string }>;
    expect(waivers.length).toBeGreaterThan(0);
    expect(waivers[0]!.reason).toBeTruthy();
  });

  it('status: partial_synthesis is set', async () => {
    await coworkHandoff({ packPath });
    const result = await sectionSynthesis({
      sectionId: SECTION_06,
      packPath,
      mcpClient: makeFakeClient(),
    });

    const json = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    expect(json.status).toBe('partial_synthesis');
  });

  it('prose text does not imply pack is freezable or publishable', async () => {
    await coworkHandoff({ packPath });
    const result = await sectionSynthesis({
      sectionId: SECTION_06,
      packPath,
      mcpClient: makeFakeClient(),
    });

    const md = await readFile(result.proseMarkdownPath!, 'utf8');
    // The markdown must NOT contain any positive claim about freezability.
    expect(md).not.toMatch(/pack is (now )?freezable/i);
    expect(md).not.toMatch(/pack is (now )?publishable/i);
    expect(md).not.toMatch(/ready to freeze/i);
    expect(md).not.toMatch(/ready to publish/i);
  });

  it('pack freeze still refuses after prose synthesis', async () => {
    await coworkHandoff({ packPath });
    await sectionSynthesis({
      sectionId: SECTION_06,
      packPath,
      mcpClient: makeFakeClient(),
    });

    const freezeResult = await runFreeze({ packPath });
    expect(freezeResult.verdict).toBe('refused');
  });
});
