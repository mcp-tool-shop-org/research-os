import type { GateCheckResult, GateInput } from '../types.js';

export function checkScopeIntegrity(input: GateInput): GateCheckResult[] {
  const results: GateCheckResult[] = [];
  const claims = input.candidateClaims;

  const universal = claims.filter((c) => c.scope === null);
  const scoped = claims.filter((c) => c.scope !== null);
  const withNot = claims.filter((c) => c.not !== null);

  // universal claim warning — claims with scope=null cannot be treated as broad
  if (universal.length > 0) {
    results.push({
      family: 'scope_integrity',
      check: 'no_untagged_universal_claims',
      status: 'warn',
      detail: `${universal.length}/${claims.length} candidate claim(s) have scope=null. These must not be treated as broad-applicability claims downstream — they are scope-undetermined, not scope-universal. Run a richer extractor or add scope manually before synthesis.`,
      evidence: universal.map((c) => c.claim_id),
      blocks_synthesis: false,
    });
  } else if (claims.length > 0) {
    results.push({
      family: 'scope_integrity',
      check: 'no_untagged_universal_claims',
      status: 'pass',
      detail: `Every candidate claim has a non-null scope.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  // not-constraint preservation — informational warn
  if (claims.length > 0) {
    const ratio = withNot.length / claims.length;
    if (ratio < 0.3) {
      results.push({
        family: 'scope_integrity',
        check: 'not_constraint_present',
        status: 'warn',
        detail: `Only ${withNot.length}/${claims.length} candidate claim(s) carry a 'not' constraint. The 'not' field is the structural defense against overgeneralization; sparse coverage means downstream synthesis must be more cautious.`,
        evidence: claims.filter((c) => c.not === null).map((c) => c.claim_id),
        blocks_synthesis: false,
      });
    } else {
      results.push({
        family: 'scope_integrity',
        check: 'not_constraint_present',
        status: 'pass',
        detail: `${withNot.length}/${claims.length} candidate claim(s) carry a 'not' constraint.`,
        evidence: [],
        blocks_synthesis: false,
      });
    }
  }

  // overgeneralization risks from contradictions ledger
  const overgen = input.contradictions.filter(
    (c) => c.type === 'overgeneralization_risk' && c.status === 'unresolved',
  );
  const overgenBlocking = overgen.filter(
    (c) => c.severity === 'blocking' || c.severity === 'high',
  );
  const overgenWarn = overgen.filter(
    (c) => c.severity === 'medium' || c.severity === 'low',
  );

  if (overgenBlocking.length > 0) {
    results.push({
      family: 'scope_integrity',
      check: 'no_blocking_overgeneralization',
      status: 'fail',
      detail: `${overgenBlocking.length} unresolved overgeneralization_risk contradiction(s) at high or blocking severity. Contextual claims appear to be promoted into universal rules without scope-widening evidence.`,
      evidence: overgenBlocking.map((c) => c.contradiction_id),
      blocks_synthesis: true,
    });
  } else {
    results.push({
      family: 'scope_integrity',
      check: 'no_blocking_overgeneralization',
      status: 'pass',
      detail: `No high- or blocking-severity overgeneralization_risk contradictions.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  if (overgenWarn.length > 0) {
    results.push({
      family: 'scope_integrity',
      check: 'low_severity_overgeneralization',
      status: 'warn',
      detail: `${overgenWarn.length} low/medium-severity overgeneralization_risk contradiction(s) recorded. Adversarial review should classify these before synthesis.`,
      evidence: overgenWarn.map((c) => c.contradiction_id),
      blocks_synthesis: false,
    });
  }

  // Scope-widening evidence requirement is checked per claim during contradiction mapping;
  // here we surface the universal-vs-scoped ratio as a synthesis-readiness signal.
  if (claims.length > 0) {
    results.push({
      family: 'scope_integrity',
      check: 'scope_tagging_summary',
      status: 'pass',
      detail: `${scoped.length} scoped, ${universal.length} universal/untagged, ${withNot.length} with 'not' constraint.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  return results;
}
