export const SCHEMA_VERSION = 1;

export const DDL_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS artifacts (
    artifact_id TEXT PRIMARY KEY,
    artifact_type TEXT NOT NULL,
    section_id TEXT,
    path TEXT NOT NULL,
    sha256 TEXT,
    bytes INTEGER,
    indexed_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS sections (
    section_id TEXT PRIMARY KEY,
    purpose TEXT,
    status TEXT,
    max_time_minutes INTEGER,
    min_sources INTEGER,
    primary_sources_required INTEGER,
    contradictions_required INTEGER,
    indexed_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS sources (
    source_id TEXT PRIMARY KEY,
    section_id TEXT,
    url TEXT,
    publisher TEXT,
    source_type TEXT,
    relevance TEXT,
    asserts TEXT,
    scope TEXT,
    not_field TEXT,
    fetched_at TEXT,
    published_at TEXT,
    artifact_path TEXT NOT NULL,
    indexed_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS claims (
    claim_id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    source_ids_json TEXT NOT NULL,
    asserts TEXT NOT NULL,
    scope TEXT,
    not_field TEXT,
    evidence_excerpt TEXT NOT NULL,
    confidence TEXT,
    extractor TEXT,
    extraction_method TEXT,
    review_state TEXT,
    artifact_path TEXT NOT NULL,
    indexed_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS contradictions (
    contradiction_id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    type TEXT,
    severity TEXT,
    status TEXT,
    overlap_assessment TEXT,
    claim_ids_json TEXT NOT NULL,
    source_ids_json TEXT NOT NULL,
    summary TEXT,
    detector TEXT,
    artifact_path TEXT NOT NULL,
    indexed_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS review_findings (
    finding_id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    category TEXT,
    severity TEXT,
    claim_ids_json TEXT NOT NULL,
    source_ids_json TEXT NOT NULL,
    summary TEXT,
    required_action TEXT,
    reviewer TEXT,
    artifact_path TEXT NOT NULL,
    indexed_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS claim_reviews (
    rowid_pk INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    decision TEXT,
    reason TEXT,
    reviewer TEXT,
    created_at TEXT,
    artifact_path TEXT NOT NULL,
    indexed_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS gate_results (
    section_id TEXT PRIMARY KEY,
    verdict TEXT,
    synthesis_eligible INTEGER,
    failures_json TEXT,
    warnings_json TEXT,
    blocking_reasons_json TEXT,
    waivers_json TEXT,
    next_actions_json TEXT,
    artifact_path TEXT NOT NULL,
    checked_at TEXT,
    indexed_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS fetch_receipts (
    receipt_id TEXT PRIMARY KEY,
    source_id TEXT,
    section_id TEXT,
    status INTEGER,
    fetch_outcome TEXT,
    content_type TEXT,
    sha256 TEXT,
    fetched_at TEXT,
    raw_text_path TEXT,
    artifact_path TEXT NOT NULL,
    indexed_at TEXT NOT NULL
  )`,

  `CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
    record_type UNINDEXED,
    record_id UNINDEXED,
    section_id UNINDEXED,
    artifact_path UNINDEXED,
    text,
    prefix='2 3 4'
  )`,

  `CREATE INDEX IF NOT EXISTS idx_sources_section ON sources(section_id)`,
  `CREATE INDEX IF NOT EXISTS idx_claims_section ON claims(section_id)`,
  `CREATE INDEX IF NOT EXISTS idx_contradictions_section ON contradictions(section_id)`,
  `CREATE INDEX IF NOT EXISTS idx_findings_section ON review_findings(section_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_claim ON claim_reviews(claim_id)`,
  `CREATE INDEX IF NOT EXISTS idx_receipts_source ON fetch_receipts(source_id)`,
];

export function applySchema(db: import('better-sqlite3').Database): void {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const ddl of DDL_STATEMENTS) {
    db.exec(ddl);
  }
  const setMeta = db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)');
  setMeta.run('schema_version', String(SCHEMA_VERSION));
}
