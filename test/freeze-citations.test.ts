import { describe, it, expect } from 'vitest';
import {
  extractClaimCitations,
  extractContradictionDisclosures,
  extractWaiverDisclosures,
  isWellFormedClaimId,
} from '../src/freeze/citations.js';

describe('extractClaimCitations', () => {
  it('matches well-formed [claim:clm_...] references', () => {
    const text = 'See [claim:clm_aaaaaaaaaaaa_heuristic_1] and [claim:clm_bbbbbbbbbbbb_ollama_intern_3] for details.';
    expect(extractClaimCitations(text).sort()).toEqual([
      'clm_aaaaaaaaaaaa_heuristic_1',
      'clm_bbbbbbbbbbbb_ollama_intern_3',
    ].sort());
  });

  it('extracts attempted citations even when malformed (validation happens later)', () => {
    const text = 'Bad: [claim:not_a_claim] and [claim:clm_ZZZ].';
    const cites = extractClaimCitations(text);
    expect(cites).toContain('not_a_claim');
    expect(cites).toContain('clm_ZZZ');
    expect(isWellFormedClaimId('not_a_claim')).toBe(false);
    expect(isWellFormedClaimId('clm_ZZZ')).toBe(false);
    expect(isWellFormedClaimId('clm_aaaaaaaaaaaa_heuristic_1')).toBe(true);
  });

  it('dedupes repeated citations', () => {
    const text = '[claim:clm_aaaaaaaaaaaa_heuristic_1] [claim:clm_aaaaaaaaaaaa_heuristic_1]';
    expect(extractClaimCitations(text)).toEqual(['clm_aaaaaaaaaaaa_heuristic_1']);
  });

  it('returns empty for prose without citations', () => {
    expect(extractClaimCitations('Lots of words but no claims.')).toEqual([]);
  });
});

describe('extractContradictionDisclosures', () => {
  it('returns ids that appear in the text', () => {
    const text = 'We preserve cnt_111111111111_heuristic and cnt_222222222222_heuristic.';
    expect(
      extractContradictionDisclosures(text, [
        'cnt_111111111111_heuristic',
        'cnt_222222222222_heuristic',
        'cnt_333333333333_heuristic',
      ]).sort(),
    ).toEqual(['cnt_111111111111_heuristic', 'cnt_222222222222_heuristic']);
  });
});

describe('extractWaiverDisclosures', () => {
  it('matches by applied_to', () => {
    const text = 'See discussion of primary_sources_required.';
    expect(
      extractWaiverDisclosures(text, [
        { family: 'source_floor', applied_to: 'primary_sources_required', reason: '' },
      ]),
    ).toEqual(['source_floor.primary_sources_required']);
  });

  it('matches by family', () => {
    const text = 'We applied a source_floor waiver.';
    expect(
      extractWaiverDisclosures(text, [
        { family: 'source_floor', applied_to: 'primary_sources_required', reason: '' },
      ]),
    ).toEqual(['source_floor.primary_sources_required']);
  });

  it('does not match a waiver whose family/applied_to are absent and reason is short', () => {
    const text = 'Some unrelated prose.';
    expect(
      extractWaiverDisclosures(text, [
        { family: 'fake_family', applied_to: 'fake_applied', reason: 'short' },
      ]),
    ).toEqual([]);
  });
});
