export type RecordType =
  | 'section'
  | 'source'
  | 'claim'
  | 'contradiction'
  | 'review_finding'
  | 'claim_review'
  | 'gate_result'
  | 'fetch_receipt'
  | 'pack_audit'
  | 'audit_rollup';

export interface IndexBuildOptions {
  sectionId?: string;
  packPath?: string;
  all?: boolean;
}

/**
 * B-A-002 — structured warning emitted by the indexer when a single record
 * (one JSONL line / one source-card JSON file) or a single section fails to
 * parse or index. The build does not abort; healthy records and healthy
 * sections continue to be indexed.
 *
 * Kinds:
 *   - 'malformed_jsonl'        — one JSON.parse or Zod parse failure on a
 *                                JSONL line. `path` is pack-relative.
 *                                `line` is 1-based.
 *   - 'malformed_source_card'  — one source-card JSON file failed to
 *                                JSON.parse or Zod parse. `path` is
 *                                pack-relative.
 *   - 'section_index_failed'   — top-level exception during indexSection()
 *                                that escaped all the per-record catches
 *                                (e.g. SQL constraint violation, asynchronous
 *                                I/O error against the section directory).
 *                                `section_id` identifies the section that
 *                                failed.
 */
export interface IndexBuildWarning {
  kind: 'malformed_jsonl' | 'malformed_source_card' | 'section_index_failed';
  path?: string;
  section_id?: string;
  line?: number;
  reason: string;
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
  /**
   * B-A-002 — structured warnings from per-line / per-file / per-section
   * recovery. Optional in serialized form for backward compat with pre-B-A-002
   * consumers (F-53 pattern: `.optional().default([])` on Zod, plain optional
   * on TS); always present in-memory as an array (initialized to `[]`).
   */
  warnings: IndexBuildWarning[];
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
