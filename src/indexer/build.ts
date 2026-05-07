import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { parse as yamlParse } from 'yaml';
import type Database from 'better-sqlite3';

import { PackNotFoundError, SectionNotFoundError } from '../errors.js';
import { ResearchYamlSchema, type ResearchYaml } from '../intake/schema.js';
import { ClaimSchema, type Claim } from '../claims/schema.js';
import { ContradictionSchema, type Contradiction } from '../contradictions/schema.js';
import {
  FetchReceiptSchema,
  SourceCardSchema,
  type FetchReceipt,
  type SourceCard,
} from '../sources/schema.js';
import {
  SectionGateResultSchema,
  type SectionGateResult,
} from '../gates/schema.js';
import {
  ClaimReviewSchema,
  ReviewFindingSchema,
  type ClaimReview,
  type ReviewFinding,
} from '../review/schema.js';

import { openIndexDb, indexDbPath } from './db.js';
import type { IndexBuildOptions, IndexBuildSummary } from './types.js';

function relPath(packPath: string, abs: string): string {
  return relative(packPath, abs).split('\\').join('/');
}

async function tryReadJsonl<T>(
  packPath: string,
  rel: string,
  parse: (raw: unknown) => T,
): Promise<T[]> {
  const path = join(packPath, rel);
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const out: T[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    out.push(parse(JSON.parse(line)));
  }
  return out;
}

async function readSourceCards(packPath: string): Promise<SourceCard[]> {
  const dir = join(packPath, 'evidence', 'source-cards');
  if (!existsSync(dir)) return [];
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir);
  const cards: SourceCard[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const text = await readFile(join(dir, entry), 'utf8');
    cards.push(SourceCardSchema.parse(JSON.parse(text)));
  }
  return cards;
}

async function readGateResult(packPath: string, sectionId: string): Promise<SectionGateResult | null> {
  const path = join(packPath, 'audits', `${sectionId}-gate.json`);
  if (!existsSync(path)) return null;
  const text = await readFile(path, 'utf8');
  return SectionGateResultSchema.parse(JSON.parse(text));
}

interface FactRow {
  record_type: string;
  record_id: string;
  section_id: string | null;
  artifact_path: string;
  text: string;
}

