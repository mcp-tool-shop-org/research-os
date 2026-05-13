// Test class 4: Hard-ban regression test.
// Verifies that frame_excluded, rejected, needs_repair, and unreviewed claims
// NEVER appear in any support bundle in the prose output.
//
// The exclusion is enforced in section-run.ts before runProseSynthesis is called:
// only claims in handoff.accepted_claim_ids reach the prose pipeline.
// This test validates that invariant end-to-end through sectionSynthesis().

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { handoff as coworkHandoff } from '../src/cowork/index.js';
import { sectionSynthesis } from '../src/synth/index.js';
import type { ProseCallToolClient } from '../src/synth/prose/types.js';

let workDir: string;
let packPath: string;

// Fake MCP client that returns plausible-looking responses for the prose pipeline.
// Its exact output doesn't matter for this test — we just need the pipeline to
// complete so we can inspect the support bundles.
function makeFakeClient(): ProseCallToolClient {
  let callCount = 0;
  return {
    async callTool(params) {
      callCount += 1;
      const args = params.arguments as Record<string, unknown>;
      const text = typeof args.text === 'string' ? args.text : '';

      // Planner: extract claim IDs from the text, assign all to 'evidence'.
      if (text.includes('Assign each') || text.includes('assign each')) {
        // Extract claim IDs from the text (format: "clm_... | asserts")
        const idPattern = /clm_[a-f0-9_]+/g;
        const ids = Array.from(new Set(text.match(idPattern) ?? []));
        const assignments = ids.map((id) => ({ claim_id: id, role: 'evidence' }));
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ result: { ok: true, data: { assignments } } }),
          }],
        };
      }

      // Drafter: return a short paragraph.
      if (text.includes('Write ONE readable')) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ result: { ok: true, data: { paragraph: `Test paragraph ${callCount}.` } } }),
          }],
        };
      }

      // Verifier: return faithful.
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ result: { ok: true, data: { decision: 'faithful', rationale: 'ok' } } }),
        }],
      };
    },
  };
}

