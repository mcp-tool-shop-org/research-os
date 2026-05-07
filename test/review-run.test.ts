import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as yamlParse } from 'yaml';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { review } from '../src/review/index.js';
import { HeuristicReviewer } from '../src/review/reviewers/heuristic.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';
import { ReviewSnapshotSchema } from '../src/review/schema.js';
import { PackNotFoundError, SectionNotFoundError } from '../src/errors.js';

let workDir: string;
let packPath: string;

interface FixtureSpec {
  sources?: Array<{
    source_id: string;
    publisher: string;
    source_type?: 'primary' | 'secondary' | 'forum' | 'benchmark' | 'docs' | 'unknown';
    raw_text?: string;
  }>;
  claims?: Array<{
    claim_id: string;
    source_ids?: string[];
    source_hashes?: string[];
    asserts?: string;
    scope?: string | null;
    not?: string | null;
    evidence_excerpt?: string;
    confidence?: 'low' | 'medium' | 'high';
    review_state?: 'candidate' | 'rejected' | 'accepted';
  }>;
  contradictions?: Array<{
    contradiction_id: string;
    type?: 'direct_conflict' | 'overgeneralization_risk' | 'scope_conflict' | 'temporal_conflict';
    severity?: 'low' | 'medium' | 'high' | 'blocking';
    status?: 'unresolved' | 'reconciled' | 'preserved_deliberately';
    claim_ids?: string[];
  }>;
  promoteSectionToGated?: boolean;
}

