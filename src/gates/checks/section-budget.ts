import type { GateCheckResult, GateInput } from '../types.js';

export function checkSectionBudget(input: GateInput): GateCheckResult[] {
  const cfg = input.research.gates.section_budget;
  const section = input.section;
  const results: GateCheckResult[] = [];

  if (!section.max_time_minutes || section.max_time_minutes <= 0) {
    results.push({
      family: 'section_budget',
      check: 'budget_configured',
      status: 'warn',
      detail: `Section has no max_time_minutes configured.`,
      evidence: [section.id],
      blocks_synthesis: false,
    });
  } else {
    results.push({
      family: 'section_budget',
      check: 'budget_configured',
      status: 'pass',
      detail: `Section budget: ${section.max_time_minutes} minute(s). Pack default: ${cfg.max_time_minutes}.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  results.push({
    family: 'section_budget',
    check: 'runtime_tracking',
    status: 'warn',
    detail: `Runtime tracking not yet implemented in v0.1; configured budget is recorded for future enforcement only. Extension policy (extension_requires_evidence=${cfg.extension_requires_evidence}) is documented but not enforced until actual run timestamps are tracked.`,
    evidence: [],
    blocks_synthesis: false,
  });

  return results;
}
