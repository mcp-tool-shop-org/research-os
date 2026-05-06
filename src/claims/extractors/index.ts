import type { ClaimExtractorAdapter } from '../types.js';
import { HeuristicClaimExtractor } from './heuristic.js';
import { OllamaInternClaimExtractor } from './ollama-intern.js';

export { HeuristicClaimExtractor } from './heuristic.js';
export { OllamaInternClaimExtractor } from './ollama-intern.js';

export function defaultClaimExtractors(): ClaimExtractorAdapter[] {
  return [new OllamaInternClaimExtractor(), new HeuristicClaimExtractor()];
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
