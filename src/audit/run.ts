import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as yamlParse } from 'yaml';

import { PackNotFoundError } from '../errors.js';
import { ResearchYamlSchema, type ResearchYaml } from '../intake/schema.js';
import { ClaimSchema, type Claim } from '../claims/schema.js';
import { ContradictionSchema, type Contradiction } from '../contradictions/schema.js';
import {
  ContradictionResolutionSchema,
  type ContradictionResolution,
} from '../contradictions/resolution-schema.js';
import {
  ClaimSynthesisDispositionSchema,
  type ClaimSynthesisDisposition,
} from '../dispositions/schema.js';
import {
  FetchReceiptSchema,
  SourceCardSchema,
  type FetchReceipt,
  type SourceCard,
} from '../sources/schema.js';
import { SectionGateResultSchema, type SectionGateResult } from '../gates/schema.js';
import {
  ClaimReviewSchema,
  ReviewFindingSchema,
  type ClaimReview,
  type ReviewFinding,
} from '../review/schema.js';
import {
  CoworkHandoffPayloadSchema,
  type CoworkHandoffPayload,
} from '../cowork/schema.js';

import { aggregate, type AggregateInput } from './aggregate.js';
import { PackAuditPayloadSchema } from './schema.js';
import {
  renderOrphanClaimsMarkdown,
  renderPackAuditMarkdown,
  renderScopeWideningRisksMarkdown,
  renderSourceDiversityGapsMarkdown,
  renderStaleSourcesMarkdown,
  renderSynthesisReadinessMarkdown,
  renderUnresolvedContradictionsMarkdown,
  renderWeakSourcesMarkdown,
} from './markdown.js';
import type { AuditOptions, AuditSummary } from './types.js';

async function readJsonl<T>(
  path: string,
  parse: (raw: unknown) => T,
  warnings: string[],
): Promise<T[]> {
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const out: T[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(parse(JSON.parse(line)));
    } catch (err) {
      warnings.push(`malformed line in ${path}: ${err instanceof Error ? err.message : 'parse error'}`);
    }
  }
  return out;
}

async function readSourceCards(
  packPath: string,
  warnings: string[],
): Promise<SourceCard[]> {
  const dir = join(packPath, 'evidence', 'source-cards');
  if (!existsSync(dir)) return [];
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir);
  const cards: SourceCard[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      const text = await readFile(join(dir, entry), 'utf8');
      cards.push(SourceCardSchema.parse(JSON.parse(text)));
    } catch (err) {
      warnings.push(`malformed source card ${entry}: ${err instanceof Error ? err.message : 'parse error'}`);
    }
  }
  return cards;
}

async function readGate(
  packPath: string,
  sectionId: string,
  warnings: string[],
): Promise<SectionGateResult | null> {
  const path = join(packPath, 'audits', `${sectionId}-gate.json`);
  if (!existsSync(path)) return null;
  try {
    return SectionGateResultSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch (err) {
    warnings.push(`malformed gate result for ${sectionId}: ${err instanceof Error ? err.message : 'parse error'}`);
    return null;
  }
}

async function readHandoff(
  packPath: string,
  warnings: string[],
): Promise<CoworkHandoffPayload | null> {
  const path = join(packPath, 'handoffs', 'cowork-handoff.json');
  if (!existsSync(path)) return null;
  try {
    return CoworkHandoffPayloadSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch (err) {
    warnings.push(`malformed handoff: ${err instanceof Error ? err.message : 'parse error'}`);
    return null;
  }
}

async function readSourceIdsForSection(
  packPath: string,
  sectionId: string,
): Promise<string[]> {
  const path = join(packPath, 'sections', sectionId, 'sources.jsonl');
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const ids: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as { source_id?: string };
      if (typeof parsed.source_id === 'string') ids.push(parsed.source_id);
    } catch {
      /* skip */
    }
  }
  return ids;
}

