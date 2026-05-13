#!/usr/bin/env node
import { Command, InvalidArgumentError, Option } from 'commander';
import { init } from './intake/index.js';
import { add as sectionAdd } from './sections/index.js';
import { reportSection } from './section_report/index.js';
import { gather } from './sources/index.js';
import {
  discover as runDiscover,
  approve as discoverApprove,
  reject as discoverReject,
  exportUrls as discoverExport,
} from './discover/index.js';
import { auditDensity, extract as claimExtract } from './claims/index.js';
import { triage as runTriage } from './triage/index.js';
import { map as contradictMap, resolve as contradictResolve } from './contradictions/index.js';
import { gate as runGate } from './gates/index.js';
import {
  DEFAULT_PROFILE,
  HeuristicReviewer,
  OllamaInternReviewer,
  promote as runPromote,
  review as runReview,
} from './review/index.js';
import {
  build as indexBuild,
  query as indexQuery,
  exportRepoKnowledge,
  syncRepoKnowledge,
} from './indexer/index.js';
import { handoff as coworkHandoff } from './cowork/index.js';
import {
  workspace as synthWorkspace,
  sectionSynthesis as synthSection,
} from './synth/index.js';
import { audit as runAudit } from './audit/index.js';
import { freeze as runFreeze } from './freeze/index.js';
import { invalidateExtraction, invalidateReview } from './invalidate/index.js';
import { publish as packPublish } from './pack/publish/index.js';
import {
  runSourceCardAudit,
  applySourceCardOverrides,
} from './sources/source-card-audit.js';
import { ResearchOSError, ReviewerProfileNotFoundError } from './errors.js';
import { HELP_TOPICS } from './cli/help-topics.js';
import { RESEARCH_OS_VERSION } from './index.js';
import { loadReceiptForPack, receiptPathForPack } from './calibration/lookup.js';
import type { ReviewerOptions } from './review/reviewer-options-schema.js';

function reportError(err: unknown): never {
  if (err instanceof ResearchOSError) {
    process.stderr.write(`research-os: ${err.code}: ${err.message}\n`);
    if (err.hint) process.stderr.write(`  hint: ${err.hint}\n`);
  } else if (err instanceof Error) {
    process.stderr.write(`research-os: ${err.message}\n`);
  } else {
    process.stderr.write(`research-os: unknown error\n`);
  }
  process.exit(1);
}

/**
 * D-006: returns a commander option coercer that parses an integer or throws
 * `InvalidArgumentError` with the option label, surfaced cleanly through
 * commander's own usage-error handling (no silent NaN propagation).
 *
 * Use as `.option('--limit <n>', '...', parseIntArg('--limit'))`.
 */
export function parseIntArg(label: string): (value: string) => number {
  return (value: string): number => {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) {
      throw new InvalidArgumentError(
        `${label}: expected integer, got '${value}'`,
      );
    }
    return n;
  };
}

// C2-RE-001 fix: translate --no-progress / --progress Commander flags into the
// RESEARCH_OS_NO_PROGRESS / RESEARCH_OS_FORCE_PROGRESS env vars that
// src/util/progress.ts inspects. Reads process.argv directly so the two flags
// share no Commander destination field (avoids Commander's --no-X negation
// magic clashing with --progress on the same opts key). Mutual exclusion is a
// usage error so an operator who passes both (e.g. alias + command line) gets
// a clear failure instead of unspecified behavior.
export function applyProgressFlags(argv: readonly string[] = process.argv): void {
  const hasNoProgress = argv.includes('--no-progress');
  const hasProgress = argv.includes('--progress');
  if (hasNoProgress && hasProgress) {
    throw new InvalidArgumentError(
      '--no-progress and --progress are mutually exclusive',
    );
  }
  if (hasNoProgress) process.env.RESEARCH_OS_NO_PROGRESS = '1';
  if (hasProgress) process.env.RESEARCH_OS_FORCE_PROGRESS = '1';
}

const program = new Command();

program
  .name('research-os')
  .description('Local-first research control plane for gated source packs and long-running AI synthesis')
  .version(RESEARCH_OS_VERSION);

program
  .command('init')
  .description('Create a new research-pack from a topic')
  .argument('<topic>', 'The research question or topic statement')
  .option('-n, --name <slug>', 'Pack directory name (defaults to a slug of the topic)')
  .option('-o, --out <dir>', 'Parent directory in which to create the pack', process.cwd())
  .option('-d, --decision <text>', 'What decision this research informs')
  .option('-a, --audience <text>', 'Who consumes the output', 'self')
  .option('--desired-output <text>', 'Shape of the final artifact')
  .option('--max-runtime-minutes <n>', 'Total runtime budget for the pack', parseIntArg('--max-runtime-minutes'), 240)
  .option('--force', 'Overwrite an existing pack directory')
  .action(async (topic: string, opts) => {
    try {
      const result = await init({
        topic,
        name: opts.name,
        outDir: opts.out,
        decision: opts.decision,
        audience: opts.audience,
        desiredOutput: opts.desiredOutput,
        maxRuntimeMinutes: opts.maxRuntimeMinutes,
        force: opts.force,
      });
      process.stdout.write(`research-pack created\n`);
      process.stdout.write(`  name: ${result.packName}\n`);
      process.stdout.write(`  path: ${result.packPath}\n`);
      process.stdout.write(`  files: ${result.filesWritten.length}\n`);
    } catch (err) {
      reportError(err);
    }
  });

const sectionCmd = program
  .command('section')
  .description('Manage sections inside a research-pack');

sectionCmd
  .command('add')
  .description('Add a new section to the pack')
  .argument('<id>', 'Section id, e.g. "01-landscape"')
  .requiredOption('--purpose <text>', 'What this section investigates')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option('--max-time <n>', 'Section time budget in minutes', parseIntArg('--max-time'))
  .option('--min-sources <n>', 'Minimum sources required for this section', parseIntArg('--min-sources'))
  .option('--primary-required <n>', 'Primary sources required for this section', parseIntArg('--primary-required'))
  .option('--force', 'Overwrite an existing on-disk section directory that drifted from research.yaml (D-005)')
  .action(async (id: string, opts) => {
    try {
      const result = await sectionAdd({
        id,
        purpose: opts.purpose,
        packPath: opts.pack,
        maxTimeMinutes: opts.maxTime,
        minSources: opts.minSources,
        primarySourcesRequired: opts.primaryRequired,
        force: Boolean(opts.force),
      });
      process.stdout.write(`section added\n`);
      process.stdout.write(`  id:    ${result.sectionId}\n`);
      process.stdout.write(`  path:  ${result.sectionPath}\n`);
      process.stdout.write(`  files: ${result.filesWritten.length}\n`);
    } catch (err) {
      reportError(err);
    }
  });

