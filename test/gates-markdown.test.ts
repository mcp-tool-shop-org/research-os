import { describe, it, expect } from 'vitest';
import { renderGateMarkdown } from '../src/gates/markdown.js';
import { SectionGateResultSchema } from '../src/gates/schema.js';

const baseResult = SectionGateResultSchema.parse({
  section_id: '01-landscape',
  verdict: 'pass',
  summary: 'Verdict: pass. synthesis-eligible. no failures; no warnings; no waivers.',
  checked_at: '2026-05-06T22:00:00.000Z',
  synthesis_eligible: true,
  gate_results: [
    {
      family: 'source_floor',
      check: 'min_sources',
      status: 'pass',
      detail: '4 source(s) >= minimum 4.',
      evidence: [],
      blocks_synthesis: false,
    },
  ],
  failures: [],
  warnings: [],
  waivers_applied: [],
  blocking_reasons: [],
  claim_counts: { total: 4, candidate: 4, with_evidence_excerpt: 4, with_source_hashes: 4, with_scope: 3, with_not: 2, universal_scope_null: 1, orphans: 0 },
  source_counts: { total: 4, primary: 1, secondary: 3, forum: 0, benchmark: 0, docs: 0, unknown: 0, independent_publishers: 4, failed_fetches: 0, section_primary: 1, section_independent_publishers: 4 },
  contradiction_counts: { total: 0, unresolved: 0, blocking: 0, by_type: {} },
  freshness_summary: { policy_required: false, max_source_age_months: null, stale_source_policy: 'warn', stale_count: 0, unknown_date_count: 0 },
  scope_integrity_summary: { universal_claims: 1, scoped_claims: 3, with_not_constraint: 2, overgen_risks_total: 0, overgen_risks_blocking: 0 },
  next_actions: [],
});

describe('renderGateMarkdown', () => {
  it('emits header, verdict, eligibility, and counts', () => {
    const md = renderGateMarkdown(baseResult);
    expect(md).toContain('# Gate Result: 01-landscape');
    expect(md).toContain('Verdict:** PASS');
    expect(md).toContain('Synthesis eligible:** yes');
    expect(md).toContain('Counts');
    expect(md).toContain('source_floor.min_sources');
  });

  it('renders blocking reasons section when blocked', () => {
    const blocked = SectionGateResultSchema.parse({
      ...baseResult,
      verdict: 'blocked',
      synthesis_eligible: false,
      blocking_reasons: ['source_floor.min_sources: Found 1; minimum 8.'],
    });
    const md = renderGateMarkdown(blocked);
    expect(md).toContain('Blocking reasons');
    expect(md).toContain('source_floor.min_sources');
    expect(md).toContain('Synthesis eligible:** no');
  });

  it('renders waivers_applied with reason and compensating controls', () => {
    const withWaiver = SectionGateResultSchema.parse({
      ...baseResult,
      waivers_applied: [
        {
          family: 'source_floor',
          check: 'primary_sources_required',
          reason: 'Design-intent research without public primaries.',
          compensating_controls: ['Adversarial review.', 'Secondary triple-corroboration.'],
          original_status: 'fail',
          new_status: 'pass_with_waiver',
        },
      ],
    });
    const md = renderGateMarkdown(withWaiver);
    expect(md).toContain('Waivers applied');
    expect(md).toContain('Design-intent research');
    expect(md).toContain('Adversarial review');
  });

  it('renders next actions when present', () => {
    const withNext = SectionGateResultSchema.parse({
      ...baseResult,
      next_actions: ['Run `research-os gather` with additional URLs to reach the minimum source count.'],
    });
    const md = renderGateMarkdown(withNext);
    expect(md).toContain('Next actions');
    expect(md).toContain('research-os gather');
  });
});
