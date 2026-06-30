/**
 * B-CLAIMS-002 (Stage B proactive hardening) — silent degradation from the MCP
 * extractor to the deterministic heuristic must be surfaced.
 *
 * Before the fix: pickClaimExtractor() walked the ladder and silently returned
 * the HeuristicClaimExtractor when the MCP extractor's available() was false.
 * The heuristic bypasses the ENTIRE topicality defense floor (no frame critic /
 * source-content guard / R-012 rescue; every claim admitted with
 * frame_excluded=false), and the only trace was the neutral
 * `extractor: heuristic` field — an operator expecting MCP topicality
 * enforcement got none, silently.
 *
 * After the fix: extract() emits ONE contrastive run-start stderr warning and
 * sets an additive boolean (`degradedToHeuristic` on the summary,
 * `degraded_to_heuristic` on the receipt).
 *
 * Both halves proven:
 *  - GAP HANDLED: when MCP (first preference) is unavailable, the warning fires
 *    and the additive fields are true.
 *  - HAPPY PATH: when MCP is available, NO warning fires and the additive
 *    fields are false.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, appendFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { extract } from '../../src/claims/index.js';
import { HeuristicClaimExtractor } from '../../src/claims/extractors/heuristic.js';
import type {
  ClaimExtractionInput,
  ClaimExtractionResult,
  ClaimExtractorAdapter,
} from '../../src/claims/types.js';

let workDir: string;
let packPath: string;

const SECTION_ID = '01-stageb2';
const SOURCE_ID = 'src_abcdef012345';

async function buildPack(): Promise<void> {
  const result = await init({
    topic: 'B-CLAIMS-002 heuristic-degradation-warning fixture',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({ id: SECTION_ID, purpose: 'Stage B degradation bed', packPath });

  const sha = SOURCE_ID.replace(/^src_/, '').padEnd(64, 'a');
  const rcptId = `rcpt_${SOURCE_ID.replace(/^src_/, '')}_1700000000000`;
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  const card = {
    source_id: SOURCE_ID,
    receipt_id: rcptId,
    section_id: SECTION_ID,
    url: 'https://example.com/x',
    final_url: 'https://example.com/x',
    fetched_at: '2026-06-29T03:00:00.000Z',
    publisher: 'Example Pub',
    published_at: null,
    title: 'Example Source',
    source_type: 'secondary',
    relevance: 'unknown',
    key_points: ['A substantive first key point about the topic at hand.'],
    limitations: [],
    asserts: 'Source headline assertion',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-06-29T03:00:00.000Z',
  };
  await writeFile(join(cardDir, `${SOURCE_ID}.json`), JSON.stringify(card), 'utf8');

  const rawDir = join(packPath, 'evidence', 'raw');
  await mkdir(rawDir, { recursive: true });
  const rawText =
    '<html><body><p>A substantive first key point about the topic at hand.</p></body></html>';
  await writeFile(join(rawDir, `${SOURCE_ID}.html`), rawText, 'utf8');

  const receipt = {
    receipt_id: rcptId,
    source_id: SOURCE_ID,
    section_id: SECTION_ID,
    requested_url: 'https://example.com/x',
    final_url: 'https://example.com/x',
    status: 200,
    status_text: 'OK',
    content_type: 'text/html',
    fetched_at: '2026-06-29T03:00:00.000Z',
    byte_count: rawText.length,
    sha256: sha,
    title: 'Example Source',
    raw_text_path: `evidence/raw/${SOURCE_ID}.html`,
    fetch_outcome: 'ok',
    fetch_error: null,
    extraction_outcome: 'ok',
    extraction_extractor: 'heuristic',
    extraction_error: null,
  };
  await appendFile(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    JSON.stringify(receipt) + '\n',
    'utf8',
  );
  await appendFile(
    join(packPath, 'sections', SECTION_ID, 'sources.jsonl'),
    JSON.stringify({ source_id: SOURCE_ID, added_at: '2026-06-29T03:00:01.000Z' }) + '\n',
    'utf8',
  );
}

// MCP-named adapter that reports unavailable — simulates the binary not being
// discoverable. name 'ollama-intern' makes it the first-preference MCP slot.
class UnavailableMcpExtractor implements ClaimExtractorAdapter {
  readonly name = 'ollama-intern' as const;
  async available(): Promise<boolean> {
    return false;
  }
  async extract(): Promise<ClaimExtractionResult> {
    throw new Error('should never be called when unavailable');
  }
}

// MCP-named adapter that IS available and returns a clean ok:true result.
class AvailableMcpExtractor implements ClaimExtractorAdapter {
  readonly name = 'ollama-intern' as const;
  async available(): Promise<boolean> {
    return true;
  }
  async extract(input: ClaimExtractionInput): Promise<ClaimExtractionResult> {
    const firstId = input.excerpts[0]!.excerpt_id;
    return {
      ok: true,
      claims: [
        {
          asserts: 'An MCP-extracted claim that asserts something substantive.',
          scope: null,
          not: null,
          evidence_excerpt_ids: [firstId],
          evidence_location: null,
          confidence: 'high',
        },
      ],
      method: 'mcp_ollama_extract',
    };
  }
}

function captureStderr(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: string | Uint8Array): boolean => {
      lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    });
  return { lines, restore: () => spy.mockRestore() };
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-stageb2-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const WARNING_MATCH = /ollama-intern MCP extractor unavailable; degraded to heuristic/;

describe('B-CLAIMS-002 — contrastive warning on heuristic degradation', () => {
  it('GAP HANDLED: MCP unavailable → fall through to heuristic emits the contrastive warning and sets degradedToHeuristic true', async () => {
    await buildPack();
    const cap = captureStderr();
    let summary;
    try {
      summary = await extract({
        sectionId: SECTION_ID,
        packPath,
        // MCP first preference (unavailable), heuristic fallback.
        extractors: [new UnavailableMcpExtractor(), new HeuristicClaimExtractor()],
      });
    } finally {
      cap.restore();
    }

    expect(summary.extractor).toBe('heuristic');
    expect(summary.degradedToHeuristic).toBe(true);
    expect(cap.lines.some((l) => WARNING_MATCH.test(l))).toBe(true);

    const receipt = JSON.parse(
      await readFile(join(packPath, 'audits', `${SECTION_ID}-claim-extract.json`), 'utf8'),
    ) as { degraded_to_heuristic?: boolean };
    expect(receipt.degraded_to_heuristic).toBe(true);
  });

  it('HAPPY PATH: MCP available → NO warning fires and degradedToHeuristic is false', async () => {
    await buildPack();
    const cap = captureStderr();
    let summary;
    try {
      summary = await extract({
        sectionId: SECTION_ID,
        packPath,
        extractors: [new AvailableMcpExtractor(), new HeuristicClaimExtractor()],
      });
    } finally {
      cap.restore();
    }

    expect(summary.extractor).toBe('ollama-intern');
    expect(summary.degradedToHeuristic).toBe(false);
    expect(cap.lines.some((l) => WARNING_MATCH.test(l))).toBe(false);

    const receipt = JSON.parse(
      await readFile(join(packPath, 'audits', `${SECTION_ID}-claim-extract.json`), 'utf8'),
    ) as { degraded_to_heuristic?: boolean };
    expect(receipt.degraded_to_heuristic).toBe(false);
  });
});
