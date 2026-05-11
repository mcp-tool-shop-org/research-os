import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { verifyPack, PUBLISH_GENERATED_PATHS } from '../../src/pack/publish/verify.js';
import { SYNTHESIS_FILES } from '../../src/freeze/run.js';
import { generateReadme } from '../../src/pack/publish/readme.js';
import { generateHowToReadScaffold } from '../../src/pack/publish/how-to-read.js';
import { deriveManifest } from '../../src/pack/publish/manifest.js';
import { copyDir } from '../../src/pack/publish/copy.js';
import { createTinyPack } from './helpers.js';

// D-RE-001: verify-pack must recognize ALL 5 synthesis files (including
// synthesis/cross-section-map.json + .md) as publish-generated, not as
// orphans. The previous PUBLISH_GENERATED_PATHS only listed 3 of 5 — a
// real-pack publish (which emits all 5) would FAIL orphan detection.
//
// The fix exports the canonical SYNTHESIS_FILES from freeze/run.ts and
// derives PUBLISH_GENERATED_PATHS from it. These tests verify the fix
// holds end-to-end and that the single-source-of-truth invariant cannot
// silently regress.

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function sha256Buf(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Build a published-package-shaped directory at `pkgDir` that contains ALL
 * 5 synthesis files at the top level (cross-section-map.json + .md plus
 * the 3 in createTinyPack). Returns the manifest so the test can use it.
 *
 * The synthesis files at the package root are NOT fingerprinted in the
 * freeze-receipt (they're publish-generated copies). Only the source
 * pack's synthesis files inside pack/synthesis/* are fingerprinted, as
 * createTinyPack already does.
 */
function buildFullSynthesisPackage(packDir: string, pkgDir: string): void {
  // Step 1: build a tiny pack at packDir. createTinyPack only emits 2
  // synthesis files (final-report.md + decision-brief.md). We extend the
  // fingerprinted set by ALSO writing the other 3 synthesis files into
  // the source pack and re-issuing the freeze-receipt.
  createTinyPack(packDir);

  // Step 2: extend pack/synthesis with the 3 additional synthesis files
  // and update the freeze-receipt to fingerprint them.
  const FROZEN_AT = '2026-05-09T12:00:00.000Z';
  const TOPIC = 'A tiny test pack topic that is long enough to be valid for research-os';

  const C1 = 'clm_aaaaaaaa0001_heuristic_1';
  const C2 = 'clm_aaaaaaaa0001_heuristic_2';
  const C3 = 'clm_aaaaaaaa0001_heuristic_3';

  const crossSectionMapJson = JSON.stringify(
    {
      pack_id: 'testpack001',
      generated_at: '2026-05-09T11:20:00.000Z',
      sections: ['01-test'],
      cross_section_claims: [],
      bridges: [],
    },
    null,
    2,
  ) + '\n';
  const crossSectionMapMd = `# Cross-section map\n\nNo cross-section bridges in this tiny test pack.\n`;
  const workingReport = `# Working report\n\n## Method\n\nTiny test pack working report.\n`;

  writeFileSync(join(packDir, 'synthesis/cross-section-map.json'), crossSectionMapJson, 'utf8');
  writeFileSync(join(packDir, 'synthesis/cross-section-map.md'), crossSectionMapMd, 'utf8');
  writeFileSync(join(packDir, 'synthesis/working-report.md'), workingReport, 'utf8');

  // Re-read the previously written canonical artifacts so we can rebuild
  // the receipt with synthesis_hashes covering all 5.
  const canonicalArtifacts: Array<{ relPath: string }> = [
    { relPath: 'research.yaml' },
    { relPath: 'sections/01-test/claims.jsonl' },
    { relPath: 'sections/01-test/claim-reviews.jsonl' },
    { relPath: 'sections/01-test/claim-synthesis-dispositions.jsonl' },
    { relPath: 'sections/01-test/contradiction-resolutions.jsonl' },
    { relPath: 'audits/01-test-gate.json' },
    { relPath: 'audits/pack-audit.json' },
  ];
  const synthArtifacts: Array<{ relPath: string }> = [
    { relPath: 'synthesis/cross-section-map.json' },
    { relPath: 'synthesis/cross-section-map.md' },
    { relPath: 'synthesis/decision-brief.md' },
    { relPath: 'synthesis/working-report.md' },
    { relPath: 'synthesis/final-report.md' },
  ];

  function fingerprint(relPath: string) {
    const buf = readFileSync(join(packDir, relPath));
    return { path: relPath, sha256: sha256Buf(buf), bytes: buf.length };
  }

  const canonicalHashes = canonicalArtifacts.map((a) => fingerprint(a.relPath));
  const synthHashes = synthArtifacts.map((a) => fingerprint(a.relPath));
  const packAuditRaw = readFileSync(join(packDir, 'audits/pack-audit.json'), 'utf8');

  const freezeReceipt = JSON.stringify(
    {
      pack_id: 'testpack001',
      pack_topic: TOPIC,
      frozen_at: FROZEN_AT,
      verdict: 'frozen',
      pack_audit_hash: sha256(packAuditRaw),
      handoff_hash: 'a'.repeat(64),
      synthesis_hashes: synthHashes,
      canonical_artifact_hashes: canonicalHashes,
      accepted_claim_ids: [C1, C2, C3],
      cited_claim_ids: [C1, C2, C3],
      uncited_accepted_claim_ids: [],
      unresolved_contradictions: [],
      waivers_disclosed: [],
      sections: [
        { section_id: '01-test', status: 'frozen', accepted_claims: 3, sources: 1, contradictions: 2 },
      ],
      source_count: 1,
      claim_count: 4,
      contradiction_count: 2,
      review_finding_count: 0,
      gate_result_count: 1,
      integrity_checks: [],
    },
    null,
    2,
  ) + '\n';

  writeFileSync(join(packDir, 'audits/freeze-receipt.json'), freezeReceipt, 'utf8');

  // Step 3: build the published package layout that publish() would
  // produce: pack/ + synthesis/ (all 5 files) + pack.manifest.json +
  // README.md + docs/how-to-read-this.md.
  mkdirSync(pkgDir, { recursive: true });
  copyDir(packDir, join(pkgDir, 'pack'));

  const synthDir = join(pkgDir, 'synthesis');
  mkdirSync(synthDir, { recursive: true });
  for (const a of synthArtifacts) {
    writeFileSync(
      join(pkgDir, a.relPath),
      readFileSync(join(packDir, a.relPath), 'utf8'),
      'utf8',
    );
  }

  const warnings: string[] = [];
  const manifest = deriveManifest(packDir, 'tiny-test-pkg', '', warnings);
  writeFileSync(
    join(pkgDir, 'pack.manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );

  const finalReport = readFileSync(join(packDir, 'synthesis/final-report.md'), 'utf8');
  writeFileSync(join(pkgDir, 'README.md'), generateReadme(manifest, finalReport), 'utf8');

  const docsDir = join(pkgDir, 'docs');
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(join(docsDir, 'how-to-read-this.md'), generateHowToReadScaffold(manifest), 'utf8');
}

let outerTmp: string;

beforeEach(() => {
  outerTmp = mkdtempSync(join(tmpdir(), 'ros-test-cross-section-map-'));
});

afterEach(() => {
  rmSync(outerTmp, { recursive: true, force: true });
});

describe('verifyPack — cross-section-map synthesis files (D-RE-001)', () => {
  it('PASSES on a real-pack-shaped package containing all 5 synthesis files', () => {
    const packDir = join(outerTmp, 'source-pack');
    const pkgDir = join(outerTmp, 'package');
    mkdirSync(packDir, { recursive: true });

    buildFullSynthesisPackage(packDir, pkgDir);

    // Sanity: all 5 synthesis files exist at the package root.
    for (const rel of SYNTHESIS_FILES) {
      const target = join(pkgDir, rel);
      // statSync would throw on missing; existsSync via readFileSync proxy is fine.
      expect(readFileSync(target, 'utf8').length).toBeGreaterThan(0);
    }

    const result = verifyPack(pkgDir);
    if (!result.pass) {
      // surface the reason so a regression shows it in test output
      throw new Error(`verifyPack failed unexpectedly: ${result.reason}`);
    }
    expect(result.pass).toBe(true);
  });

  it('single-source-of-truth invariant: every SYNTHESIS_FILES entry is in PUBLISH_GENERATED_PATHS', () => {
    // This test guards against re-introducing a hardcoded synthesis list
    // in verify.ts. If someone removes the spread of SYNTHESIS_FILES or
    // adds a new synthesis output to freeze without updating the publish
    // allowlist, this test fails.
    expect(SYNTHESIS_FILES.length).toBeGreaterThan(0);
    for (const rel of SYNTHESIS_FILES) {
      expect(PUBLISH_GENERATED_PATHS.has(rel)).toBe(true);
    }
  });
});
