import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, appendFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { triage } from '../../src/triage/index.js';
import { gate } from '../../src/gates/index.js';
import { extractWaiverDisclosures } from '../../src/freeze/citations.js';

// Stage B proactive hardenings (agent key: gates)
//   B-TRIAGE-001 — triage readClaims() now collects {path,line,reason} for
//     unparseable claims.jsonl lines and surfaces them on TriageSummary.
//     malformed_jsonl_warnings (mirrors gate B-C-005), instead of silently
//     dropping them and undercounting candidate_claims.
//   B-GATES-002 — gate readSourceCards() now skips-with-warning a corrupt
//     source card (feeding the same malformed_jsonl_warnings collector)
//     instead of aborting the whole gate run with an opaque ZodError.
//   B-FREEZE-001 — extractWaiverDisclosures() no longer counts an internal
//     snake_case token embedded inside a larger identifier as a deliberate
//     waiver disclosure; it requires a standalone token (or the family+
//     applied_to pair / reason-prefix).

let workDir: string;
let packPath: string;

const VALID_CLAIM = (id: string) =>
  JSON.stringify({
    claim_id: id,
    section_id: '01-test',
    source_ids: ['src_aaaaaaaaaaaa'],
    source_hashes: ['a'.repeat(64)],
    asserts: 'A long substantive assertion that comfortably clears the floor.',
    scope: 'narrow',
    not: 'broad',
    evidence_excerpt_ids: ['ex_aaaaaaaaaaaa_001'],
    evidence_excerpt: 'literal',
    evidence_location: null,
    confidence: 'low',
    extractor: 'ollama-intern',
    extraction_method: 'ollama_intern_propositional',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
  });

