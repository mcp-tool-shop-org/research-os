import type { OverlapAssessment } from './types.js';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'from',
  'for', 'by', 'with', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'this', 'that', 'these', 'those', 'it', 'its', 'their', 'them', 'they',
  'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could',
  'than', 'then', 'so', 'such', 'into', 'about', 'above', 'below', 'across',
]);

const NEGATION_PATTERN =
  /\b(not|never|no|none|cannot|can't|won't|don't|doesn't|isn't|aren't|wasn't|weren't|nothing|neither|nor)\b/i;

export function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9]+/g);
  if (!matches) return [];
  return matches.filter((t) => !STOP_WORDS.has(t) && t.length > 2);
}

export function jaccardSimilarity(a: string, b: string): number {
  const tokA = new Set(tokenize(a));
  const tokB = new Set(tokenize(b));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokA) if (tokB.has(t)) intersection += 1;
  const union = new Set([...tokA, ...tokB]).size;
  return intersection / union;
}

export function hasNegation(text: string): boolean {
  return NEGATION_PATTERN.test(text);
}

export function assessScopeOverlap(
  a: string | null,
  b: string | null,
): OverlapAssessment {
  if (a === null && b === null) return 'unknown';
  if (a === null || b === null) return 'non_overlapping';
  const sim = jaccardSimilarity(a, b);
  if (sim >= 0.7) return 'fully_overlapping';
  if (sim >= 0.3) return 'partially_overlapping';
  return 'non_overlapping';
}
