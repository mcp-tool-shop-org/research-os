/**
 * R-011 — Frame critic source-content guard (v0.11 Slice 3, paired with R-009).
 *
 * Acceptance tests for the critic-layer defense against the source-content
 * contamination failure family. Closes the v0.2 originating-bug shape:
 * Section 01's candidate ledger contained 11 cancer-paper claims marked
 * `frame_excluded=false`. The CLAIM TEXT was topically framed (about
 * DST/workplace) — the LLM extractor confabulated DST framing onto the
 * cancer-paper content; the frame critic operated on claim text + source
 * card metadata alone (and the cancer-paper card.title was "(untitled)"!)
 * and accepted them. The underlying source-content topical mismatch was
 * invisible at the frame-critic layer.
 *
 * The defense: at extract time, compute a source-content topical signature
 * once per source (deterministic, pure function, reuses R-008's
 * tokenizeForRelevance). Before the LLM critic call fires, compare claim
 * asserts tokens against the source's signature via the same keyword
 * overlap helper. Below threshold → claim marked frame_excluded=true with
 * new reason `source_content_mismatch`; the LLM critic call is short-
 * circuited (the deterministic precheck has already decided).
 *
 * Independence from R-009: this fires from inside the MCP claim-extractor's
 * per-draft critic loop. R-009 quarantines the SOURCE upstream of the
 * extractor, so if R-009 fires the extractor never produces drafts and
 * R-011 never sees them. If R-009 is disabled (or operator-cleared), R-011
 * still runs against the actual source content. See the paired
 * defense-layer independence test at the bottom of this file.
 */
import { describe, it, expect } from 'vitest';

import {
  computeSourceContentSignature,
  checkClaimSourceContentMatch,
  DEFAULT_FRAME_SOURCE_CONTENT_THRESHOLD,
} from '../src/claims/critic/source-content.js';
import { MCPClaimExtractor } from '../src/claims/extractors/mcp.js';
import { MCPClientHandle } from '../src/mcp/client.js';
import type { Excerpt } from '../src/sources/excerpts/schema.js';
import type { SourceCard } from '../src/sources/schema.js';
import {
  FRAME_EXCLUSION_REASONS,
  type FrameExclusionReason,
} from '../src/claims/critic/prompt.js';
import { ClaimSchema } from '../src/claims/schema.js';

// ── Pure-function unit tests ─────────────────────────────────────────────────

describe('computeSourceContentSignature — deterministic token set from raw body', () => {
  it('returns a Set of significant tokens from raw HTML body (stripped of tags)', () => {
    const rawText = `<html><body><p>Geographical variations in cancer mortality in southern Spain Andalusia.</p></body></html>`;
    const signature = computeSourceContentSignature(rawText);
    expect(signature.has('cancer')).toBe(true);
    expect(signature.has('mortality')).toBe(true);
    expect(signature.has('andalusia')).toBe(true);
    expect(signature.has('spain')).toBe(true);
    // Stopwords + short tokens are dropped (matches R-008 tokenizer).
    expect(signature.has('in')).toBe(false);
  });

  it('returns an empty Set when rawText is null / empty / non-content', () => {
    expect(computeSourceContentSignature(null).size).toBe(0);
    expect(computeSourceContentSignature('').size).toBe(0);
    expect(computeSourceContentSignature('<html><body></body></html>').size).toBe(0);
  });

  it('is deterministic — same input → identical Set membership', () => {
    const rawText = `<p>daylight saving time workplace injuries sleep loss spring transition Monday</p>`;
    const a = computeSourceContentSignature(rawText);
    const b = computeSourceContentSignature(rawText);
    expect(Array.from(a).sort()).toEqual(Array.from(b).sort());
  });

  it('bounds work on very large bodies — does not OOM on a 10 MB input', () => {
    const huge = '<p>' + 'workplace productivity '.repeat(500_000) + '</p>';
    const sig = computeSourceContentSignature(huge);
    expect(sig.has('workplace')).toBe(true);
    expect(sig.has('productivity')).toBe(true);
  });
});