function fileSha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function indexSection(args: {
  db: Database.Database;
  packPath: string;
  research: ResearchYaml;
  sectionId: string;
  now: string;
  counts: IndexBuildSummary;
}): Promise<void> {
  const { db, packPath, research, sectionId, now, counts } = args;

  const section = research.sections.find((s) => s.id === sectionId);
  if (!section) throw new SectionNotFoundError(sectionId);
  const sectionDir = join(packPath, 'sections', sectionId);
  if (!existsSync(sectionDir)) throw new SectionNotFoundError(sectionId);

  // Clear all existing rows for this section so re-index is clean
  db.prepare('DELETE FROM sources WHERE section_id = ?').run(sectionId);
  db.prepare('DELETE FROM claims WHERE section_id = ?').run(sectionId);
  db.prepare('DELETE FROM contradictions WHERE section_id = ?').run(sectionId);
  db.prepare('DELETE FROM review_findings WHERE section_id = ?').run(sectionId);
  db.prepare('DELETE FROM claim_reviews WHERE section_id = ?').run(sectionId);
  db.prepare('DELETE FROM gate_results WHERE section_id = ?').run(sectionId);
  db.prepare('DELETE FROM fetch_receipts WHERE section_id = ?').run(sectionId);
  db.prepare('DELETE FROM artifacts WHERE section_id = ?').run(sectionId);
  db.prepare('DELETE FROM facts_fts WHERE section_id = ?').run(sectionId);

  // Section row
  db.prepare(
    `INSERT OR REPLACE INTO sections(section_id, purpose, status, max_time_minutes,
       min_sources, primary_sources_required, contradictions_required, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    section.id,
    section.purpose,
    section.status,
    section.max_time_minutes,
    section.min_sources,
    section.primary_sources_required,
    section.contradictions_required ? 1 : 0,
    now,
  );

  const insertArtifact = db.prepare(
    `INSERT OR REPLACE INTO artifacts(artifact_id, artifact_type, section_id, path, sha256, bytes, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertFts = db.prepare(
    `INSERT INTO facts_fts(record_type, record_id, section_id, artifact_path, text)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const recordArtifact = (artifactType: string, rel: string, content: string | null): void => {
    const sha = content === null ? null : fileSha256(content);
    insertArtifact.run(`${sectionId}:${artifactType}`, artifactType, sectionId, rel, sha, content === null ? null : Buffer.byteLength(content, 'utf8'), now);
    counts.artifacts += 1;
  };

  // Sources (cards) — only those tagged for this section
  const allCards = await readSourceCards(packPath);
  const sectionSourceIds = new Set<string>();
  const sourcesJsonlPath = join(sectionDir, 'sources.jsonl');
  if (existsSync(sourcesJsonlPath)) {
    const text = await readFile(sourcesJsonlPath, 'utf8');
    recordArtifact('sources_jsonl', relPath(packPath, sourcesJsonlPath), text);
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line) as { source_id?: string };
      if (typeof entry.source_id === 'string') sectionSourceIds.add(entry.source_id);
    }
  }
  for (const card of allCards) {
    if (!sectionSourceIds.has(card.source_id) && card.section_id !== sectionId) continue;
    const cardPath = relPath(packPath, join(packPath, 'evidence', 'source-cards', `${card.source_id}.json`));
    db.prepare(
      `INSERT OR REPLACE INTO sources(
        source_id, section_id, url, publisher, source_type, relevance,
        asserts, scope, not_field, fetched_at, published_at, artifact_path, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      card.source_id,
      sectionId,
      card.url,
      card.publisher,
      card.source_type,
      card.relevance,
      card.asserts,
      card.scope,
      card.not,
      card.fetched_at,
      card.published_at,
      cardPath,
      now,
    );
    counts.sources += 1;
    const text = `${card.title}\n${card.asserts}\n${card.scope ?? ''}\n${card.not ?? ''}\n${card.key_points.join('\n')}`;
    insertFts.run('source', card.source_id, sectionId, cardPath, text);
  }

  // Claims
  const claims = await tryReadJsonl<Claim>(
    packPath,
    `sections/${sectionId}/claims.jsonl`,
    (r) => ClaimSchema.parse(r),
  );
  const claimsArtifact = relPath(packPath, join(sectionDir, 'claims.jsonl'));
  if (existsSync(join(sectionDir, 'claims.jsonl'))) {
    const text = await readFile(join(sectionDir, 'claims.jsonl'), 'utf8');
    recordArtifact('claims_jsonl', claimsArtifact, text);
  }
  for (const claim of claims) {
    db.prepare(
      `INSERT OR REPLACE INTO claims(
        claim_id, section_id, source_ids_json, asserts, scope, not_field,
        evidence_excerpt, confidence, extractor, extraction_method, review_state,
        artifact_path, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      claim.claim_id,
      sectionId,
      JSON.stringify(claim.source_ids),
      claim.asserts,
      claim.scope,
      claim.not,
      claim.evidence_excerpt,
      claim.confidence,
      claim.extractor,
      claim.extraction_method,
      claim.review_state,
      claimsArtifact,
      now,
    );
    counts.claims += 1;
    const ftsText = `${claim.asserts}\n${claim.scope ?? ''}\n${claim.not ?? ''}\n${claim.evidence_excerpt}`;
    insertFts.run('claim', claim.claim_id, sectionId, claimsArtifact, ftsText);
  }

  // Contradictions
  const contradictions = await tryReadJsonl<Contradiction>(
    packPath,
    `sections/${sectionId}/contradictions.jsonl`,
    (r) => ContradictionSchema.parse(r),
  );
  const contradictionsArtifact = relPath(packPath, join(sectionDir, 'contradictions.jsonl'));
  if (existsSync(join(sectionDir, 'contradictions.jsonl'))) {
    const text = await readFile(join(sectionDir, 'contradictions.jsonl'), 'utf8');
    recordArtifact('contradictions_jsonl', contradictionsArtifact, text);
  }
  for (const c of contradictions) {
    db.prepare(
      `INSERT OR REPLACE INTO contradictions(
        contradiction_id, section_id, type, severity, status, overlap_assessment,
        claim_ids_json, source_ids_json, summary, detector, artifact_path, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      c.contradiction_id,
      sectionId,
      c.type,
      c.severity,
      c.status,
      c.overlap_assessment,
      JSON.stringify(c.claim_ids),
      JSON.stringify(c.source_ids),
      c.summary,
      c.detector,
      contradictionsArtifact,
      now,
    );
    counts.contradictions += 1;
    const ftsText = `${c.summary}\n${c.scope_analysis}\n${c.evidence}\n${c.type}\n${c.severity}`;
    insertFts.run('contradiction', c.contradiction_id, sectionId, contradictionsArtifact, ftsText);
  }

  // Review findings
  const findings = await tryReadJsonl<ReviewFinding>(
    packPath,
    `audits/${sectionId}-findings.jsonl`,
    (r) => ReviewFindingSchema.parse(r),
  );
  const findingsArtifact = relPath(packPath, join(packPath, 'audits', `${sectionId}-findings.jsonl`));
  const findingsAbs = join(packPath, 'audits', `${sectionId}-findings.jsonl`);
  if (existsSync(findingsAbs)) {
    const text = await readFile(findingsAbs, 'utf8');
    recordArtifact('findings_jsonl', findingsArtifact, text);
  }
  // Dedup findings by ID since the ledger is append-only — keep the latest occurrence
  const findingById = new Map<string, ReviewFinding>();
  for (const f of findings) findingById.set(f.finding_id, f);
  for (const f of findingById.values()) {
    db.prepare(
      `INSERT OR REPLACE INTO review_findings(
        finding_id, section_id, category, severity, claim_ids_json, source_ids_json,
        summary, required_action, reviewer, artifact_path, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      f.finding_id,
      sectionId,
      f.category,
      f.severity,
      JSON.stringify(f.claim_ids),
      JSON.stringify(f.source_ids),
      f.summary,
      f.required_action,
      f.reviewer,
      findingsArtifact,
      now,
    );
    counts.reviewFindings += 1;
    const ftsText = `${f.category}\n${f.severity}\n${f.summary}\n${f.required_action}\n${f.evidence}`;
    insertFts.run('review_finding', f.finding_id, sectionId, findingsArtifact, ftsText);
  }

  // Claim reviews (append-only ledger — every entry is preserved)
  const reviews = await tryReadJsonl<ClaimReview>(
    packPath,
    `sections/${sectionId}/claim-reviews.jsonl`,
    (r) => ClaimReviewSchema.parse(r),
  );
  const reviewsArtifact = relPath(packPath, join(sectionDir, 'claim-reviews.jsonl'));
  const reviewsAbs = join(sectionDir, 'claim-reviews.jsonl');
  if (existsSync(reviewsAbs)) {
    const text = await readFile(reviewsAbs, 'utf8');
    recordArtifact('claim_reviews_jsonl', reviewsArtifact, text);
  }
  for (const r of reviews) {
    db.prepare(
      `INSERT INTO claim_reviews(
        claim_id, section_id, decision, reason, reviewer, created_at, artifact_path, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      r.claim_id,
      sectionId,
      r.decision,
      r.reason,
      r.reviewer,
      r.created_at,
      reviewsArtifact,
      now,
    );
    counts.claimReviews += 1;
    const ftsText = `${r.decision}\n${r.reason}`;
    insertFts.run('claim_review', `${r.claim_id}@${r.created_at}`, sectionId, reviewsArtifact, ftsText);
  }

  // Gate result
  const gate = await readGateResult(packPath, sectionId);
  if (gate) {
    const gateArtifact = relPath(packPath, join(packPath, 'audits', `${sectionId}-gate.json`));
    const gateText = await readFile(join(packPath, 'audits', `${sectionId}-gate.json`), 'utf8');
    recordArtifact('gate_json', gateArtifact, gateText);
    db.prepare(
      `INSERT OR REPLACE INTO gate_results(
        section_id, verdict, synthesis_eligible,
        failures_json, warnings_json, blocking_reasons_json, waivers_json, next_actions_json,
        artifact_path, checked_at, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      gate.section_id,
      gate.verdict,
      gate.synthesis_eligible ? 1 : 0,
      JSON.stringify(gate.failures),
      JSON.stringify(gate.warnings),
      JSON.stringify(gate.blocking_reasons),
      JSON.stringify(gate.waivers_applied),
      JSON.stringify(gate.next_actions),
      gateArtifact,
      gate.checked_at,
      now,
    );
    counts.gateResults += 1;
    const ftsText = `${gate.verdict}\n${gate.summary}\n${gate.blocking_reasons.join('\n')}\n${gate.next_actions.join('\n')}`;
    insertFts.run('gate_result', sectionId, sectionId, gateArtifact, ftsText);
  }

  // Fetch receipts (filtered to this section by section_id field)
  const allReceipts = await tryReadJsonl<FetchReceipt>(
    packPath,
    'evidence/fetch-log.jsonl',
    (r) => FetchReceiptSchema.parse(r),
  );
  const fetchLogAbs = join(packPath, 'evidence', 'fetch-log.jsonl');
  if (existsSync(fetchLogAbs)) {
    const text = await readFile(fetchLogAbs, 'utf8');
    recordArtifact('fetch_log_jsonl', relPath(packPath, fetchLogAbs), text);
  }
  for (const receipt of allReceipts.filter((r) => r.section_id === sectionId)) {
    db.prepare(
      `INSERT OR REPLACE INTO fetch_receipts(
        receipt_id, source_id, section_id, status, fetch_outcome, content_type,
        sha256, fetched_at, raw_text_path, artifact_path, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      receipt.receipt_id,
      receipt.source_id,
      receipt.section_id,
      receipt.status,
      receipt.fetch_outcome,
      receipt.content_type,
      receipt.sha256,
      receipt.fetched_at,
      receipt.raw_text_path,
      relPath(packPath, fetchLogAbs),
      now,
    );
    counts.fetchReceipts += 1;
    const ftsText = `${receipt.fetch_outcome} ${receipt.requested_url} ${receipt.title ?? ''} ${receipt.fetch_error ?? ''}`;
    insertFts.run('fetch_receipt', receipt.receipt_id, sectionId, relPath(packPath, fetchLogAbs), ftsText);
  }
}

export async function build(options: IndexBuildOptions): Promise<IndexBuildSummary> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  if (!existsSync(join(packPath, 'research.yaml'))) throw new PackNotFoundError(packPath);
  const research = ResearchYamlSchema.parse(yamlParse(await readFile(join(packPath, 'research.yaml'), 'utf8')));

  const targets: string[] = options.sectionId
    ? [options.sectionId]
    : options.all
      ? research.sections.map((s) => s.id)
      : research.sections.map((s) => s.id);

  if (targets.length === 0) {
    throw new Error('No sections to index. Add at least one section to the pack.');
  }

  const db = openIndexDb({ packPath });
  const now = new Date().toISOString();
  const counts: IndexBuildSummary = {
    packPath,
    dbPath: indexDbPath(packPath),
    sectionsIndexed: 0,
    sources: 0,
    claims: 0,
    contradictions: 0,
    reviewFindings: 0,
    claimReviews: 0,
    gateResults: 0,
    fetchReceipts: 0,
    artifacts: 0,
  };

  try {
    for (const sid of targets) {
      await indexSection({ db, packPath, research, sectionId: sid, now, counts });
      counts.sectionsIndexed += 1;
    }
  } finally {
    db.close();
  }

  return counts;
}
