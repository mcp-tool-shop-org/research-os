import type { Extractor } from '../types.js';
import { HeuristicExtractor } from './heuristic.js';
import { OllamaInternExtractor } from './ollama-intern.js';

export { HeuristicExtractor } from './heuristic.js';
export { OllamaInternExtractor } from './ollama-intern.js';

export function defaultExtractors(): Extractor[] {
  return [new OllamaInternExtractor(), new HeuristicExtractor()];
}

export async function pickExtractor(extractors: Extractor[]): Promise<Extractor> {
  for (const e of extractors) {
    if (await e.available()) return e;
  }
  throw new Error(
    'No extractor available. The HeuristicExtractor should always be available — this indicates a bug.',
  );
}
