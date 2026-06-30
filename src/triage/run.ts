import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { PackNotFoundError, SectionNotFoundError } from '../errors.js';
import { RESEARCH_OS_VERSION } from '../index.js';
import { ClaimSchema, type Claim } from '../claims/schema.js';
import {
  ClaimTriageSchema,
  TriageSummarySchema,
  type ClaimTriage,
  type TriageDecision,
  type TriageSummary,
} from './schema.js';
import type { TriageOptions, TriageRunResult } from './types.js';

const DEFAULT_PER_SOURCE_CAP = 10;
const DEFAULT_MIN_ASSERT_CHARS = 30;


function normaliseAssert(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Quality score in [0..1] — purely deterministic from claim fields. Higher
// is better; ranking is stable.
function qualityScore(claim: Claim): number {
  let score = 0;
  // scope present is the single largest signal (extractor met the law).
  if (claim.scope && claim.scope.length > 0) score += 0.4;
  if (claim.not && claim.not.length > 0) score += 0.2;
  if (claim.confidence === 'high') score += 0.2;
  else if (claim.confidence === 'medium') score += 0.1;
  // Goldilocks asserts length: 60..240 chars rewarded most.
  const len = claim.asserts.length;
  if (len >= 60 && len <= 240) score += 0.15;
  else if (len >= 30 && len < 60) score += 0.05;
  // Multi-excerpt grounding rewards a tiny bit (model crossed spans).
  if (claim.evidence_excerpt_ids.length > 1) score += 0.05;
  return Math.min(1, Math.max(0, score));
}

function makeTriageId(claimId: string): string {
  // 12 hex chars derived from claim_id so re-runs over identical claim
  // produce identical triage_ids — keeps the ledger idempotent.
  return 'tri_' + createHash('sha256').update(claimId).digest('hex').slice(0, 12);
}

// B-TRIAGE-001: mirror the gate run's skip-with-warning collector (B-C-005).
// A malformed claims.jsonl line is skipped (as before) but now recorded as a
// {path, line, reason} warning so the dropped line surfaces on TriageSummary
// instead of vanishing silently and undercounting candidate_claims.
type MalformedWarning = { path: string; line: number; reason: string };

async function readClaims(
  packPath: string,
  sectionId: string,
  warnings: MalformedWarning[],
): Promise<Claim[]> {
  const rel = `sections/${sectionId}/claims.jsonl`;
  const path = join(packPath, rel);
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const out: Claim[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    try {
      out.push(ClaimSchema.parse(JSON.parse(line)));
    } catch (err) {
      warnings.push({
        path: rel,
        // 1-based line number for operator readability
        line: i + 1,
        reason: err instanceof Error ? err.message : 'parse error',
      });
    }
  }
  return out;
}

interface TriageWorkRow {
  claim: Claim;
  decision: TriageDecision;
  reason: string;
  quality: number;
  rank: number | null;
}

export async function triage(options: TriageOptions): Promise<TriageRunResult> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  if (!existsSync(join(packPath, 'research.yaml'))) throw new PackNotFoundError(packPath);
  if (!existsSync(join(packPath, 'sections', options.sectionId)))
    throw new SectionNotFoundError(options.sectionId);

  // A-CLI-001 seam guard: a 0/negative/non-integer cap would drive the Pass-3
  // parking loop to a negative start index and over-park every claim. Clamp to
  // the default — belt-and-suspenders for the CLI coercer's positive-int floor.
  const requestedCap = options.perSourceCap ?? DEFAULT_PER_SOURCE_CAP;
  const perSourceCap =
    Number.isInteger(requestedCap) && requestedCap > 0 ? requestedCap : DEFAULT_PER_SOURCE_CAP;
  const minAssertChars = options.minAssertChars ?? DEFAULT_MIN_ASSERT_CHARS;
  const stamp = (options.now ?? (() => new Date()))();
  const stampIso = stamp.toISOString();
  const stampMs = stamp.getTime();

  // B-TRIAGE-001: collect malformed claims.jsonl lines so they surface on the
  // summary instead of being silently dropped (mirrors gate B-C-005).
  const malformedWarnings: MalformedWarning[] = [];
  const claims = await readClaims(packPath, options.sectionId, malformedWarnings);

  // Pass 1 — apply per-claim filters in priority order. The first matching
  // filter wins; downstream filters skip any already-decided row.
  const rows: TriageWorkRow[] = claims.map((claim) => ({
    claim,
    decision: 'selected_for_review',
    reason: '',
    quality: qualityScore(claim),
    rank: null,
  }));

  // 1.1 parked_low_value — trivially short asserts (definitional / restating).
  for (const row of rows) {
    if (row.decision !== 'selected_for_review') continue;
    if (row.claim.asserts.length < minAssertChars) {
      row.decision = 'parked_low_value';
      row.reason = `Assert length ${row.claim.asserts.length} chars below the ${minAssertChars}-char floor; treated as definitional or restating.`;
    }
  }

  // 1.2 parked_weak_scope — both scope and not are null on a substantive
  // assertion. The reviewer can't even check overgeneralization without scope.
  for (const row of rows) {
    if (row.decision !== 'selected_for_review') continue;
    if (
      row.claim.scope === null &&
      row.claim.not === null &&
      row.claim.asserts.length > 40
    ) {
      row.decision = 'parked_weak_scope';
      row.reason =
        'Substantive assertion with scope=null and not=null. Without scope/not boundaries the claim cannot earn a synthesis slot.';
    }
  }

  // 1.3 needs_scope_repair — scope is missing but `not` is set, OR vice
  // versa. The asymmetric case is recoverable: re-extract or hand-correct.
  for (const row of rows) {
    if (row.decision !== 'selected_for_review') continue;
    if (
      (row.claim.scope === null && row.claim.not !== null) ||
      (row.claim.scope !== null && row.claim.not === null && row.claim.asserts.length > 80)
    ) {
      row.decision = 'needs_scope_repair';
      row.reason = 'Scope or not is missing on a substantive claim; recoverable with a scope-repair pass.';
    }
  }

  // Pass 2 — dedupe by normalised asserts. Keep the highest-quality claim
  // in each cluster; park the rest as parked_duplicate. Only run on rows
  // still at selected_for_review.
  const clusters = new Map<string, TriageWorkRow[]>();
  for (const row of rows) {
    if (row.decision !== 'selected_for_review') continue;
    const key = normaliseAssert(row.claim.asserts);
    if (!key) continue;
    const arr = clusters.get(key) ?? [];
    arr.push(row);
    clusters.set(key, arr);
  }
  let duplicateClustersCollapsed = 0;
  for (const [, members] of clusters) {
    if (members.length <= 1) continue;
    duplicateClustersCollapsed += 1;
    // Sort by quality desc, then claim_id asc for determinism.
    members.sort((a, b) => {
      if (b.quality !== a.quality) return b.quality - a.quality;
      return a.claim.claim_id.localeCompare(b.claim.claim_id);
    });
    for (let i = 1; i < members.length; i += 1) {
      const r = members[i]!;
      r.decision = 'parked_duplicate';
      r.reason = `Normalised assertion matches ${members[0]!.claim.claim_id} which has higher quality (${members[0]!.quality.toFixed(2)} vs ${r.quality.toFixed(2)}).`;
    }
  }

  // Pass 3 — per-source cap. For each source with too many remaining
  // selected_for_review rows, keep the top perSourceCap by quality and park
  // the rest as parked_overdense_source.
  const stillSelectedBySrc = new Map<string, TriageWorkRow[]>();
  for (const row of rows) {
    if (row.decision !== 'selected_for_review') continue;
    for (const sid of row.claim.source_ids) {
      const arr = stillSelectedBySrc.get(sid) ?? [];
      arr.push(row);
      stillSelectedBySrc.set(sid, arr);
    }
  }
  // First pass: compute the global keep-set. A multi-source claim is kept if
  // ANY of its sources still has cap headroom for it — i.e. it ranks within the
  // top perSourceCap for at least one referenced source. We must decide keep
  // membership for ALL sources before parking anyone, otherwise a row parked on
  // the first over-dense source processed never gets the chance to be rescued by
  // a later under-cap source (A-TRIAGE-001).
  const keep = new Set<TriageWorkRow>();
  // Record, per row, the source + rank that PARKS it, so the reason string for a
  // genuinely-parked row matches the source it was over-dense in.
  const parkInfo = new Map<TriageWorkRow, { sid: string; count: number; rank: number }>();
  for (const [sid, list] of stillSelectedBySrc) {
    list.sort((a, b) => {
      if (b.quality !== a.quality) return b.quality - a.quality;
      return a.claim.claim_id.localeCompare(b.claim.claim_id);
    });
    list.forEach((r, i) => {
      if (i < perSourceCap) {
        keep.add(r);
      } else if (!parkInfo.has(r)) {
        parkInfo.set(r, { sid, count: list.length, rank: i + 1 });
      }
    });
  }
  // Second pass: park only the rows no source kept (no referenced source had
  // headroom for them).
  for (const [r, info] of parkInfo) {
    if (keep.has(r)) continue;
    if (r.decision !== 'selected_for_review') continue;
    r.decision = 'parked_overdense_source';
    r.reason = `Source ${info.sid} contributed ${info.count} candidates; cap is ${perSourceCap}. This claim's quality (${r.quality.toFixed(2)}) ranks ${info.rank} for the source.`;
  }

  // Pass 4 — assign ranks to surviving selected_for_review rows so review
  // can process in priority order.
  const surviving = rows.filter((r) => r.decision === 'selected_for_review');
  surviving.sort((a, b) => {
    if (b.quality !== a.quality) return b.quality - a.quality;
    return a.claim.claim_id.localeCompare(b.claim.claim_id);
  });
  surviving.forEach((r, i) => {
    r.rank = i + 1;
    if (!r.reason) r.reason = `Selected for review at rank ${r.rank} (quality ${r.quality.toFixed(2)}).`;
  });

  // Build triage records.
  const records: ClaimTriage[] = rows.map((r) =>
    ClaimTriageSchema.parse({
      triage_id: makeTriageId(r.claim.claim_id),
      claim_id: r.claim.claim_id,
      section_id: options.sectionId,
      decision: r.decision,
      reason: r.reason,
      rank: r.rank,
      quality_score: Number(r.quality.toFixed(4)),
      triage_method: 'research_os_triage_v1',
      created_at: stampIso,
    }),
  );

  // Per-source counts for the summary.
  const perSourceTotal = new Map<string, number>();
  const perSourceSelected = new Map<string, number>();
  for (const r of rows) {
    for (const sid of r.claim.source_ids) {
      perSourceTotal.set(sid, (perSourceTotal.get(sid) ?? 0) + 1);
      if (r.decision === 'selected_for_review') {
        perSourceSelected.set(sid, (perSourceSelected.get(sid) ?? 0) + 1);
      }
    }
  }
  const decisions: Record<string, number> = {};
  for (const r of rows) {
    decisions[r.decision] = (decisions[r.decision] ?? 0) + 1;
  }

  const summary: TriageSummary = TriageSummarySchema.parse({
    summary_id: `tris_${stampMs}_${options.sectionId}`,
    section_id: options.sectionId,
    triaged_at: stampIso,
    research_os_version: RESEARCH_OS_VERSION,
    triage_method: 'research_os_triage_v1',
    candidate_claims: claims.length,
    decisions,
    per_source_cap: perSourceCap,
    duplicate_clusters_collapsed: duplicateClustersCollapsed,
    selected_count: surviving.length,
    selected_per_source: Array.from(perSourceTotal.entries())
      .map(([source_id, total]) => ({
        source_id,
        selected: perSourceSelected.get(source_id) ?? 0,
        total,
      }))
      .sort((a, b) => b.total - a.total),
    // B-TRIAGE-001: skip-with-warning records for any unparseable claim lines.
    malformed_jsonl_warnings: malformedWarnings,
  });

  // Write outputs.
  const sectionDir = join(packPath, 'sections', options.sectionId);
  const auditsDir = join(packPath, 'audits');
  await mkdir(sectionDir, { recursive: true });
  await mkdir(auditsDir, { recursive: true });
  const triageJsonlPath = join(sectionDir, 'claim-triage.jsonl');
  const triageMarkdownPath = join(sectionDir, 'claim-triage.md');
  const summaryJsonPath = join(auditsDir, `${options.sectionId}-claim-triage.json`);

  await writeFile(triageJsonlPath, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  await writeFile(triageMarkdownPath, buildMarkdown(records, summary), 'utf8');
  await writeFile(summaryJsonPath, JSON.stringify(summary, null, 2), 'utf8');

  const parkedCount = rows.filter((r) => r.decision.startsWith('parked_')).length;
  const needsRepairCount = rows.filter(
    (r) => r.decision === 'needs_scope_repair' || r.decision === 'needs_human_review',
  ).length;

  return {
    triageJsonlPath,
    triageMarkdownPath,
    summaryJsonPath,
    candidateClaims: claims.length,
    selectedCount: surviving.length,
    parkedCount,
    needsRepairCount,
    decisions,
  };
}

// Read the triage ledger for a section. Used by --triaged-only consumers.
export async function readTriagedClaimIds(
  packPath: string,
  sectionId: string,
): Promise<Set<string>> {
  const path = join(packPath, 'sections', sectionId, 'claim-triage.jsonl');
  const out = new Set<string>();
  if (!existsSync(path)) return out;
  const text = await readFile(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const r = ClaimTriageSchema.parse(JSON.parse(line));
      if (r.decision === 'selected_for_review') out.add(r.claim_id);
    } catch {
      /* skip */
    }
  }
  return out;
}

