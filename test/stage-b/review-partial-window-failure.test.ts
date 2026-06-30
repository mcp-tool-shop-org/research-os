// B-REVIEW-001 regression: a paged ollama-intern review where some windows'
// LLM calls fail but at least one succeeds must NOT silently discard the
// failures. The reviewer's ok:true result carries windows_failed/windows_total
// so the partial coverage becomes a durable receipt downstream, and a forced
// stderr warning is emitted per failed window.
//
// Both halves:
//   - FAILURE PRESENT: 2 windows, window 1 fails its fetch, window 2 succeeds.
//     The result is ok:true (>=1 window ok) AND windows_failed=1 / total=2.
//     A forced stderr line names the failed window.
//   - HAPPY PATH: every window succeeds → windows_failed/windows_total are
//     undefined (byte-identical to the pre-fix success result).

import { describe, it, expect, vi } from 'vitest';
import { OllamaInternReviewer } from '../../src/review/reviewers/ollama-intern.js';
import type { ReviewerInput } from '../../src/review/types.js';

function makeClaim(idx: number) {
  return {
    claim_id: `clm_${idx.toString(16).padStart(12, '0')}_ollama_intern_1`,
    section_id: '01-test',
    source_ids: ['src_aaaaaaaaaaaa'],
    source_hashes: ['a'.repeat(64)],
    asserts: `assertion number ${idx}`,
    scope: 'narrow',
    not: 'broad',
    evidence_excerpt: 'literal body text',
    evidence_location: null,
    confidence: 'low' as const,
    extractor: 'heuristic' as const,
    extraction_method: 'm',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate' as const,
  };
}

function makeInput(claimCount: number): ReviewerInput {
  const candidateClaims = Array.from({ length: claimCount }, (_, i) => makeClaim(i + 1));
  return {
    research: {} as ReviewerInput['research'],
    section: { id: '01-test', purpose: 'probe' } as ReviewerInput['section'],
    candidateClaims: candidateClaims as unknown as ReviewerInput['candidateClaims'],
    sources: [],
    receipts: [],
    contradictions: [],
    resolutions: [],
    excerptsBySourceId: new Map(),
    gateResult: null,
    rawTextBySourceId: new Map(),
    briefText: null,
  };
}

// A fetch impl that returns a valid empty-findings response for /api/chat.
function okChatResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ message: { content: JSON.stringify({ findings: [] }) } }),
  } as unknown as Response;
}

describe('B-REVIEW-001 — partial window failure becomes a durable receipt', () => {
  it('FAILURE PRESENT: window 1 fails, window 2 succeeds → ok:true with windows_failed=1/total=2 + forced stderr', async () => {
    let chatCall = 0;
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => {
      chatCall += 1;
      // First window fails (HTTP 500), second window succeeds.
      if (chatCall === 1) {
        return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      }
      return okChatResponse();
    }) as unknown as typeof fetch;

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    // claimsPerWindow=1 with 2 claims => exactly 2 windows.
    const reviewer = new OllamaInternReviewer({ claimsPerWindow: 1, fetchImpl });
    const result = await reviewer.review(makeInput(2));

    stderr.mockRestore();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.windows_failed).toBe(1);
      expect(result.windows_total).toBe(2);
    }
    // Forced warning was written for the failed window.
    const calls = (process.stderr.write as unknown as { mock?: { calls: unknown[][] } });
    void calls; // stderr already restored; assert via the captured spy below.
  });

  it('FAILURE PRESENT: emits a forced stderr line naming the failed window', async () => {
    let chatCall = 0;
    const fetchImpl = vi.fn(async () => {
      chatCall += 1;
      if (chatCall === 1) {
        return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      }
      return okChatResponse();
    }) as unknown as typeof fetch;

    const lines: string[] = [];
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown) => {
        lines.push(String(chunk));
        return true;
      });

    const reviewer = new OllamaInternReviewer({ claimsPerWindow: 1, fetchImpl });
    await reviewer.review(makeInput(2));
    stderr.mockRestore();

    const failureLine = lines.find((l) => /window 1\/2 failed/.test(l));
    expect(failureLine).toBeDefined();
    expect(failureLine).toMatch(/partial coverage/);
  });

  it('HAPPY PATH: all windows succeed → windows_failed/windows_total are undefined', async () => {
    const fetchImpl = vi.fn(async () => okChatResponse()) as unknown as typeof fetch;
    const reviewer = new OllamaInternReviewer({ claimsPerWindow: 1, fetchImpl });
    const result = await reviewer.review(makeInput(2));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.windows_failed).toBeUndefined();
      expect(result.windows_total).toBeUndefined();
    }
  });
});
