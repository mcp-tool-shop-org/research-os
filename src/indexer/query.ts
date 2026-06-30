import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { PackNotFoundError, ResearchOSError } from '../errors.js';
import { openIndexDb, indexDbPath } from './db.js';
import type { IndexQueryOptions, IndexQuerySummary, QueryHit, RecordType } from './types.js';

// C1-012: IndexNotBuiltError now extends ResearchOSError so the CLI's
// reportError prints `<code>: <message>` + `  hint:` consistently. The
// command-text in the message names the registered subcommand
// `research-os index build --all` (previous string `research-os index --all`
// was a typo — there is no top-level `index` command, only `index build`).
// Closest existing code: PACK_NOT_FOUND broadens slightly to "pack
// derivative artifact (index DB) missing" — see closeout escalation note.
export class IndexNotBuiltError extends ResearchOSError {
  constructor(public readonly dbPath: string) {
    super(
      `No index found at ${dbPath}. Run \`research-os index build --all\` to build it before querying.`,
      'PACK_NOT_FOUND',
      `Run \`research-os index build --all --pack <dir>\` to populate the FTS5 index, then re-run your query. See handbook/recovery.md.`,
    );
    this.name = 'IndexNotBuiltError';
  }
}

// A-IDX-001: a lone '-' (and other "looks-like-FTS" punctuation) must NOT be
// treated as raw FTS5 syntax opt-in. Plain words containing a hyphen
// ('machine-learning', 'cost-benefit', 'peer-reviewed') were previously
// passed UNQUOTED into `facts_fts MATCH`, where FTS5 parses '-learning' as a
// column filter / NOT operator and raises a raw SqliteError
// ('no such column: learning'), bypassing the ResearchOSError contract and
// exiting 1. We now restrict the raw-passthrough to *unambiguous* FTS intent:
//   - a leading or wrapping double-quote (the user explicitly quoted a phrase)
//   - a trailing '*' for prefix search (e.g. 'transform*')
// Everything else is treated as a literal phrase and quoted (embedded
// double-quotes doubled, per FTS5 escaping). A trailing-'*' prefix term has
// its leading portion quoted so embedded hyphens stay literal.
function escapeFtsTerm(term: string): string {
  const trimmed = term.trim();
  if (!trimmed) return '""';
  // Already a quoted phrase (leading quote) → unambiguous FTS intent.
  if (trimmed.startsWith('"')) return trimmed;
  // Trailing '*' → prefix query. Quote the stem so embedded hyphens/spaces
  // stay literal, then re-attach the prefix operator.
  if (trimmed.endsWith('*')) {
    const stem = trimmed.slice(0, -1);
    return `"${stem.replace(/"/g, '""')}"*`;
  }
  // Default: treat the whole term as a literal phrase.
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
  } catch (e) {
    // A-IDX-001: a malformed FTS5 MATCH expression surfaces as a raw
    // SqliteError (e.g. "no such column: ...", "fts5: syntax error near ...").
    // Route it through the structured ResearchOSError contract so the CLI
    // prints `<code>: <message>` + hint and exits as a user error rather than
    // dumping a raw stack. escapeFtsTerm now quotes plain terms, so this only
    // fires for explicit/quoted FTS syntax the user got wrong.
    throw new ResearchOSError(
      `Index query failed for term ${JSON.stringify(options.term)}: ${(e as Error).message}`,
      'INDEX_QUERY_INVALID',
      `The search term was interpreted as an FTS5 expression and rejected. Quote the term to search it literally (e.g. '"${options.term.replace(/"/g, '\\"')}"'), or fix the FTS5 syntax. See handbook/recovery.md.`,
      e as Error,
    );
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
