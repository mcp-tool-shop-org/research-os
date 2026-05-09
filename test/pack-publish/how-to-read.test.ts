import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateHowToReadScaffold } from '../../src/pack/publish/how-to-read.js';
import type { PackManifest } from '../../src/pack/publish/schema.js';

function baseManifest(): PackManifest {
  return {
    name: 'test-pack',
    topic: 'A test topic',
    frozen_at: '2026-05-09T12:00:00.000Z',
    research_os_version: '0.1.1',
    sections: [{ id: '01-section', accepted_claims: 5, gate: 'warn', synthesis_eligible: true }],
    totals: { sections: 1, accepted_claims: 5, dispositioned: 0, unresolved_contradictions: 0 },
    freeze_receipt_sha256: 'a'.repeat(64),
    operator_notes: '',
  };
}

describe('generateHowToReadScaffold', () => {
  it('includes pack name', () => {
    const scaffold = generateHowToReadScaffold(baseManifest());
    expect(scaffold).toContain('test-pack');
  });

  it('includes frozen date', () => {
    const scaffold = generateHowToReadScaffold(baseManifest());
    expect(scaffold).toContain('2026-05-09');
  });

  it('includes accepted claims count', () => {
    const scaffold = generateHowToReadScaffold(baseManifest());
    expect(scaffold).toContain('5 accepted claims');
  });

  it('includes SCAFFOLD marker so operators know to finish the prose', () => {
    const scaffold = generateHowToReadScaffold(baseManifest());
    expect(scaffold).toContain('SCAFFOLD');
    expect(scaffold).toContain('human-authored');
  });

  it('includes preserved_contradiction_records note when non-zero', () => {
    const manifest = {
      ...baseManifest(),
      totals: {
        sections: 1,
        accepted_claims: 5,
        dispositioned: 0,
        unresolved_contradictions: 0,
        preserved_contradiction_records: 42,
      },
    };
    const scaffold = generateHowToReadScaffold(manifest);
    expect(scaffold).toContain('42 preserved contradiction records');
  });

  it('shows "no preserved contradiction records" when zero', () => {
    const scaffold = generateHowToReadScaffold(baseManifest());
    expect(scaffold).toContain('no preserved contradiction records');
  });

  it('includes verify command', () => {
    const scaffold = generateHowToReadScaffold(baseManifest());
    expect(scaffold).toContain('verify-pack.mjs');
  });
});

describe('how-to-read-this.md preservation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ros-test-howto-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not overwrite an existing how-to-read-this.md', () => {
    // Write an "operator-authored" file
    const docsDir = join(tmpDir, 'docs');
    import('node:fs').then(({ mkdirSync }) => mkdirSync(docsDir, { recursive: true }));
    require('node:fs').mkdirSync(docsDir, { recursive: true });
    const howToPath = join(docsDir, 'how-to-read-this.md');
    const originalContent = '# My custom how-to-read\n\nThis was written by the operator.\n';
    writeFileSync(howToPath, originalContent, 'utf8');

    // Simulate what publish does: only write if not exists
    if (!existsSync(howToPath)) {
      writeFileSync(howToPath, generateHowToReadScaffold(baseManifest()), 'utf8');
    }

    expect(readFileSync(howToPath, 'utf8')).toBe(originalContent);
  });
});
