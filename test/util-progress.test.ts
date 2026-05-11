import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emitProgress, shouldEmitProgress } from '../src/util/progress.js';

// We toggle TTY + env vars per case. Save and restore originals so other
// suites that read process.stderr.isTTY / env are not contaminated.
const originalIsTTY = process.stderr.isTTY;
const originalNoProgress = process.env.RESEARCH_OS_NO_PROGRESS;
const originalForceProgress = process.env.RESEARCH_OS_FORCE_PROGRESS;

function setIsTTY(v: boolean): void {
  // Property is writable on the WriteStream — assign directly.
  Object.defineProperty(process.stderr, 'isTTY', {
    configurable: true,
    writable: true,
    value: v,
  });
}

beforeEach(() => {
  delete process.env.RESEARCH_OS_NO_PROGRESS;
  delete process.env.RESEARCH_OS_FORCE_PROGRESS;
});

afterEach(() => {
  Object.defineProperty(process.stderr, 'isTTY', {
    configurable: true,
    writable: true,
    value: originalIsTTY,
  });
  if (originalNoProgress !== undefined) process.env.RESEARCH_OS_NO_PROGRESS = originalNoProgress;
  else delete process.env.RESEARCH_OS_NO_PROGRESS;
  if (originalForceProgress !== undefined) process.env.RESEARCH_OS_FORCE_PROGRESS = originalForceProgress;
  else delete process.env.RESEARCH_OS_FORCE_PROGRESS;
});

describe('shouldEmitProgress — TTY × flag combinations', () => {
  it('TTY=true + no flags → emits', () => {
    setIsTTY(true);
    expect(shouldEmitProgress()).toBe(true);
  });

  it('TTY=false + no flags → suppresses (the silent-pipe default)', () => {
    setIsTTY(false);
    expect(shouldEmitProgress()).toBe(false);
  });

  it('TTY=true + opts.noProgress → suppresses', () => {
    setIsTTY(true);
    expect(shouldEmitProgress({ noProgress: true })).toBe(false);
  });

  it('TTY=false + opts.forceProgress → emits (non-TTY debug aid)', () => {
    setIsTTY(false);
    expect(shouldEmitProgress({ forceProgress: true })).toBe(true);
  });

  it('opts.forceProgress beats opts.noProgress when both are set (advisor: force > suppress)', () => {
    setIsTTY(true);
    expect(shouldEmitProgress({ forceProgress: true, noProgress: true })).toBe(true);
  });

  it('TTY=true + RESEARCH_OS_NO_PROGRESS=1 → suppresses (env wires --no-progress)', () => {
    setIsTTY(true);
    process.env.RESEARCH_OS_NO_PROGRESS = '1';
    expect(shouldEmitProgress()).toBe(false);
  });

  it('TTY=false + RESEARCH_OS_FORCE_PROGRESS=1 → emits (env wires --progress)', () => {
    setIsTTY(false);
    process.env.RESEARCH_OS_FORCE_PROGRESS = '1';
    expect(shouldEmitProgress()).toBe(true);
  });

  it('RESEARCH_OS_NO_PROGRESS=0 / empty / false → does not suppress (truthy check)', () => {
    setIsTTY(true);
    process.env.RESEARCH_OS_NO_PROGRESS = '0';
    expect(shouldEmitProgress()).toBe(true);
    process.env.RESEARCH_OS_NO_PROGRESS = '';
    expect(shouldEmitProgress()).toBe(true);
    process.env.RESEARCH_OS_NO_PROGRESS = 'false';
    expect(shouldEmitProgress()).toBe(true);
  });

  it('explicit opts.noProgress wins over RESEARCH_OS_FORCE_PROGRESS env (call-site override)', () => {
    setIsTTY(false);
    process.env.RESEARCH_OS_FORCE_PROGRESS = '1';
    // Per-call opts evaluated first: forceProgress is undefined, noProgress=true → suppress.
    expect(shouldEmitProgress({ noProgress: true })).toBe(false);
  });
});

describe('emitProgress — write target', () => {
  it('writes to process.stderr (NOT process.stdout) when enabled', () => {
    setIsTTY(true);
    // Wrap with a direct method-replacement rather than vi.spyOn — vitest's
    // worker captures process.stderr at startup, and depending on harness
    // mode the spy may not observe calls routed through that wrapper.
    // Replace the method on the stream object directly and record calls
    // by hand; this works regardless of vitest's stderr-capture mode.
    const stderrCalls: unknown[] = [];
    const stdoutCalls: unknown[] = [];
    const origStderr = process.stderr.write.bind(process.stderr);
    const origStdout = process.stdout.write.bind(process.stdout);
    process.stderr.write = ((chunk: unknown) => {
      stderrCalls.push(chunk);
      return true;
    }) as unknown as typeof process.stderr.write;
    process.stdout.write = ((chunk: unknown) => {
      stdoutCalls.push(chunk);
      return true;
    }) as unknown as typeof process.stdout.write;
    try {
      // forceProgress bypasses any TTY-detection variance in the vitest worker.
      // The contract under test here is "writes go to stderr, not stdout".
      emitProgress('hello', { forceProgress: true });
    } finally {
      process.stderr.write = origStderr as unknown as typeof process.stderr.write;
      process.stdout.write = origStdout as unknown as typeof process.stdout.write;
    }
    expect(stderrCalls).toEqual(['hello\n']);
    expect(stdoutCalls).toEqual([]);
  });

  it('writes nothing when suppressed (no stderr call)', () => {
    setIsTTY(false);
    const stderrCalls: unknown[] = [];
    const origStderr = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: unknown) => {
      stderrCalls.push(chunk);
      return true;
    }) as unknown as typeof process.stderr.write;
    try {
      emitProgress('hidden');
    } finally {
      process.stderr.write = origStderr as unknown as typeof process.stderr.write;
    }
    expect(stderrCalls).toEqual([]);
  });

  it('respects opts.noProgress at the call site', () => {
    setIsTTY(true);
    const stderrCalls: unknown[] = [];
    const origStderr = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: unknown) => {
      stderrCalls.push(chunk);
      return true;
    }) as unknown as typeof process.stderr.write;
    try {
      emitProgress('quiet', { noProgress: true });
    } finally {
      process.stderr.write = origStderr as unknown as typeof process.stderr.write;
    }
    expect(stderrCalls).toEqual([]);
  });
});
