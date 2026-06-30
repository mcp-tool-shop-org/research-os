import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

import {
  NoUrlsProvidedError,
  PackNotFoundError,
  SectionNotFoundError,
} from '../errors.js';
import { emitProgress } from '../util/progress.js';
import { fetchOnce } from './fetch.js';
import { collectUrls } from './url-input.js';
import { defaultExtractors, pickExtractor } from './extractors/index.js';
import {
  appendFetchLog,
  buildCard,
  createSectionSourceIdAppender,
  writeSourceCard,
} from './cards.js';
import { readOverrides } from './source-card-overrides.js';
import { BOT_CHECK_MARKERS, DEFAULT_SEVERITY_THRESHOLDS } from './severities.js';
import type { FetchReceipt, GatherOutcomeSchema } from './schema.js';
import type { z } from 'zod';
import type { GatherOptions, GatherSummary, Extractor } from './types.js';

type GatherOutcome = z.infer<typeof GatherOutcomeSchema>;

function urlHash12(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 12);
}

/**
 * v0.10 Slice 4 — gather-layer light bot-check detection.
 *
 * Mirrors R-003 Signal A (marker substring + body word count below
 * `maxBodyWordsWithMarker`). This is the "duplicate light detection at fetch
 * time" branch of the integration decision: the operator sees
 * `bot_check_detected` immediately in the gather progress + fetch-log.jsonl
 * gather_outcome, before extraction has a chance to confabulate a rich card
 * from the fragment. Audit-layer R-003 in source-card-audit stays unchanged
 * and authoritative for full multi-signal detection + per-pack thresholds.
 *
 * The threshold defaults to DEFAULT_SEVERITY_THRESHOLDS.botCheck — the same
 * value R-003 uses unless overridden. Drift risk is bounded: both layers fire
 * on the canonical Incapsula case; if a pack raises its audit threshold and
 * R-003 stops firing, the gather-layer detection still surfaces an
 * informational flag that the operator can ignore via the existing
 * source-card override ledger (clear_severities[]).
 */
function rawBodyProseWordCount(rawText: string): number {
  const noScripts = rawText
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const normalized = noScripts.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return 0;
  return normalized.split(' ').length;
}

interface BotCheckGatherSignal {
  detected: boolean;
  reasons: string[];
}

function detectBotCheckAtGather(rawText: string | null): BotCheckGatherSignal {
  if (rawText === null || rawText.length === 0) {
    return { detected: false, reasons: [] };
  }
  const lower = rawText.toLowerCase();
  const markerHits: string[] = [];
  for (const m of BOT_CHECK_MARKERS) {
    if (lower.includes(m.needle)) markerHits.push(`marker:${m.key}`);
  }
  if (markerHits.length === 0) return { detected: false, reasons: [] };
  const proseWords = rawBodyProseWordCount(rawText);
  const ceiling = DEFAULT_SEVERITY_THRESHOLDS.botCheck.maxBodyWordsWithMarker;
  if (proseWords > ceiling) return { detected: false, reasons: [] };
  return {
    detected: true,
    reasons: [...markerHits, `body_words=${proseWords}`],
  };
}

/**
 * v0.10 Slice 4 — derive the operator-facing rollup status from the receipt
 * + rawText + bot-check signal. Precedence:
 *   fetch_failed > bot_check_detected > extraction_failed > extraction_skipped > ok
 */
function deriveGatherOutcome(
  receipt: FetchReceipt,
  rawText: string | null,
  botCheck: BotCheckGatherSignal,
): GatherOutcome {
  if (receipt.fetch_outcome !== 'ok') return 'fetch_failed';
  if (botCheck.detected) return 'bot_check_detected';
  if (receipt.extraction_outcome === 'failed') return 'extraction_failed';
  if (rawText === null || receipt.extraction_outcome === 'skipped') {
    return 'extraction_skipped';
  }
  return 'ok';
}