sectionCmd
  .command('report')
  .description(
    'Read-only section roll-up: sources, extraction, contradictions, review, acceptance ratio',
  )
  .argument('<section>', 'Section id, e.g. "03-source-and-claim-truth"')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .action(async (section: string, opts) => {
    try {
      const { report, jsonPath, markdownPath } = await reportSection({
        sectionId: section,
        packPath: opts.pack,
      });
      process.stdout.write(`section report: ${report.section_id}\n`);
      process.stdout.write(`  status:                    ${report.status}\n`);
      process.stdout.write(`Sources\n`);
      process.stdout.write(`  fetched:                   ${report.sources.fetched_ok}\n`);
      process.stdout.write(`  source cards:              ${report.sources.source_cards}\n`);
      process.stdout.write(`  publishers:                ${report.sources.publishers.length}\n`);
      process.stdout.write(`  primary-source waiver:     ${report.sources.primary_source_waiver.status}\n`);
      process.stdout.write(`Extraction\n`);
      process.stdout.write(`  candidate claims:          ${report.extraction.candidate_claims}\n`);
      process.stdout.write(`  claims per 1k words:       ${report.extraction.claims_per_1k_words.toFixed(2)}\n`);
      process.stdout.write(`  excerpt pages processed:   ${report.extraction.excerpt_pages_processed ?? 'n/a'}\n`);
      process.stdout.write(`  excerpt-id failures:       ${report.extraction.excerpt_id_failures ?? 'n/a'}\n`);
      process.stdout.write(`  malformed extractor:       ${report.extraction.malformed_extractor_outputs ?? 'n/a'}\n`);
      process.stdout.write(`  near-duplicate clusters:   ${report.extraction.near_duplicate_clusters}\n`);
      process.stdout.write(`Contradictions\n`);
      process.stdout.write(`  pairs compared:            ${report.contradictions.pairs_compared ?? 'n/a'}\n`);
      process.stdout.write(`  contradiction candidates:  ${report.contradictions.contradiction_candidates}\n`);
      process.stdout.write(`  overgeneralization risks:  ${report.contradictions.overgeneralization_risks}\n`);
      process.stdout.write(`Review\n`);
      if (!report.review.reviewed) {
        process.stdout.write(`  (not reviewed yet)\n`);
      } else {
        process.stdout.write(`  accepted_for_synthesis:    ${report.review.accepted_for_synthesis}\n`);
        process.stdout.write(`  needs_scope_repair:        ${report.review.needs_scope_repair}\n`);
        process.stdout.write(`  needs_source_repair:       ${report.review.needs_source_repair}\n`);
        process.stdout.write(`  rejected:                  ${report.review.rejected}\n`);
        process.stdout.write(`  needs_human_review:        ${report.review.needs_human_review}\n`);
      }
      process.stdout.write(`Acceptance\n`);
      process.stdout.write(`  ratio:                     ${(report.acceptance.acceptance_ratio * 100).toFixed(1)}% (${report.acceptance.accepted_for_synthesis} / ${report.acceptance.candidate_claims})\n`);
      process.stdout.write(`  accepted per source:       ${report.acceptance.accepted_per_source.toFixed(2)}\n`);
      process.stdout.write(`  accepted per 1k words:     ${report.acceptance.accepted_per_1k_words.toFixed(2)}\n`);
      process.stdout.write(`  top rejection category:    ${report.acceptance.top_rejection_category ?? 'none'}\n`);
      process.stdout.write(`  claim_overproduction:      ${report.acceptance.claim_overproduction_fired ? 'yes' : 'no'}\n`);
      process.stdout.write(`  synthesis ready:           ${report.acceptance.synthesis_ready ? 'yes' : 'no'}\n`);
      process.stdout.write(`  json:                      ${jsonPath}\n`);
      process.stdout.write(`  markdown:                  ${markdownPath}\n`);
    } catch (err) {
      reportError(err);
    }
  });

program
  .command('gather')
  .description('Acquire known sources for a section: direct fetch + extraction')
  .argument('<section>', 'Section id, e.g. "01-landscape"')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option('--url <url>', 'A URL to fetch (repeatable)', (value: string, prev: string[] = []) => {
    prev.push(value);
    return prev;
  })
  .option('--urls-file <path>', 'File of URLs, one per line; blank lines and # comments allowed')
  .option(
    '--approved',
    'Read URLs from sections/<id>/urls.approved.txt (produced by `research-os discover approve` / `discover export-urls`)',
    false,
  )
  .option('--no-progress', 'Suppress per-iteration progress output to stderr')
  .option('--progress', 'Force per-iteration progress output even when not on a TTY (debug aid)')
  .action(async (section: string, opts) => {
    try {
      applyProgressFlags();
      let urlsFile = opts.urlsFile as string | undefined;
      if (opts.approved) {
        const path = await import('node:path');
        const fs = await import('node:fs/promises');
        const candidate = path.join(opts.pack as string, 'sections', section, 'urls.approved.txt');
        // D-004: stat the approved-URLs file before passing it to gather so
        // a missing file produces an actionable hint instead of a generic
        // "no urls" error downstream.
        try {
          await fs.stat(candidate);
        } catch (statErr) {
          const code = (statErr as NodeJS.ErrnoException).code;
          if (code === 'ENOENT') {
            throw new ResearchOSError(
              `Approved URLs file not found: ${candidate}`,
              'APPROVED_URLS_NOT_FOUND',
              'No approved URLs found. Run `research-os discover approve` (or `discover export-urls`) first to produce sections/<id>/urls.approved.txt.',
            );
          }
          throw statErr;
        }
        urlsFile = urlsFile ?? candidate;
      }
      const result = await gather({
        sectionId: section,
        packPath: opts.pack,
        urls: opts.url,
        urlsFile,
      });
      process.stdout.write(`gather complete\n`);
      process.stdout.write(`  section:           ${result.sectionId}\n`);
      process.stdout.write(`  attempted:         ${result.attempted}\n`);
      process.stdout.write(`  fetched ok:        ${result.fetchedOk}\n`);
      process.stdout.write(`  fetched failed:    ${result.fetchedFailed}\n`);
      process.stdout.write(`  extracted ok:      ${result.extractedOk}\n`);
      process.stdout.write(`  extracted failed:  ${result.extractedFailed}\n`);
      process.stdout.write(`  cards written:     ${result.cardsWritten}\n`);
      process.stdout.write(`  receipts appended: ${result.receiptsAppended}\n`);
    } catch (err) {
      reportError(err);
    }
  });

const discoverCmd = program
  .command('discover')
  .description(
    'Propose source URL candidates for a section. Discovery results are LEADS, not evidence — only fetch + receipt + source card make a URL evidence.',
  );

discoverCmd
  .command('run')
  .description('Run a discover query against a section, append candidates to the ledger, render report')
  .argument('<section>', 'Section id, e.g. "04-gates-and-waivers"')
  .requiredOption('--query <text>', 'Free-text query to ask the discover provider')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option('--target <n>', 'Soft target candidate count', parseIntArg('--target'), 12)
  .action(async (section: string, opts) => {
    try {
      const result = await runDiscover({
        sectionId: section,
        packPath: opts.pack,
        query: opts.query,
        targetCount: opts.target,
      });
      process.stdout.write(`discover complete\n`);
      process.stdout.write(`  section:                ${section}\n`);
      process.stdout.write(`  candidates proposed:    ${result.candidatesProposed}\n`);
      process.stdout.write(`  candidates added:       ${result.candidatesAdded}\n`);
      process.stdout.write(`  invalid url rejected:   ${result.candidatesRejectedInvalidUrl}\n`);
      process.stdout.write(`  candidates ledger:      ${result.candidatesPath}\n`);
      process.stdout.write(`  report:                 ${result.reportPath}\n`);
      process.stdout.write(`  summary:                ${result.summaryPath}\n`);
      if (result.warnings.length > 0) {
        process.stdout.write(`\nwarnings:\n`);
        for (const w of result.warnings) process.stdout.write(`  - ${w}\n`);
      }
    } catch (err) {
      reportError(err);
    }
  });

discoverCmd
  .command('approve')
  .description('Approve discovered candidates so gather --approved will fetch them')
  .argument('<section>', 'Section id')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option(
    '--candidate <id>',
    'Candidate id (repeatable)',
    (v: string, prev: string[] = []) => {
      prev.push(v);
      return prev;
    },
  )
  .option('--top <n>', 'Approve the top N candidates by rank', parseIntArg('--top'))
  .option('--reason <text>', 'Optional reason recorded on the status update')
  .action(async (section: string, opts) => {
    try {
      const result = await discoverApprove({
        sectionId: section,
        packPath: opts.pack,
        candidateIds: opts.candidate,
        topN: opts.top,
        reason: opts.reason,
      });
      process.stdout.write(`discover approve\n`);
      process.stdout.write(`  approved:    ${result.approved}\n`);
      for (const id of result.approvedIds) process.stdout.write(`    - ${id}\n`);
      process.stdout.write(`  exported:    ${result.exportPath}\n`);
    } catch (err) {
      reportError(err);
    }
  });