export async function audit(options: AuditOptions): Promise<AuditSummary> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  const yamlPath = join(packPath, 'research.yaml');
  if (!existsSync(yamlPath)) throw new PackNotFoundError(packPath);
  const research: ResearchYaml = ResearchYamlSchema.parse(yamlParse(await readFile(yamlPath, 'utf8')));

  const warnings: string[] = [];
  const perSection: AggregateInput['perSection'] = new Map();
  for (const section of research.sections) {
    const sid = section.id;
    const claims = await readJsonl<Claim>(
      join(packPath, 'sections', sid, 'claims.jsonl'),
      (r) => ClaimSchema.parse(r),
      warnings,
    );
    const candidateClaims = claims.filter((c) => c.review_state === 'candidate');
    const claimReviews = await readJsonl<ClaimReview>(
      join(packPath, 'sections', sid, 'claim-reviews.jsonl'),
      (r) => ClaimReviewSchema.parse(r),
      warnings,
    );
    const contradictions = await readJsonl<Contradiction>(
      join(packPath, 'sections', sid, 'contradictions.jsonl'),
      (r) => ContradictionSchema.parse(r),
      warnings,
    );
    const resolutions = await readJsonl<ContradictionResolution>(
      join(packPath, 'sections', sid, 'contradiction-resolutions.jsonl'),
      (r) => ContradictionResolutionSchema.parse(r),
      warnings,
    );
    const dispositions = await readJsonl<ClaimSynthesisDisposition>(
      join(packPath, 'sections', sid, 'claim-synthesis-dispositions.jsonl'),
      (r) => ClaimSynthesisDispositionSchema.parse(r),
      warnings,
    );
    const findings = await readJsonl<ReviewFinding>(
      join(packPath, 'audits', `${sid}-findings.jsonl`),
      (r) => ReviewFindingSchema.parse(r),
      warnings,
    );
    const gate = await readGate(packPath, sid, warnings);
    const sourceIdsForSection = await readSourceIdsForSection(packPath, sid);
    perSection.set(sid, {
      claims,
      candidateClaims,
      claimReviews,
      contradictions,
      resolutions,
      dispositions,
      gate,
      findings,
      sourceIdsForSection,
    });
  }

  const sources = await readSourceCards(packPath, warnings);
  const receipts = await readJsonl<FetchReceipt>(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    (r) => FetchReceiptSchema.parse(r),
    warnings,
  );
  const handoff = await readHandoff(packPath, warnings);

  const generatedAt = new Date().toISOString();
  const result = aggregate({
    research,
    perSection,
    sources,
    receipts,
    handoff,
    generatedAt,
    warnings,
  });

  // Validate the payload before writing
  const payload = PackAuditPayloadSchema.parse(result.payload);

  const auditsDir = join(packPath, 'audits');
  await mkdir(auditsDir, { recursive: true });
  const filesWritten: string[] = [];

  const writeFileAndTrack = async (rel: string, content: string): Promise<void> => {
    const abs = join(packPath, rel);
    await writeFile(abs, content, 'utf8');
    filesWritten.push(abs);
  };

  await writeFileAndTrack('audits/pack-audit.json', JSON.stringify(payload, null, 2));
  await writeFileAndTrack('audits/pack-audit.md', renderPackAuditMarkdown(payload));

  await writeFileAndTrack('audits/orphan-claims.json', JSON.stringify(result.orphanClaims, null, 2));
  await writeFileAndTrack('audits/orphan-claims.md', renderOrphanClaimsMarkdown(result.orphanClaims));

  await writeFileAndTrack('audits/stale-sources.json', JSON.stringify(result.staleSources, null, 2));
  await writeFileAndTrack('audits/stale-sources.md', renderStaleSourcesMarkdown(result.staleSources));

  await writeFileAndTrack('audits/weak-sources.json', JSON.stringify(result.weakSources, null, 2));
  await writeFileAndTrack('audits/weak-sources.md', renderWeakSourcesMarkdown(result.weakSources));

  await writeFileAndTrack(
    'audits/unresolved-contradictions.json',
    JSON.stringify(result.unresolvedContradictions, null, 2),
  );
  await writeFileAndTrack(
    'audits/unresolved-contradictions.md',
    renderUnresolvedContradictionsMarkdown(result.unresolvedContradictions),
  );

  await writeFileAndTrack(
    'audits/scope-widening-risks.json',
    JSON.stringify(result.scopeWideningRisks, null, 2),
  );
  await writeFileAndTrack(
    'audits/scope-widening-risks.md',
    renderScopeWideningRisksMarkdown(result.scopeWideningRisks),
  );

  await writeFileAndTrack(
    'audits/source-diversity-gaps.json',
    JSON.stringify(result.sourceDiversityGaps, null, 2),
  );
  await writeFileAndTrack(
    'audits/source-diversity-gaps.md',
    renderSourceDiversityGapsMarkdown(result.sourceDiversityGaps),
  );

  await writeFileAndTrack('audits/synthesis-readiness.json', JSON.stringify(payload.section_summaries, null, 2));
  await writeFileAndTrack('audits/synthesis-readiness.md', renderSynthesisReadinessMarkdown(payload));

  return {
    packPath,
    verdict: payload.verdict,
    synthesisAllowed: payload.synthesis_allowed,
    filesWritten,
    warnings: payload.warnings,
    blockingReasons: payload.blocking_reasons,
    orphans: result.orphanClaims.length,
    staleSources: result.staleSources.length,
    weakSources: result.weakSources.length,
    unresolvedContradictions: result.unresolvedContradictions.length,
    scopeWideningRisks: result.scopeWideningRisks.length,
    sourceDiversityGaps: result.sourceDiversityGaps.length,
  };
}
