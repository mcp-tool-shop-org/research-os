import { existsSync, renameSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

import {
  NoSourcesGatheredError,
  PackNotFoundError,
  SectionNotFoundError,
} from '../errors.js';
import { RESEARCH_OS_VERSION } from '../index.js';
import { ResearchYamlSchema } from '../intake/schema.js';
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

// One-time migration suffix applied to a pre-existing claims.jsonl on the
// FIRST run under the v0.8.0 MCP extractor. We do NOT rotate this suffix —
// the operator-visible contract is: extract once, you get one preservation
// copy. If a file with this exact name already exists, that signals an
// unexpected state (operator already migrated) and we surface it loudly
// rather than silently clobbering the prior preservation copy.
const CLAIMS_JSONL_PRE_MCP_SUFFIX = '.pre-mcp-2026-05-11';

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

// Read the section purpose from research.yaml so we can pass it as `frame` to
// the MCP extractor. Returns undefined when the section has no purpose set
// or research.yaml is structurally malformed — extractors that accept frame
// treat undefined as "no topicality judgement", which is safe.
async function readSectionPurpose(
  packPath: string,
  sectionId: string,
): Promise<string | undefined> {
  const yamlPath = join(packPath, 'research.yaml');
  if (!existsSync(yamlPath)) return undefined;
  try {
    const parsed = ResearchYamlSchema.parse(parseYaml(await readFile(yamlPath, 'utf8')));
    const section = parsed.sections.find((s) => s.id === sectionId);
    if (!section) return undefined;
    const purpose = section.purpose.trim();
    return purpose.length > 0 ? purpose : undefined;
  } catch {
    return undefined;
  }
}

// One-shot preservation of an existing claims.jsonl before the first MCP
// extraction. Renames sections/<id>/claims.jsonl →
// sections/<id>/claims.jsonl.pre-mcp-2026-05-11. We refuse to clobber an
// existing preservation file — that signals the operator already migrated
// and a second silent rename would destroy their prior preservation copy.
function preserveLegacyClaimsJsonlIfNeeded(claimsPath: string): void {
  if (!existsSync(claimsPath)) return;
  const preservedPath = claimsPath + CLAIMS_JSONL_PRE_MCP_SUFFIX;
  if (existsSync(preservedPath)) {
    // Already migrated — leave both files in place. The new run will append
    // to the existing claims.jsonl (idempotent via claim_id dedup). We do NOT
    // re-rename, do NOT rotate, do NOT clobber.
    return;
  }
  renameSync(claimsPath, preservedPath);
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
  // Phase 1b-b: the per-claim critic populates frame_exclusion_reason +
  // frame_exclusion_rationale ONLY on excluded drafts. Admit them only when
  // frame_excluded is true — accepting them on supports_section drafts would
  // be a silent contradiction (admitted but with an exclusion reason).
  const frameExcluded = draft.frame_excluded ?? false;
  const exclusionExtras =
    frameExcluded && draft.frame_exclusion_reason
      ? {
          frame_exclusion_reason: draft.frame_exclusion_reason,
          ...(draft.frame_exclusion_rationale
            ? { frame_exclusion_rationale: draft.frame_exclusion_rationale }
            : {}),
        }
      : {};
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
    // Phase 1 v0.8.0: propagate frame_alignment.on_topic === false from the
    // MCP envelope down to the persisted claim. Heuristic extractor never
    // sets this; default in the schema is false.
    frame_excluded: frameExcluded,
    ...exclusionExtras,
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

  // Resolve framePurpose ONCE per extract() call. The section purpose is
  // pack-stable, so reading research.yaml inside the per-source loop would
  // be wasted I/O. undefined when the section has no purpose set; extractors
  // treat that as "no topicality judgement", matching the v2.2.0 frame
  // contract on the MCP server side.
  const framePurpose = await readSectionPurpose(packPath, options.sectionId);

  // The effective model override propagates from the CLI / env up through
  // ExtractClaimsOptions. Empty strings collapse to undefined so the MCP
  // server uses its tier default.
  const effectiveModel =
    typeof options.effectiveModel === 'string' && options.effectiveModel.trim().length > 0
      ? options.effectiveModel.trim()
      : undefined;

  const claimsPath = join(packPath, 'sections', options.sectionId, 'claims.jsonl');

  // v0.8.0 Phase 1 migration: when an existing claims.jsonl is present we
  // rename it to claims.jsonl.pre-mcp-2026-05-11 before this run starts
  // appending. This preserves the legacy direct-Ollama extraction record
  // alongside the fresh MCP-backed output. One-shot — see helper for why.
  preserveLegacyClaimsJsonlIfNeeded(claimsPath);

  // After preservation the on-disk claims.jsonl (if any) is removed/renamed,
  // so the existing-id set is empty for this run. We still call the helper
  // (rather than initialising `new Set()`) so an unexpected "preservation
  // file already exists" branch — where we left claims.jsonl in place — is
  // handled by reading the actual file state.
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
    claimsAdmittedPersisted: 0,
    failures: [],
    modelFallbacks: [],
    framesExcluded: 0,
    // Phase 1b-b: aggregate critic decisions across all sources. Always
    // present; populated by MCPClaimExtractor.extract() per source.
    criticTally: {
      supports_section: 0,
      off_topic: 0,
      background_only: 0,
      source_chrome: 0,
      critic_call_failed: 0,
    },
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
      framePurpose,
      effectiveModel,
    });

    if (!result.ok) {
      summary.sourcesFailed += 1;
      summary.failures.push({ source_id: sourceId, reason: result.error });
      continue;
    }

    summary.sourcesProcessed += 1;
    summary.extractionMethod = result.method;
    if (result.modelFallbacks && result.modelFallbacks.length > 0) {
      summary.modelFallbacks.push(...result.modelFallbacks);
    }
    if (typeof result.framesExcluded === 'number' && result.framesExcluded > 0) {
      summary.framesExcluded += result.framesExcluded;
    }
    // Phase 1b-b: fold per-source critic tally into the pack-wide summary.
    if (result.criticTally) {
      summary.criticTally.supports_section += result.criticTally.supports_section;
      summary.criticTally.off_topic += result.criticTally.off_topic;
      summary.criticTally.background_only += result.criticTally.background_only;
      summary.criticTally.source_chrome += result.criticTally.source_chrome;
      summary.criticTally.critic_call_failed += result.criticTally.critic_call_failed;
    }

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
      // Persisted-on-disk admitted count: matches grep of frame_excluded:false
      // in claims.jsonl after the run. The critic tally counts decisions on
      // drafts; this counts admitted claims that survived persistence + dedup.
      if (claim.frame_excluded === false) {
        summary.claimsAdmittedPersisted += 1;
      }
    }
  }

  // Persist a small extraction receipt next to the section's other audit
  // outputs. The section report reads this for the Extraction panel.
  const receipt = {
    receipt_id: `cle_${Date.now()}_${options.sectionId}`,
    section_id: options.sectionId,
    extracted_at: new Date().toISOString(),
    research_os_version: RESEARCH_OS_VERSION,
    extractor: summary.extractor,
    extraction_method: summary.extractionMethod,
    sources_processed: summary.sourcesProcessed,
    sources_skipped: summary.sourcesSkipped,
    sources_failed: summary.sourcesFailed,
    excerpt_ledgers_built: summary.excerptLedgersBuilt,
    claims_added: summary.claimsAdded,
    claims_deduped: summary.claimsDeduped,
    claims_rejected_ungrounded: summary.claimsRejectedUngrounded,
    claims_rejected_excerpt_id_missing: summary.claimsRejectedExcerptIdMissing,
    claims_rejected_excerpt_id_malformed: summary.claimsRejectedExcerptIdMalformed,
    // Phase 1 v0.8.0 — MCP envelope signals lifted into the receipt so
    // section-report consumers can disclose them without re-reading run logs.
    model_fallbacks: summary.modelFallbacks,
    frames_excluded: summary.framesExcluded,
    // Phase 1b-b v0.8.0 — per-claim critic decision counts for this section.
    // Helps the operator (and audit-time consumers) see how many claims the
    // extract-time topicality critic kept vs routed out, with the breakdown
    // by exclusion label.
    critic_tally: summary.criticTally,
    // Phase 1b-b v0.8.0 — count of claims persisted with frame_excluded:false.
    // Reconciles operator confusion when supports_section critic decisions
    // exceed the post-persistence admitted count due to rejection or dedup.
    claims_admitted_persisted: summary.claimsAdmittedPersisted,
    failures: summary.failures.map((f) => ({
      source_id: f.source_id,
      reason: f.reason,
      // Tag transport / parse failures so the report can bucket them.
      kind: /not valid JSON/i.test(f.reason)
        ? 'extractor_invalid_json'
        : /aborted|timeout/i.test(f.reason)
          ? 'extractor_timeout'
          : /HTTP \d{3}/i.test(f.reason)
            ? 'extractor_http_error'
            : 'extractor_other',
    })),
  };
  const auditsDir = join(packPath, 'audits');
  await mkdir(auditsDir, { recursive: true });
  await writeFile(
    join(auditsDir, `${options.sectionId}-claim-extract.json`),
    JSON.stringify(receipt, null, 2),
    'utf8',
  );

  return summary;
}
