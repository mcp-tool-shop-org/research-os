// v0.8.0 phase 1b-b correctness fix: section-promotion semantics regression.
//
// Background: the prior agent extended "correct by construction" reasoning
// too far. Section promotion required every claim_review (including
// frame_excluded synthetic reviews) to be accepted_for_synthesis. That meant
// ANY single frame_excluded claim — even legitimate off-topic chrome filtered
// out at extract time — blocked an otherwise-clean section from ever being
// promoted. That defeats the purpose of frame_excluded (filter-don't-reject).
//
// Locked scenarios from the spec:
//   A. Positive: 3 accepted_for_synthesis + 2 frame_excluded → section CAN be
//      promoted. accepted_claim_floor sees the 3 accepted; frame_excluded is
//      its own bucket.
//   B. Negative: 0 accepted + 5 frame_excluded → accepted_claim_floor FAILS
//      (0 accepted). Section is NOT synthesis-eligible. (Tested via gate-
//      level coverage in gate-frame-excluded.test.ts scenario B; here we
//      just confirm the cowork bucketing is correct.)
//   C. Repair: 2 accepted + 1 needs_source_repair + 1 frame_excluded → the
//      needs_source_repair claim is the binding block. frame_excluded does
//      not add to that — it is filter-don't-reject — but the repair claim is
//      real outstanding work that prevents promotion.
//
// The fix lives in src/review/run.ts: the `allAccepted` check filters
// frame_excluded synthetic reviews out before evaluating "every decision is
// accepted_for_synthesis."
//
// Cowork-handoff semantics are also asserted here: frame_excluded should
// surface as its own bucket alongside accepted/repair/rejected and NOT be
// folded into the repair-needed set.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { review } from '../src/review/index.js';
import { derive } from '../src/cowork/derive.js';
import type { Reviewer, ReviewerInput, ReviewerResult, DraftFinding } from '../src/review/types.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';
import { ClaimSchema, type Claim } from '../src/claims/schema.js';
import { ClaimReviewSchema, type ClaimReview } from '../src/review/schema.js';

let workDir: string;
let packPath: string;

// A reviewer that emits a SCRIPTED set of findings so we can force the
// post-derivation review decision per-claim. The decisions land via the
// reviewer's findings → deriveClaimReviews logic — we instrument the
// finding categories to match the decision we want.
class ScriptedReviewer implements Reviewer {
  readonly name = 'heuristic' as const;
  constructor(private readonly drafts: DraftFinding[]) {}
  async available(): Promise<boolean> {
    return true;
  }
  async review(_input: ReviewerInput): Promise<ReviewerResult> {
    return { ok: true, drafts: this.drafts, method: 'scripted_for_promotion_test' };
  }
}

interface ClaimSpec {
  claim_id: string;
  source_id: string;
  frame_excluded?: boolean;
  frame_exclusion_reason?: 'off_topic' | 'background_only' | 'source_chrome' | 'critic_unavailable';
}

