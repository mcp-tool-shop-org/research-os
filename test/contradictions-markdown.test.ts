import { describe, it, expect } from 'vitest';
import { renderMarkdownView } from '../src/contradictions/markdown.js';
import type { Contradiction } from '../src/contradictions/schema.js';

const sample: Contradiction = {
  contradiction_id: 'cnt_abcdef012345_heuristic',
  section_id: '01-landscape',
  claim_ids: [
    'clm_aaaaaaaaaaaa_heuristic_1',
    'clm_bbbbbbbbbbbb_heuristic_1',
  ],
  source_ids: ['src_aaaaaaaaaaaa', 'src_bbbbbbbbbbbb'],
  type: 'direct_conflict',
  summary: 'Claims share core terms but disagree.',
  scope_analysis: 'Scopes overlap on SQLite WAL mode.',
  overlap_assessment: 'fully_overlapping',
  severity: 'medium',
  confidence: 'low',
  detector: 'heuristic',
  detection_method: 'heuristic_similarity_negation',
  evidence: 'Token similarity + negation mismatch.',
  status: 'unresolved',
  created_at: '2026-05-06T22:00:00.000Z',
};

describe('renderMarkdownView', () => {
  it('produces an honest empty view when no contradictions exist', () => {
    const md = renderMarkdownView({
      sectionId: '01-landscape',
      candidateClaims: 4,
      contradictions: [],
      detector: 'heuristic',
      detectionMethod: 'heuristic_similarity_negation',
    });
    expect(md).toContain('# Contradictions: 01-landscape');
    expect(md).toContain('No contradiction candidates detected by heuristic');
    expect(md).toContain('over 4 candidate claims');
    expect(md).toContain('A clean section is a valid result');
  });

  it('emits one block per contradiction with all key fields', () => {
    const md = renderMarkdownView({
      sectionId: '01-landscape',
      candidateClaims: 2,
      contradictions: [sample],
      detector: 'heuristic',
      detectionMethod: 'heuristic_similarity_negation',
    });
    expect(md).toContain('cnt_abcdef012345_heuristic: direct_conflict');
    expect(md).toContain('Severity:** medium');
    expect(md).toContain('Confidence:** low');
    expect(md).toContain('Status:** unresolved');
    expect(md).toContain('Overlap:** fully_overlapping');
    expect(md).toContain('clm_aaaaaaaaaaaa_heuristic_1');
    expect(md).toContain('SQLite WAL mode');
    expect(md).toContain('Status: all unresolved');
  });

  it('singular vs plural copy', () => {
    const oneClaim = renderMarkdownView({
      sectionId: '01-landscape',
      candidateClaims: 1,
      contradictions: [],
      detector: 'heuristic',
      detectionMethod: 'heuristic_similarity_negation',
    });
    expect(oneClaim).toContain('1 candidate claim');
    expect(oneClaim).not.toContain('1 candidate claims');

    const oneContradiction = renderMarkdownView({
      sectionId: '01-landscape',
      candidateClaims: 2,
      contradictions: [sample],
      detector: 'heuristic',
      detectionMethod: 'heuristic_similarity_negation',
    });
    expect(oneContradiction).toContain('1 contradiction candidate detected');
  });
});
