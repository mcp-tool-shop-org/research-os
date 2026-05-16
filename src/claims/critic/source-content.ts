/**
 * Frame-critic source-content guard — v0.11 Slice 3 (R-011).
 *
 * Pure functions. No I/O. Companion to R-009's extractor-identity guard:
 * R-009 quarantines the SOURCE when the emitted card.title disagrees with
 * the fetched HTML <title>; R-011 quarantines the CLAIM when the claim's
 * asserts text does not topically match the source's actual content. Both
 * layers fire independently — the v0.2 cancer-paper-DST-claim shape can
 * be caught by either layer alone (see acceptance test 10 in the kickoff).
 *
 * Mechanism: compute a source-content topical signature ONCE per source
 * at extract time (reuses R-008's `tokenizeForRelevance` for cross-layer
 * vocabulary consistency). Before each per-claim LLM critic call, run a
 * deterministic claim-asserts-vs-source-signature overlap check. Below
 * threshold → mark the draft `frame_excluded=true` with reason
 * `source_content_mismatch` and skip the LLM critic call (the deterministic
 * precheck has already decided).
 *
 * v0.2 originating shape: Section 01 candidate ledger contained 11 cancer-
 * paper-derived claims whose asserts text was DST-framed ("DST transitions
 * had no significant impact on workplace productivity in Almeria, Spain")
 * but whose source content was Andalusia cancer-mortality research. The
 * frame critic operated on the claim asserts + the card's source-type +
 * publisher metadata; the source-card title was "(untitled)" and gave the
 * critic no useful source-content signal. R-011 closes this gap.
 *
 * Defense scope intentionally narrow: this catches deterministic-overlap
 * absence (claim mentions things the source body doesn't discuss). It does
 * NOT catch claims that are semantically misaligned but share lexical
 * vocabulary — that's the LLM critic's territory (which still runs when
 * the precheck does not fire). Two layers, two failure modes covered.
 */
import * as cheerio from 'cheerio';

import {
  computeKeywordOverlap,
  tokenizeForRelevance,
} from '../../discover/relevance.js';

/**
 * Default keyword-overlap threshold (≥ this fraction of claim-asserts
 * keywords must appear in the source signature for the claim to pass the
 * precheck). 0.2 matches R-008/R-009's discover/extract-layer thresholds
 * for vocabulary consistency across the three defense layers.
 *
 * Calibration: the v0.2 cancer-paper-DST-claim case has overlap ≤ 0.1
 * (only place names like "Almeria" / "Spain" appear in both, and only when
 * the claim explicitly cites them — generic DST claims have 0 overlap).
 * Real on-topic DST workplace claims share 50–80% of asserts vocabulary
 * with the source body. The 0.2 floor is well-separated.
 */
export const DEFAULT_FRAME_SOURCE_CONTENT_THRESHOLD = 0.2;

/**
 * Bound on how much raw text we feed into the signature builder. Real
 * research papers run 5–50KB after HTML stripping; this cap protects
 * against degenerate large bodies (e.g., a 10MB scraped HTML page with
 * embedded data tables) without changing the signature on normal inputs.
 */
const MAX_SIGNATURE_CHARS = 64 * 1024;

/**
 * Strip <script> + <style> blocks then return the body text. Mirrors the
 * stripping shape used in severities.ts's R-005 detector for consistency.
 */
function stripToText(rawText: string): string {
  // Cheap pre-check: if the text doesn't look like HTML we save the cheerio
  // parse and just return as-is (signatures from plain-text bodies stay
  // accurate; we don't pretend they're HTML).
  if (!/<[a-z]/i.test(rawText)) return rawText;
  try {
    const $ = cheerio.load(rawText);
    $('script, style').remove();
    // Prefer body text → root text. Do NOT fall back to raw HTML on an
    // empty body: that would let HTML chrome tokens ("html", "body",
    // "head") into the signature on legitimately empty pages, and the
    // R-011 precheck would then incorrectly score any claim mentioning
    // those words as topically-aligned. Empty → empty.
    const body = $('body').text();
    if (body.length > 0) return body;
    return $.root().text();
  } catch {
    // cheerio parse failure → fall back to the raw text. The tokenizer
    // strips HTML chrome via its split regex, so HTML tags don't bleed
    // into tokens — but the chrome words *do* leak. Mostly defensive;
    // cheerio rarely throws on real inputs.
    return rawText;
  }
}

