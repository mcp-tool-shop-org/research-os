// A-SYNTH-001 (MED, bug) regression.
//
// Invariant: a malformed JSONL line or malformed JSON source card encountered
// by the synth readers (src/synth/run.ts + src/synth/section-run.ts) is
// surfaced as a STRUCTURED ResearchOSError (code MALFORMED_DATA_FILE, with an
// actionable hint naming the offending file/line) — NOT a raw SyntaxError /
// ZodError leaked to the CLI as 'research-os: <raw stack>'.
//
// Both halves proven:
//   BAD : a corrupt claims.jsonl line / corrupt source card → ResearchOSError
//         with code MALFORMED_DATA_FILE (a structured error, not a raw stack).
//   GOOD: a well-formed pack synthesizes without throwing.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, appendFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { handoff as coworkHandoff } from '../../src/cowork/index.js';
import { sectionSynthesis } from '../../src/synth/index.js';
import { ResearchOSError } from '../../src/errors.js';
import type { ProseCallToolClient } from '../../src/synth/prose/types.js';

let workDir: string;
let packPath: string;

const SECTION = '06-evidence-custody';

const SOURCES = [
  { id: 'src_aaaaaaaaaaaa', publisher: 'DVC', suffix: 'aaaaaaaaaaaa' },
  { id: 'src_bbbbbbbbbbbb', publisher: 'MLflow', suffix: 'bbbbbbbbbbbb' },
] as const;

function claimId(srcSuffix: string, n: number): string {
  return `clm_${srcSuffix}_heuristic_${n}`;
}

const ACCEPTED_CLAIM_IDS = [
  claimId('aaaaaaaaaaaa', 1),
  claimId('aaaaaaaaaaaa', 2),
  claimId('bbbbbbbbbbbb', 1),
  claimId('bbbbbbbbbbbb', 2),
];

function makeFakeClient(): ProseCallToolClient {
  return {
    async callTool(params) {
      const args = params.arguments as Record<string, unknown>;
      const text = typeof args.text === 'string' ? args.text : '';
      if (text.includes('Assign each') || text.includes('Admission rule')) {
        const matches = text.match(/clm_\w+/g) ?? [];
        const ids = Array.from(new Set(matches));
        const assignments = ids.map((id, i) => ({
          claim_id: id,
          role: i === 0 ? 'answer' : 'evidence',
          role_rationale: 'fixture rationale',
        }));
        return { content: [{ type: 'text', text: JSON.stringify({ result: { ok: true, data: { assignments } } }) }] };
      }
      if (text.includes('Write ONE readable')) {
        return { content: [{ type: 'text', text: JSON.stringify({ result: { ok: true, data: { paragraph: 'A fixture paragraph.' } } }) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ result: { ok: true, data: { decision: 'faithful', rationale: 'restates claims' } } }) }] };
    },
  };
}

async function writeClaimRow(cid: string, sourceId: string): Promise<void> {
  await appendFile(
    join(packPath, 'sections', SECTION, 'claims.jsonl'),
    JSON.stringify({
      claim_id: cid,
      section_id: SECTION,
      source_ids: [sourceId],
      source_hashes: ['a'.repeat(64)],
      asserts: `claim ${cid}: tools track artifacts by content hash`,
      scope: 'ML pipeline artifact tracking',
      not: 'general-purpose file backup',
      evidence_excerpt: `Excerpt for ${cid}`,
      evidence_location: null,
      confidence: 'medium',
      extractor: 'ollama-intern',
      extraction_method: 'ollama_intern_span_first',
      created_at: '2026-05-12T00:00:00.000Z',
      review_state: 'candidate',
      frame_excluded: false,
    }) + '\n',
    'utf8',
  );
}

