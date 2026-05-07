import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { PackNotFoundError } from '../errors.js';
import { openIndexDb, indexDbPath } from './db.js';
import type { IndexQueryOptions, IndexQuerySummary, QueryHit, RecordType } from './types.js';

export class IndexNotBuiltError extends Error {
  constructor(public readonly dbPath: string) {
    super(
      `No index found at ${dbPath}. Run 'research-os index --all' to build it before querying.`,
    );
    this.name = 'IndexNotBuiltError';
  }
}

function escapeFtsTerm(term: string): string {
  // Quote each word and OR them together so common phrasing works.
  // For simplicity: wrap the entire term in quotes if it contains spaces,
  // otherwise pass through. FTS5 prefix queries supported via *.
  const trimmed = term.trim();
  if (!trimmed) return '""';
  // If user already provided FTS syntax characters, pass through. Otherwise quote.
  if (/[" *^()-]/.test(trimmed)) return trimmed;
  return `"${trimmed.replace(/"/g, '""')}"`;
}

export function query(options: IndexQueryOptions): IndexQuerySummary {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  const dbPath = indexDbPath(packPath);
  if (!existsSync(packPath)) throw new PackNotFoundError(packPath);
  if (!existsSync(dbPath)) throw new IndexNotBuiltError(dbPath);

  const db = openIndexDb({ packPath, readonly: true });
  const limit = options.limit ?? 25;
  const ftsTerm = escapeFtsTerm(options.term);

  let stmt;
  let rows: Array<{
    record_type: string;
    record_id: string;
    section_id: string | null;
    artifact_path: string;
    snippet: string;
    rank: number;
  }>;
  try {
    if (options.recordType) {
      stmt = db.prepare(
        `SELECT record_type, record_id, section_id, artifact_path,
                snippet(facts_fts, 4, '<mark>', '</mark>', '...', 30) AS snippet,
                rank
         FROM facts_fts
         WHERE facts_fts MATCH ?
           AND record_type = ?
         ORDER BY rank
         LIMIT ?`,
      );
      rows = stmt.all(ftsTerm, options.recordType, limit) as typeof rows;
    } else {
      stmt = db.prepare(
        `SELECT record_type, record_id, section_id, artifact_path,
                snippet(facts_fts, 4, '<mark>', '</mark>', '...', 30) AS snippet,
                rank
         FROM facts_fts
         WHERE facts_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      );
      rows = stmt.all(ftsTerm, limit) as typeof rows;
    }
  } finally {
    db.close();
  }

  const hits: QueryHit[] = rows.map((r) => ({
    record_type: r.record_type as RecordType,
    record_id: r.record_id,
    section_id: r.section_id,
    artifact_path: r.artifact_path,
    snippet: r.snippet,
    rank: r.rank,
  }));

  const grouped: Record<string, QueryHit[]> = {};
  for (const h of hits) {
    if (!grouped[h.record_type]) grouped[h.record_type] = [];
    grouped[h.record_type]!.push(h);
  }

  return {
    term: options.term,
    totalHits: hits.length,
    hits,
    groupedByType: grouped,
  };
}
