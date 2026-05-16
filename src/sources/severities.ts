/**
 * Source-card severity detection — v0.10 Slice 3 (R-003 + R-005), v0.11 Slice 3 (R-009).
 *
 * Pure function. No I/O. Detects up to three severities from a SourceCard +
 * fetched body context:
 *
 *   - bot_check_or_captcha_detected (HARD FAIL — R-003)
 *     Bot-check / CAPTCHA / Incapsula challenge pages confabulated into
 *     a fully-formed source card by the LLM extractor. Defense-in-depth
 *     at the audit layer; downstream defenses (frame critic, audit-density)
 *     remain in place but are no longer the only line.
 *
 *   - extraction_suspect_word_count_mismatch (WARN AND QUARANTINE — R-005)
 *     Extraction text size vastly exceeds fetched body size — the kind of
 *     pattern that produces hallucinated content from thin sources.
 *
 *   - source_identity_mismatch (HARD FAIL — R-009)
 *     The emitted card.title disagrees with the fetched HTML <title> tag.
 *     Catches LLM source-card extractor confabulations where the extractor
 *     invented an identity that doesn't match the page it was actually
 *     given. v0.2 originating case: PubMed page for Barnes & Wagner 2009
 *     ("Changing to daylight saving time…") emitted as
 *     "Effects of intrathecal clonidine on morphine-induced analgesia and
 *     respiratory depression in rats." Detection reuses R-008's
 *     deterministic keyword-overlap helper for vocabulary alignment with
 *     the discover-layer relevance check; pages with no extractable
 *     <title> degrade gracefully (no signal, no over-block).
 *
 * Detection is compound: marker substring alone is NOT sufficient for R-003
 * (false-positive guard for legitimate CAPTCHA research). Each finding's
 * `reasons[]` names every signal that fired so the audit output is auditable.
 *
 * Override: src/sources/effective-card.ts#getClearedSeverities reads the
 * source-card override ledger's `clear_severities[]` and removes cleared
 * severities from this function's output.
 */
import * as cheerio from 'cheerio';

import {
  computeKeywordOverlap,
  tokenizeForRelevance,
} from '../discover/relevance.js';
import type { SourceCard } from './schema.js';

export type SourceSeverity =
  | 'bot_check_or_captcha_detected'
  | 'extraction_suspect_word_count_mismatch'
  | 'source_identity_mismatch';

export const SOURCE_SEVERITIES = [
  'bot_check_or_captcha_detected',
  'extraction_suspect_word_count_mismatch',
  'source_identity_mismatch',
] as const;

export interface SeverityFinding {
  severity: SourceSeverity;
  reasons: string[];
}

export interface BotCheckThresholds {
  /** When a marker is present, body word count must be ≤ this for R-003 to fire. Guards against legitimate research mentioning CAPTCHA in prose. */
  maxBodyWordsWithMarker: number;
  /** Body byte count ceiling for the script-density signal. */
  maxBytesForScriptDensity: number;
  /** Script-density ratio threshold (0..1). */
  minScriptDensityRatio: number;
  /** Threshold for "no readable prose after stripping scripts". */
  maxProseWordsNoMarker: number;
  /** Body byte ceiling for the fast-response signal. */
  maxBytesForFastResponse: number;
  /** Response-time ceiling (ms) for the fast-response signal. */
  maxResponseTimeMs: number;
}

export interface ExtractionRatioThresholds {
  /** Body word count must be ≤ this. */
  maxSourceWords: number;
  /** Extracted-text word count must be ≥ this. */
  minExtractedWords: number;
  /** Extracted/source ratio must be ≥ this. */
  minRatio: number;
}

export interface IdentityMismatchThresholds {
  /**
   * R-009 keyword-overlap floor between emitted card.title and fetched HTML
   * <title>. Below this fraction → source_identity_mismatch fires. Matches
   * R-008's discover-layer default so the vocabulary of "low overlap is a
   * mismatch" is consistent across defense layers.
   */
  minOverlapThreshold: number;
}

