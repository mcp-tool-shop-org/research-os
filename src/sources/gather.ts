import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  NoUrlsProvidedError,
  PackNotFoundError,
  SectionNotFoundError,
} from '../errors.js';
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
import type { GatherOptions, GatherSummary, Extractor } from './types.js';

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

  for (const url of urls) {
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
      summary.fetchedOk += 1;
      const result = await extractor.extract({
        url,
        finalUrl: receipt.final_url,
        rawText,
        contentType: receipt.content_type,
      });
      if (result.ok) {
        summary.extractedOk += 1;
        receiptToWrite = {
          ...receipt,
          extraction_outcome: 'ok',
          extraction_extractor: extractor.name,
          extraction_error: null,
        };
        const card = buildCard({ receipt: receiptToWrite, extraction: result, extractedBy: extractor.name, overrides });
        await writeSourceCard(packPath, card);
        sourceIdAppender.add(card.source_id);
        summary.cardsWritten += 1;
        summary.sourceIds.push(card.source_id);
      } else {
        summary.extractedFailed += 1;
        receiptToWrite = {
          ...receipt,
          extraction_outcome: 'failed',
          extraction_extractor: extractor.name,
          extraction_error: result.error,
        };
      }
    } else {
      summary.fetchedFailed += 1;
    }

    await appendFetchLog(packPath, receiptToWrite);
    summary.receiptsAppended += 1;
  }

  // A-008 — single batched append of all queued source_ids.
  await sourceIdAppender.flush();

  return summary;
}
