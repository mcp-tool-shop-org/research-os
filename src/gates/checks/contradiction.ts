import type { GateCheckResult, GateInput } from '../types.js';
import type { ContradictionResolution } from '../../contradictions/resolution-schema.js';

function buildEffectiveStatuses(resolutions: ContradictionResolution[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!resolutions || resolutions.length === 0) return map;
  const sorted = [...resolutions].sort((a, b) => a.resolved_at.localeCompare(b.resolved_at));
  for (const r of sorted) map.set(r.contradiction_id, r.status);
  return map;
}

export function checkContradiction(input: GateInput): GateCheckResult[] {
  const cfg = input.research.gates.contradiction;
  const results: GateCheckResult[] = [];
  const all = input.contradictions;
  const effectiveStatuses = buildEffectiveStatuses(input.resolutions);
  const unresolved = all.filter((c) => {
    const eff = effectiveStatuses.get(c.contradiction_id);
    return eff !== undefined ? eff === 'unresolved' : c.status === 'unresolved';
  });
  const blocking = unresolved.filter(
    (c) => c.severity === 'blocking' || c.severity === 'high',
  );

  // unresolved contradictions visibility
  if (unresolved.length > 0) {
    results.push({
      family: 'contradiction',
      check: 'unresolved_visible',
      status: 'warn',
      detail: `${unresolved.length} unresolved contradiction(s) recorded. The contradiction ledger is the audit substrate; the gate engine does not resolve, only surfaces.`,
      evidence: unresolved.map((c) => c.contradiction_id),
      blocks_synthesis: false,
    });
  } else {
    results.push({
      family: 'contradiction',
      check: 'unresolved_visible',
      status: 'pass',
      detail: all.length === 0
        ? `No contradictions recorded. A clean ledger is not proof of completeness — it means the detector found nothing.`
        : `All ${all.length} contradiction(s) recorded are resolved.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  // blocking contradictions actually block synthesis
  if (cfg.unresolved_contradictions_block_synthesis && blocking.length > 0) {
    results.push({
      family: 'contradiction',
      check: 'unresolved_contradictions_block_synthesis',
      status: 'fail',
      detail: `${blocking.length} unresolved contradiction(s) at high or blocking severity. Synthesis is not eligible until these are reconciled, preserved deliberately, or rejected.`,
      evidence: blocking.map((c) => c.contradiction_id),
      blocks_synthesis: true,
    });
  } else {
    results.push({
      family: 'contradiction',
      check: 'unresolved_contradictions_block_synthesis',
      status: 'pass',
      detail: cfg.unresolved_contradictions_block_synthesis
        ? `No high- or blocking-severity unresolved contradictions.`
        : `Pack policy does not block synthesis on unresolved contradictions; ${blocking.length} high/blocking still recorded for visibility.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  // contradiction-required check — only if pack policy says so
  if (cfg.required && all.length === 0) {
    results.push({
      family: 'contradiction',
      check: 'contradiction_required_by_policy',
      status: 'warn',
      detail: `Pack policy requires contradiction coverage but no contradictions are recorded. A clean ledger may indicate a thin-source-set rather than genuine consensus. Adversarial review should re-examine.`,
      evidence: [],
      blocks_synthesis: false,
    });
  } else if (cfg.required) {
    results.push({
      family: 'contradiction',
      check: 'contradiction_required_by_policy',
      status: 'pass',
      detail: `Contradiction ledger has ${all.length} entry(ies); policy satisfied.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  return results;
}
