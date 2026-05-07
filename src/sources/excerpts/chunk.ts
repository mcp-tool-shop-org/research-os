// Deterministic source-span chunker. Given raw text (HTML or plain), produces a
// stable ordered list of excerpts. Same input → same output, byte-for-byte.
// The model never authors evidence spans; this is where they come from.

const MIN_EXCERPT_CHARS = 30;
const MAX_EXCERPT_CHARS = 800;

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => HTML_ENTITIES[m] ?? m);
}

function looksLikeHtml(text: string): boolean {
  return /<\/?(p|div|br|li|h[1-6]|article|section|main|body|html)\b/i.test(text);
}

// Replace block-level HTML tags with paragraph breaks, then strip inline tags.
// Preserves character flow but forces paragraph boundaries.
function htmlToParagraphedText(text: string): string {
  let t = text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|article|section|main|tr|table|blockquote)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(p|div|li|h[1-6]|article|section|main|tr|table|blockquote)\b[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ');
  t = decodeEntities(t);
  // Normalise within-line whitespace but preserve paragraph breaks (\n\n+).
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/\n{2,}/g, '\n\n');
  t = t.replace(/[ \t]*\n[ \t]*/g, '\n');
  return t.trim();
}

function plainToParagraphedText(text: string): string {
  let t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/\n{2,}/g, '\n\n');
  return t.trim();
}

export interface ExcerptDraft {
  text: string;
  char_start: number;
  char_end: number;
  location_hint: string | null;
}

// Split a paragraph into sentences. Conservative: only splits on .!? followed
// by whitespace + uppercase / end-of-text. Won't split inside common abbreviations.
function splitSentences(paragraph: string): string[] {
  // Quick path: short paragraph stays intact.
  if (paragraph.length <= MAX_EXCERPT_CHARS) return [paragraph];
  const out: string[] = [];
  let buf = '';
  for (let i = 0; i < paragraph.length; i += 1) {
    const ch = paragraph[i]!;
    buf += ch;
    if (ch === '.' || ch === '!' || ch === '?') {
      const next = paragraph[i + 1];
      const nextNext = paragraph[i + 2];
      // boundary if next is space and nextNext is uppercase, OR end of string
      if (
        next === undefined ||
        (next === ' ' && nextNext !== undefined && /[A-Z0-9"'(\[]/.test(nextNext))
      ) {
        out.push(buf.trim());
        buf = '';
      }
    }
  }
  if (buf.trim().length > 0) out.push(buf.trim());
  // Merge tiny tail-fragments so we don't produce sub-min excerpts here.
  const merged: string[] = [];
  for (const s of out) {
    if (merged.length > 0 && (merged[merged.length - 1]!.length < MIN_EXCERPT_CHARS || s.length < MIN_EXCERPT_CHARS)) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${s}`.trim();
    } else {
      merged.push(s);
    }
  }
  return merged;
}

// Produces a stable ordered list of excerpt drafts from raw source text.
// char_start/char_end are positions inside the *cleaned* paragraphed text,
// not the original raw HTML — that's intentional: the cleaned text is what
// the model sees, so offsets must be reproducible from it.
export function chunkRawText(rawText: string): { cleaned: string; drafts: ExcerptDraft[] } {
  const cleaned = looksLikeHtml(rawText) ? htmlToParagraphedText(rawText) : plainToParagraphedText(rawText);
  const drafts: ExcerptDraft[] = [];
  if (cleaned.length === 0) return { cleaned, drafts };

  // Walk the cleaned text and recover paragraph offsets so char_start/char_end
  // are accurate inside `cleaned`.
  const paragraphRegex = /([^\n][\s\S]*?)(?:\n\n+|$)/g;
  let m: RegExpExecArray | null;
  let paraIndex = 0;
  while ((m = paragraphRegex.exec(cleaned)) !== null) {
    const paraText = m[1]!.trim();
    if (paraText.length === 0) continue;
    paraIndex += 1;
    const paraStart = m.index;
    const sentences = splitSentences(paraText);
    let cursor = 0;
    for (const sentence of sentences) {
      // Locate the sentence inside the original paragraph at-or-after cursor.
      const idxInPara = m[1]!.indexOf(sentence, cursor);
      const start = idxInPara >= 0 ? paraStart + idxInPara : paraStart;
      const end = idxInPara >= 0 ? start + sentence.length : start + sentence.length;
      cursor = idxInPara >= 0 ? idxInPara + sentence.length : cursor + sentence.length;
      let text = sentence;
      if (text.length > MAX_EXCERPT_CHARS) {
        text = text.slice(0, MAX_EXCERPT_CHARS).trimEnd() + ' …';
      }
      if (text.length < MIN_EXCERPT_CHARS) continue;
      drafts.push({
        text,
        char_start: start,
        char_end: end,
        location_hint: `paragraph ${paraIndex}`,
      });
    }
  }
  return { cleaned, drafts };
}

// Build excerpt drafts from source-card key_points (used when no raw text is
// available — still deterministic).
export function chunkKeyPoints(keyPoints: string[]): ExcerptDraft[] {
  const drafts: ExcerptDraft[] = [];
  let cursor = 0;
  let kpIndex = 0;
  for (const kpRaw of keyPoints) {
    const kp = kpRaw.trim();
    if (kp.length === 0) continue;
    kpIndex += 1;
    let text = kp;
    if (text.length > MAX_EXCERPT_CHARS) {
      text = text.slice(0, MAX_EXCERPT_CHARS).trimEnd() + ' …';
    }
    // Skip too-short key points: they'd fail evidence_excerpt min length anyway.
    if (text.length < 1) continue;
    drafts.push({
      text,
      char_start: cursor,
      char_end: cursor + text.length,
      location_hint: `key_point ${kpIndex}`,
    });
    cursor += text.length + 2;
  }
  return drafts;
}
