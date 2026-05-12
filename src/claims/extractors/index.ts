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
  for (const e of extractors) {
    if (await e.available()) return e;
  }
  throw new Error(
    'No claim extractor available. The HeuristicClaimExtractor should always be available — this indicates a bug.',
  );
}

// Keep a private reference so unused-import lints don't fire when MCP path
// isn't exercised by a given consumer; the value is part of the public API
// surface above.
void OllamaInternClaimExtractor;
