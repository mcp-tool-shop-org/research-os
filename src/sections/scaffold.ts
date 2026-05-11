import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

import {
  PackNotFoundError,
  SectionExistsError,
  InvalidSectionIdError,
  ResearchOSError,
} from '../errors.js';
import {
  ResearchYamlSchema,
  SectionSchema,
  type Section,
  type ResearchYaml,
} from '../intake/schema.js';
import { SectionGatesYamlSchema, type SectionGatesYaml } from './schema.js';
import type { SectionAddOptions, SectionAddResult } from './types.js';

/**
 * D-005: section add accepts `force` to overwrite an on-disk section
 * directory that drifted from research.yaml. We keep the public types
 * file (`./types.ts`) untouched and widen the function-local parameter
 * type here.
 */
interface SectionAddOptionsWithForce extends SectionAddOptions {
  force?: boolean;
}

const SECTION_ID_PATTERN = /^[0-9]{2}-[a-z0-9-]+$/;

/** D-005: artifact files we check for inside an existing section directory. */
const SECTION_ARTIFACT_FILES = [
  'brief.md',
  'sources.jsonl',
  'claims.jsonl',
  'contradictions.md',
  'open_questions.md',
  'gates.yaml',
];

function briefStub(opts: SectionAddOptions): string {
  return `# Section: ${opts.id}

**Status:** draft
**Purpose:** ${opts.purpose}

## Findings

_This section has not been gathered yet. Sources, claims, and contradictions will be populated by the section-worker pass._

## What the evidence supports

_To be populated after gathering and gate pass._

## What the evidence does not support

_To be populated._

## Unresolved

_To be populated._
`;
}

function contradictionsStub(id: string): string {
  return `# Contradictions: ${id}

_No contradictions recorded yet. Each contradiction must include both sides with source IDs from the source ledger._

## Format

\`\`\`
## Contradiction C-<n>: <short label>

**Side A:** <claim> (source: <source_id>)
**Side B:** <claim> (source: <source_id>)
**Status:** unresolved | reconciled-by-<source_id> | preserved-deliberately
**Notes:** <reason>
\`\`\`
`;
}

function openQuestionsStub(id: string): string {
  return `# Open questions: ${id}

_Questions raised by this section that are not resolved within section scope. Cross-section synthesis or additional gathering may resolve them._

## Format

\`\`\`
- **Q-<n>:** <question> — needs: <evidence-shape>
\`\`\`
`;
}

async function loadResearchYaml(packPath: string): Promise<{ yaml: ResearchYaml; path: string }> {
  const yamlPath = join(packPath, 'research.yaml');
  if (!existsSync(yamlPath)) throw new PackNotFoundError(packPath);
  const text = await readFile(yamlPath, 'utf8');
  const parsed = ResearchYamlSchema.parse(yamlParse(text));
  return { yaml: parsed, path: yamlPath };
}

export async function add(options: SectionAddOptionsWithForce): Promise<SectionAddResult> {
  if (!SECTION_ID_PATTERN.test(options.id)) {
    throw new InvalidSectionIdError(options.id);
  }
  if (!options.purpose || options.purpose.trim().length === 0) {
    throw new Error('Section purpose is required');
  }

  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  const { yaml, path: yamlPath } = await loadResearchYaml(packPath);

  if (yaml.sections.some((s) => s.id === options.id)) {
    throw new SectionExistsError(options.id);
  }

  // D-005: even if research.yaml doesn't list this section, the on-disk
  // directory might already contain artifact files from a prior aborted
  // run or a hand-edited tree. Refuse rather than silently scaffolding
  // over them — unless --force says otherwise.
  const sectionPath = join(packPath, 'sections', options.id);
  if (!options.force && existsSync(sectionPath)) {
    const present = SECTION_ARTIFACT_FILES.filter((f) =>
      existsSync(join(sectionPath, f)),
    );
    if (present.length > 0) {
      throw new ResearchOSError(
        `Section "${options.id}" directory already exists at ${sectionPath} but is missing from research.yaml. ` +
          `Refusing to overwrite. Pass --force to overwrite, or delete the directory manually. ` +
          `(found: ${present.join(', ')})`,
        'SECTION_DIR_DRIFT',
        `Pass --force to overwrite, or delete ${sectionPath} manually before running section add again.`,
      );
    }
  }

  const newSection: Section = SectionSchema.parse({
    id: options.id,
    purpose: options.purpose,
    max_time_minutes: options.maxTimeMinutes ?? yaml.gates.section_budget.max_time_minutes,
    min_sources: options.minSources ?? yaml.gates.source_floor.min_sources,
    primary_sources_required:
      options.primarySourcesRequired ?? yaml.gates.source_floor.primary_sources_required,
    contradictions_required:
      options.contradictionsRequired ?? yaml.gates.contradiction.required,
    status: 'draft',
  });

  const updated: ResearchYaml = ResearchYamlSchema.parse({
    ...yaml,
    sections: [...yaml.sections, newSection],
  });

  await mkdir(sectionPath, { recursive: true });

  const written: string[] = [];

  const writes: Array<[string, string]> = [
    [join(sectionPath, 'brief.md'), briefStub(options)],
    [join(sectionPath, 'sources.jsonl'), ''],
    [join(sectionPath, 'claims.jsonl'), ''],
    [join(sectionPath, 'contradictions.md'), contradictionsStub(options.id)],
    [join(sectionPath, 'open_questions.md'), openQuestionsStub(options.id)],
  ];
  for (const [path, content] of writes) {
    await writeFile(path, content, 'utf8');
    written.push(path);
  }

  const gatesYaml: SectionGatesYaml = SectionGatesYamlSchema.parse({
    section_id: newSection.id,
    purpose: newSection.purpose,
    status: newSection.status,
    created_at: new Date().toISOString(),
    max_time_minutes: newSection.max_time_minutes,
    min_sources: newSection.min_sources,
    primary_sources_required: newSection.primary_sources_required,
    contradictions_required: newSection.contradictions_required,
  });
  const gatesPath = join(sectionPath, 'gates.yaml');
  await writeFile(gatesPath, yamlStringify(gatesYaml, { lineWidth: 0 }), 'utf8');
  written.push(gatesPath);

  await writeFile(yamlPath, yamlStringify(updated, { lineWidth: 0 }), 'utf8');
  written.push(yamlPath);

  return {
    sectionId: newSection.id,
    sectionPath,
    filesWritten: written,
  };
}