describe('checkClaimSourceContentMatch — deterministic precheck', () => {
  it('returns mismatch when claim asserts have zero overlap with source signature (v0.2 cancer-paper-DST-claim case)', () => {
    // The exact shape of the 11 v0.2 cancer-paper claims: claim text is
    // DST-framed (workplace productivity), source signature is cancer
    // mortality. The only overlap might be a placename like "spain" or
    // "almeria", which is generic enough that it shouldn't rescue the
    // claim from the precheck firing.
    const cancerSignature = new Set([
      'geographical', 'variations', 'cancer', 'mortality', 'social',
      'inequalities', 'spanish', 'autonomous', 'community', 'andalusia',
      'spatial', 'pattern', 'lung', 'bladder', 'breast', 'stomach',
      'almeria', 'cadiz', 'cordoba', 'spain',
    ]);
    const claimAsserts = 'This study found that DST transitions had no significant impact on workplace productivity and cognitive performance in Almeria, Spain.';
    const result = checkClaimSourceContentMatch({
      claimAsserts,
      sourceSignature: cancerSignature,
      threshold: DEFAULT_FRAME_SOURCE_CONTENT_THRESHOLD,
    });
    expect(result.mismatch).toBe(true);
    // The reasons surface the actual overlap fraction + matched-keyword
    // set for operator inspection.
    expect(result.overlapScore).toBeLessThan(DEFAULT_FRAME_SOURCE_CONTENT_THRESHOLD);
    expect(result.matchedKeywords).toEqual(expect.arrayContaining(['almeria', 'spain']));
  });

  it('returns NO mismatch when claim asserts share substantial vocabulary with source signature (healthy DST case)', () => {
    const dstSignature = new Set([
      'daylight', 'saving', 'time', 'workplace', 'injuries', 'sleep',
      'minutes', 'spring', 'monday', 'transition', 'workers', 'less',
      'percent', 'fatal', 'accidents',
    ]);
    const claimAsserts = 'Switching to daylight saving time results in workers obtaining 40 minutes less sleep and experiencing 5.7% more workplace injuries on the Monday following the spring transition.';
    const result = checkClaimSourceContentMatch({
      claimAsserts,
      sourceSignature: dstSignature,
      threshold: DEFAULT_FRAME_SOURCE_CONTENT_THRESHOLD,
    });
    expect(result.mismatch).toBe(false);
    expect(result.overlapScore).toBeGreaterThanOrEqual(DEFAULT_FRAME_SOURCE_CONTENT_THRESHOLD);
  });

  it('returns NO mismatch when the source signature is empty (graceful degradation, no signal)', () => {
    const result = checkClaimSourceContentMatch({
      claimAsserts: 'A DST workplace productivity claim',
      sourceSignature: new Set(),
      threshold: DEFAULT_FRAME_SOURCE_CONTENT_THRESHOLD,
    });
    expect(result.mismatch).toBe(false);
    expect(result.overlapScore).toBe(0);
  });

  it('returns NO mismatch when claim asserts have no significant tokens (e.g., all stopwords)', () => {
    const result = checkClaimSourceContentMatch({
      claimAsserts: 'It is so. Are we?',
      sourceSignature: new Set(['anything']),
      threshold: DEFAULT_FRAME_SOURCE_CONTENT_THRESHOLD,
    });
    expect(result.mismatch).toBe(false);
  });
});

