// MCP client substrate for research-os.
//
// research-os spawns ollama-intern-mcp as a stdio subprocess on demand. One
// spawn per CLI invocation: the client is created when the first extract call
// needs it, then closed at process exit. NOT per-claim. NOT a daemon.
//
// Binary discovery order:
//   1. OLLAMA_INTERN_MCP_BIN env var (explicit path).
//   2. PATH lookup for `ollama-intern-mcp`.
//   3. Fail loud with MCPBinaryNotFoundError.

import { existsSync, statSync } from 'node:fs';
import { delimiter, join, isAbsolute } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { MCPBinaryNotFoundError } from './errors.js';

const BIN_NAME = 'ollama-intern-mcp';
// Windows resolves bare executable names against this list when PATH lookup
// happens. We replicate that locally so OLLAMA_INTERN_MCP_BIN-less discovery
// works the same way Node's spawn does on both platforms.
const WINDOWS_PATH_EXTS = ['.cmd', '.exe', '.bat', ''] as const;

export interface MCPBinaryDiscoveryEnv {
  OLLAMA_INTERN_MCP_BIN?: string;
  PATH?: string;
  PATHEXT?: string;
}

export interface DiscoveryResult {
  path: string;
  source: 'env' | 'path';
}

function isExecutable(path: string): boolean {
  try {
    const s = statSync(path);
    return s.isFile();
  } catch {
    return false;
  }
}

function isWindows(): boolean {
  return process.platform === 'win32';
}

function candidateNamesFor(name: string, env: MCPBinaryDiscoveryEnv): string[] {
  if (!isWindows()) return [name];
  // PATHEXT honored when supplied, else fall back to a conservative default.
  const exts = (env.PATHEXT ?? WINDOWS_PATH_EXTS.join(';'))
    .split(';')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ext of [...exts, '']) {
    const candidate = ext ? `${name}${ext}` : name;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  }
  return out;
}

// Resolve the ollama-intern-mcp binary path. Exported for unit-testing the
// discovery contract without spawning anything.
export function discoverBinary(env: MCPBinaryDiscoveryEnv = process.env as MCPBinaryDiscoveryEnv): DiscoveryResult {
  const explicit = env.OLLAMA_INTERN_MCP_BIN;
  if (explicit && explicit.trim().length > 0) {
    // Explicit path: must exist and be a file. We do NOT walk PATH from here —
    // an explicit pointer that's wrong should fail loud.
    const explicitPath = explicit.trim();
    if (existsSync(explicitPath) && isExecutable(explicitPath)) {
      return { path: explicitPath, source: 'env' };
    }
    throw new MCPBinaryNotFoundError(explicitPath);
  }

  const path = env.PATH ?? '';
  if (path.length === 0) throw new MCPBinaryNotFoundError(null);

  const candidates = candidateNamesFor(BIN_NAME, env);
  const dirs = path.split(delimiter).filter((d) => d.length > 0);
  for (const dir of dirs) {
    for (const c of candidates) {
      const full = isAbsolute(c) ? c : join(dir, c);
      if (existsSync(full) && isExecutable(full)) {
        return { path: full, source: 'path' };
      }
    }
  }
  throw new MCPBinaryNotFoundError(null);
}

export interface MCPClientOptions {
  // Override discovery (used by tests).
  binaryPath?: string;
  // Override the env passed to the subprocess. Defaults to inheriting the
  // current process env so OLLAMA_HOST and friends reach the MCP server.
  env?: Record<string, string>;
  // Override the SDK client construction (used by tests).
  clientFactory?: () => Client;
  // Override the transport (used by tests — mocks the stdio subprocess).
  transportFactory?: (cmd: string, env: Record<string, string>) => StdioClientTransportLike;
  // Discovery env (used by tests; defaults to process.env).
  discoveryEnv?: MCPBinaryDiscoveryEnv;
}

// Minimal structural interface to allow tests to substitute a no-spawn transport.
export interface StdioClientTransportLike {
  close(): Promise<void>;
}

// Manages a single MCP subprocess for the lifetime of the CLI invocation.
// Constructors are cheap — the subprocess is not spawned until connect() runs.
export class MCPClientHandle {
  private readonly options: MCPClientOptions;
  private client: Client | null = null;
  private transport: StdioClientTransportLike | null = null;
  private connectPromise: Promise<Client> | null = null;
  private closed = false;

  constructor(options: MCPClientOptions = {}) {
    this.options = options;
  }

  // Spawn the subprocess and complete the MCP initialization handshake. Idempotent —
  // concurrent callers share the in-flight connect; subsequent calls return the
  // cached client.
  connect(): Promise<Client> {
    if (this.closed) {
      return Promise.reject(new Error('MCPClientHandle: already closed'));
    }
    if (this.client) return Promise.resolve(this.client);
    if (this.connectPromise) return this.connectPromise;

    const env =
      this.options.env ??
      // Inherit the parent env so OLLAMA_HOST + any Ollama-relevant vars reach
      // the subprocess. We pass only string values per Node's spawn contract.
      Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => typeof v === 'string'),
      ) as Record<string, string>;

    const binaryPath =
      this.options.binaryPath ??
      discoverBinary(this.options.discoveryEnv).path;

    const transport =
      this.options.transportFactory?.(binaryPath, env) ??
      new StdioClientTransport({
        command: binaryPath,
        env,
        // Inherit stderr so any startup failure prints to the operator's
        // console rather than disappearing into the void.
        stderr: 'inherit',
      });

    const client =
      this.options.clientFactory?.() ??
      new Client(
        { name: 'research-os', version: '0.10.0' },
        { capabilities: {} },
      );

    this.transport = transport;
    this.client = client;

    this.connectPromise = (async () => {
      await client.connect(transport as unknown as Parameters<typeof client.connect>[0]);
      return client;
    })();
    return this.connectPromise;
  }

  async close(): Promise<void> {
    this.closed = true;
    const t = this.transport;
    const c = this.client;
    this.transport = null;
    this.client = null;
    this.connectPromise = null;
    // Close the SDK client first (it owns the request mailbox), then the
    // transport (it owns the subprocess).
    if (c) {
      try {
        // The SDK Client's close drains and closes the transport too, but the
        // contract is "always safe to call". Swallow secondary errors.
        await c.close();
      } catch {
        /* swallow — already best-effort cleanup */
      }
    }
    if (t) {
      try {
        await t.close();
      } catch {
        /* swallow */
      }
    }
  }

  get isClosed(): boolean {
    return this.closed;
  }
}
