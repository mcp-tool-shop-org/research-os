/**
 * Stage B — B-RECOVER-001 (future-proofing): partial-pack must not blindly
 * overwrite the canonical recovery artifact when pack state is unchanged.
 *
 * The default partialPackSynthesis() path calls buildRecoveryArtifact() then
 * writeRecoveryArtifact(), which OVERWRITES
 * recovery/blocked-section-recovery.json in place with a fresh
 * input_state_hash and NO regeneration-history entry. When pack state has
 * NOT changed since a prior recover run, that overwrite is a no-op-with-side-
 * effects that can desync the R-014 regeneration ledger's last
 * new_state_hash from the artifact on disk (classifyRegenerationReason would
 * then misattribute a later regenerate to 'state_changed').
 *
 * Fix: mirror recoverPack's no-op short-circuit — when the canonical artifact
 * already exists and its input_state_hash matches the freshly-computed hash,
 * SKIP the overwrite.
 *
 * Both halves proven:
 *   RED   — without the short-circuit, the canonical recovery JSON is
 *           rewritten on the second run, clobbering a sentinel we injected.
 *   GREEN — the second run preserves the sentinel (overwrite skipped) because
 *           pack state (hence input_state_hash) is unchanged.
 *   Happy path — the FIRST run still writes a valid canonical recovery
 *           artifact with an input_state_hash, and the partial-pack artifact
 *           itself is still produced on the second run.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  mkdir,
  appendFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { handoff as coworkHandoff } from '../../src/cowork/index.js';
import { partialPackSynthesis } from '../../src/synth/index.js';
import type { ProseCallToolClient } from '../../src/synth/prose/types.js';

let workDir: string;
let packPath: string;

const SECTION_GOOD = '06-good-section';
const SECTION_BLOCKED = '01-blocked-section';

const RECOVERY_JSON = join('recovery', 'blocked-section-recovery.json');

function makeFakeClient(): ProseCallToolClient {
  return {
    async callTool(params) {
      const args = params.arguments as Record<string, unknown>;
      const text = typeof args.text === 'string' ? args.text : '';
      const idMatches = text.match(/\[([0-9]{2}-[a-z0-9-]+:p\d+)\]/g) ?? [];
      const ids = Array.from(new Set(idMatches.map((m) => m.slice(1, -1))));
      const data = {
        paragraphs: [
          {
            role: 'answer',
            text: 'Evidence custody in this pack requires content-hash version control plus PROV-derived provenance, confirmed across DVC and The Turing Way.',
            section_paragraph_ids: ids,
          },
          {
            role: 'evidence',
            text: 'The included section paragraphs converge on artifact-tracking via content hashes.',
            section_paragraph_ids: ids,
          },
        ],
      };
      return {
        content: [{ type: 'text', text: JSON.stringify({ result: { ok: true, data } }) }],
      };
    },
  };
}

async function buildPackFixture(): Promise<void> {
  const r = await init({
    topic: 'Partial-pack recovery no-op fixture — evidence custody',
    outDir: workDir,
  });
  packPath = r.packPath;

  await sectionAdd({ id: SECTION_BLOCKED, purpose: 'Section deliberately blocked to test exclusion', packPath });
  await sectionAdd({ id: SECTION_GOOD, purpose: 'What does evidence custody require in a local-first workflow?', packPath });

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
        { family: 'accepted_claim_floor', check: 'min_accepted_claims', status: 'fail', detail: '0 of 3', evidence: [], blocks_synthesis: true },
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
  workDir = await mkdtemp(join(tmpdir(), 'ros-synth-recovery-noop-'));
  await buildPackFixture();
  await coworkHandoff({ packPath });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('B-RECOVER-001 — partial-pack skips canonical recovery overwrite when state unchanged', () => {
  it('happy path: first run writes a canonical recovery artifact carrying an input_state_hash', async () => {
    await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    const recoveryPath = join(packPath, RECOVERY_JSON);
    expect(existsSync(recoveryPath)).toBe(true);
    const artifact = JSON.parse(await readFile(recoveryPath, 'utf8')) as Record<string, unknown>;
    expect(typeof artifact.input_state_hash).toBe('string');
    expect((artifact.input_state_hash as string).length).toBeGreaterThan(0);
  });

  it('second run with unchanged state does NOT overwrite the canonical recovery artifact', async () => {
    // Run 1 — produces recovery/blocked-section-recovery.json with hash H.
    const result1 = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    expect(existsSync(result1.jsonPath)).toBe(true);

    const recoveryPath = join(packPath, RECOVERY_JSON);
    const afterRun1 = JSON.parse(await readFile(recoveryPath, 'utf8')) as Record<string, unknown>;
    const hash = afterRun1.input_state_hash as string;
    expect(typeof hash).toBe('string');

    // Stamp a sentinel onto a field that (a) still satisfies the strict
    // RecoveryArtifactSchema and (b) is NOT part of the input_state_hash
    // projection — `generated_at` qualifies (the hash covers only the
    // per-section diagnoses). If the overwrite is correctly skipped (state
    // unchanged), the sentinel timestamp survives. The original code
    // unconditionally rewrites the file with a fresh generated_at, clobbering
    // it. (An unknown key cannot be used as a sentinel here: the strict schema
    // makes readExistingRecoveryArtifact reject it, which would itself force a
    // rewrite and mask the bug.)
    const SENTINEL_TS = '2000-01-01T00:00:00.000Z';
    const sentinelled = { ...afterRun1, generated_at: SENTINEL_TS };
    await writeFile(recoveryPath, JSON.stringify(sentinelled, null, 2), 'utf8');

    // Run 2 — pack state is byte-for-byte identical → same input_state_hash.
    const result2 = await partialPackSynthesis({ packPath, mcpClient: makeFakeClient() });
    // Partial-pack artifact itself is still produced (happy path unchanged).
    expect(existsSync(result2.jsonPath)).toBe(true);

    const afterRun2 = JSON.parse(await readFile(recoveryPath, 'utf8')) as Record<string, unknown>;
    // Sentinel survives → the canonical recovery overwrite was skipped.
    expect(afterRun2.generated_at).toBe(SENTINEL_TS);
    // And the hash is unchanged (sanity: state really was identical).
    expect(afterRun2.input_state_hash).toBe(hash);
  });
});
