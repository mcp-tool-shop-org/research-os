// Errors raised by the MCP client substrate. Kept in their own module so the
// claim extractor and any future MCP-backed adapters (Phase 2-5) all share the
// same identity surface.

// Operator-facing install hint. The first line is intentionally phrased so it
// does NOT take the form "research-os <verb> ..." inside a quoted string —
// src/ has a doctrine test (test/cli/error-command-text-references.test.ts)
// that flags any quoted `research-os <token>` as a stale command reference.
// We keep the load-bearing substrings ("ollama-intern-mcp@>=2.6.0",
// "npm install -g ollama-intern-mcp", "OLLAMA_INTERN_MCP_BIN") so downstream
// tests + operator readers can match the key install tokens without drift.
// B-MCP-002: bumped from ^2.3.0 to >=2.6.0 — the tier-budget override
// (tier_budget_ms_override) that v0.13.1 forwards is only honored by
// ollama-intern-mcp >=2.6.0; older servers silently discard it. The version
// substring is hint prose, NOT the locked MCPBinaryNotFoundError CODE identity.
const INSTALL_HINT =
  'ollama-intern-mcp@>=2.6.0 must be installed locally for research-os to extract claims.\n' +
  'Install with: npm install -g ollama-intern-mcp\n' +
  'Or set OLLAMA_INTERN_MCP_BIN to the binary path.';

export class MCPBinaryNotFoundError extends Error {
  readonly name = 'MCPBinaryNotFoundError' as const;
  // Capture the resolved env var (if any) so diagnostic output is unambiguous —
  // a wrong path is a different operator action than a missing binary.
  readonly envVarPath: string | null;

  constructor(envVarPath: string | null) {
    super(MCPBinaryNotFoundError.buildMessage(envVarPath));
    this.envVarPath = envVarPath;
  }

  static buildMessage(envVarPath: string | null): string {
    if (envVarPath !== null) {
      return (
        `OLLAMA_INTERN_MCP_BIN points to '${envVarPath}' but no executable was found there.\n\n` +
        INSTALL_HINT
      );
    }
    return (
      `ollama-intern-mcp binary not found on PATH.\n\n` +
      INSTALL_HINT
    );
  }
}

export const INSTALL_HINT_TEXT = INSTALL_HINT;
