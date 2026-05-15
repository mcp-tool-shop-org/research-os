/**
 * R-003 + R-005 (v0.10 Slice 3) — source-card severity detection unit tests.
 *
 * detectSeverities is a pure function. It takes a SourceCard plus the body
 * context (rawText, byteCount, contentType, optional fetchDurationMs) and
 * returns 0..2 SeverityFinding entries:
 *
 *   - bot_check_or_captcha_detected (HARD FAIL — R-003)
 *   - extraction_suspect_word_count_mismatch (WARN — R-005)
 *
 * R-003 fires on a compound signal: marker substring alone is NOT sufficient
 * (false-positive guard for legitimate CAPTCHA research). Each `reasons[]`
 * entry names which signal fired so the operator can audit.
 *
 * R-005 fires when fetched body is small AND extracted text is large AND
 * the ratio exceeds a configurable threshold.
 */
import { describe, it, expect } from 'vitest';

import {
  detectSeverities,
  DEFAULT_SEVERITY_THRESHOLDS,
  type SeverityThresholds,
} from '../../src/sources/severities.js';
import type { SourceCard } from '../../src/sources/schema.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeCard(partial: Partial<SourceCard> = {}): SourceCard {
  return {
    source_id: 'src_aabbccddeeff',
    receipt_id: 'rcpt_aabbcc_1',
    section_id: '01-test',
    url: 'https://example.com/p',
    final_url: 'https://example.com/p',
    fetched_at: '2026-05-15T10:00:00.000Z',
    publisher: 'Example',
    published_at: null,
    title: 'A Title',
    source_type: 'secondary',
    relevance: 'medium',
    key_points: ['point one'],
    limitations: [],
    asserts: 'It asserts.',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-15T10:00:00.000Z',
    ...partial,
  };
}

// ─── R-003 — bot-check / CAPTCHA hardening ───────────────────────────────────

describe('detectSeverities — R-003 bot-check / CAPTCHA hardening', () => {
  it('fires bot_check_or_captcha_detected when body contains _Incapsula_Resource AND body is small', () => {
    const rawText = `<html><head></head><body><script>var _Incapsula_Resource="SWUDNB"; (function() {})();</script></body></html>`;
    const findings = detectSeverities({
      card: makeCard(),
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
    });
    const bot = findings.find((f) => f.severity === 'bot_check_or_captcha_detected');
    expect(bot).toBeDefined();
    expect(bot!.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/marker:_incapsula_resource/i)]),
    );
  });

  it('fires bot_check_or_captcha_detected on body < 2KB AND <script> density > 50%', () => {
    // 600 bytes of script content + thin html wrapper = >50% density, body <2KB
    const scriptBody = 'a'.repeat(600);
    const rawText = `<html><body><div>x</div><script>${scriptBody}</script></body></html>`;
    const findings = detectSeverities({
      card: makeCard(),
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
    });
    const bot = findings.find((f) => f.severity === 'bot_check_or_captcha_detected');
    expect(bot).toBeDefined();
    expect(bot!.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/script_density_over_50_in_small_body/)]),
    );
  });

  it('fires once per card with reasons[] listing each signal that matched (multiple markers + small body)', () => {
    const rawText =
      `<html><body><script>cloudflare challenge — please verify you are human</script></body></html>`;
    const findings = detectSeverities({
      card: makeCard(),
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
    });
    const bot = findings.filter((f) => f.severity === 'bot_check_or_captcha_detected');
    expect(bot).toHaveLength(1);
    expect(bot[0]!.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/marker:cloudflare_challenge/),
        expect.stringMatching(/marker:please_verify_you_are_human/),
      ]),
    );
  });

  it('false-positive guard: legitimate CAPTCHA research paper (long prose body containing "captcha") does NOT fire', () => {
    // 3KB+ of natural-language paragraphs that mention "CAPTCHA" academically.
    const para = `In this paper, we study CAPTCHA mechanisms and their resilience to optical character recognition attacks. ` +
      `CAPTCHA stands for Completely Automated Public Turing test to tell Computers and Humans Apart. ` +
      `Our methodology includes evaluating both reCAPTCHA and hCaptcha on a dataset of 12,000 samples. ` +
      `Results show meaningful differences in robustness across vendors when controlling for noise injection. `;
    const rawText =
      `<html><head><title>CAPTCHA Robustness</title></head><body>` +
      `<article>` +
      Array.from({ length: 8 }, () => `<p>${para}</p>`).join('') +
      `</article></body></html>`;
    const findings = detectSeverities({
      card: makeCard(),
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
    });
    const bot = findings.find((f) => f.severity === 'bot_check_or_captcha_detected');
    expect(bot).toBeUndefined();
  });

  it('fires when fetch_duration_ms is small AND body is small (CDN fast-challenge pattern)', () => {
    const rawText = `<html><body>x</body></html>`;
    const findings = detectSeverities({
      card: makeCard(),
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
      fetchDurationMs: 35,
    });
    const bot = findings.find((f) => f.severity === 'bot_check_or_captcha_detected');
    expect(bot).toBeDefined();
    expect(bot!.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/fast_response_with_small_body/)]),
    );
  });

  it('does NOT fire on a small body alone without a marker or script density', () => {
    // A small but legitimate body — short news article, no markers, all prose.
    const rawText =
      `<html><body><article>A short post. It is brief but human-readable prose with multiple sentences. ` +
      `Nothing here matches a bot-check signature. The body is small only because it is concise.</article></body></html>`;
    const findings = detectSeverities({
      card: makeCard(),
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
    });
    const bot = findings.find((f) => f.severity === 'bot_check_or_captcha_detected');
    expect(bot).toBeUndefined();
  });
});

