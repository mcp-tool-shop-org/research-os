import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify as yamlStringify } from 'yaml';

import { PackExistsError, TemplateNotFoundError } from '../errors.js';
import { ResearchYamlSchema, type ResearchYaml } from './schema.js';
import type { InitOptions, InitResult } from './types.js';

const PACKAGE_VERSION = '0.1.0';

export function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return normalized || 'research-pack';
}

function findTemplatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../templates/pack'),
    resolve(here, '../../templates/pack'),
    resolve(here, '../../../templates/pack'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new TemplateNotFoundError(candidates.join(' | '));
}

async function copyTreeRelative(srcDir: string, destDir: string, written: string[]): Promise<void> {
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);
    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true });
      await copyTreeRelative(srcPath, destPath, written);
    } else if (entry.isFile()) {
      const data = await readFile(srcPath);
      await writeFile(destPath, data);
      written.push(destPath);
    }
  }
}

export function buildResearchYaml(options: InitOptions): ResearchYaml {
  const draft = {
    research_os_version: PACKAGE_VERSION,
    created_at: new Date().toISOString(),
    topic: options.topic,
    decision: options.decision ?? '',
    audience: options.audience ?? 'self',
    desired_output: options.desiredOutput ?? '',
    max_runtime_minutes: options.maxRuntimeMinutes ?? 240,
    freshness: { required: true, max_source_age_months: null },
    excluded_sources: [],
    primary_source_waiver: { status: 'none', compensating_controls: [] },
    sections: [],
    frozen_at: null,
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
      freshness: {
        required_for_current_topics: true,
        stale_source_policy: 'warn',
      },
      contradiction: {
        required: true,
        unresolved_contradictions_block_synthesis: true,
      },
      section_budget: {
        max_time_minutes: 45,
        extension_requires_evidence: true,
      },
    },
  };
  return ResearchYamlSchema.parse(draft);
}

export async function init(options: InitOptions): Promise<InitResult> {
  const packName = options.name?.trim() || slugify(options.topic);
  const baseDir = options.outDir ? resolve(options.outDir) : process.cwd();
  const packPath = resolve(baseDir, packName);

  if (existsSync(packPath) && !options.force) {
    const s = await stat(packPath);
    if (s.isDirectory()) {
      const entries = await readdir(packPath);
      if (entries.length > 0) throw new PackExistsError(packPath);
    } else {
      throw new PackExistsError(packPath);
    }
  }

  const written: string[] = [];

  await mkdir(packPath, { recursive: true });
  for (const dir of [
    'sections',
    'evidence/source-cards',
    'synthesis',
    'audits',
    'prompts',
  ]) {
    await mkdir(join(packPath, dir), { recursive: true });
  }

  const templatesDir = findTemplatesDir();
  await copyTreeRelative(templatesDir, packPath, written);

  const research = buildResearchYaml(options);
  const yamlPath = join(packPath, 'research.yaml');
  await writeFile(yamlPath, yamlStringify(research, { lineWidth: 0 }), 'utf8');
  written.push(yamlPath);

  const fetchLogPath = join(packPath, 'evidence', 'fetch-log.jsonl');
  const citationLedgerPath = join(packPath, 'evidence', 'citation-ledger.jsonl');
  for (const ledger of [fetchLogPath, citationLedgerPath]) {
    if (!existsSync(ledger)) {
      await writeFile(ledger, '', 'utf8');
      written.push(ledger);
    }
  }

  return { packPath, packName, filesWritten: written };
}