function validCardObject() {
  const sourceId = 'src_aaaaaaaaaaaa';
  return {
    source_id: sourceId,
    receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1`,
    section_id: '01-test',
    url: 'https://example.com',
    final_url: 'https://example.com',
    fetched_at: '2026-05-06T22:00:00.000Z',
    publisher: 'p1',
    published_at: null,
    title: 'T',
    source_type: 'secondary',
    relevance: 'unknown',
    key_points: [],
    limitations: [],
    asserts: 'A',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-06T22:00:00.000Z',
  };
}

async function setupPack(): Promise<void> {
  const r = await init({ topic: 'Stage B gates fixture', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: '01-test', purpose: 'probe', packPath });
  // One valid source card + receipt so gate readers have shape.
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  await writeFile(join(cardDir, 'src_aaaaaaaaaaaa.json'), JSON.stringify(validCardObject()), 'utf8');
  await appendFile(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    JSON.stringify({
      receipt_id: 'rcpt_aaaaaaaaaaaa_1',
      source_id: 'src_aaaaaaaaaaaa',
      section_id: '01-test',
      requested_url: 'https://example.com',
      final_url: 'https://example.com',
      status: 200,
      status_text: 'OK',
      content_type: 'text/html',
      fetched_at: '2026-05-06T22:00:00.000Z',
      byte_count: 100,
      sha256: createHash('sha256').update('src_aaaaaaaaaaaa').digest('hex'),
      title: 'T',
      raw_text_path: null,
      fetch_outcome: 'ok',
      fetch_error: null,
      extraction_outcome: 'ok',
      extraction_extractor: 'heuristic',
      extraction_error: null,
    }) + '\n',
    'utf8',
  );
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'ro-stageb-gates-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('B-TRIAGE-001 — triage surfaces malformed claims.jsonl lines', () => {
  it('records a {path,line,reason} warning for an unparseable claim line instead of silently dropping it', async () => {
    await setupPack();
    const claimsPath = join(packPath, 'sections', '01-test', 'claims.jsonl');
    // One good claim + one malformed line.
    await writeFile(
      claimsPath,
      VALID_CLAIM('clm_aaaaaaaaaaaa_ollama_intern_1') + '\n' + '{ broken not json\n',
      'utf8',
    );

    const result = await triage({ sectionId: '01-test', packPath });
    expect(result.candidateClaims).toBe(1);

    const summary = JSON.parse(await readFile(result.summaryJsonPath, 'utf8'));
    expect(summary.malformed_jsonl_warnings).toBeDefined();
    expect(summary.malformed_jsonl_warnings.length).toBe(1);
    const w = summary.malformed_jsonl_warnings[0];
    expect(w.path).toContain('claims.jsonl');
    expect(w.line).toBe(2);
    expect(typeof w.reason).toBe('string');
    expect(w.reason.length).toBeGreaterThan(0);

    // Markdown surfaces the skipped line under a dedicated section.
    const md = await readFile(result.triageMarkdownPath, 'utf8');
    expect(md).toContain('Malformed JSONL warnings');
  });

  it('happy path: all-valid claims yield an empty warnings array and unchanged markdown', async () => {
    await setupPack();
    const claimsPath = join(packPath, 'sections', '01-test', 'claims.jsonl');
    await writeFile(claimsPath, VALID_CLAIM('clm_aaaaaaaaaaaa_ollama_intern_1') + '\n', 'utf8');

    const result = await triage({ sectionId: '01-test', packPath });
    expect(result.candidateClaims).toBe(1);

    const summary = JSON.parse(await readFile(result.summaryJsonPath, 'utf8'));
    expect(summary.malformed_jsonl_warnings).toEqual([]);

    const md = await readFile(result.triageMarkdownPath, 'utf8');
    // No malformed section rendered on the clean happy path.
    expect(md).not.toContain('Malformed JSONL warnings');
  });
});

describe('B-GATES-002 — gate degrades gracefully on a corrupt source card', () => {
  it('skips a malformed source card with a warning instead of aborting the gate run', async () => {
    await setupPack();
    const claimsPath = join(packPath, 'sections', '01-test', 'claims.jsonl');
    await writeFile(claimsPath, VALID_CLAIM('clm_aaaaaaaaaaaa_heuristic_1') + '\n', 'utf8');

    // Plant a second, corrupt source card alongside the valid one.
    const cardDir = join(packPath, 'evidence', 'source-cards');
    await writeFile(join(cardDir, 'src_bbbbbbbbbbbb.json'), '{ not valid json at all', 'utf8');

    // Pre-fix this would throw a ZodError/SyntaxError; now it returns a result.
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.section_id).toBe('01-test');
    const cardWarnings = result.malformed_jsonl_warnings.filter((w) =>
      w.path.includes('source-cards'),
    );
    expect(cardWarnings.length).toBe(1);
    expect(cardWarnings[0]!.path).toContain('src_bbbbbbbbbbbb.json');
    // The valid card still loaded (one source present).
    expect(result.source_counts.total).toBe(1);
  });

  it('happy path: all-valid source cards produce no source-card warnings', async () => {
    await setupPack();
    const claimsPath = join(packPath, 'sections', '01-test', 'claims.jsonl');
    await writeFile(claimsPath, VALID_CLAIM('clm_aaaaaaaaaaaa_heuristic_1') + '\n', 'utf8');

    const result = await gate({ sectionId: '01-test', packPath });
    const cardWarnings = result.malformed_jsonl_warnings.filter((w) =>
      w.path.includes('source-cards'),
    );
    expect(cardWarnings.length).toBe(0);
    expect(result.source_counts.total).toBe(1);
  });
});

describe('B-FREEZE-001 — waiver disclosure requires an explicit reference', () => {
  const waiver = {
    family: 'source_floor',
    applied_to: 'primary_sources_required',
    reason: 'Section is exploratory; primary sourcing is deferred to a later pass.',
  };

  it('does NOT count an internal token embedded inside a larger identifier', async () => {
    // The token appears only as a substring of bigger snake_case identifiers —
    // the false-positive the gate previously accepted as disclosure.
    const text =
      'The pipeline uses legacy_source_floor_v1 and audit_primary_sources_required_flag internally.';
    expect(extractWaiverDisclosures(text, [waiver])).toEqual([]);
  });

  it('still counts a standalone applied_to token (deliberate prose reference)', async () => {
    const text = 'We note the waived primary_sources_required policy in this section.';
    expect(extractWaiverDisclosures(text, [waiver])).toEqual([
      'source_floor.primary_sources_required',
    ]);
  });

  it('still counts the family+applied_to pair anywhere', async () => {
    const text = 'source_floor was relaxed; primary_sources_required no longer enforced.';
    expect(extractWaiverDisclosures(text, [waiver])).toEqual([
      'source_floor.primary_sources_required',
    ]);
  });
});