async function buildFixture(): Promise<void> {
  const r = await init({ topic: 'evidence custody malformed test', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: SECTION, purpose: 'How is evidence custody preserved?', packPath });

  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  for (const src of SOURCES) {
    await writeFile(
      join(cardDir, `${src.id}.json`),
      JSON.stringify({
        source_id: src.id,
        receipt_id: `rcpt_${src.suffix}_1`,
        section_id: SECTION,
        url: `https://example.com/${src.id}`,
        final_url: `https://example.com/${src.id}`,
        fetched_at: '2026-05-12T00:00:00.000Z',
        publisher: src.publisher,
        published_at: null,
        title: `${src.publisher} docs`,
        source_type: 'docs',
        relevance: 'high',
        key_points: ['k'],
        limitations: [],
        asserts: 'evidence custody matters',
        scope: 'ML pipeline artifact tracking',
        not: 'general file backup',
        extracted_by: 'ollama-intern',
        extracted_at: '2026-05-12T00:00:00.000Z',
      }),
      'utf8',
    );
    await appendFile(
      join(packPath, 'sections', SECTION, 'sources.jsonl'),
      JSON.stringify({ source_id: src.id, added_at: '2026-05-12T00:00:00.000Z' }) + '\n',
      'utf8',
    );
  }

  const sourceMap: Record<string, string> = {
    aaaaaaaaaaaa: 'src_aaaaaaaaaaaa',
    bbbbbbbbbbbb: 'src_bbbbbbbbbbbb',
  };
  for (const cid of ACCEPTED_CLAIM_IDS) {
    await writeClaimRow(cid, sourceMap[cid.split('_')[1]!]!);
    await appendFile(
      join(packPath, 'sections', SECTION, 'claim-reviews.jsonl'),
      JSON.stringify({
        claim_id: cid,
        decision: 'accepted_for_synthesis',
        reason: 'well-grounded',
        finding_ids: [],
        reviewer: 'ollama-intern',
        review_method: 'ollama_intern_two_pass',
        created_at: '2026-05-12T00:00:01.000Z',
      }) + '\n',
      'utf8',
    );
  }

  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(
    join(packPath, 'audits', `${SECTION}-gate.json`),
    JSON.stringify({
      section_id: SECTION,
      verdict: 'pass',
      summary: 'eligible',
      checked_at: '2026-05-12T00:00:02.000Z',
      synthesis_eligible: true,
      gate_results: [],
      failures: [],
      warnings: [],
      waivers_applied: [],
      blocking_reasons: [],
      claim_counts: { total: 4, candidate: 0, with_evidence_excerpt: 4, with_source_hashes: 4, with_scope: 4, with_not: 4, universal_scope_null: 0, orphans: 0 },
      source_counts: { total: 2, primary: 0, secondary: 0, forum: 0, benchmark: 0, docs: 2, unknown: 0, independent_publishers: 2, failed_fetches: 0, section_primary: 0, section_independent_publishers: 2 },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 2 },
      scope_integrity_summary: { universal_claims: 0, scoped_claims: 4, with_not_constraint: 4, overgen_risks_total: 0, overgen_risks_blocking: 0 },
      next_actions: [],
    }, null, 2),
    'utf8',
  );

  await coworkHandoff({ packPath });
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-synth-malformed-'));
  await buildFixture();
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('A-SYNTH-001 — malformed synth inputs surface a structured error', () => {
  it('GOOD: a well-formed pack synthesizes without throwing', async () => {
    const result = await sectionSynthesis({ sectionId: SECTION, packPath, mcpClient: makeFakeClient() });
    expect(result.acceptedClaims).toBe(ACCEPTED_CLAIM_IDS.length);
  });

  it('BAD: a malformed claims.jsonl line throws MALFORMED_DATA_FILE (not a raw SyntaxError)', async () => {
    // Append a line that is not valid JSON.
    await appendFile(
      join(packPath, 'sections', SECTION, 'claims.jsonl'),
      '{ this is not valid json \n',
      'utf8',
    );

    const err = await sectionSynthesis({ sectionId: SECTION, packPath, mcpClient: makeFakeClient() }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ResearchOSError);
    expect((err as ResearchOSError).code).toBe('MALFORMED_DATA_FILE');
    expect((err as ResearchOSError).hint).toBeTruthy();
    // The error names the offending file and the line number.
    expect((err as ResearchOSError).message).toContain('claims.jsonl');
    // It is NOT a bare SyntaxError or ZodError.
    expect((err as Error).name).not.toBe('SyntaxError');
    expect((err as Error).name).not.toBe('ZodError');
  });

  it('BAD: a malformed source-card JSON throws MALFORMED_DATA_FILE (not a raw error)', async () => {
    // Corrupt one of the source cards that the accepted claims reference.
    await writeFile(
      join(packPath, 'evidence', 'source-cards', 'src_aaaaaaaaaaaa.json'),
      '{ broken json',
      'utf8',
    );

    const err = await sectionSynthesis({ sectionId: SECTION, packPath, mcpClient: makeFakeClient() }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ResearchOSError);
    expect((err as ResearchOSError).code).toBe('MALFORMED_DATA_FILE');
    expect((err as ResearchOSError).message).toContain('src_aaaaaaaaaaaa.json');
  });
});