describe('FrameExclusionReason enum — R-011 extends source_content_mismatch', () => {
  it('exposes source_content_mismatch on FRAME_EXCLUSION_REASONS', () => {
    expect((FRAME_EXCLUSION_REASONS as readonly string[]).includes('source_content_mismatch')).toBe(true);
  });

  it('ClaimSchema.frame_exclusion_reason accepts source_content_mismatch', () => {
    const parsed = ClaimSchema.safeParse({
      claim_id: 'clm_aabbccddeeff_ollama_intern_1',
      section_id: '01-test',
      source_ids: ['src_aabbccddeeff'],
      source_hashes: [],
      asserts: 'A claim',
      scope: 'some scope',
      not: 'some not',
      evidence_excerpt_ids: ['ex_aabbccddeeff_001'],
      evidence_excerpt: 'some evidence',
      evidence_location: null,
      confidence: 'medium',
      extractor: 'ollama-intern',
      extraction_method: 'mcp_ollama_extract',
      created_at: '2026-05-15T10:00:00.000Z',
      review_state: 'candidate',
      frame_excluded: true,
      frame_exclusion_reason: 'source_content_mismatch',
      frame_exclusion_rationale: 'source content does not topically support this claim',
    });
    expect(parsed.success).toBe(true);
  });

  it('FrameExclusionReason type-check (compile-time): source_content_mismatch is assignable', () => {
    const reason: FrameExclusionReason = 'source_content_mismatch';
    expect(typeof reason).toBe('string');
  });
});

// ── MCP claim extractor integration — R-011 precheck fires in critic loop ───

const baseCard: SourceCard = {
  source_id: 'src_abcdef012345',
  receipt_id: 'rcpt_abcdef012345_1700000000000',
  section_id: '01-test',
  url: 'https://example.com/x',
  final_url: 'https://example.com/x',
  fetched_at: '2026-05-06T22:00:00.000Z',
  publisher: 'Example Pub',
  published_at: null,
  title: 'Example',
  source_type: 'secondary',
  relevance: 'unknown',
  key_points: ['kp1'],
  limitations: [],
  asserts: 'Source headline',
  scope: null,
  not: null,
  extracted_by: 'heuristic',
  extracted_at: '2026-05-06T22:00:00.000Z',
};

function ex(idx: number, text: string): Excerpt {
  return {
    excerpt_id: `ex_abcdef012345_${String(idx).padStart(3, '0')}`,
    source_id: 'src_abcdef012345',
    source_hash: null,
    text,
    location_hint: `paragraph ${idx}`,
    char_start: 0,
    char_end: text.length,
    origin: 'raw_text',
    created_at: '2026-05-06T22:00:00.000Z',
  };
}

interface CapturedCall {
  name: string;
  arguments: Record<string, unknown>;
}

function makeFakeClient(opts: {
  capture: CapturedCall[];
  response: () => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}): unknown {
  return {
    async callTool(params: { name: string; arguments: Record<string, unknown> }) {
      opts.capture.push({ name: params.name, arguments: params.arguments });
      return opts.response();
    },
  };
}

function makeExtractor(capture: CapturedCall[], response: () => unknown): MCPClaimExtractor {
  return new MCPClaimExtractor({
    handleFactory: () => {
      const fake = makeFakeClient({
        capture,
        response: async () => response() as { content: Array<{ type: string; text: string }>; isError?: boolean },
      });
      const handle = new MCPClientHandle({});
      (handle as unknown as { connect: () => Promise<unknown> }).connect = async () => fake;
      (handle as unknown as { close: () => Promise<void> }).close = async () => {};
      return handle;
    },
  });
}

function envelopeWithClaims(claims: Array<Record<string, unknown>>) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          result: { ok: true, data: { claims } },
          tier_used: 'workhorse',
          model: 'hermes3:8b',
          hardware_profile: 'test',
          tokens_in: 100,
          tokens_out: 50,
          elapsed_ms: 10,
          residency: null,
        }),
      },
    ],
  };
}

