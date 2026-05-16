/**
 * R-017 acceptance tests — pack-scope-aware policy-source warning (v0.12 Slice 4).
 *
 * Surfaces failure_4 from operator-aloneness DST v0.3 (policy-oriented pack
 * decision question + zero AASM/society URLs → no warning fired pre-R-017).
 *
 * Warning is INFORMATIONAL — does NOT affect gate verdict, freeze receipt,
 * or pack-publish. Tests assert this explicitly (R-017.4).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  appendFile,
  mkdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { audit } from '../src/audit/index.js';
import {
  POLICY_KEYWORDS,
  POLICY_RELEVANT_SOURCE_TYPES,
  buildMissingPolicySourcesAudit,
  detectPolicyKeywords,
  isPolicyRelevantCard,
  renderMissingPolicySourcesMarkdown,
} from '../src/audit/missing-policy-sources.js';
import type { SourceCard } from '../src/sources/schema.js';
import type { ResearchYaml } from '../src/intake/schema.js';

let workDir: string;
let packPath: string;

interface CardSpec {
  source_id: string;
  publisher: string;
  source_type?: 'primary' | 'secondary' | 'docs' | 'forum' | 'benchmark' | 'unknown';
}

interface OverrideSpec {
  source_id: string;
  url: string;
  new_source_type?: 'primary' | 'secondary' | 'docs' | 'forum' | 'benchmark' | 'unknown';
}

async function makeR017Fixture(spec: {
  decision: string;
  topic?: string;
  cards: CardSpec[];
  overrides?: OverrideSpec[];
}): Promise<void> {
  const r = await init({
    topic: spec.topic ?? 'R-017 acceptance bed topic of sufficient length to pass schema',
    outDir: workDir,
  });
  packPath = r.packPath;
  await sectionAdd({ id: '01-test', purpose: 'R-017 probe', packPath });

  // Patch research.yaml so the `decision` field is what R-017 keyword-scans.
  const yamlPath = join(packPath, 'research.yaml');
  const yamlText = await readFile(yamlPath, 'utf8');
  const parsed = parseYaml(yamlText);
  parsed.decision = spec.decision;
  await writeFile(yamlPath, stringifyYaml(parsed), 'utf8');

  for (const c of spec.cards) {
    const sha = createHash('sha256').update(c.source_id).digest('hex');
    const cardDir = join(packPath, 'evidence', 'source-cards');
    await mkdir(cardDir, { recursive: true });
    const card = {
      source_id: c.source_id,
      receipt_id: `rcpt_${c.source_id.replace(/^src_/, '')}_1`,
      section_id: '01-test',
      url: `https://example.com/${c.source_id}`,
      final_url: `https://example.com/${c.source_id}`,
      fetched_at: '2026-05-16T03:00:00.000Z',
      publisher: c.publisher,
      published_at: null,
      title: `Title ${c.source_id}`,
      source_type: c.source_type ?? 'secondary',
      relevance: 'unknown',
      key_points: [],
      limitations: [],
      asserts: 'A',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-16T03:00:00.000Z',
    };
    await writeFile(join(cardDir, `${c.source_id}.json`), JSON.stringify(card), 'utf8');
    await appendFile(
      join(packPath, 'sections', '01-test', 'sources.jsonl'),
      JSON.stringify({ source_id: c.source_id, added_at: '2026-05-16T03:00:01.000Z' }) + '\n',
      'utf8',
    );
    await appendFile(
      join(packPath, 'evidence', 'fetch-log.jsonl'),
      JSON.stringify({
        receipt_id: `rcpt_${c.source_id.replace(/^src_/, '')}_1`,
        source_id: c.source_id,
        section_id: '01-test',
        requested_url: `https://example.com/${c.source_id}`,
        final_url: `https://example.com/${c.source_id}`,
        status: 200,
        status_text: 'OK',
        content_type: 'text/html',
        fetched_at: '2026-05-16T03:00:00.000Z',
        byte_count: 100,
        sha256: sha,
        title: `Title ${c.source_id}`,
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

  for (const o of spec.overrides ?? []) {
    const override = {
      source_id: o.source_id,
      url: o.url,
      new_source_type: o.new_source_type ?? 'docs',
      reason: 'R-017 acceptance: operator reclassified as policy-relevant',
      operator: 'r017-test',
      created_at: '2026-05-16T03:30:00Z',
      pack_version: '0.12.0',
    };
    await mkdir(join(packPath, 'evidence'), { recursive: true });
    await appendFile(
      join(packPath, 'evidence', 'source-card-overrides.jsonl'),
      JSON.stringify(override) + '\n',
      'utf8',
    );
  }
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-r017-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('R-017 — missing-policy-sources warning (v0.12 Slice 4)', () => {
  describe('closed-list discipline + detector unit tests', () => {
    it('POLICY_KEYWORDS is a stable closed list of 8 entries (the v0.12 budget)', () => {
      // Snapshot-style assertion: changing this enum is a doctrine event,
      // not an implementation tweak. Adding a new keyword in a future
      // slice means surfacing the change to the operator (kickoff law).
      expect([...POLICY_KEYWORDS].sort()).toEqual(
        [
          'decision maker',
          'decision-maker',
          'guidance',
          'guideline',
          'operations decision',
          'policy',
          'regulation',
          'regulatory',
        ].sort(),
      );
    });

    it('POLICY_RELEVANT_SOURCE_TYPES is the closed subset ["docs"]', () => {
      expect([...POLICY_RELEVANT_SOURCE_TYPES]).toEqual(['docs']);
    });

    it('detectPolicyKeywords substring-matches case-insensitively and returns sorted unique matches', () => {
      expect(detectPolicyKeywords('')).toEqual([]);
      expect(detectPolicyKeywords('What does the evidence say about X?')).toEqual([]);
      // v0.3 actual decision text → matches policy + operations decision
      expect(
        detectPolicyKeywords('Inform policy/operations decisions on DST transitions'),
      ).toEqual(['operations decision', 'policy']);
      // Case-insensitive: "POLICY" matches
      expect(detectPolicyKeywords('POLICY-makers wanted GUIDANCE')).toEqual([
        'guidance',
        'policy',
      ]);
      // "regulation" + "regulatory" both fire on a text containing both forms.
      expect(detectPolicyKeywords('regulatory impact of regulations')).toEqual([
        'regulation',
        'regulatory',
      ]);
    });
  });

  it('R-017.1: policy-oriented pack + zero policy-relevant sources → warning fires', async () => {
    await makeR017Fixture({
      decision: 'Inform policy/operations decisions on DST transitions',
      cards: [
        { source_id: 'src_111111111111', publisher: 'Healthline', source_type: 'secondary' },
        { source_id: 'src_222222222222', publisher: 'EurekAlert', source_type: 'secondary' },
        { source_id: 'src_333333333333', publisher: 'AEA', source_type: 'primary' },
      ],
    });

    await audit({ packPath });

    const jsonPath = join(packPath, 'audits', 'missing-policy-sources.json');
    const mdPath = join(packPath, 'audits', 'missing-policy-sources.md');
    const auditObj = JSON.parse(await readFile(jsonPath, 'utf8'));
    const md = await readFile(mdPath, 'utf8');

    expect(auditObj.fired).toBe(true);
    // matches both policy and operations decision keywords
    expect(auditObj.matched_keywords).toContain('policy');
    expect(auditObj.matched_keywords).toContain('operations decision');
    expect(auditObj.policy_relevant_source_count).toBe(0);
    expect(auditObj.policy_relevant_source_types_absent).toEqual(['docs']);

    // Markdown carries operator-facing rationale + the matched keyword list
    expect(md).toContain('Matched keywords:');
    expect(md).toContain('policy');
    expect(md).toContain('operations decision');
    expect(md).toContain('INFORMATIONAL');
  });

  it('R-017.2: non-policy pack → warning does NOT fire even with zero docs sources', async () => {
    await makeR017Fixture({
      decision: 'Pick a stack for our internal data pipeline rewrite',
      topic: 'What is the evidence for stream-processing system maturity?',
      cards: [
        { source_id: 'src_aaaaaaaaaaaa', publisher: 'arxiv', source_type: 'primary' },
        { source_id: 'src_bbbbbbbbbbbb', publisher: 'medium', source_type: 'secondary' },
      ],
    });

    await audit({ packPath });

    const auditObj = JSON.parse(
      await readFile(join(packPath, 'audits', 'missing-policy-sources.json'), 'utf8'),
    );
    expect(auditObj.fired).toBe(false);
    expect(auditObj.matched_keywords).toEqual([]);
  });

  it('R-017.3: policy pack + has docs source → warning does NOT fire', async () => {
    await makeR017Fixture({
      decision: 'Inform policy decisions on workplace transitions',
      cards: [
        { source_id: 'src_111111111111', publisher: 'Healthline', source_type: 'secondary' },
        { source_id: 'src_aaaaaaaaaaaa', publisher: 'CDC', source_type: 'docs' },
      ],
    });

    await audit({ packPath });

    const auditObj = JSON.parse(
      await readFile(join(packPath, 'audits', 'missing-policy-sources.json'), 'utf8'),
    );
    expect(auditObj.fired).toBe(false);
    expect(auditObj.matched_keywords).toContain('policy');
    expect(auditObj.policy_relevant_source_count).toBe(1);
  });

  it('R-017.4: warning is informational — does NOT affect verdict, synthesis_allowed, or blocking_reasons', async () => {
    await makeR017Fixture({
      decision: 'Inform policy/operations decisions on DST transitions',
      cards: [
        { source_id: 'src_111111111111', publisher: 'Healthline', source_type: 'secondary' },
      ],
    });

    const result = await audit({ packPath });
    const auditObj = JSON.parse(
      await readFile(join(packPath, 'audits', 'missing-policy-sources.json'), 'utf8'),
    );

    // Warning fired (no docs sources on policy-oriented pack)
    expect(auditObj.fired).toBe(true);

    // But the gate verdict + synthesis_allowed are unaffected by R-017.
    // The pack has no gate result, so verdict is 'blocked' from
    // determineVerdict's no_gate_sections == total branch. The blocking
    // reasons should NOT include any R-017 / policy-sources language.
    expect(result.verdict).toBe('blocked');
    expect(result.synthesisAllowed).toBe(false);
    for (const reason of result.blockingReasons) {
      expect(reason.toLowerCase()).not.toContain('policy');
      expect(reason.toLowerCase()).not.toContain('society');
      expect(reason.toLowerCase()).not.toContain('missing-policy');
    }
  });

  it('R-017.5: effective source_type honored — pre-R-013 rebuild (raw=unknown, override→docs) suppresses the warning', async () => {
    // Raw card has source_type='unknown'. The operator's override sets
    // new_source_type='docs'. Without re-running gather or rebuild-cards,
    // R-017 must STILL see the source as policy-relevant — because
    // getEffectiveSourceType applies the override layer at read time.
    await makeR017Fixture({
      decision: 'Inform policy decisions on workplace transitions',
      cards: [
        { source_id: 'src_111111111111', publisher: 'Healthline', source_type: 'secondary' },
        { source_id: 'src_aaaaaaaaaaaa', publisher: 'IEEE', source_type: 'unknown' },
      ],
      overrides: [
        {
          source_id: 'src_aaaaaaaaaaaa',
          url: 'https://example.com/src_aaaaaaaaaaaa',
          new_source_type: 'docs',
        },
      ],
    });

    await audit({ packPath });

    const auditObj = JSON.parse(
      await readFile(join(packPath, 'audits', 'missing-policy-sources.json'), 'utf8'),
    );
    expect(auditObj.fired).toBe(false);
    expect(auditObj.policy_relevant_source_count).toBe(1);

    // Also: the same suppression holds for the post-rebuild state where
    // raw card.source_type='docs' (no override needed). This is the
    // literal R-013 rebuild path the kickoff named.
    const work2 = await mkdtemp(join(tmpdir(), 'research-os-r017-rebuild-'));
    const savePack = packPath;
    const saveWork = workDir;
    workDir = work2;
    await makeR017Fixture({
      decision: 'Inform policy decisions on workplace transitions',
      cards: [
        { source_id: 'src_111111111111', publisher: 'Healthline', source_type: 'secondary' },
        // No override; raw source_type is the post-R-013-rebuild effective value.
        { source_id: 'src_aaaaaaaaaaaa', publisher: 'IEEE', source_type: 'docs' },
      ],
    });

    await audit({ packPath });

    const auditObjPostRebuild = JSON.parse(
      await readFile(join(packPath, 'audits', 'missing-policy-sources.json'), 'utf8'),
    );
    expect(auditObjPostRebuild.fired).toBe(false);
    expect(auditObjPostRebuild.policy_relevant_source_count).toBe(1);

    packPath = savePack;
    workDir = saveWork;
    await rm(work2, { recursive: true, force: true });
  });

  it('R-017.bonus: isPolicyRelevantCard + renderMissingPolicySourcesMarkdown surface-level checks', () => {
    const card: SourceCard = {
      source_id: 'src_aaaaaaaaaaaa',
      receipt_id: 'rcpt_aaaaaaaaaaaa_1',
      section_id: '01-test',
      url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      fetched_at: '2026-05-16T03:00:00.000Z',
      publisher: 'IEEE',
      published_at: null,
      title: 'IEEE standard',
      source_type: 'docs',
      relevance: 'unknown',
      key_points: [],
      limitations: [],
      asserts: 'A',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-16T03:00:00.000Z',
    };
    expect(isPolicyRelevantCard(card, [])).toBe(true);
    expect(isPolicyRelevantCard({ ...card, source_type: 'primary' }, [])).toBe(false);

    const research: ResearchYaml = {
      research_os_version: '0.12.0',
      created_at: '2026-05-16T00:00:00.000Z',
      topic: 'Inform policy decisions on X',
      decision: '',
      audience: 'self',
      desired_output: '',
      max_runtime_minutes: 240,
      freshness: { required: true, max_source_age_months: null },
      excluded_sources: [],
      primary_source_waiver: { status: 'none', compensating_controls: [], section_waivers: [] },
      sections: [],
      gates: {
        source_floor: {
          min_sources: 8,
          min_independent_publishers: 4,
          primary_sources_required: 2,
          primary_source_waiver_allowed: true,
        },
        claim_integrity: {
          every_claim_needs_source: true,
          no_orphan_claims: true,
          no_source_cluster_monopoly: true,
        },
        freshness: { required_for_current_topics: true, stale_source_policy: 'warn' },
        contradiction: { required: true, unresolved_contradictions_block_synthesis: true },
        section_budget: { max_time_minutes: 45, extension_requires_evidence: true },
      },
      review_profiles: {},
      frozen_at: null,
    };
    const fired = buildMissingPolicySourcesAudit({
      research,
      sources: [],
      overrides: [],
      generatedAt: '2026-05-16T04:00:00.000Z',
    });
    expect(fired.fired).toBe(true);
    expect(fired.matched_keywords).toContain('policy');
    const md = renderMissingPolicySourcesMarkdown(fired);
    expect(md).toContain('Missing policy / scientific-society sources');
    expect(md).toContain('INFORMATIONAL');

    const notFired = buildMissingPolicySourcesAudit({
      research: { ...research, topic: 'What is the evidence for stream-processing maturity?' },
      sources: [],
      overrides: [],
      generatedAt: '2026-05-16T04:00:00.000Z',
    });
    expect(notFired.fired).toBe(false);
    const mdNot = renderMissingPolicySourcesMarkdown(notFired);
    expect(mdNot).toContain('no warning');
  });
});