discoverCmd
  .command('reject')
  .description('Reject discovered candidates with a recorded reason')
  .argument('<section>', 'Section id')
  .requiredOption(
    '--candidate <id>',
    'Candidate id (repeatable)',
    (v: string, prev: string[] = []) => {
      prev.push(v);
      return prev;
    },
  )
  .requiredOption('--reason <text>', 'Reason recorded on the status update')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .action(async (section: string, opts) => {
    try {
      const result = await discoverReject({
        sectionId: section,
        packPath: opts.pack,
        candidateIds: opts.candidate,
        reason: opts.reason,
      });
      process.stdout.write(`discover reject\n`);
      process.stdout.write(`  rejected: ${result.rejected}\n`);
      for (const id of result.rejectedIds) process.stdout.write(`    - ${id}\n`);
    } catch (err) {
      reportError(err);
    }
  });

discoverCmd
  .command('export-urls')
  .description('Re-export sections/<id>/urls.approved.txt from the latest approved candidates')
  .argument('<section>', 'Section id')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .action(async (section: string, opts) => {
    try {
      const result = await discoverExport({
        sectionId: section,
        packPath: opts.pack,
      });
      process.stdout.write(`discover export-urls\n`);
      process.stdout.write(`  approved count: ${result.approvedCount}\n`);
      process.stdout.write(`  export path:    ${result.exportPath}\n`);
    } catch (err) {
      reportError(err);
    }
  });

const claimCmd = program
  .command('claim')
  .description('Manage claims extracted from gathered sources');

claimCmd
  .command('extract')
  .description('Extract candidate claims from a section\'s gathered sources')
  .argument('<section>', 'Section id, e.g. "01-landscape"')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option(
    '--model <name>',
    'Per-call MCP model override (e.g. hermes3:8b). Precedence: --model ?? OLLAMA_INTERN_MODEL env var. The MCP server falls back to its tier default on timeout.',
  )
  .action(async (section: string, opts) => {
    try {
      const effectiveModel =
        (opts.model as string | undefined) ?? process.env.OLLAMA_INTERN_MODEL ?? undefined;
      const result = await claimExtract({
        sectionId: section,
        packPath: opts.pack,
        effectiveModel,
      });
      process.stdout.write(`claim extraction complete\n`);
      process.stdout.write(`  section:                            ${result.sectionId}\n`);
      process.stdout.write(`  extractor:                          ${result.extractor}\n`);
      process.stdout.write(`  method:                             ${result.extractionMethod}\n`);
      process.stdout.write(`  sources processed:                  ${result.sourcesProcessed}\n`);
      process.stdout.write(`  sources skipped:                    ${result.sourcesSkipped}\n`);
      process.stdout.write(`  sources failed:                     ${result.sourcesFailed}\n`);
      process.stdout.write(`  excerpt ledgers built:              ${result.excerptLedgersBuilt}\n`);
      process.stdout.write(`  claims added:                       ${result.claimsAdded}\n`);
      process.stdout.write(`  claims deduped:                     ${result.claimsDeduped}\n`);
      process.stdout.write(`  claims rejected (total ungrounded): ${result.claimsRejectedUngrounded}\n`);
      // Span-first taxonomy: precise rejection categories. Others
      // (unsupported_claim / scope_missing / scope_widening / cross_source_contam)
      // are reviewer concerns and surface in the review step, not here.
      process.stdout.write(`    excerpt_id_missing:               ${result.claimsRejectedExcerptIdMissing}\n`);
      process.stdout.write(`    excerpt_id_malformed:             ${result.claimsRejectedExcerptIdMalformed}\n`);
      // Phase 1b-b: section-evidence critic breakdown. Heuristic extractor
      // never invokes the critic so all counts are zero; only the MCP path
      // populates them.
      const tally = result.criticTally;
      const criticTotal =
        tally.supports_section +
        tally.off_topic +
        tally.background_only +
        tally.source_chrome +
        tally.critic_call_failed;
      if (criticTotal > 0) {
        process.stdout.write(`  critic decisions (per-claim):       ${criticTotal}\n`);
        // The critic tally counts decisions on every draft seen, BEFORE
        // persistence. A draft critic'd as supports_section can still be
        // rejected (ungrounded / excerpt_id_missing / excerpt_id_malformed)
        // or deduped before it reaches claims.jsonl, so this label is
        // pre-persist. The persisted admitted count is printed below.
        process.stdout.write(`    supports_section (pre-persist):   ${tally.supports_section}\n`);
        process.stdout.write(`    frame_excluded:off_topic:         ${tally.off_topic}\n`);
        process.stdout.write(`    frame_excluded:background_only:   ${tally.background_only}\n`);
        process.stdout.write(`    frame_excluded:source_chrome:     ${tally.source_chrome}\n`);
        if (tally.critic_call_failed > 0) {
          // v0.8.0 phase 1b-b: critic-unavailable now defaults to
          // frame_excluded:true (conservative exclusion), NOT admit. The
          // label below matches the actual shipped soft-fail-inversion
          // behavior; older builds called this "(admit)" before the fix.
          process.stdout.write(`    critic_call_failed (conservatively excluded): ${tally.critic_call_failed}\n`);
        }
        // Reconciliation line — what actually landed in claims.jsonl with
        // frame_excluded:false. Matches `grep -c '"frame_excluded":false'
        // claims.jsonl` after the run completes. May be lower than
        // supports_section (pre-persist) above when drafts were rejected
        // during persistence or deduped against an earlier extraction.
        process.stdout.write(`  admitted (persisted on disk):       ${result.claimsAdmittedPersisted}\n`);
      }
      if (result.failures.length > 0) {
        process.stdout.write(`\nfailures:\n`);
        for (const f of result.failures) {
          // Annotate JSON-parse failures so they're visibly distinct from
          // network/transport errors.
          const tag = /not valid JSON/i.test(f.reason) ? '[extractor_invalid_json] ' : '';
          process.stdout.write(`  ${f.source_id}: ${tag}${f.reason}\n`);
        }
      }
    } catch (err) {
      reportError(err);
    }
  });

claimCmd
  .command('triage')
  .description(
    'Shape candidate claims before review: dedupe, cap per-source contribution, park weak-scope/low-value claims. Read-only on claims.jsonl.',
  )
  .argument('<section>', 'Section id, e.g. "03-source-and-claim-truth"')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option('--per-source-cap <n>', 'Max claims per source forwarded to review', parseIntArg('--per-source-cap'), 10)
  .option('--min-assert-chars <n>', 'Asserts shorter than this become parked_low_value', parseIntArg('--min-assert-chars'), 30)
  .action(async (section: string, opts) => {
    try {
      const result = await runTriage({
        sectionId: section,
        packPath: opts.pack,
        perSourceCap: opts.perSourceCap,
        minAssertChars: opts.minAssertChars,
      });
      process.stdout.write(`claim triage complete\n`);
      process.stdout.write(`  section:               ${section}\n`);
      process.stdout.write(`  candidate claims:      ${result.candidateClaims}\n`);
      process.stdout.write(`  selected_for_review:   ${result.selectedCount}\n`);
      process.stdout.write(`  parked (total):        ${result.parkedCount}\n`);
      process.stdout.write(`  needs_repair (total):  ${result.needsRepairCount}\n`);
      process.stdout.write(`\ndecisions:\n`);
      for (const [d, n] of Object.entries(result.decisions)) {
        process.stdout.write(`  ${d}: ${n}\n`);
      }
      process.stdout.write(`\n  triage jsonl:    ${result.triageJsonlPath}\n`);
      process.stdout.write(`  triage markdown: ${result.triageMarkdownPath}\n`);
      process.stdout.write(`  summary json:    ${result.summaryJsonPath}\n`);
    } catch (err) {
      reportError(err);
    }
  });

