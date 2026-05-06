import type { SourceCard, FetchReceipt } from '../sources/schema.js';

export type ClaimExtractor = 'heuristic' | 'ollama-intern';
export type Confidence = 'low' | 'medium' | 'high';
export type ReviewState =
  | 'candidate'
  | 'gated'
  | 'reviewed'
  | 'rejected'
  | 'accepted';

export interface DraftClaim {
  asserts: string;
  scope: string | null;
  not: string | null;
  evidence_excerpt: string;
  evidence_location: string | null;
  confidence: Confidence;
}

export type ClaimExtractionResult =
  | { ok: true; claims: DraftClaim[]; method: string }
  | { ok: false; error: string };

export interface ClaimExtractionInput {
  sourceCard: SourceCard;
  sourceHash: string | null;
  rawText: string | null;
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

export interface ExtractClaimsSummary {
  sectionId: string;
  extractor: ClaimExtractor;
  extractionMethod: string;
  sourcesProcessed: number;
  sourcesSkipped: number;
  sourcesFailed: number;
  claimsAdded: number;
  claimsDeduped: number;
  claimsRejectedUngrounded: number;
  claimIds: string[];
  failures: ExtractClaimsFailure[];
}

export interface SourceFetchPair {
  card: SourceCard;
  latestReceipt: FetchReceipt | null;
}
