export type RecordType =
  | 'section'
  | 'source'
  | 'claim'
  | 'contradiction'
  | 'review_finding'
  | 'claim_review'
  | 'gate_result'
  | 'fetch_receipt';

export interface IndexBuildOptions {
  sectionId?: string;
  packPath?: string;
  all?: boolean;
}

export interface IndexBuildSummary {
  packPath: string;
  dbPath: string;
  sectionsIndexed: number;
  sources: number;
  claims: number;
  contradictions: number;
  reviewFindings: number;
  claimReviews: number;
  gateResults: number;
  fetchReceipts: number;
  artifacts: number;
}

export interface IndexQueryOptions {
  packPath?: string;
  term: string;
  limit?: number;
  recordType?: RecordType;
}

export interface QueryHit {
  record_type: RecordType;
  record_id: string;
  section_id: string | null;
  artifact_path: string;
  snippet: string;
  rank: number;
}

export interface IndexQuerySummary {
  term: string;
  totalHits: number;
  hits: QueryHit[];
  groupedByType: Record<string, QueryHit[]>;
}

export interface ExportOptions {
  packPath?: string;
  outPath?: string;
}

export interface ExportSummary {
  outPath: string;
  factCount: number;
  byType: Record<string, number>;
}

export interface SyncOptions {
  packPath?: string;
}

export interface SyncSummary {
  attempted: boolean;
  ok: boolean;
  reason: string;
  factsSynced: number;
}