claimCmd
  .command('audit-density')
  .description(
    'Read-only diagnostic of a section claim ledger before review: claims/source, claims per 1k words, near-duplicate clusters, weak/generic scope',
  )
  .argument('<section>', 'Section id, e.g. "03-source-and-claim-truth"')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .action(async (section: string, opts) => {
    try {
      const result = await auditDensity({
        sectionId: section,
        packPath: opts.pack,
      });
      const a = result.audit;
      process.stdout.write(`claim density audit complete\n`);
      process.stdout.write(`  section:                ${a.section_id}\n`);
      process.stdout.write(`  candidate claims:       ${a.candidate_claim_count}\n`);
      process.stdout.write(`  sources:                ${a.source_count}\n`);
      process.stdout.write(`  source word total:      ${a.total_source_word_count.toLocaleString()}\n`);
      process.stdout.write(`  claims per 1k words:    ${a.claims_per_1k_words.toFixed(2)}\n`);
      process.stdout.write(`  weak-scope claims:      ${a.weak_scope_count}\n`);
      process.stdout.write(`  generic-scope claims:   ${a.generic_scope_count}\n`);
      process.stdout.write(`  near-duplicate clusters: ${a.near_duplicate_clusters.length}\n`);
      process.stdout.write(`  flags:                  ${a.flags.length}\n`);
      for (const f of a.flags) {
        process.stdout.write(`    [${f.severity}] ${f.type}: ${f.message}\n`);
      }
      process.stdout.write(`  json:                   ${result.jsonPath}\n`);
      process.stdout.write(`  markdown:               ${result.markdownPath}\n`);
    } catch (err) {
      reportError(err);
    }
  });

const contradictCmd = program
  .command('contradict')
  .description('Map tensions between candidate claims');

contradictCmd
  .command('map')
  .description('Detect contradiction candidates among a section\'s candidate claims')
  .argument('<section>', 'Section id, e.g. "01-landscape"')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option(
    '--triaged-only',
    'Only consider claims that triage selected_for_review; reduces N² pair classification on dense sections',
    false,
  )
  .addOption(
    new Option(
      '--detector <mode>',
      'Detector to use: auto (default, env-var-driven), heuristic (always fast, no LLM), ollama-intern (require LLM, fail visibly if unavailable)',
    )
      .choices(['auto', 'heuristic', 'ollama-intern'])
      .default('auto'),
  )
  .option('--no-progress', 'Suppress per-iteration progress output to stderr')
  .option('--progress', 'Force per-iteration progress output even when not on a TTY (debug aid)')
  .action(async (section: string, opts) => {
    try {
      applyProgressFlags();
      const result = await contradictMap({
        sectionId: section,
        packPath: opts.pack,
        triagedOnly: opts.triagedOnly,
        detectorMode: opts.detector,
      });
      process.stdout.write(`${result.detectorAnnouncement}\n`);
      process.stdout.write(`contradiction map complete\n`);
      process.stdout.write(`  section:                 ${result.sectionId}\n`);
      process.stdout.write(`  detector:                ${result.detector}\n`);
      process.stdout.write(`  method:                  ${result.detectionMethod}\n`);
      process.stdout.write(`  candidate claims:        ${result.candidateClaims}\n`);
      process.stdout.write(`  pairs compared:          ${result.pairsCompared}\n`);
      process.stdout.write(`  contradictions added:    ${result.contradictionsAdded}\n`);
      process.stdout.write(`  contradictions deduped:  ${result.contradictionsDeduped}\n`);
      if (result.detectorError) {
        process.stdout.write(`\ndetector error: ${result.detectorError}\n`);
      }
    } catch (err) {
      reportError(err);
    }
  });

contradictCmd
  .command('resolve')
  .description('Record resolution status for contradiction candidates in a section')
  .argument('<section>', 'Section id, e.g. "08-acceptance-suite"')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option(
    '--id <id>',
    'Contradiction ID to resolve (repeatable)',
    (v: string, prev: string[] = []) => { prev.push(v); return prev; },
  )
  .option('--all', 'Resolve all currently-unresolved contradictions in the section', false)
  .requiredOption('--status <status>', 'Resolution status: resolved, preserved, or rejected')
  .requiredOption('--reason <text>', 'Reason for this resolution (min 4 chars)')
  .option('--by <identifier>', 'Who resolved it (recorded in ledger)', 'operator')
  .action(async (section: string, opts) => {
    try {
      // D-008: route argument errors through commander's InvalidArgumentError
      // so they flow through reportError like the rest of the command path
      // instead of bypassing the catch block via raw stderr + exit(1).
      if (!opts.all && (!opts.id || opts.id.length === 0)) {
        throw new InvalidArgumentError(
          'must provide --id <id> (repeatable) or --all',
        );
      }
      if (opts.status === 'unresolved') {
        throw new InvalidArgumentError(
          '--status unresolved is the default; use resolved, preserved, or rejected',
        );
      }
      const result = await contradictResolve({
        sectionId: section,
        packPath: opts.pack,
        contradictionIds: opts.id,
        all: opts.all,
        status: opts.status,
        reason: opts.reason,
        resolvedBy: opts.by,
      });
      process.stdout.write(`contradict resolve complete\n`);
      process.stdout.write(`  section:      ${result.sectionId}\n`);
      process.stdout.write(`  applied:      ${result.applied}\n`);
      process.stdout.write(`  skipped:      ${result.skipped}\n`);
      process.stdout.write(`  ledger:       ${result.ledgerPath}\n`);
    } catch (err) {
      reportError(err);
    }
  });

program
  .command('gate')
  .description('Run the section gate engine and emit a structured verdict')
  .argument('<section>', 'Section id, e.g. "01-landscape"')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .action(async (section: string, opts) => {
    try {
      const result = await runGate({
        sectionId: section,
        packPath: opts.pack,
      });
      process.stdout.write(`gate verdict: ${result.verdict.toUpperCase()}\n`);
      process.stdout.write(`  section:             ${result.section_id}\n`);
      process.stdout.write(`  synthesis eligible:  ${result.synthesis_eligible}\n`);
      process.stdout.write(`  failures:            ${result.failures.length}\n`);
      process.stdout.write(`  warnings:            ${result.warnings.length}\n`);
      process.stdout.write(`  waivers applied:     ${result.waivers_applied.length}\n`);
      process.stdout.write(`  blocking reasons:    ${result.blocking_reasons.length}\n`);
      if (result.blocking_reasons.length > 0) {
        process.stdout.write(`\nblocking:\n`);
        for (const r of result.blocking_reasons) {
          process.stdout.write(`  - ${r}\n`);
        }
      }
      if (result.next_actions.length > 0) {
        process.stdout.write(`\nnext actions:\n`);
        for (const a of result.next_actions) {
          process.stdout.write(`  - ${a}\n`);
        }
      }
      if (!result.synthesis_eligible) process.exitCode = 2;
    } catch (err) {
      reportError(err);
    }
  });