// ─── R-005 — low-word-count hallucination guard ──────────────────────────────

describe('detectSeverities — R-005 low-word-count hallucination guard', () => {
  it('fires when source body word count is < threshold AND extracted text > threshold AND ratio > min', () => {
    // 150 words of body → small. Extracted text >800 words → rich.
    const bodyWords = Array.from({ length: 150 }, (_, i) => `word${i}`).join(' ');
    const rawText = `<html><body><p>${bodyWords}</p></body></html>`;
    // Synthesize a richly-populated card with extracted_text size = ~1000 words
    const longAsserts = Array.from({ length: 200 }, (_, i) => `lipsum${i}`).join(' ');
    const longKeyPoints = Array.from({ length: 5 }, () =>
      Array.from({ length: 200 }, (_, i) => `kpwd${i}`).join(' '),
    );
    const card = makeCard({
      title: 'A confabulated paper title',
      asserts: longAsserts,
      key_points: longKeyPoints,
      scope: 'population: us workers; outcome: workplace accidents',
      not: 'controlled trials excluded',
    });
    const findings = detectSeverities({
      card,
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
    });
    const ratio = findings.find((f) => f.severity === 'extraction_suspect_word_count_mismatch');
    expect(ratio).toBeDefined();
    expect(ratio!.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/body_words=150/),
        expect.stringMatching(/extracted_words=\d+/),
        expect.stringMatching(/ratio=\d+/),
      ]),
    );
  });

  it('does NOT fire when body word count exceeds the threshold', () => {
    const bodyWords = Array.from({ length: 250 }, (_, i) => `word${i}`).join(' ');
    const rawText = `<html><body><p>${bodyWords}</p></body></html>`;
    const longAsserts = Array.from({ length: 200 }, (_, i) => `lipsum${i}`).join(' ');
    const card = makeCard({ asserts: longAsserts });
    const findings = detectSeverities({
      card,
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
    });
    expect(
      findings.find((f) => f.severity === 'extraction_suspect_word_count_mismatch'),
    ).toBeUndefined();
  });

  it('does NOT fire when extracted text is below the threshold (terse card from a thin source)', () => {
    // 100 body words, extracted card is also short — not a hallucination pattern.
    const bodyWords = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
    const rawText = `<html><body><p>${bodyWords}</p></body></html>`;
    const card = makeCard({
      title: 'Short',
      asserts: 'Brief assertion only.',
      key_points: ['one short point'],
    });
    const findings = detectSeverities({
      card,
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
    });
    expect(
      findings.find((f) => f.severity === 'extraction_suspect_word_count_mismatch'),
    ).toBeUndefined();
  });

  it('does NOT fire when ratio is below threshold (extracted only modestly larger than source)', () => {
    // Body=120 words; extracted = ~300 words; ratio = 2.5 — below default 4×.
    const bodyWords = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
    const rawText = `<html><body><p>${bodyWords}</p></body></html>`;
    const mediumAsserts = Array.from({ length: 50 }, (_, i) => `lipsum${i}`).join(' ');
    const card = makeCard({
      asserts: mediumAsserts,
      key_points: [
        Array.from({ length: 50 }, (_, i) => `kp${i}`).join(' '),
        Array.from({ length: 50 }, (_, i) => `kp${i + 50}`).join(' '),
      ],
    });
    const findings = detectSeverities({
      card,
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
    });
    expect(
      findings.find((f) => f.severity === 'extraction_suspect_word_count_mismatch'),
    ).toBeUndefined();
  });

  it('honours custom thresholds passed via the thresholds parameter', () => {
    const tightThresholds: SeverityThresholds = {
      ...DEFAULT_SEVERITY_THRESHOLDS,
      extractionRatio: {
        ...DEFAULT_SEVERITY_THRESHOLDS.extractionRatio,
        maxSourceWords: 50,
        minExtractedWords: 100,
        minRatio: 2,
      },
    };
    // Default would not fire (40 body words is below threshold but extracted is only 120 words ratio 3.0).
    const bodyWords = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const rawText = `<html><body><p>${bodyWords}</p></body></html>`;
    const longAsserts = Array.from({ length: 120 }, (_, i) => `lipsum${i}`).join(' ');
    const card = makeCard({ asserts: longAsserts, key_points: [] });

    const defaultFindings = detectSeverities({
      card,
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
    });
    expect(
      defaultFindings.find((f) => f.severity === 'extraction_suspect_word_count_mismatch'),
    ).toBeUndefined();

    const customFindings = detectSeverities({
      card,
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
      thresholds: tightThresholds,
    });
    expect(
      customFindings.find((f) => f.severity === 'extraction_suspect_word_count_mismatch'),
    ).toBeDefined();
  });
});

