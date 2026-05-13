// Test classes 5 + 6: Status preservation and freeze/publish invariant.
//
// Test class 5: pack in repair_required mode → status: partial_synthesis in JSON
//               + explicit disclosure callout in the Markdown.
// Test class 6: generating prose for one section MUST NOT change pack freeze or
//               pack publish behavior — both must continue to refuse the whole pack.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { handoff as coworkHandoff } from '../src/cowork/index.js';
import { sectionSynthesis } from '../src/synth/index.js';
import { freeze as runFreeze } from '../src/freeze/index.js';
import type { ProseCallToolClient } from '../src/synth/prose/types.js';

let workDir: string;
let packPath: string;

// Minimal fake client — produces valid pipeline responses.
function makeFakeClient(): ProseCallToolClient {
  return {
    async callTool(params) {
      const args = params.arguments as Record<string, unknown>;
      const text = typeof args.text === 'string' ? args.text : '';
      if (text.includes('Assign each') || text.includes('assign each')) {
        const ids = Array.from(new Set((text.match(/clm_[a-f0-9_]+/g) ?? [])));
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              result: { ok: true, data: ids.map((id) => ({ claim_id: id, role: 'evidence' })) },
            }),
          }],
        };
      }
      if (text.includes('Write ONE readable')) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ result: { ok: true, data: { paragraph: 'Test paragraph about local-first storage reliability.' } } }),
          }],
        };
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ result: { ok: true, data: { decision: 'faithful', rationale: 'ok' } } }),
        }],
      };
    },
  };
}

interface SectionFixture {
  id: string;
  purpose: string;
  sourceId: string;
  claimId: string;
  eligible: boolean;
}

async function writeFixtureSection(fix: SectionFixture): Promise<void> {
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  const card = {
    source_id: fix.sourceId,
    receipt_id: `rcpt_${fix.sourceId.replace('src_', '')}_1`,
    section_id: fix.id,
    url: `https://example.com/${fix.sourceId}`,
    final_url: `https://example.com/${fix.sourceId}`,
    fetched_at: '2026-05-12T00:00:00.000Z',
    publisher: 'Test Publisher',
    published_at: null,
    title: `Title ${fix.sourceId}`,
    source_type: 'secondary',
    relevance: 'high',
    key_points: [],
    limitations: [],
    asserts: 'test',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-12T00:00:00.000Z',
  };
  await writeFile(join(cardDir, `${fix.sourceId}.json`), JSON.stringify(card), 'utf8');
  await appendFile(
    join(packPath, 'sections', fix.id, 'sources.jsonl'),
    JSON.stringify({ source_id: fix.sourceId, added_at: '2026-05-12T00:00:00.000Z' }) + '\n',
    'utf8',
  );
  await appendFile(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    JSON.stringify({
      receipt_id: `rcpt_${fix.sourceId.replace('src_', '')}_1`,
      source_id: fix.sourceId,
      section_id: fix.id,
      requested_url: `https://example.com/${fix.sourceId}`,
      final_url: `https://example.com/${fix.sourceId}`,
      status: 200,
      status_text: 'OK',
      content_type: 'text/html',
      fetched_at: '2026-05-12T00:00:00.000Z',
      byte_count: 100,
      sha256: createHash('sha256').update(fix.sourceId).digest('hex'),
      title: `Title ${fix.sourceId}`,
      raw_text_path: `evidence/raw/${fix.sourceId}.txt`,
      fetch_outcome: 'ok',
      fetch_error: null,
      extraction_outcome: 'ok',
      extraction_extractor: 'heuristic',
      extraction_error: null,
    }) + '\n',
    'utf8',
  );

  const claim = {
    claim_id: fix.claimId,
    section_id: fix.id,
    source_ids: [fix.sourceId],
    source_hashes: ['a'.repeat(64)],
    asserts: `assertion for ${fix.claimId}`,
    scope: 'narrow scope',
    not: 'broad scope',
    evidence_excerpt: 'excerpt',
    evidence_location: null,
    confidence: 'medium',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-05-12T00:00:00.000Z',
    review_state: 'candidate',
  };
  await appendFile(
    join(packPath, 'sections', fix.id, 'claims.jsonl'),
    JSON.stringify(claim) + '\n',
    'utf8',
  );
  await appendFile(
    join(packPath, 'sections', fix.id, 'claim-reviews.jsonl'),
    JSON.stringify({
      claim_id: fix.claimId,
      decision: fix.eligible ? 'accepted_for_synthesis' : 'rejected',
      reason: 'fixture',
      finding_ids: [],
      reviewer: 'heuristic',
      review_method: 'heuristic_field_and_grounding_checks',
      created_at: '2026-05-12T00:00:01.000Z',
    }) + '\n',
    'utf8',
  );

  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(
    join(packPath, 'audits', `${fix.id}-gate.json`),
    JSON.stringify({
      section_id: fix.id,
      verdict: fix.eligible ? 'warn' : 'blocked',
      summary: 'fixture',
      checked_at: '2026-05-12T00:00:02.000Z',
      synthesis_eligible: fix.eligible,
      gate_results: [],
      failures: fix.eligible ? [] : [{
        family: 'accepted_claim_floor',
        check: 'min_accepted_claims',
        status: 'fail',
        detail: 'fixture',
        evidence: [],
        blocks_synthesis: true,
      }],
      warnings: [],
      waivers_applied: [],
      blocking_reasons: fix.eligible ? [] : ['accepted_claim_floor: 0/3'],
      claim_counts: { total: 1, candidate: 0, with_evidence_excerpt: 1, with_source_hashes: 1, with_scope: 1, with_not: 1, universal_scope_null: 0, orphans: 0 },
      source_counts: { total: 1, primary: 0, secondary: 1, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 1, failed_fetches: 0, section_primary: 0, section_independent_publishers: 1 },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 1 },
      scope_integrity_summary: { universal_claims: 0, scoped_claims: 1, with_not_constraint: 1, overgen_risks_total: 0, overgen_risks_blocking: 0 },
      next_actions: [],
    }, null, 2),
    'utf8',
  );
}

