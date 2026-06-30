import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTinyPack } from './helpers.js';
import { deriveManifest } from '../../src/pack/publish/manifest.js';
import { RESEARCH_OS_VERSION } from '../../src/index.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ros-test-manifest-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('deriveManifest', () => {
  it('derives correct manifest from a valid frozen pack', () => {
    const { packDir, freezeReceiptSha256 } = createTinyPack(tmpDir);
    const manifest = deriveManifest(packDir, 'test-package');

    expect(manifest.name).toBe('test-package');
    // Track the single source of truth (RESEARCH_OS_VERSION), not a pinned
    // literal — deriveManifest records the freezing build's version, so a
    // hardcoded version here would (and did) break on every release bump.
    expect(manifest.research_os_version).toBe(RESEARCH_OS_VERSION);
    expect(manifest.frozen_at).toBe('2026-05-09T12:00:00.000Z');
    expect(manifest.sections).toHaveLength(1);
    expect(manifest.sections[0].id).toBe('01-test');
    expect(manifest.sections[0].accepted_claims).toBe(3);
    expect(manifest.sections[0].gate).toBe('warn');
    expect(manifest.sections[0].synthesis_eligible).toBe(true);
    expect(manifest.totals.sections).toBe(1);
    expect(manifest.totals.accepted_claims).toBe(3);
    expect(manifest.totals.dispositioned).toBe(1);
    expect(manifest.totals.unresolved_contradictions).toBe(0);
    expect(manifest.freeze_receipt_sha256).toBe(freezeReceiptSha256);
  });

  it('sets preserved_contradiction_records when non-zero', () => {
    const { packDir } = createTinyPack(tmpDir);
    const manifest = deriveManifest(packDir, 'test-package');
    // Fixture has 1 resolved + 1 preserved = 2 non-unresolved
    expect(manifest.totals.preserved_contradiction_records).toBe(2);
  });

  it('uses operator_notes when provided', () => {
    const { packDir } = createTinyPack(tmpDir);
    const manifest = deriveManifest(packDir, 'test-package', 'my operator notes');
    expect(manifest.operator_notes).toBe('my operator notes');
  });

  it('defaults operator_notes to empty string', () => {
    const { packDir } = createTinyPack(tmpDir);
    const manifest = deriveManifest(packDir, 'test-package');
    expect(manifest.operator_notes).toBe('');
  });

  it('refuses if freeze-receipt.json is missing', () => {
    const { packDir } = createTinyPack(tmpDir);
    const { rmSync: rm } = require('node:fs');
    rm(join(packDir, 'audits/freeze-receipt.json'));
    expect(() => deriveManifest(packDir, 'test-package')).toThrow(/freeze-receipt/);
  });

  it('refuses if research.yaml.frozen_at is null', () => {
    const { packDir } = createTinyPack(tmpDir);
    // Overwrite research.yaml without frozen_at
    const { writeFileSync } = require('node:fs');
    writeFileSync(
      join(packDir, 'research.yaml'),
      `research_os_version: "0.1.1"\ncreated_at: "2026-05-09T11:00:00.000Z"\ntopic: "a topic long enough to be valid"\ndecision: "test"\nsections:\n  - id: "01-test"\n    purpose: "test"\n    status: "frozen"\n`,
      'utf8',
    );
    expect(() => deriveManifest(packDir, 'test-package')).toThrow(/frozen/i);
  });

  it('refuses if gate.json is missing for a section', () => {
    const { packDir } = createTinyPack(tmpDir);
    const { rmSync: rm } = require('node:fs');
    rm(join(packDir, 'audits/01-test-gate.json'));
    expect(() => deriveManifest(packDir, 'test-package')).toThrow(/gate\.json/);
  });

  // F-36: legacy accepted_claims mismatch between claim-reviews and pack-audit
  // is now a soft warn, not a refusal — the effective accepted set is canonical
  // and pack-audit's count is preserved as legacy. Tests for the new behavior
  // live in test/pack-publish/f36-admission.test.ts. The mismatch case here
  // also requires the new claim_id to exist in claims.jsonl (phantom check),
  // so we add it to both files.

  it('refuses if unresolved contradictions remain', () => {
    const { packDir } = createTinyPack(tmpDir);
    // Overwrite contradiction-resolutions to have an unresolved entry
    const { writeFileSync } = require('node:fs');
    writeFileSync(
      join(packDir, 'sections/01-test/contradiction-resolutions.jsonl'),
      '{"contradiction_id":"ctr_0001","status":"unresolved","reason":"still open","resolved_at":"2026-05-09T11:05:00.000Z","resolved_by":"operator"}\n',
    );
    expect(() => deriveManifest(packDir, 'test-package')).toThrow(/unresolved/);
  });
});
