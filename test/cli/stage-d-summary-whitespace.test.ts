import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Stage D Phase 3 amend wave (2026-05-11) — regression guard for the two
// summary-block whitespace defects fixed in D2-001 and D2-002.
//
// Both defects had the same shape: a long label whose `:` was followed
// immediately by `${value}` in the template literal, with zero spaces in
// between. In rendered stdout the value butted against the colon
// (`unresolved contradictions:42`) instead of sitting one column out from
// the colon like every sibling line in the same summary block.
//
// The fix is a one-character whitespace insertion per line. This test
// asserts via source-substring inspection rather than running the actual
// commands, because both summary blocks are pack-state-aware and need
// fixtures to invoke end-to-end.
describe('Stage D — summary-block whitespace defects fixed', () => {
  const cliSource = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'src',
      'cli.ts',
    ),
    'utf8',
  );

  it('audit summary: "unresolved contradictions:" has a space before the value', () => {
    // Fixed line: `  unresolved contradictions: ${result.unresolvedContradictions}`
    expect(cliSource).toMatch(/unresolved contradictions:\s+\$\{/);
    // Old defect form must not return: `unresolved contradictions:${...}`
    expect(cliSource).not.toMatch(/unresolved contradictions:\$\{/);
  });

  it('claim audit-density summary: "near-duplicate clusters:" has a space before the value', () => {
    // Fixed line: `  near-duplicate clusters: ${a.near_duplicate_clusters.length}`
    expect(cliSource).toMatch(/near-duplicate clusters:\s+\$\{/);
    // Old defect form must not return: `near-duplicate clusters:${...}`
    expect(cliSource).not.toMatch(/near-duplicate clusters:\$\{/);
  });
});
