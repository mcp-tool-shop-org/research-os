#!/usr/bin/env node
import { Command } from 'commander';
import { init } from './intake/index.js';
import { ResearchOSError } from './errors.js';
import { RESEARCH_OS_VERSION } from './index.js';

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
      if (err instanceof ResearchOSError) {
        process.stderr.write(`research-os: ${err.code}: ${err.message}\n`);
      } else if (err instanceof Error) {
        process.stderr.write(`research-os: ${err.message}\n`);
      } else {
        process.stderr.write(`research-os: unknown error\n`);
      }
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
