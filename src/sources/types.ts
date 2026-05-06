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
}
