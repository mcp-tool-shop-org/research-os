// A-SYNTH-002 (LOW, bug) regression.
//
// Invariant: the PACK-LEVEL accepted set is binding for section synthesis.
// A claim that appears in a section-state's `accepted_claim_ids` but is ABSENT
// from the pack-level `accepted_claim_ids` MUST NOT be synthesized — even
// though the per-section `acceptedIdsCrossCheckOk` boolean flags the
// divergence. Previously the synthesized-claim filter used the un-intersected
// section list, so a divergent claim leaked into the accepted-claims set.
//
// Both halves proven:
//   BAD : a claim in the section list but NOT in the pack-level list is
//         excluded from acceptedClaims (and the cross-check reports not-ok).
//   GOOD: a claim in BOTH lists is still synthesized.
//
// Fixture is generated through the real cowork pipeline so the handoff is
// schema-valid; we then mutate the on-disk handoff to inject the divergence
// (adding an id to the section list only — still valid per the z.array(string)
// schema).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { handoff as coworkHandoff } from '../../src/cowork/index.js';
import { sectionSynthesis } from '../../src/synth/index.js';
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

// 4 accepted claims across 2 sources (clears the accepted_claim_floor of 3/2).
const ACCEPTED_CLAIM_IDS = [
  claimId('aaaaaaaaaaaa', 1),
  claimId('aaaaaaaaaaaa', 2),
  claimId('bbbbbbbbbbbb', 1),
  claimId('bbbbbbbbbbbb', 2),
];

// Prose pipeline is irrelevant to this finding; a no-op-ish fake keeps
// sectionSynthesis from spawning a subprocess. We assert on the returned
// `acceptedClaims` count, which is computed BEFORE prose generation.
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

async function buildFixture(): Promise<void> {
  const r = await init({ topic: 'evidence custody binding test', outDir: workDir });
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
    const suffix = cid.split('_')[1]!;
    await appendFile(
      join(packPath, 'sections', SECTION, 'claims.jsonl'),
      JSON.stringify({
        claim_id: cid,
        section_id: SECTION,
        source_ids: [sourceMap[suffix]],
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
  workDir = await mkdtemp(join(tmpdir(), 'research-os-synth-binding-'));
  await buildFixture();
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const DIVERGENT_ID = claimId('aaaaaaaaaaaa', 99); // present in section list only

async function injectDivergence(): Promise<void> {
  const handoffPath = join(packPath, 'handoffs', 'cowork-handoff.json');
  const payload = JSON.parse(await readFile(handoffPath, 'utf8')) as {
    accepted_claim_ids: string[];
    sections: Array<{ section_id: string; accepted_claim_ids: string[] }>;
  };
  const section = payload.sections.find((s) => s.section_id === SECTION)!;
  // Add a divergent id to the SECTION list only — NOT the pack-level list.
  section.accepted_claim_ids.push(DIVERGENT_ID);
  // Also write a real claim row for the divergent id so it WOULD be picked up
  // if the (buggy) section-list filter were used.
  await appendFile(
    join(packPath, 'sections', SECTION, 'claims.jsonl'),
    JSON.stringify({
      claim_id: DIVERGENT_ID,
      section_id: SECTION,
      source_ids: ['src_aaaaaaaaaaaa'],
      source_hashes: ['a'.repeat(64)],
      asserts: 'divergent claim not in pack-level accepted set',
      scope: 'ML pipeline artifact tracking',
      not: 'general-purpose file backup',
      evidence_excerpt: 'divergent excerpt',
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
  await writeFile(handoffPath, JSON.stringify(payload, null, 2), 'utf8');
}

describe('A-SYNTH-002 — pack-level accepted set is binding for section synthesis', () => {
  it('GOOD: with no divergence all section-accepted claims are synthesized', async () => {
    const result = await sectionSynthesis({ sectionId: SECTION, packPath, mcpClient: makeFakeClient() });
    expect(result.acceptedClaims).toBe(ACCEPTED_CLAIM_IDS.length);
    expect(result.acceptedIdsCrossCheckOk).toBe(true);
  });

  it('BAD: a claim in the section list but absent from the pack-level list is NOT synthesized', async () => {
    await injectDivergence();
    const result = await sectionSynthesis({ sectionId: SECTION, packPath, mcpClient: makeFakeClient() });
    // The divergent claim must NOT be counted as accepted — the intersection
    // is binding. Count stays at the original pack-accepted size.
    expect(result.acceptedClaims).toBe(ACCEPTED_CLAIM_IDS.length);
    // And the divergence is honestly reported.
    expect(result.acceptedIdsCrossCheckOk).toBe(false);
  });
});