async function makeFixture(args: {
  claims: ClaimSpec[];
  promoteToGated?: boolean;
}) {
  const result = await init({
    topic: 'Frame-excluded promotion semantics',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({ id: '01-test', purpose: 'probe', packPath });

  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  const rawDir = join(packPath, 'evidence', 'raw');
  await mkdir(rawDir, { recursive: true });

  // Create source cards / receipts for every source_id used by claims.
  const sourceIds = Array.from(new Set(args.claims.map((c) => c.source_id)));
  for (const sid of sourceIds) {
    const card = {
      source_id: sid,
      receipt_id: `rcpt_${sid.replace(/^src_/, '')}_1`,
      section_id: '01-test',
      url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      fetched_at: '2026-05-12T22:00:00.000Z',
      publisher: 'p',
      published_at: '2025-12-01T00:00:00.000Z',
      title: 'A',
      source_type: 'secondary',
      relevance: 'unknown',
      key_points: [],
      limitations: [],
      asserts: 'A',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-12T22:00:00.000Z',
    };
    await writeFile(join(cardDir, `${sid}.json`), JSON.stringify(card), 'utf8');
    await writeFile(join(rawDir, `${sid}.html`), 'literal text body content', 'utf8');
    const receipt = {
      receipt_id: `rcpt_${sid.replace(/^src_/, '')}_1`,
      source_id: sid,
      section_id: '01-test',
      requested_url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      status: 200,
      status_text: 'OK',
      content_type: 'text/html',
      fetched_at: '2026-05-12T22:00:00.000Z',
      byte_count: 100,
      sha256: createHash('sha256').update(sid).digest('hex'),
      title: 'A',
      raw_text_path: `evidence/raw/${sid}.html`,
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

  // Persist claims.jsonl rows.
  for (const c of args.claims) {
    const claim: Record<string, unknown> = {
      claim_id: c.claim_id,
      section_id: '01-test',
      source_ids: [c.source_id],
      source_hashes: ['a'.repeat(64)],
      asserts: 'literal text body content',
      scope: 'narrow',
      not: 'broad',
      evidence_excerpt_ids: [],
      evidence_excerpt: 'literal text body content',
      evidence_location: null,
      confidence: 'low',
      extractor: c.frame_excluded ? 'ollama-intern' : 'heuristic',
      extraction_method: c.frame_excluded ? 'mcp_ollama_extract' : 'heuristic_key_point',
      created_at: '2026-05-12T22:00:00.000Z',
      review_state: 'candidate',
      frame_excluded: c.frame_excluded === true,
    };
    if (c.frame_excluded) {
      claim.frame_exclusion_reason = c.frame_exclusion_reason ?? 'off_topic';
      claim.frame_exclusion_rationale = 'critic excluded';
    }
    await appendFile(
      join(packPath, 'sections', '01-test', 'claims.jsonl'),
      JSON.stringify(claim) + '\n',
      'utf8',
    );
  }

  if (args.promoteToGated) {
    const yamlPath = join(packPath, 'research.yaml');
    const text = await readFile(yamlPath, 'utf8');
    const research = ResearchYamlSchema.parse(yamlParse(text));
    research.sections[0]!.status = 'gated';
    await writeFile(yamlPath, yamlStringify(research, { lineWidth: 0 }), 'utf8');
  }
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-promo-frame-excluded-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('Section-promotion semantics — frame_excluded is filter-don\'t-reject', () => {
  it('Scenario A: 3 accepted_for_synthesis + 2 frame_excluded → section IS promoted to reviewed', async () => {
    await makeFixture({
      promoteToGated: true,
      claims: [
        { claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', source_id: 'src_aaaaaaaaaaaa' },
        { claim_id: 'clm_aaaaaaaaaaaa_heuristic_2', source_id: 'src_aaaaaaaaaaaa' },
        { claim_id: 'clm_aaaaaaaaaaaa_heuristic_3', source_id: 'src_aaaaaaaaaaaa' },
        {
          claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
          source_id: 'src_aaaaaaaaaaaa',
          frame_excluded: true,
          frame_exclusion_reason: 'off_topic',
        },
        {
          claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_2',
          source_id: 'src_aaaaaaaaaaaa',
          frame_excluded: true,
          frame_exclusion_reason: 'source_chrome',
        },
      ],
    });
    // Scripted reviewer emits NO findings, so all reviewer-set claims default
    // to accepted_for_synthesis. The 2 frame_excluded claims never reach
    // the reviewer; they are added as synthetic frame_excluded reviews by
    // finalizeReview itself.
    const summary = await review({
      sectionId: '01-test',
      packPath,
      reviewers: [new ScriptedReviewer([])],
    });
    expect(summary.promotedToReviewed).toBe(true);
    expect(summary.decisions.accepted_for_synthesis).toBe(3);
    expect(summary.decisions.frame_excluded).toBe(2);
    // YAML status flipped to reviewed.
    const updated = ResearchYamlSchema.parse(
      yamlParse(await readFile(join(packPath, 'research.yaml'), 'utf8')),
    );
    expect(updated.sections[0]?.status).toBe('reviewed');
  });

  it('Scenario A (cowork bucketing): frame_excluded claims surface in their own bucket, NOT folded into repair', async () => {
    await makeFixture({
      promoteToGated: true,
      claims: [
        { claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', source_id: 'src_aaaaaaaaaaaa' },
        { claim_id: 'clm_aaaaaaaaaaaa_heuristic_2', source_id: 'src_aaaaaaaaaaaa' },
        {
          claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
          source_id: 'src_aaaaaaaaaaaa',
          frame_excluded: true,
          frame_exclusion_reason: 'off_topic',
        },
      ],
    });
    await review({
      sectionId: '01-test',
      packPath,
      reviewers: [new ScriptedReviewer([])],
    });

    const research = ResearchYamlSchema.parse(
      yamlParse(await readFile(join(packPath, 'research.yaml'), 'utf8')),
    );
    const claims = (await readFile(
      join(packPath, 'sections', '01-test', 'claims.jsonl'),
      'utf8',
    ))
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => ClaimSchema.parse(JSON.parse(l)));
    const reviews = (await readFile(
      join(packPath, 'sections', '01-test', 'claim-reviews.jsonl'),
      'utf8',
    ))
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => ClaimReviewSchema.parse(JSON.parse(l)));

    const payload = derive({
      research,
      perSection: new Map([
        [
          '01-test',
          {
            gate: null,
            candidateClaims: claims,
            claimReviews: reviews,
            contradictions: [],
          },
        ],
      ]),
      indexStatus: 'unbuilt',
      generatedAt: '2026-05-12T00:00:00.000Z',
      warnings: [],
    });

    const sec = payload.sections.find((s) => s.section_id === '01-test')!;
    // frame_excluded claim IDs land in their own bucket.
    expect(sec.frame_excluded_claim_ids).toEqual(['clm_aaaaaaaaaaaa_ollama_intern_1']);
    // They are NOT in repair_claim_ids.
    expect(sec.repair_claim_ids).not.toContain('clm_aaaaaaaaaaaa_ollama_intern_1');
    // They are NOT in rejected_claim_ids.
    expect(sec.rejected_claim_ids).not.toContain('clm_aaaaaaaaaaaa_ollama_intern_1');
    // accepted bucket has both accepted claims.
    expect(sec.accepted_claim_ids).toEqual([
      'clm_aaaaaaaaaaaa_heuristic_1',
      'clm_aaaaaaaaaaaa_heuristic_2',
    ]);
    // Provenance frame_excluded_count surfaces the bucket separately.
    expect(sec.provenance_summary.frame_excluded_count).toBe(1);
  });

  it('Scenario B: 0 accepted + 5 frame_excluded → accepted_claim_floor blocks via gate; section does NOT promote', async () => {
    // We exercise the floor at the gate layer in gate-frame-excluded.test.ts.
    // Here we check the OTHER end: even though all reviewer-set reviews are
    // empty (zero non-frame_excluded reviewer reviews) the promotion path
    // does NOT fire — there are 0 accepted claims to promote on. The check
    // requires reviewerSetReviews.length > 0 AND every accepted.
    await makeFixture({
      promoteToGated: true,
      claims: [
        {
          claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
          source_id: 'src_aaaaaaaaaaaa',
          frame_excluded: true,
          frame_exclusion_reason: 'off_topic',
        },
        {
          claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_2',
          source_id: 'src_aaaaaaaaaaaa',
          frame_excluded: true,
          frame_exclusion_reason: 'source_chrome',
        },
        {
          claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_3',
          source_id: 'src_aaaaaaaaaaaa',
          frame_excluded: true,
          frame_exclusion_reason: 'background_only',
        },
        {
          claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_4',
          source_id: 'src_aaaaaaaaaaaa',
          frame_excluded: true,
          frame_exclusion_reason: 'critic_unavailable',
        },
        {
          claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_5',
          source_id: 'src_aaaaaaaaaaaa',
          frame_excluded: true,
          frame_exclusion_reason: 'off_topic',
        },
      ],
    });
    const summary = await review({
      sectionId: '01-test',
      packPath,
      reviewers: [new ScriptedReviewer([])],
    });
    // No reviewer-set reviews exist (all claims are frame_excluded synthetic).
    expect(summary.promotedToReviewed).toBe(false);
    expect(summary.decisions.accepted_for_synthesis).toBe(0);
    expect(summary.decisions.frame_excluded).toBe(5);
    // YAML status NOT flipped to reviewed.
    const updated = ResearchYamlSchema.parse(
      yamlParse(await readFile(join(packPath, 'research.yaml'), 'utf8')),
    );
    expect(updated.sections[0]?.status).toBe('gated');
  });

  it('Scenario C: 2 accepted + 1 needs_source_repair + 1 frame_excluded → section does NOT promote (repair is the binding block)', async () => {
    await makeFixture({
      promoteToGated: true,
      claims: [
        { claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', source_id: 'src_aaaaaaaaaaaa' },
        { claim_id: 'clm_aaaaaaaaaaaa_heuristic_2', source_id: 'src_aaaaaaaaaaaa' },
        { claim_id: 'clm_aaaaaaaaaaaa_heuristic_3', source_id: 'src_aaaaaaaaaaaa' },
        {
          claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
          source_id: 'src_aaaaaaaaaaaa',
          frame_excluded: true,
          frame_exclusion_reason: 'off_topic',
        },
      ],
    });
    // Scripted reviewer issues a needs_source_repair finding against claim 3.
    // The decision-mapping (src/review/decision.ts) routes
    // source_quality_problem at warn severity → needs_source_repair.
    const draft: DraftFinding = {
      category: 'source_quality_problem',
      severity: 'warn',
      summary: 'simulated source-quality finding routing to needs_source_repair',
      evidence: '',
      required_action: 'Repair source for this claim.',
      claim_ids: ['clm_aaaaaaaaaaaa_heuristic_3'],
      source_ids: [],
      confidence: 'high',
    };
    const summary = await review({
      sectionId: '01-test',
      packPath,
      reviewers: [new ScriptedReviewer([draft])],
    });
    expect(summary.promotedToReviewed).toBe(false);
    // Two accepted, one repair-needed, one frame_excluded.
    expect(summary.decisions.accepted_for_synthesis).toBe(2);
    expect(summary.decisions.needs_source_repair).toBe(1);
    expect(summary.decisions.frame_excluded).toBe(1);

    // Cowork derive: frame_excluded is its own bucket, repair is its own
    // bucket, the needs_source_repair claim is the one in the repair bucket.
    const research = ResearchYamlSchema.parse(
      yamlParse(await readFile(join(packPath, 'research.yaml'), 'utf8')),
    );
    const claims: Claim[] = (await readFile(
      join(packPath, 'sections', '01-test', 'claims.jsonl'),
      'utf8',
    ))
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => ClaimSchema.parse(JSON.parse(l)));
    const reviews: ClaimReview[] = (await readFile(
      join(packPath, 'sections', '01-test', 'claim-reviews.jsonl'),
      'utf8',
    ))
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => ClaimReviewSchema.parse(JSON.parse(l)));

    const payload = derive({
      research,
      perSection: new Map([
        [
          '01-test',
          {
            gate: null,
            candidateClaims: claims,
            claimReviews: reviews,
            contradictions: [],
          },
        ],
      ]),
      indexStatus: 'unbuilt',
      generatedAt: '2026-05-12T00:00:00.000Z',
      warnings: [],
    });
    const sec = payload.sections.find((s) => s.section_id === '01-test')!;
    expect(sec.frame_excluded_claim_ids).toContain('clm_aaaaaaaaaaaa_ollama_intern_1');
    expect(sec.repair_claim_ids).toContain('clm_aaaaaaaaaaaa_heuristic_3');
    // The repair claim is NOT in the frame_excluded bucket.
    expect(sec.frame_excluded_claim_ids).not.toContain('clm_aaaaaaaaaaaa_heuristic_3');
    // Accepted bucket has the two clean claims.
    expect(sec.accepted_claim_ids).toEqual([
      'clm_aaaaaaaaaaaa_heuristic_1',
      'clm_aaaaaaaaaaaa_heuristic_2',
    ]);
  });

  it('Scenario A confirmed positive — review snapshot decision_counts surfaces both buckets', async () => {
    // Round-trip sanity check on the persisted review.json: accepted +
    // frame_excluded both visible and distinct from other buckets.
    await makeFixture({
      promoteToGated: true,
      claims: [
        { claim_id: 'clm_aaaaaaaaaaaa_heuristic_1', source_id: 'src_aaaaaaaaaaaa' },
        {
          claim_id: 'clm_aaaaaaaaaaaa_ollama_intern_1',
          source_id: 'src_aaaaaaaaaaaa',
          frame_excluded: true,
          frame_exclusion_reason: 'source_chrome',
        },
      ],
    });
    const summary = await review({
      sectionId: '01-test',
      packPath,
      reviewers: [new ScriptedReviewer([])],
    });
    expect(summary.promotedToReviewed).toBe(true);
    const snap = JSON.parse(
      await readFile(join(packPath, 'audits', '01-test-review.json'), 'utf8'),
    ) as {
      decision_counts: Record<string, number>;
    };
    expect(snap.decision_counts.accepted_for_synthesis).toBe(1);
    expect(snap.decision_counts.frame_excluded).toBe(1);
    expect(snap.decision_counts.rejected).toBe(0);
    expect(snap.decision_counts.needs_source_repair).toBe(0);
  });
});
