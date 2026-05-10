import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** sha256 of string content as hex */
function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** sha256 of raw buffer */
function sha256Buf(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export interface TinyPackPaths {
  packDir: string;
  freezeReceiptSha256: string;
}

/**
 * Creates a minimal self-consistent frozen pack at `packDir`.
 * All freeze-receipt fingerprints are computed from the actual file content
 * so that verify-pack (inline and MJS) will PASS.
 *
 * Pack layout:
 *   research.yaml
 *   sections/01-test/
 *     claim-reviews.jsonl            (3 accepted claims)
 *     claim-synthesis-dispositions.jsonl  (1 dispositioned claim)
 *     contradiction-resolutions.jsonl     (1 resolved, 1 preserved)
 *     gate-result.json
 *   audits/
 *     pack-audit.json
 *     freeze-receipt.json
 *   synthesis/
 *     final-report.md
 *     decision-brief.md
 */
export function createTinyPack(packDir: string): TinyPackPaths {
  // ── file contents ────────────────────────────────────────────────────
  const FROZEN_AT = '2026-05-09T12:00:00.000Z';
  const TOPIC = 'A tiny test pack topic that is long enough to be valid for research-os';

  const researchYaml = `research_os_version: "0.1.1"
created_at: "2026-05-09T11:00:00.000Z"
topic: "${TOPIC}"
decision: "Test that pack publish works"
frozen_at: "${FROZEN_AT}"
sections:
  - id: "01-test"
    purpose: "Test section for pack publish fixture"
    status: "frozen"
`;

  // Use schema-conformant claim_id values (fictional but pattern-valid).
  // ClaimReviewSchema regex: ^clm_[a-f0-9]{12}_(heuristic|ollama_intern)_\d+$
  const C1 = 'clm_aaaaaaaa0001_heuristic_1';
  const C2 = 'clm_aaaaaaaa0001_heuristic_2';
  const C3 = 'clm_aaaaaaaa0001_heuristic_3';
  const C4 = 'clm_aaaaaaaa0001_heuristic_4';

  const claimReviews = [
    `{"claim_id":"${C1}","decision":"accepted_for_synthesis","reason":"test","finding_ids":[],"reviewer":"heuristic","review_method":"heuristic","created_at":"2026-05-09T11:01:00.000Z"}`,
    `{"claim_id":"${C2}","decision":"accepted_for_synthesis","reason":"test","finding_ids":[],"reviewer":"heuristic","review_method":"heuristic","created_at":"2026-05-09T11:02:00.000Z"}`,
    `{"claim_id":"${C3}","decision":"accepted_for_synthesis","reason":"test","finding_ids":[],"reviewer":"heuristic","review_method":"heuristic","created_at":"2026-05-09T11:03:00.000Z"}`,
  ].join('\n') + '\n';

  // Minimal claims.jsonl — only claim_id is required for the F-36 phantom check.
  const claims = [
    `{"claim_id":"${C1}","section_id":"01-test","source_ids":["src_aaaaaaaaaaaa"],"asserts":"test claim 1","extractor":"heuristic"}`,
    `{"claim_id":"${C2}","section_id":"01-test","source_ids":["src_aaaaaaaaaaaa"],"asserts":"test claim 2","extractor":"heuristic"}`,
    `{"claim_id":"${C3}","section_id":"01-test","source_ids":["src_aaaaaaaaaaaa"],"asserts":"test claim 3","extractor":"heuristic"}`,
    `{"claim_id":"${C4}","section_id":"01-test","source_ids":["src_aaaaaaaaaaaa"],"asserts":"test claim 4 (dispositioned)","extractor":"heuristic"}`,
  ].join('\n') + '\n';

  const dispositions =
    `{"claim_id":"${C4}","status":"parked_not_for_synthesis","reason":"test","created_at":"2026-05-09T11:04:00.000Z"}\n`;

  const contradictionResolutions =
    '{"contradiction_id":"ctr_0001","status":"resolved","reason":"not a real contradiction","resolved_at":"2026-05-09T11:05:00.000Z","resolved_by":"operator"}\n' +
    '{"contradiction_id":"ctr_0002","status":"preserved","reason":"complementary claims","resolved_at":"2026-05-09T11:06:00.000Z","resolved_by":"operator"}\n';

  const gateResult = JSON.stringify(
    {
      section_id: '01-test',
      verdict: 'warn',
      synthesis_eligible: true,
      checked_at: '2026-05-09T11:10:00.000Z',
      summary: 'Test gate result — warn with synthesis eligible',
      gate_results: [],
      failures: [],
      warnings: [],
      waivers_applied: [],
      blocking_reasons: [],
      next_actions: [],
      claim_counts: {
        total: 4,
        candidate: 4,
        with_evidence_excerpt: 3,
        with_source_hashes: 3,
        with_scope: 3,
        with_not: 3,
        universal_scope_null: 0,
        orphans: 0,
      },
      source_counts: {
        total: 1,
        primary: 1,
        secondary: 0,
        forum: 0,
        benchmark: 0,
        docs: 0,
        unknown: 0,
        independent_publishers: 1,
        failed_fetches: 0,
      },
      contradiction_counts: { total: 2, unresolved: 0, blocking: 0, by_type: {} },
      freshness_summary: {
        policy_required: false,
        max_source_age_months: null,
        stale_source_policy: 'warn',
        stale_count: 0,
        unknown_date_count: 0,
      },
      scope_integrity_summary: {
        universal_claims: 0,
        scoped_claims: 3,
        with_not_constraint: 3,
        overgen_risks_total: 0,
        overgen_risks_blocking: 0,
      },
    },
    null,
    2,
  ) + '\n';

  const packAudit = JSON.stringify(
    {
      pack_id: 'testpack001',
      pack_topic: TOPIC,
      generated_at: '2026-05-09T11:15:00.000Z',
      verdict: 'ready_for_synthesis',
      synthesis_allowed: true,
      section_summaries: [
        {
          section_id: '01-test',
          purpose: 'Test section',
          status: 'frozen',
          has_gate_run: true,
          has_review_run: true,
          gate_verdict: 'warn',
          synthesis_eligible: true,
          candidate_claims: 4,
          accepted_claims: 3,
          repair_claims: 0,
          rejected_claims: 0,
          dispositioned_claims: 1,
          blocking_reasons: [],
          cowork_handoff_mode: 'synthesis_ready',
          workspace_allowed: true,
        },
      ],
      claim_summary: { total: 4, accepted_for_synthesis: 3, rejected: 0, repair: 0 },
      source_summary: { total: 1 },
      contradiction_summary: { total: 2, unresolved: 0 },
      review_summary: {},
      waiver_summary: { total: 0 },
      readiness_summary: { ready: true, blocking_reasons: [] },
      audit_files: [],
      blocking_reasons: [],
      warnings: [],
      next_actions: [],
    },
    null,
    2,
  ) + '\n';

  const finalReport = `# Tiny test pack final report

## Summary

This is the executive summary of the tiny test pack used for pack publish testing.
The bundle thesis holds.

## Findings

1. Finding one: [claim:${C1}] supports this finding.
2. Finding two: [claim:${C2}] and [claim:${C3}] together demonstrate the point.
`;

  const decisionBrief = `# Decision brief

## Synthesis disposition

All 3 accepted claims are available for synthesis. No active blockers.
`;

  // ── write files ──────────────────────────────────────────────────────
  const sectDir = join(packDir, 'sections/01-test');
  const auditsDir = join(packDir, 'audits');
  const synthDir = join(packDir, 'synthesis');
  for (const d of [sectDir, auditsDir, synthDir]) mkdirSync(d, { recursive: true });

  // Write artifact files before computing sha256s
  const artifacts: Array<{ relPath: string; content: string }> = [
    { relPath: 'research.yaml', content: researchYaml },
    { relPath: 'sections/01-test/claims.jsonl', content: claims },
    { relPath: 'sections/01-test/claim-reviews.jsonl', content: claimReviews },
    { relPath: 'sections/01-test/claim-synthesis-dispositions.jsonl', content: dispositions },
    { relPath: 'sections/01-test/contradiction-resolutions.jsonl', content: contradictionResolutions },
    { relPath: 'audits/01-test-gate.json', content: gateResult },
    { relPath: 'audits/pack-audit.json', content: packAudit },
  ];

  const synthArtifacts: Array<{ relPath: string; content: string }> = [
    { relPath: 'synthesis/final-report.md', content: finalReport },
    { relPath: 'synthesis/decision-brief.md', content: decisionBrief },
  ];

  for (const { relPath, content } of [...artifacts, ...synthArtifacts]) {
    writeFileSync(join(packDir, relPath), content, 'utf8');
  }

  // ── compute sha256s and build freeze receipt ─────────────────────────
  function fingerprintArtifact(relPath: string, content: string) {
    const buf = Buffer.from(content, 'utf8');
    return { path: relPath, sha256: sha256Buf(buf), bytes: buf.length };
  }

  const canonicalHashes = artifacts.map(({ relPath, content }) =>
    fingerprintArtifact(relPath, content),
  );
  const synthHashes = synthArtifacts.map(({ relPath, content }) =>
    fingerprintArtifact(relPath, content),
  );

  const freezeReceipt = JSON.stringify(
    {
      pack_id: 'testpack001',
      pack_topic: TOPIC,
      frozen_at: FROZEN_AT,
      verdict: 'frozen',
      pack_audit_hash: sha256(packAudit),
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

  const freezeReceiptSha256 = sha256Buf(Buffer.from(freezeReceipt, 'utf8'));

  return { packDir, freezeReceiptSha256 };
}
