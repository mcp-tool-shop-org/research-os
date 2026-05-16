/**
 * R-008 — Discover hallucinated URL defense (v0.11 Slice 2).
 *
 * Acceptance tests for the admission-layer defense against real-but-unrelated
 * URLs from llm-heuristic discover. Closes the v0.2 originating-bug shape:
 * 3 of 8 PMC URLs in operator_aloneness_dst_v0.2 returned real fetched papers
 * — but on cancer / biochem / HIV topics rather than the queried DST workplace
 * topic. Frame critic + accept-floor caught the contamination downstream;
 * R-008 closes the gap at the candidate admission layer.
 *
 * The defense: discover-time URL-title fetch + deterministic keyword-overlap
 * vs. the discover query. Mismatches receive `relevance.status = 'topic_mismatch'`.
 * `approve --top N` excludes mismatches by default (structural quarantine).
 * `approve --candidate <id>` works on any candidate (operator override by
 * explicitly naming the candidate — analogous to R-003's clear_severities[]
 * "name the severity to clear" override semantics).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import {
  approve,
  discover,
  type DiscoverProvider,
  type DiscoverProviderInput,
  type DiscoverProviderResult,
  type DiscoverProposal,
} from '../src/discover/index.js';
import { DiscoveryCandidateSchema } from '../src/discover/schema.js';

let workDir: string;
let packPath: string;

class StubProvider implements DiscoverProvider {
  constructor(
    public readonly name: string,
    private readonly proposals: DiscoverProposal[],
  ) {}
  async available(): Promise<boolean> {
    return true;
  }
  async propose(_input: DiscoverProviderInput): Promise<DiscoverProviderResult> {
    return { ok: true, proposals: this.proposals, method: 'stub' };
  }
}

async function setupPack() {
  const r = await init({ topic: 'DST workplace effects (R-008 fixture)', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: '01-productivity-effects', purpose: 'DST productivity', packPath });
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-r008-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const DST_QUERY = 'daylight savings time workplace productivity cognitive performance';

// The 3 actual v0.2 PMC URLs (canonical regression fixture).
const V02_PMC7244163 = 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7244163/';
const V02_PMC8130783 = 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8130783/';
const V02_PMC7354166 = 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7354166/';

// Real (or close-synthetic) titles for each v0.2 PMC ID, matching the grading
// report's identification of the underlying papers (cancer / biochem / HIV).
const REAL_TITLES_BY_URL: Record<string, string> = {
  [V02_PMC7244163]:
    'Trends in cancer mortality in Andalusia, Spain (1985-2018) - PMC',
  [V02_PMC8130783]:
    'Carboxylesterase enzyme structure and substrate selectivity in the rat liver',
  [V02_PMC7354166]:
    'HIV-associated diffuse large B-cell lymphoma in resource-limited settings',
  // 5 on-topic candidates (real DST workplace research)
  'https://example.com/dst-1':
    'Daylight Saving Time and Workplace Productivity: A Quasi-Experimental Study',
  'https://example.com/dst-2':
    'Workplace Injury Risk on the Monday Following Daylight Savings Transition',
  'https://example.com/dst-3':
    'Cognitive Performance and Sleep Loss After Daylight Saving Time',
  'https://example.com/dst-4':
    'Workplace Productivity Effects of Daylight Saving Time: Cyberloafing Evidence',
  'https://example.com/dst-5':
    'Daylight Saving Time Workplace Adjustment Window: NIOSH Review',
};

function makeFakeRelevanceFetch(
  titles: Record<string, string | null> = REAL_TITLES_BY_URL,
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const title = titles[url];
    if (title === undefined) {
      // Unknown URL → simulate network refusal (graceful unverified behavior).
      throw new Error('ENOTFOUND');
    }
    if (title === null) {
      return new Response('<html><body>no title</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    return new Response(
      `<html><head><title>${title}</title></head><body>...</body></html>`,
      { status: 200, headers: { 'content-type': 'text/html' } },
    );
  }) as unknown as typeof fetch;
}

function v02RegressionProposals(): DiscoverProposal[] {
  // Reproduces the exact 8-candidate shape from operator_aloneness_dst_v0.2.
  // The 3 PMC URLs are real (LLM picked existing-but-unrelated PMC IDs); the
  // titles are the LLM's CONFABULATION (sound on-topic, are not).
  return [
    {
      url: V02_PMC7244163,
      title: 'The impact of daylight saving time on workplace productivity',
      publisher: null,
      source_type_guess: 'paper',
      why_relevant:
        'This peer-reviewed paper examines the effects of DST transitions on workplace productivity.',
      rank: 1,
    },
    {
      url: V02_PMC8130783,
      title: 'The impact of daylight saving time on sleep and mood',
      publisher: null,
      source_type_guess: 'paper',
      why_relevant:
        'This paper investigates how DST affects cognitive functioning.',
      rank: 2,
    },
    {
      url: V02_PMC7354166,
      title: 'Health and economic impacts of abolishing daylight saving time',
      publisher: null,
      source_type_guess: 'paper',
      why_relevant:
        'This paper assesses the broader public health and economic consequences of eliminating DST.',
      rank: 3,
    },
    {
      url: 'https://example.com/dst-1',
      title: 'DST Productivity Study (Real)',
      publisher: 'Example Univ',
      source_type_guess: 'paper',
      why_relevant: 'Real DST workplace research',
      rank: 4,
    },
    {
      url: 'https://example.com/dst-2',
      title: 'DST Injury Study (Real)',
      publisher: 'Example Univ',
      source_type_guess: 'paper',
      why_relevant: 'Real DST workplace research',
      rank: 5,
    },
    {
      url: 'https://example.com/dst-3',
      title: 'DST Cognitive Study (Real)',
      publisher: 'Example Univ',
      source_type_guess: 'paper',
      why_relevant: 'Real DST workplace research',
      rank: 6,
    },
    {
      url: 'https://example.com/dst-4',
      title: 'DST Cyberloafing Study (Real)',
      publisher: 'Example Univ',
      source_type_guess: 'paper',
      why_relevant: 'Real DST workplace research',
      rank: 7,
    },
    {
      url: 'https://example.com/dst-5',
      title: 'NIOSH DST Review (Real)',
      publisher: 'Example Org',
      source_type_guess: 'docs',
      why_relevant: 'Real DST workplace research',
      rank: 8,
    },
  ];
}

describe('R-008 — discover hallucinated URL defense', () => {
  describe('v0.2 regression replay (LOAD-BEARING)', () => {
    it('flags the 3 real-but-unrelated PMC URLs from operator_aloneness_dst_v0.2 as topic_mismatch', async () => {
      await setupPack();
      const provider = new StubProvider('llm-heuristic', v02RegressionProposals());
      const result = await discover({
        sectionId: '01-productivity-effects',
        packPath,
        query: DST_QUERY,
        providers: [provider],
        relevanceCheck: {
          enabled: true,
          fetchImpl: makeFakeRelevanceFetch(),
        },
      });

      expect(result.candidatesAdded).toBe(8);

      const byUrl = new Map(result.candidates.map((c) => [c.url, c]));

      // The 3 cancer/biochem/HIV PMC URLs MUST be flagged topic_mismatch.
      for (const url of [V02_PMC7244163, V02_PMC8130783, V02_PMC7354166]) {
        const c = byUrl.get(url);
        expect(c, `candidate for ${url} should be present`).toBeDefined();
        expect(c?.relevance).not.toBeNull();
        expect(c?.relevance?.status).toBe('topic_mismatch');
        expect(c?.relevance?.matched_keywords ?? []).toEqual([]);
        expect(c?.relevance?.fetched_title).toBeTruthy();
        // The fetched title must NOT be the LLM's confabulated title.
        expect(c?.relevance?.fetched_title).not.toEqual(c?.title);
      }

      // The 5 on-topic candidates MUST be verified.
      for (const url of [
        'https://example.com/dst-1',
        'https://example.com/dst-2',
        'https://example.com/dst-3',
        'https://example.com/dst-4',
        'https://example.com/dst-5',
      ]) {
        const c = byUrl.get(url);
        expect(c?.relevance?.status, `candidate ${url} should be verified`).toBe('verified');
      }
    });

    it('summary report counts mismatch / verified / unverified', async () => {
      await setupPack();
      const provider = new StubProvider('llm-heuristic', v02RegressionProposals());
      const result = await discover({
        sectionId: '01-productivity-effects',
        packPath,
        query: DST_QUERY,
        providers: [provider],
        relevanceCheck: { enabled: true, fetchImpl: makeFakeRelevanceFetch() },
      });

      expect(result.relevanceTotals).toEqual({
        verified: 5,
        unverified: 0,
        topic_mismatch: 3,
      });
    });
  });

  describe('approve quarantine', () => {
    it('approve --top N excludes topic_mismatch candidates by default', async () => {
      await setupPack();
      const provider = new StubProvider('llm-heuristic', v02RegressionProposals());
      await discover({
        sectionId: '01-productivity-effects',
        packPath,
        query: DST_QUERY,
        providers: [provider],
        relevanceCheck: { enabled: true, fetchImpl: makeFakeRelevanceFetch() },
      });

      // Operator runs approve --top 5: should approve the 5 on-topic
      // candidates, NOT include the 3 mismatched cancer/biochem/HIV URLs.
      const r = await approve({ sectionId: '01-productivity-effects', packPath, topN: 5 });

      expect(r.approved).toBe(5);
      const approvedFile = await readFile(
        join(packPath, 'sections', '01-productivity-effects', 'urls.approved.txt'),
        'utf8',
      );
      expect(approvedFile).not.toContain(V02_PMC7244163);
      expect(approvedFile).not.toContain(V02_PMC8130783);
      expect(approvedFile).not.toContain(V02_PMC7354166);
      expect(approvedFile).toContain('https://example.com/dst-1');
      expect(approvedFile).toContain('https://example.com/dst-5');
    });

    it('operator override: approve --candidate <id> works for a topic_mismatch candidate', async () => {
      await setupPack();
      const provider = new StubProvider('llm-heuristic', v02RegressionProposals());
      const dResult = await discover({
        sectionId: '01-productivity-effects',
        packPath,
        query: DST_QUERY,
        providers: [provider],
        relevanceCheck: { enabled: true, fetchImpl: makeFakeRelevanceFetch() },
      });
      const mismatched = dResult.candidates.find((c) => c.url === V02_PMC7244163);
      expect(mismatched).toBeDefined();

      // Operator deliberately approves a flagged candidate by explicit id.
      // This is the "name the severity to clear" override semantics — the
      // operator is acknowledging the relevance flag by approving by-name
      // rather than by --top N.
      const aResult = await approve({
        sectionId: '01-productivity-effects',
        packPath,
        candidateIds: [mismatched!.candidate_id],
        reason: 'Operator inspected URL out-of-band; relevance flag accepted',
      });
      expect(aResult.approved).toBe(1);
      const approvedFile = await readFile(
        join(packPath, 'sections', '01-productivity-effects', 'urls.approved.txt'),
        'utf8',
      );
      expect(approvedFile).toContain(V02_PMC7244163);
    });

    it('approve --top N is unaffected when no mismatches are present (happy path)', async () => {
      await setupPack();
      const onlyOnTopic = v02RegressionProposals().slice(3); // drop the 3 PMC URLs
      const provider = new StubProvider('llm-heuristic', onlyOnTopic);
      await discover({
        sectionId: '01-productivity-effects',
        packPath,
        query: DST_QUERY,
        providers: [provider],
        relevanceCheck: { enabled: true, fetchImpl: makeFakeRelevanceFetch() },
      });
      const r = await approve({ sectionId: '01-productivity-effects', packPath, topN: 3 });
      expect(r.approved).toBe(3);
    });
  });

  describe('graceful degradation', () => {
    it('topic_mismatch fires only when title fetched; fetch failure → unverified (NOT excluded from --top N)', async () => {
      await setupPack();
      const provider = new StubProvider('llm-heuristic', [
        {
          url: 'https://example.com/unreachable',
          title: 'LLM-generated title',
          publisher: null,
          source_type_guess: 'paper',
          why_relevant: 'why',
          rank: 1,
        },
      ]);
      // fetcher throws on unknown URL by default in our stub.
      const result = await discover({
        sectionId: '01-productivity-effects',
        packPath,
        query: DST_QUERY,
        providers: [provider],
        relevanceCheck: { enabled: true, fetchImpl: makeFakeRelevanceFetch({}) },
      });
      expect(result.candidates[0]?.relevance?.status).toBe('unverified');
      // Unverified candidates ARE eligible for --top N (don't over-block on
      // network failure — graceful degradation).
      const a = await approve({ sectionId: '01-productivity-effects', packPath, topN: 1 });
      expect(a.approved).toBe(1);
    });

    it('relevanceCheck disabled → relevance is null on every candidate (back-compat with v0.10 ledgers)', async () => {
      await setupPack();
      const provider = new StubProvider('llm-heuristic', v02RegressionProposals());
      const result = await discover({
        sectionId: '01-productivity-effects',
        packPath,
        query: DST_QUERY,
        providers: [provider],
        relevanceCheck: { enabled: false, fetchImpl: makeFakeRelevanceFetch() },
      });
      for (const c of result.candidates) expect(c.relevance).toBeNull();
      // No quarantine when check is disabled.
      const a = await approve({ sectionId: '01-productivity-effects', packPath, topN: 8 });
      expect(a.approved).toBe(8);
    });

    it('relevanceCheck OMITTED from options → relevance is null (existing v0.10 test surface preserved)', async () => {
      await setupPack();
      const provider = new StubProvider('llm-heuristic', v02RegressionProposals());
      const result = await discover({
        sectionId: '01-productivity-effects',
        packPath,
        query: DST_QUERY,
        providers: [provider],
        // relevanceCheck NOT provided
      });
      for (const c of result.candidates) expect(c.relevance).toBeNull();
    });
  });

  describe('provider attribution & report rendering', () => {
    it('discovered_by still names the provider that proposed each candidate', async () => {
      await setupPack();
      const provider = new StubProvider('llm-heuristic', v02RegressionProposals());
      const result = await discover({
        sectionId: '01-productivity-effects',
        packPath,
        query: DST_QUERY,
        providers: [provider],
        relevanceCheck: { enabled: true, fetchImpl: makeFakeRelevanceFetch() },
      });
      for (const c of result.candidates) expect(c.discovered_by).toBe('llm-heuristic');
    });

    it('discovery report includes a Relevance column and surfaces the real fetched title for mismatches', async () => {
      await setupPack();
      const provider = new StubProvider('llm-heuristic', v02RegressionProposals());
      const result = await discover({
        sectionId: '01-productivity-effects',
        packPath,
        query: DST_QUERY,
        providers: [provider],
        relevanceCheck: { enabled: true, fetchImpl: makeFakeRelevanceFetch() },
      });
      const md = await readFile(result.reportPath, 'utf8');
      expect(md).toMatch(/topic[_\s]mismatch/i);
      // Real cancer-paper title must be visible to the operator (not just the
      // LLM's confabulated title).
      expect(md).toContain('Trends in cancer mortality in Andalusia, Spain');
      // The relevance summary block should warn about quarantined candidates.
      expect(md).toMatch(/3 topic_mismatch/);
      expect(md).toMatch(/3 candidates? flagged/i);
    });
  });

  describe('schema back-compat', () => {
    it('v0.10-shape candidate (no relevance field) parses cleanly', () => {
      const v010Record = {
        candidate_id: 'disc_aaaaaaaaaaaa',
        section_id: '01-productivity-effects',
        url: 'https://example.com/legacy',
        title: 'Legacy candidate',
        publisher: null,
        source_type_guess: 'paper',
        why_relevant: 'legacy why',
        query: 'legacy query',
        rank: 1,
        discovered_at: '2026-05-15T17:25:00.000Z',
        status: 'candidate',
        discovered_by: 'llm-heuristic',
        reason: null,
      };
      const parsed = DiscoveryCandidateSchema.parse(v010Record);
      expect(parsed.relevance).toBeNull();
    });

    it('v0.11 candidate with relevance field parses and round-trips', () => {
      const v011Record = {
        candidate_id: 'disc_bbbbbbbbbbbb',
        section_id: '01-productivity-effects',
        url: V02_PMC7244163,
        title: 'LLM confabulated title',
        publisher: null,
        source_type_guess: 'paper',
        why_relevant: 'why',
        query: DST_QUERY,
        rank: 1,
        discovered_at: '2026-05-15T17:25:00.000Z',
        status: 'candidate',
        discovered_by: 'llm-heuristic',
        reason: null,
        relevance: {
          status: 'topic_mismatch',
          fetched_title: 'Trends in cancer mortality in Andalusia, Spain - PMC',
          query_keywords: ['daylight', 'savings', 'time', 'workplace', 'productivity'],
          matched_keywords: [],
          overlap_score: 0,
          threshold: 0.2,
          error: null,
          checked_at: '2026-05-15T17:25:01.000Z',
        },
      };
      const parsed = DiscoveryCandidateSchema.parse(v011Record);
      expect(parsed.relevance?.status).toBe('topic_mismatch');
      expect(parsed.relevance?.fetched_title).toContain('cancer mortality');
    });
  });
});
