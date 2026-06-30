// Stage B regression — B-MCP-001 (mcp/client.ts tier-budget floor warning) +
// B-MCP-002 (errors.ts INSTALL_HINT version bump).
//
// B-MCP-001 invariant: the tier-budget override (tier_budget_ms_override) is
// forwarded on ollama_extract calls and attested as APPLIED in stderr + the
// extract receipt — but ollama-intern-mcp < 2.6.0 SILENTLY DISCARDS it. The
// handle captures the negotiated server version from the initialize handshake
// and emits a ONE-TIME stderr warning when an override is forwarded to a server
// below the 2.6.0 floor, so the attestation isn't silently a lie.
//   GAP half  — a server below 2.6.0 receiving a callTool that carries
//               tier_budget_ms_override produces exactly one stderr warning.
//   HAPPY half — a server at/above 2.6.0 (or a call with no override) produces
//               NO such warning; the call is forwarded unchanged either way.
//
// B-MCP-002 invariant: INSTALL_HINT pins a version floor; it must reflect the
// >=2.6.0 the tier-budget feature requires, not the stale ^2.3.0.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import {
  MCPClientHandle,
  callArgsCarryTierBudgetOverride,
  serverIgnoresTierBudgetOverride,
} from '../../src/mcp/client.js';
import { INSTALL_HINT_TEXT } from '../../src/mcp/errors.js';

// In-process transport that drives a full initialize handshake without spawning
// a subprocess, advertising a configurable serverInfo.version, and answering
// any subsequent (e.g. callTool) request with an empty result so callTool
// resolves.
function makeFakeTransport(serverVersion: string): {
  start(): Promise<void>;
  send(message: unknown): Promise<void>;
  close(): Promise<void>;
  onmessage?: (m: unknown) => void;
  onclose?: () => void;
  onerror?: (e: Error) => void;
} {
  const t: ReturnType<typeof makeFakeTransport> = {
    async start() {
      /* no-op: handshake always succeeds */
    },
    async send(message: unknown) {
      const msg = message as { id?: number; method?: string };
      if (msg.id === undefined) return;
      if (msg.method === 'initialize') {
        queueMicrotask(() => {
          t.onmessage?.({
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: {},
              serverInfo: { name: 'ollama-intern-mcp', version: serverVersion },
            },
          });
        });
        return;
      }
      // Any other request (e.g. tools/call) — answer with a benign result so
      // the awaited callTool resolves.
      queueMicrotask(() => {
        t.onmessage?.({
          jsonrpc: '2.0',
          id: msg.id,
          result: { content: [] },
        });
      });
    },
    async close() {
      t.onclose?.();
    },
  };
  return t;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tier-budget floor pure helpers (B-MCP-001)', () => {
  it('detects tier_budget_ms_override presence in callTool arguments', () => {
    expect(callArgsCarryTierBudgetOverride({ tier_budget_ms_override: 12000 })).toBe(true);
    expect(callArgsCarryTierBudgetOverride({ text: 'x' })).toBe(false);
    expect(callArgsCarryTierBudgetOverride(undefined)).toBe(false);
    expect(callArgsCarryTierBudgetOverride(null)).toBe(false);
  });

  it('flags servers below the 2.6.0 floor and clears those at/above it', () => {
    expect(serverIgnoresTierBudgetOverride('2.5.9')).toBe(true);
    expect(serverIgnoresTierBudgetOverride('2.3.0')).toBe(true);
    expect(serverIgnoresTierBudgetOverride('1.0.0')).toBe(true);
    // GOOD half — floor and above never warn.
    expect(serverIgnoresTierBudgetOverride('2.6.0')).toBe(false);
    expect(serverIgnoresTierBudgetOverride('2.6.1')).toBe(false);
    expect(serverIgnoresTierBudgetOverride('3.0.0')).toBe(false);
    // Unknown/empty/unparseable → never warn (no false positives).
    expect(serverIgnoresTierBudgetOverride(null)).toBe(false);
    expect(serverIgnoresTierBudgetOverride(undefined)).toBe(false);
    expect(serverIgnoresTierBudgetOverride('')).toBe(false);
    expect(serverIgnoresTierBudgetOverride('garbage')).toBe(false);
  });
});

describe('MCPClientHandle tier-budget floor warning (B-MCP-001)', () => {
  it('warns ONCE when override is forwarded to a sub-2.6.0 server (GAP half)', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const handle = new MCPClientHandle({
      binaryPath: '/fake/ollama-intern-mcp',
      transportFactory: () => makeFakeTransport('2.5.0') as never,
    });
    const client = await handle.connect();
    expect(client).toBeInstanceOf(Client);
    expect(handle.serverVersionString).toBe('2.5.0');

    await client.callTool({
      name: 'ollama_extract',
      arguments: { text: 'hi', tier_budget_ms_override: 9000 },
    });
    // Second forwarded override must NOT warn again (one-time per handle).
    await client.callTool({
      name: 'ollama_extract',
      arguments: { text: 'again', tier_budget_ms_override: 9000 },
    });

    const warnLines = stderr.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.includes('tier_budget_ms_override') && l.includes('IGNORED'));
    expect(warnLines).toHaveLength(1);
    expect(warnLines[0]).toContain('[extract]');
    expect(warnLines[0]).toContain('2.5.0');
    expect(warnLines[0]).toContain('2.6.0');
    await handle.close();
  });

  it('does NOT warn for a >=2.6.0 server or a call without the override (HAPPY half)', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    // Server at the floor — override honored, no warning.
    const okHandle = new MCPClientHandle({
      binaryPath: '/fake/ollama-intern-mcp',
      transportFactory: () => makeFakeTransport('2.6.0') as never,
    });
    const okClient = await okHandle.connect();
    await okClient.callTool({
      name: 'ollama_extract',
      arguments: { text: 'hi', tier_budget_ms_override: 9000 },
    });
    await okHandle.close();

    // Sub-floor server but a call with NO override — nothing to warn about.
    const noOverrideHandle = new MCPClientHandle({
      binaryPath: '/fake/ollama-intern-mcp',
      transportFactory: () => makeFakeTransport('2.5.0') as never,
    });
    const noOverrideClient = await noOverrideHandle.connect();
    await noOverrideClient.callTool({
      name: 'ollama_extract',
      arguments: { text: 'hi' },
    });
    await noOverrideHandle.close();

    const warnLines = stderr.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.includes('tier_budget_ms_override') && l.includes('IGNORED'));
    expect(warnLines).toHaveLength(0);
  });
});

describe('INSTALL_HINT version floor (B-MCP-002)', () => {
  it('pins ollama-intern-mcp at the >=2.6.0 tier-budget floor, not the stale ^2.3.0', () => {
    expect(INSTALL_HINT_TEXT).toContain('ollama-intern-mcp@>=2.6.0');
    expect(INSTALL_HINT_TEXT).not.toContain('@^2.3.0');
    // Load-bearing install tokens preserved.
    expect(INSTALL_HINT_TEXT).toContain('npm install -g ollama-intern-mcp');
    expect(INSTALL_HINT_TEXT).toContain('OLLAMA_INTERN_MCP_BIN');
  });
});
