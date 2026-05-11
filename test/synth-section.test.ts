/**
 * v0.7.1 — section-scoped synthesis path.
 *
 * Fresh-pack failure shape used as fixture:
 * - Section A is blocked at gate (0 accepted claims → synthesis_eligible=false).
 *   Preserved-as-evidence; must remain untouched by section synthesis.
 * - Section B is gate-eligible (3 accepted claims from 2 distinct sources;
 *   synthesis_eligible=true).
 * - Cowork handoff is in `repair_required` mode because of section A.
 *
 * Assertions cover:
 * - `synth section <B>` succeeds, writes `sections/<B>/synthesis/section-brief.md`
 *   and `section-synthesis.json` with `status: "partial_synthesis"` +
 *   `not_freezable_as_pack: true`.
 * - Section A's directory is unchanged after the run.
 * - `pack freeze` still refuses (pack-level invariants preserved).
 * - `synth section <A>` is refused with a structured error.
 * - `synth workspace --section <B>` is the alias-spelling and produces the
 *   same artifacts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { handoff as coworkHandoff } from '../src/cowork/index.js';
import { workspace, sectionSynthesis, SectionNotSynthesisEligibleError } from '../src/synth/index.js';
import { freeze as runFreeze } from '../src/freeze/index.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';
import { SectionNotFoundError } from '../src/errors.js';

let workDir: string;
let packPath: string;

interface SectionFixture {
  id: string;
  purpose: string;
  source: { source_id: string; publisher: string };
  claims: Array<{ claim_id: string }>;
  reviews: Array<{ claim_id: string; decision: string }>;
  /** Force-write a section gate audit JSON to drive synthesis_eligible. */
  gate: {
    verdict: 'pass' | 'warn' | 'fail' | 'blocked';
    synthesis_eligible: boolean;
    blocking_reasons?: string[];
  };
  /** Optional second source for diversity. */
  extraSource?: { source_id: string; publisher: string };
  extraClaim?: { claim_id: string; source_id: string };
  promoteTo?: 'gated' | 'reviewed';
}

