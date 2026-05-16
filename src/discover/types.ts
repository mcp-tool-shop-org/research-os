import type { DiscoveryCandidate, SourceTypeGuess } from './schema.js';

export interface DiscoverProposal {
  url: string;
  title: string;
  publisher: string | null;
  source_type_guess: SourceTypeGuess;
  why_relevant: string;
  rank: number;
}

export type DiscoverProviderResult =
  | { ok: true; proposals: DiscoverProposal[]; method: string }
  | { ok: false; error: string };

export interface DiscoverProviderInput {
  sectionId: string;
  query: string;
  sectionPurpose: string;
  // Soft target: provider should aim for this many proposals. Provider is
  // free to return fewer if it can't propose with confidence.
  targetCount: number;
}

export interface DiscoverProvider {
  readonly name: string;
  available(): Promise<boolean>;
  propose(input: DiscoverProviderInput): Promise<DiscoverProviderResult>;
}

/**
 * v0.11 Slice 2 — R-008 admission-layer relevance check options.
 *
 * Opt-in at the library level (omitting `relevanceCheck` from DiscoverOptions
 * leaves all candidates with `relevance: null` — preserves the v0.10 test
 * surface and the 1358-test baseline). The CLI enables it by default in the
 * production path.
 *
 * `fetchImpl` is injectable so tests deterministically exercise the v0.2
 * regression replay without hitting the network.
 */
export interface RelevanceCheckOptions {
  enabled: boolean;
  fetchImpl: typeof fetch;
  /** Default DEFAULT_RELEVANCE_THRESHOLD (0.2) when omitted. */
  threshold?: number;
  /** Default DEFAULT_RELEVANCE_FETCH_TIMEOUT_MS (5000) per URL. */
  fetchTimeoutMs?: number;
  /** Default DEFAULT_RELEVANCE_FETCH_CONCURRENCY (4) parallel title fetches. */
  concurrency?: number;
}

export interface DiscoverOptions {
  sectionId: string;
  packPath?: string;
  query: string;
  targetCount?: number;
  // Optional providers (defaults to the LLM-heuristic provider).
  providers?: DiscoverProvider[];
  now?: () => Date;
  /** R-008: discover-time URL relevance check. Omit for back-compat. */
  relevanceCheck?: RelevanceCheckOptions;
}

export interface RelevanceTotals {
  verified: number;
  unverified: number;
  topic_mismatch: number;
}

export interface DiscoverResult {
  candidatesAdded: number;
  candidatesProposed: number;
  candidatesRejectedInvalidUrl: number;
  warnings: string[];
  candidates: DiscoveryCandidate[];
  candidatesPath: string;
  reportPath: string;
  summaryPath: string;
  /** R-008 relevance assessment counts across the new candidates. All zeros
   * when relevanceCheck was disabled or omitted. */
  relevanceTotals: RelevanceTotals;
}

export interface ApproveOptions {
  sectionId: string;
  packPath?: string;
  candidateIds?: string[];
  topN?: number;
  reason?: string;
  now?: () => Date;
}

export interface RejectOptions {
  sectionId: string;
  packPath?: string;
  candidateIds: string[];
  reason: string;
  now?: () => Date;
}

export interface ExportUrlsOptions {
  sectionId: string;
  packPath?: string;
}

export interface ApproveResult {
  approved: number;
  approvedIds: string[];
  exportPath: string;
}
export interface RejectResult {
  rejected: number;
  rejectedIds: string[];
}
export interface ExportUrlsResult {
  exportPath: string;
  approvedCount: number;
}
