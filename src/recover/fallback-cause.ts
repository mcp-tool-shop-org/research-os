// v0.11 Slice 4 — R-010 fallback-cause classifier.
//
// Pure function over the orchestrator's `last_rejection_reason` string.
// Reads ONLY existing fields; no logic change to recovery selection. The
// classification is consumed by:
//   - run.ts orchestrator → populates prose_error.fallback_cause + timing_ms
//     on the deterministic-fallback path.
//   - markdown.ts renderer → surfaces an operator-readable cause callout
//     so the v0.2 TIER_TIMEOUT-buried-in-JSON case is no longer invisible.
//
// Closed-vocabulary classification (3 values): tier_timeout / mcp_error /
// retry_exhausted. Timing is optional and only populated when the rejection
// string carries the `elapsed=NNNNms budget=NNNNms` shape ollama-intern-mcp
// emits on TIER_TIMEOUT. Absence of timing is honest — we never fabricate
// numbers.

import type { FallbackCause, FallbackTiming } from './types.js';

export interface ClassifiedFallbackCause {
  cause: FallbackCause;
  timing?: FallbackTiming;
}

const ELAPSED_RE = /elapsed\s*=\s*(\d+)\s*ms/i;
const BUDGET_RE = /budget\s*=\s*(\d+)\s*ms/i;

function parseTierTimeoutTiming(text: string): FallbackTiming | undefined {
  const elapsedMatch = ELAPSED_RE.exec(text);
  const budgetMatch = BUDGET_RE.exec(text);
  if (!elapsedMatch || !budgetMatch) return undefined;
  const elapsed_ms = Number(elapsedMatch[1]);
  const budget_ms = Number(budgetMatch[1]);
  if (!Number.isFinite(elapsed_ms) || !Number.isFinite(budget_ms)) return undefined;
  return { elapsed_ms, budget_ms };
}

export function classifyFallbackCause(lastRejectionReason: string): ClassifiedFallbackCause {
  // The orchestrator constructs the rejection string with one of two known
  // shapes (see run.ts#recoverOneSection fallback branch):
  //   - `mcp_error: <error string>` when the MCP advisor call failed
  //   - `<verifier_reason>: <detail>` when the verifier rejected the advice
  if (lastRejectionReason.startsWith('mcp_error:')) {
    if (lastRejectionReason.includes('TIER_TIMEOUT')) {
      const timing = parseTierTimeoutTiming(lastRejectionReason);
      return timing ? { cause: 'tier_timeout', timing } : { cause: 'tier_timeout' };
    }
    return { cause: 'mcp_error' };
  }
  return { cause: 'retry_exhausted' };
}
