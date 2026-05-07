export { build } from './build.js';
export { query, IndexNotBuiltError } from './query.js';
export { exportRepoKnowledge } from './export.js';
export { syncRepoKnowledge } from './sync.js';
export { openIndexDb, indexDbPath } from './db.js';
export { applySchema, SCHEMA_VERSION } from './schema.js';
export type {
  IndexBuildOptions,
  IndexBuildSummary,
  IndexQueryOptions,
  IndexQuerySummary,
  QueryHit,
  RecordType,
  ExportOptions,
  ExportSummary,
  SyncOptions,
  SyncSummary,
} from './types.js';