program
  .command('review')
  .description('Run the adversarial reviewer pass; emits findings + claim review decisions')
  .argument('<section>', 'Section id, e.g. "01-landscape"')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option(
    '--heuristic-only',
    'Skip the LLM reviewer; run only the deterministic HeuristicReviewer',
    false,
  )
  .option(
    '--triaged-only',
    'Only review claims that triage selected_for_review',
    false,
  )
  .option(
    '--llm-paged',
    'Force the LLM reviewer (paged windows) — alias for the default ladder when ollama is up. Useful as documentation of intent.',
    false,
  )
  .option(
    '--review-window <n>',
    'Claims per LLM review window (default 30). Smaller windows fit smaller models.',
    parseIntArg('--review-window'),
  )
  .option(
    '--two-pass-llm',
    'Two-pass LLM review: general + narrow_critic + heuristic. Findings merged.',
    false,
  )
  .option(
    '--model <name>',
    'Override OLLAMA_INTERN_MODEL for this run (e.g. qwen3:14b). Applied to BOTH passes when --two-pass-llm.',
  )
  .option(
    '--general-model <name>',
    'Model for the general LLM reviewer (overrides --model and OLLAMA_INTERN_MODEL).',
  )
  .option(
    '--critic-model <name>',
    'Model for the narrow_critic LLM reviewer (overrides --model and OLLAMA_INTERN_MODEL).',
  )
  .option(
    '--profile <name>',
    `Review profile name. Non-default profiles are calibration evidence under sections/<id>/reviews/<profile>/ and do NOT update canonical state until promoted via 'review promote'.`,
    DEFAULT_PROFILE,
  )
  .option(
    '--preset <name>',
    'Reviewer preset name from research.yaml/review_profiles. Fills --general-model, --critic-model, --review-window, --two-pass-llm from the preset; explicit flags still override.',
  )
  .option('--no-progress', 'Suppress per-iteration progress output to stderr')
  .option('--progress', 'Force per-iteration progress output even when not on a TTY (debug aid)')
  .action(async (section: string, opts) => {
    try {
      applyProgressFlags();
      // Resolve preset (if any) from research.yaml/review_profiles. Explicit
      // CLI flags override preset values; preset only fills the gaps.
      let preset:
        | {
            general_model?: string | null;
            critic_model?: string | null;
            review_window?: number | null;
            mode?: 'general' | 'two_pass';
            reviewer_options?: ReviewerOptions | undefined;
          }
        | undefined;
      if (opts.preset) {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const yaml = await import('yaml');
        const { ResearchYamlSchema } = await import('./intake/schema.js');
        const yamlPath = path.join(opts.pack as string, 'research.yaml');
        const research = ResearchYamlSchema.parse(
          yaml.parse(await fs.readFile(yamlPath, 'utf8')),
        );
        const found = research.review_profiles[opts.preset as string];
        if (!found) {
          // C1-003: structured error using existing sibling code
          // ReviewerProfileNotFoundError (added in Wave 3).
          const knownNames = Object.keys(research.review_profiles);
          throw new ReviewerProfileNotFoundError(
            String(opts.preset),
            knownNames,
            yamlPath,
          );
        }
        preset = found;
      }

      const baseModel = (opts.model as string | undefined) ?? undefined;
      const generalModel =
        (opts.generalModel as string | undefined) ??
        baseModel ??
        preset?.general_model ??
        undefined;
      const criticModel =
        (opts.criticModel as string | undefined) ??
        baseModel ??
        preset?.critic_model ??
        undefined;
      const reviewWindow =
        (opts.reviewWindow as number | undefined) ?? preset?.review_window ?? undefined;
      const twoPass =
        Boolean(opts.twoPassLlm) || (preset?.mode === 'two_pass' ? true : false);
      const reviewerOptions = preset?.reviewer_options ?? undefined;

      const reviewers = opts.heuristicOnly
        ? [new HeuristicReviewer()]
        : twoPass
          ? [
              new OllamaInternReviewer({
                mode: 'general',
                model: generalModel ?? undefined,
                claimsPerWindow: reviewWindow,
                reviewer_options: reviewerOptions,
              }),
              new OllamaInternReviewer({
                mode: 'narrow_critic',
                model: criticModel ?? undefined,
                claimsPerWindow: reviewWindow,
                reviewer_options: reviewerOptions,
              }),
              new HeuristicReviewer(),
            ]
          : reviewWindow || opts.llmPaged || baseModel || generalModel
            ? [
                new OllamaInternReviewer({
                  model: generalModel ?? undefined,
                  claimsPerWindow: reviewWindow,
                  reviewer_options: reviewerOptions,
                }),
                new HeuristicReviewer(),
              ]
            : undefined;
      const result = await runReview({
        sectionId: section,
        packPath: opts.pack,
        reviewers,
        triagedOnly: opts.triagedOnly,
        multiPass: twoPass,
        profile: opts.profile as string | undefined,
        reviewer_options: reviewerOptions,
      });
      process.stdout.write(`review complete\n`);
      process.stdout.write(`  section:                ${result.sectionId}\n`);
      process.stdout.write(`  reviewer:               ${result.reviewer}\n`);
      process.stdout.write(`  method:                 ${result.reviewMethod}\n`);
      process.stdout.write(`  candidate claims:       ${result.candidateClaims}\n`);
      process.stdout.write(`  findings added:         ${result.findingsAdded}\n`);
      process.stdout.write(`  findings deduped:       ${result.findingsDeduped}\n`);
      process.stdout.write(`  llm findings rejected:  ${result.llmFindingsRejected}\n`);
      process.stdout.write(`  blocking findings:      ${result.blockingFindings}\n`);
      process.stdout.write(`  promoted to reviewed:   ${result.promotedToReviewed}\n`);
      process.stdout.write(`\ndecisions:\n`);
      for (const [d, n] of Object.entries(result.decisions)) {
        process.stdout.write(`  ${d}: ${n}\n`);
      }
    } catch (err) {
      reportError(err);
    }
  });

const indexCmd = program
  .command('index')
  .description('Build, query, and export the pack-local research-truth index');

indexCmd
  .command('build')
  .description('Build the in-pack SQLite index from canonical artifacts')
  .argument('[section]', 'Optional section id; omit to index every section')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option('--all', 'Index every section in the pack (default behavior)')
  .action(async (section: string | undefined, opts) => {
    try {
      const result = await indexBuild({
        sectionId: section,
        packPath: opts.pack,
        all: opts.all,
      });
      process.stdout.write(`index build complete\n`);
      process.stdout.write(`  db:                ${result.dbPath}\n`);
      process.stdout.write(`  sections indexed:  ${result.sectionsIndexed}\n`);
      process.stdout.write(`  sources:           ${result.sources}\n`);
      process.stdout.write(`  claims:            ${result.claims}\n`);
      process.stdout.write(`  contradictions:    ${result.contradictions}\n`);
      process.stdout.write(`  review findings:   ${result.reviewFindings}\n`);
      process.stdout.write(`  claim reviews:     ${result.claimReviews}\n`);
      process.stdout.write(`  gate results:      ${result.gateResults}\n`);
      process.stdout.write(`  fetch receipts:    ${result.fetchReceipts}\n`);
      process.stdout.write(`  artifacts tracked: ${result.artifacts}\n`);
    } catch (err) {
      reportError(err);
    }
  });

indexCmd
  .command('export-repo-knowledge')
  .description('Write a repo-knowledge-compatible facts JSONL from the index')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option('--out <path>', 'Output path; defaults to evidence/repo-knowledge/research-os-facts.jsonl')
  .action(async (opts) => {
    try {
      const result = await exportRepoKnowledge({
        packPath: opts.pack,
        outPath: opts.out,
      });
      process.stdout.write(`export complete\n`);
      process.stdout.write(`  out:        ${result.outPath}\n`);
      process.stdout.write(`  facts:      ${result.factCount}\n`);
      for (const [t, n] of Object.entries(result.byType)) {
        process.stdout.write(`  ${t}: ${n}\n`);
      }
    } catch (err) {
      reportError(err);
    }
  });

indexCmd
  .command('sync-repo-knowledge')
  .description('Sync the index into a locally-installed @mcptoolshop/repo-knowledge (optional, skips cleanly when absent)')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .action(async (opts) => {
    try {
      const result = await syncRepoKnowledge({ packPath: opts.pack });
      process.stdout.write(`sync attempted: ${result.attempted}\n`);
      process.stdout.write(`  ok:           ${result.ok}\n`);
      process.stdout.write(`  facts synced: ${result.factsSynced}\n`);
      process.stdout.write(`  reason:       ${result.reason}\n`);
      if (result.attempted && !result.ok) process.exitCode = 2;
    } catch (err) {
      reportError(err);
    }
  });

program
  .command('query')
  .description('Query the pack-local research-truth index')
  .argument('<term>', 'Search term (FTS5 syntax accepted)')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option('--limit <n>', 'Max hits to return', parseIntArg('--limit'), 25)
  .option('--type <type>', 'Restrict to one record type (claim, source, contradiction, review_finding, gate_result, fetch_receipt, claim_review, section)')
  .action((term: string, opts) => {
    try {
      const result = indexQuery({
        term,
        packPath: opts.pack,
        limit: opts.limit,
        recordType: opts.type,
      });
      process.stdout.write(`query: ${JSON.stringify(result.term)}\n`);
      process.stdout.write(`hits:  ${result.totalHits}\n\n`);
      for (const [type, hits] of Object.entries(result.groupedByType)) {
        process.stdout.write(`== ${type} (${hits.length}) ==\n`);
        for (const h of hits) {
          process.stdout.write(`  [${h.section_id ?? '-'}] ${h.record_id}\n`);
          process.stdout.write(`    artifact: ${h.artifact_path}\n`);
          process.stdout.write(`    snippet:  ${h.snippet.replace(/\s+/g, ' ').slice(0, 240)}\n`);
        }
        process.stdout.write('\n');
      }
    } catch (err) {
      reportError(err);
    }
  });

