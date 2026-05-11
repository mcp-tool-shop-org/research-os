import { describe, it, expect } from 'vitest';
import { SectionGateResultSchema } from '../src/gates/schema.js';

const baseSourceCounts = {
  total: 5,
  primary: 3,
  secondary: 1,
  forum: 0,
  benchmark: 0,
  docs: 1,
  unknown: 0,
  independent_publishers: 2,
  failed_fetches: 0,
  // section_primary and section_independent_publishers intentionally omitted
};

const baseGateJson = {
  section_id: '01-test',
  verdict: 'pass',
  summary: 'All checks passed.',
  checked_at: '2026-05-10T00:00:00.000Z',
  synthesis_eligible: true,
  gate_results: [],
  failures: [],
  warnings: [],
  waivers_applied: [],
  blocking_reasons: [],
  claim_counts: {
    total: 10,
    candidate: 8,
    with_evidence_excerpt: 7,
    with_source_hashes: 7,
    with_scope: 6,
    with_not: 2,
    universal_scope_null: 0,
    orphans: 0,
  },
  source_counts: baseSourceCounts,
  contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
  freshness_summary: {
    policy_required: false,
    max_source_age_months: null,
    stale_source_policy: 'warn',
    stale_count: 0,
    unknown_date_count: 0,
  },
  scope_integrity_summary: {
    universal_claims: 2,
    scoped_claims: 8,
    with_not_constraint: 1,
    overgen_risks_total: 0,
    overgen_risks_blocking: 0,
  },
  next_actions: [],
};

describe('F-53: SectionGateResultSchema backward compat', () => {
  it('legacy gate JSON omitting section_primary and section_independent_publishers parses cleanly with default 0', () => {
    const result = SectionGateResultSchema.parse(baseGateJson);
    expect(result.source_counts.section_primary).toBe(0);
    expect(result.source_counts.section_independent_publishers).toBe(0);
  });

  it('modern gate JSON with section_primary and section_independent_publishers preserves their values', () => {
    const modernJson = {
      ...baseGateJson,
      source_counts: { ...baseSourceCounts, section_primary: 3, section_independent_publishers: 2 },
    };
    const result = SectionGateResultSchema.parse(modernJson);
    expect(result.source_counts.section_primary).toBe(3);
    expect(result.source_counts.section_independent_publishers).toBe(2);
  });
});
