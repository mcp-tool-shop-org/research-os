import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as yamlParse } from 'yaml';

import { init, ResearchYamlSchema } from '../src/intake/index.js';
import { add, SectionGatesYamlSchema } from '../src/sections/index.js';
import {
  PackNotFoundError,
  SectionExistsError,
  InvalidSectionIdError,
} from '../src/errors.js';

let workDir: string;
let packPath: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-sections-'));
  const result = await init({
    topic: 'How should research-os structure its sections?',
    outDir: workDir,
  });
  packPath = result.packPath;
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('section add', () => {
  it('creates a complete section workspace and updates research.yaml', async () => {
    const result = await add({
      id: '01-landscape',
      purpose: 'Map the existing tools and patterns in the space',
      packPath,
    });

    expect(result.sectionId).toBe('01-landscape');
    expect(result.sectionPath).toBe(join(packPath, 'sections', '01-landscape'));

    for (const rel of [
      'brief.md',
      'sources.jsonl',
      'claims.jsonl',
      'contradictions.md',
      'gates.yaml',
      'open_questions.md',
    ]) {
      const s = await stat(join(result.sectionPath, rel));
      expect(s.isFile()).toBe(true);
    }

    const yamlText = await readFile(join(packPath, 'research.yaml'), 'utf8');
    const parsed = ResearchYamlSchema.parse(yamlParse(yamlText));
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0]?.id).toBe('01-landscape');
    expect(parsed.sections[0]?.status).toBe('draft');
  });

  it('writes a schema-valid section gates.yaml', async () => {
    const result = await add({
      id: '02-design',
      purpose: 'Establish the design contract',
      packPath,
    });
    const gatesText = await readFile(join(result.sectionPath, 'gates.yaml'), 'utf8');
    const parsed = SectionGatesYamlSchema.parse(yamlParse(gatesText));
    expect(parsed.section_id).toBe('02-design');
    expect(parsed.status).toBe('draft');
    expect(parsed.max_time_minutes).toBeGreaterThan(0);
  });

  it('inherits per-section defaults from pack-level gates', async () => {
    const result = await add({
      id: '01-defaults',
      purpose: 'Inherit defaults',
      packPath,
    });
    const gates = SectionGatesYamlSchema.parse(
      yamlParse(await readFile(join(result.sectionPath, 'gates.yaml'), 'utf8')),
    );
    expect(gates.max_time_minutes).toBe(45);
    expect(gates.min_sources).toBe(8);
    expect(gates.primary_sources_required).toBe(2);
    expect(gates.contradictions_required).toBe(true);
  });

  it('respects per-section overrides on min_sources and time budget', async () => {
    const result = await add({
      id: '03-overrides',
      purpose: 'Override pack defaults',
      packPath,
      maxTimeMinutes: 90,
      minSources: 12,
      primarySourcesRequired: 4,
    });
    const gates = SectionGatesYamlSchema.parse(
      yamlParse(await readFile(join(result.sectionPath, 'gates.yaml'), 'utf8')),
    );
    expect(gates.max_time_minutes).toBe(90);
    expect(gates.min_sources).toBe(12);
    expect(gates.primary_sources_required).toBe(4);
  });

  it('rejects a duplicate section id', async () => {
    await add({ id: '04-dupe', purpose: 'first add', packPath });
    await expect(
      add({ id: '04-dupe', purpose: 'second add', packPath }),
    ).rejects.toBeInstanceOf(SectionExistsError);
  });

  it('rejects a malformed section id', async () => {
    await expect(
      add({ id: 'no-leading-digits', purpose: 'bad id', packPath }),
    ).rejects.toBeInstanceOf(InvalidSectionIdError);
    await expect(
      add({ id: '1-too-short-prefix', purpose: 'bad id', packPath }),
    ).rejects.toBeInstanceOf(InvalidSectionIdError);
    await expect(
      add({ id: '01-Has_Capitals', purpose: 'bad id', packPath }),
    ).rejects.toBeInstanceOf(InvalidSectionIdError);
  });

  it('rejects when no research.yaml is present', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'research-os-empty-'));
    try {
      await expect(
        add({ id: '01-orphan', purpose: 'orphan section', packPath: empty }),
      ).rejects.toBeInstanceOf(PackNotFoundError);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('rejects when research.yaml is malformed', async () => {
    await writeFile(join(packPath, 'research.yaml'), 'not: { a: valid: yaml', 'utf8');
    await expect(
      add({ id: '01-bad-yaml', purpose: 'bad pack', packPath }),
    ).rejects.toThrow();
  });

  it('appends multiple sections in order', async () => {
    await add({ id: '01-first', purpose: 'first', packPath });
    await add({ id: '02-second', purpose: 'second', packPath });
    await add({ id: '03-third', purpose: 'third', packPath });
    const parsed = ResearchYamlSchema.parse(
      yamlParse(await readFile(join(packPath, 'research.yaml'), 'utf8')),
    );
    expect(parsed.sections.map((s) => s.id)).toEqual(['01-first', '02-second', '03-third']);
  });
});
