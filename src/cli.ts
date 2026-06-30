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
import {
  auditDensity,
  extract as claimExtract,
  runScopeRepair,
  type ScopeRepairPrompter,
  type ScopeRepairPrompterResponse,
} from './claims/index.js';
import { triage as runTriage } from './triage/index.js';
import {
  declineClaimRescueByOperator,
  listRescueCandidates,
  rescueClaimByOperator,
} from './claims/rescue-ledger.js';
import { map as contradictMap, resolve as contradictResolve } from './contradictions/index.js';
import {
  DEFAULT_AUTO_MODE_PAIR_TIMEOUT_MS,
  DEFAULT_AUTO_MODE_FALL_THROUGH_AFTER_N,
  MIN_AUTO_MODE_PAIR_TIMEOUT_MS,
  MAX_AUTO_MODE_PAIR_TIMEOUT_MS,
  MIN_AUTO_MODE_FALL_THROUGH_AFTER_N,
  MAX_AUTO_MODE_FALL_THROUGH_AFTER_N,
} from './contradictions/types.js';
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
  partialPackSynthesis as synthPartialPack,
} from './synth/index.js';
import {
  MAX_PLANNER_TIMEOUT_MS,
  DEFAULT_PLANNER_TIMEOUT_MS,
  resolvePlannerTimeout,
  validatePlannerTimeoutValue,
} from './synth/prose/types.js';
import {
  MAX_EXTRACT_TIER_BUDGET_MS,
  resolveExtractTierBudget,
  validateExtractTierBudgetValue,
} from './claims/types.js';
import { recoverPack } from './recover/index.js';
import { audit as runAudit } from './audit/index.js';
import { freeze as runFreeze } from './freeze/index.js';
import { invalidateExtraction, invalidateReview } from './invalidate/index.js';
import { publish as packPublish } from './pack/publish/index.js';
import {
  runSourceCardAudit,
  applySourceCardOverrides,
} from './sources/source-card-audit.js';
import {
  rebuildSourceCards,
  rebuildLedgerPath,
} from './sources/rebuild-ledger.js';
import { ResearchOSError, ReviewerProfileNotFoundError } from './errors.js';
import { HELP_TOPICS } from './cli/help-topics.js';
import { RESEARCH_OS_VERSION } from './index.js';
import { loadReceiptForPack, receiptPathForPack } from './calibration/lookup.js';
import type { ReviewerOptions } from './review/reviewer-options-schema.js';

// Exit-code contract (SHIP_GATE): 0 ok · 1 user error · 2 runtime/blocked · 3 partial.
// A thrown ResearchOSError defaults to exit 1 (user error), but some codes name a
// runtime condition (corrupted/unreadable on-disk artifact) rather than operator
// misuse — those map to exit 2 to match the gate/freeze/synth blocked-state convention.
//
// MALFORMED_DATA_FILE is new in this release, so exit 2 is its only-ever contract.
// PACK_PARSE_ERROR names a structurally-similar corrupt-artifact condition but has
// SHIPPED as exit 1; its exit code is part of the locked operator-observable
// taxonomy (docs/roadmap.md → "error code taxonomy semantics" / grep contract), so
// re-classifying it to exit 2 is a v2.0-track change and is deliberately NOT done here.
const RUNTIME_ERROR_EXIT_CODES = new Set<string>(['MALFORMED_DATA_FILE']);

