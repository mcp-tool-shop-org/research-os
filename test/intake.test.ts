import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as yamlParse } from 'yaml';

import {
  init,
  buildResearchYaml,
  slugify,
  ResearchYamlSchema,
} from '../src/intake/index.js';
import { PackExistsError } from '../src/errors.js';

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-test-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('slugify', () => {
  it('lowercases and dasherizes a topic', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });

  it('caps length at 60 chars', () => {
    const long = 'a'.repeat(120);
    expect(slugify(long).length).toBeLessThanOrEqual(60);
  });

  it('strips trailing dashes after truncation', () => {
    const out = slugify('a'.repeat(50) + ' b'.repeat(40));
    expect(out.endsWith('-')).toBe(false);
  });

  it('falls back to research-pack when input has no slug-able chars', () => {
    expect(slugify('!!!')).toBe('research-pack');
  });
});

describe('buildResearchYaml', () => {
  it('produces a schema-valid yaml object from a topic', () => {
    const yaml = buildResearchYaml({ topic: 'How should research-os handle gates?' });
    const parsed = ResearchYamlSchema.parse(yaml);
    expect(parsed.topic).toBe('How should research-os handle gates?');
    expect(parsed.research_os_version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.gates.source_floor.min_sources).toBeGreaterThan(0);
    expect(parsed.primary_source_waiver.status).toBe('none');
    expect(parsed.sections).toEqual([]);
  });

  it('rejects topics under 10 characters', () => {
    expect(() => buildResearchYaml({ topic: 'short' })).toThrow();
  });

  it('respects audience override', () => {
    const yaml = buildResearchYaml({
      topic: 'A long enough topic for tests',
      audience: 'product team',
    });
    expect(yaml.audience).toBe('product team');
  });
});

describe('init', () => {
  it('creates a complete pack tree from a topic', async () => {
    const result = await init({
      topic: 'How should research-os structure source cards?',
      outDir: workDir,
    });

    expect(result.packPath.startsWith(workDir)).toBe(true);
    expect(result.filesWritten.length).toBeGreaterThan(0);

    const expectedFiles = [
      'research.yaml',
      'CLAUDE.md',
      'prompts/cowork-master.md',
      'prompts/section-worker.md',
      'prompts/adversarial-reviewer.md',
      'evidence/fetch-log.jsonl',
      'evidence/citation-ledger.jsonl',
    ];
    for (const rel of expectedFiles) {
      const s = await stat(join(result.packPath, rel));
      expect(s.isFile()).toBe(true);
    }

    const expectedDirs = [
      'sections',
      'evidence/source-cards',
      'synthesis',
      'audits',
      'prompts',
    ];
    for (const rel of expectedDirs) {
      const s = await stat(join(result.packPath, rel));
      expect(s.isDirectory()).toBe(true);
    }
  });

  it('writes a valid research.yaml', async () => {
    const result = await init({
      topic: 'How should research-os handle long-running synthesis?',
      outDir: workDir,
    });

    const yamlText = await readFile(join(result.packPath, 'research.yaml'), 'utf8');
    const parsed = ResearchYamlSchema.parse(yamlParse(yamlText));
    expect(parsed.topic).toBe('How should research-os handle long-running synthesis?');
    expect(parsed.gates).toBeDefined();
    expect(parsed.primary_source_waiver.status).toBe('none');
  });

  it('refuses to overwrite an existing non-empty pack dir', async () => {
    const opts = {
      topic: 'How should research-os refuse to overwrite?',
      outDir: workDir,
    };
    await init(opts);
    await expect(init(opts)).rejects.toBeInstanceOf(PackExistsError);
  });

  it('overwrites when force is set', async () => {
    const opts = {
      topic: 'How should research-os force-overwrite cleanly?',
      outDir: workDir,
    };
    await init(opts);
    await expect(init({ ...opts, force: true })).resolves.toBeDefined();
  });

  it('uses the explicit name when provided', async () => {
    const result = await init({
      topic: 'A topic that would slug differently',
      name: 'custom-name',
      outDir: workDir,
    });
    expect(result.packName).toBe('custom-name');
    expect(result.packPath.endsWith('custom-name')).toBe(true);
  });
});
