import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as yamlParse } from 'yaml';

import { PackNotFoundError, SectionNotFoundError } from '../errors.js';
import { ResearchYamlSchema } from '../intake/schema.js';
import { RESEARCH_OS_VERSION } from '../index.js';
import {
  DiscoveryCandidateSchema,
  DiscoverySummarySchema,
  type DiscoveryCandidate,
  type DiscoveryCandidateStatus,
  type DiscoverySummary,
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
} from './types.js';
import { LlmHeuristicDiscoverProvider } from './providers/llm-heuristic.js';

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

function buildReportMarkdown(args: {
  sectionId: string;
  query: string;
  provider: string;
  ranAt: string;
  candidates: DiscoveryCandidate[];
}): string {
  const lines: string[] = [];
  lines.push(`# Discovery report: ${args.sectionId}`);
  lines.push('');
  lines.push(`- **Query:** ${args.query}`);
  lines.push(`- **Provider:** ${args.provider}`);
  lines.push(`- **Ran at:** ${args.ranAt}`);
  lines.push(`- **Candidates:** ${args.candidates.length}`);
  lines.push('');
  lines.push('## Candidates');
  lines.push('');
  if (args.candidates.length === 0) {
    lines.push('_No candidates proposed. Provider may have refused on confidence grounds, or returned an empty result._');
    return lines.join('\n');
  }
  lines.push('Discovery results are LEADS, not evidence. A lead becomes evidence only after `research-os gather` produces a fetch receipt + source card + excerpt ledger + claim extraction.');
  lines.push('');
  lines.push('| Rank | Status | Type | Title | Publisher | Why relevant | URL |');
  lines.push('|---:|---|---|---|---|---|---|');
  const sorted = [...args.candidates].sort((a, b) => a.rank - b.rank);
  for (const c of sorted) {
    lines.push(
      `| ${c.rank} | \`${c.status}\` | ${c.source_type_guess} | ${c.title.replace(/\|/g, '\\|')} | ${(c.publisher ?? '—').replace(/\|/g, '\\|')} | ${c.why_relevant.replace(/\|/g, '\\|')} | ${c.url} |`,
    );
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
  if (query.length < 4) throw new Error('discover query must be at least 4 characters');

  const target = options.targetCount ?? DEFAULT_TARGET_COUNT;
  const providers = options.providers ?? defaultProviders();
  const provider = await pickProvider(providers);
  if (!provider) {
    throw new Error('No discover provider available. Default provider is LLM-based and requires Ollama.');
  }

  const sectionPurpose = await loadSectionPurpose(packPath, options.sectionId);
  const result = await provider.propose({
    sectionId: options.sectionId,
    query,
    sectionPurpose,
    targetCount: target,
  });
  if (!result.ok) {
    throw new Error(`Discover provider "${provider.name}" failed: ${result.error}`);
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

  const newCandidates: DiscoveryCandidate[] = [];
  for (const p of validProposals) {
    if (existingByUrl.has(p.url)) {
      warnings.push(`Skipped duplicate (already proposed): ${p.url}`);
      continue;
    }
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
  const all = await readCandidates(packPath, options.sectionId);
  const latest = Array.from(latestPerCandidate(all).values());
  const md = buildReportMarkdown({
    sectionId: options.sectionId,
    query,
    provider: provider.name,
    ranAt: stampIso,
    candidates: latest,
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
      if (!c) throw new Error(`Candidate ${id} not found in section ${options.sectionId}`);
      targets.push(c);
    }
  } else if (options.topN && options.topN > 0) {
    const eligible = Array.from(latest.values())
      .filter((c) => c.status === 'candidate')
      .sort((a, b) => a.rank - b.rank);
    targets.push(...eligible.slice(0, options.topN));
  } else {
    throw new Error('approve requires --candidate <id> or --top <N>');
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
    throw new Error('reject requires --reason of at least 4 characters');
  }
  const all = await readCandidates(packPath, options.sectionId);
  const latest = latestPerCandidate(all);
  const stamp = (options.now ?? (() => new Date()))();
  const stampIso = stamp.toISOString();
  const rejectedIds: string[] = [];
  for (const id of options.candidateIds) {
    const c = latest.get(id);
    if (!c) throw new Error(`Candidate ${id} not found in section ${options.sectionId}`);
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
