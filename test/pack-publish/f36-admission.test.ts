import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, appendFileSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTinyPack } from './helpers.js';
import { deriveManifest } from '../../src/pack/publish/manifest.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ros-test-f36-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const C1 = 'clm_aaaaaaaa0001_heuristic_1';
const C2 = 'clm_aaaaaaaa0001_heuristic_2';
const C3 = 'clm_aaaaaaaa0001_heuristic_3';
const PHANTOM = 'clm_ffffffffffff_heuristic_99';

/**
 * F-36 admission tests — closure-ledger counting reconciliation.
 *
 * The fixture (createTinyPack) writes 3 unique accepted claims, all of which
 * exist in claims.jsonl. pack-audit.json::section_summaries[0].accepted_claims
 * is 3, matching the effective count by default.
 */

describe('F-36: deriveManifest legacy-mismatch as soft warn', () => {
  it('admits when claim-reviews has a duplicate accepted row for the same claim_id (no legacy mismatch)', () => {
    // Append a duplicate accepted_for_synthesis row for an existing claim_id —
    // mirrors XRPL Section 07 review-window overlap. Effective set still 3
    // unique; pack-audit count remains 3 (no legacy mismatch). Should admit.
    const { packDir } = createTinyPack(tmpDir);
    appendFileSync(
      join(packDir, 'sections/01-test/claim-reviews.jsonl'),
      `{"claim_id":"${C1}","decision":"accepted_for_synthesis","reason":"window-overlap","finding_ids":[],"reviewer":"heuristic","review_method":"heuristic","created_at":"2026-05-09T11:30:00.000Z"}\n`,
    );
    const warnings: string[] = [];
    const manifest = deriveManifest(packDir, 'test-package', '', warnings);
    expect(manifest.sections[0].accepted_claims).toBe(3);
    expect(warnings.length).toBe(0);
  });

  it('warns (does not refuse) when pack-audit count differs from effective accepted set', () => {
    // Mirror the XRPL Section 07 shape: pack-audit recorded 4 accepted but the
    // effective unique set is 3. Edit pack-audit.json to inject a higher
    // legacy count; manifest should still admit with the effective count and
    // surface a warning.
    const { packDir } = createTinyPack(tmpDir);
    const auditPath = join(packDir, 'audits/pack-audit.json');
    const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
    audit.section_summaries[0].accepted_claims = 4; // legacy count > effective
    writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');

    const warnings: string[] = [];
    const manifest = deriveManifest(packDir, 'test-package', '', warnings);

    expect(manifest.sections[0].accepted_claims).toBe(3); // effective wins
    expect(warnings.some((w) => /legacy pack-audit/.test(w))).toBe(true);
    expect(warnings.some((w) => /Using effective count/.test(w))).toBe(true);
  });

  it('writes effective count to manifest.accepted_claims, not legacy or raw', () => {
    // Append a duplicate accepted row AND inject a legacy mismatch — the
    // manifest's accepted_claims should still equal the effective set size.
    const { packDir } = createTinyPack(tmpDir);
    appendFileSync(
      join(packDir, 'sections/01-test/claim-reviews.jsonl'),
      `{"claim_id":"${C1}","decision":"accepted_for_synthesis","reason":"dup","finding_ids":[],"reviewer":"heuristic","review_method":"heuristic","created_at":"2026-05-09T11:30:00.000Z"}\n` +
        `{"claim_id":"${C2}","decision":"accepted_for_synthesis","reason":"dup","finding_ids":[],"reviewer":"heuristic","review_method":"heuristic","created_at":"2026-05-09T11:31:00.000Z"}\n`,
    );
    const auditPath = join(packDir, 'audits/pack-audit.json');
    const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
    audit.section_summaries[0].accepted_claims = 5; // raw=5, effective=3
    writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');

    const warnings: string[] = [];
    const manifest = deriveManifest(packDir, 'test-package', '', warnings);
    expect(manifest.sections[0].accepted_claims).toBe(3);
    expect(manifest.totals.accepted_claims).toBe(3);
  });
});