async function setupRepairRequiredPack(): Promise<{ eligibleId: string; blockedId: string }> {
  const r = await init({ topic: 'status preservation test', outDir: workDir });
  packPath = r.packPath;

  await sectionAdd({ id: '01-blocked-section', purpose: 'Blocked section', packPath });
  await sectionAdd({ id: '06-eligible-section', purpose: 'Eligible section', packPath });

  await writeFixtureSection({
    id: '01-blocked-section',
    purpose: 'Blocked section',
    sourceId: 'src_aaaaaaaaaaaa',
    claimId: 'clm_aaaaaaaaaaaa_heuristic_1',
    eligible: false,
  });
  await writeFixtureSection({
    id: '06-eligible-section',
    purpose: 'Eligible section for prose synthesis',
    sourceId: 'src_bbbbbbbbbbbb',
    claimId: 'clm_bbbbbbbbbbbb_heuristic_1',
    eligible: true,
  });

  return { eligibleId: '06-eligible-section', blockedId: '01-blocked-section' };
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-prose-status-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('test class 5: status preservation', () => {
  it('produces status: partial_synthesis in JSON when pack is repair_required', async () => {
    const { eligibleId } = await setupRepairRequiredPack();
    const ho = await coworkHandoff({ packPath });
    expect(ho.mode).toBe('repair_required');

    const result = await sectionSynthesis({
      sectionId: eligibleId,
      packPath,
      mcpClient: makeFakeClient(),
    });

    const json = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    expect(json.status).toBe('partial_synthesis');
    expect(json.pack_mode).toBe('repair_required');
    expect(json.not_freezable_as_pack).toBe(true);
    expect(json.not_publishable_as_pack).toBe(true);
  });

  it('section-synthesis.md contains the disclosure callout when pack is repair_required', async () => {
    const { eligibleId } = await setupRepairRequiredPack();
    await coworkHandoff({ packPath });

    const result = await sectionSynthesis({
      sectionId: eligibleId,
      packPath,
      mcpClient: makeFakeClient(),
    });

    expect(result.proseMarkdownPath).not.toBeNull();
    const md = await readFile(result.proseMarkdownPath!, 'utf8');
    expect(md).toContain('partial_synthesis');
    expect(md).toContain('repair_required');
    expect(md).toMatch(/NOT freezable|NOT a pack-level/);
  });

  it('prose block is present in section-synthesis.json after successful prose run', async () => {
    const { eligibleId } = await setupRepairRequiredPack();
    await coworkHandoff({ packPath });

    const result = await sectionSynthesis({
      sectionId: eligibleId,
      packPath,
      mcpClient: makeFakeClient(),
    });

    expect(result.proseGenerated).toBe(true);
    const json = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    expect(json).toHaveProperty('prose');
    const prose = json.prose as Record<string, unknown>;
    expect(prose).toHaveProperty('section_purpose');
    expect(prose).toHaveProperty('paragraphs');
    expect(Array.isArray(prose.paragraphs)).toBe(true);
  });
});

describe('test class 6: freeze/publish invariant', () => {
  it('pack freeze still refuses after prose synthesis is run', async () => {
    const { eligibleId } = await setupRepairRequiredPack();
    await coworkHandoff({ packPath });

    await sectionSynthesis({
      sectionId: eligibleId,
      packPath,
      mcpClient: makeFakeClient(),
    });

    const freezeResult = await runFreeze({ packPath });
    expect(freezeResult.verdict).toBe('refused');
  });

  it('section-synthesis.md does NOT appear in pack-level synthesis/ directory', async () => {
    const { eligibleId } = await setupRepairRequiredPack();
    await coworkHandoff({ packPath });

    await sectionSynthesis({
      sectionId: eligibleId,
      packPath,
      mcpClient: makeFakeClient(),
    });

    // Pack-level synthesis/ must remain clear of the new artifact.
    expect(existsSync(join(packPath, 'synthesis', 'section-synthesis.md'))).toBe(false);
    expect(existsSync(join(packPath, 'synthesis', 'cross-section-map.json'))).toBe(false);
    // The new file lives ONLY in sections/<id>/synthesis/.
    expect(existsSync(join(packPath, 'sections', eligibleId, 'synthesis', 'section-synthesis.md'))).toBe(true);
  });

  it('section-brief.md is still present after prose run (existing artifact preserved)', async () => {
    const { eligibleId } = await setupRepairRequiredPack();
    await coworkHandoff({ packPath });

    const result = await sectionSynthesis({
      sectionId: eligibleId,
      packPath,
      mcpClient: makeFakeClient(),
    });

    expect(existsSync(result.markdownPath)).toBe(true);
    const brief = await readFile(result.markdownPath, 'utf8');
    expect(brief).toContain('Section Synthesis (Partial)');
  });

  it('section-synthesis.json still has all manifest fields after prose overwrites it', async () => {
    const { eligibleId } = await setupRepairRequiredPack();
    await coworkHandoff({ packPath });

    const result = await sectionSynthesis({
      sectionId: eligibleId,
      packPath,
      mcpClient: makeFakeClient(),
    });

    const json = JSON.parse(await readFile(result.jsonPath, 'utf8')) as Record<string, unknown>;
    // All original manifest fields must still be present.
    expect(json).toHaveProperty('status');
    expect(json).toHaveProperty('scope');
    expect(json).toHaveProperty('section_id');
    expect(json).toHaveProperty('pack_id');
    expect(json).toHaveProperty('accepted_claim_ids');
    expect(json).toHaveProperty('source_ids');
    expect(json).toHaveProperty('waivers_applied');
    expect(json).toHaveProperty('gate_verdict');
    expect(json).toHaveProperty('generated_at');
    expect(json).toHaveProperty('research_os_version');
    // AND the new prose block.
    expect(json).toHaveProperty('prose');
  });
});
