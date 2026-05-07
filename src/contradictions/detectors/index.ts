import type { ContradictionDetector } from '../types.js';
import { HeuristicContradictionDetector } from './heuristic.js';
import { OllamaInternContradictionDetector } from './ollama-intern.js';

export { HeuristicContradictionDetector } from './heuristic.js';
export { OllamaInternContradictionDetector } from './ollama-intern.js';

export function defaultContradictionDetectors(): ContradictionDetector[] {
  return [new OllamaInternContradictionDetector(), new HeuristicContradictionDetector()];
}

export async function pickContradictionDetector(
  detectors: ContradictionDetector[],
): Promise<ContradictionDetector> {
  for (const d of detectors) {
    if (await d.available()) return d;
  }
  throw new Error(
    'No contradiction detector available. The HeuristicContradictionDetector should always be available — this indicates a bug.',
  );
}
