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

export interface DiscoverOptions {
  sectionId: string;
  packPath?: string;
  query: string;
  targetCount?: number;
  // Optional providers (defaults to the LLM-heuristic provider).
  providers?: DiscoverProvider[];
  now?: () => Date;
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
