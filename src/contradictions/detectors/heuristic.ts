import type { Claim } from '../../claims/schema.js';
import {
  assessScopeOverlap,
  hasNegation,
  jaccardSimilarity,
} from '../scope.js';
import type {
  ContradictionDetector,
  DetectionResult,
  DraftContradiction,
  PairedDraft,
} from '../types.js';

const TOKEN_OVERLAP_DIRECT_THRESHOLD = 0.5;
const TOKEN_OVERLAP_OVERGEN_THRESHOLD = 0.4;

function compare(a: Claim, b: Claim): DraftContradiction | null {
  const overlap = assessScopeOverlap(a.scope, b.scope);
  const sim = jaccardSimilarity(a.asserts, b.asserts);
  const negA = hasNegation(a.asserts);
  const negB = hasNegation(b.asserts);
  const negationMismatch = negA !== negB;

  const oneScopedOneUniversal = (a.scope === null) !== (b.scope === null);
  if (oneScopedOneUniversal && sim >= TOKEN_OVERLAP_OVERGEN_THRESHOLD) {
    const universalSide = a.scope === null ? 'A' : 'B';
    const scopedSide = a.scope === null ? 'B' : 'A';
    const scopedScope = a.scope ?? b.scope!;
    return {
      type: 'overgeneralization_risk',
      summary: `Claim ${universalSide} appears to make a universal assertion while claim ${scopedSide} is contextually scoped to "${scopedScope}". Promotion of contextual claims to universal rules is the failure mode this gate is designed to catch.`,
      scope_analysis: `Claim ${scopedSide} has scope "${scopedScope}". Claim ${universalSide} has no recorded scope. The two assertions share key tokens (jaccard=${sim.toFixed(2)}), suggesting they address the same subject — but at incompatible levels of generality.`,
      overlap_assessment: overlap,
      severity: 'medium',
      confidence: sim >= 0.7 ? 'medium' : 'low',
      evidence: 'Asserts overlap on substantive tokens; scope-tagging is asymmetric (one universal, one specific).',
    };
  }

  if (
    sim >= TOKEN_OVERLAP_DIRECT_THRESHOLD &&
    negationMismatch &&
    (overlap === 'fully_overlapping' ||
      overlap === 'partially_overlapping' ||
      overlap === 'unknown')
  ) {
    return {
      type: 'direct_conflict',
      summary: `Claims share core terms but one negates a proposition the other affirms.`,
      scope_analysis: `Scope overlap assessed as ${overlap}; assertions disagree on a negated proposition (jaccard=${sim.toFixed(2)}).`,
      overlap_assessment: overlap,
      severity: 'medium',
      confidence: sim >= 0.75 ? 'medium' : 'low',
      evidence: 'Token similarity suggests the same subject. Negation marker mismatch suggests opposing positions on it.',
    };
  }

  return null;
}

export class HeuristicContradictionDetector implements ContradictionDetector {
  readonly name = 'heuristic' as const;

  async available(): Promise<boolean> {
    return true;
  }

  async detect(claims: Claim[]): Promise<DetectionResult> {
    const drafts: PairedDraft[] = [];
    for (let i = 0; i < claims.length; i += 1) {
      for (let j = i + 1; j < claims.length; j += 1) {
        const a = claims[i]!;
        const b = claims[j]!;
        const draft = compare(a, b);
        if (draft) drafts.push({ claim_a: a, claim_b: b, draft });
      }
    }
    return { ok: true, drafts, method: 'heuristic_similarity_negation' };
  }
}