async function writeSection(fix: SectionFixture, multiSection = false): Promise<void> {
  if (multiSection) {
    await sectionAdd({ id: fix.id, purpose: fix.purpose, packPath });
  }
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  const allSources = [fix.source, ...(fix.extraSource ? [fix.extraSource] : [])];
  for (const s of allSources) {
    const card = {
      source_id: s.source_id,
      receipt_id: `rcpt_${s.source_id.replace(/^src_/, '')}_1`,
      section_id: fix.id,
      url: `https://example.com/${s.source_id}`,
      final_url: `https://example.com/${s.source_id}`,
      fetched_at: '2026-05-11T22:00:00.000Z',
      publisher: s.publisher,
      published_at: null,
      title: `Title for ${s.source_id}`,
      source_type: 'secondary',
      relevance: 'unknown',
      key_points: [],
      limitations: [],
      asserts: `Claim from ${s.source_id}`,
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-11T22:00:00.000Z',
    };
    await writeFile(join(cardDir, `${s.source_id}.json`), JSON.stringify(card), 'utf8');
    await appendFile(
      join(packPath, 'sections', fix.id, 'sources.jsonl'),
      JSON.stringify({ source_id: s.source_id, added_at: '2026-05-11T22:00:01.000Z' }) + '\n',
      'utf8',
    );
    await appendFile(
      join(packPath, 'evidence', 'fetch-log.jsonl'),
      JSON.stringify({
        receipt_id: `rcpt_${s.source_id.replace(/^src_/, '')}_1`,
        source_id: s.source_id,
        section_id: fix.id,
        requested_url: `https://example.com/${s.source_id}`,
        final_url: `https://example.com/${s.source_id}`,
        status: 200,
        status_text: 'OK',
        content_type: 'text/html',
        fetched_at: '2026-05-11T22:00:00.000Z',
        byte_count: 100,
        sha256: createHash('sha256').update(s.source_id).digest('hex'),
        title: `Title for ${s.source_id}`,
        raw_text_path: `evidence/raw/${s.source_id}.html`,
        fetch_outcome: 'ok',
        fetch_error: null,
        extraction_outcome: 'ok',
        extraction_extractor: 'heuristic',
        extraction_error: null,
      }) + '\n',
      'utf8',
    );
  }

  const baseSourceId = fix.source.source_id;
  for (const c of fix.claims) {
    const claim = {
      claim_id: c.claim_id,
      section_id: fix.id,
      source_ids: [baseSourceId],
      source_hashes: ['a'.repeat(64)],
      asserts: `assertion for ${c.claim_id}`,
      scope: 'narrow scope',
      not: 'broad scope',
      evidence_excerpt: `literal excerpt for ${c.claim_id}`,
      evidence_location: null,
      confidence: 'low',
      extractor: 'heuristic',
      extraction_method: 'heuristic_key_point',
      created_at: '2026-05-11T22:00:00.000Z',
      review_state: 'candidate',
    };
    await appendFile(
      join(packPath, 'sections', fix.id, 'claims.jsonl'),
      JSON.stringify(claim) + '\n',
      'utf8',
    );
  }
  if (fix.extraClaim) {
    const claim = {
      claim_id: fix.extraClaim.claim_id,
      section_id: fix.id,
      source_ids: [fix.extraClaim.source_id],
      source_hashes: ['b'.repeat(64)],
      asserts: `assertion for ${fix.extraClaim.claim_id}`,
      scope: 'narrow scope',
      not: 'broad scope',
      evidence_excerpt: `literal excerpt for ${fix.extraClaim.claim_id}`,
      evidence_location: null,
      confidence: 'low',
      extractor: 'heuristic',
      extraction_method: 'heuristic_key_point',
      created_at: '2026-05-11T22:00:00.000Z',
      review_state: 'candidate',
    };
    await appendFile(
      join(packPath, 'sections', fix.id, 'claims.jsonl'),
      JSON.stringify(claim) + '\n',
      'utf8',
    );
  }

  for (const r of fix.reviews) {
    const review = {
      claim_id: r.claim_id,
      decision: r.decision,
      reason: 'fixture',
      finding_ids: [],
      reviewer: 'heuristic',
      review_method: 'heuristic_field_and_grounding_checks',
      created_at: '2026-05-11T22:00:01.000Z',
    };
    await appendFile(
      join(packPath, 'sections', fix.id, 'claim-reviews.jsonl'),
      JSON.stringify(review) + '\n',
      'utf8',
    );
  }

  // Write the gate JSON directly to drive synthesis_eligible — bypasses the
  // gate runner so we don't have to satisfy every floor here.
  const gateRecord = {
    section_id: fix.id,
    verdict: fix.gate.verdict,
    summary: 'fixture',
    checked_at: '2026-05-11T22:00:02.000Z',
    synthesis_eligible: fix.gate.synthesis_eligible,
    gate_results: [],
    failures: fix.gate.synthesis_eligible
      ? []
      : [
          {
            family: 'accepted_claim_floor',
            check: 'min_accepted_claims',
            status: 'fail',
            detail: 'section preserved as discover-hallucination evidence',
            evidence: [],
            blocks_synthesis: true,
          },
        ],
    warnings: [],
    waivers_applied: [],
    blocking_reasons: fix.gate.blocking_reasons ?? (fix.gate.synthesis_eligible ? [] : ['accepted_claim_floor.min_accepted_claims: 0/3']),
    claim_counts: {
      total: 0,
      candidate: 0,
      with_evidence_excerpt: 0,
      with_source_hashes: 0,
      with_scope: 0,
      with_not: 0,
      universal_scope_null: 0,
      orphans: 0,
    },
    source_counts: {
      total: allSources.length,
      primary: 0,
      secondary: allSources.length,
      forum: 0,
      benchmark: 0,
      docs: 0,
      unknown: 0,
      independent_publishers: new Set(allSources.map((s) => s.publisher)).size,
      failed_fetches: 0,
      section_primary: 0,
      section_independent_publishers: new Set(allSources.map((s) => s.publisher)).size,
    },
    contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
    freshness_summary: {
      policy_required: false,
      max_source_age_months: null,
      stale_source_policy: 'warn',
      stale_count: 0,
      unknown_date_count: allSources.length,
    },
    scope_integrity_summary: {
      universal_claims: 0,
      scoped_claims: fix.claims.length,
      with_not_constraint: fix.claims.length,
      overgen_risks_total: 0,
      overgen_risks_blocking: 0,
    },
    next_actions: [],
  };
  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(
    join(packPath, 'audits', `${fix.id}-gate.json`),
    JSON.stringify(gateRecord, null, 2),
    'utf8',
  );

  if (fix.promoteTo) {
    const yamlPath = join(packPath, 'research.yaml');
    const text = await readFile(yamlPath, 'utf8');
    const research = ResearchYamlSchema.parse(yamlParse(text));
    const idx = research.sections.findIndex((s) => s.id === fix.id);
    if (idx >= 0) {
      research.sections[idx]!.status = fix.promoteTo;
      await writeFile(yamlPath, yamlStringify(research, { lineWidth: 0 }), 'utf8');
    }
  }
}

