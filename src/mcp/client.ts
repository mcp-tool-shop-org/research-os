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
import { RESEARCH_OS_VERSION } from '../index.js';

const BIN_NAME = 'ollama-intern-mcp';

// B-MCP-001: the tier-budget override (tier_budget_ms_override, the reason
// v0.13.1 exists) is forwarded on ollama_extract calls and attested as applied
// in stderr + the extract receipt — but ollama-intern-mcp < 2.6.0 SILENTLY
// DISCARDS it. We capture the negotiated server version from the MCP initialize
// handshake and emit a ONE-TIME stderr warning (per handle) when an override is
// forwarded to a server below this floor, so the attestation is not silently a
// lie. Display-only — no receipt-schema change, no new handshake/layer.
const TIER_BUDGET_OVERRIDE_FLOOR = '2.6.0';
const TIER_BUDGET_OVERRIDE_ARG = 'tier_budget_ms_override';

// Minimal numeric semver comparison sufficient for the floor check. Parses the
// leading `major.minor.patch` triple (ignoring any prerelease/build suffix) and
// returns negative when `a < b`. Unparseable versions are treated as "unknown"
// by the caller (no warning) rather than guessed.
function parseSemverTriple(v: string): [number, number, number] | null {
  const m = /^\D*?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function semverLessThan(a: string, b: string): boolean {
  const pa = parseSemverTriple(a);
  const pb = parseSemverTriple(b);
  if (!pa || !pb) return false;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] < pb[i]) return true;
    if (pa[i] > pb[i]) return false;
  }
  return false;
}

// Whether `callArgs` carry the tier-budget override. Exported for unit-testing
// the gate without spawning anything.
export function callArgsCarryTierBudgetOverride(callArgs: unknown): boolean {
  return (
    typeof callArgs === 'object' &&
    callArgs !== null &&
    TIER_BUDGET_OVERRIDE_ARG in (callArgs as Record<string, unknown>)
  );
}

// Whether a server at `serverVersion` will SILENTLY discard the tier-budget
// override. A null/undefined or unparseable version is treated as "do not warn"
// — we only warn when we are confident the server predates the floor.
export function serverIgnoresTierBudgetOverride(serverVersion: string | null | undefined): boolean {
  if (typeof serverVersion !== 'string' || serverVersion.trim().length === 0) return false;
  return semverLessThan(serverVersion, TIER_BUDGET_OVERRIDE_FLOOR);
}
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
  // B-MCP-001: one-time guard so the tier-budget-ignored warning is emitted at
  // most once per handle (and thus per CLI invocation), matching the existing
  // one-line `[extract]` stderr convention rather than spamming per call.
  private tierBudgetWarningEmitted = false;

  constructor(options: MCPClientOptions = {}) {
    this.options = options;
  }

  // B-MCP-001: wrap the connected client so the raw `callTool` is intercepted.
  // When an ollama_extract (or any) call forwards tier_budget_ms_override AND
  // the negotiated server version predates the 2.6.0 floor that honors it, emit
  // a single stderr warning — the override is attested as applied but the
  // server will silently discard it. The call itself is forwarded unchanged.
  private wrapClient(client: Client): Client {
    // Arrow functions capture `this` (the handle) lexically — no `const x = this`
    // alias (which @typescript-eslint/no-this-alias forbids). The mutation of
    // `this.tierBudgetWarningEmitted` still persists on the instance, and the
    // forwarded call uses `original.apply(target, args)` so the real client
    // remains the receiver.
    return new Proxy(client, {
      get: (target, prop, receiver) => {
        if (prop === 'callTool') {
          const original = Reflect.get(target, prop, receiver) as Client['callTool'];
          return (...args: Parameters<Client['callTool']>) => {
            try {
              const params = args[0] as { arguments?: unknown } | undefined;
              if (
                !this.tierBudgetWarningEmitted &&
                callArgsCarryTierBudgetOverride(params?.arguments) &&
                serverIgnoresTierBudgetOverride(this.serverVersionString)
              ) {
                this.tierBudgetWarningEmitted = true;
                const sv = this.serverVersionString ?? 'unknown';
                process.stderr.write(
                  `[extract] tier_budget_ms_override forwarded but connected ollama-intern-mcp ${sv} is below ${TIER_BUDGET_OVERRIDE_FLOOR}; the override will be IGNORED by this server version. Upgrade to ollama-intern-mcp >=${TIER_BUDGET_OVERRIDE_FLOOR}.\n`,
                );
              }
            } catch {
              /* never let observability break the actual call */
            }
            return original.apply(target, args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  // Exposed for tests/observability: the negotiated server version captured at
  // handshake (`getServerVersion().version`), or null if unavailable.
  get serverVersionString(): string | null {
    return this.serverVersion;
  }
  private serverVersion: string | null = null;

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
        // A-MCP-002: identity version tracks the package version (single
        // source of truth) instead of a hardcoded literal that silently
        // drifts on every release bump.
        { name: 'research-os', version: RESEARCH_OS_VERSION },
        { capabilities: {} },
      );

    // A-MCP-001: do NOT commit this.client/this.transport until the handshake
    // resolves. Assigning them before awaiting client.connect() meant a
    // handshake rejection left this.client set, so a later connect() would
    // short-circuit (`if (this.client) return ...`) and hand back a
    // non-connected client. Commit on success; null both out on rejection.
    this.connectPromise = (async () => {
      try {
        await client.connect(transport as unknown as Parameters<typeof client.connect>[0]);
      } catch (err) {
        this.client = null;
        this.transport = null;
        this.connectPromise = null;
        throw err;
      }
      // B-MCP-001: capture the negotiated server version from the completed
      // initialize handshake. getServerVersion() is only meaningful after
      // connect() resolves. Tolerate clients that don't expose it (test mocks).
      try {
        const info = (client as Partial<Client>).getServerVersion?.();
        this.serverVersion =
          info && typeof info.version === 'string' ? info.version : null;
      } catch {
        this.serverVersion = null;
      }
      // Return a wrapped client so callTool gets the tier-budget gate. The raw
      // client stays cached internally for close().
      const wrapped = this.wrapClient(client);
      this.client = wrapped;
      this.transport = transport;
      return wrapped;
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
