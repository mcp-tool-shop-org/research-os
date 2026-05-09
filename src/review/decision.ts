import type { Claim } from '../claims/schema.js';
import type { SectionScopedWaiver } from '../intake/schema.js';
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
  // Block-level low-value: explicitly excluded from synthesis. The claim is
  // grounded, but the reviewer is firm that it doesn't earn a slot.
  valid_but_low_value: 'rejected',
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
  // Warn-level low-value: borderline. Send to human review rather than auto
  // rejecting; the human decides whether to keep on the ledger or exclude.
  valid_but_low_value: 'needs_human_review',
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
  // v0.3.1+: section-scoped waivers active for this section. When a
  // min_independent_publishers waiver is present, the source_cluster_monopoly
  // finding remains in the ledger as a visible caveat but does NOT, by itself,
  // route per-claim decisions to needs_source_repair. Other source-quality
  // findings (per-claim source_quality_problem, scope_widening, etc.) continue
  // to apply normally — the waiver only neutralises the section-wide monopoly
  // signal that operators have explicitly disclosed and accepted.
  activeSectionWaivers?: SectionScopedWaiver[];
}): ClaimReview[] {
  const { claims, findings, reviewer, reviewMethod, activeSectionWaivers } = args;
  const reviews: ClaimReview[] = [];
  const now = new Date().toISOString();

  // A section-scoped min_independent_publishers waiver neutralises the
  // section-wide source_cluster_monopoly signal at the per-claim
  // decision-routing layer. The finding remains in the ledger; only its
  // contribution to the decision is suppressed.
  const monopolyWaived =
    Array.isArray(activeSectionWaivers) &&
    activeSectionWaivers.some((w) => w.scope === 'min_independent_publishers');

  const isWaivedFinding = (f: ReviewFinding): boolean =>
    monopolyWaived && f.category === 'source_cluster_monopoly';

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

    let decisions: ReviewDecision[] = [];
    for (const f of claimFindings) {
      if (isWaivedFinding(f)) continue;
      if (f.severity === 'block') {
        decisions.push(BLOCK_TO_DECISION[f.category] ?? 'rejected');
      } else if (f.severity === 'warn') {
        const d = WARN_TO_DECISION[f.category];
        if (d) decisions.push(d);
      }
    }
    if (decisions.length === 0) decisions.push('accepted_for_synthesis');

    // Conservative merge: a claim flagged ONLY by the narrow critic (and
    // no general / heuristic reviewer corroborated it) gets soft pressure,
    // not auto-rejection. The narrow critic's role is to surface risk; the
    // final reject must be backed by the general pass or a heuristic
    // structural check. This prevents a false-positive-prone critic from
    // killing claims unilaterally.
    const isCritic = (f: ReviewFinding): boolean =>
      typeof f.review_method === 'string' && f.review_method.endsWith('_narrow_critic');
    const onlyCritic =
      claimFindings.length > 0 && claimFindings.every(isCritic);
    if (onlyCritic) {
      decisions = decisions.map((d) =>
        d === 'rejected' ? 'needs_human_review' : d,
      );
    }

    const decision = pickHighestPriority(decisions);
    const reasonParts = claimFindings
      .filter((f) => f.severity !== 'info')
      .map((f) =>
        isWaivedFinding(f)
          ? `${f.category} (${f.severity}, waived)`
          : `${f.category} (${f.severity})`,
      );
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
