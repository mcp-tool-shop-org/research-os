import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { PackNotFoundError } from '../errors.js';
import { openIndexDb, indexDbPath } from './db.js';
import { IndexNotBuiltError } from './query.js';
import type { ExportOptions, ExportSummary } from './types.js';

interface FactRow {
  fact_type: string;
  id: string;
  section_id: string | null;
  text: string;
  artifact_path: string;
  metadata: Record<string, unknown>;
  pack_origin: string;
  exported_at: string;
}

export async function exportRepoKnowledge(options: ExportOptions): Promise<ExportSummary> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  if (!existsSync(packPath)) throw new PackNotFoundError(packPath);
  const dbPath = indexDbPath(packPath);
  if (!existsSync(dbPath)) throw new IndexNotBuiltError(dbPath);

  const outPath = options.outPath
    ? resolve(options.outPath)
    : join(packPath, 'evidence', 'repo-knowledge', 'research-os-facts.jsonl');
  await mkdir(dirname(outPath), { recursive: true });

  const db = openIndexDb({ packPath, readonly: true });
  const now = new Date().toISOString();
  const facts: FactRow[] = [];
  const byType: Record<string, number> = {};
  const incr = (t: string): void => {
    byType[t] = (byType[t] ?? 0) + 1;
  };

  try {
    const sources = db
      .prepare(`SELECT * FROM sources`)
      .all() as Array<Record<string, unknown>>;
    for (const r of sources) {
      facts.push({
        fact_type: 'research_os.source',
        id: String(r.source_id),
        section_id: r.section_id as string | null,
        text: [r.asserts, r.scope, r.not_field].filter(Boolean).join(' '),
        artifact_path: String(r.artifact_path),
        metadata: {
          url: r.url,
          publisher: r.publisher,
          source_type: r.source_type,
          relevance: r.relevance,
          fetched_at: r.fetched_at,
          published_at: r.published_at,
        },
        pack_origin: packPath,
        exported_at: now,
      });
      incr('research_os.source');
    }

    const claims = db
      .prepare(`SELECT * FROM claims`)
      .all() as Array<Record<string, unknown>>;
    for (const r of claims) {
      facts.push({
        fact_type: 'research_os.claim',
        id: String(r.claim_id),
        section_id: r.section_id as string,
        text: [r.asserts, r.scope, r.not_field, r.evidence_excerpt].filter(Boolean).join(' '),
        artifact_path: String(r.artifact_path),
        metadata: {
          source_ids: JSON.parse(String(r.source_ids_json)),
          confidence: r.confidence,
          extractor: r.extractor,
          extraction_method: r.extraction_method,
          review_state: r.review_state,
        },
        pack_origin: packPath,
        exported_at: now,
      });
      incr('research_os.claim');
    }

    const contradictions = db
      .prepare(`SELECT * FROM contradictions`)
      .all() as Array<Record<string, unknown>>;
    for (const r of contradictions) {
      facts.push({
        fact_type: 'research_os.contradiction',
        id: String(r.contradiction_id),
        section_id: r.section_id as string,
        text: String(r.summary ?? ''),
        artifact_path: String(r.artifact_path),
        metadata: {
          type: r.type,
          severity: r.severity,
          status: r.status,
          overlap_assessment: r.overlap_assessment,
          claim_ids: JSON.parse(String(r.claim_ids_json)),
          source_ids: JSON.parse(String(r.source_ids_json)),
          detector: r.detector,
        },
        pack_origin: packPath,
        exported_at: now,
      });
      incr('research_os.contradiction');
    }

    const findings = db
      .prepare(`SELECT * FROM review_findings`)
      .all() as Array<Record<string, unknown>>;
    for (const r of findings) {
      facts.push({
        fact_type: 'research_os.review_finding',
        id: String(r.finding_id),
        section_id: r.section_id as string,
        text: [r.summary, r.required_action].filter(Boolean).join(' '),
        artifact_path: String(r.artifact_path),
        metadata: {
          category: r.category,
          severity: r.severity,
          claim_ids: JSON.parse(String(r.claim_ids_json)),
          source_ids: JSON.parse(String(r.source_ids_json)),
          reviewer: r.reviewer,
        },
        pack_origin: packPath,
        exported_at: now,
      });
      incr('research_os.review_finding');
    }

    const gates = db
      .prepare(`SELECT * FROM gate_results`)
      .all() as Array<Record<string, unknown>>;
    for (const r of gates) {
      facts.push({
        fact_type: 'research_os.gate_result',
        id: String(r.section_id),
        section_id: r.section_id as string,
        text: `${r.verdict} ${(JSON.parse(String(r.blocking_reasons_json)) as string[]).join(' ')}`,
        artifact_path: String(r.artifact_path),
        metadata: {
          verdict: r.verdict,
          synthesis_eligible: r.synthesis_eligible === 1,
          checked_at: r.checked_at,
          blocking_reasons: JSON.parse(String(r.blocking_reasons_json)),
          waivers: JSON.parse(String(r.waivers_json)),
          next_actions: JSON.parse(String(r.next_actions_json)),
        },
        pack_origin: packPath,
        exported_at: now,
      });
      incr('research_os.gate_result');
    }
  } finally {
    db.close();
  }

  const text = facts.map((f) => JSON.stringify(f)).join('\n') + (facts.length > 0 ? '\n' : '');
  await writeFile(outPath, text, 'utf8');

  return {
    outPath,
    factCount: facts.length,
    byType,
  };
}
