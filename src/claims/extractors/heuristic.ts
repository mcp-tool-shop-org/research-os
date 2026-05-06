import type {
  ClaimExtractionInput,
  ClaimExtractionResult,
  ClaimExtractorAdapter,
  DraftClaim,
} from '../types.js';

export class HeuristicClaimExtractor implements ClaimExtractorAdapter {
  readonly name = 'heuristic' as const;

  async available(): Promise<boolean> {
    return true;
  }

  async extract(input: ClaimExtractionInput): Promise<ClaimExtractionResult> {
    const card = input.sourceCard;
    const keyPoints = card.key_points
      .map((kp) => kp.trim())
      .filter((kp) => kp.length > 0);

    let drafts: DraftClaim[];
    if (keyPoints.length === 0) {
      drafts = [
        {
          asserts: card.asserts,
          scope: null,
          not: null,
          evidence_excerpt: card.asserts,
          evidence_location: null,
          confidence: 'low',
        },
      ];
    } else {
      drafts = keyPoints.map((kp) => ({
        asserts: kp,
        scope: null,
        not: null,
        evidence_excerpt: kp,
        evidence_location: null,
        confidence: 'low',
      }));
    }

    return { ok: true, claims: drafts, method: 'heuristic_key_point' };
  }
}
