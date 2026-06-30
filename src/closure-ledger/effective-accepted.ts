/**
 * Closure-ledger normalized "effective accepted claims" definition.
 *
 * **The product rule (advisor-locked, F-36):**
 *
 * Accepted claims = unique `claim_id`s whose **latest** canonical review
 * decision is `accepted_for_synthesis`. Latest-decision-wins precedence per
 * `claim_id`. `claim-reviews.jsonl` is append-only by design; later rows
 * supersede earlier ones.
 *
 * This is the canonical source of truth for "accepted" downstream of review.
 * Multiple consumers (`pack publish` admission, freeze citation validation,
 * future `pack-audit.json` derivation) should compute counts from this
 * definition rather than from raw row counts.
 *
 * The pattern mirrors `cowork/derive.ts`'s active-blocker readiness derivation
 * (Pattern 2 — latest-status-wins for closure ledgers, completed in v0.2.0
 * commit `22b5dba`). Earned by v1 Experiment 3 XRPL pack-2 closeout, Session K.
 */
import type { ClaimReview } from '../review/schema.js';

/**
 * Build a map from `claim_id` to its **latest** review record.
 *
 * Iterates through reviews and keeps the row with the latest `created_at`
 * timestamp per `claim_id`. ISO-8601 timestamps compare lexicographically, so
 * a string comparison is correct for ordering.
 *
 * **Tie direction (A-COWORK-001):** on an equal `created_at` tie, the
 * **last-appended** row wins (`>=`). `claim-reviews.jsonl` is append-only, so
 * "last appended" is "last written" — a same-millisecond corrective decision
 * must override the earlier one rather than be silently dropped. This is the
 * single canonical join: `cowork/derive.ts` and `synth/derive.ts` route their
 * per-claim decision resolution through here so the tie direction is
 * consistent everywhere.
 *
 * Two rows for the same `claim_id` with the **same** `created_at` whose
 * decisions **disagree** are still a genuine ambiguity; callers that must
 * refuse on conflicting state (pack publish admission, freeze) run
 * {@link findIncompatibleDecisions} to detect it. The `>=` tie-break does not
 * mask those conflicts — it only makes the resolved value deterministic.
 */
export function getEffectiveDecisionMap(reviews: ClaimReview[]): Map<string, ClaimReview> {
  const map = new Map<string, ClaimReview>();
  for (const r of reviews) {
    const existing = map.get(r.claim_id);
    if (!existing || r.created_at >= existing.created_at) {
      map.set(r.claim_id, r);
    }
  }
  return map;
}

/**
 * Return the set of unique `claim_id`s whose **latest** review decision is
 * `accepted_for_synthesis`. This is the canonical "accepted set" for a section.
 *
 * Behavior:
 * - Multiple `accepted_for_synthesis` rows for the same `claim_id` count once.
 * - A later non-accepted decision (e.g., `rejected`, `needs_scope_repair`)
 *   removes the `claim_id` from the accepted set, even if earlier rows
 *   accepted it.
 * - An empty input returns an empty set.
 */
export function getEffectiveAcceptedClaimIds(reviews: ClaimReview[]): Set<string> {
  const decisionMap = getEffectiveDecisionMap(reviews);
  const accepted = new Set<string>();
  for (const [claim_id, r] of decisionMap) {
    if (r.decision === 'accepted_for_synthesis') accepted.add(claim_id);
  }
  return accepted;
}

/**
 * A `claim_id` with multiple review rows at the **same** `created_at`
 * timestamp whose decisions disagree. The latest-decision-wins tie-breaker is
 * undefined for these cases — pack publish admission refuses on them so the
 * operator can investigate the review pipeline state.
 */
export interface IncompatibleDecision {
  claim_id: string;
  created_at: string;
  /** Distinct decision strings observed at this `(claim_id, created_at)` pair. */
  decisions: string[];
}

/**
 * Find `claim_id`s with multiple review rows at the same timestamp that
 * disagree on the decision. These are unresolvable under
 * latest-decision-wins and indicate the review pipeline produced
 * conflicting state for the same logical event.
 *
 * Identical-timestamp rows that **agree** on decision are not flagged
 * (the dedup is harmless for counting).
 */
export function findIncompatibleDecisions(reviews: ClaimReview[]): IncompatibleDecision[] {
  const groups = new Map<string, Set<string>>();
  for (const r of reviews) {
    const key = `${r.claim_id}|${r.created_at}`;
    let set = groups.get(key);
    if (!set) {
      set = new Set();
      groups.set(key, set);
    }
    set.add(r.decision);
  }
  const conflicts: IncompatibleDecision[] = [];
  for (const [key, decisions] of groups) {
    if (decisions.size > 1) {
      const sep = key.lastIndexOf('|');
      const claim_id = key.slice(0, sep);
      const created_at = key.slice(sep + 1);
      conflicts.push({ claim_id, created_at, decisions: [...decisions] });
    }
  }
  return conflicts;
}
