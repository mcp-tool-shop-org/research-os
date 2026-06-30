import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  discoverBinary,
  type MCPBinaryDiscoveryEnv,
} from '../src/mcp/client.js';
import {
  INSTALL_HINT_TEXT,
  MCPBinaryNotFoundError,
} from '../src/mcp/errors.js';

const isWindows = process.platform === 'win32';

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-mcp-discovery-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

// Create a placeholder "binary" file. Discovery only checks that the path
// resolves to a regular file, so this is enough to exercise the contract on
// both POSIX and Windows.
async function makeFakeBinary(name: string): Promise<string> {
  const fullName = isWindows && !name.endsWith('.exe') && !name.endsWith('.cmd') && !name.endsWith('.bat')
    ? `${name}.cmd`
    : name;
  const path = join(workDir, fullName);
  await writeFile(path, '#!/bin/sh\necho fake\n', 'utf8');
  if (!isWindows) {
    // Mark it executable on POSIX so future tightening of the discovery
    // contract (executable bit) keeps working. Not load-bearing today.
    await chmod(path, 0o755);
  }
  return path;
}

describe('discoverBinary', () => {
  it('returns env-source path when OLLAMA_INTERN_MCP_BIN points to a real file', async () => {
    const binPath = await makeFakeBinary('ollama-intern-mcp');
    const env: MCPBinaryDiscoveryEnv = {
      OLLAMA_INTERN_MCP_BIN: binPath,
      PATH: '',
    };
    const result = discoverBinary(env);
    expect(result.source).toBe('env');
    expect(result.path).toBe(binPath);
  });

  it('throws MCPBinaryNotFoundError when OLLAMA_INTERN_MCP_BIN points to a missing file', () => {
    const env: MCPBinaryDiscoveryEnv = {
      OLLAMA_INTERN_MCP_BIN: join(workDir, 'definitely-not-here'),
      PATH: '',
    };
    expect(() => discoverBinary(env)).toThrow(MCPBinaryNotFoundError);
    try {
      discoverBinary(env);
    } catch (err) {
      // The env-var-pointed path appears literally in the message so the
      // operator sees exactly which path was wrong vs missing-on-PATH.
      expect((err as Error).message).toContain('definitely-not-here');
      // And the install hint follows.
      expect((err as Error).message).toContain(INSTALL_HINT_TEXT);
    }
  });

  it('returns path-source result when PATH contains a real binary', async () => {
    const binPath = await makeFakeBinary('ollama-intern-mcp');
    const env: MCPBinaryDiscoveryEnv = {
      PATH: workDir,
      // On Windows, PATHEXT must include .cmd so the candidate matches the
      // file we wrote (makeFakeBinary suffixed it). On POSIX, the bare name
      // is enough.
      ...(isWindows ? { PATHEXT: '.com;.exe;.bat;.cmd' } : {}),
    };
    const result = discoverBinary(env);
    expect(result.source).toBe('path');
    expect(result.path).toBe(binPath);
  });

  it('throws MCPBinaryNotFoundError with install hint when no env var and PATH is empty', () => {
    const env: MCPBinaryDiscoveryEnv = { PATH: '' };
    expect(() => discoverBinary(env)).toThrow(MCPBinaryNotFoundError);
    try {
      discoverBinary(env);
    } catch (err) {
      expect((err as Error).message).toContain('not found on PATH');
      expect((err as Error).message).toContain(INSTALL_HINT_TEXT);
    }
  });

  it('throws MCPBinaryNotFoundError when PATH directories contain no matching binary', async () => {
    // Empty workDir on PATH, no binary planted.
    const env: MCPBinaryDiscoveryEnv = {
      PATH: workDir,
      ...(isWindows ? { PATHEXT: '.com;.exe;.bat;.cmd' } : {}),
    };
    expect(() => discoverBinary(env)).toThrow(MCPBinaryNotFoundError);
    try {
      discoverBinary(env);
    } catch (err) {
      expect((err as Error).message).toContain(INSTALL_HINT_TEXT);
    }
  });
});

describe('MCPBinaryNotFoundError', () => {
  it('builds an env-var-specific message when envVarPath supplied', () => {
    const err = new MCPBinaryNotFoundError('/explicit/path');
    expect(err.envVarPath).toBe('/explicit/path');
    expect(err.message).toContain("'/explicit/path'");
    expect(err.message).toContain(INSTALL_HINT_TEXT);
  });

  it('builds a PATH-not-found message when envVarPath is null', () => {
    const err = new MCPBinaryNotFoundError(null);
    expect(err.envVarPath).toBeNull();
    expect(err.message).toContain('not found on PATH');
    expect(err.message).toContain(INSTALL_HINT_TEXT);
  });

  it('exposes the install hint constant carrying the three load-bearing install tokens', () => {
    // The exact wording around `research-os` was tweaked to avoid tripping
    // the `research-os <subcommand>` doctrine regex in
    // test/cli/error-command-text-references.test.ts — but the three
    // operator-relevant substrings (the npm dep name, the install command,
    // and the env-var override path) remain present.
    expect(INSTALL_HINT_TEXT).toContain('ollama-intern-mcp@>=2.6.0');
    expect(INSTALL_HINT_TEXT).toContain('research-os');
    expect(INSTALL_HINT_TEXT).toContain('npm install -g ollama-intern-mcp');
    expect(INSTALL_HINT_TEXT).toContain('OLLAMA_INTERN_MCP_BIN');
  });
});
