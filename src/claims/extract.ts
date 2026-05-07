import { existsSync } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  NoSourcesGatheredError,
  PackNotFoundError,
  SectionNotFoundError,
} from '../errors.js';
import {
  buildExcerptIndex,
  EXCERPT_ID_PATTERN,
  loadOrBuildLedger,
  type Excerpt,
} from '../sources/excerpts/index.js';
import {
  FetchReceiptSchema,
  SourceCardSchema,
  type FetchReceipt,
  type SourceCard,
} from '../sources/schema.js';
import { defaultClaimExtractors, pickClaimExtractor } from './extractors/index.js';
import { ClaimSchema, type Claim } from './schema.js';
import type {
  ClaimExtractor,
  DraftClaim,
  ExtractClaimsOptions,
  ExtractClaimsSummary,
} from './types.js';

const MIN_EXCERPT_LEN_FOR_GROUNDING = 8;
const EVIDENCE_EXCERPT_JOIN = ' … ';
const EVIDENCE_EXCERPT_MAX_CHARS = 1200;

function normalize(text: string): string {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
}

// Legacy text-substring grounding check, retained for callers that still need it
// (e.g. reviewer post-checks). Span-first extraction does NOT use this — claims
// are grounded by excerpt-id resolution against the ledger instead.
export function evidenceGrounded(excerpt: string, rawText: string | null): boolean {
  if (!rawText) return false;
  const e = normalize(excerpt);
  if (e.length < MIN_EXCERPT_LEN_FOR_GROUNDING) return false;
  return normalize(rawText).includes(e);
}

const EXTRACTOR_ID_PART: Record<ClaimExtractor, string> = {
  heuristic: 'heuristic',
  'ollama-intern': 'ollama_intern',
};

interface SectionSourceEntry {
  source_id: string;
}

async function readSectionSourceIds(
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
      const entry = JSON.parse(line) as SectionSourceEntry;
      if (typeof entry.source_id === 'string') ids.push(entry.source_id);
    } catch {
      /* skip malformed line */
    }
  }
  return ids;
}

async function readSourceCard(packPath: string, sourceId: string): Promise<SourceCard | null> {
  const path = join(packPath, 'evidence', 'source-cards', `${sourceId}.json`);
  if (!existsSync(path)) return null;
  const text = await readFile(path, 'utf8');
  return SourceCardSchema.parse(JSON.parse(text));
}

async function findLatestReceipt(
  packPath: string,
  sourceId: string,
): Promise<FetchReceipt | null> {
  const path = join(packPath, 'evidence', 'fetch-log.jsonl');
  if (!existsSync(path)) return null;
  const text = await readFile(path, 'utf8');
  let latest: FetchReceipt | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const r = FetchReceiptSchema.parse(JSON.parse(line));
      if (r.source_id !== sourceId) continue;
      if (r.fetch_outcome !== 'ok') continue;
      if (!latest || r.fetched_at > latest.fetched_at) latest = r;
    } catch {
      /* skip malformed */
    }
  }
  return latest;
}

async function readExistingClaimIds(
  packPath: string,
  sectionId: string,
): Promise<Set<string>> {
  const path = join(packPath, 'sections', sectionId, 'claims.jsonl');
  if (!existsSync(path)) return new Set();
  const text = await readFile(path, 'utf8');
  const set = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as { claim_id?: string };
      if (typeof obj.claim_id === 'string') set.add(obj.claim_id);
    } catch {
      /* skip */
    }
  }
  return set;
}

interface ResolveResult {
  ok: boolean;
  evidenceText: string;
  resolvedIds: string[];
  failureMode: 'excerpt_id_missing' | 'excerpt_id_malformed' | null;
}

function resolveExcerpts(
  rawIds: string[],
  index: Map<string, Excerpt>,
): ResolveResult {
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return { ok: false, evidenceText: '', resolvedIds: [], failureMode: 'excerpt_id_missing' };
  }
  const resolvedIds: string[] = [];
  const texts: string[] = [];
  for (const idRaw of rawIds) {
    const id = String(idRaw).trim();
    if (!EXCERPT_ID_PATTERN.test(id)) {
      return { ok: false, evidenceText: '', resolvedIds: [], failureMode: 'excerpt_id_malformed' };
    }
    const ex = index.get(id);
    if (!ex) {
      return { ok: false, evidenceText: '', resolvedIds: [], failureMode: 'excerpt_id_missing' };
    }
    if (!resolvedIds.includes(id)) {
      resolvedIds.push(id);
      texts.push(ex.text);
    }
  }
  let combined = texts.join(EVIDENCE_EXCERPT_JOIN);
  if (combined.length > EVIDENCE_EXCERPT_MAX_CHARS) {
    combined = combined.slice(0, EVIDENCE_EXCERPT_MAX_CHARS - 2).trimEnd() + ' …';
  }
  if (combined.length === 0) {
    return { ok: false, evidenceText: '', resolvedIds: [], failureMode: 'excerpt_id_missing' };
  }
  return { ok: true, evidenceText: combined, resolvedIds, failureMode: null };
}