function buildMarkdown(records: ClaimTriage[], summary: TriageSummary): string {
  const lines: string[] = [];
  lines.push(`# Claim triage: ${summary.section_id}`);
  lines.push('');
  lines.push(`- **Summary ID:** \`${summary.summary_id}\``);
  lines.push(`- **Triaged at:** ${summary.triaged_at}`);
  lines.push(`- **Method:** ${summary.triage_method}`);
  lines.push(`- **Candidate claims:** ${summary.candidate_claims}`);
  lines.push(`- **Selected for review:** ${summary.selected_count}`);
  lines.push(`- **Per-source cap:** ${summary.per_source_cap}`);
  lines.push(`- **Duplicate clusters collapsed:** ${summary.duplicate_clusters_collapsed}`);
  lines.push('');
  // B-TRIAGE-001: surface skipped malformed claim lines so a dropped line is
  // visible to the operator. Only rendered when non-empty — happy-path markdown
  // stays byte-identical.
  const malformed = summary.malformed_jsonl_warnings ?? [];
  if (malformed.length > 0) {
    lines.push('## Malformed JSONL warnings');
    lines.push('');
    lines.push(`${malformed.length} claim line(s) were skipped as unparseable and excluded from triage.`);
    lines.push('');
    lines.push('| Path | Line | Reason |');
    lines.push('|---|---:|---|');
    for (const w of malformed) {
      lines.push(`| \`${w.path}\` | ${w.line} | ${w.reason.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')} |`);
    }
    lines.push('');
  }
  lines.push('## Decisions');
  lines.push('');
  lines.push('| Decision | Count |');
  lines.push('|---|---:|');
  for (const [k, v] of Object.entries(summary.decisions)) {
    lines.push(`| \`${k}\` | ${v} |`);
  }
  lines.push('');
  lines.push('## Selected per source');
  lines.push('');
  lines.push('| Source | Selected | Total |');
  lines.push('|---|---:|---:|');
  for (const s of summary.selected_per_source) {
    lines.push(`| \`${s.source_id}\` | ${s.selected} | ${s.total} |`);
  }
  lines.push('');
  lines.push('## Triage records (compact)');
  lines.push('');
  lines.push('| Rank | Decision | Quality | Claim ID | Reason |');
  lines.push('|---:|---|---:|---|---|');
  // Selected first (in rank order), then everything else grouped by decision.
  const selected = records.filter((r) => r.decision === 'selected_for_review');
  selected.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  for (const r of selected) {
    lines.push(`| ${r.rank ?? ''} | \`${r.decision}\` | ${r.quality_score.toFixed(2)} | \`${r.claim_id}\` | ${r.reason.replace(/\|/g, '\\|')} |`);
  }
  const parked = records.filter((r) => r.decision !== 'selected_for_review');
  parked.sort((a, b) => a.decision.localeCompare(b.decision));
  for (const r of parked) {
    lines.push(`| | \`${r.decision}\` | ${r.quality_score.toFixed(2)} | \`${r.claim_id}\` | ${r.reason.replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('_Triage does not mutate `claims.jsonl`. Parked claims remain on the canonical ledger as research truth; they are simply excluded from the next review pass._');
  return lines.join('\n');
}
