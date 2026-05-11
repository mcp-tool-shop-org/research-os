import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { PackNotFoundError, SectionNotFoundError } from '../../errors.js';
import { RESEARCH_OS_VERSION } from '../../index.js';
import {
  FetchReceiptSchema,
  SourceCardSchema,
  type FetchReceipt,
  type SourceCard,
} from '../../sources/schema.js';
import { ClaimSchema, type Claim } from '../schema.js';
import {
  ClaimDensityAuditSchema,
  type ClaimDensityAudit,
  type DensityFlag,
  type NearDuplicateCluster,
  type PerSourceDensity,
} from './schema.js';

export interface AuditDensityOptions {
  sectionId: string;
  packPath?: string;
  now?: () => Date;
}

export interface AuditDensityResult {
  audit: ClaimDensityAudit;
  jsonPath: string;
  markdownPath: string;
}

const NEAR_DUP_CLUSTER_MIN = 3;
const SOURCE_DOMINANCE_RATIO = 0.4;
const SOURCE_DOMINANCE_MIN_TOTAL = 10;
const SOURCE_DOMINANCE_MIN_PER_SOURCE = 8;
const HIGH_DENSITY_PER_1K = 5;
const WEAK_SCOPE_MAJORITY_RATIO = 0.5;

function normalize(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(text: string): number {
  if (!text) return 0;
  return normalize(text).split(' ').filter((w) => w.length > 0).length;
}

async function readClaims(packPath: string, sectionId: string): Promise<Claim[]> {
  const path = join(packPath, 'sections', sectionId, 'claims.jsonl');
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const out: Claim[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(ClaimSchema.parse(JSON.parse(line)));
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

async function readSourceCards(
  packPath: string,
  sourceIds: string[],
): Promise<Map<string, SourceCard>> {
  const out = new Map<string, SourceCard>();
  for (const sid of sourceIds) {
    const p = join(packPath, 'evidence', 'source-cards', `${sid}.json`);
    if (!existsSync(p)) continue;
    try {
      out.set(sid, SourceCardSchema.parse(JSON.parse(await readFile(p, 'utf8'))));
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

async function readLatestReceipts(packPath: string): Promise<Map<string, FetchReceipt>> {
  const out = new Map<string, FetchReceipt>();
  const path = join(packPath, 'evidence', 'fetch-log.jsonl');
  if (!existsSync(path)) return out;
  const text = await readFile(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const r = FetchReceiptSchema.parse(JSON.parse(line));
      if (r.fetch_outcome !== 'ok') continue;
      const prev = out.get(r.source_id);
      if (!prev || prev.fetched_at < r.fetched_at) out.set(r.source_id, r);
    } catch {
      /* skip */
    }
  }
  return out;
}

async function readRawText(packPath: string, receipt: FetchReceipt): Promise<string | null> {
  if (!receipt.raw_text_path) return null;
  const p = join(packPath, receipt.raw_text_path);
  if (!existsSync(p)) return null;
  return await readFile(p, 'utf8');
}

// A claim's scope is "weak" when scope is null AND not is null AND asserts > 40 chars.
function isWeakScope(claim: Claim): boolean {
  return claim.scope === null && claim.not === null && claim.asserts.length > 40;
}

// A claim's scope is "generic source" when scope is non-null but quotes the
// source title or topic without adding situational context. Heuristic: scope
// length is short AND a substantial fraction of the scope tokens appear in the
// source-card title (case-insensitive).
function isGenericScope(claim: Claim, sourceTitle: string | null): boolean {
  if (!claim.scope || !sourceTitle) return false;
  if (claim.scope.length > 80) return false;
  const titleTokens = new Set(normalize(sourceTitle).split(' ').filter((t) => t.length > 3));
  const scopeTokens = normalize(claim.scope).split(' ').filter((t) => t.length > 3);
  if (scopeTokens.length === 0) return false;
  const overlap = scopeTokens.filter((t) => titleTokens.has(t)).length;
  return overlap / scopeTokens.length >= 0.5;
}

function buildClusters(claims: Claim[]): NearDuplicateCluster[] {
  const buckets = new Map<string, Claim[]>();
  for (const c of claims) {
    const key = normalize(c.asserts);
    if (key.length === 0) continue;
    const arr = buckets.get(key) ?? [];
    arr.push(c);
    buckets.set(key, arr);
  }
  const clusters: NearDuplicateCluster[] = [];
  for (const [, members] of buckets) {
    if (members.length >= NEAR_DUP_CLUSTER_MIN) {
      clusters.push({
        representative_assert: members[0]!.asserts.slice(0, 240),
        member_count: members.length,
        claim_ids: members.map((m) => m.claim_id),
      });
    }
  }
  // Sort largest cluster first.
  clusters.sort((a, b) => b.member_count - a.member_count);
  return clusters;
}

function buildFlags(audit: Omit<ClaimDensityAudit, 'flags'>): DensityFlag[] {
  const flags: DensityFlag[] = [];
  // source_dominance
  for (const s of audit.per_source) {
    if (
      s.claim_count >= 30 ||
      (audit.candidate_claim_count >= SOURCE_DOMINANCE_MIN_TOTAL &&
        s.claim_count >= SOURCE_DOMINANCE_MIN_PER_SOURCE &&
        s.share_of_section >= SOURCE_DOMINANCE_RATIO)
    ) {
      // share_of_section is share of total claim-source attributions (sums to
      // 1.0 across sources). 0.6 means this source carries >=60% of the
      // section's attribution weight — block-severity over-dominance.
      const severity = s.claim_count >= 50 || s.share_of_section >= 0.6 ? 'block' : 'warn';
      flags.push({
        type: 'source_dominance',
        severity,
        message: `Source ${s.source_id} contributes ${s.claim_count} of ${audit.candidate_claim_count} claims (${(s.share_of_section * 100).toFixed(0)}% of section).`,
        affects_source_ids: [s.source_id],
        affects_claim_ids: [],
      });
    }
  }
  // high_per_word_density (per-source)
  for (const s of audit.per_source) {
    if (s.source_word_count > 0 && s.claims_per_1k_words >= HIGH_DENSITY_PER_1K) {
      flags.push({
        type: 'high_per_word_density',
        severity: 'warn',
        message: `Source ${s.source_id} has ${s.claims_per_1k_words.toFixed(1)} claims per 1k source words — likely over-atomization.`,
        affects_source_ids: [s.source_id],
        affects_claim_ids: [],
      });
    }
  }
  // weak_scope_majority
  if (
    audit.candidate_claim_count > 0 &&
    audit.weak_scope_count / audit.candidate_claim_count >= WEAK_SCOPE_MAJORITY_RATIO
  ) {
    flags.push({
      type: 'weak_scope_majority',
      severity: 'warn',
      message: `${audit.weak_scope_count} of ${audit.candidate_claim_count} claims (${((audit.weak_scope_count / audit.candidate_claim_count) * 100).toFixed(0)}%) carry no scope and no not constraint.`,
      affects_source_ids: [],
      affects_claim_ids: [],
    });
  }
  return flags;
}

function buildMarkdown(audit: ClaimDensityAudit): string {
  const lines: string[] = [];
  lines.push(`# Claim density audit: ${audit.section_id}`);
  lines.push('');
  lines.push(`- **Audit ID:** \`${audit.audit_id}\``);
  lines.push(`- **Audited at:** ${audit.audited_at}`);
  lines.push(`- **research-os version:** ${audit.research_os_version}`);
  lines.push(`- **Candidate claims:** ${audit.candidate_claim_count}`);
  lines.push(`- **Sources:** ${audit.source_count}`);
  lines.push(`- **Total source words:** ${audit.total_source_word_count.toLocaleString()}`);
  lines.push(`- **Claims per 1k source words (section):** ${audit.claims_per_1k_words.toFixed(2)}`);
  lines.push(`- **Weak-scope claims (scope=null, not=null, substantive asserts):** ${audit.weak_scope_count}`);
  lines.push(`- **Generic-scope claims (scope mirrors source title):** ${audit.generic_scope_count}`);
  lines.push('');

  lines.push(`## Flags (${audit.flags.length})`);
  lines.push('');
  if (audit.flags.length === 0) {
    lines.push('_No density flags raised. Section claim ledger looks proportionate._');
  } else {
    lines.push('| Type | Severity | Message |');
    lines.push('|---|---|---|');
    for (const f of audit.flags) {
      lines.push(`| \`${f.type}\` | ${f.severity} | ${f.message.replace(/\|/g, '\\|')} |`);
    }
  }
  lines.push('');

  lines.push(`## Per source (${audit.per_source.length})`);
  lines.push('');
  if (audit.per_source.length === 0) {
    lines.push('_No sources contributed claims._');
  } else {
    lines.push('| Source | Words | Claims | Per 1k words | Share | Weak scope | Generic scope |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|');
    for (const s of audit.per_source) {
      lines.push(
        `| \`${s.source_id}\`${s.publisher ? ` (${s.publisher})` : ''} | ${s.source_word_count.toLocaleString()} | ${s.claim_count} | ${s.claims_per_1k_words.toFixed(2)} | ${(s.share_of_section * 100).toFixed(0)}% | ${s.weak_scope_count} | ${s.generic_scope_count} |`,
      );
    }
  }
  lines.push('');

  lines.push(`## Near-duplicate clusters (>= ${NEAR_DUP_CLUSTER_MIN} members) — ${audit.near_duplicate_clusters.length}`);
  lines.push('');
  if (audit.near_duplicate_clusters.length === 0) {
    lines.push('_No near-duplicate clusters detected._');
  } else {
    lines.push('Each row is a cluster of claims whose normalised assertions collapse to the same key.');
    lines.push('');
    lines.push('| Members | Representative assertion |');
    lines.push('|---:|---|');
    for (const c of audit.near_duplicate_clusters) {
      lines.push(`| ${c.member_count} | ${c.representative_assert.replace(/\|/g, '\\|')} |`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('_This audit is read-only. The reviewer (Link 7) decides which claims are accepted, rejected, or flagged for collapse via `claim_overproduction` findings._');
  return lines.join('\n');
}

export async function auditDensity(
  options: AuditDensityOptions,
): Promise<AuditDensityResult> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  if (!existsSync(join(packPath, 'research.yaml'))) throw new PackNotFoundError(packPath);
  if (!existsSync(join(packPath, 'sections', options.sectionId)))
    throw new SectionNotFoundError(options.sectionId);

  const claims = await readClaims(packPath, options.sectionId);
  const allSourceIds = Array.from(
    new Set(claims.flatMap((c) => c.source_ids)),
  ).sort();
  const cards = await readSourceCards(packPath, allSourceIds);
  const receipts = await readLatestReceipts(packPath);

  // Source word counts via raw text (preferred) or fallback to source-card asserts.
  const wordsBySource = new Map<string, number>();
  for (const sid of allSourceIds) {
    let words = 0;
    const r = receipts.get(sid);
    if (r) {
      const raw = await readRawText(packPath, r);
      if (raw) words = countWords(raw);
    }
    if (words === 0) {
      const card = cards.get(sid);
      if (card) words = countWords(card.asserts);
    }
    wordsBySource.set(sid, words);
  }

  // Per-source aggregations.
  //
  // share_of_section uses total CLAIM-SOURCE ATTRIBUTIONS as the denominator
  // (sum over all sources of how many claims cite that source), not the unique
  // claim count. With multi-source claims, attributions > claim count, and
  // dividing by claim count makes per-source shares sum to >1.0. Using
  // attributions as the denominator makes shares sum to exactly 1.0 ± epsilon.
  const totalAttributions = allSourceIds.reduce(
    (acc, sid) => acc + claims.filter((c) => c.source_ids.includes(sid)).length,
    0,
  );
  const perSource: PerSourceDensity[] = [];
  let totalWords = 0;
  let weakTotal = 0;
  let genericTotal = 0;
  for (const sid of allSourceIds) {
    const claimsHere = claims.filter((c) => c.source_ids.includes(sid));
    const words = wordsBySource.get(sid) ?? 0;
    totalWords += words;
    const card = cards.get(sid) ?? null;
    const weak = claimsHere.filter(isWeakScope).length;
    const generic = claimsHere.filter((c) => isGenericScope(c, card?.title ?? null)).length;
    weakTotal += weak;
    genericTotal += generic;
    perSource.push({
      source_id: sid,
      publisher: card?.publisher ?? null,
      source_word_count: words,
      claim_count: claimsHere.length,
      claims_per_1k_words: words > 0 ? (claimsHere.length / words) * 1000 : 0,
      share_of_section: totalAttributions > 0 ? claimsHere.length / totalAttributions : 0,
      weak_scope_count: weak,
      generic_scope_count: generic,
    });
  }
  perSource.sort((a, b) => b.claim_count - a.claim_count);

  const clusters = buildClusters(claims);

  const stamp = (options.now ?? (() => new Date()))();
  const auditId = `cda_${stamp.getTime()}_${options.sectionId}`;

  const partial: Omit<ClaimDensityAudit, 'flags'> = {
    audit_id: auditId,
    section_id: options.sectionId,
    audited_at: stamp.toISOString(),
    research_os_version: RESEARCH_OS_VERSION,
    candidate_claim_count: claims.length,
    source_count: allSourceIds.length,
    total_source_word_count: totalWords,
    claims_per_1k_words: totalWords > 0 ? (claims.length / totalWords) * 1000 : 0,
    weak_scope_count: weakTotal,
    generic_scope_count: genericTotal,
    per_source: perSource,
    near_duplicate_clusters: clusters,
  };
  // Also flag clusters of >= NEAR_DUP_CLUSTER_MIN as a section-level signal.
  const clusterFlags: DensityFlag[] = clusters.map((c) => ({
    type: 'large_near_duplicate_cluster',
    severity: c.member_count >= 6 ? 'block' : 'warn',
    message: `Cluster of ${c.member_count} claims share a normalised assertion: "${c.representative_assert.slice(0, 120)}".`,
    affects_source_ids: [],
    affects_claim_ids: c.claim_ids,
  }));
  const flags = [...buildFlags(partial), ...clusterFlags];
  const audit: ClaimDensityAudit = ClaimDensityAuditSchema.parse({ ...partial, flags });

  // Write audits/<section>-claim-density.{json,md}.
  const auditsDir = join(packPath, 'audits');
  await mkdir(auditsDir, { recursive: true });
  const jsonPath = join(auditsDir, `${options.sectionId}-claim-density.json`);
  const markdownPath = join(auditsDir, `${options.sectionId}-claim-density.md`);
  await writeFile(jsonPath, JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(markdownPath, buildMarkdown(audit), 'utf8');

  return { audit, jsonPath, markdownPath };
}