export interface SeverityThresholds {
  botCheck: BotCheckThresholds;
  extractionRatio: ExtractionRatioThresholds;
  identityMismatch: IdentityMismatchThresholds;
}

export const DEFAULT_SEVERITY_THRESHOLDS: SeverityThresholds = {
  botCheck: {
    // Conservative: a real bot-check page has ≤100 words of body prose.
    // Legitimate research papers about CAPTCHA / Cloudflare are easily 5–10×
    // larger and never trip this when paired with the marker check.
    maxBodyWordsWithMarker: 100,
    maxBytesForScriptDensity: 2048,
    minScriptDensityRatio: 0.5,
    // Signal C requires scripts to be present in the body (see detect logic).
    // The threshold is the prose floor for "no readable prose remains after
    // stripping the JS challenge."
    maxProseWordsNoMarker: 50,
    maxBytesForFastResponse: 2048,
    maxResponseTimeMs: 100,
  },
  extractionRatio: {
    maxSourceWords: 200,
    minExtractedWords: 800,
    minRatio: 4,
  },
  identityMismatch: {
    // Mirrors src/discover/relevance.ts DEFAULT_RELEVANCE_THRESHOLD.
    // At ≤7 title tokens this requires ≥2 to match across emitted and
    // fetched titles; the v0.2 rats/clonidine vs. workplace-injuries
    // case has 0 overlap and trips cleanly.
    minOverlapThreshold: 0.2,
  },
};

/**
 * Per-pack threshold override config — snake_case shape that matches the
 * research.yaml audit.severity_thresholds block (src/intake/schema.ts).
 * Used to project per-pack settings onto the camelCase runtime thresholds.
 */
export interface SeverityThresholdsConfigInput {
  bot_check?: {
    max_body_words_with_marker?: number;
    max_bytes_for_script_density?: number;
    min_script_density_ratio?: number;
    max_prose_words_no_marker?: number;
    max_bytes_for_fast_response?: number;
    max_response_time_ms?: number;
  };
  extraction_word_count_ratio?: {
    max_source_words?: number;
    min_extracted_words?: number;
    min_ratio?: number;
  };
  identity_mismatch?: {
    min_overlap_threshold?: number;
  };
}

/**
 * Merge a snake_case research.yaml override block onto the defaults to
 * produce a runtime SeverityThresholds. Each leaf is independently
 * overridable; missing leaves fall back to DEFAULT_SEVERITY_THRESHOLDS.
 */
export function resolveSeverityThresholds(
  config: SeverityThresholdsConfigInput | null | undefined,
): SeverityThresholds {
  const d = DEFAULT_SEVERITY_THRESHOLDS;
  const bc = config?.bot_check;
  const er = config?.extraction_word_count_ratio;
  const im = config?.identity_mismatch;
  return {
    botCheck: {
      maxBodyWordsWithMarker: bc?.max_body_words_with_marker ?? d.botCheck.maxBodyWordsWithMarker,
      maxBytesForScriptDensity:
        bc?.max_bytes_for_script_density ?? d.botCheck.maxBytesForScriptDensity,
      minScriptDensityRatio: bc?.min_script_density_ratio ?? d.botCheck.minScriptDensityRatio,
      maxProseWordsNoMarker: bc?.max_prose_words_no_marker ?? d.botCheck.maxProseWordsNoMarker,
      maxBytesForFastResponse:
        bc?.max_bytes_for_fast_response ?? d.botCheck.maxBytesForFastResponse,
      maxResponseTimeMs: bc?.max_response_time_ms ?? d.botCheck.maxResponseTimeMs,
    },
    extractionRatio: {
      maxSourceWords: er?.max_source_words ?? d.extractionRatio.maxSourceWords,
      minExtractedWords: er?.min_extracted_words ?? d.extractionRatio.minExtractedWords,
      minRatio: er?.min_ratio ?? d.extractionRatio.minRatio,
    },
    identityMismatch: {
      minOverlapThreshold:
        im?.min_overlap_threshold ?? d.identityMismatch.minOverlapThreshold,
    },
  };
}

