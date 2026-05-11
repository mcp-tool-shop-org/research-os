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
import type { FetchReceipt } from './schema.js';
import type { GatherOptions, GatherSummary, Extractor } from './types.js';

function urlHash12(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 12);
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
          sourceIdAppender.add(card.source_id);
          delta.cardsWritten = 1;
          delta.sourceIdsAddedCount = 1;
          summary.sourceIds.push(card.source_id);
        } else {
          delta.extractedFailed = 1;
          receiptToWrite = {
            ...receipt,
            extraction_outcome: 'failed',
            extraction_extractor: extractor.name,
            extraction_error: result.error,
          };
          // C2-005 failure line for the extraction-failed branch (fetch ok,
          // extractor said no). receipt is still appended below, so we say
          // "receipt recorded" not "no record".
          emitProgress(`  ! Failed (extraction: ${result.error}) — receipt recorded for ${url}`);
        }
      } else {
        delta.fetchedFailed = 1;
        // C2-005 failure line for the fetch-not-ok branch (HTTP 404/503,
        // network_error, etc — fetchOnce returned a receipt rather than
        // throwing). status may be null for network errors; surface
        // fetch_outcome plus status when present so the operator sees the
        // distinction (status_text is on the receipt as well but
        // fetch_outcome is the canonical category).
        const code = receipt.status !== null ? ` HTTP ${receipt.status}` : '';
        emitProgress(`  ! Failed (${receipt.fetch_outcome}${code}) — receipt recorded for ${url}`);
      }

      await appendFetchLog(packPath, receiptToWrite);
      summary.receiptsAppended += 1;
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
      // line tells the operator what kind of failure it was.
      const errClass = err instanceof Error ? err.constructor.name : 'Error';
      const errMsg = err instanceof Error ? err.message : String(err);
      emitProgress(`  ! Failed (${errClass}: ${errMsg}) — receipt recorded for ${url}`);
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
