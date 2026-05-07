import type { Excerpt } from '../../sources/excerpts/schema.js';
import type {
  ClaimExtractionInput,
  ClaimExtractionResult,
  ClaimExtractorAdapter,
  DraftClaim,
} from '../types.js';

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').toLowerCase().trim();
}

// For a given key_point, find the ledger excerpt that best matches it.
// Preference order:
//   1. Exact substring of key_point inside excerpt
//   2. Exact substring of excerpt inside key_point
//   3. First excerpt whose origin is key_point and whose text equals key_point
//   4. null (no usable excerpt)
function findExcerptForKeyPoint(keyPoint: string, excerpts: Excerpt[]): Excerpt | null {
  const norm = normalize(keyPoint);
  if (norm.length === 0) return null;
  for (const e of excerpts) {
    if (normalize(e.text).includes(norm)) return e;
  }
  for (const e of excerpts) {
    if (norm.includes(normalize(e.text))) return e;
  }
  return null;
}

export class HeuristicClaimExtractor implements ClaimExtractorAdapter {
  readonly name = 'heuristic' as const;

  async available(): Promise<boolean> {
    return true;
  }

  async extract(input: ClaimExtractionInput): Promise<ClaimExtractionResult> {
    const card = input.sourceCard;
    const excerpts = input.excerpts;
    const keyPoints = card.key_points
      .map((kp) => kp.trim())
      .filter((kp) => kp.length > 0);

    const drafts: DraftClaim[] = [];
    if (keyPoints.length === 0) {
      // No key_points — fall back to source-card asserts paired with the
      // first available excerpt.
      const first = excerpts[0];
      if (first) {
        drafts.push({
          asserts: card.asserts,
          scope: null,
          not: null,
          evidence_excerpt_ids: [first.excerpt_id],
          evidence_location: first.location_hint,
          confidence: 'low',
        });
      }
    } else {
      let fallbackIdx = 0;
      for (const kp of keyPoints) {
        const matched = findExcerptForKeyPoint(kp, excerpts);
        const chosen = matched ?? excerpts[fallbackIdx % excerpts.length];
        if (!chosen) continue;
        if (!matched) fallbackIdx += 1;
        drafts.push({
          asserts: kp,
          scope: null,
          not: null,
          evidence_excerpt_ids: [chosen.excerpt_id],
          evidence_location: chosen.location_hint,
          confidence: 'low',
        });
      }
    }

    return { ok: true, claims: drafts, method: 'heuristic_key_point' };
  }
}
