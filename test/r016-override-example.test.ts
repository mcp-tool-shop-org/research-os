/**
 * R-016 acceptance tests — examples/source-card-override.example.json (v0.12 Slice 4).
 *
 * The slice ships a single populated example file plus a package.json `files`
 * entry that includes it in the npm tarball. Operators reading the example
 * before invoking `audit --apply --from` understand the override shape without
 * resorting to runtime-validation-error-driven discovery (which is what v0.3
 * forced — Session B classified C1 NON_BLOCKING_OPERATOR_FRICTION; a shipped
 * example converts C1 to TRIVIAL).
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SourceCardOverrideSchema } from '../src/sources/source-card-overrides-schema.js';

const repoRoot = join(__dirname, '..');
const examplePath = join(repoRoot, 'examples', 'source-card-override.example.json');

describe('R-016 — source-card override example file (v0.12 Slice 4)', () => {
  it('R-016.1: example file exists at examples/source-card-override.example.json and is valid JSON', () => {
    expect(existsSync(examplePath)).toBe(true);
    const text = readFileSync(examplePath, 'utf8');
    expect(() => JSON.parse(text)).not.toThrow();
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThanOrEqual(2);
  });

  it('R-016.2: each entry parses cleanly against SourceCardOverrideSchema', () => {
    const text = readFileSync(examplePath, 'utf8');
    const entries = JSON.parse(text) as unknown[];
    for (const entry of entries) {
      // Schema is open (no .strict()); _doc and other annotation keys are
      // permitted as extra properties. We assert the load-bearing schema
      // contract (required fields present, refine satisfied).
      const result = SourceCardOverrideSchema.safeParse(entry);
      if (!result.success) {
        throw new Error(
          `Entry failed schema parse:\n${JSON.stringify(entry, null, 2)}\n\nErrors:\n${JSON.stringify(result.error.issues, null, 2)}`,
        );
      }
    }
  });

  it('R-016.3: example covers all schema features — ≥2 entries, both shapes (effective_source_type-only and clear_severities-using), realistic field values', () => {
    const text = readFileSync(examplePath, 'utf8');
    const entries = JSON.parse(text) as Array<Record<string, unknown>>;
    expect(entries.length).toBeGreaterThanOrEqual(2);

    // At least one entry uses ONLY effective_source_type (no clear_severities)
    const effectiveTypeOnly = entries.some(
      (e) =>
        typeof e.new_source_type === 'string' &&
        (!Array.isArray(e.clear_severities) || e.clear_severities.length === 0),
    );
    expect(effectiveTypeOnly).toBe(true);

    // At least one entry exercises clear_severities[] with ≥1 named severity
    const usesClearSeverities = entries.some(
      (e) => Array.isArray(e.clear_severities) && e.clear_severities.length >= 1,
    );
    expect(usesClearSeverities).toBe(true);

    // Every entry carries realistic shapes (the operator can copy/paste an
    // entry into evidence/source-card-overrides.jsonl without changing
    // these fields' shapes).
    for (const e of entries) {
      expect(typeof e.source_id).toBe('string');
      expect(String(e.source_id)).toMatch(/^src_[a-f0-9]{12}$/);
      expect(typeof e.url).toBe('string');
      expect(String(e.url).startsWith('http')).toBe(true);
      expect(typeof e.reason).toBe('string');
      expect(String(e.reason).trim().length).toBeGreaterThan(0);
      expect(typeof e.operator).toBe('string');
      expect(typeof e.created_at).toBe('string');
      expect(Number.isFinite(Date.parse(String(e.created_at)))).toBe(true);
      expect(typeof e.pack_version).toBe('string');
    }
  });

  it('R-016.4: package.json files[] includes "examples" and npm pack --dry-run lists the example file', () => {
    // Structural check on package.json
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    expect(Array.isArray(pkg.files)).toBe(true);
    expect((pkg.files as string[]).includes('examples')).toBe(true);

    // Integration: `npm pack --dry-run --json` reports the tarball contents
    // without writing a tarball. The output is a JSON array of one object
    // with a `files` field. The example file path must appear in there.
    let raw: string;
    try {
      raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
        cwd: repoRoot,
        encoding: 'utf8',
        // Suppress npm's own stderr chatter to keep CI logs clean — we
        // only assert on stdout JSON.
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stdout?: Buffer | string };
      raw = typeof e.stdout === 'string' ? e.stdout : (e.stdout?.toString('utf8') ?? '');
    }
    expect(raw.length).toBeGreaterThan(0);

    // npm pack --dry-run --json output: [{ "files": [{ "path": "..." }, ...] }]
    const parsed = JSON.parse(raw) as Array<{ files?: Array<{ path: string }> }>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    const filePaths = (parsed[0]?.files ?? []).map((f) => f.path.replace(/\\/g, '/'));
    expect(filePaths.some((p) => p === 'examples/source-card-override.example.json')).toBe(true);
  });
});