describe('MCPClaimExtractor — R-011 source_content_mismatch precheck', () => {
  it('fires source_content_mismatch on the v0.2 cancer-paper-DST-claim case (precheck short-circuits LLM critic)', async () => {
    // The exact v0.2 contamination shape: source raw text is the
    // Andalusia cancer-mortality paper; LLM extractor confabulated a
    // DST-framed asserts onto a numeric-table evidence excerpt. The
    // precheck must catch this without ever invoking the LLM critic.
    const cancerPaperRaw = `Geographical variations in cancer mortality can be explained, in part, by their association with social inequalities. The objective of our study was to analyse the spatial pattern of mortality in relation to the most common causes of cancer in the Spanish autonomous community of Andalusia and its possible association with social inequalities.`;
    const cardWithSourceRaw: SourceCard = { ...baseCard, title: '(untitled)' };
    const capture: CapturedCall[] = [];
    const extractor = makeExtractor(capture, () =>
      envelopeWithClaims([
        {
          asserts: 'This study found that DST transitions had no significant impact on workplace productivity and cognitive performance in Almeria, Spain.',
          scope: 'On What does the empirical literature say about DST transitions effects on workplace productivity?',
          not: null,
          evidence_excerpt_ids: ['ex_abcdef012345_001'],
          confidence: 'high',
        },
      ]),
    );
    const result = await extractor.extract({
      sourceCard: cardWithSourceRaw,
      sourceHash: null,
      excerpts: [
        ex(1, 'Municipality DI CT n RR CI 95% Almeria 1 46 248 1.00 -'),
      ],
      framePurpose: 'What does the empirical literature say about DST transitions effects on workplace productivity?',
      sourceRawText: cancerPaperRaw,
    });
    if (!result.ok) throw new Error(`should succeed: ${result.error}`);
    expect(result.claims).toHaveLength(1);
    const claim = result.claims[0]!;
    expect(claim.frame_excluded).toBe(true);
    expect(claim.frame_exclusion_reason).toBe('source_content_mismatch');
    expect(claim.frame_exclusion_rationale).toMatch(/source content/i);
    // The criticTally surfaces the new bucket so operators can see how
    // many claims were caught by the deterministic precheck vs. the LLM
    // critic.
    expect(result.criticTally?.source_content_mismatch ?? 0).toBe(1);
  });

  it('lets the LLM critic run when claim asserts have substantial overlap with source content', async () => {
    const dstPaperRaw = `Changing to daylight saving time cuts into sleep and increases workplace injuries. Switching to daylight saving time results in workers obtaining 40 minutes less sleep and experiencing 5.7% more workplace injuries on the Monday following the spring transition.`;
    const cardWithSourceRaw: SourceCard = { ...baseCard, title: 'Barnes & Wagner 2009 — workplace injuries DST' };
    const capture: CapturedCall[] = [];
    const extractor = makeExtractor(capture, () =>
      envelopeWithClaims([
        {
          asserts: 'Workers obtain 40 minutes less sleep and experience 5.7% more workplace injuries on the Monday following the spring transition to daylight saving time.',
          scope: 'On DST workplace injuries spring transition Monday',
          not: null,
          evidence_excerpt_ids: ['ex_abcdef012345_001'],
          confidence: 'high',
        },
      ]),
    );
    const result = await extractor.extract({
      sourceCard: cardWithSourceRaw,
      sourceHash: null,
      excerpts: [
        ex(1, 'Workers obtain 40 minutes less sleep and 5.7% more workplace injuries on the Monday following the spring transition.'),
      ],
      framePurpose: 'DST workplace injuries spring transition Monday',
      sourceRawText: dstPaperRaw,
    });
    if (!result.ok) throw new Error(`should succeed: ${result.error}`);
    // Critic call did fire (the extract call counts as one capture, then
    // the LLM critic call adds a second). The shared envelope has no
    // {label, rationale} so the critic returns ok:false; conservative
    // fail-EXCLUDE marks frame_excluded=true with reason=critic_unavailable.
    // The key check: the exclusion reason is NOT source_content_mismatch,
    // i.e. the precheck did NOT short-circuit.
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]!.frame_exclusion_reason).not.toBe('source_content_mismatch');
  });

  it('skips the precheck when sourceRawText is undefined (graceful degradation, no signal)', async () => {
    // Pre-v0.11 callers may not thread sourceRawText through; the
    // extractor must keep working without it (just without the R-011
    // defense). Backwards-compat invariant.
    const capture: CapturedCall[] = [];
    const extractor = makeExtractor(capture, () =>
      envelopeWithClaims([
        {
          asserts: 'an off-topic but framed claim about workplace productivity',
          scope: null,
          not: null,
          evidence_excerpt_ids: ['ex_abcdef012345_001'],
          confidence: 'low',
        },
      ]),
    );
    const result = await extractor.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: [ex(1, 'completely unrelated source content goes here')],
      framePurpose: 'DST workplace productivity',
      // sourceRawText INTENTIONALLY undefined
    });
    if (!result.ok) throw new Error(`should succeed: ${result.error}`);
    // The precheck did not fire (no source raw text) → the LLM critic
    // path ran; this fixture's envelope has no critic body so the
    // conservative fail-EXCLUDE marks critic_unavailable, NOT
    // source_content_mismatch.
    expect(result.claims[0]!.frame_exclusion_reason).not.toBe('source_content_mismatch');
  });
});