/**
 * Compute a source-content topical signature from raw body text. The
 * signature is the Set of unique significant tokens (after R-008's
 * stopword + length filter). Order-independent and deterministic.
 *
 * Pass the result to checkClaimSourceContentMatch for each claim from
 * this source. Cost amortized over the source's claims: tokenization
 * runs once per source, not once per claim.
 */
export function computeSourceContentSignature(rawText: string | null): Set<string> {
  if (!rawText || rawText.length === 0) return new Set();
  const sliced =
    rawText.length > MAX_SIGNATURE_CHARS ? rawText.slice(0, MAX_SIGNATURE_CHARS) : rawText;
  const stripped = stripToText(sliced);
  if (stripped.length === 0) return new Set();
  const tokens = tokenizeForRelevance(stripped);
  return new Set(tokens);
}

export interface ClaimSourceContentMatchResult {
  /** True when overlap is below threshold AND both sides have signal. */
  mismatch: boolean;
  /** matched / claimKeywords.length, in [0, 1]. */
  overlapScore: number;
  /** Tokens from the claim asserts that appear in the source signature. */
  matchedKeywords: string[];
  /** All significant claim-asserts tokens (post-stopword/length filter). */
  claimKeywords: string[];
  /** Threshold used (echoed back for audit / logging). */
  threshold: number;
}

/**
 * Deterministic precheck: do the claim asserts share enough vocabulary
 * with the source content to warrant the LLM critic running? Below
 * threshold → mismatch (R-011 fires; LLM call skipped).
 *
 * Asymmetric guards (return mismatch=false) when either side has no
 * comparable signal:
 *   - source signature empty (no body / non-HTML / unparsable) → skip
 *   - claim asserts tokenize to zero significant tokens (e.g., stopword-
 *     only or punctuation-only) → skip
 *
 * These guards mirror R-009's "no <title> → no signal → don't over-block"
 * discipline. Better to fall through to the LLM critic on missing-signal
 * cases than to silently mark every claim as source_content_mismatch.
 */
export function checkClaimSourceContentMatch(args: {
  claimAsserts: string;
  sourceSignature: Set<string>;
  threshold: number;
}): ClaimSourceContentMatchResult {
  const claimKeywords = tokenizeForRelevance(args.claimAsserts);
  if (args.sourceSignature.size === 0 || claimKeywords.length === 0) {
    return {
      mismatch: false,
      overlapScore: 0,
      matchedKeywords: [],
      claimKeywords,
      threshold: args.threshold,
    };
  }
  // Reuse R-008's overlap math via computeKeywordOverlap. Build a
  // tokenized representation from the source signature — Array.from is
  // fine; ordering doesn't matter for set-membership lookup.
  const sourceTokens = Array.from(args.sourceSignature);
  // We want fraction-of-claim-tokens-in-source, NOT fraction-of-source-
  // tokens-in-claim — so the "query" side is the claim asserts. Mirrors
  // R-008's call shape (query="what the user asked for", title="what the
  // candidate offers"), and R-009's shape (query=card title, title=fetched
  // HTML title): in all three, the smaller, intent-bearing side is the
  // query.
  const overlap = computeKeywordOverlap(sourceTokens.join(' '), args.claimAsserts);
  const mismatch = overlap.overlapScore < args.threshold;
  return {
    mismatch,
    overlapScore: overlap.overlapScore,
    matchedKeywords: overlap.matchedKeywords,
    claimKeywords,
    threshold: args.threshold,
  };
}
