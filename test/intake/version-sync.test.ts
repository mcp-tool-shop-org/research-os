import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as yamlParse } from 'yaml';

import { RESEARCH_OS_VERSION } from '../../src/index.js';
import { buildResearchYaml, init } from '../../src/intake/index.js';

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-vsync-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('version-sync: research.yaml carries RESEARCH_OS_VERSION (not a hardcoded literal)', () => {
  it('buildResearchYaml stamps research_os_version === RESEARCH_OS_VERSION', () => {
    const result = buildResearchYaml({ topic: 'version sync sanity' });
    expect(result.research_os_version).toBe(RESEARCH_OS_VERSION);
  });

  it('round-trip: init() writes a research.yaml whose research_os_version matches RESEARCH_OS_VERSION on disk', async () => {
    const result = await init({
      topic: 'round trip version sync',
      outDir: workDir,
    });

    const yamlPath = join(result.packPath, 'research.yaml');
    const raw = await readFile(yamlPath, 'utf8');
    const parsed = yamlParse(raw) as { research_os_version: string };

    expect(parsed.research_os_version).toBe(RESEARCH_OS_VERSION);
    // Defense-in-depth: the value on disk is not the historic '0.1.0' literal
    // (unless RESEARCH_OS_VERSION itself is '0.1.0', which would be a separate
    // regression caught by the package.json sync test below).
    if (RESEARCH_OS_VERSION !== '0.1.0') {
      expect(parsed.research_os_version).not.toBe('0.1.0');
    }
  });

  it('package.json version matches RESEARCH_OS_VERSION (subsumes B-E-007)', () => {
    // Resolve package.json relative to this test file so it works regardless
    // of cwd. test/intake/ -> ../../package.json
    const here = fileURLToPath(import.meta.url);
    const pkgPath = resolve(here, '../../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
    expect(RESEARCH_OS_VERSION).toBe(pkg.version);
  });
});