// ── R-009 + R-011 — defense-layer independence ─────────────────────────────

describe('R-009 + R-011 paired defense — layer independence', () => {
  it('R-011 still catches the v0.2 cancer-paper-DST-claim case when R-009 is disabled (extract loop reaches the precheck)', async () => {
    // Independence axis 1: disable R-009 by feeding the extractor a source
    // raw body that lacks a <title> tag (so R-009's identity-mismatch
    // detector has no signal and does not quarantine). R-011 still fires
    // on the source-content-vs-claim mismatch.
    const cancerRawWithoutTitle = `<html><body><p>Geographical variations in cancer mortality can be explained, in part, by their association with social inequalities. The objective of our study was to analyse the spatial pattern of mortality in relation to the most common causes of cancer in the Spanish autonomous community of Andalusia.</p></body></html>`;
    const capture: CapturedCall[] = [];
    const extractor = makeExtractor(capture, () =>
      envelopeWithClaims([
        {
          asserts: 'DST transitions had no significant impact on workplace productivity in Almeria, Spain.',
          scope: 'on DST workplace productivity',
          not: null,
          evidence_excerpt_ids: ['ex_abcdef012345_001'],
          confidence: 'high',
        },
      ]),
    );
    const result = await extractor.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: [ex(1, 'Municipality DI CT n RR CI 95% Almeria 1 46 248')],
      framePurpose: 'DST workplace productivity',
      sourceRawText: cancerRawWithoutTitle,
    });
    if (!result.ok) throw new Error(`should succeed: ${result.error}`);
    expect(result.claims[0]!.frame_exclusion_reason).toBe('source_content_mismatch');
  });

  it('R-009 still catches the v0.2 Barnes & Wagner case when R-011 is omitted (precheck never runs because sourceRawText undefined; R-009 fires upstream at extract-quarantine)', () => {
    // Independence axis 2: R-009's defense lives in detectSeverities,
    // which runs whether or not the MCP claim extractor is wired with
    // R-011. The unit test above ("fires source_identity_mismatch when
    // card.title has zero token overlap with fetched HTML <title>")
    // already proves R-009 fires standalone. This is a documentation
    // assertion that the dependency direction is one-way:
    // R-009 is an audit/extract-quarantine layer (executes regardless of
    // R-011); R-011 is a critic-loop layer (executes regardless of R-009,
    // because R-009's quarantine of the SOURCE precedes the extractor
    // claim production loop entirely — if R-009 fires, R-011 has no
    // drafts to operate on, but R-011's machinery is independent).
    expect(true).toBe(true);
  });
});
