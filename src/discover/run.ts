import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as yamlParse } from 'yaml';

import { PackNotFoundError, ResearchOSError, SectionNotFoundError } from '../errors.js';
import { InvalidArgumentError } from 'commander';
import { ResearchYamlSchema } from '../intake/schema.js';
import { RESEARCH_OS_VERSION } from '../index.js';
import {
  DiscoveryCandidateSchema,
  DiscoverySummarySchema,
  type DiscoveryCandidate,
  type DiscoveryCandidateStatus,
  type DiscoverySummary,
  type RelevanceCheck,
} from './schema.js';
import type {
  ApproveOptions,
  ApproveResult,
  DiscoverOptions,
  DiscoverProvider,
  DiscoverProposal,
  DiscoverResult,
  ExportUrlsOptions,
  ExportUrlsResult,
  RejectOptions,
  RejectResult,
  RelevanceTotals,
} from './types.js';
import { LlmHeuristicDiscoverProvider } from './providers/llm-heuristic.js';
import {
  assessRelevanceBatch,
  DEFAULT_RELEVANCE_THRESHOLD,
  DEFAULT_RELEVANCE_FETCH_TIMEOUT_MS,
  DEFAULT_RELEVANCE_FETCH_CONCURRENCY,
} from './relevance.js';

const DEFAULT_TARGET_COUNT = 12;

function makeCandidateId(sectionId: string, url: string): string {
  // Stable per-(section,url) so re-running discover with the same query
  // doesn't generate duplicate candidate ids.
  const hex = createHash('sha256').update(`${sectionId}|${url}`).digest('hex').slice(0, 12);
  return `disc_${hex}`;
}

function isHttpsUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function candidatesPath(packPath: string, sectionId: string): string {
  return join(packPath, 'sections', sectionId, 'discovery-candidates.jsonl');
}

function reportPath(packPath: string, sectionId: string): string {
  return join(packPath, 'sections', sectionId, 'discovery-report.md');
}

function summaryPath(packPath: string, sectionId: string): string {
  return join(packPath, 'audits', `${sectionId}-discovery.json`);
}

function approvedUrlsPath(packPath: string, sectionId: string): string {
  return join(packPath, 'sections', sectionId, 'urls.approved.txt');
}

