#!/usr/bin/env node
import { Command } from 'commander';
import { init } from './intake/index.js';
import { add as sectionAdd } from './sections/index.js';
import { reportSection } from './section_report/index.js';
import { gather } from './sources/index.js';
import { auditDensity, extract as claimExtract } from './claims/index.js';
import { triage as runTriage } from './triage/index.js';
import { map as contradictMap } from './contradictions/index.js';
import { gate as runGate } from './gates/index.js';
import {
  HeuristicReviewer,
  OllamaInternReviewer,
  review as runReview,
} from './review/index.js';
import {
  build as indexBuild,
  query as indexQuery,
  exportRepoKnowledge,
  syncRepoKnowledge,
} from './indexer/index.js';
import { handoff as coworkHandoff } from './cowork/index.js';
import { workspace as synthWorkspace } from './synth/index.js';
import { audit as runAudit } from './audit/index.js';
import { freeze as runFreeze } from './freeze/index.js';
import { invalidateExtraction } from './invalidate/index.js';
import { ResearchOSError } from './errors.js';
import { RESEARCH_OS_VERSION } from './index.js';

function reportError(err: unknown): never {
  if (err instanceof ResearchOSError) {
    process.stderr.write(`research-os: ${err.code}: ${err.message}\n`);
  } else if (err instanceof Error) {
    process.stderr.write(`research-os: ${err.message}\n`);
  } else {
    process.stderr.write(`research-os: unknown error\n`);
  }
  process.exit(1);
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
  .option('--max-runtime-minutes <n>', 'Total runtime budget for the pack', (v) => parseInt(v, 10), 240)
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
  .option('--max-time <n>', 'Section time budget in minutes', (v) => parseInt(v, 10))
  .option('--min-sources <n>', 'Minimum sources required for this section', (v) => parseInt(v, 10))
  .option('--primary-required <n>', 'Primary sources required for this section', (v) => parseInt(v, 10))
  .action(async (id: string, opts) => {
    try {
      const result = await sectionAdd({
        id,
        purpose: opts.purpose,
        packPath: opts.pack,
        maxTimeMinutes: opts.maxTime,
        minSources: opts.minSources,
        primarySourcesRequired: opts.primaryRequired,
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
  .action(async (section: string, opts) => {
    try {
      const result = await gather({
        sectionId: section,
        packPath: opts.pack,
        urls: opts.url,
        urlsFile: opts.urlsFile,
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

const claimCmd = program
  .command('claim')
  .description('Manage claims extracted from gathered sources');

claimCmd
  .command('extract')
  .description('Extract candidate claims from a section\'s gathered sources')
  .argument('<section>', 'Section id, e.g. "01-landscape"')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .action(async (section: string, opts) => {
    try {
      const result = await claimExtract({
        sectionId: section,
        packPath: opts.pack,
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
  .option('--per-source-cap <n>', 'Max claims per source forwarded to review', (v) => parseInt(v, 10), 10)
  .option('--min-assert-chars <n>', 'Asserts shorter than this become parked_low_value', (v) => parseInt(v, 10), 30)
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
      process.stdout.write(`  near-duplicate clusters:${a.near_duplicate_clusters.length}\n`);
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
  .action(async (section: string, opts) => {
    try {
      const result = await contradictMap({
        sectionId: section,
        packPath: opts.pack,
        triagedOnly: opts.triagedOnly,
      });
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
    (v) => parseInt(v, 10),
  )
  .action(async (section: string, opts) => {
    try {
      const reviewers = opts.heuristicOnly
        ? [new HeuristicReviewer()]
        : opts.reviewWindow || opts.llmPaged
          ? [
              new OllamaInternReviewer({
                claimsPerWindow: opts.reviewWindow ?? undefined,
              }),
              new HeuristicReviewer(),
            ]
          : undefined;
      const result = await runReview({
        sectionId: section,
        packPath: opts.pack,
        reviewers,
        triagedOnly: opts.triagedOnly,
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
  .option('--limit <n>', 'Max hits to return', (v) => parseInt(v, 10), 25)
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
      if (!result.synthesisAllowed) process.exitCode = 0; // not an error — informational
    } catch (err) {
      reportError(err);
    }
  });

const synthCmd = program
  .command('synth')
  .description('Synthesis workspace: organize accepted research truth for Cowork');

synthCmd
  .command('workspace')
  .description('Create the synthesis workspace; refuses unless cowork handoff mode is synthesis_ready')
  .option('--pack <dir>', 'Path to the pack root (defaults to cwd)', process.cwd())
  .action(async (opts) => {
    try {
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
      process.stdout.write(`  unresolved contradictions:${result.unresolvedContradictions}\n`);
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

program.parseAsync(process.argv);
