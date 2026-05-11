import type { Reviewer } from '../types.js';
import { HeuristicReviewer } from './heuristic.js';
import { OllamaInternReviewer } from './ollama-intern.js';
import { NoReviewerAvailableError } from '../../errors.js';

export { HeuristicReviewer } from './heuristic.js';
export { OllamaInternReviewer } from './ollama-intern.js';

export function defaultReviewers(): Reviewer[] {
  return [new OllamaInternReviewer(), new HeuristicReviewer()];
}

export async function pickReviewer(reviewers: Reviewer[]): Promise<Reviewer> {
  for (const r of reviewers) {
    if (await r.available()) return r;
  }
  // B-C-002: HeuristicReviewer is always available per invariant; this fires
  // only if the invariant was broken (e.g., an empty reviewers[] argument).
  throw new NoReviewerAvailableError();
}