async function readCandidates(packPath: string, sectionId: string): Promise<DiscoveryCandidate[]> {
  const path = candidatesPath(packPath, sectionId);
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const out: DiscoveryCandidate[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(DiscoveryCandidateSchema.parse(JSON.parse(line)));
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

// Append-only ledger: latest entry per candidate_id wins. Approve/reject
// emit a fresh entry with updated status; the ledger preserves history.
function latestPerCandidate(candidates: DiscoveryCandidate[]): Map<string, DiscoveryCandidate> {
  const out = new Map<string, DiscoveryCandidate>();
  for (const c of candidates) {
    const prev = out.get(c.candidate_id);
    if (!prev || prev.discovered_at < c.discovered_at) out.set(c.candidate_id, c);
  }
  return out;
}

function defaultProviders(): DiscoverProvider[] {
  return [new LlmHeuristicDiscoverProvider()];
}

async function pickProvider(providers: DiscoverProvider[]): Promise<DiscoverProvider | null> {
  for (const p of providers) {
    if (await p.available()) return p;
  }
  return null;
}

async function loadSectionPurpose(packPath: string, sectionId: string): Promise<string> {
  const research = ResearchYamlSchema.parse(
    yamlParse(await readFile(join(packPath, 'research.yaml'), 'utf8')),
  );
  const section = research.sections.find((s) => s.id === sectionId);
  return section?.purpose ?? '';
}

function relevanceCellLabel(c: DiscoveryCandidate): string {
  if (!c.relevance) return '—';
  switch (c.relevance.status) {
    case 'verified':
      return `verified (${Math.round(c.relevance.overlap_score * 100)}%)`;
    case 'unverified':
      return c.relevance.error
        ? `unverified (${c.relevance.error.slice(0, 40)})`
        : 'unverified';
    case 'topic_mismatch':
      return `**topic_mismatch** (${Math.round(c.relevance.overlap_score * 100)}%)`;
  }
}

function buildReportMarkdown(args: {
  sectionId: string;
  query: string;
  provider: string;
  ranAt: string;
  candidates: DiscoveryCandidate[];
  relevanceTotals: RelevanceTotals;
}): string {
  const lines: string[] = [];
  lines.push(`# Discovery report: ${args.sectionId}`);
  lines.push('');
  lines.push(`- **Query:** ${args.query}`);
  lines.push(`- **Provider:** ${args.provider}`);
  lines.push(`- **Ran at:** ${args.ranAt}`);
  lines.push(`- **Candidates:** ${args.candidates.length}`);
  const r = args.relevanceTotals;
  const ranAnyCheck = r.verified + r.unverified + r.topic_mismatch > 0;
  if (ranAnyCheck) {
    lines.push(
      `- **Relevance:** ${r.verified} verified, ${r.unverified} unverified, ${r.topic_mismatch} topic_mismatch`,
    );
  }
  lines.push('');
  if (r.topic_mismatch > 0) {
    lines.push(
      `> ⚠ ${r.topic_mismatch} candidate${r.topic_mismatch === 1 ? '' : 's'} flagged \`topic_mismatch\` — fetched URL title shows no overlap with the discover query.`,
    );
    lines.push(
      '> These candidates are EXCLUDED from `discover approve --top N` by default. To approve a flagged candidate anyway, name it explicitly: `discover approve <section> --candidate disc_<hex>`.',
    );
    lines.push('');
  }
  lines.push('## Candidates');
  lines.push('');
  if (args.candidates.length === 0) {
    lines.push('_No candidates proposed. Provider may have refused on confidence grounds, or returned an empty result._');
    return lines.join('\n');
  }
  lines.push('Discovery results are LEADS, not evidence. A lead becomes evidence only after `research-os gather` produces a fetch receipt + source card + excerpt ledger + claim extraction.');
  lines.push('');
  if (ranAnyCheck) {
    lines.push('| Rank | Status | Relevance | Type | Title (LLM) | Fetched title | Publisher | Why relevant | URL |');
    lines.push('|---:|---|---|---|---|---|---|---|---|');
  } else {
    lines.push('| Rank | Status | Type | Title | Publisher | Why relevant | URL |');
    lines.push('|---:|---|---|---|---|---|---|');
  }
  const sorted = [...args.candidates].sort((a, b) => a.rank - b.rank);
  for (const c of sorted) {
    const safeTitle = c.title.replace(/\|/g, '\\|');
    const safePub = (c.publisher ?? '—').replace(/\|/g, '\\|');
    const safeWhy = c.why_relevant.replace(/\|/g, '\\|');
    if (ranAnyCheck) {
      const fetched = c.relevance?.fetched_title ?? '—';
      const safeFetched = fetched.replace(/\|/g, '\\|');
      lines.push(
        `| ${c.rank} | \`${c.status}\` | ${relevanceCellLabel(c)} | ${c.source_type_guess} | ${safeTitle} | ${safeFetched} | ${safePub} | ${safeWhy} | ${c.url} |`,
      );
    } else {
      lines.push(
        `| ${c.rank} | \`${c.status}\` | ${c.source_type_guess} | ${safeTitle} | ${safePub} | ${safeWhy} | ${c.url} |`,
      );
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('Approve candidates with `research-os discover approve <section> --top N` or `--candidate disc_<hex>`. Reject with `research-os discover reject <section> --candidate disc_<hex> --reason "..."`. Export approved URLs for gather with `research-os discover export-urls <section>` (or `gather <section> --approved`).');
  return lines.join('\n');
}

export async function discover(options: DiscoverOptions): Promise<DiscoverResult> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  if (!existsSync(join(packPath, 'research.yaml'))) throw new PackNotFoundError(packPath);
  if (!existsSync(join(packPath, 'sections', options.sectionId)))
    throw new SectionNotFoundError(options.sectionId);

  const query = options.query.trim();
  // C1-010: validation → InvalidArgumentError (D-008 pattern).
  if (query.length < 4)
    throw new InvalidArgumentError('discover query must be at least 4 characters');

  const target = options.targetCount ?? DEFAULT_TARGET_COUNT;
  const providers = options.providers ?? defaultProviders();
  const provider = await pickProvider(providers);
  if (!provider) {
    // C1-010: state failure (no provider available). INTAKE_VALIDATION is the
    // closest existing code; see escalation note (DETECTOR_UNAVAILABLE family
    // would be more precise).
    throw new ResearchOSError(
      'No discover provider available. Default provider is LLM-based and requires Ollama.',
      'INTAKE_VALIDATION',
      'Start the Ollama daemon (default provider requires it), or supply a custom provider via the library API. See handbook/known-limitations.md.',
    );
  }

  const sectionPurpose = await loadSectionPurpose(packPath, options.sectionId);
  const result = await provider.propose({
    sectionId: options.sectionId,
    query,
    sectionPurpose,
    targetCount: target,
  });
  if (!result.ok) {
    // C1-010: provider runtime failure — state error.
    throw new ResearchOSError(
      `Discover provider "${provider.name}" failed: ${result.error}`,
      'INTAKE_VALIDATION',
      `Inspect the provider error above. Re-run \`research-os discover run <section> --query "..."\` after addressing the cause (e.g., restart Ollama). See handbook/recovery.md.`,
    );
  }

  const stamp = (options.now ?? (() => new Date()))();
  const stampIso = stamp.toISOString();

  // Filter syntactically invalid URLs at intake. Track count for the summary;
  // the operator will see it in the report.
  const validProposals: DiscoverProposal[] = [];
  let invalidCount = 0;
  const warnings: string[] = [];
  for (const p of result.proposals) {
    if (!isHttpsUrl(p.url)) {
      invalidCount += 1;
      warnings.push(`Rejected non-https URL: ${p.url}`);
      continue;
    }
    validProposals.push(p);
  }

  // De-duplicate against existing candidates for this section. If the same
  // URL was previously proposed (any status), don't append a duplicate.
  const existing = await readCandidates(packPath, options.sectionId);
  const existingByUrl = new Map<string, DiscoveryCandidate>();
  for (const e of latestPerCandidate(existing).values()) existingByUrl.set(e.url, e);

  // Determine which proposals are net-new (not duplicates).
  const newProposals: DiscoverProposal[] = [];
  for (const p of validProposals) {
    if (existingByUrl.has(p.url)) {
      warnings.push(`Skipped duplicate (already proposed): ${p.url}`);
      continue;
    }
    newProposals.push(p);
  }

  // R-008 — admission-layer relevance check. Runs BEFORE candidate-record
  // construction so each new ledger entry carries its relevance verdict.
  // Only the new proposals are checked (avoid re-fetching for duplicates).
  let relevanceChecks: (RelevanceCheck | null)[] = newProposals.map(() => null);
  const relevanceTotals: RelevanceTotals = { verified: 0, unverified: 0, topic_mismatch: 0 };
  if (options.relevanceCheck && options.relevanceCheck.enabled && newProposals.length > 0) {
    const cfg = options.relevanceCheck;
    const results = await assessRelevanceBatch({
      urls: newProposals.map((p) => p.url),
      query,
      fetchImpl: cfg.fetchImpl,
      threshold: cfg.threshold ?? DEFAULT_RELEVANCE_THRESHOLD,
      fetchTimeoutMs: cfg.fetchTimeoutMs ?? DEFAULT_RELEVANCE_FETCH_TIMEOUT_MS,
      concurrency: cfg.concurrency ?? DEFAULT_RELEVANCE_FETCH_CONCURRENCY,
      now: options.now,
    });
    relevanceChecks = results;
    for (const rc of results) {
      relevanceTotals[rc.status] += 1;
    }
  }

  const newCandidates: DiscoveryCandidate[] = [];
  for (let i = 0; i < newProposals.length; i += 1) {
    const p = newProposals[i]!;
    const candidate = DiscoveryCandidateSchema.parse({
      candidate_id: makeCandidateId(options.sectionId, p.url),
      section_id: options.sectionId,
      url: p.url,
      title: p.title,
      publisher: p.publisher,
      source_type_guess: p.source_type_guess,
      why_relevant: p.why_relevant,
      query,
      rank: p.rank,
      discovered_at: stampIso,
      status: 'candidate',
      discovered_by: provider.name,
      reason: null,
      relevance: relevanceChecks[i] ?? null,
    });
    newCandidates.push(candidate);
  }

  // Append to ledger.
  const ledgerPath = candidatesPath(packPath, options.sectionId);
  await mkdir(join(packPath, 'sections', options.sectionId), { recursive: true });
  for (const c of newCandidates) {
    await appendFile(ledgerPath, JSON.stringify(c) + '\n', 'utf8');
  }

  // Render the human-readable report against the FULL latest set (not just
  // this run's new candidates), so the report reflects current section state.
  // R-008: relevanceTotals in the report rolls up the FULL ledger (so prior
  // mismatches stay visible even on subsequent discover runs).
  const all = await readCandidates(packPath, options.sectionId);
  const latest = Array.from(latestPerCandidate(all).values());
  const fullRelevanceTotals: RelevanceTotals = { verified: 0, unverified: 0, topic_mismatch: 0 };
  for (const c of latest) {
    if (c.relevance) fullRelevanceTotals[c.relevance.status] += 1;
  }
  const md = buildReportMarkdown({
    sectionId: options.sectionId,
    query,
    provider: provider.name,
    ranAt: stampIso,
    candidates: latest,
    relevanceTotals: fullRelevanceTotals,
  });
  await writeFile(reportPath(packPath, options.sectionId), md, 'utf8');

  // Run-level summary.
  const summary: DiscoverySummary = DiscoverySummarySchema.parse({
    summary_id: `disum_${stamp.getTime()}_${options.sectionId}`,
    section_id: options.sectionId,
    ran_at: stampIso,
    research_os_version: RESEARCH_OS_VERSION,
    query,
    provider: provider.name,
    candidates_proposed: result.proposals.length,
    candidates_validated: newCandidates.length,
    candidates_rejected_invalid_url: invalidCount,
    warnings,
  });
  await mkdir(join(packPath, 'audits'), { recursive: true });
  await writeFile(summaryPath(packPath, options.sectionId), JSON.stringify(summary, null, 2), 'utf8');

  return {
    candidatesAdded: newCandidates.length,
    candidatesProposed: result.proposals.length,
    candidatesRejectedInvalidUrl: invalidCount,
    warnings,
    candidates: newCandidates,
    candidatesPath: ledgerPath,
    reportPath: reportPath(packPath, options.sectionId),
    summaryPath: summaryPath(packPath, options.sectionId),
    // R-008: counts span only THIS run's new candidates (matches candidatesAdded).
    // Pre-R-008 ledger entries (relevance: null) do not contribute.
    relevanceTotals,
  };
}

async function appendStatusUpdate(
  packPath: string,
  sectionId: string,
  candidate: DiscoveryCandidate,
  newStatus: DiscoveryCandidateStatus,
  reason: string | null,
  stampIso: string,
): Promise<DiscoveryCandidate> {
  const updated: DiscoveryCandidate = DiscoveryCandidateSchema.parse({
    ...candidate,
    status: newStatus,
    reason,
    discovered_at: stampIso,
  });
  await appendFile(candidatesPath(packPath, sectionId), JSON.stringify(updated) + '\n', 'utf8');
  return updated;
}

export async function approve(options: ApproveOptions): Promise<ApproveResult> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  if (!existsSync(join(packPath, 'research.yaml'))) throw new PackNotFoundError(packPath);
  if (!existsSync(join(packPath, 'sections', options.sectionId)))
    throw new SectionNotFoundError(options.sectionId);

  const all = await readCandidates(packPath, options.sectionId);
  const latest = latestPerCandidate(all);
  const stamp = (options.now ?? (() => new Date()))();
  const stampIso = stamp.toISOString();

  const targets: DiscoveryCandidate[] = [];
  if (options.candidateIds && options.candidateIds.length > 0) {
    for (const id of options.candidateIds) {
      const c = latest.get(id);
      // C1-010: candidate-id not found. Closest existing code is INTAKE_VALIDATION.
      if (!c)
        throw new ResearchOSError(
          `Candidate ${id} not found in section ${options.sectionId}`,
          'INTAKE_VALIDATION',
          `Check sections/${options.sectionId}/discovery-candidates.jsonl for valid candidate_ids, or re-run \`research-os discover run\` first.`,
        );
      targets.push(c);
    }
  } else if (options.topN && options.topN > 0) {
    // R-008 — `--top N` quarantine. Candidates flagged `topic_mismatch` by
    // the discover-time relevance check are EXCLUDED from automatic top-N
    // approval. Operator override path: name the candidate explicitly via
    // `--candidate <id>` (the explicit-naming above is the override channel,
    // analogous to R-003's clear_severities[] "name the severity to clear"
    // semantics). `unverified` candidates remain eligible — graceful
    // degradation on title-fetch failure.
    const eligible = Array.from(latest.values())
      .filter((c) => c.status === 'candidate')
      .filter((c) => c.relevance?.status !== 'topic_mismatch')
      .sort((a, b) => a.rank - b.rank);
    targets.push(...eligible.slice(0, options.topN));
  } else {
    // C1-010: caller-arg validation (D-008 pattern).
    throw new InvalidArgumentError('approve requires --candidate <id> or --top <N>');
  }

  const approvedIds: string[] = [];
  for (const t of targets) {
    if (t.status === 'approved') {
      approvedIds.push(t.candidate_id);
      continue;
    }
    await appendStatusUpdate(packPath, options.sectionId, t, 'approved', options.reason ?? null, stampIso);
    approvedIds.push(t.candidate_id);
  }
  const exportPath = await exportUrls({ packPath, sectionId: options.sectionId });
  return { approved: approvedIds.length, approvedIds, exportPath: exportPath.exportPath };
}

export async function reject(options: RejectOptions): Promise<RejectResult> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  if (!existsSync(join(packPath, 'research.yaml'))) throw new PackNotFoundError(packPath);
  if (!existsSync(join(packPath, 'sections', options.sectionId)))
    throw new SectionNotFoundError(options.sectionId);
  if (options.reason.trim().length < 4) {
    // C1-010: caller-arg validation (D-008 pattern).
    throw new InvalidArgumentError('reject requires --reason of at least 4 characters');
  }
  const all = await readCandidates(packPath, options.sectionId);
  const latest = latestPerCandidate(all);
  const stamp = (options.now ?? (() => new Date()))();
  const stampIso = stamp.toISOString();
  const rejectedIds: string[] = [];
  for (const id of options.candidateIds) {
    const c = latest.get(id);
    if (!c)
      throw new ResearchOSError(
        `Candidate ${id} not found in section ${options.sectionId}`,
        'INTAKE_VALIDATION',
        `Check sections/${options.sectionId}/discovery-candidates.jsonl for valid candidate_ids.`,
      );
    await appendStatusUpdate(
      packPath,
      options.sectionId,
      c,
      'rejected',
      options.reason.trim(),
      stampIso,
    );
    rejectedIds.push(id);
  }
  // Re-export approved URLs (rejection of an approved candidate removes it).
  await exportUrls({ packPath, sectionId: options.sectionId });
  return { rejected: rejectedIds.length, rejectedIds };
}

export async function exportUrls(options: ExportUrlsOptions): Promise<ExportUrlsResult> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  if (!existsSync(join(packPath, 'research.yaml'))) throw new PackNotFoundError(packPath);
  if (!existsSync(join(packPath, 'sections', options.sectionId)))
    throw new SectionNotFoundError(options.sectionId);
  const all = await readCandidates(packPath, options.sectionId);
  const latest = latestPerCandidate(all);
  const approved = Array.from(latest.values())
    .filter((c) => c.status === 'approved')
    .sort((a, b) => a.rank - b.rank);
  const lines = approved.map((c) => c.url).join('\n');
  const path = approvedUrlsPath(packPath, options.sectionId);
  await mkdir(join(packPath, 'sections', options.sectionId), { recursive: true });
  await writeFile(path, lines + (lines.length > 0 ? '\n' : ''), 'utf8');
  return { exportPath: path, approvedCount: approved.length };
}