/**
 * Marker substrings (lowercased, normalized). Each entry is one signal.
 *
 * v0.10 Slice 4 — exported so gather-layer light detection (Signal A only)
 * can mirror R-003's marker vocabulary without re-implementing the list.
 * The audit-layer R-003 detection in detectSeverities() remains the
 * authoritative multi-signal path; gather-layer is informational.
 */
export const BOT_CHECK_MARKERS: readonly { key: string; needle: string }[] = [
  { key: 'captcha', needle: 'captcha' },
  { key: 'incapsula', needle: 'incapsula' },
  { key: 'cloudflare_challenge', needle: 'cloudflare challenge' },
  { key: 'please_verify_you_are_human', needle: 'please verify you are human' },
  { key: 'robot_check', needle: 'robot check' },
  { key: '_incapsula_resource', needle: '_incapsula_resource' },
  { key: 'access_denied', needle: 'access denied' },
];

function isHtmlContentType(contentType: string | null | undefined, rawText: string): boolean {
  if (contentType && contentType.includes('text/html')) return true;
  return /<html[\s>]/i.test(rawText);
}

function countWords(text: string): number {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(' ').length;
}

function stripScriptsAndStyles(rawText: string, isHtml: boolean): { stripped: string; scriptBytes: number } {
  if (!isHtml) {
    return { stripped: rawText, scriptBytes: 0 };
  }
  // Cheerio handles malformed HTML gracefully. We count the byte cost of
  // <script>/<style> blocks for density computation, then return the text
  // content of the body for prose word-counting.
  let scriptBytes = 0;
  const $ = cheerio.load(rawText);
  $('script, style').each((_, el) => {
    const html = $.html(el);
    if (typeof html === 'string') scriptBytes += html.length;
    $(el).remove();
  });
  const body = $('body').text() ?? '';
  return { stripped: body, scriptBytes };
}

function extractedTextWordCount(card: SourceCard): number {
  const parts: string[] = [];
  if (card.title) parts.push(card.title);
  if (card.asserts) parts.push(card.asserts);
  for (const kp of card.key_points) parts.push(kp);
  for (const lim of card.limitations) parts.push(lim);
  if (card.scope) parts.push(card.scope);
  if (card.not) parts.push(card.not);
  return countWords(parts.join(' '));
}

function findMarkerHits(rawText: string): string[] {
  const lower = rawText.toLowerCase();
  const hits: string[] = [];
  for (const m of BOT_CHECK_MARKERS) {
    if (lower.includes(m.needle)) hits.push(`marker:${m.key}`);
  }
  return hits;
}

/**
 * Decode the small set of HTML entities R-008's discover-layer title
 * fetcher recognises. Kept local so severities.ts does not depend on
 * relevance.ts's private constant — but uses the same vocabulary for
 * cross-layer consistency. Numeric entities (&#NNN;) decoded too.
 */
const TITLE_HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
};

function decodeTitleEntities(text: string): string {
  let out = text;
  for (const [ent, ch] of Object.entries(TITLE_HTML_ENTITIES)) {
    out = out.split(ent).join(ch);
  }
  out = out.replace(/&#(\d+);/g, (_m, n) => {
    const code = Number(n);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
  });
  return out;
}

// Match the first <title>…</title> block. The /s flag (dotall) lets the
// pattern span multi-line title declarations such as PMC's pretty-printed
// HTML: `<title>\n  Geographical variations…\n</title>`.
const TITLE_TAG_REGEX = /<title[^>]*>([\s\S]*?)<\/title>/i;

