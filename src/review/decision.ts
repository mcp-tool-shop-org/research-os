import type { Claim } from '../claims/schema.js';
import type { ClaimReview, ReviewFinding } from './schema.js';
import type { ReviewDecision, ReviewerName } from './types.js';

const BLOCK_TO_DECISION: Record<string, ReviewDecision> = {
  ungrounded_excerpt: 'rejected',
  unsupported_claim: 'rejected',
  unmapped_contradiction: 'needs_contradiction_mapping',
  recommendation_exceeds_evidence: 'rejected',
  hidden_synthesis: 'needs_human_review',
  temporal_mismatch: 'needs_source_repair',
  definition_drift: 'needs_source_repair',
  scope_widening: 'needs_scope_repair',
  overgeneralized_claim: 'needs_scope_repair',
  source_quality_problem: 'needs_source_repair',
  source_cluster_monopoly: 'needs_source_repair',
  stale_claim: 'needs_source_repair',
  // Block-level overproduction means the cluster is redundant enough that the
  // reviewer demands human-led collapse before synthesis.
  claim_overproduction: 'needs_human_review',
};

const WARN_TO_DECISION: Record<string, ReviewDecision> = {
  overgeneralized_claim: 'needs_scope_repair',
  scope_widening: 'needs_scope_repair',
  source_quality_problem: 'needs_source_repair',
  source_cluster_monopoly: 'needs_source_repair',
  stale_claim: 'needs_source_repair',
  unmapped_contradiction: 'needs_contradiction_mapping',
  hidden_synthesis: 'needs_human_review',
  recommendation_exceeds_evidence: 'needs_human_review',
  // Warn-level overproduction routes to human review too — the claim itself
  // may be fine; the reviewer is signalling the cluster is synthesis noise.
  claim_overproduction: 'needs_human_review',
};

const DECISION_PRIORITY: ReviewDecision[] = [
  'rejected',
  'needs_contradiction_mapping',
  'needs_source_repair',
  'needs_scope_repair',
  'needs_human_review',
  'accepted_for_synthesis',
];

function pickHighestPriority(decisions: ReviewDecision[]): ReviewDecision {
  for (const d of DECISION_PRIORITY) {
    if (decisions.includes(d)) return d;
  }
  return 'accepted_for_synthesis';
}

export function deriveClaimReviews(args: {
  claims: Claim[];
  findings: ReviewFinding[];
  reviewer: ReviewerName;
  reviewMethod: string;
}): ClaimReview[] {
  const { claims, findings, reviewer, reviewMethod } = args;
  const reviews: ClaimReview[] = [];
  const now = new Date().toISOString();

  for (const claim of claims) {
    const claimFindings = findings.filter((f) => f.claim_ids.includes(claim.claim_id));
    if (claimFindings.length === 0) {
      reviews.push({
        claim_id: claim.claim_id,
        decision: 'accepted_for_synthesis',
        reason: 'No findings recorded for this claim by the current reviewer.',
        finding_ids: [],
        reviewer,
        review_method: reviewMethod,
        created_at: now,
      });
      continue;
    }

    const decisions: ReviewDecision[] = [];
    for (const f of claimFindings) {
      if (f.severity === 'block') {
        decisions.push(BLOCK_TO_DECISION[f.category] ?? 'rejected');
      } else if (f.severity === 'warn') {
        const d = WARN_TO_DECISION[f.category];
        if (d) decisions.push(d);
      }
    }
    if (decisions.length === 0) decisions.push('accepted_for_synthesis');

    const decision = pickHighestPriority(decisions);
    const reasonParts = claimFindings
      .filter((f) => f.severity !== 'info')
      .map((f) => `${f.category} (${f.severity})`);
    const reason =
      reasonParts.length > 0
        ? `Findings: ${reasonParts.join('; ')}.`
        : 'Only info-level findings; accepted.';

    reviews.push({
      claim_id: claim.claim_id,
      decision,
      reason,
      finding_ids: claimFindings.map((f) => f.finding_id),
      reviewer,
      review_method: reviewMethod,
      created_at: now,
    });
  }

  return reviews;
}
