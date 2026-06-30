export type FetchOutcome = 'ok' | 'http_error' | 'network_error' | 'too_large';

export type SourceType =
  | 'primary'
  | 'secondary'
  | 'forum'
  | 'benchmark'
  | 'docs'
  | 'unknown';

export type Relevance = 'high' | 'medium' | 'low' | 'unknown';

export type ExtractorName = 'heuristic' | 'ollama-intern';

export interface ExtractionInput {
  url: string;
  finalUrl: string | null;
  rawText: string;
  contentType: string | null;
}

export type ExtractionResult =
  | {
      ok: true;
      publisher: string | null;
      published_at: string | null;
      title: string;
      source_type: SourceType;
      relevance: Relevance;
      key_points: string[];
      limitations: string[];
      asserts: string;
      scope: string | null;
      not: string | null;
    }
  | { ok: false; error: string };

export interface Extractor {
  readonly name: ExtractorName;
  available(): Promise<boolean>;
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}

export interface GatherOptions {
  sectionId: string;
  packPath?: string;
  urls?: string[];
  urlsFile?: string;
  preferExtractor?: ExtractorName;
  fetchImpl?: typeof fetch;
  extractors?: Extractor[];
  /** A-001/A-002/A-007 — forwarded to fetchOnce. */
  maxBytes?: number;
  timeoutMs?: number;
  unsafeAllowAllHosts?: boolean;
}

export interface GatherSummary {
  sectionId: string;
  attempted: number;
  fetchedOk: number;
  fetchedFailed: number;
  extractedOk: number;
  extractedFailed: number;
  cardsWritten: number;
  receiptsAppended: number;
  sourceIds: string[];
  /**
   * B-SOURCES-002 — malformed / non-http(s) URLs dropped by collectUrls'
   * validate step (e.g. blank-after-trim, ftp:, file:, unparseable). Additive
   * observability field so the CLI can surface what was silently discarded
   * from a --urls-file. Defaults to [] when nothing was rejected.
   */
  invalidUrls: string[];
}