const coworkCmd = program
  .command('cowork')
  .description('Cowork handoff: render the runtime contract from research truth');

coworkCmd
  .command('handoff')
  .description('Generate handoffs/cowork-handoff.json + handoffs/cowork-master.md from current pack state')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .action(async (opts) => {
    try {
      const result = await coworkHandoff({ packPath: opts.pack });
      process.stdout.write(`cowork handoff rendered\n`);
      process.stdout.write(`  pack id:            ${result.packId}\n`);
      process.stdout.write(`  pack topic:         ${result.packTopic}\n`);
      process.stdout.write(`  mode:               ${result.mode}\n`);
      process.stdout.write(`  synthesis allowed:  ${result.synthesisAllowed}\n`);
      process.stdout.write(`  accepted claims:    ${result.acceptedCount}\n`);
      process.stdout.write(`  repair claims:      ${result.repairCount}\n`);
      process.stdout.write(`  rejected claims:    ${result.blockedCount}\n`);
      process.stdout.write(`  json:               ${result.jsonPath}\n`);
      process.stdout.write(`  markdown:           ${result.markdownPath}\n`);
      if (result.warnings.length > 0) {
        process.stdout.write(`\nwarnings:\n`);
        for (const w of result.warnings) {
          process.stdout.write(`  - ${w}\n`);
        }
      }
      // D-007: synthesisAllowed=false is informational, not an error. The
      // default exit code (0) already conveys success; the previous
      // `if (!synthesisAllowed) process.exitCode = 0` was a no-op.
    } catch (err) {
      reportError(err);
    }
  });

const synthCmd = program
  .command('synth')
  .description('Synthesis workspace: organize accepted research truth for Cowork');

synthCmd
  .command('workspace')
  .description(
    'Create the synthesis workspace; refuses unless cowork handoff mode is synthesis_ready. ' +
      'With --section <id>, produces a partial section-scoped synthesis for a single gate-eligible section ' +
      'in a repair_required pack (alias-spelling of `research-os synth section <id>`).',
  )
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option(
    '--section <id>',
    'Produce section-scoped synthesis for this section only. The pack remains not-freezable and not-publishable.',
  )
  .action(async (opts) => {
    try {
      const sectionId = opts.section as string | undefined;
      if (sectionId) {
        const result = await synthSection({ sectionId, packPath: opts.pack, spawnMcpClient: true });
        process.stdout.write(`synthesis section: PARTIAL\n`);
        process.stdout.write(`  section:                  ${result.sectionId}\n`);
        process.stdout.write(`  pack mode:                ${result.packMode}\n`);
        process.stdout.write(`  gate verdict:             ${result.gateVerdict ?? '(none)'}\n`);
        process.stdout.write(`  accepted claims:          ${result.acceptedClaims}\n`);
        process.stdout.write(`  sources cited:            ${result.sourceCount}\n`);
        process.stdout.write(`  waivers disclosed:        ${result.waiversApplied}\n`);
        process.stdout.write(`  not freezable as pack:    ${result.notFreezableAsPack}\n`);
        process.stdout.write(`  not publishable as pack:  ${result.notPublishableAsPack}\n`);
        process.stdout.write(`  json:                     ${result.jsonPath}\n`);
        process.stdout.write(`  brief:                    ${result.markdownPath}\n`);
        process.stdout.write(`  prose generated:          ${result.proseGenerated}\n`);
        if (result.proseMarkdownPath) {
          process.stdout.write(`  prose:                    ${result.proseMarkdownPath}\n`);
        }
        if (result.proseError) {
          process.stdout.write(`  prose error:              ${result.proseError}\n`);
        }
        if (!result.acceptedIdsCrossCheckOk) {
          process.stdout.write(
            `\nwarning: section accepted_claim_ids drift from pack-wide accepted_claim_ids in the cowork handoff. ` +
              `Re-run \`research-os cowork handoff\` to refresh.\n`,
          );
        }
        return;
      }
      const result = await synthWorkspace({ packPath: opts.pack });
      if (result.refused) {
        process.stdout.write(`synthesis workspace: REFUSED\n`);
        process.stdout.write(`  mode:       ${result.mode}\n`);
        process.stdout.write(`  reason:     ${result.refusalReason}\n`);
        process.exitCode = 2;
        return;
      }
      process.stdout.write(`synthesis workspace ready\n`);
      process.stdout.write(`  mode:                         ${result.mode}\n`);
      process.stdout.write(`  accepted claims:              ${result.acceptedClaims}\n`);
      process.stdout.write(`  claim clusters:               ${result.claimClusters}\n`);
      process.stdout.write(`  scope overlaps:               ${result.scopeOverlaps}\n`);
      process.stdout.write(`  cross-section contradictions: ${result.crossSectionContradictions}\n`);
      for (const f of result.filesWritten) process.stdout.write(`  wrote: ${f}\n`);
    } catch (err) {
      reportError(err);
    }
  });

synthCmd
  .command('section')
  .description(
    'Produce a partial section-scoped synthesis for a single gate-eligible section in a ' +
      'repair_required pack. Output goes to sections/<id>/synthesis/. The pack as a whole remains ' +
      'not-freezable and not-publishable.',
  )
  .argument('<section>', 'Section id, e.g. "06-evidence-custody-curated"')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .action(async (section: string, opts) => {
    try {
      const result = await synthSection({ sectionId: section, packPath: opts.pack, spawnMcpClient: true });
      process.stdout.write(`synthesis section: PARTIAL\n`);
      process.stdout.write(`  section:                  ${result.sectionId}\n`);
      process.stdout.write(`  pack mode:                ${result.packMode}\n`);
      process.stdout.write(`  gate verdict:             ${result.gateVerdict ?? '(none)'}\n`);
      process.stdout.write(`  accepted claims:          ${result.acceptedClaims}\n`);
      process.stdout.write(`  sources cited:            ${result.sourceCount}\n`);
      process.stdout.write(`  waivers disclosed:        ${result.waiversApplied}\n`);
      process.stdout.write(`  not freezable as pack:    ${result.notFreezableAsPack}\n`);
      process.stdout.write(`  not publishable as pack:  ${result.notPublishableAsPack}\n`);
      process.stdout.write(`  json:                     ${result.jsonPath}\n`);
      process.stdout.write(`  brief:                    ${result.markdownPath}\n`);
      process.stdout.write(`  prose generated:          ${result.proseGenerated}\n`);
      if (result.proseMarkdownPath) {
        process.stdout.write(`  prose:                    ${result.proseMarkdownPath}\n`);
      }
      if (result.proseError) {
        process.stdout.write(`  prose error:              ${result.proseError}\n`);
      }
      if (!result.acceptedIdsCrossCheckOk) {
        process.stdout.write(
          `\nwarning: section accepted_claim_ids drift from pack-wide accepted_claim_ids in the cowork handoff. ` +
            `Re-run \`research-os cowork handoff\` to refresh.\n`,
        );
      }
    } catch (err) {
      reportError(err);
    }
  });

program
  .command('audit')
  .description('Aggregate pack-level audit rollups across all sections')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .action(async (opts) => {
    try {
      const result = await runAudit({ packPath: opts.pack });
      process.stdout.write(`pack audit complete\n`);
      process.stdout.write(`  verdict:                  ${result.verdict}\n`);
      process.stdout.write(`  synthesis allowed:        ${result.synthesisAllowed}\n`);
      process.stdout.write(`  orphan claims:            ${result.orphans}\n`);
      process.stdout.write(`  stale sources:            ${result.staleSources}\n`);
      process.stdout.write(`  weak sources:             ${result.weakSources}\n`);
      process.stdout.write(`  unresolved contradictions: ${result.unresolvedContradictions}\n`);
      process.stdout.write(`  scope-widening risks:     ${result.scopeWideningRisks}\n`);
      process.stdout.write(`  source-diversity gaps:    ${result.sourceDiversityGaps}\n`);
      process.stdout.write(`  files written:            ${result.filesWritten.length}\n`);
      if (result.blockingReasons.length > 0) {
        process.stdout.write(`\nblocking reasons:\n`);
        for (const b of result.blockingReasons) process.stdout.write(`  - ${b}\n`);
      }
      if (result.warnings.length > 0) {
        process.stdout.write(`\nwarnings:\n`);
        for (const w of result.warnings) process.stdout.write(`  - ${w}\n`);
      }
      if (!result.synthesisAllowed) process.exitCode = 2;
    } catch (err) {
      reportError(err);
    }
  });

