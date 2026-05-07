import type { Reviewer } from '../types.js';
import { HeuristicReviewer } from './heuristic.js';
import { OllamaInternReviewer } from './ollama-intern.js';

export { HeuristicReviewer } from './heuristic.js';
export { OllamaInternReviewer } from './ollama-intern.js';

export function defaultReviewers(): Reviewer[] {
  return [new OllamaInternReviewer(), new HeuristicReviewer()];
}

export async function pickReviewer(reviewers: Reviewer[]): Promise<Reviewer> {
  for (const r of reviewers) {
    if (await r.available()) return r;
  }
  throw new Error(
    'No reviewer available. The HeuristicReviewer should always be available — this indicates a bug.',
  );
}
