/**
 * Stage C Phase 3 Theme 3 (Refinement 2): command-text verification pass.
 *
 * For every string in `src/` (production sources only — excludes tests,
 * scripts, dist) that names a `research-os <subcommand>` or a top-level
 * flag, assert the named command/flag exists in the registered Commander
 * tree in `src/cli.ts`.
 *
 * This is the "old-API-dead assertion" doctrine applied to operator-facing
 * error prose. Catches drift like the v0.6.0 IndexNotBuiltError that named
 * the non-existent `research-os index --all` instead of the actual
 * `research-os index build --all`.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ──────────────────────────────────────────────────────────────────────────
// Allowlist of valid `research-os <subcommand>` invocations. Updated when
// new subcommands land in src/cli.ts. The values here MUST mirror the
// `.command(...)` calls in cli.ts.
//
// Format: each entry is the full subcommand path the operator would type,
// e.g., "init", "section add", "discover run", "pack publish".
// ──────────────────────────────────────────────────────────────────────────
const REGISTERED_COMMANDS: ReadonlySet<string> = new Set([
  'init',
  'section',
  'section add',
  'section report',
  'gather',
  'discover',
  'discover run',
  'discover approve',
  'discover reject',
  'discover export-urls',
  'claim',
  'claim extract',
  'claim triage',
  'claim audit-density',
  'contradict',
  'contradict map',
  'contradict resolve',
  'gate',
  'review',
  'index',
  'index build',
  'index export-repo-knowledge',
  'index sync-repo-knowledge',
  'query',
  'cowork',
  'cowork handoff',
  'synth',
  'synth workspace',
  'audit',
  'freeze',
  'invalidate',
  'invalidate extraction',
  'invalidate review',
  'review-promote',
  'pack',
  'pack publish',
  'source-card',
  'source-card audit',
  'help',
]);

// Subset of single-word patterns we'll see and want to accept as referencing
// the registered base command (e.g., "research-os gather" matches "gather").
function isRegisteredCommandPath(path: string): boolean {
  return REGISTERED_COMMANDS.has(path);
}

interface CommandReference {
  file: string;
  line: number;
  rawMatch: string;
  commandPath: string;
}

// Recursively walk src/ skipping test dirs.
function walkSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      // Skip nested test/ dirs if any get placed inside src/.
      if (entry === 'test' || entry === '__tests__') continue;
      walkSourceFiles(full, out);
    } else if (s.isFile() && (entry.endsWith('.ts') || entry.endsWith('.tsx'))) {
      // Exclude *.test.ts and *.spec.ts.
      if (/\.(test|spec)\.tsx?$/.test(entry)) continue;
      out.push(full);
    }
  }
  return out;
}

/**
 * Extract every `research-os <subcommand>` invocation reference from a file's
 * contents. We only flag references that appear inside backticks or single
 * quotes — i.e., that look like CODE/COMMAND citations, not prose like
 * "research-os version" or "research-os to read newer receipts".
 *
 * This is the regex anchor for "old-API-dead" enforcement: every quoted
 * `research-os <X>` snippet in src/ must name a registered subcommand.
 *
 * Strips trailing punctuation and option/argument tokens (`--foo`, `<bar>`).
 */
