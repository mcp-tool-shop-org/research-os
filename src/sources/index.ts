export { gather } from './gather.js';
export { fetchOnce, makeSourceId, makeReceiptId } from './fetch.js';
export {
  parseUrlsFileText,
  readUrlsFile,
  dedupeAndValidate,
  collectUrls,
} from './url-input.js';
export {
  HeuristicExtractor,
  OllamaInternExtractor,
  defaultExtractors,
  pickExtractor,
} from './extractors/index.js';
export { normalizeOllamaHost } from './extractors/ollama-intern.js';
export { buildCard, writeSourceCard, appendFetchLog, appendSectionSourceId } from './cards.js';
export {
  FetchReceiptSchema,
  SourceCardSchema,
  SourceTypeSchema,
  RelevanceSchema,
  ExtractorNameSchema,
  type FetchReceipt,
  type SourceCard,
} from './schema.js';
export type {
  Extractor,
  ExtractionInput,
  ExtractionResult,
  ExtractorName,
  GatherOptions,
  GatherSummary,
  SourceType,
  Relevance,
} from './types.js';
export {
  EXCERPT_ID_PATTERN,
  ExcerptSchema,
  ExcerptOriginSchema,
  chunkRawText,
  chunkKeyPoints,
  loadOrBuildLedger,
  ledgerPathFor,
  renderLedgerForPrompt,
  buildExcerptIndex,
  type Excerpt,
  type ExcerptOrigin,
  type ExcerptDraft,
  type LoadOrBuildArgs,
  type LoadOrBuildResult,
} from './excerpts/index.js';
