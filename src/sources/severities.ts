/**
 * Source-card severity detection — v0.10 Slice 3 (R-003 + R-005).
 *
 * Pure function. No I/O. Detects two severities from a SourceCard + fetched
 * body context:
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
 * Detection is compound: marker substring alone is NOT sufficient for R-003
 * (false-positive guard for legitimate CAPTCHA research). Each finding's
 * `reasons[]` names every signal that fired so the audit output is auditable.
 *
 * Override: src/sources/effective-card.ts#getClearedSeverities reads the
 * source-card override ledger's `clear_severities[]` and removes cleared
 * severities from this function's output.
 */
import * as cheerio from 'cheerio';

import type { SourceCard } from './schema.js';

export type SourceSeverity =
  | 'bot_check_or_captcha_detected'
  | 'extraction_suspect_word_count_mismatch';

export const SOURCE_SEVERITIES = [
  'bot_check_or_captcha_detected',
  'extraction_suspect_word_count_mismatch',
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

export interface SeverityThresholds {
  botCheck: BotCheckThresholds;
  extractionRatio: ExtractionRatioThresholds;
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
  };
}

/** Marker substrings (lowercased, normalized). Each entry is one signal. */
const BOT_CHECK_MARKERS: readonly { key: string; needle: string }[] = [
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

  return findings;
}
