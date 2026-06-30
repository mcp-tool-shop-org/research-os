import type { ClaimExtractorAdapter } from '../types.js';
import { HeuristicClaimExtractor } from './heuristic.js';
import { MCPClaimExtractor } from './mcp.js';
import { OllamaInternClaimExtractor } from './direct-ollama-legacy-extractor.js';

export { HeuristicClaimExtractor } from './heuristic.js';
export { MCPClaimExtractor } from './mcp.js';
// Re-exported for in-tree callers that still type against the legacy direct-
// Ollama extractor (claims-ollama-intern.test.ts, src/claims/index.ts). It is
// NOT the default code path in v0.8.0 — defaultClaimExtractors() returns the
// MCP-backed extractor first.
export { OllamaInternClaimExtractor } from './direct-ollama-legacy-extractor.js';

export function defaultClaimExtractors(): ClaimExtractorAdapter[] {
  // Default ladder for v0.8.0:
  //   1. MCPClaimExtractor — spawns ollama-intern-mcp via stdio and consumes
  //      ollama_extract (frame + per-call model contract).
  //   2. HeuristicClaimExtractor — deterministic fallback that always succeeds.
  // The legacy direct-Ollama extractor is intentionally absent from this list.
  // It's still exported above for tests and for an operator who wants to opt
  // back in to the legacy code path (Phase 2-5 rollback safety).
  return [new MCPClaimExtractor(), new HeuristicClaimExtractor()];
}

export async function pickClaimExtractor(
  extractors: ClaimExtractorAdapter[],
): Promise<ClaimExtractorAdapter> {
  return (await pickClaimExtractorWithDegradation(extractors)).extractor;
}

// B-CLAIMS-002 (Stage B proactive hardening) — degradation-aware pick.
//
// pickClaimExtractor() silently walks the ladder and returns the first
// available adapter. When the MCP-backed extractor is the FIRST preference but
// is unavailable, the ladder falls through to the deterministic
// HeuristicClaimExtractor — which bypasses the ENTIRE topicality defense floor
// (no frame critic / source-content guard / R-012 rescue; every claim is
// admitted with frame_excluded=false and no exclusion reason). The only prior
// trace of this was the neutral `extractor: heuristic` field; an operator who
// expected MCP topicality enforcement got none, silently.
//
// This wrapper reports whether the picked extractor is a heuristic fallback
// that displaced a first-preference MCP extractor, so the caller can emit one
// contrastive run-start warning + an additive receipt field. The original
// pickClaimExtractor() is preserved for callers that don't need the signal.
export interface ClaimExtractorPick {
  extractor: ClaimExtractorAdapter;
  // true iff the FIRST-preference adapter was the MCP extractor
  // ('ollama-intern'), it was unavailable, and the resolved extractor is the
  // deterministic heuristic fallback. false on the happy path (MCP available)
  // and when the heuristic was the operator's explicit first preference.
  degradedToHeuristic: boolean;
}

export async function pickClaimExtractorWithDegradation(
  extractors: ClaimExtractorAdapter[],
): Promise<ClaimExtractorPick> {
  const mcpWasFirstPreference = extractors[0]?.name === 'ollama-intern';
  for (const e of extractors) {
    if (await e.available()) {
      const degradedToHeuristic =
        mcpWasFirstPreference && e.name === 'heuristic';
      return { extractor: e, degradedToHeuristic };
    }
  }
  throw new Error(
    'No claim extractor available. The HeuristicClaimExtractor should always be available — this indicates a bug.',
  );
}

// Keep a private reference so unused-import lints don't fire when MCP path
// isn't exercised by a given consumer; the value is part of the public API
// surface above.
void OllamaInternClaimExtractor;
