// Long-running CLI commands need optional "I'm still alive" stderr lines so
// operators can tell apart a slow run from a hung run. We do NOT want those
// lines:
//   - to pollute stdout (machine-readable summaries live there),
//   - to appear in non-TTY contexts by default (piping, CI logs, test capture
//     of stdout — fixtures stay stable).
//
// Doctrine (advisor Refinement 4 + 7):
//   - Default = TTY auto-detect on process.stderr.
//   - --no-progress  suppresses progress even in a TTY.
//   - --progress     forces emission even in non-TTY (debug aid).
//   - NO logging framework. NO --verbose / --quiet umbrella (POST-v1 B-D-007).
//   - NO per-call boolean threading from CLI options down through every
//     library entrypoint. Sites import shouldEmitProgress() / emitProgress()
//     directly; the helper reads the explicit-flag signal from environment
//     variables that the CLI sets before invoking the action.
//
// Environment variables (set by the CLI command handler, NOT a public API):
//   RESEARCH_OS_NO_PROGRESS=1      -> shouldEmitProgress() returns false
//   RESEARCH_OS_FORCE_PROGRESS=1   -> shouldEmitProgress() returns true
// Explicit opts.noProgress / opts.forceProgress on the call site take
// priority over the env vars (lets unit tests and call sites override).

export interface ProgressOptions {
  /** Hard suppress progress emission regardless of TTY / env. */
  noProgress?: boolean;
  /** Hard force progress emission even on non-TTY (debug aid). */
  forceProgress?: boolean;
}

function envFlagSet(name: string): boolean {
  const v = process.env[name];
  if (v === undefined) return false;
  if (v === '' || v === '0' || v.toLowerCase() === 'false') return false;
  return true;
}

export function shouldEmitProgress(opts: ProgressOptions = {}): boolean {
  // Explicit per-call opts win over env vars (force > suppress).
  if (opts.forceProgress) return true;
  if (opts.noProgress) return false;
  // Then env-var overrides (force > suppress).
  if (envFlagSet('RESEARCH_OS_FORCE_PROGRESS')) return true;
  if (envFlagSet('RESEARCH_OS_NO_PROGRESS')) return false;
  // Default: TTY auto-detect.
  return Boolean(process.stderr.isTTY);
}

/**
 * Write a single progress line to process.stderr.
 *
 * Never use this for content the operator needs in a captured/piped stdout —
 * stdout is reserved for the command's machine-readable summary so a piped
 * `jq` (or 4-pack regression byte-compare against frozen artifacts) is not
 * touched by progress chatter.
 */
export function emitProgress(message: string, opts: ProgressOptions = {}): void {
  if (!shouldEmitProgress(opts)) return;
  process.stderr.write(message + '\n');
}
