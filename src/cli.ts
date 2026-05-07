#!/usr/bin/env node
import { Command } from 'commander';
import { init } from './intake/index.js';
import { add as sectionAdd } from './sections/index.js';
import { gather } from './sources/index.js';
import { extract as claimExtract } from './claims/index.js';
import { map as contradictMap } from './contradictions/index.js';
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
      process.stdout.write(`  section:           ${result.sectionId}\n`);
      process.stdout.write(`  extractor:         ${result.extractor}\n`);
      process.stdout.write(`  method:            ${result.extractionMethod}\n`);
      process.stdout.write(`  sources processed: ${result.sourcesProcessed}\n`);
      process.stdout.write(`  sources skipped:   ${result.sourcesSkipped}\n`);
      process.stdout.write(`  sources failed:    ${result.sourcesFailed}\n`);
      process.stdout.write(`  claims added:      ${result.claimsAdded}\n`);
      process.stdout.write(`  claims deduped:    ${result.claimsDeduped}\n`);
      process.stdout.write(`  claims rejected (ungrounded): ${result.claimsRejectedUngrounded}\n`);
      if (result.failures.length > 0) {
        process.stdout.write(`\nfailures:\n`);
        for (const f of result.failures) {
          process.stdout.write(`  ${f.source_id}: ${f.reason}\n`);
        }
      }
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
  .action(async (section: string, opts) => {
    try {
      const result = await contradictMap({
        sectionId: section,
        packPath: opts.pack,
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

program.parseAsync(process.argv);