async function setupPack(): Promise<void> {
  const r = await init({ topic: 'hard-ban regression test', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: '06-evidence-custody-curated', purpose: 'Curated evidence section', packPath });
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });

  for (const srcId of ['src_aaaaaaaaaaaa', 'src_bbbbbbbbbbbb']) {
    const card = {
      source_id: srcId,
      receipt_id: `rcpt_${srcId.replace('src_', '')}_1`,
      section_id: '06-evidence-custody-curated',
      url: `https://example.com/${srcId}`,
      final_url: `https://example.com/${srcId}`,
      fetched_at: '2026-05-12T00:00:00.000Z',
      publisher: 'Test Publisher',
      published_at: null,
      title: `Title ${srcId}`,
      source_type: 'secondary',
      relevance: 'high',
      key_points: [],
      limitations: [],
      asserts: 'test asserts',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-12T00:00:00.000Z',
    };
    await writeFile(join(cardDir, `${srcId}.json`), JSON.stringify(card), 'utf8');
    await appendFile(
      join(packPath, 'sections', '06-evidence-custody-curated', 'sources.jsonl'),
      JSON.stringify({ source_id: srcId, added_at: '2026-05-12T00:00:00.000Z' }) + '\n',
      'utf8',
    );
  }

  // Write claims: 3 accepted_for_synthesis, 1 frame_excluded, 1 rejected, 1 unreviewed.
  const claimsData = [
    { claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', source_ids: ['src_aaaaaaaaaaaa'], decision: 'accepted_for_synthesis' },
    { claim_id: 'clm_aaaaaaaaaaaa_heuristic_2', source_ids: ['src_aaaaaaaaaaaa'], decision: 'accepted_for_synthesis' },
    { claim_id: 'clm_bbbbbbbbbbbb_heuristic_1', source_ids: ['src_bbbbbbbbbbbb'], decision: 'accepted_for_synthesis' },
    { claim_id: 'clm_aaaaaaaaaaaa_heuristic_3', source_ids: ['src_aaaaaaaaaaaa'], decision: 'frame_excluded' },
    { claim_id: 'clm_bbbbbbbbbbbb_heuristic_2', source_ids: ['src_bbbbbbbbbbbb'], decision: 'rejected' },
    // unreviewed: written to claims.jsonl but has no review entry
    { claim_id: 'clm_bbbbbbbbbbbb_heuristic_3', source_ids: ['src_bbbbbbbbbbbb'], decision: null },
  ];

  const FORBIDDEN_IDS = new Set([
    'clm_aaaaaaaaaaaa_heuristic_3',  // frame_excluded
    'clm_bbbbbbbbbbbb_heuristic_2',  // rejected
    'clm_bbbbbbbbbbbb_heuristic_3',  // unreviewed
  ]);

  for (const c of claimsData) {
    const claim = {
      claim_id: c.claim_id,
      section_id: '06-evidence-custody-curated',
      source_ids: c.source_ids,
      source_hashes: ['a'.repeat(64)],
      asserts: `asserts for ${c.claim_id}`,
      scope: 'test scope',
      not: 'test not',
      evidence_excerpt: 'excerpt text',
      evidence_location: null,
      confidence: 'medium',
      extractor: 'heuristic',
      extraction_method: 'heuristic_key_point',
      created_at: '2026-05-12T00:00:00.000Z',
      review_state: 'candidate',
    };
    await appendFile(
      join(packPath, 'sections', '06-evidence-custody-curated', 'claims.jsonl'),
      JSON.stringify(claim) + '\n',
      'utf8',
    );
  }

  for (const c of claimsData) {
    if (c.decision === null) continue; // unreviewed — no review entry
    await appendFile(
      join(packPath, 'sections', '06-evidence-custody-curated', 'claim-reviews.jsonl'),
      JSON.stringify({
        claim_id: c.claim_id,
        decision: c.decision,
        reason: 'fixture',
        finding_ids: [],
        reviewer: 'heuristic',
        review_method: 'heuristic_field_and_grounding_checks',
        created_at: '2026-05-12T00:00:01.000Z',
      }) + '\n',
      'utf8',
    );
  }

  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(
    join(packPath, 'audits', '06-evidence-custody-curated-gate.json'),
    JSON.stringify({
      section_id: '06-evidence-custody-curated',
      verdict: 'warn',
      summary: 'fixture',
      checked_at: '2026-05-12T00:00:02.000Z',
      synthesis_eligible: true,
      gate_results: [],
      failures: [],
      warnings: [],
      waivers_applied: [],
      blocking_reasons: [],
      claim_counts: { total: 0, candidate: 0, with_evidence_excerpt: 0, with_source_hashes: 0, with_scope: 0, with_not: 0, universal_scope_null: 0, orphans: 0 },
      source_counts: { total: 2, primary: 0, secondary: 2, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 1, failed_fetches: 0, section_primary: 0, section_independent_publishers: 1 },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 2 },
      scope_integrity_summary: { universal_claims: 0, scoped_claims: 3, with_not_constraint: 3, overgen_risks_total: 0, overgen_risks_blocking: 0 },
      next_actions: [],
    }, null, 2),
    'utf8',
  );

  return;
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-hardban-'));
  await setupPack();
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('hard-ban: frame_excluded / rejected / unreviewed claims MUST NOT appear in prose support', () => {
  it('zero forbidden claim IDs appear in any support_bundle.claim_ids', async () => {
    const FORBIDDEN_IDS = [
      'clm_aaaaaaaaaaaa_heuristic_3',  // frame_excluded
      'clm_bbbbbbbbbbbb_heuristic_2',  // rejected
      'clm_bbbbbbbbbbbb_heuristic_3',  // unreviewed
    ];

    await coworkHandoff({ packPath });
    const result = await sectionSynthesis({
      sectionId: '06-evidence-custody-curated',
      packPath,
      mcpClient: makeFakeClient(),
    });

    expect(result.proseGenerated).toBe(true);
    expect(result.proseMarkdownPath).not.toBeNull();

    // Read the JSON and inspect every support bundle.
    const json = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const prose = json.prose as Record<string, unknown> | undefined;
    expect(prose).toBeDefined();

    const paragraphs = (prose?.paragraphs ?? []) as Array<{
      support_bundle: { claim_ids: string[] };
    }>;

    const allSupportClaimIds = paragraphs.flatMap((p) => p.support_bundle.claim_ids);
    for (const forbiddenId of FORBIDDEN_IDS) {
      expect(allSupportClaimIds).not.toContain(forbiddenId);
    }
  });

  it('only accepted_for_synthesis claim IDs appear in support bundles', async () => {
    const ACCEPTED_IDS = new Set([
      'clm_aaaaaaaaaaaa_heuristic_1',
      'clm_aaaaaaaaaaaa_heuristic_2',
      'clm_bbbbbbbbbbbb_heuristic_1',
    ]);

    await coworkHandoff({ packPath });
    const result = await sectionSynthesis({
      sectionId: '06-evidence-custody-curated',
      packPath,
      mcpClient: makeFakeClient(),
    });

    const json = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    const prose = json.prose as Record<string, unknown> | undefined;
    const paragraphs = (prose?.paragraphs ?? []) as Array<{
      support_bundle: { claim_ids: string[] };
    }>;

    const allSupportClaimIds = paragraphs.flatMap((p) => p.support_bundle.claim_ids);
    for (const id of allSupportClaimIds) {
      expect(ACCEPTED_IDS.has(id)).toBe(true);
    }
  });
});
