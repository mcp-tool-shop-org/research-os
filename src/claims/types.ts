import type { Excerpt } from '../sources/excerpts/schema.js';
import type { SourceCard, FetchReceipt } from '../sources/schema.js';

export type ClaimExtractor = 'heuristic' | 'ollama-intern';
export type Confidence = 'low' | 'medium' | 'high';
export type ReviewState =
  | 'candidate'
  | 'gated'
  | 'reviewed'
  | 'rejected'
  | 'accepted';

// A draft claim authored by an extractor. Per the span-first law, the extractor
// authors the interpretation layer (asserts/scope/not) and chooses excerpt IDs
// from the supplied ledger. It MUST NOT author evidence text — research-os
// fills evidence_excerpt from the ledger after validation.
export interface DraftClaim {
  asserts: string;
  scope: string | null;
  not: string | null;
  evidence_excerpt_ids: string[];
  evidence_location: string | null;
  confidence: Confidence;
}

export type ClaimExtractionResult =
  | { ok: true; claims: DraftClaim[]; method: string }
  | { ok: false; error: string };

export interface ClaimExtractionInput {
  sourceCard: SourceCard;
  sourceHash: string | null;
  // The deterministic excerpt ledger for this source. The extractor sees ONLY
  // these spans plus the source-card metadata — it does not see the raw text.
  excerpts: Excerpt[];
}

export interface ClaimExtractorAdapter {
  readonly name: ClaimExtractor;
  available(): Promise<boolean>;
  extract(input: ClaimExtractionInput): Promise<ClaimExtractionResult>;
}

export interface ExtractClaimsOptions {
  sectionId: string;
  packPath?: string;
  extractors?: ClaimExtractorAdapter[];
}

export interface ExtractClaimsFailure {
  source_id: string;
  reason: string;
}

// Six precise rejection categories replace the umbrella "hallucination" label.
// At extract time we can detect three of them mechanically; the other three
// (unsupported_claim, scope_widening, cross_source_contam) are reviewer concerns.
export interface ExtractClaimsSummary {
  sectionId: string;
  extractor: ClaimExtractor;
  extractionMethod: string;
  sourcesProcessed: number;
  sourcesSkipped: number;
  sourcesFailed: number;
  excerptLedgersBuilt: number;
  claimsAdded: number;
  claimsDeduped: number;
  // Aggregate of all "evidence couldn't be grounded" rejections — kept for
  // continuity with earlier summaries.
  claimsRejectedUngrounded: number;
  // Precise span-first rejection categories.
  claimsRejectedExcerptIdMissing: number;
  claimsRejectedExcerptIdMalformed: number;
  claimsRejectedScopeMissing: number;
  claimsRejectedExtractorParaphrase: number;
  claimIds: string[];
  failures: ExtractClaimsFailure[];
}

export interface SourceFetchPair {
  card: SourceCard;
  latestReceipt: FetchReceipt | null;
}