/**
 * Extract the first <title>…</title> block from a fetched HTML body.
 * Returns the decoded, whitespace-collapsed title, or null when no title
 * is present / body is null/empty. Pure function — used by R-009 detection.
 *
 * Mirrors the parsing shape of src/discover/relevance.ts#fetchUrlTitle so
 * the discover-layer R-008 defense and the audit/extract-layer R-009
 * defense behave consistently on identical bytes.
 */
export function extractHtmlTitle(rawText: string | null | undefined): string | null {
  if (!rawText || rawText.length === 0) return null;
  const match = TITLE_TAG_REGEX.exec(rawText);
  if (!match || !match[1]) return null;
  const title = decodeTitleEntities(match[1]).replace(/\s+/g, ' ').trim();
  return title.length > 0 ? title : null;
}

/**
 * Run severity detection. Pure function — does not read disk.
 *
 * @param input.card           — the SourceCard being audited
 * @param input.rawText        — the fetched body (null when binary / no extraction)
 * @param input.byteCount      — receipt.byte_count (null permitted)
 * @param input.contentType    — receipt.content_type
 * @param input.fetchDurationMs — receipt.fetch_duration_ms when present
 * @param input.thresholds      — defaults to DEFAULT_SEVERITY_THRESHOLDS
 */
export function detectSeverities(input: {
  card: SourceCard;
  rawText: string | null;
  byteCount: number | null;
  contentType?: string | null;
  fetchDurationMs?: number | null;
  thresholds?: SeverityThresholds;
}): SeverityFinding[] {
  const thresholds = input.thresholds ?? DEFAULT_SEVERITY_THRESHOLDS;
  const findings: SeverityFinding[] = [];

  // R-005 — ratio detector. Uses byte content as proxy for "what the body
  // contained" (word count of raw body, including HTML chrome). If we
  // stripped HTML we would over-count the divergence between thin pages
  // and rich cards; counting raw body words matches the v0.1 observation
  // (the operator noticed: 1035 bytes ≈ a small body, multi-paragraph card).
  if (input.rawText !== null) {
    const isHtml = isHtmlContentType(input.contentType ?? null, input.rawText);
    const { stripped } = stripScriptsAndStyles(input.rawText, isHtml);
    const bodyWords = countWords(stripped);
    const extractedWords = extractedTextWordCount(input.card);
    const ratio = bodyWords > 0 ? extractedWords / bodyWords : Number.POSITIVE_INFINITY;
    const t = thresholds.extractionRatio;
    if (
      bodyWords <= t.maxSourceWords &&
      extractedWords >= t.minExtractedWords &&
      ratio >= t.minRatio
    ) {
      findings.push({
        severity: 'extraction_suspect_word_count_mismatch',
        reasons: [
          `body_words=${bodyWords}`,
          `extracted_words=${extractedWords}`,
          `ratio=${Number.isFinite(ratio) ? Math.round(ratio * 10) / 10 : 'inf'}`,
        ],
      });
    }
  }

  // R-003 — bot-check / CAPTCHA hardening. Compound signal: marker alone
  // does NOT fire (false-positive guard). Each individual body-shape signal
  // can fire alone.
  if (input.rawText !== null) {
    const isHtml = isHtmlContentType(input.contentType ?? null, input.rawText);
    const markerHits = findMarkerHits(input.rawText);
    const totalBytes = input.byteCount ?? input.rawText.length;
    const { stripped, scriptBytes } = stripScriptsAndStyles(input.rawText, isHtml);
    const proseWords = countWords(stripped);
    const scriptDensity = totalBytes > 0 ? scriptBytes / totalBytes : 0;
    const t = thresholds.botCheck;

    const reasons: string[] = [];

    // Signal A — marker present AND body word count is below threshold
    // (markers paired with body-shape constraint protect against legitimate
    // prose research papers mentioning the marker substring).
    if (markerHits.length > 0 && proseWords <= t.maxBodyWordsWithMarker) {
      reasons.push(...markerHits);
    }

    // Signal B — body small AND script density high
    if (totalBytes <= t.maxBytesForScriptDensity && scriptDensity >= t.minScriptDensityRatio) {
      reasons.push(
        `script_density_over_50_in_small_body (bytes=${totalBytes}, script_ratio=${Math.round(scriptDensity * 100) / 100})`,
      );
    }

    // Signal C — page has substantial scripts AND no readable prose after
    // stripping them. The script-presence requirement guards against
    // false-positives on legitimate short pages that simply have brief prose
    // (a 30-word news teaser, a small landing page, etc.). The intent here
    // is to catch "this page is a JS challenge", not "this page is short."
    if (scriptBytes > 0 && proseWords <= t.maxProseWordsNoMarker) {
      reasons.push(
        `no_prose_after_scripts (prose_words=${proseWords}, script_bytes=${scriptBytes})`,
      );
    }

    // Signal D — CDN fast-challenge pattern
    if (
      typeof input.fetchDurationMs === 'number' &&
      input.fetchDurationMs <= t.maxResponseTimeMs &&
      totalBytes <= t.maxBytesForFastResponse
    ) {
      reasons.push(
        `fast_response_with_small_body (duration_ms=${input.fetchDurationMs}, bytes=${totalBytes})`,
      );
    }

    if (reasons.length > 0) {
      findings.push({ severity: 'bot_check_or_captcha_detected', reasons });
    }
  }

  // R-009 — source-card identity guard. Compare emitted card.title against
  // the fetched HTML <title>. If both sides have extractable tokens and
  // the keyword overlap is below threshold, the extractor confabulated an
  // identity that doesn't match the page it was given (v0.2 originating
  // shape: PubMed page is Barnes & Wagner 2009, emitted title is the
  // unrelated rats/clonidine paper).
  //
  // Asymmetric guards (NO signal → no fire) keep the defense resilient:
  //   - rawText null → no <title> to compare against → skip
  //   - fetched <title> absent / non-HTML body → graceful skip (mirrors
  //     R-008's `unverified` semantics; the defense does not over-block
  //     on pages that legitimately omit <title>)
  //   - either side tokenizes to zero significant tokens → skip (no
  //     comparable signal)
  if (input.rawText !== null) {
    const fetchedTitle = extractHtmlTitle(input.rawText);
    if (fetchedTitle !== null) {
      const cardTitle = (input.card.title ?? '').trim();
      const cardTokens = tokenizeForRelevance(cardTitle);
      const fetchedTokens = tokenizeForRelevance(fetchedTitle);
      if (cardTokens.length > 0 && fetchedTokens.length > 0) {
        // Symmetric overlap: query side is the emitted card title (R-009
        // is "do the emitted tokens appear in the fetched ones?"), so we
        // reuse computeKeywordOverlap with card.title as the "query" and
        // fetched <title> as the "title" being checked against.
        const overlap = computeKeywordOverlap(fetchedTitle, cardTitle);
        const threshold = thresholds.identityMismatch.minOverlapThreshold;
        if (overlap.overlapScore < threshold) {
          // Truncate fetched title for the reasons[] entry so the audit
          // output stays scannable even on pathological 1KB-long <title>
          // values that some CMSes emit.
          const truncated =
            fetchedTitle.length > 200 ? fetchedTitle.slice(0, 197) + '…' : fetchedTitle;
          findings.push({
            severity: 'source_identity_mismatch',
            reasons: [
              `overlap_score=${Math.round(overlap.overlapScore * 100) / 100}`,
              `threshold=${threshold}`,
              `card_title_tokens=${cardTokens.length}`,
              `fetched_title_tokens=${fetchedTokens.length}`,
              `fetched_title="${truncated}"`,
            ],
          });
        }
      }
    }
  }

  return findings;
}
