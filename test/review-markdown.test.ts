import { describe, it, expect } from 'vitest';
import { renderReviewMarkdown } from '../src/review/markdown.js';
import { ReviewSnapshotSchema } from '../src/review/schema.js';

const baseSnapshot = ReviewSnapshotSchema.parse({
  section_id: '01-landscape',
  reviewer: 'heuristic',
  review_method: 'heuristic_field_and_grounding_checks',
  reviewed_at: '2026-05-06T22:00:00.000Z',
  candidate_claims: 2,
  findings: [],
  claim_reviews: [],
  decision_counts: {},
  severity_counts: {},
  llm_findings_rejected_ungrounded: 0,
  promoted_to_reviewed: false,
});

describe('renderReviewMarkdown', () => {
  it('emits header, reviewer line, and the load-bearing law about claims.jsonl', () => {
    const md = renderReviewMarkdown(baseSnapshot);
    expect(md).toContain('# Adversarial Review: 01-landscape');
    expect(md).toContain('Reviewer:** heuristic');
    expect(md).toContain('claims.jsonl is unchanged');
  });

  it('says "No findings produced" honestly when there are none', () => {
    const md = renderReviewMarkdown(baseSnapshot);
    expect(md).toContain('No findings produced');
    expect(md).toContain('A clean review is not proof of completeness');
  });

  it('renders findings with severity and required actions', () => {
    const populated = ReviewSnapshotSchema.parse({
      ...baseSnapshot,
      findings: [
        {
          finding_id: 'fnd_aaaaaaaaaaaa',
          section_id: '01-landscape',
          claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1'],
          source_ids: ['src_aaaaaaaaaaaa'],
          category: 'overgeneralized_claim',
          severity: 'warn',
          summary: 'Claim widens beyond source.',
          evidence: 'asserts is broad',
          required_action: 'Add scope tag.',
          reviewer: 'heuristic',
          review_method: 'heuristic_field_and_grounding_checks',
          confidence: 'medium',
          created_at: '2026-05-06T22:00:00.000Z',
        },
      ],
      severity_counts: { warn: 1, info: 0, block: 0 },
    });
    const md = renderReviewMarkdown(populated);
    expect(md).toContain('overgeneralized_claim');
    expect(md).toContain('[WARN]');
    expect(md).toContain('Add scope tag');
    expect(md).toContain('clm_aaaaaaaaaaaa_heuristic_1');
  });

  it('renders claim review decisions with glyph labels', () => {
    const populated = ReviewSnapshotSchema.parse({
      ...baseSnapshot,
      claim_reviews: [
        {
          claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
          decision: 'rejected',
          reason: 'Findings: ungrounded_excerpt (block).',
          finding_ids: ['fnd_aaaaaaaaaaaa'],
          reviewer: 'heuristic',
          review_method: 'heuristic_field_and_grounding_checks',
          created_at: '2026-05-06T22:00:00.000Z',
        },
      ],
      decision_counts: { rejected: 1 },
    });
    const md = renderReviewMarkdown(populated);
    expect(md).toContain('[REJECTED]');
    expect(md).toContain('clm_aaaaaaaaaaaa_heuristic_1');
  });
});