async function makeFreshPackShape(): Promise<{
  sectionA: SectionFixture;
  sectionB: SectionFixture;
}> {
  const r = await init({
    topic: 'How does section-level synthesis behave on the fresh-pack failure shape?',
    outDir: workDir,
  });
  packPath = r.packPath;

  // Section A: blocked at gate, 0 accepted (preserved-as-evidence).
  const sectionA: SectionFixture = {
    id: '01-evidence-custody',
    purpose: 'Discover-hallucination containment evidence; preserved as failed.',
    source: { source_id: 'src_aaaaaaaaaaaa', publisher: 'arXiv.org' },
    claims: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1' }],
    reviews: [{ claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', decision: 'rejected' }],
    gate: {
      verdict: 'blocked',
      synthesis_eligible: false,
      blocking_reasons: [
        'accepted_claim_floor.min_accepted_claims: 0 accepted; minimum 3 required.',
      ],
    },
  };
  await sectionAdd({ id: sectionA.id, purpose: sectionA.purpose, packPath });
  // section was added during init by sectionAdd above; pass multiSection=false
  // to avoid duplicate add.
  await writeSection(sectionA, false);

  // Section B: gate-eligible, 3 accepted claims from 2 distinct sources.
  const sectionB: SectionFixture = {
    id: '06-evidence-custody-curated',
    purpose: 'Curated-source evidence; gate-eligible.',
    source: { source_id: 'src_bbbbbbbbbbbb', publisher: 'DVC' },
    extraSource: { source_id: 'src_cccccccccccc', publisher: 'The Turing Way' },
    claims: [
      { claim_id: 'clm_bbbbbbbbbbbb_heuristic_1' },
      { claim_id: 'clm_bbbbbbbbbbbb_heuristic_2' },
    ],
    extraClaim: { claim_id: 'clm_cccccccccccc_heuristic_1', source_id: 'src_cccccccccccc' },
    reviews: [
      { claim_id: 'clm_bbbbbbbbbbbb_heuristic_1', decision: 'accepted_for_synthesis' },
      { claim_id: 'clm_bbbbbbbbbbbb_heuristic_2', decision: 'accepted_for_synthesis' },
      { claim_id: 'clm_cccccccccccc_heuristic_1', decision: 'accepted_for_synthesis' },
    ],
    gate: { verdict: 'warn', synthesis_eligible: true },
    promoteTo: 'gated',
  };
  await writeSection(sectionB, true);

  return { sectionA, sectionB };
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-synth-section-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('synth section (v0.7.1 partial synthesis)', () => {
  it('produces a partial-synthesis artifact for a gate-eligible section in a repair_required pack', async () => {
    const { sectionA, sectionB } = await makeFreshPackShape();
    const ho = await coworkHandoff({ packPath });
    expect(ho.mode).toBe('repair_required');
    expect(ho.synthesisAllowed).toBe(false);

    // Snapshot section A directory state before running the section-synth so
    // we can prove it was not modified.
    const sectionADir = join(packPath, 'sections', sectionA.id);
    const beforeAEntries = (await readdir(sectionADir)).sort();
    const beforeAClaimsJsonl = await readFile(join(sectionADir, 'claims.jsonl'), 'utf8');

    const result = await sectionSynthesis({ sectionId: sectionB.id, packPath });

    expect(result.sectionId).toBe(sectionB.id);
    expect(result.packMode).toBe('repair_required');
    expect(result.notFreezableAsPack).toBe(true);
    expect(result.notPublishableAsPack).toBe(true);
    expect(result.acceptedClaims).toBe(3);
    expect(result.sourceCount).toBe(2);
    expect(existsSync(result.jsonPath)).toBe(true);
    expect(existsSync(result.markdownPath)).toBe(true);

    const manifest = JSON.parse(await readFile(result.jsonPath, 'utf8'));
    expect(manifest.status).toBe('partial_synthesis');
    expect(manifest.scope).toBe('section');
    expect(manifest.section_id).toBe(sectionB.id);
    expect(manifest.pack_mode).toBe('repair_required');
    expect(manifest.not_freezable_as_pack).toBe(true);
    expect(manifest.not_publishable_as_pack).toBe(true);
    expect(manifest.accepted_claim_ids).toEqual(
      expect.arrayContaining([
        'clm_bbbbbbbbbbbb_heuristic_1',
        'clm_bbbbbbbbbbbb_heuristic_2',
        'clm_cccccccccccc_heuristic_1',
      ]),
    );
    expect(manifest.source_ids).toEqual(['src_bbbbbbbbbbbb', 'src_cccccccccccc']);
    expect(manifest.research_os_version).toMatch(/^\d+\.\d+\.\d+/);

    const brief = await readFile(result.markdownPath, 'utf8');
    expect(brief).toContain('# Section Synthesis (Partial)');
    expect(brief).toContain('This is a partial section-scoped synthesis');
    expect(brief).toContain('the pack is NOT freezable or publishable');
    expect(brief).toContain('clm_bbbbbbbbbbbb_heuristic_1');
    expect(brief).toContain('src_bbbbbbbbbbbb');

    // Output lives under sections/<id>/synthesis/, NOT pack-level synthesis/.
    // (The pack template creates an empty synthesis/ directory; what matters is
    // that section-scoped synthesis does NOT populate cross-section-map.json or
    // the other pack-level synthesis artifacts.)
    expect(existsSync(join(packPath, 'sections', sectionB.id, 'synthesis', 'section-synthesis.json'))).toBe(true);
    expect(existsSync(join(packPath, 'synthesis', 'cross-section-map.json'))).toBe(false);
    expect(existsSync(join(packPath, 'synthesis', 'decision-brief.md'))).toBe(false);
    expect(existsSync(join(packPath, 'synthesis', 'final-report.md'))).toBe(false);

    // Section A is untouched.
    const afterAEntries = (await readdir(sectionADir)).sort();
    const afterAClaimsJsonl = await readFile(join(sectionADir, 'claims.jsonl'), 'utf8');
    expect(afterAEntries).toEqual(beforeAEntries);
    expect(afterAClaimsJsonl).toBe(beforeAClaimsJsonl);
    expect(existsSync(join(sectionADir, 'synthesis'))).toBe(false);
  });

  it('refuses with a structured error when the target section is NOT synthesis-eligible', async () => {
    const { sectionA } = await makeFreshPackShape();
    await coworkHandoff({ packPath });

    await expect(sectionSynthesis({ sectionId: sectionA.id, packPath })).rejects.toBeInstanceOf(
      SectionNotSynthesisEligibleError,
    );
    // Section A should not get a synthesis directory.
    expect(existsSync(join(packPath, 'sections', sectionA.id, 'synthesis'))).toBe(false);
  });

  it('rejects an unknown section id with SectionNotFoundError (no surprise side-effects)', async () => {
    await makeFreshPackShape();
    await coworkHandoff({ packPath });
    await expect(sectionSynthesis({ sectionId: '99-never-existed', packPath })).rejects.toBeInstanceOf(
      SectionNotFoundError,
    );
  });

  it('does not make the pack freezable: pack freeze still refuses', async () => {
    const { sectionB } = await makeFreshPackShape();
    await coworkHandoff({ packPath });
    await sectionSynthesis({ sectionId: sectionB.id, packPath });
    const result = await runFreeze({ packPath });
    expect(result.verdict).toBe('refused');
  });

  it('does not mutate the cowork handoff file', async () => {
    const { sectionB } = await makeFreshPackShape();
    await coworkHandoff({ packPath });
    const handoffPath = join(packPath, 'handoffs', 'cowork-handoff.json');
    const before = await readFile(handoffPath, 'utf8');
    await sectionSynthesis({ sectionId: sectionB.id, packPath });
    const after = await readFile(handoffPath, 'utf8');
    expect(after).toBe(before);
  });

  it('does not mutate the section\'s claims.jsonl', async () => {
    const { sectionB } = await makeFreshPackShape();
    await coworkHandoff({ packPath });
    const claimsPath = join(packPath, 'sections', sectionB.id, 'claims.jsonl');
    const before = await readFile(claimsPath, 'utf8');
    await sectionSynthesis({ sectionId: sectionB.id, packPath });
    const after = await readFile(claimsPath, 'utf8');
    expect(after).toBe(before);
  });

  it('alias spelling: `workspace --section <id>` matches `synth section <id>`', async () => {
    const { sectionB } = await makeFreshPackShape();
    await coworkHandoff({ packPath });
    const result = await workspace({ packPath, sectionId: sectionB.id });
    expect(result.refused).toBe(false);
    expect(result.mode).toBe('repair_required');
    expect(result.acceptedClaims).toBe(3);
    expect(existsSync(join(packPath, 'sections', sectionB.id, 'synthesis', 'section-synthesis.json'))).toBe(true);
  });

  it('pack-level synth workspace still refuses repair_required packs (existing behavior preserved)', async () => {
    await makeFreshPackShape();
    await coworkHandoff({ packPath });
    const result = await workspace({ packPath });
    expect(result.refused).toBe(true);
    expect(result.mode).toBe('repair_required');
    // Refusal must NOT populate pack-level synthesis artifacts. (The bare
    // synthesis/ directory ships with the template — assert on the artifacts.)
    expect(existsSync(join(packPath, 'synthesis', 'cross-section-map.json'))).toBe(false);
    expect(existsSync(join(packPath, 'synthesis', 'final-report.md'))).toBe(false);
  });

  it('refuses cleanly when there is no cowork handoff on file', async () => {
    await makeFreshPackShape();
    // No coworkHandoff() call — handoffs/cowork-handoff.json is absent.
    await expect(sectionSynthesis({ sectionId: '06-evidence-custody-curated', packPath })).rejects.toThrow(
      /HANDOFF_NOT_FOUND|No handoff on file/,
    );
  });
});
