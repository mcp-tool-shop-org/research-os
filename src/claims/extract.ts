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
import { readOverrides } from '../sources/source-card-overrides.js';
import { getEffectiveSeverities } from '../sources/effective-card.js';
import { detectSeverities, resolveSeverityThresholds } from '../sources/severities.js';
import {
  appendExtractCompletionRecord,
  formatProgressLine,
  getCompletedSourceIdsForSection,
  getNextExtractionAttempt,
  readExtractCompletionLedger,
} from './extract-completion-ledger.js';
import {
  defaultClaimExtractors,
  pickClaimExtractorWithDegradation,
} from './extractors/index.js';
import { appendRescueLedgerRecord } from './rescue-ledger.js';
import { ClaimSchema, type Claim } from './schema.js';
import {
  formatExtractTierBudgetLogLine,
  type ClaimExtractor,
  type DraftClaim,
  type ExtractClaimsOptions,
  type ExtractClaimsSummary,
  type ExtractTierBudgetSource,
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

// v0.10 Slice 3 — read the optional `audit.severity_thresholds` block from
// research.yaml so claim extraction's severity-detection pass uses the same
// thresholds as `source-card audit`. Absence / malformed YAML returns
// undefined, falling back to DEFAULT_SEVERITY_THRESHOLDS.
async function readAuditSeverityThresholdsConfig(packPath: string) {
  const yamlPath = join(packPath, 'research.yaml');
  if (!existsSync(yamlPath)) return undefined;
  try {
    const parsed = ResearchYamlSchema.parse(parseYaml(await readFile(yamlPath, 'utf8')));
    return parsed.audit?.severity_thresholds;
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

// A-CLAIMS-003 — normalize a claim's `asserts` for content-level dedup. The
// claim_id encodes a per-run writtenIndex, so claim_id-only dedup misses a
// content duplicate produced by a non-resume re-extract (which appends the
// same assertion under a fresh ID). Normalizing on whitespace + case mirrors
// the in-extractor window-dedup key (extractors/mcp.ts) so the two dedup
// layers agree on what "the same claim" means.
function normalizeAssertForDedup(asserts: string): string {
  return asserts.toLowerCase().replace(/\s+/g, ' ').trim();
}

// A-CLAIMS-003 — seed the content-dedup set from any claims already on disk
// for this section (e.g. a prior --resume run, or a re-extract where the
// pre-mcp preservation branch left claims.jsonl in place). Empty when no file
// exists. Lines that fail to parse are tolerated (skipped) — this set is an
// optimization for dedup, not an authority on file contents.
async function readExistingAssertKeys(
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
      const obj = JSON.parse(line) as { asserts?: string };
      if (typeof obj.asserts === 'string') {
        set.add(normalizeAssertForDedup(obj.asserts));
      }
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
  // v0.12 Slice 1 (R-012) — propagate rescue fields from the draft to the
  // persisted claim. rescue_status / rescue_eligibility_check are set
  // whenever the R-012 stage ran (i.e., every source_content_mismatch
  // draft). rescue_boundary is set only on rescues (rescue_status=
  // rescued_by_llm). The transient rescue_scope / rescue_reason on the
  // draft do NOT flow to the claim — they go straight to the ledger.
  const rescueExtras: Record<string, unknown> = {};
  if (draft.rescue_status !== undefined) {
    rescueExtras.rescue_status = draft.rescue_status;
  }
  if (draft.rescue_eligibility_check !== undefined) {
    rescueExtras.rescue_eligibility_check = draft.rescue_eligibility_check;
  }
  if (draft.rescue_boundary !== undefined) {
    rescueExtras.rescue_boundary = draft.rescue_boundary;
  }
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
    ...rescueExtras,
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

  // v0.12 Slice 4 (R-015) — read the per-source completion ledger once.
  // --resume filters the section's source list to those whose successful
  // extraction is NOT already recorded. --progress (without --resume)
  // emits per-source stderr lines but processes every source. The ledger
  // is written on success regardless of either flag (always-on artifact;
  // flags only change CONSUMPTION).
  const completionRecords = await readExtractCompletionLedger(packPath);
  const completedSourceIds = options.resume
    ? getCompletedSourceIdsForSection(completionRecords, options.sectionId)
    : new Set<string>();
  const progressEmit = options.progress
    ? options.progressStream ?? ((line: string) => process.stderr.write(line + '\n'))
    : null;

  const adapters = options.extractors ?? defaultClaimExtractors();
  const pick = await pickClaimExtractorWithDegradation(adapters);
  const extractor = pick.extractor;
  // B-CLAIMS-002 — when the MCP extractor was first preference but unavailable
  // and we fell through to the deterministic heuristic, the entire topicality
  // defense floor (frame critic / source-content guard / R-012 rescue) is
  // bypassed: every claim is admitted with frame_excluded=false. Emit ONE
  // contrastive run-start warning (you probably expected MCP topicality
  // enforcement; you're getting none) so the operator isn't silently surprised
  // by an unfiltered claim set. The neutral `extractor` receipt field alone did
  // not communicate the lost enforcement. Happy path (MCP available) emits
  // nothing — byte-identical pre-hardening behavior.
  const degradedToHeuristic = pick.degradedToHeuristic;
  if (degradedToHeuristic) {
    process.stderr.write(
      '[extract] WARNING: ollama-intern MCP extractor unavailable; degraded to heuristic — ' +
        'frame critic / source-content guard / rescue NOT applied; claims admitted without ' +
        'topicality enforcement\n',
    );
  }

  // Resolve framePurpose ONCE per extract() call. The section purpose is
  // pack-stable, so reading research.yaml inside the per-source loop would
  // be wasted I/O. undefined when the section has no purpose set; extractors
  // treat that as "no topicality judgement", matching the v2.2.0 frame
  // contract on the MCP server side.
  const framePurpose = await readSectionPurpose(packPath, options.sectionId);

  // v0.10 Slice 3 — load override ledger + per-pack severity thresholds
  // once per extract() call. Both are pack-stable.
  const overrides = await readOverrides(packPath);
  const severityThresholds = resolveSeverityThresholds(
    await readAuditSeverityThresholdsConfig(packPath),
  );

  // The effective model override propagates from the CLI / env up through
  // ExtractClaimsOptions. Empty strings collapse to undefined so the MCP
  // server uses its tier default.
  const effectiveModel =
    typeof options.effectiveModel === 'string' && options.effectiveModel.trim().length > 0
      ? options.effectiveModel.trim()
      : undefined;

  // R-024 (v0.13.1) — resolve the active extract tier-budget from
  // ExtractClaimsOptions. CLI surface (cli.ts) calls resolveExtractTierBudget(...)
  // and forwards the already-resolved numeric value + source. When options
  // omit both fields (legacy callers / unit tests), default to undefined /
  // 'default' which preserves byte-identical pre-R-024 behavior (no
  // tier_budget_ms_override on toolArgs; ollama-intern-mcp profile defaults
  // govern).
  const tierBudgetMs = options.tierBudgetMs;
  const tierBudgetSource: ExtractTierBudgetSource = options.tierBudgetSource ?? 'default';
  // R-024 — single-line, grep-friendly stderr summary of the active
  // tier-budget configuration BEFORE the per-source loop begins. Operators
  // can `2>&1 | grep tier_budget_ms=` to see what budget was in effect.
  // Mirrors R-018's `[synth] planner_timeout_ms=…` pattern.
  process.stderr.write(
    `${formatExtractTierBudgetLogLine(tierBudgetMs, tierBudgetSource)} section=${options.sectionId}\n`,
  );
  // R-024 — propagate the override into the per-source ClaimExtractionInput
  // only when the operator opted in (source !== 'default'). On the default
  // path we pass undefined so MCPClaimExtractor omits tier_budget_ms_override
  // from toolArgs — ollama-intern-mcp's per-tier profile timeouts govern
  // byte-identically.
  const tierBudgetMsOverride: number | undefined =
    tierBudgetSource === 'default' ? undefined : tierBudgetMs;

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
  // A-CLAIMS-003 — content-level dedup keys, seeded from claims already on
  // disk and grown as we append within this run. Prevents a non-resume
  // re-extract from appending the same assertion under a fresh claim_id.
  const existingAssertKeys = await readExistingAssertKeys(packPath, options.sectionId);

  const summary: ExtractClaimsSummary = {
    sectionId: options.sectionId,
    extractor: extractor.name,
    extractionMethod: '',
    sourcesProcessed: 0,
    sourcesSkipped: 0,
    sourcesFailed: 0,
    sourcesSkippedByResume: 0,
    excerptLedgersBuilt: 0,
    claimsAdded: 0,
    claimsDeduped: 0,
    claimsRejectedUngrounded: 0,
    claimsRejectedExcerptIdMissing: 0,
    claimsRejectedExcerptIdMalformed: 0,
    claimIds: [],
    claimsAdmittedPersisted: 0,
    failures: [],
    modelFallbacks: [],
    framesExcluded: 0,
    // B-CLAIMS-001 — pack-wide count of windows that failed on otherwise-ok
    // per-source extractions (partial-window failure). Drives the
    // completion-ledger withhold below so --resume recovers dropped windows.
    windowsFailed: 0,
    // B-CLAIMS-002 — whether this run degraded from the MCP extractor to the
    // heuristic fallback (topicality defense floor bypassed). Resolved at pick
    // time above.
    degradedToHeuristic,
    // Phase 1b-b: aggregate critic decisions across all sources. Always
    // present; populated by MCPClaimExtractor.extract() per source.
    criticTally: {
      supports_section: 0,
      off_topic: 0,
      background_only: 0,
      source_chrome: 0,
      critic_call_failed: 0,
    },
    // R-024 (v0.13.1) — active tier-budget metadata. tierBudgetMs is omitted
    // (undefined) on default-path runs so the summary stays minimal; presence
    // signals "operator opted in" with unambiguous semantics.
    ...(tierBudgetMs !== undefined ? { tierBudgetMs } : {}),
    ...(tierBudgetSource !== 'default'
      ? { tierBudgetOverriddenBy: tierBudgetSource }
      : {}),
  };

  // v0.12 Slice 4 (R-015) — partition source IDs into (resume-skipped,
  // toProcess) BEFORE the loop so the [extract N/M] counter reflects the
  // post-filter position. Skip emission happens here (once per skipped
  // source) — the inner loop processes only the toProcess list.
  const toProcess: string[] = [];
  for (const sourceId of sourceIds) {
    if (completedSourceIds.has(sourceId)) {
      summary.sourcesSkippedByResume += 1;
      if (progressEmit) {
        // Find the most recent completion entry for this (section, source)
        // so the [skip] line carries a real "already extracted at" timestamp.
        const latest = completionRecords
          .filter((r) => r.section_id === options.sectionId && r.source_id === sourceId)
          .sort((a, b) => (a.completed_at > b.completed_at ? -1 : 1))[0];
        const detail = latest ? `already extracted at ${latest.completed_at}` : 'already extracted';
        progressEmit(formatProgressLine('skip', 0, 0, sourceId, detail));
      }
      continue;
    }
    toProcess.push(sourceId);
  }
  const totalToProcess = toProcess.length;

  for (let processIdx = 0; processIdx < toProcess.length; processIdx += 1) {
    const sourceId = toProcess[processIdx]!;
    const progressN = processIdx + 1;
    const startNs = Date.now();
    if (progressEmit) {
      progressEmit(formatProgressLine('start', progressN, totalToProcess, sourceId));
    }

    // Per-source outcome bookkeeping for the terminal progress line + the
    // completion ledger. Only success appends to the ledger; the other
    // three terminal states (gate-skip, extractor-fail, no-record) leave
    // the ledger untouched so the source is re-attempted on --resume.
    let perSourceClaimsAdded = 0;
    let outcome: 'processed' | 'skipped' | 'failed' = 'processed';
    let failureDetail: string | null = null;
    let skipReason: string | null = null;
    // B-CLAIMS-001 — set when an ok:true extraction reported windowsFailed > 0
    // (some ledger windows succeeded, others dropped their claims). On a
    // partial-window failure we withhold the completion-ledger entry so the
    // source is re-attempted on --resume and the dropped windows' claims are
    // recovered, rather than being permanently skipped as fully 'processed'.
    let partialWindowFailure = false;

    const card = await readSourceCard(packPath, sourceId);
    if (!card) {
      outcome = 'skipped';
      skipReason = 'no source card';
      summary.sourcesSkipped += 1;
    }

    let receipt: FetchReceipt | null = null;
    let rawText: string | null = null;
    if (outcome === 'processed' && card) {
      receipt = await findLatestReceipt(packPath, sourceId);
      if (receipt?.raw_text_path) {
        const raw = join(packPath, receipt.raw_text_path);
        if (existsSync(raw)) {
          rawText = await readFile(raw, 'utf8');
        }
      }

      // v0.10 Slice 3 (R-003 + R-005) — quarantine sources with effective
      // severities. detectSeverities is pure; getEffectiveSeverities applies
      // the operator's clear_severities[] overrides. Both R-003
      // (bot_check_or_captcha_detected, HARD FAIL) and R-005
      // (extraction_suspect_word_count_mismatch, WARN AND QUARANTINE) block
      // claim extraction by default. Operator override lifts the quarantine.
      const rawSeverities = detectSeverities({
        card,
        rawText,
        byteCount: receipt?.byte_count ?? null,
        contentType: receipt?.content_type ?? null,
        fetchDurationMs: receipt?.fetch_duration_ms ?? null,
        thresholds: severityThresholds,
      });
      const effectiveSeverities = getEffectiveSeverities(card, rawSeverities, overrides);
      if (effectiveSeverities.length > 0) {
        outcome = 'skipped';
        skipReason = `severity: ${effectiveSeverities.map((s) => s.severity).join(',')}`;
        summary.sourcesSkipped += 1;
      }
    }

    if (outcome === 'processed' && card) {
      const ledger = await loadOrBuildLedger({
        packPath,
        sourceCard: card,
        sourceHash: receipt?.sha256 ?? null,
        rawText,
      });
      if (ledger.built) summary.excerptLedgersBuilt += 1;

      if (ledger.excerpts.length === 0) {
        // No spans available — extractor cannot produce span-first claims.
        outcome = 'skipped';
        skipReason = 'no excerpts';
        summary.sourcesSkipped += 1;
      } else {
        const result = await extractor.extract({
          sourceCard: card,
          sourceHash: receipt?.sha256 ?? null,
          excerpts: ledger.excerpts,
          framePurpose,
          effectiveModel,
          // v0.11 Slice 3 (R-011) — pass the fetched body text so the MCP
          // extractor can compute the source-content topical signature once
          // per source. Heuristic extractor ignores this field; the MCP
          // extractor short-circuits the LLM critic call on signature
          // mismatch. Optional null when no raw text is available.
          sourceRawText: rawText,
          // R-024 (v0.13.1) — per-call tier-budget override forwarded to
          // EVERY ollama_extract call inside the MCP extractor (extractOnePage
          // + runCritic + runRescueCritic). undefined preserves byte-identical
          // pre-R-024 behavior. The heuristic extractor ignores this field.
          tierBudgetMsOverride,
        });

        if (!result.ok) {
          outcome = 'failed';
          failureDetail = result.error;
          summary.sourcesFailed += 1;
          summary.failures.push({ source_id: sourceId, reason: result.error });
        } else {
          summary.sourcesProcessed += 1;
          summary.extractionMethod = result.method;
          if (result.modelFallbacks && result.modelFallbacks.length > 0) {
            summary.modelFallbacks.push(...result.modelFallbacks);
          }
          if (typeof result.framesExcluded === 'number' && result.framesExcluded > 0) {
            summary.framesExcluded += result.framesExcluded;
          }
          // B-CLAIMS-001 — a partial-window failure: the extractor returned
          // ok:true (≥1 window succeeded) but reported windowsFailed > 0,
          // meaning other windows dropped their claims (TIER_TIMEOUT /
          // transport / parse). Fold the count into the pack-wide summary and
          // record a failure entry per dropped window so the receipt and the
          // [extract] summary surface the loss. The withhold of the
          // completion-ledger entry below makes --resume re-attempt this
          // source to recover the dropped windows' claims.
          if (typeof result.windowsFailed === 'number' && result.windowsFailed > 0) {
            summary.windowsFailed += result.windowsFailed;
            partialWindowFailure = true;
            const winErrors = result.pageErrors ?? [];
            for (const err of winErrors) {
              summary.failures.push({
                source_id: sourceId,
                reason: `partial window failure (claims dropped, source will re-attempt on --resume): ${err}`,
              });
            }
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
            // A-CLAIMS-003 — content-level dedup. claim_id encodes a per-run
            // writtenIndex, so a non-resume re-extract produces a NEW id for
            // the same assertion and would slip past the claim_id check above.
            // Skip the append when this normalized assert was already persisted
            // (either on disk before this run or earlier in this run).
            const assertKey = normalizeAssertForDedup(claim.asserts);
            if (existingAssertKeys.has(assertKey)) {
              summary.claimsDeduped += 1;
              continue;
            }
            await appendFile(claimsPath, JSON.stringify(claim) + '\n', 'utf8');
            existingIds.add(claim.claim_id);
            existingAssertKeys.add(assertKey);
            summary.claimsAdded += 1;
            perSourceClaimsAdded += 1;
            summary.claimIds.push(claim.claim_id);
            // Persisted-on-disk admitted count: matches grep of frame_excluded:false
            // in claims.jsonl after the run. The critic tally counts decisions on
            // drafts; this counts admitted claims that survived persistence + dedup.
            if (claim.frame_excluded === false) {
              summary.claimsAdmittedPersisted += 1;
            }
            // v0.12 Slice 1 (R-012) — write the LLM rescue ledger entry for
            // every rescued_by_llm claim. The draft carries the transient
            // rescue_scope / rescue_reason; combined with the persisted claim's
            // rescue_status / rescue_eligibility_check / rescue_boundary, this
            // forms the full RescueLedgerRecord. "No silent rescue" invariant:
            // every claim that goes frame_excluded:true → false via R-012 gets
            // a witnessed ledger entry written here. Operator rescues write
            // their own ledger entries from the operator CLI surface.
            if (
              claim.rescue_status === 'rescued_by_llm' &&
              claim.rescue_eligibility_check &&
              claim.rescue_boundary &&
              draft.rescue_scope &&
              draft.rescue_reason
            ) {
              await appendRescueLedgerRecord(packPath, {
                claim_id: claim.claim_id,
                section_id: claim.section_id,
                original_exclusion_reason: 'source_content_mismatch',
                eligibility_check: claim.rescue_eligibility_check,
                rescue_status: 'rescued_by_llm',
                rescue_scope: draft.rescue_scope,
                rescue_reason: draft.rescue_reason,
                rescue_boundary: claim.rescue_boundary,
                rescued_by: 'llm',
                rescued_at: claim.created_at,
                operator: null,
                research_os_version: RESEARCH_OS_VERSION,
              });
            }
          }
        }
      }
    }

    const durationMs = Date.now() - startNs;

    // v0.12 Slice 4 (R-015) — write a completion ledger entry on successful
    // extraction (regardless of --resume / --progress flags). Failed
    // extractions and gate-skipped sources do NOT write — they re-evaluate
    // on the next run. The ledger is the always-on substrate that --resume
    // consumes; the flags only change observation/visibility.
    if (outcome === 'processed' && !partialWindowFailure) {
      const attempt = getNextExtractionAttempt(
        completionRecords,
        options.sectionId,
        sourceId,
      );
      await appendExtractCompletionRecord(packPath, {
        source_id: sourceId,
        section_id: options.sectionId,
        completed_at: new Date().toISOString(),
        claim_count: perSourceClaimsAdded,
        extraction_attempt: attempt,
        research_os_version: RESEARCH_OS_VERSION,
        duration_ms: durationMs,
      });
    }

    if (progressEmit) {
      if (outcome === 'processed') {
        progressEmit(
          formatProgressLine(
            'done',
            progressN,
            totalToProcess,
            sourceId,
            `${perSourceClaimsAdded} claims in ${durationMs}ms`,
          ),
        );
      } else if (outcome === 'skipped') {
        progressEmit(
          formatProgressLine(
            'done',
            progressN,
            totalToProcess,
            sourceId,
            `skipped (${skipReason ?? 'unknown'}) in ${durationMs}ms`,
          ),
        );
      } else {
        progressEmit(
          formatProgressLine(
            'fail',
            progressN,
            totalToProcess,
            sourceId,
            `${failureDetail ?? 'unknown error'} in ${durationMs}ms`,
          ),
        );
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
    // B-CLAIMS-001 — count of ledger windows that failed on otherwise-ok
    // per-source extractions (partial-window failure). When > 0, the affected
    // sources were NOT recorded in the completion ledger and re-attempt on
    // `claim extract --resume`. Zero on a clean run (receipt stays informative
    // without changing the locked happy-path shape).
    windows_failed: summary.windowsFailed,
    // B-CLAIMS-002 — whether the run degraded to the heuristic extractor
    // (topicality defense floor bypassed). false on the happy path so the
    // additive field stays informative without altering the locked shape.
    degraded_to_heuristic: summary.degradedToHeuristic,
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
    // R-024 (v0.13.1) — active extract tier-budget for this run, surfaced in
    // the receipt at `audits/<section>-claim-extract.json` so post-hoc audit
    // consumers see what budget governed every ollama_extract call. snake_case
    // keys match the receipt's existing field convention. Both fields are
    // omitted on default-path runs (no operator override) so the receipt
    // shape stays byte-identical to pre-R-024 default extracts.
    ...(tierBudgetMs !== undefined ? { tier_budget_ms: tierBudgetMs } : {}),
    ...(tierBudgetSource !== 'default'
      ? { tier_budget_overridden_by: tierBudgetSource }
      : {}),
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
