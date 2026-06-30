// Stage A regression — A-MCP-001 + A-MCP-002 (mcp/client.ts connect()).
//
// A-MCP-001 invariant: connect() must only commit this.client/this.transport
// AFTER the handshake resolves. The old code assigned them BEFORE awaiting
// client.connect(transport); a handshake rejection therefore left this.client
// set, so a later connect() short-circuited (`if (this.client) return`) and
// handed back a poisoned, non-connected client.
//   BAD half  — a connect() whose handshake rejects must NOT leave a cached
//               client; a second connect() must run a fresh handshake (and
//               here succeed), returning a genuinely connected client.
//   GOOD half — a connect() whose handshake resolves caches the client so a
//               second connect() returns the same connected instance.
//
// A-MCP-002 invariant: the MCP client identity version must track
// RESEARCH_OS_VERSION, not a hardcoded literal that drifts each release.
//   BAD half  — the identity version must equal RESEARCH_OS_VERSION (a stale
//               hardcoded '0.13.1' would mismatch once the package bumps).
//   GOOD half — RESEARCH_OS_VERSION is a non-empty semver-ish string.

import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { MCPClientHandle } from '../../src/mcp/client.js';
import { RESEARCH_OS_VERSION } from '../../src/index.js';

// Minimal in-process transport implementing the SDK Transport contract well
// enough to drive a full initialize handshake without spawning a subprocess.
// `mode: 'reject'` simulates a transport that fails to start (handshake
// rejection); `mode: 'ok'` answers the initialize request with a valid result.
interface FakeMode {
  mode: 'ok' | 'reject';
}

function makeFakeTransport({ mode }: FakeMode): {
  start(): Promise<void>;
  send(message: unknown): Promise<void>;
  close(): Promise<void>;
  onmessage?: (m: unknown) => void;
  onclose?: () => void;
  onerror?: (e: Error) => void;
} {
  const t: ReturnType<typeof makeFakeTransport> = {
    async start() {
      if (mode === 'reject') {
        throw new Error('fake transport: handshake refused');
      }
    },
    async send(message: unknown) {
      // Echo a valid initialize result back to the client so connect() resolves.
      const msg = message as { id?: number; method?: string };
      if (msg.method === 'initialize' && msg.id !== undefined) {
        queueMicrotask(() => {
          t.onmessage?.({
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: {},
              serverInfo: { name: 'fake-server', version: '0.0.0' },
            },
          });
        });
      }
    },
    async close() {
      t.onclose?.();
    },
  };
  return t;
}

describe('MCPClientHandle.connect (A-MCP-001 / A-MCP-002)', () => {
  it('does not poison the cache when the first handshake rejects (BAD half)', async () => {
    let call = 0;
    const handle = new MCPClientHandle({
      binaryPath: '/fake/ollama-intern-mcp',
      // First connect() gets a rejecting transport; second gets a good one.
      transportFactory: () =>
        makeFakeTransport({ mode: call++ === 0 ? 'reject' : 'ok' }) as never,
    });

    await expect(handle.connect()).rejects.toThrow(/handshake refused/);

    // The poisoned-client bug: a second connect() would short-circuit on the
    // stale this.client and return a non-connected client. With the fix the
    // second connect() runs a fresh handshake and returns a real client.
    const client = await handle.connect();
    expect(client).toBeInstanceOf(Client);
    expect(client.getServerVersion()).toBeDefined();
    await handle.close();
  });

  it('caches the client across connect() calls once the handshake resolves (GOOD half)', async () => {
    const handle = new MCPClientHandle({
      binaryPath: '/fake/ollama-intern-mcp',
      transportFactory: () => makeFakeTransport({ mode: 'ok' }) as never,
    });
    const a = await handle.connect();
    const b = await handle.connect();
    expect(a).toBe(b);
    await handle.close();
  });

  it('uses RESEARCH_OS_VERSION for the client identity, not a hardcoded literal', async () => {
    const handle = new MCPClientHandle({
      binaryPath: '/fake/ollama-intern-mcp',
      transportFactory: () => makeFakeTransport({ mode: 'ok' }) as never,
    });
    const client = await handle.connect();
    // _clientInfo is the {name, version} passed to the Client constructor.
    const info = (client as unknown as { _clientInfo: { version: string } })._clientInfo;
    expect(info.version).toBe(RESEARCH_OS_VERSION);
    expect(RESEARCH_OS_VERSION.length).toBeGreaterThan(0);
    await handle.close();
  });
});