describe('F-36: deriveManifest refuses on real integrity problems', () => {
  it('refuses when an effective accepted claim_id is absent from claims.jsonl (phantom)', () => {
    const { packDir } = createTinyPack(tmpDir);
    appendFileSync(
      join(packDir, 'sections/01-test/claim-reviews.jsonl'),
      `{"claim_id":"${PHANTOM}","decision":"accepted_for_synthesis","reason":"phantom","finding_ids":[],"reviewer":"heuristic","review_method":"heuristic","created_at":"2026-05-09T11:30:00.000Z"}\n`,
    );
    // Stage C Phase 3 C1-009: error reworded into operator-actionable
    // phrasing ("references a claim that does not exist") and converted to
    // ResearchOSError(INTAKE_VALIDATION). Assert on the structured code
    // rather than legacy "phantom" substring.
    try {
      deriveManifest(packDir, 'test-package');
      throw new Error('expected throw');
    } catch (err) {
      expect((err as { name?: string }).name).toBe('ResearchOSError');
      expect((err as { code?: string }).code).toBe('INTAKE_VALIDATION');
      expect((err as Error).message).toMatch(/does not exist|absent|not exist/i);
    }
  });

  it('refuses when two review rows for the same claim_id at the same created_at disagree', () => {
    const { packDir } = createTinyPack(tmpDir);
    // Two rows for C1 at the exact same timestamp with conflicting decisions.
    appendFileSync(
      join(packDir, 'sections/01-test/claim-reviews.jsonl'),
      `{"claim_id":"${C1}","decision":"rejected","reason":"conflict-row","finding_ids":[],"reviewer":"heuristic","review_method":"heuristic","created_at":"2026-05-09T11:01:00.000Z"}\n`,
    );
    // Stage C Phase 3 C1-009: error reworded — "incompatible decisions"
    // → "incompatible review decisions ... at the same timestamp". Assert
    // on the structured code.
    try {
      deriveManifest(packDir, 'test-package');
      throw new Error('expected throw');
    } catch (err) {
      expect((err as { name?: string }).name).toBe('ResearchOSError');
      expect((err as { code?: string }).code).toBe('INTAKE_VALIDATION');
      expect((err as Error).message).toMatch(/incompatible/i);
    }
  });

  it('refuses when section gate is not synthesis_eligible', () => {
    const { packDir } = createTinyPack(tmpDir);
    const gatePath = join(packDir, 'audits/01-test-gate.json');
    const gate = JSON.parse(readFileSync(gatePath, 'utf8'));
    gate.synthesis_eligible = false;
    gate.verdict = 'fail';
    writeFileSync(gatePath, JSON.stringify(gate, null, 2) + '\n', 'utf8');
    // Stage C Phase 3 C1-009: error reworded — "not synthesis_eligible" →
    // "synthesis_eligible=false". Assert on the structured code + concept.
    try {
      deriveManifest(packDir, 'test-package');
      throw new Error('expected throw');
    } catch (err) {
      expect((err as { name?: string }).name).toBe('ResearchOSError');
      expect((err as { code?: string }).code).toBe('INTAKE_VALIDATION');
      expect((err as Error).message).toMatch(/synthesis_eligible/);
    }
  });

  it('warns (not refuses) when claims.jsonl is absent — phantom check skipped', () => {
    const { packDir } = createTinyPack(tmpDir);
    rmSync(join(packDir, 'sections/01-test/claims.jsonl'));
    const warnings: string[] = [];
    const manifest = deriveManifest(packDir, 'test-package', '', warnings);
    expect(manifest.sections[0].accepted_claims).toBe(3);
    expect(warnings.some((w) => /claims\.jsonl absent/.test(w))).toBe(true);
  });
});

describe('F-36: latest-decision-wins resolves repair-then-accept and accept-then-repair', () => {
  it('counts a claim accepted at T2 even if it was needs_scope_repair at T1', () => {
    // Section's third claim (C3) was not initially accepted; we add an earlier
    // needs_scope_repair row and confirm the later accepted_for_synthesis still
    // wins. The fixture's existing rows already have C3 accepted at T1; we
    // prepend an earlier "needs_scope_repair" row.
    const { packDir } = createTinyPack(tmpDir);
    const reviewsPath = join(packDir, 'sections/01-test/claim-reviews.jsonl');
    const original = readFileSync(reviewsPath, 'utf8');
    const earlierRepair = `{"claim_id":"${C3}","decision":"needs_scope_repair","reason":"early","finding_ids":[],"reviewer":"heuristic","review_method":"heuristic","created_at":"2026-05-09T10:00:00.000Z"}\n`;
    writeFileSync(reviewsPath, earlierRepair + original, 'utf8');
    const manifest = deriveManifest(packDir, 'test-package');
    expect(manifest.sections[0].accepted_claims).toBe(3);
  });

  it('removes a claim from accepted set when a later row marks it rejected', () => {
    const { packDir } = createTinyPack(tmpDir);
    appendFileSync(
      join(packDir, 'sections/01-test/claim-reviews.jsonl'),
      `{"claim_id":"${C2}","decision":"rejected","reason":"late-rejection","finding_ids":[],"reviewer":"heuristic","review_method":"heuristic","created_at":"2026-05-09T12:00:00.000Z"}\n`,
    );
    // pack-audit still says 3, but effective set is now 2. Should warn + admit.
    const warnings: string[] = [];
    const manifest = deriveManifest(packDir, 'test-package', '', warnings);
    expect(manifest.sections[0].accepted_claims).toBe(2);
    expect(warnings.some((w) => /legacy pack-audit/.test(w))).toBe(true);
  });
});

describe('F-36: regression — already-coherent packs admit unchanged', () => {
  it('admits the tiny fixture with no warnings (effective == legacy == 3)', () => {
    const { packDir } = createTinyPack(tmpDir);
    const warnings: string[] = [];
    const manifest = deriveManifest(packDir, 'test-package', '', warnings);
    expect(manifest.sections[0].accepted_claims).toBe(3);
    expect(manifest.totals.accepted_claims).toBe(3);
    expect(warnings.length).toBe(0);
  });
});