// ─── APA v0.1 replay — BOTH severities fire on one card ──────────────────────

describe('detectSeverities — APA v0.1 case replay (R-003 + R-005 together)', () => {
  it('replays the v0.1 APA Incapsula fragment → R-003 fires AND R-005 fires (both severities recorded)', () => {
    // Approximate the v0.1 1035-byte APA Incapsula response: contains
    // _Incapsula_Resource marker plus a small JS challenge payload, no prose.
    const rawText =
      `<html><head><META NAME="ROBOTS" CONTENT="NOINDEX, NOFOLLOW"></head>` +
      `<body><script>` +
      `(function() { var _Incapsula_Resource = {SWUDNBZxPWh="cbb1ed",SWWNBZxPWh="d2bb6a30"}; ` +
      `var z="";var b="7472797B766172207868725F77...";})();` +
      `</script></body></html>`;
    // Hallucinated source card: fabricated COVID-19 mental-health study text.
    const fabricatedAsserts = Array.from(
      { length: 250 },
      (_, i) => `In the synthesized survey of Bangladeshi adults during the COVID-19 pandemic clause${i}`,
    ).join(' ');
    const fabricatedKeyPoints = [
      Array.from({ length: 80 }, (_, i) => `kp${i} mental health workers`).join(' '),
      Array.from({ length: 80 }, (_, i) => `kp${i + 80} accident rates rose 23%`).join(' '),
      Array.from({ length: 80 }, (_, i) => `kp${i + 160} cross-sectional design`).join(' '),
    ];
    const card = makeCard({
      title:
        'Impact of COVID-19 pandemic on workplace mental health and accident rates in Bangladesh',
      asserts: fabricatedAsserts,
      key_points: fabricatedKeyPoints,
      scope: 'population: bangladeshi workers; outcome: workplace accidents; context: COVID-19 era',
      not: 'pediatric workers excluded',
    });

    const findings = detectSeverities({
      card,
      rawText,
      byteCount: rawText.length,
      contentType: 'text/html',
      fetchDurationMs: 80,
    });

    const severities = findings.map((f) => f.severity).sort();
    expect(severities).toEqual(
      ['bot_check_or_captcha_detected', 'extraction_suspect_word_count_mismatch'].sort(),
    );
  });
});