async function makeFixture(spec: FixtureSpec) {
  const result = await init({
    topic: 'How does the reviewer behave end-to-end?',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({
    id: '01-test',
    purpose: 'probe',
    packPath,
  });

  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  for (const s of spec.sources ?? []) {
    const card = {
      source_id: s.source_id,
      receipt_id: `rcpt_${s.source_id.replace(/^src_/, '')}_1`,
      section_id: '01-test',
      url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      fetched_at: '2026-05-06T22:00:00.000Z',
      publisher: s.publisher,
      published_at: '2025-12-01T00:00:00.000Z',
      title: 'A',
      source_type: s.source_type ?? 'secondary',
      relevance: 'unknown',
      key_points: [],
      limitations: [],
      asserts: 'A',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-06T22:00:00.000Z',
    };
    await writeFile(join(cardDir, `${s.source_id}.json`), JSON.stringify(card), 'utf8');
    const rawDir = join(packPath, 'evidence', 'raw');
    await mkdir(rawDir, { recursive: true });
    await writeFile(
      join(rawDir, `${s.source_id}.html`),
      s.raw_text ?? 'literal text body content',
      'utf8',
    );
    const receipt = {
      receipt_id: `rcpt_${s.source_id.replace(/^src_/, '')}_1`,
      source_id: s.source_id,
      section_id: '01-test',
      requested_url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      status: 200,
      status_text: 'OK',
      content_type: 'text/html',
      fetched_at: '2026-05-06T22:00:00.000Z',
      byte_count: 100,
      sha256: createHash('sha256').update(s.source_id).digest('hex'),
      title: 'A',
      raw_text_path: `evidence/raw/${s.source_id}.html`,
      fetch_outcome: 'ok',
      fetch_error: null,
      extraction_outcome: 'ok',
      extraction_extractor: 'heuristic',
      extraction_error: null,
    };
    await appendFile(
      join(packPath, 'evidence', 'fetch-log.jsonl'),
      JSON.stringify(receipt) + '\n',
      'utf8',
    );
  }

  for (const c of spec.claims ?? []) {
    const claim = {
      claim_id: c.claim_id,
      section_id: '01-test',
      source_ids: c.source_ids ?? ['src_aaaaaaaaaaaa'],
      source_hashes: c.source_hashes ?? ['a'.repeat(64)],
      asserts: c.asserts ?? 'something concise',
      scope: c.scope === undefined ? 'narrow scope' : c.scope,
      not: c.not === undefined ? 'broad scope' : c.not,
      evidence_excerpt: c.evidence_excerpt ?? 'literal text',
      evidence_location: null,
      confidence: c.confidence ?? 'low',
      extractor: 'heuristic',
      extraction_method: 'heuristic_key_point',
      created_at: '2026-05-06T22:00:00.000Z',
      review_state: c.review_state ?? 'candidate',
    };
    await appendFile(
      join(packPath, 'sections', '01-test', 'claims.jsonl'),
      JSON.stringify(claim) + '\n',
      'utf8',
    );
  }

  for (const c of spec.contradictions ?? []) {
    const contradiction = {
      contradiction_id: c.contradiction_id,
      section_id: '01-test',
      claim_ids: c.claim_ids ?? ['clm_aaaaaaaaaaaa_heuristic_1', 'clm_bbbbbbbbbbbb_heuristic_1'],
      source_ids: ['src_aaaaaaaaaaaa'],
      type: c.type ?? 'direct_conflict',
      summary: 'mock',
      scope_analysis: '',
      overlap_assessment: 'partially_overlapping',
      severity: c.severity ?? 'medium',
      confidence: 'low',
      detector: 'heuristic',
      detection_method: 'm',
      evidence: '',
      status: c.status ?? 'unresolved',
      created_at: '2026-05-06T22:00:00.000Z',
    };
    await appendFile(
      join(packPath, 'sections', '01-test', 'contradictions.jsonl'),
      JSON.stringify(contradiction) + '\n',
      'utf8',
    );
  }

  if (spec.promoteSectionToGated) {
    const yamlPath = join(packPath, 'research.yaml');
    const text = await readFile(yamlPath, 'utf8');
    const { parse, stringify } = await import('yaml');
    const research = ResearchYamlSchema.parse(parse(text));
    research.sections[0]!.status = 'gated';
    await writeFile(yamlPath, stringify(research, { lineWidth: 0 }), 'utf8');
  }
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-review-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('review (end-to-end)', () => {
  it('does not mutate claims.jsonl', async () => {
    await makeFixture({
      sources: [{ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' }],
      claims: [
        {
          claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
          source_ids: ['src_aaaaaaaaaaaa'],
          evidence_excerpt: 'this exact phrase does not appear in raw text',
        },
      ],
    });
    const claimsPath = join(packPath, 'sections', '01-test', 'claims.jsonl');
    const before = await readFile(claimsPath, 'utf8');
    await review({
      sectionId: '01-test',
      packPath,
      reviewers: [new HeuristicReviewer()],
    });
    const after = await readFile(claimsPath, 'utf8');
    expect(after).toBe(before);
  });

  it('writes append-only claim-reviews.jsonl and audits/<section>-findings.jsonl', async () => {
    await makeFixture({
      sources: [{ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' }],
      claims: [
        {
          claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
          source_ids: ['src_aaaaaaaaaaaa'],
        },
      ],
    });
    await review({ sectionId: '01-test', packPath, reviewers: [new HeuristicReviewer()] });
    await review({ sectionId: '01-test', packPath, reviewers: [new HeuristicReviewer()] });
    const reviewsPath = join(packPath, 'sections', '01-test', 'claim-reviews.jsonl');
    const reviewsText = await readFile(reviewsPath, 'utf8');
    const reviewLines = reviewsText.trim().split('\n').filter(Boolean);
    expect(reviewLines.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects an LLM finding that cites a claim_id not in the input', async () => {
    await makeFixture({
      sources: [{ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' }],
      claims: [
        {
          claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
          source_ids: ['src_aaaaaaaaaaaa'],
        },
      ],
    });
    const liarLlm = {
      name: 'ollama-intern' as const,
      async available() {
        return true;
      },
      async review() {
        return {
          ok: true as const,
          method: 'm',
          drafts: [
            {
              category: 'overgeneralized_claim' as const,
              severity: 'warn' as const,
              summary: 'invented finding',
              evidence: '',
              required_action: '',
              claim_ids: ['clm_invented_invented_1'],
              source_ids: [],
              confidence: 'high' as const,
            },
          ],
        };
      },
    };
    const summary = await review({
      sectionId: '01-test',
      packPath,
      reviewers: [liarLlm, new HeuristicReviewer()],
    });
    expect(summary.llmFindingsRejected).toBe(1);
    expect(summary.findingsAdded).toBe(0);
  });

  it('falls back from ollama-intern to heuristic when ollama is unavailable', async () => {
    await makeFixture({
      sources: [{ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' }],
      claims: [
        {
          claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
          source_ids: ['src_aaaaaaaaaaaa'],
          evidence_excerpt: 'phrase not in body',
        },
      ],
    });
    const ollamaUnavail = {
      name: 'ollama-intern' as const,
      async available() {
        return false;
      },
      async review() {
        throw new Error('should not be called when unavailable');
      },
    };
    const summary = await review({
      sectionId: '01-test',
      packPath,
      reviewers: [ollamaUnavail, new HeuristicReviewer()],
    });
    expect(summary.reviewer).toBe('heuristic');
  });

  it('rejects (decision) on ungrounded_excerpt', async () => {
    await makeFixture({
      sources: [{ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1', raw_text: 'unrelated body' }],
      claims: [
        {
          claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
          source_ids: ['src_aaaaaaaaaaaa'],
          evidence_excerpt: 'this exact phrase does not appear in raw text',
        },
      ],
    });
    const summary = await review({
      sectionId: '01-test',
      packPath,
      reviewers: [new HeuristicReviewer()],
    });
    expect(summary.decisions.rejected).toBeGreaterThan(0);
  });

  it('writes a markdown report with severity counts and decisions', async () => {
    await makeFixture({
      sources: [{ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1', raw_text: 'literal text body content' }],
      claims: [
        {
          claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
          source_ids: ['src_aaaaaaaaaaaa'],
          evidence_excerpt: 'literal text body content',
        },
      ],
    });
    await review({ sectionId: '01-test', packPath, reviewers: [new HeuristicReviewer()] });
    const md = await readFile(join(packPath, 'audits', '01-test-review.md'), 'utf8');
    expect(md).toContain('Adversarial Review: 01-test');
    expect(md).toContain('claims.jsonl is unchanged');
  });

  it('promotes section status from gated → reviewed only when every claim is accepted', async () => {
    await makeFixture({
      sources: [{ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1', raw_text: 'literal text body content' }],
      claims: [
        {
          claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
          source_ids: ['src_aaaaaaaaaaaa'],
          evidence_excerpt: 'literal text body content',
          scope: 'narrow scope',
          not: 'broad scope',
        },
      ],
      promoteSectionToGated: true,
    });
    const summary = await review({
      sectionId: '01-test',
      packPath,
      reviewers: [new HeuristicReviewer()],
    });
    expect(summary.promotedToReviewed).toBe(true);
    const updated = ResearchYamlSchema.parse(yamlParse(await readFile(join(packPath, 'research.yaml'), 'utf8')));
    expect(updated.sections[0]?.status).toBe('reviewed');
  });

  it('does NOT promote when at least one claim has a non-accepted decision', async () => {
    await makeFixture({
      sources: [{ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1', raw_text: 'unrelated body' }],
      claims: [
        {
          claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
          source_ids: ['src_aaaaaaaaaaaa'],
          evidence_excerpt: 'phrase not in body',
        },
      ],
      promoteSectionToGated: true,
    });
    const summary = await review({
      sectionId: '01-test',
      packPath,
      reviewers: [new HeuristicReviewer()],
    });
    expect(summary.promotedToReviewed).toBe(false);
  });

  it('rejects when pack is missing', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'research-os-review-empty-'));
    try {
      await expect(
        review({
          sectionId: '01-test',
          packPath: empty,
          reviewers: [new HeuristicReviewer()],
        }),
      ).rejects.toBeInstanceOf(PackNotFoundError);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('rejects when section is missing', async () => {
    await makeFixture({});
    await expect(
      review({
        sectionId: '99-not-real',
        packPath,
        reviewers: [new HeuristicReviewer()],
      }),
    ).rejects.toBeInstanceOf(SectionNotFoundError);
  });

  it('writes a structured review.json snapshot that schema-validates', async () => {
    await makeFixture({
      sources: [{ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' }],
      claims: [
        {
          claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
          source_ids: ['src_aaaaaaaaaaaa'],
        },
      ],
    });
    await review({ sectionId: '01-test', packPath, reviewers: [new HeuristicReviewer()] });
    const snap = ReviewSnapshotSchema.parse(
      JSON.parse(await readFile(join(packPath, 'audits', '01-test-review.json'), 'utf8')),
    );
    expect(snap.section_id).toBe('01-test');
  });

  it('does not modify the gate result', async () => {
    await makeFixture({
      sources: [{ source_id: 'src_aaaaaaaaaaaa', publisher: 'p1' }],
      claims: [
        {
          claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
          source_ids: ['src_aaaaaaaaaaaa'],
          evidence_excerpt: 'phrase not in body',
        },
      ],
    });
    const fakeGate = {
      section_id: '01-test',
      verdict: 'pass',
      summary: 'mock',
      checked_at: '2026-05-06T22:00:00.000Z',
      synthesis_eligible: true,
      gate_results: [],
      failures: [],
      warnings: [],
      waivers_applied: [],
      blocking_reasons: [],
      claim_counts: { total: 1, candidate: 1, with_evidence_excerpt: 1, with_source_hashes: 1, with_scope: 1, with_not: 1, universal_scope_null: 0, orphans: 0 },
      source_counts: { total: 1, primary: 0, secondary: 1, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 1, failed_fetches: 0 },
      contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 0 },
      scope_integrity_summary: { universal_claims: 0, scoped_claims: 1, with_not_constraint: 1, overgen_risks_total: 0, overgen_risks_blocking: 0 },
      next_actions: [],
    };
    await mkdir(join(packPath, 'audits'), { recursive: true });
    await writeFile(
      join(packPath, 'audits', '01-test-gate.json'),
      JSON.stringify(fakeGate, null, 2),
      'utf8',
    );
    const beforeGate = await readFile(join(packPath, 'audits', '01-test-gate.json'), 'utf8');
    await review({ sectionId: '01-test', packPath, reviewers: [new HeuristicReviewer()] });
    const afterGate = await readFile(join(packPath, 'audits', '01-test-gate.json'), 'utf8');
    expect(afterGate).toBe(beforeGate);
  });
});
