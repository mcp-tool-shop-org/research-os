import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as yamlParse } from 'yaml';

import { PackNotFoundError, SectionNotFoundError } from '../errors.js';
import { RESEARCH_OS_VERSION } from '../index.js';
import { ResearchYamlSchema } from '../intake/schema.js';
import {
  FetchReceiptSchema,
  SourceCardSchema,
  type FetchReceipt,
  type SourceCard,
} from '../sources/schema.js';
import { ClaimSchema, type Claim } from '../claims/schema.js';
import { getEffectiveDecisionMap } from '../closure-ledger/effective-accepted.js';
import { ContradictionSchema } from '../contradictions/schema.js';
import {
  ClaimReviewSchema,
  ReviewFindingSchema,
} from '../review/schema.js';
import { SectionReportSchema, type SectionReport } from './schema.js';

export interface SectionReportOptions {
  sectionId: string;
  packPath?: string;
  now?: () => Date;
}

export interface SectionReportResult {
  report: SectionReport;
  jsonPath: string;
  markdownPath: string;
}

async function readJson<T>(path: string, parser: (raw: unknown) => T): Promise<T | null> {
  if (!existsSync(path)) return null;
  try {
    return parser(JSON.parse(await readFile(path, 'utf8')));
  } catch {
    return null;
  }
}

async function readJsonl<T>(path: string, parse: (raw: unknown) => T): Promise<T[]> {
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const out: T[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(parse(JSON.parse(line)));
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 0).length;
}

