import { describe, it, expect } from 'vitest';
import { generateReadme } from '../../src/pack/publish/readme.js';
import type { PackManifest } from '../../src/pack/publish/schema.js';

function baseManifest(overrides: Partial<PackManifest> = {}): PackManifest {
  return {
    name: 'test-pack',
    topic: 'A test topic',
    frozen_at: '2026-05-09T12:00:00.000Z',
    research_os_version: '0.1.1',
    sections: [
      { id: '01-section', accepted_claims: 5, gate: 'warn', synthesis_eligible: true },
    ],
    totals: { sections: 1, accepted_claims: 5, dispositioned: 1, unresolved_contradictions: 0 },
    freeze_receipt_sha256: 'a'.repeat(64),
    operator_notes: '',
    ...overrides,
  };
}

const FINAL_REPORT_WITH_SUMMARY = `# Test Pack

## Summary

This is the executive summary text.
It spans multiple lines.

## Findings

Some findings here.
`;

const FINAL_REPORT_NO_SUMMARY = `# Test Pack

## Findings

Some findings here.
`;

describe('generateReadme', () => {
  it('is deterministic — same inputs produce same output', () => {
    const manifest = baseManifest();
    const r1 = generateReadme(manifest, FINAL_REPORT_WITH_SUMMARY);
    const r2 = generateReadme(manifest, FINAL_REPORT_WITH_SUMMARY);
    expect(r1).toBe(r2);
  });

  it('includes pack name as heading', () => {
    const readme = generateReadme(baseManifest(), FINAL_REPORT_WITH_SUMMARY);
    expect(readme).toContain('# test-pack\n');
  });

  it('extracts summary section from final-report', () => {
    const readme = generateReadme(baseManifest(), FINAL_REPORT_WITH_SUMMARY);
    expect(readme).toContain('This is the executive summary text.');
    expect(readme).toContain('It spans multiple lines.');
    expect(readme).not.toContain('## Findings');
  });

  it('uses "Preserved contradiction records: N" phrasing when field is present', () => {
    const manifest = baseManifest({
      totals: {
        sections: 1,
        accepted_claims: 5,
        dispositioned: 1,
        unresolved_contradictions: 0,
        preserved_contradiction_records: 42,
      },
    });
    const readme = generateReadme(manifest, FINAL_REPORT_WITH_SUMMARY);
    expect(readme).toContain('Preserved contradiction records: 42');
    expect(readme).not.toContain('unresolved contradictions');
  });

  it('falls back to "N unresolved contradictions" when preserved field is absent', () => {
    const manifest = baseManifest({
      totals: {
        sections: 1,
        accepted_claims: 5,
        dispositioned: 1,
        unresolved_contradictions: 0,
      },
    });
    const readme = generateReadme(manifest, FINAL_REPORT_WITH_SUMMARY);
    expect(readme).toContain('0 unresolved contradictions');
    expect(readme).not.toContain('Preserved contradiction records');
  });

  it('includes section table with correct data', () => {
    const readme = generateReadme(baseManifest(), FINAL_REPORT_WITH_SUMMARY);
    expect(readme).toContain('| 01-section | 5 | warn | yes |');
  });

  it('includes operator notes section when provided', () => {
    const manifest = baseManifest({ operator_notes: 'My arc notes' });
    const readme = generateReadme(manifest, FINAL_REPORT_WITH_SUMMARY);
    expect(readme).toContain('## Operator notes');
    expect(readme).toContain('My arc notes');
  });

  it('omits operator notes section when empty', () => {
    const readme = generateReadme(baseManifest(), FINAL_REPORT_WITH_SUMMARY);
    expect(readme).not.toContain('## Operator notes');
  });

  it('handles missing summary section gracefully', () => {
    const readme = generateReadme(baseManifest(), FINAL_REPORT_NO_SUMMARY);
    expect(readme).toContain('## Executive summary');
    // Summary block should be empty but readme should still be valid
    expect(readme).toContain('## How to read this pack');
  });

  it('formats frozen date as YYYY-MM-DD', () => {
    const readme = generateReadme(baseManifest(), FINAL_REPORT_WITH_SUMMARY);
    expect(readme).toContain('2026-05-09');
    expect(readme).not.toContain('T12:00:00.000Z');
  });
});