program
  .command('freeze')
  .description('Final integrity lock; refuses unless every condition is met')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .action(async (opts) => {
    try {
      const result = await runFreeze({ packPath: opts.pack });
      if (result.verdict === 'refused') {
        process.stdout.write(`freeze: REFUSED\n`);
        process.stdout.write(`  reasons:           ${result.reasonsCount}\n`);
        if (result.refusalPayload) {
          for (const r of result.refusalPayload.blocking_reasons) {
            process.stdout.write(`  - ${r}\n`);
          }
          if (result.refusalPayload.next_actions.length > 0) {
            process.stdout.write(`\nnext actions:\n`);
            for (const a of result.refusalPayload.next_actions) process.stdout.write(`  - ${a}\n`);
          }
        }
        process.stdout.write(`  refusal json:      ${result.jsonPath}\n`);
        process.stdout.write(`  refusal markdown:  ${result.markdownPath}\n`);
        process.exitCode = 2;
        return;
      }
      process.stdout.write(`freeze: FROZEN\n`);
      if (result.receiptPayload) {
        process.stdout.write(`  pack id:                       ${result.receiptPayload.pack_id}\n`);
        process.stdout.write(`  frozen at:                     ${result.receiptPayload.frozen_at}\n`);
        process.stdout.write(`  accepted claims:               ${result.receiptPayload.accepted_claim_ids.length}\n`);
        process.stdout.write(`  cited claims:                  ${result.citedClaimCount}\n`);
        process.stdout.write(`  uncited accepted (info):       ${result.uncitedAcceptedClaimCount}\n`);
        process.stdout.write(`  unresolved contradictions:     ${result.receiptPayload.unresolved_contradictions.length}\n`);
        process.stdout.write(`  waivers disclosed:             ${result.receiptPayload.waivers_disclosed.length}\n`);
        process.stdout.write(`  canonical artifacts hashed:    ${result.receiptPayload.canonical_artifact_hashes.length}\n`);
        process.stdout.write(`  synthesis files hashed:        ${result.receiptPayload.synthesis_hashes.length}\n`);
      }
      process.stdout.write(`  receipt json:                  ${result.jsonPath}\n`);
      process.stdout.write(`  receipt markdown:              ${result.markdownPath}\n`);
    } catch (err) {
      reportError(err);
    }
  });

const invalidate = program
  .command('invalidate')
  .description('Invalidate (archive with a receipt) artifacts produced under a superseded contract');

invalidate
  .command('extraction')
  .description(
    'Archive claims/reviews/contradictions/audits/handoffs/synthesis written under the legacy authored-evidence-excerpt contract; replaced by span-first-extraction',
  )
  .requiredOption('--reason <text>', 'Plain-language reason recorded on the invalidation receipt')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option('--label <slug>', 'Folder label under audits/legacy/', 'pre-span-extraction')
  .option('--new-contract <name>', 'Name recorded for the replacement contract', 'span-first-extraction')
  .option(
    '--superseded-contract <name>',
    'Name recorded for the contract being retired',
    'authored-evidence-excerpt',
  )
  .option('--notes <text>', 'Optional free-text notes to include on the receipt')
  .action(async (opts) => {
    try {
      const result = await invalidateExtraction({
        packPath: opts.pack,
        reason: opts.reason,
        label: opts.label,
        newContract: opts.newContract,
        supersededContract: opts.supersededContract,
        notes: opts.notes,
      });
      if (!result.performed) {
        process.stdout.write(`invalidate extraction: no-op\n`);
        process.stdout.write(`  ${result.message}\n`);
        return;
      }
      process.stdout.write(`invalidate extraction: archived\n`);
      process.stdout.write(`  receipt id:        ${result.receiptId}\n`);
      process.stdout.write(`  contract label:    ${result.contractLabel}\n`);
      process.stdout.write(`  affected sections: ${result.affectedSections.length}\n`);
      for (const s of result.affectedSections) process.stdout.write(`    - ${s}\n`);
      process.stdout.write(`  archived count:    ${result.archivedCount}\n`);
      process.stdout.write(`  archive dir:       ${result.archiveDir}\n`);
    } catch (err) {
      reportError(err);
    }
  });

invalidate
  .command('review')
  .description(
    'Archive canonical review artifacts for a section into sections/<id>/legacy/<label>/<timestamp>/. Use to invalidate pre-profile review state before promoting a profile as new canonical truth.',
  )
  .argument('<section>', 'Section id, e.g. "03-source-and-claim-truth"')
  .requiredOption('--reason <text>', 'Plain-language reason recorded on the invalidation receipt')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option('--label <slug>', 'Folder label under sections/<id>/legacy/', 'pre-review-profiles')
  .option('--notes <text>', 'Optional free-text notes recorded on the receipt')
  .action(async (section: string, opts) => {
    try {
      const result = await invalidateReview({
        packPath: opts.pack,
        sectionId: section,
        reason: opts.reason,
        label: opts.label,
        notes: opts.notes,
      });
      if (!result.performed) {
        process.stdout.write(`invalidate review: no-op\n`);
        process.stdout.write(`  ${result.message}\n`);
        return;
      }
      process.stdout.write(`invalidate review: archived\n`);
      process.stdout.write(`  receipt id:     ${result.receiptId}\n`);
      process.stdout.write(`  section:        ${result.sectionId}\n`);
      process.stdout.write(`  contract label: ${result.contractLabel}\n`);
      process.stdout.write(`  archived count: ${result.archivedCount}\n`);
      process.stdout.write(`  archive dir:    ${result.archiveDir}\n`);
    } catch (err) {
      reportError(err);
    }
  });

program
  .command('review-promote')
  .description(
    'Promote a review profile to active state: copies the profile artifacts to canonical paths and writes review-active.json. Until promoted, profile runs are calibration evidence, not section truth.',
  )
  .argument('<section>', 'Section id, e.g. "03-source-and-claim-truth"')
  .requiredOption('--profile <name>', 'Profile name to promote')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option(
    '--reason <text>',
    'Free-text rationale recorded on review-active.json — why this profile is being trusted',
  )
  .option('--calibration-fixture <name>', 'Calibration fixture name')
  .option('--good-fp <text>', 'good-claim false-positive rate string (e.g. "0/5 (0%)")')
  .option('--any-flag-recall <text>', 'bad-claim any-flag recall string (e.g. "9/13 (69%)")')
  .option('--strict-cat-recall <text>', 'strict-category recall string')
  .option('--unsupported-recall <text>', 'unsupported_claim category recall string')
  .option('--calibration-notes <text>', 'free-text calibration notes')
  .option(
    '--bump-section-status',
    'Also bump section.status from gated → reviewed if every promoted claim is accepted_for_synthesis',
    false,
  )
  .action(async (section: string, opts) => {
    try {
      const explicitCalibration =
        opts.calibrationFixture ||
        opts.goodFp ||
        opts.anyFlagRecall ||
        opts.strictCatRecall ||
        opts.unsupportedRecall ||
        opts.calibrationNotes;

      let calibration = explicitCalibration
        ? {
            fixture: opts.calibrationFixture ?? null,
            good_false_positive_rate: opts.goodFp ?? null,
            bad_any_flag_recall: opts.anyFlagRecall ?? null,
            strict_category_recall: opts.strictCatRecall ?? null,
            unsupported_claim_recall: opts.unsupportedRecall ?? null,
            notes: opts.calibrationNotes ?? null,
          }
        : null;

      // Narrow receipt integration: if no explicit --calibration-* flags were
      // provided, look for a structured receipt at the pack-relative path and
      // auto-populate calibration_summary from it.
      // Missing receipt = no-op. Present but invalid = fail visibly (throw).
      if (!explicitCalibration) {
        const summary = await loadReceiptForPack(opts.pack as string, opts.profile);
        if (summary !== null) {
          calibration = summary;
          process.stdout.write(
            `  [auto] calibration_summary populated from ${receiptPathForPack(opts.pack as string, opts.profile)}\n`,
          );
        }
      }

      const result = await runPromote({
        sectionId: section,
        packPath: opts.pack,
        profile: opts.profile,
        promotionReason: opts.reason,
        calibrationSummary: calibration,
        promoteSectionStatus: opts.bumpSectionStatus,
      });
      process.stdout.write(`review profile promoted\n`);
      process.stdout.write(`  section:           ${result.sectionId}\n`);
      process.stdout.write(`  profile:           ${result.profile}\n`);
      process.stdout.write(`  promoted_at:       ${result.promoted_at}\n`);
      process.stdout.write(`  promoted_method:   ${result.promoted_method}\n`);
      process.stdout.write(`  promoted_reviewer: ${result.promoted_reviewer}\n`);
      process.stdout.write(`  status bumped:     ${result.section_status_bumped}\n`);
      process.stdout.write(`  canonical files updated: ${result.canonical_files_updated.length}\n`);
    } catch (err) {
      reportError(err);
    }
  });