export async function reportSection(
  options: SectionReportOptions,
): Promise<SectionReportResult> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  if (!existsSync(join(packPath, 'research.yaml'))) throw new PackNotFoundError(packPath);
  if (!existsSync(join(packPath, 'sections', options.sectionId)))
    throw new SectionNotFoundError(options.sectionId);

  const research = ResearchYamlSchema.parse(
    yamlParse(await readFile(join(packPath, 'research.yaml'), 'utf8')),
  );
  const section = research.sections.find((s) => s.id === options.sectionId);

  // Sources & receipts.
  const allReceipts = await readJsonl(join(packPath, 'evidence', 'fetch-log.jsonl'), (raw) =>
    FetchReceiptSchema.parse(raw),
  );
  const okReceipts = new Map<string, FetchReceipt>();
  for (const r of allReceipts) {
    if (r.section_id !== options.sectionId) continue;
    if (r.fetch_outcome !== 'ok') continue;
    const prev = okReceipts.get(r.source_id);
    if (!prev || prev.fetched_at < r.fetched_at) okReceipts.set(r.source_id, r);
  }
  const sectionSourceIds: string[] = [];
  const sourcesPath = join(packPath, 'sections', options.sectionId, 'sources.jsonl');
  if (existsSync(sourcesPath)) {
    const text = await readFile(sourcesPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line) as { source_id?: string };
        if (obj.source_id) sectionSourceIds.push(obj.source_id);
      } catch {
        /* skip */
      }
    }
  }
  const cards = new Map<string, SourceCard>();
  for (const sid of sectionSourceIds) {
    const cardPath = join(packPath, 'evidence', 'source-cards', `${sid}.json`);
    if (!existsSync(cardPath)) continue;
    try {
      cards.set(sid, SourceCardSchema.parse(JSON.parse(await readFile(cardPath, 'utf8'))));
    } catch {
      /* skip */
    }
  }
  const publishers = Array.from(
    new Set(Array.from(cards.values()).map((c) => c.publisher).filter((p): p is string => !!p)),
  ).sort();

  // Total raw-text word count for this section.
  let totalWords = 0;
  for (const sid of sectionSourceIds) {
    const r = okReceipts.get(sid);
    if (!r?.raw_text_path) continue;
    const p = join(packPath, r.raw_text_path);
    if (!existsSync(p)) continue;
    totalWords += countWords(await readFile(p, 'utf8'));
  }

  // Claims.
  const claims = await readJsonl(
    join(packPath, 'sections', options.sectionId, 'claims.jsonl'),
    (raw) => ClaimSchema.parse(raw),
  );
  const claimsBySrc = new Map<string, Claim[]>();
  for (const c of claims) {
    for (const sid of c.source_ids) {
      const arr = claimsBySrc.get(sid) ?? [];
      arr.push(c);
      claimsBySrc.set(sid, arr);
    }
  }

  // Density audit (if it exists).
  const density = await readJson(
    join(packPath, 'audits', `${options.sectionId}-claim-density.json`),
    (raw) => raw as Record<string, unknown>,
  );

  // Extract receipt (if it exists).
  const extractReceipt = await readJson(
    join(packPath, 'audits', `${options.sectionId}-claim-extract.json`),
    (raw) => raw as Record<string, unknown>,
  );

  // Excerpt ledgers (so we can count pages even without an extract receipt).
  let excerptPagesProcessed: number | null = null;
  if (extractReceipt && typeof extractReceipt.excerpt_ledgers_built === 'number') {
    excerptPagesProcessed = extractReceipt.excerpt_ledgers_built as number;
  }
  let excerptIdFailures: number | null = null;
  if (extractReceipt && typeof extractReceipt.claims_rejected_excerpt_id_missing === 'number') {
    excerptIdFailures =
      (extractReceipt.claims_rejected_excerpt_id_missing as number) +
      ((extractReceipt.claims_rejected_excerpt_id_malformed as number) ?? 0);
  }
  let malformedOutputs: number | null = null;
  if (extractReceipt && Array.isArray(extractReceipt.failures)) {
    malformedOutputs = (extractReceipt.failures as Array<{ kind?: string }>).filter(
      (f) => f.kind === 'extractor_invalid_json',
    ).length;
  }

  // Contradictions.
  const contradictions = await readJsonl(
    join(packPath, 'sections', options.sectionId, 'contradictions.jsonl'),
    (raw) => ContradictionSchema.parse(raw),
  );
  let pairsCompared: number | null = null;
  if (claims.length > 1) pairsCompared = (claims.length * (claims.length - 1)) / 2;
  const overgeneralizationRisks = contradictions.filter(
    (c) => c.type === 'overgeneralization_risk',
  ).length;

  // Review.
  const reviews = await readJsonl(
    join(packPath, 'sections', options.sectionId, 'claim-reviews.jsonl'),
    (raw) => ClaimReviewSchema.parse(raw),
  );
  // For each claim, take the LATEST review (append-only ledger). Routed through
  // the single canonical join (A-COWORK-001 verifier follow-up) so the tie
  // direction stays consistent with cowork/synth/freeze/gate/audit.
  const latestReviewByClaim = getEffectiveDecisionMap(reviews);
  const findings = await readJsonl(
    join(packPath, 'audits', `${options.sectionId}-findings.jsonl`),
    (raw) => ReviewFindingSchema.parse(raw),
  );

  const decisionCounts = {
    accepted_for_synthesis: 0,
    needs_scope_repair: 0,
    needs_source_repair: 0,
    needs_contradiction_mapping: 0,
    rejected: 0,
    // Phase 1b-b (v0.8.0): extract-time critic exclusion bucket. Counted as
    // its own decision so the section report distinguishes "off-topic
    // attrition" from review-time rejection / repair work.
    frame_excluded: 0,
    needs_human_review: 0,
  };
  for (const claim of claims) {
    const r = latestReviewByClaim.get(claim.claim_id);
    if (!r) continue;
    decisionCounts[r.decision] += 1;
  }
  // Tally finding categories that produced non-accept decisions.
  const categoryCounts = new Map<string, number>();
  for (const f of findings) {
    if (f.severity === 'info') continue;
    categoryCounts.set(f.category, (categoryCounts.get(f.category) ?? 0) + 1);
  }
  const rejectionByCategory = Array.from(categoryCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
  const topRejectionCategory = rejectionByCategory[0]?.category ?? null;
  const claimOverproductionFired = (categoryCounts.get('claim_overproduction') ?? 0) > 0;

  // Gate verdict.
  const gate = await readJson(
    join(packPath, 'audits', `${options.sectionId}-gate.json`),
    (raw) => raw as Record<string, unknown>,
  );

  const candidate = claims.length;
  const accepted = decisionCounts.accepted_for_synthesis;
  const acceptanceRatio = candidate > 0 ? accepted / candidate : 0;
  const acceptedPerSource = sectionSourceIds.length > 0 ? accepted / sectionSourceIds.length : 0;
  const acceptedPer1kWords = totalWords > 0 ? (accepted / totalWords) * 1000 : 0;
  const synthesisReady =
    typeof gate?.synthesis_eligible === 'boolean' ? gate.synthesis_eligible : false;

  const stamp = (options.now ?? (() => new Date()))();

  const report: SectionReport = SectionReportSchema.parse({
    report_id: `secrep_${stamp.getTime()}_${options.sectionId}`,
    section_id: options.sectionId,
    reported_at: stamp.toISOString(),
    research_os_version: RESEARCH_OS_VERSION,
    status: section?.status ?? 'unknown',
    sources: {
      fetched_ok: okReceipts.size,
      source_cards: cards.size,
      publishers,
      primary_source_waiver: {
        status: research.primary_source_waiver.status,
        reason: research.primary_source_waiver.reason ?? null,
        compensating_controls: research.primary_source_waiver.compensating_controls,
      },
    },
    extraction: {
      candidate_claims: candidate,
      claims_per_source: Array.from(claimsBySrc.entries())
        .map(([source_id, cs]) => ({ source_id, claims: cs.length }))
        .sort((a, b) => b.claims - a.claims),
      claims_per_1k_words: totalWords > 0 ? (candidate / totalWords) * 1000 : 0,
      excerpt_pages_processed: excerptPagesProcessed,
      excerpt_id_failures: excerptIdFailures,
      malformed_extractor_outputs: malformedOutputs,
      near_duplicate_clusters:
        density && Array.isArray((density as { near_duplicate_clusters?: unknown[] }).near_duplicate_clusters)
          ? ((density as { near_duplicate_clusters: unknown[] }).near_duplicate_clusters).length
          : 0,
      weak_scope_count:
        density && typeof (density as { weak_scope_count?: number }).weak_scope_count === 'number'
          ? ((density as { weak_scope_count: number }).weak_scope_count)
          : 0,
      generic_scope_count:
        density && typeof (density as { generic_scope_count?: number }).generic_scope_count === 'number'
          ? ((density as { generic_scope_count: number }).generic_scope_count)
          : 0,
      density_flags:
        density && Array.isArray((density as { flags?: unknown[] }).flags)
          ? ((density as { flags: unknown[] }).flags).length
          : 0,
    },
    contradictions: {
      pairs_compared: pairsCompared,
      contradiction_candidates: contradictions.length,
      overgeneralization_risks: overgeneralizationRisks,
    },
    review: {
      reviewed: latestReviewByClaim.size > 0,
      accepted_for_synthesis: decisionCounts.accepted_for_synthesis,
      needs_scope_repair: decisionCounts.needs_scope_repair,
      needs_source_repair: decisionCounts.needs_source_repair,
      needs_contradiction_mapping: decisionCounts.needs_contradiction_mapping,
      rejected: decisionCounts.rejected,
      needs_human_review: decisionCounts.needs_human_review,
      rejection_or_repair_by_category: rejectionByCategory,
    },
    acceptance: {
      candidate_claims: candidate,
      accepted_for_synthesis: accepted,
      acceptance_ratio: acceptanceRatio,
      accepted_per_source: acceptedPerSource,
      accepted_per_1k_words: acceptedPer1kWords,
      top_rejection_category: topRejectionCategory,
      claim_overproduction_fired: claimOverproductionFired,
      synthesis_ready: synthesisReady,
    },
    gate_verdict: typeof gate?.verdict === 'string' ? (gate.verdict as string) : null,
    gate_synthesis_eligible:
      typeof gate?.synthesis_eligible === 'boolean'
        ? (gate.synthesis_eligible as boolean)
        : null,
  });

  // Markdown render — exact shape from the user's spec.
  const md: string[] = [];
  md.push(`# Section ${report.section_id}`);
  md.push('');
  md.push(`- **Status:** ${report.status}`);
  md.push(`- **Reported at:** ${report.reported_at}`);
  md.push(`- **Report ID:** \`${report.report_id}\``);
  md.push('');
  md.push('## Sources');
  md.push('');
  md.push(`- fetched: ${report.sources.fetched_ok}`);
  md.push(`- source cards: ${report.sources.source_cards}`);
  md.push(`- publishers: ${report.sources.publishers.length === 0 ? '(none)' : report.sources.publishers.join(', ')}`);
  md.push(`- primary-source waiver: ${report.sources.primary_source_waiver.status}${report.sources.primary_source_waiver.reason ? ` — ${report.sources.primary_source_waiver.reason.slice(0, 200)}` : ''}`);
  md.push('');
  md.push('## Extraction');
  md.push('');
  md.push(`- candidate claims: ${report.extraction.candidate_claims}`);
  md.push(`- claims per source: ${report.extraction.claims_per_source.map((s) => `${s.source_id}=${s.claims}`).join(', ') || '(none)'}`);
  md.push(`- claims per 1k words: ${report.extraction.claims_per_1k_words.toFixed(2)}`);
  md.push(`- excerpt pages processed: ${report.extraction.excerpt_pages_processed ?? 'n/a'}`);
  md.push(`- excerpt-id failures: ${report.extraction.excerpt_id_failures ?? 'n/a'}`);
  md.push(`- malformed extractor outputs: ${report.extraction.malformed_extractor_outputs ?? 'n/a'}`);
  md.push(`- duplicate / near-duplicate clusters: ${report.extraction.near_duplicate_clusters}`);
  md.push(`- weak-scope claims: ${report.extraction.weak_scope_count}`);
  md.push(`- generic-scope claims: ${report.extraction.generic_scope_count}`);
  md.push(`- density flags: ${report.extraction.density_flags}`);
  md.push('');
  md.push('## Contradictions');
  md.push('');
  md.push(`- pairs compared: ${report.contradictions.pairs_compared ?? 'n/a'}`);
  md.push(`- contradiction candidates: ${report.contradictions.contradiction_candidates}`);
  md.push(`- overgeneralization risks: ${report.contradictions.overgeneralization_risks}`);
  md.push('');
  md.push('## Review');
  md.push('');
  if (!report.review.reviewed) {
    md.push('_Review has not run for this section yet._');
  } else {
    md.push(`- accepted_for_synthesis: ${report.review.accepted_for_synthesis}`);
    md.push(`- needs_scope_repair: ${report.review.needs_scope_repair}`);
    md.push(`- needs_source_repair: ${report.review.needs_source_repair}`);
    md.push(`- rejected: ${report.review.rejected}`);
    md.push(`- needs_human_review: ${report.review.needs_human_review}`);
    md.push(`- needs_contradiction_mapping: ${report.review.needs_contradiction_mapping}`);
    md.push('');
    md.push('### Rejection / repair by category');
    md.push('');
    if (report.review.rejection_or_repair_by_category.length === 0) {
      md.push('_No non-info findings recorded._');
    } else {
      md.push('| Category | Count |');
      md.push('|---|---:|');
      for (const r of report.review.rejection_or_repair_by_category) {
        md.push(`| \`${r.category}\` | ${r.count} |`);
      }
    }
  }
  md.push('');
  md.push('## Acceptance');
  md.push('');
  md.push(`- acceptance ratio: ${(report.acceptance.acceptance_ratio * 100).toFixed(1)}% (${report.acceptance.accepted_for_synthesis} / ${report.acceptance.candidate_claims})`);
  md.push(`- accepted per source: ${report.acceptance.accepted_per_source.toFixed(2)}`);
  md.push(`- accepted per 1k source words: ${report.acceptance.accepted_per_1k_words.toFixed(2)}`);
  md.push(`- top rejection category: ${report.acceptance.top_rejection_category ?? 'none'}`);
  md.push(`- claim_overproduction fired: ${report.acceptance.claim_overproduction_fired ? 'yes' : 'no'}`);
  md.push(`- synthesis ready: ${report.acceptance.synthesis_ready ? 'yes' : 'no'}`);
  md.push('');
  md.push('---');
  md.push('');
  md.push('_This report is read-only — it does not mutate any canonical artifact. Re-run after any pipeline step to refresh._');

  const auditsDir = join(packPath, 'audits');
  await mkdir(auditsDir, { recursive: true });
  const jsonPath = join(auditsDir, `${options.sectionId}-section-report.json`);
  const markdownPath = join(auditsDir, `${options.sectionId}-section-report.md`);
  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  await writeFile(markdownPath, md.join('\n'), 'utf8');
  return { report, jsonPath, markdownPath };
}