function reportError(err: unknown): never {
  let exitCode = 1;
  if (err instanceof ResearchOSError) {
    process.stderr.write(`research-os: ${err.code}: ${err.message}\n`);
    if (err.hint) process.stderr.write(`  hint: ${err.hint}\n`);
    if (RUNTIME_ERROR_EXIT_CODES.has(err.code)) exitCode = 2;
  } else if (err instanceof Error) {
    process.stderr.write(`research-os: ${err.message}\n`);
  } else {
    process.stderr.write(`research-os: unknown error\n`);
  }
  process.exit(exitCode);
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

/**
 * R-018 (v0.12.1) — commander coercer for `--planner-timeout-ms <ms>`.
 * Delegates to the pure validator in src/synth/prose/types.ts so the
 * surface name + bounds appear verbatim in the error message. Rejects
 * negatives, zero, unit-suffixed strings, non-numerics, and values above
 * MAX_PLANNER_TIMEOUT_MS.
 */
// R-021 — shared validator for the integer-millisecond CLI flags introduced
// for contradict-map auto-mode. Mirrors R-018's parsePlannerTimeoutMsArg in
// shape (validate, throw InvalidArgumentError with operator-readable surface
// name + bounds + offending value).
export function parseAutoModePairTimeoutMsArg(value: string): number {
  const r = validateAutoModePairTimeoutValue(value, 'cli_flag');
  if (!r.ok) {
    throw new InvalidArgumentError(r.error);
  }
  return r.value;
}

export function parseAutoModeFallThroughAfterNArg(value: string): number {
  const r = validateAutoModeFallThroughValue(value, 'cli_flag');
  if (!r.ok) {
    throw new InvalidArgumentError(r.error);
  }
  return r.value;
}

type ValidationResult = { ok: true; value: number } | { ok: false; error: string };

function validateAutoModePairTimeoutValue(
  raw: string | undefined,
  source: 'cli_flag' | 'env_var',
): ValidationResult {
  const surface =
    source === 'cli_flag' ? '--auto-mode-pair-timeout-ms' : 'RESEARCH_OS_CONTRADICT_AUTO_PAIR_TIMEOUT_MS';
  if (raw === undefined || raw === '') {
    return { ok: false, error: `${surface}: value is required` };
  }
  if (!/^\d+$/.test(raw.trim())) {
    return {
      ok: false,
      error:
        `${surface}: invalid value "${raw}" — must be an integer number of ` +
        `milliseconds (no unit suffix; e.g. 90000, not "90s")`,
    };
  }
  const n = parseInt(raw, 10);
  if (n < MIN_AUTO_MODE_PAIR_TIMEOUT_MS || n > MAX_AUTO_MODE_PAIR_TIMEOUT_MS) {
    return {
      ok: false,
      error:
        `${surface}: invalid value ${n} — must be between ${MIN_AUTO_MODE_PAIR_TIMEOUT_MS} ` +
        `and ${MAX_AUTO_MODE_PAIR_TIMEOUT_MS} ms`,
    };
  }
  return { ok: true, value: n };
}

function validateAutoModeFallThroughValue(
  raw: string | undefined,
  source: 'cli_flag' | 'env_var',
): ValidationResult {
  const surface =
    source === 'cli_flag'
      ? '--auto-mode-fall-through-after-n-timeouts'
      : 'RESEARCH_OS_CONTRADICT_AUTO_FALL_THROUGH_AFTER_N';
  if (raw === undefined || raw === '') {
    return { ok: false, error: `${surface}: value is required` };
  }
  if (!/^\d+$/.test(raw.trim())) {
    return {
      ok: false,
      error: `${surface}: invalid value "${raw}" — must be a positive integer`,
    };
  }
  const n = parseInt(raw, 10);
  if (n < MIN_AUTO_MODE_FALL_THROUGH_AFTER_N || n > MAX_AUTO_MODE_FALL_THROUGH_AFTER_N) {
    return {
      ok: false,
      error:
        `${surface}: invalid value ${n} — must be between ${MIN_AUTO_MODE_FALL_THROUGH_AFTER_N} ` +
        `and ${MAX_AUTO_MODE_FALL_THROUGH_AFTER_N}`,
    };
  }
  return { ok: true, value: n };
}

// CLI > env > default precedence resolver for the contradict-map auto-mode
// settings. Returns the resolved values or a validation error when an env var
// is malformed (operator must see the error on a failed shell expansion).
function resolveAutoModeSettings(args: {
  cliPairTimeoutMs: number | undefined;
  cliFallThroughAfterN: number | undefined;
}): { ok: true; pairTimeoutMs: number; fallThroughAfterN: number } | { ok: false; error: string } {
  let pairTimeoutMs = args.cliPairTimeoutMs;
  if (pairTimeoutMs === undefined) {
    const env = process.env.RESEARCH_OS_CONTRADICT_AUTO_PAIR_TIMEOUT_MS;
    if (env && env !== '') {
      const r = validateAutoModePairTimeoutValue(env, 'env_var');
      if (!r.ok) return { ok: false, error: r.error };
      pairTimeoutMs = r.value;
    } else {
      pairTimeoutMs = DEFAULT_AUTO_MODE_PAIR_TIMEOUT_MS;
    }
  }

  let fallThroughAfterN = args.cliFallThroughAfterN;
  if (fallThroughAfterN === undefined) {
    const env = process.env.RESEARCH_OS_CONTRADICT_AUTO_FALL_THROUGH_AFTER_N;
    if (env && env !== '') {
      const r = validateAutoModeFallThroughValue(env, 'env_var');
      if (!r.ok) return { ok: false, error: r.error };
      fallThroughAfterN = r.value;
    } else {
      fallThroughAfterN = DEFAULT_AUTO_MODE_FALL_THROUGH_AFTER_N;
    }
  }

  return { ok: true, pairTimeoutMs, fallThroughAfterN };
}

export function parsePlannerTimeoutMsArg(value: string): number {
  const r = validatePlannerTimeoutValue(value, 'cli_flag');
  if (!r.ok) {
    throw new InvalidArgumentError(r.error);
  }
  return r.value;
}

/**
 * R-024 (v0.13.1) — commander coercer for `--tier-budget-ms <ms>` on
 * `claim extract`. Mirrors R-018's parsePlannerTimeoutMsArg in shape:
 * delegates to the pure validator in src/claims/types.ts so the surface
 * name + bounds appear verbatim in the error message. Rejects negatives,
 * zero, unit-suffixed strings, non-numerics, and values above
 * MAX_EXTRACT_TIER_BUDGET_MS.
 */
export function parseExtractTierBudgetMsArg(value: string): number {
  const r = validateExtractTierBudgetValue(value, 'cli_flag');
  if (!r.ok) {
    throw new InvalidArgumentError(r.error);
  }
  return r.value;
}

/**
 * A-CLI-001 — sane upper bound for the bounded positive-integer CLI flags
 * (`--review-window`, `--per-source-cap`). Values this large are typos, never
 * intent; capping them prevents pathological paging windows and per-source
 * caps from flowing downstream.
 */
const MAX_BOUNDED_INT_FLAG = 100_000;

/**
 * A-CLI-001 — shared validator for CLI flags that must be an integer >= 1
 * (`--review-window`, `--per-source-cap`). The unbounded `parseIntArg` accepts
 * 0 and negatives, which flow into `pageClaimsForReview` / the triage per-source
 * cap and cause an infinite loop / OOM. Mirrors `parsePlannerTimeoutMsArg`'s
 * shape: rejects non-integers, zero, negatives, unit suffixes, and values above
 * a sane upper bound, naming the surface verbatim in the error.
 */
export function parsePositiveIntFlagArg(label: string): (value: string) => number {
  return (value: string): number => {
    const raw = value.trim();
    if (!/^\d+$/.test(raw)) {
      throw new InvalidArgumentError(
        `${label}: expected a positive integer (>= 1), got '${value}'`,
      );
    }
    const n = parseInt(raw, 10);
    if (n < 1) {
      throw new InvalidArgumentError(
        `${label}: expected a positive integer (>= 1), got ${n}`,
      );
    }
    if (n > MAX_BOUNDED_INT_FLAG) {
      throw new InvalidArgumentError(
        `${label}: value ${n} exceeds the safety upper bound (${MAX_BOUNDED_INT_FLAG}); values this large are usually typos`,
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

/**
 * A-CLI-002 — `gather` accepts URLs from exactly one source. `--approved` and
 * `--urls-file` are mutually exclusive: previously passing both ran the
 * approved-file stat (which can throw APPROVED_URLS_NOT_FOUND) and then threw
 * the approved value away (urlsFile ?? candidate), a throw-then-ignore path.
 * Reject up front like applyProgressFlags does for --no-progress/--progress.
 */
export function assertGatherUrlSourceExclusive(
  approved: boolean,
  urlsFile: string | undefined,
): void {
  if (approved && urlsFile !== undefined) {
    throw new InvalidArgumentError(
      '--approved and --urls-file are mutually exclusive: pass one source of URLs, not both',
    );
  }
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
      // A-CLI-002: --approved and --urls-file are mutually exclusive (see
      // assertGatherUrlSourceExclusive). Passing both previously fired the
      // approved-file existence check (which can throw APPROVED_URLS_NOT_FOUND)
      // only to then discard the approved candidate in favor of urlsFile — a
      // confusing throw-then-ignore path. Reject up front like
      // --no-progress/--progress do.
      assertGatherUrlSourceExclusive(Boolean(opts.approved), urlsFile);
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
      // R-008: relevance check is on by default in the production CLI path.
      // Operators can opt out per-run by setting RESEARCH_OS_DISCOVER_RELEVANCE=0
      // (e.g., for air-gapped runs where title-fetch is unreachable). Library
      // callers control via DiscoverOptions.relevanceCheck; this default does
      // not affect them.
      const relevanceEnabled = process.env.RESEARCH_OS_DISCOVER_RELEVANCE !== '0';
      const result = await runDiscover({
        sectionId: section,
        packPath: opts.pack,
        query: opts.query,
        targetCount: opts.target,
        relevanceCheck: {
          enabled: relevanceEnabled,
          fetchImpl: globalThis.fetch,
        },
      });
      process.stdout.write(`discover complete\n`);
      process.stdout.write(`  section:                ${section}\n`);
      process.stdout.write(`  candidates proposed:    ${result.candidatesProposed}\n`);
      process.stdout.write(`  candidates added:       ${result.candidatesAdded}\n`);
      process.stdout.write(`  invalid url rejected:   ${result.candidatesRejectedInvalidUrl}\n`);
      const r = result.relevanceTotals;
      if (r.verified + r.unverified + r.topic_mismatch > 0) {
        process.stdout.write(
          `  relevance:              ${r.verified} verified, ${r.unverified} unverified, ${r.topic_mismatch} topic_mismatch\n`,
        );
        if (r.topic_mismatch > 0) {
          process.stdout.write(
            `  ⚠ ${r.topic_mismatch} topic_mismatch candidate${r.topic_mismatch === 1 ? '' : 's'} excluded from \`approve --top N\`. Use \`approve --candidate <id>\` to override.\n`,
          );
        }
      }
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
  .option(
    '--resume',
    'Skip sources whose successful extraction is already recorded in evidence/extract-completion.jsonl for this section (R-015). Failed and not-yet-attempted sources are re-attempted on this run.',
  )
  .option(
    '--progress',
    'Emit per-source [extract N/M] progress lines to stderr (R-015). stdout (canonical extract output) is unchanged.',
  )
  .option(
    '--tier-budget-ms <ms>',
    `R-024: per-call tier-budget override in milliseconds forwarded to ollama-intern-mcp@>=2.6.0 as tier_budget_ms_override on EVERY ollama_extract call during this section's extract run (the per-window extractor + the per-claim frame critic + the per-rescue-candidate rescue critic). Upper bound ${MAX_EXTRACT_TIER_BUDGET_MS} (safety rail). Default: omitted — ollama-intern-mcp's per-tier profile timeouts govern (byte-identical to pre-R-024). Env-var equivalent: RESEARCH_OS_EXTRACT_TIER_BUDGET_MS. CLI flag wins when both are set.`,
    parseExtractTierBudgetMsArg,
  )
  .action(async (section: string, opts) => {
    try {
      const effectiveModel =
        (opts.model as string | undefined) ?? process.env.OLLAMA_INTERN_MODEL ?? undefined;
      // R-024 — resolve the active extract tier-budget from CLI flag + env var
      // (precedence: cli_flag > env_var > default). Default returns
      // `value: undefined` ⇒ ollama-intern-mcp profile defaults govern.
      const tierBudgetResolved = resolveExtractTierBudget({
        cliFlagMs: opts.tierBudgetMs as number | undefined,
        envVar: process.env.RESEARCH_OS_EXTRACT_TIER_BUDGET_MS,
      });
      if (!tierBudgetResolved.ok) {
        process.stderr.write(`research-os: ${tierBudgetResolved.error}\n`);
        process.exitCode = 2;
        return;
      }
      const result = await claimExtract({
        sectionId: section,
        packPath: opts.pack,
        effectiveModel,
        resume: Boolean(opts.resume),
        progress: Boolean(opts.progress),
        tierBudgetMs: tierBudgetResolved.value,
        tierBudgetSource: tierBudgetResolved.source,
      });
      process.stdout.write(`claim extraction complete\n`);
      process.stdout.write(`  section:                            ${result.sectionId}\n`);
      process.stdout.write(`  extractor:                          ${result.extractor}\n`);
      process.stdout.write(`  method:                             ${result.extractionMethod}\n`);
      process.stdout.write(`  sources processed:                  ${result.sourcesProcessed}\n`);
      process.stdout.write(`  sources skipped:                    ${result.sourcesSkipped}\n`);
      if (result.sourcesSkippedByResume > 0) {
        process.stdout.write(`  sources skipped (resume ledger):    ${result.sourcesSkippedByResume}\n`);
      }
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
  .option('--per-source-cap <n>', 'Max claims per source forwarded to review', parsePositiveIntFlagArg('--per-source-cap'), 10)
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

// ── R-001 (v0.10 Slice 2): scope-repair CLI ────────────────────────────────
// Repairs claims with scope=null by either auto-populating a templated
// scope from source-card publisher + section purpose (--auto) or by
// prompting the operator for each proposed scope (--interactive, default).
// Every repair appends to evidence/claim-scope-repairs.jsonl; the affected
// claim row in claims.jsonl gains the applied scope.
//
// The default mode is interactive (least surprising for a new operator
// learning the surface). --auto runs without prompts for the operator
// who has already inspected the section and wants to unblock the gate.

function buildReadlineScopeRepairPrompter(): ScopeRepairPrompter {
  return {
    async promptScopeProposal(ctx) {
      const { createInterface } = await import('node:readline/promises');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        process.stdout.write('\n');
        process.stdout.write(`Claim: ${ctx.claim_id}\n`);
        process.stdout.write(`  Section: ${ctx.section_id} (${ctx.section_purpose})\n`);
        process.stdout.write(`  Source : ${ctx.source_card_summary}\n`);
        process.stdout.write(`  Asserts: ${ctx.asserts}\n`);
        process.stdout.write(`  Proposed scope: ${ctx.proposed_scope}\n`);
        // R-007: show the boundary proposal when the engine intends to
        // apply it. Otherwise the claim already has `not` set and only
        // scope is being repaired.
        if (ctx.needs_not_repair) {
          process.stdout.write(`  Proposed not  : ${ctx.proposed_not}\n`);
        }
        const answer = (await rl.question('  [a]ccept  [e]dit  [s]kip  [q]uit  > ')).trim().toLowerCase();
        let response: ScopeRepairPrompterResponse;
        if (answer === '' || answer === 'a' || answer === 'accept' || answer === 'y' || answer === 'yes') {
          response = { action: 'accept' };
        } else if (answer === 'e' || answer === 'edit') {
          const edited = (await rl.question('  new scope: ')).trim();
          if (edited.length === 0) {
            response = { action: 'skip', reason: 'edit returned empty scope' };
          } else if (ctx.needs_not_repair) {
            // R-007: operator can override the boundary too. Empty input
            // keeps the engine's proposed_not (back-compat with v0.10).
            const editedNot = (
              await rl.question(`  new not (blank to keep proposed): `)
            ).trim();
            response =
              editedNot.length > 0
                ? { action: 'edit', new_scope: edited, new_not: editedNot }
                : { action: 'edit', new_scope: edited };
          } else {
            response = { action: 'edit', new_scope: edited };
          }
        } else if (answer === 's' || answer === 'skip') {
          const reason = (await rl.question('  reason (optional): ')).trim();
          response = { action: 'skip', reason: reason.length > 0 ? reason : undefined };
        } else if (answer === 'q' || answer === 'quit') {
          response = { action: 'quit' };
        } else {
          process.stdout.write(`  unrecognized response "${answer}"; defaulting to skip.\n`);
          response = { action: 'skip', reason: `unrecognized response "${answer}"` };
        }
        return response;
      } finally {
        rl.close();
      }
    },
  };
}

claimCmd
  .command('repair-scope')
  .description(
    'Repair claims missing scope (needs_scope_repair / parked_weak_scope). ' +
      'Default is interactive: review each proposal; --auto applies a heuristic ' +
      'scope to every candidate non-interactively. Always appends to the ' +
      'append-only evidence/claim-scope-repairs.jsonl ledger.',
  )
  .argument('<section>', 'Section id, e.g. "03-dst-injury"')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option('--auto', 'Auto-populate scope without prompting (uses publisher + section purpose)', false)
  .option('--interactive', 'Prompt for each claim (default behavior)', false)
  .option('--operator <id>', 'Operator identity recorded in the ledger', 'cli')
  .action(async (section: string, opts) => {
    try {
      if (opts.auto && opts.interactive) {
        throw new InvalidArgumentError('--auto and --interactive are mutually exclusive');
      }
      const mode: 'auto' | 'interactive' = opts.auto ? 'auto' : 'interactive';
      const result = await runScopeRepair({
        sectionId: section,
        packPath: opts.pack,
        mode,
        operator: opts.operator,
        prompter: mode === 'interactive' ? buildReadlineScopeRepairPrompter() : undefined,
      });
      process.stdout.write(`claim repair-scope complete\n`);
      process.stdout.write(`  section:            ${result.sectionId}\n`);
      process.stdout.write(`  mode:               ${mode}\n`);
      process.stdout.write(`  claims considered:  ${result.claimsConsidered}\n`);
      process.stdout.write(`  claims repaired:    ${result.claimsRepaired}\n`);
      process.stdout.write(`  claims skipped:     ${result.claimsSkipped}\n`);
      if (result.quitEarly) {
        process.stdout.write(`  (operator quit before all claims were reviewed)\n`);
      }
      process.stdout.write(`  ledger:             ${result.ledgerPath}\n`);
      process.stdout.write(`  claims.jsonl:       ${result.claimsJsonlPath}\n`);
      if (result.claimsRepaired > 0) {
        process.stdout.write(
          `\nNext: re-run \`research-os claim triage ${result.sectionId}\` then \`research-os review ${result.sectionId}\` to advance the repaired claims through the pipeline.\n`,
        );
      }
    } catch (err) {
      reportError(err);
    }
  });

claimCmd
  .command('rescue')
  .description(
    'v0.12 R-012 — operator rescue surface for source_content_mismatch frame-exclusions. ' +
      'Promotes a claim that R-011 excluded from frame_excluded:true to frame_excluded:false ' +
      'when the source body has otherwise proven topical relevance through ≥2 other non-excluded ' +
      'claims. Eligibility gate is enforced in code — operator cannot rescue from a source that ' +
      'hasn\'t proven topical relevance. Append-only ledger at evidence/claim-frame-rescues.jsonl. ' +
      'Use --list to see candidates; --claim-id + --scope + --reason + --boundary to rescue; ' +
      '--decline + --reason to explicitly decline a candidate.',
  )
  .argument('<section>', 'Section id, e.g. "01-dst-evidence"')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option('--list', 'List rescue candidates with their eligibility verdicts', false)
  .option('--claim-id <id>', 'Claim id to rescue or decline (e.g. clm_f6ffc9e9d86f_ollama_intern_8)')
  .option('--scope <text>', 'Operator-supplied positive scope for the rescue (required when rescuing)')
  .option('--boundary <text>', 'Operator-supplied negative constraint for the rescue (required when rescuing)')
  .option('--reason <text>', 'Operator rationale — required for both rescue and --decline')
  .option('--decline', 'Explicitly decline the rescue (records operator_declined; distinguishable from not_rescued)', false)
  .option('--operator <id>', 'Operator identity recorded in the ledger', 'cli')
  .action(async (section: string, opts) => {
    try {
      if (opts.list === true) {
        const candidates = await listRescueCandidates({
          packPath: opts.pack,
          sectionId: section,
        });
        process.stdout.write(`R-012 rescue candidates for section ${section}:\n`);
        if (candidates.length === 0) {
          process.stdout.write(`  (none — no source_content_mismatch claims in not_rescued state)\n`);
          return;
        }
        for (const c of candidates) {
          const verdict = c.eligibility.passed ? 'ELIGIBLE' : 'INELIGIBLE';
          process.stdout.write(
            `  ${c.claim.claim_id}  [${verdict} — peer_count=${c.eligibility.peer_count}/${c.eligibility.threshold}]\n`,
          );
          process.stdout.write(`    asserts: ${c.claim.asserts.slice(0, 100)}\n`);
        }
        return;
      }

      const claimId = opts.claimId as string | undefined;
      if (claimId === undefined || claimId.trim().length === 0) {
        throw new InvalidArgumentError(
          'either --list OR --claim-id <id> is required',
        );
      }
      const reason = opts.reason as string | undefined;
      if (reason === undefined || reason.trim().length === 0) {
        throw new InvalidArgumentError('--reason is required');
      }

      if (opts.decline === true) {
        const outcome = await declineClaimRescueByOperator({
          packPath: opts.pack,
          sectionId: section,
          claimId,
          declineReason: reason,
          operator: opts.operator,
        });
        if (outcome.kind === 'not_found') {
          throw new ResearchOSError(
            `claim ${claimId} not found in section ${section}`,
            'r012_claim_not_found',
          );
        }
        if (outcome.kind === 'not_a_candidate') {
          throw new ResearchOSError(outcome.reason, 'r012_not_a_candidate');
        }
        if (outcome.kind === 'ineligible') {
          process.stdout.write(
            `decline refused: claim ${claimId} is ineligible for rescue ` +
              `(peer_count=${outcome.eligibility.peer_count}/${outcome.eligibility.threshold}). ` +
              `Marked rescue_status=ineligible_for_rescue; no ledger entry written.\n`,
          );
          return;
        }
        process.stdout.write(`claim ${claimId} marked operator_declined; ledger entry written.\n`);
        return;
      }

      const scope = opts.scope as string | undefined;
      const boundary = opts.boundary as string | undefined;
      if (scope === undefined || scope.trim().length === 0) {
        throw new InvalidArgumentError('--scope is required when rescuing');
      }
      if (boundary === undefined || boundary.trim().length === 0) {
        throw new InvalidArgumentError('--boundary is required when rescuing');
      }
      const outcome = await rescueClaimByOperator({
        packPath: opts.pack,
        sectionId: section,
        claimId,
        rescueScope: scope,
        rescueReason: reason,
        rescueBoundary: boundary,
        operator: opts.operator,
      });
      if (outcome.kind === 'not_found') {
        throw new ResearchOSError(
          `claim ${claimId} not found in section ${section}`,
          'r012_claim_not_found',
        );
      }
      if (outcome.kind === 'not_a_candidate') {
        throw new ResearchOSError(outcome.reason, 'r012_not_a_candidate');
      }
      if (outcome.kind === 'ineligible') {
        process.stdout.write(
          `rescue refused: claim ${claimId} is ineligible ` +
            `(peer_count=${outcome.eligibility.peer_count}/${outcome.eligibility.threshold}). ` +
            `Source body has not proven topical relevance through ≥2 other non-excluded claims. ` +
            `Marked rescue_status=ineligible_for_rescue; no ledger entry written.\n`,
        );
        return;
      }
      process.stdout.write(
        `claim ${claimId} rescued by operator; frame_excluded:false; rescue_boundary applied; ledger entry written.\n`,
      );
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
  .option(
    '--auto-mode-pair-timeout-ms <ms>',
    `R-021: per-pair LLM classification timeout in milliseconds for auto / ollama-intern modes. Default ${DEFAULT_AUTO_MODE_PAIR_TIMEOUT_MS}, range [${MIN_AUTO_MODE_PAIR_TIMEOUT_MS}, ${MAX_AUTO_MODE_PAIR_TIMEOUT_MS}]. Env-var equivalent: RESEARCH_OS_CONTRADICT_AUTO_PAIR_TIMEOUT_MS. CLI flag wins when both are set. No effect with --detector heuristic.`,
    parseAutoModePairTimeoutMsArg,
  )
  .option(
    '--auto-mode-fall-through-after-n-timeouts <n>',
    `R-021: after this many consecutive per-pair failures (timeout/HTTP error/parse error) the LLM detector falls through to the heuristic detector for the remaining pairs. Default ${DEFAULT_AUTO_MODE_FALL_THROUGH_AFTER_N}, range [${MIN_AUTO_MODE_FALL_THROUGH_AFTER_N}, ${MAX_AUTO_MODE_FALL_THROUGH_AFTER_N}]. Env-var equivalent: RESEARCH_OS_CONTRADICT_AUTO_FALL_THROUGH_AFTER_N. No effect with --detector heuristic.`,
    parseAutoModeFallThroughAfterNArg,
  )
  .option('--no-progress', 'Suppress per-iteration progress output to stderr')
  .option('--progress', 'Force per-iteration progress output even when not on a TTY (debug aid)')
  .action(async (section: string, opts) => {
    try {
      applyProgressFlags();

      // R-021 — resolve auto-mode settings (CLI > env > default). Validation
      // failures from env-var parsing exit non-zero so the operator sees the
      // bad env var rather than silently proceeding with defaults.
      const autoModeResolved = resolveAutoModeSettings({
        cliPairTimeoutMs: opts.autoModePairTimeoutMs as number | undefined,
        cliFallThroughAfterN: opts.autoModeFallThroughAfterNTimeouts as number | undefined,
      });
      if (!autoModeResolved.ok) {
        process.stderr.write(`research-os: ${autoModeResolved.error}\n`);
        process.exitCode = 2;
        return;
      }

      const result = await contradictMap({
        sectionId: section,
        packPath: opts.pack,
        triagedOnly: opts.triagedOnly,
        detectorMode: opts.detector,
        autoModePairTimeoutMs: autoModeResolved.pairTimeoutMs,
        autoModeFallThroughAfterNTimeouts: autoModeResolved.fallThroughAfterN,
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
      if (result.autoModeFallThrough) {
        const f = result.autoModeFallThrough;
        process.stdout.write(`  auto-mode fall-through:  ${f.consecutiveTimeouts} consecutive timeouts at pair ${f.triggeredAtPairIndex}; per-pair timeout=${f.perPairTimeoutMs}ms\n`);
        process.stdout.write(`    auto-classified pairs: ${f.autoClassifiedPairs}\n`);
        process.stdout.write(`    heuristic-classified:  ${f.heuristicClassifiedPairs}\n`);
      }
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
    parsePositiveIntFlagArg('--review-window'),
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
  .option(
    '--planner-timeout-ms <ms>',
    `R-018: planner-timeout budget in milliseconds for synth prose MCP calls. Default ${DEFAULT_PLANNER_TIMEOUT_MS}, upper bound ${MAX_PLANNER_TIMEOUT_MS} (safety rail). Env-var equivalent: RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS. CLI flag wins when both are set.`,
    parsePlannerTimeoutMsArg,
  )
  .action(async (opts) => {
    try {
      const sectionId = opts.section as string | undefined;
      if (sectionId) {
        const plannerTimeoutResolved = resolvePlannerTimeout({
          cliFlagMs: opts.plannerTimeoutMs as number | undefined,
          envVar: process.env.RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS,
        });
        if (!plannerTimeoutResolved.ok) {
          process.stderr.write(`research-os: ${plannerTimeoutResolved.error}\n`);
          process.exitCode = 2;
          return;
        }
        const result = await synthSection({
          sectionId,
          packPath: opts.pack,
          spawnMcpClient: true,
          plannerTimeoutMs: plannerTimeoutResolved.value,
          plannerTimeoutSource: plannerTimeoutResolved.source,
        });
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
  .option(
    '--planner-timeout-ms <ms>',
    `R-018: planner-timeout budget in milliseconds for synth prose MCP calls. Default ${DEFAULT_PLANNER_TIMEOUT_MS}, upper bound ${MAX_PLANNER_TIMEOUT_MS} (safety rail). Env-var equivalent: RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS. CLI flag wins when both are set.`,
    parsePlannerTimeoutMsArg,
  )
  .action(async (section: string, opts) => {
    try {
      const plannerTimeoutResolved = resolvePlannerTimeout({
        cliFlagMs: opts.plannerTimeoutMs as number | undefined,
        envVar: process.env.RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS,
      });
      if (!plannerTimeoutResolved.ok) {
        process.stderr.write(`research-os: ${plannerTimeoutResolved.error}\n`);
        process.exitCode = 2;
        return;
      }
      const result = await synthSection({
        sectionId: section,
        packPath: opts.pack,
        spawnMcpClient: true,
        plannerTimeoutMs: plannerTimeoutResolved.value,
        plannerTimeoutSource: plannerTimeoutResolved.source,
      });
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

synthCmd
  .command('pack')
  .description(
    'Pack-level synthesis. With --partial, produces a partial-pack synthesis that consumes ' +
      'section prose from sections that have valid Slice 1 output and discloses blocked / unrun / ' +
      'failed sections by reason. The pack remains NOT freezable and NOT publishable.',
  )
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option('--partial', 'Produce partial-pack synthesis instead of full-pack synthesis')
  .action(async (opts) => {
    try {
      if (!opts.partial) {
        process.stderr.write(
          'research-os: synth pack currently supports --partial only. ' +
            'For full-pack synthesis use `research-os synth workspace`.\n',
        );
        process.exitCode = 2;
        return;
      }
      const result = await synthPartialPack({ packPath: opts.pack, spawnMcpClient: true });
      process.stdout.write(`synthesis pack: PARTIAL\n`);
      process.stdout.write(`  pack mode:                ${result.packMode}\n`);
      process.stdout.write(`  included sections:        ${result.includedCount}\n`);
      process.stdout.write(`  excluded sections:        ${result.excludedCount}\n`);
      process.stdout.write(`  paragraphs:               ${result.paragraphCount}\n`);
      process.stdout.write(`  not freezable as pack:    ${result.notFreezableAsPack}\n`);
      process.stdout.write(`  not publishable as pack:  ${result.notPublishableAsPack}\n`);
      process.stdout.write(`  json:                     ${result.jsonPath}\n`);
      process.stdout.write(`  markdown:                 ${result.markdownPath}\n`);
      process.stdout.write(`  prose generated:          ${result.proseGenerated}\n`);
      if (result.proseError) {
        process.stdout.write(`  prose error:              ${result.proseError}\n`);
      }
    } catch (err) {
      reportError(err);
    }
  });

const recoverCmd = program
  .command('recover')
  .description(
    'Lawful recovery advisor: turn blocked / failed / unrun sections into ranked, contextual, ' +
      'operator-useful guidance. Deterministic diagnosis + action graph + AI advice + verifier.',
  );

recoverCmd
  .command('pack')
  .description(
    'Generate recovery guidance for every section in the pack. Healthy sections appear as ' +
      'no-action; blocked / failed / unrun sections get a ranked recovery plan with contrastive ' +
      'framing and explicit "do not" warnings. The pack remains NOT freezable and NOT publishable. ' +
      'Pass --regenerate-action-graph to re-compute the recovery action graph against current ' +
      'pack state, archive the prior artifact under recovery/history/, and append a regeneration ' +
      'ledger entry (R-014, v0.12 Slice 3).',
  )
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option(
    '--regenerate-action-graph',
    'Re-compute the recovery action graph against current pack state. When the existing ' +
      'recovery output already reflects current state, exits cleanly without writing files ' +
      '(no regeneration needed). Otherwise archives the prior recovery/blocked-section-recovery.{json,md} ' +
      'to recovery/history/, writes a new recovery artifact, and appends a record to ' +
      'recovery/regeneration-history.jsonl. R-014 (v0.12 Slice 3).',
  )
  .action(async (opts) => {
    try {
      const result = await recoverPack({
        packPath: opts.pack,
        spawnMcpClient: true,
        regenerateActionGraph: opts.regenerateActionGraph === true,
      });
      if (opts.regenerateActionGraph === true && result.regenerated === false) {
        // Clean-exit path already wrote the explicit "no regeneration needed"
        // message to stdout. Return without re-emitting the standard summary
        // so the operator sees a single coherent message.
        return;
      }
      process.stdout.write(`recovery advisor complete\n`);
      process.stdout.write(`  pack mode:              ${result.packMode}\n`);
      process.stdout.write(`  total sections:         ${result.totalSections}\n`);
      process.stdout.write(`  advised sections:       ${result.advisedSections}\n`);
      process.stdout.write(`  healthy sections:       ${result.healthySections}\n`);
      process.stdout.write(`  fallback sections:      ${result.fallbackSections}\n`);
      process.stdout.write(`  verifier rejections:    ${result.verifierRejections}\n`);
      process.stdout.write(`  json:                   ${result.jsonPath}\n`);
      process.stdout.write(`  markdown:               ${result.markdownPath}\n`);
      if (result.regenerated === true) {
        process.stdout.write(`  regeneration reason:    ${result.regenerationReason}\n`);
        process.stdout.write(
          `  input_state_hash:       ${(result.inputStateHash ?? '').slice(0, 12)}…\n`,
        );
        if (result.previousInputStateHash) {
          process.stdout.write(
            `  previous hash:          ${result.previousInputStateHash.slice(0, 12)}…\n`,
          );
        }
        if (result.archivedJsonPath) {
          process.stdout.write(`  archived json:          ${result.archivedJsonPath}\n`);
        }
        if (result.archivedMarkdownPath) {
          process.stdout.write(`  archived markdown:      ${result.archivedMarkdownPath}\n`);
        }
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
      'Read-only by default; use --apply --from <file> to commit operator corrections. ' +
      'Pass --rebuild-cards to materialize current override-effective values into the ' +
      'persisted card raw JSON (R-013, v0.12 Slice 2).',
  )
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .option('--json', 'Print the JSON report to stdout in addition to writing the artifact', false)
  .option('--apply', 'Apply operator-authored overrides from --from <file>', false)
  .option('--from <file>', 'JSON array file of proposed overrides (required with --apply)')
  .option(
    '--rebuild-cards',
    'Re-route persisted source cards through buildCard() with current ledger ' +
      'overrides applied (R-013). No HTTP, no re-fetch. May be combined with ' +
      '--apply --from <file>, or used alone to rebuild from the existing ledger.',
    false,
  )
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

        // R-013: when --rebuild-cards is paired with --apply, materialize
        // the newly-applied (plus any previously-applied) overrides into
        // the persisted card raw JSON. No re-fetch.
        if (opts.rebuildCards) {
          const rb = await rebuildSourceCards({ packPath });
          process.stdout.write(`source-card rebuild (R-013):\n`);
          process.stdout.write(`  cards considered:    ${rb.rebuilt}\n`);
          process.stdout.write(`  cards changed:       ${rb.changed}\n`);
          process.stdout.write(`  cards unchanged:     ${rb.unchanged}\n`);
          process.stdout.write(`  cards skipped:       ${rb.skipped}\n`);
          process.stdout.write(`  rebuild ledger:      ${rebuildLedgerPath(packPath)}\n`);
        }
        return;
      }

      // R-013 standalone path: --rebuild-cards without --apply rebuilds
      // from the current on-disk override ledger.
      if (opts.rebuildCards) {
        const rb = await rebuildSourceCards({ packPath });
        process.stdout.write(`source-card rebuild (R-013):\n`);
        process.stdout.write(`  cards considered:    ${rb.rebuilt}\n`);
        process.stdout.write(`  cards changed:       ${rb.changed}\n`);
        process.stdout.write(`  cards unchanged:     ${rb.unchanged}\n`);
        process.stdout.write(`  cards skipped:       ${rb.skipped}\n`);
        process.stdout.write(`  rebuild ledger:      ${rebuildLedgerPath(packPath)}\n`);
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