const packCmd = program
  .command('pack')
  .description('Pack-level publication and archive operations');

packCmd
  .command('publish')
  .description(
    'Export a frozen pack into the research-packs archive format. ' +
      'Copies the pack, derives pack.manifest.json, generates README.md, ' +
      'provisions docs/how-to-read-this.md, and verifies the admission contract.',
  )
  .requiredOption('--to <path>', 'Target package directory, e.g. <research-packs>/packages/<name>')
  .option('--from <path>', 'Source frozen pack directory (defaults to cwd)', process.cwd())
  .option('--operator-notes <text>', 'Operator notes recorded in pack.manifest.json', '')
  .option(
    '--force',
    '--force clears and replaces the target package directory. Do not keep hand-authored files inside generated package output.',
    false,
  )
  .option('--dry-run', 'Print derived manifest and README plan; write nothing', false)
  .option('--no-progress', 'Suppress per-iteration progress output to stderr')
  .option('--progress', 'Force per-iteration progress output even when not on a TTY (debug aid)')
  .action(async (opts) => {
    try {
      applyProgressFlags();
      const result = await packPublish({
        fromDir: opts.from as string,
        toDir: opts.to as string,
        operatorNotes: opts.operatorNotes as string,
        force: Boolean(opts.force),
        dryRun: Boolean(opts.dryRun),
      });
      if (result.dryRun) {
        process.stdout.write(`pack publish: DRY-RUN — no files written\n`);
        process.stdout.write(`  package name:  ${result.packageName}\n`);
        if (result.dryRunManifest) {
          const m = result.dryRunManifest;
          process.stdout.write(`  topic:         ${m.topic.slice(0, 80)}\n`);
          process.stdout.write(`  frozen_at:     ${m.frozen_at}\n`);
          process.stdout.write(`  sections:      ${m.totals.sections}\n`);
          process.stdout.write(`  accepted:      ${m.totals.accepted_claims}\n`);
          process.stdout.write(`  receipt sha256:${m.freeze_receipt_sha256.slice(0, 16)}…\n`);
        }
        return;
      }
      process.stdout.write(`pack publish: DONE\n`);
      process.stdout.write(`  package name:  ${result.packageName}\n`);
      process.stdout.write(`  files written: ${result.filesWritten.length}\n`);
      for (const f of result.filesWritten) process.stdout.write(`    ${f}\n`);
      process.stdout.write(`  verify:        ${result.verifyPassed ? 'PASS' : 'FAIL'}\n`);
      if (result.warnings.length > 0) {
        process.stdout.write(`\nwarnings:\n`);
        for (const w of result.warnings) process.stdout.write(`  - ${w}\n`);
      }
      if (!result.verifyPassed) process.exitCode = 2;
    } catch (err) {
      reportError(err);
    }
  });

const sourceCardCmd = program
  .command('source-card')
  .description('Source-card inspection and operator-correction surface');

sourceCardCmd
  .command('audit')
  .description(
    'Audit source cards in a pack: classifier drift, missing publishers, GitHub UI HTML. ' +
      'Read-only by default; use --apply --from <file> to commit operator corrections.',
  )
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option('--json', 'Print the JSON report to stdout in addition to writing the artifact', false)
  .option('--apply', 'Apply operator-authored overrides from --from <file>', false)
  .option('--from <file>', 'JSON array file of proposed overrides (required with --apply)')
  .action(async (opts) => {
    try {
      const packPath = opts.pack as string;

      if (opts.apply) {
        const fromFile = opts.from as string | undefined;
        if (!fromFile) {
          // C1-002: route through reportError via InvalidArgumentError
          // (D-008 pattern) instead of bypassing the catch block with raw
          // stderr + exit(1).
          throw new InvalidArgumentError('--apply requires --from <file>');
        }
        const result = await applySourceCardOverrides(packPath, fromFile);
        process.stdout.write(`source-card overrides applied\n`);
        process.stdout.write(`  entries applied:     ${result.applied}\n`);
        process.stdout.write(`  source_ids touched:  ${result.distinctSourceIds}\n`);
        process.stdout.write(`  ledger:              ${result.ledgerPath}\n`);
        return;
      }

      const { report, jsonPath, mdPath } = await runSourceCardAudit(packPath);
      const t = report.totals;
      const packName = packPath.replace(/\\/g, '/').split('/').pop() ?? packPath;

      process.stdout.write(`research-os source-card audit — pack: ${packName}\n\n`);
      process.stdout.write(`Cards scanned:                  ${t.cards_scanned}\n`);
      process.stdout.write(`Cards with overrides applied:   ${t.cards_with_overrides}\n`);
      process.stdout.write(`Source-type mismatches:         ${t.source_type_mismatches}\n`);
      process.stdout.write(`Publisher missing:              ${t.publisher_missing}\n`);
      process.stdout.write(`GitHub UI HTML candidates:      ${t.github_ui_html}\n`);
      process.stdout.write(`Classifier-flagged (other):     ${t.classifier_flagged_other}\n`);
      process.stdout.write(`Clean (no action):              ${t.no_action}\n`);
      process.stdout.write(`\nReports written:\n`);
      process.stdout.write(`  ${jsonPath}\n`);
      process.stdout.write(`  ${mdPath}\n`);

      if (opts.json) {
        process.stdout.write('\n');
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      }
    } catch (err) {
      reportError(err);
    }
  });

// Stage C Phase 3 Theme 4 (C3-006 Option C part B): `research-os help <topic>`
// subcommand. Prints a plain-text snippet from the frozen HELP_TOPICS map. No
// markdown rendering at runtime, no ANSI codes. Unknown topic exits 2 with the
// list of available topics; known topic exits 0.
program
  .command('help')
  .description('Print a short plain-text reference for one of the built-in topics')
  .argument('<topic>', 'Topic name; one of: ' + Object.keys(HELP_TOPICS).join(', '))
  .action((topic: string) => {
    const entry = (HELP_TOPICS as Record<string, string | undefined>)[topic];
    if (entry === undefined) {
      process.stderr.write(
        `research-os help: unknown topic "${topic}"\n` +
          `  Available topics: ${Object.keys(HELP_TOPICS).join(', ')}\n`,
      );
      process.exit(2);
    }
    process.stdout.write(entry + '\n');
  });

// Only auto-run as a CLI when this file is the process entry point. Under
// `vitest` (which imports `parseIntArg` for the D-006 helper unit test) the
// module is loaded as a dependency and we must NOT call parseAsync —
// commander sees vitest's argv and calls process.exit, which vitest treats
// as an unhandled error.
const invokedAsCli =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.length > 1 &&
  /(?:^|[\\/])(research-os|cli\.js|cli\.ts)$/i.test(process.argv[1] ?? '');

if (invokedAsCli) {
  program.parseAsync(process.argv);
}
