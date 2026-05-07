// One-shot harness: run the paged LLM reviewer on a section, bypassing the
// CLI's ladder. Exists because the CLI's pickReviewer fell through to
// heuristic in repeated runs against the dogfood pack — this is a
// diagnostic, not a permanent path.
import { OllamaInternReviewer, review as runReview } from '../dist/index.js';

const sectionId = process.argv[2];
const packPath = process.argv[3] ?? process.cwd();
const reviewWindow = parseInt(process.argv[4] ?? '25', 10);

if (!sectionId) {
  console.error('usage: paged-review-oneshot.mjs <section-id> [packPath] [reviewWindow]');
  process.exit(1);
}

const reviewer = new OllamaInternReviewer({ claimsPerWindow: reviewWindow });
console.log('checking availability...');
const a = await reviewer.available();
console.log('available:', a);
if (!a) {
  console.error('LLM reviewer unavailable. Aborting.');
  process.exit(2);
}

const summary = await runReview({
  sectionId,
  packPath,
  reviewers: [reviewer],
  triagedOnly: true,
});

console.log('review complete');
console.log('  reviewer:           ', summary.reviewer);
console.log('  method:             ', summary.reviewMethod);
console.log('  candidate claims:   ', summary.candidateClaims);
console.log('  findings added:     ', summary.findingsAdded);
console.log('  findings deduped:   ', summary.findingsDeduped);
console.log('  llm findings reject:', summary.llmFindingsRejected);
console.log('  blocking findings:  ', summary.blockingFindings);
console.log('  promoted:           ', summary.promotedToReviewed);
console.log('decisions:');
for (const [d, n] of Object.entries(summary.decisions)) console.log(`  ${d}: ${n}`);