function buildClaim(args: {
  draft: DraftClaim;
  evidenceText: string;
  resolvedExcerptIds: string[];
  index: number;
  sectionId: string;
  sourceId: string;
  sourceHash: string | null;
  extractor: ClaimExtractor;
  extractionMethod: string;
}): Claim {
  const {
    draft,
    evidenceText,
    resolvedExcerptIds,
    index,
    sectionId,
    sourceId,
    sourceHash,
    extractor,
    extractionMethod,
  } = args;
  const idPart = EXTRACTOR_ID_PART[extractor];
  const claimId = `clm_${sourceId.replace(/^src_/, '')}_${idPart}_${index + 1}`;
  return ClaimSchema.parse({
    claim_id: claimId,
    section_id: sectionId,
    source_ids: [sourceId],
    source_hashes: sourceHash ? [sourceHash] : [],
    asserts: draft.asserts,
    scope: draft.scope,
    not: draft.not,
    evidence_excerpt_ids: resolvedExcerptIds,
    evidence_excerpt: evidenceText,
    evidence_location: draft.evidence_location,
    confidence: draft.confidence,
    extractor,
    extraction_method: extractionMethod,
    created_at: new Date().toISOString(),
    review_state: 'candidate',
  });
}

export async function extract(options: ExtractClaimsOptions): Promise<ExtractClaimsSummary> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  if (!existsSync(join(packPath, 'research.yaml'))) throw new PackNotFoundError(packPath);
  if (!existsSync(join(packPath, 'sections', options.sectionId)))
    throw new SectionNotFoundError(options.sectionId);

  const sourceIds = await readSectionSourceIds(packPath, options.sectionId);
  if (sourceIds.length === 0) throw new NoSourcesGatheredError(options.sectionId);

  const adapters = options.extractors ?? defaultClaimExtractors();
  const extractor = await pickClaimExtractor(adapters);

  const claimsPath = join(packPath, 'sections', options.sectionId, 'claims.jsonl');
  const existingIds = await readExistingClaimIds(packPath, options.sectionId);

  const summary: ExtractClaimsSummary = {
    sectionId: options.sectionId,
    extractor: extractor.name,
    extractionMethod: '',
    sourcesProcessed: 0,
    sourcesSkipped: 0,
    sourcesFailed: 0,
    excerptLedgersBuilt: 0,
    claimsAdded: 0,
    claimsDeduped: 0,
    claimsRejectedUngrounded: 0,
    claimsRejectedExcerptIdMissing: 0,
    claimsRejectedExcerptIdMalformed: 0,
    claimsRejectedScopeMissing: 0,
    claimsRejectedExtractorParaphrase: 0,
    claimIds: [],
    failures: [],
  };

  for (const sourceId of sourceIds) {
    const card = await readSourceCard(packPath, sourceId);
    if (!card) {
      summary.sourcesSkipped += 1;
      continue;
    }
    const receipt = await findLatestReceipt(packPath, sourceId);
    let rawText: string | null = null;
    if (receipt?.raw_text_path) {
      const raw = join(packPath, receipt.raw_text_path);
      if (existsSync(raw)) {
        rawText = await readFile(raw, 'utf8');
      }
    }

    const ledger = await loadOrBuildLedger({
      packPath,
      sourceCard: card,
      sourceHash: receipt?.sha256 ?? null,
      rawText,
    });
    if (ledger.built) summary.excerptLedgersBuilt += 1;

    if (ledger.excerpts.length === 0) {
      // No spans available — extractor cannot produce span-first claims.
      summary.sourcesSkipped += 1;
      continue;
    }

    const result = await extractor.extract({
      sourceCard: card,
      sourceHash: receipt?.sha256 ?? null,
      excerpts: ledger.excerpts,
    });

    if (!result.ok) {
      summary.sourcesFailed += 1;
      summary.failures.push({ source_id: sourceId, reason: result.error });
      continue;
    }

    summary.sourcesProcessed += 1;
    summary.extractionMethod = result.method;

    const excerptIndex = buildExcerptIndex(ledger.excerpts);

    let writtenIndex = 0;
    for (let i = 0; i < result.claims.length; i += 1) {
      const draft = result.claims[i]!;
      const resolved = resolveExcerpts(draft.evidence_excerpt_ids, excerptIndex);
      if (!resolved.ok) {
        summary.claimsRejectedUngrounded += 1;
        if (resolved.failureMode === 'excerpt_id_missing') {
          summary.claimsRejectedExcerptIdMissing += 1;
        } else if (resolved.failureMode === 'excerpt_id_malformed') {
          summary.claimsRejectedExcerptIdMalformed += 1;
        }
        continue;
      }
      const claim = buildClaim({
        draft,
        evidenceText: resolved.evidenceText,
        resolvedExcerptIds: resolved.resolvedIds,
        index: writtenIndex,
        sectionId: options.sectionId,
        sourceId,
        sourceHash: receipt?.sha256 ?? null,
        extractor: extractor.name,
        extractionMethod: result.method,
      });
      writtenIndex += 1;
      if (existingIds.has(claim.claim_id)) {
        summary.claimsDeduped += 1;
        continue;
      }
      await appendFile(claimsPath, JSON.stringify(claim) + '\n', 'utf8');
      existingIds.add(claim.claim_id);
      summary.claimsAdded += 1;
      summary.claimIds.push(claim.claim_id);
    }
  }

  return summary;
}