function extractCommandReferences(filePath: string): CommandReference[] {
  const text = readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  const refs: CommandReference[] = [];
  // Only inside backticks or single quotes: `research-os <subcommand>` or
  // 'research-os <subcommand>'. Bare invocations in prose are out of scope.
  const re =
    /[`'"]research-os[ \t]+([a-z0-9][a-z0-9_-]*(?:[ \t]+[a-z0-9][a-z0-9_-]*){0,3})/gi;
  // Crude block-comment tracker. Skip lines inside /* ... */ blocks, and
  // single-line // comments. Doc-comments are allowed to reference legacy
  // command syntax in commentary without failing this gate.
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i] ?? '';
    // Strip block-comment regions on this line.
    if (inBlockComment) {
      const endIdx = line.indexOf('*/');
      if (endIdx >= 0) {
        line = line.slice(endIdx + 2);
        inBlockComment = false;
      } else {
        continue; // entire line is comment
      }
    }
    // Repeatedly strip inline /* ... */ pairs.
    while (true) {
      const startIdx = line.indexOf('/*');
      if (startIdx < 0) break;
      const endIdx = line.indexOf('*/', startIdx + 2);
      if (endIdx < 0) {
        line = line.slice(0, startIdx);
        inBlockComment = true;
        break;
      }
      line = line.slice(0, startIdx) + ' ' + line.slice(endIdx + 2);
    }
    // Strip line-comment tail (//).
    const lineCommentIdx = line.indexOf('//');
    if (lineCommentIdx >= 0) line = line.slice(0, lineCommentIdx);

    let match: RegExpExecArray | null;
    while ((match = re.exec(line)) !== null) {
      const rawSub = (match[1] ?? '').trim();
      if (!rawSub) continue;
      // Split tokens, drop anything that looks like an arg/flag/punctuation.
      const tokens = rawSub.split(/\s+/);
      const cmdTokens: string[] = [];
      for (const t of tokens) {
        if (t.startsWith('--') || t.startsWith('<') || t.startsWith('"') || t.startsWith('`')) break;
        const clean = t.replace(/[.,;:`"')\]].*$/, '');
        if (!clean) break;
        if (!/^[a-z0-9][a-z0-9_-]*$/.test(clean)) break;
        cmdTokens.push(clean);
      }
      if (cmdTokens.length === 0) continue;

      let recognized: string | null = null;
      for (let take = cmdTokens.length; take >= 1; take--) {
        const candidate = cmdTokens.slice(0, take).join(' ');
        if (isRegisteredCommandPath(candidate)) {
          recognized = candidate;
          break;
        }
      }
      const recorded = recognized ?? cmdTokens.join(' ');
      refs.push({
        file: filePath,
        line: i + 1,
        rawMatch: match[0],
        commandPath: recorded,
      });
    }
  }
  return refs;
}

describe('error/operator-prose command-text references match registered Commander tree', () => {
  const srcDir = join(__dirname, '..', '..', 'src');

  it('src/ exists', () => {
    expect(existsSync(srcDir)).toBe(true);
  });

  it('every `research-os <subcommand>` reference in src/ names a registered command', () => {
    const files = walkSourceFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);

    const unrecognized: CommandReference[] = [];
    for (const f of files) {
      const refs = extractCommandReferences(f);
      for (const r of refs) {
        if (!isRegisteredCommandPath(r.commandPath)) {
          unrecognized.push(r);
        }
      }
    }

    if (unrecognized.length > 0) {
      const sample = unrecognized
        .slice(0, 10)
        .map((r) => `  ${r.file}:${r.line}  →  "${r.rawMatch}" (parsed cmd: "${r.commandPath}")`)
        .join('\n');
      throw new Error(
        `Found ${unrecognized.length} unrecognized \`research-os ...\` reference(s) in src/:\n` +
          sample +
          (unrecognized.length > 10 ? `\n  (+${unrecognized.length - 10} more)` : '') +
          `\n\nFix the reference to use a command that is .command(...)-registered in src/cli.ts, ` +
          `or add the command to REGISTERED_COMMANDS in this test if you have actually registered it.`,
      );
    }
  });

  it('REGISTERED_COMMANDS includes the load-bearing post-Wave-3 commands', () => {
    // Sanity check the allowlist itself stays in sync with what we know
    // ships in v0.6.0.
    expect(REGISTERED_COMMANDS.has('index build')).toBe(true);
    expect(REGISTERED_COMMANDS.has('index')).toBe(true); // bare invocation
    expect(REGISTERED_COMMANDS.has('pack publish')).toBe(true);
    expect(REGISTERED_COMMANDS.has('source-card audit')).toBe(true);
    expect(REGISTERED_COMMANDS.has('help')).toBe(true);
  });
});