function buildSyntheticFailureReceipt(
  url: string,
  sectionId: string,
  errorMessage: string,
): FetchReceipt {
  const fetchedAt = new Date();
  const sourceId = `src_${urlHash12(url)}`;
  const receiptId = `rcpt_${sourceId.replace(/^src_/, '')}_${fetchedAt.getTime()}`;
  return {
    receipt_id: receiptId,
    source_id: sourceId,
    section_id: sectionId,
    requested_url: url,
    final_url: null,
    status: null,
    status_text: null,
    content_type: null,
    fetched_at: fetchedAt.toISOString(),
    byte_count: null,
    sha256: null,
    title: null,
    raw_text_path: null,
    fetch_outcome: 'network_error',
    fetch_error: `gather write failed: ${errorMessage}`,
    extraction_outcome: 'skipped',
    extraction_extractor: null,
    extraction_error: null,
    gather_outcome: 'fetch_failed',
  };
}

export async function gather(options: GatherOptions): Promise<GatherSummary> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  if (!existsSync(join(packPath, 'research.yaml'))) throw new PackNotFoundError(packPath);
  if (!existsSync(join(packPath, 'sections', options.sectionId)))
    throw new SectionNotFoundError(options.sectionId);

  const { urls } = await collectUrls({ urls: options.urls, urlsFile: options.urlsFile });
  if (urls.length === 0) throw new NoUrlsProvidedError();

  const extractorList: Extractor[] = options.extractors ?? defaultExtractors();
  const extractor = await pickExtractor(extractorList);

  // Load override ledger once before the fetch loop (Component A, v0.4).
  // F-27 closure: overrides are applied at card-write time so re-gather of an
  // existing source_id cannot silently revert an operator correction.
  const overrides = await readOverrides(packPath);

  const summary: GatherSummary = {
    sectionId: options.sectionId,
    attempted: urls.length,
    fetchedOk: 0,
    fetchedFailed: 0,
    extractedOk: 0,
    extractedFailed: 0,
    cardsWritten: 0,
    receiptsAppended: 0,
    sourceIds: [],
  };

  // A-008 — open the section-source-id appender once before the loop so the
  // sources.jsonl file is read at most once per gather() call (was O(N²)).
  const sourceIdAppender = await createSectionSourceIdAppender(packPath, options.sectionId);

  let urlIndex = 0;
  for (const url of urls) {
    urlIndex += 1;
    // C2-005: per-URL stderr progress line. TTY-gated through emitProgress so
    // a piped run / non-interactive shell stays silent and stdout is untouched.
    emitProgress(`Gathering ${urlIndex}/${urls.length} ${url}`);
    // B-A-001 — per-URL try/catch. fetchOnce can throw if it raises through
    // SSRF DNS lookup, writeFile of evidence/raw/<sid>.<ext> fails for
    // disk-full/EACCES/EROFS/AV-quarantine, etc. writeSourceCard +
    // appendFetchLog can throw the same way. Any uncaught throw here would
    // (a) skip appendFetchLog for the failing URL — fetch receipt is gone,
    // (b) abort the loop for remaining URLs, (c) drop already-queued
    // source_ids because the deferred sourceIdAppender.flush() at the end
    // of the loop never runs. Half-gathered section: cards on disk that
    // indexer + gates will not see.
    //
    // Recovery contract: on exception, append a synthetic FetchReceipt
    // (fetch_outcome='network_error', fetch_error='gather write failed: …')
    // so the failed URL is recorded; immediately flush the source-id
    // appender so prior successful URLs become durable before the next
    // iteration; continue with the next URL. The successful path stays
    // unchanged — single flush() at end of loop preserves the A-008
    // batched-append win on the happy path.
    // B-A-001 — track per-iteration counter deltas so we can roll back any
    // increments that happened before a downstream throw. Without this, a
    // throw after `summary.fetchedOk += 1` would leave fetchedOk too high
    // AND increment fetchedFailed below, double-counting the URL.
    const delta = {
      fetchedOk: 0,
      fetchedFailed: 0,
      extractedOk: 0,
      extractedFailed: 0,
      cardsWritten: 0,
      sourceIdsAddedCount: 0,
    };
    // A-SOURCES-002 — defer the sources.jsonl appender enqueue + summary push
    // until AFTER appendFetchLog succeeds. Previously add()/push() ran before
    // appendFetchLog; if appendFetchLog threw, the catch popped
    // summary.sourceIds but the appender's queued id still flushed to
    // sources.jsonl on the next iteration — leaving a card referenced by
    // sources.jsonl whose only receipt says the fetch failed. Holding the id
    // here and enqueueing post-receipt keeps the two records consistent.
    let pendingSourceId: string | null = null;
    try {
      const { receipt, rawText } = await fetchOnce(url, {
        sectionId: options.sectionId,
        packPath,
        fetchImpl: options.fetchImpl,
        maxBytes: options.maxBytes,
        timeoutMs: options.timeoutMs,
        unsafeAllowAllHosts: options.unsafeAllowAllHosts,
      });

      let receiptToWrite = receipt;

      // v0.10 Slice 4 — light bot-check detection at gather time. Operates on
      // the raw fetched body BEFORE extraction so the operator-facing
      // gather_outcome surfaces bot-check signatures at the earliest point.
      // Detection is informational; the extraction pipeline still runs and
      // R-003 at the audit layer remains the authoritative quarantine.
      const botCheck = detectBotCheckAtGather(rawText);

      if (receipt.fetch_outcome === 'ok' && rawText !== null) {
        delta.fetchedOk = 1;
        const result = await extractor.extract({
          url,
          finalUrl: receipt.final_url,
          rawText,
          contentType: receipt.content_type,
        });
        if (result.ok) {
          delta.extractedOk = 1;
          receiptToWrite = {
            ...receipt,
            extraction_outcome: 'ok',
            extraction_extractor: extractor.name,
            extraction_error: null,
          };
          const card = buildCard({ receipt: receiptToWrite, extraction: result, extractedBy: extractor.name, overrides });
          await writeSourceCard(packPath, card);
          delta.cardsWritten = 1;
          // A-SOURCES-002 — do NOT enqueue the source_id yet. The card JSON is
          // on disk, but it must not be referenced by sources.jsonl until its
          // fetch receipt is durably appended below. Hold the id; flush it into
          // the appender + summary only after appendFetchLog succeeds.
          pendingSourceId = card.source_id;
        } else {
          delta.extractedFailed = 1;
          receiptToWrite = {
            ...receipt,
            extraction_outcome: 'failed',
            extraction_extractor: extractor.name,
            extraction_error: result.error,
          };
        }
      } else {
        delta.fetchedFailed = 1;
      }

      // v0.10 Slice 4 — compute the operator-facing rollup status AFTER
      // receiptToWrite is finalized; attach it to the persisted receipt and
      // emit a single honest progress line keyed off the status. Replaces
      // the conflated `"Failed (ok HTTP 200)"` phrasing observed in
      // operator-aloneness DST gate v0.1 (2026-05-15).
      const gatherOutcome = deriveGatherOutcome(receiptToWrite, rawText, botCheck);
      receiptToWrite = { ...receiptToWrite, gather_outcome: gatherOutcome };

      switch (gatherOutcome) {
        case 'ok':
          // Successful end-to-end. The "Gathering N/M" line already announced
          // the URL; no second line needed.
          break;
        case 'fetch_failed': {
          const code = receiptToWrite.status !== null ? ` HTTP ${receiptToWrite.status}` : '';
          emitProgress(
            `  ! fetch_failed (${receiptToWrite.fetch_outcome}${code}) — receipt recorded for ${url}`,
          );
          break;
        }
        case 'extraction_skipped': {
          // Fetch succeeded (HTTP 200) but the extraction layer is not
          // applicable for this content type (PDF, image, other binary).
          // Honest phrasing — this is NOT a failure, it's an unhandled
          // content path. The receipt is recorded for audit.
          const ct = receiptToWrite.content_type ?? 'unknown';
          emitProgress(
            `  · extraction_skipped (content_type=${ct}; extractor not applicable) — receipt recorded for ${url}`,
          );
          break;
        }
        case 'extraction_failed': {
          const err = receiptToWrite.extraction_error ?? 'unknown extraction error';
          emitProgress(
            `  ! extraction_failed (${err}) — receipt recorded for ${url}`,
          );
          break;
        }
        case 'bot_check_detected': {
          const detail = botCheck.reasons.join(', ');
          emitProgress(
            `  ! bot_check_detected (${detail}) — receipt recorded for ${url}`,
          );
          break;
        }
      }

      await appendFetchLog(packPath, receiptToWrite);
      summary.receiptsAppended += 1;
      // A-SOURCES-002 — the receipt is now durable. Only NOW is it safe to
      // reference this card from sources.jsonl. Enqueue + record the id.
      if (pendingSourceId !== null) {
        sourceIdAppender.add(pendingSourceId);
        delta.sourceIdsAddedCount = 1;
        summary.sourceIds.push(pendingSourceId);
      }
      // Commit per-iteration deltas only after the appendFetchLog write.
      summary.fetchedOk += delta.fetchedOk;
      summary.fetchedFailed += delta.fetchedFailed;
      summary.extractedOk += delta.extractedOk;
      summary.extractedFailed += delta.extractedFailed;
      summary.cardsWritten += delta.cardsWritten;
    } catch (err) {
      // C2-005 / C2-006: name the failing URL on stderr inline so the operator
      // sees WHICH URL just failed without grep'ing fetch-log.jsonl after the
      // run. Best-effort error class extraction (constructor name) so the
      // line tells the operator what kind of failure it was. v0.10 Slice 4 —
      // surface the rollup status name (`fetch_failed`) so the progress line
      // vocabulary matches gather_outcome on the persisted receipt.
      const errClass = err instanceof Error ? err.constructor.name : 'Error';
      const errMsg = err instanceof Error ? err.message : String(err);
      emitProgress(`  ! fetch_failed (${errClass}: ${errMsg}) — receipt recorded for ${url}`);
      // Roll back: deltas were never committed. The card may have been
      // pushed to summary.sourceIds before a downstream throw — pop it back
      // off to keep the array consistent with cardsWritten.
      if (delta.sourceIdsAddedCount > 0) {
        summary.sourceIds.length -= delta.sourceIdsAddedCount;
      }
      // Best-effort durability: flush any queued source_ids from earlier
      // successful URLs BEFORE we record the failure receipt, so prior work
      // is durable even if the synthetic-receipt append itself also fails.
      try {
        await sourceIdAppender.flush();
      } catch {
        // If the appender flush itself fails we have nothing else to do —
        // the next iteration's own flush attempt (or the post-loop flush)
        // will retry. We must not let this swallow the original error path.
      }
      const errorMessage = err instanceof Error ? err.message : String(err);
      const syntheticReceipt = buildSyntheticFailureReceipt(
        url,
        options.sectionId,
        errorMessage,
      );
      try {
        await appendFetchLog(packPath, syntheticReceipt);
        summary.receiptsAppended += 1;
      } catch {
        // If even the failure-receipt append fails, there is no durable
        // record we can write for this URL. Counting it as fetchedFailed
        // is the best we can do.
      }
      summary.fetchedFailed += 1;
      continue;
    }
  }

  // A-008 — single batched append of all queued source_ids (happy path).
  // Per-exception flushes inside the catch above keep partial-progress
  // durable when individual iterations throw.
  await sourceIdAppender.flush();

  return summary;
}
