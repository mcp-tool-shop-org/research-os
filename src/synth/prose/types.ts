// ── R-018 — Planner-timeout configuration (v0.12.1) ──────────────────────────
//
// R-018 makes the existing synth prose planner timeout configurable and
// visible. It does NOT change synthesis logic, model routing, defense
// layers, gate law, recovery action graphs, or default timeout behavior.
//
// Default behavior remains 15000ms. The override is operator-discoverable
// via `--help`, surfaces in logs and synthesis metadata, and fails clearly
// on invalid values.
//
// The 15000ms default matches the de-facto Instant-tier budget the v0.4
// operator-aloneness gate hit when prose generation timed out. R-018
// research-os-side wraps each MCP `callTool` with a Promise.race against
// `setTimeout(reject, plannerTimeoutMs)`; the failure shape matches R-010's
// `classifyFallbackCause` regex (elapsed=…ms / budget=…ms) so the existing
// TIER_TIMEOUT visibility path continues to surface a cause downstream.

/** Default planner timeout when no override is set (matches v0.4 Instant-tier budget). */
export const DEFAULT_PLANNER_TIMEOUT_MS = 15000;

/** Minimum accepted planner timeout. Zero is rejected — zero-budget calls are useless. */
export const MIN_PLANNER_TIMEOUT_MS = 1;

/**
 * Upper safety rail for the planner timeout — 10 minutes. Above this is
 * almost certainly an operator typo (e.g. forgot a "ms" suffix and intended
 * `--planner-timeout-ms 30` thinking minutes, etc.). Documented in --help.
 */
export const MAX_PLANNER_TIMEOUT_MS = 600_000;

/**
 * Closed-enum vocabulary for the source of an active planner-timeout value.
 * - `default`: neither CLI flag nor env var was set; DEFAULT_PLANNER_TIMEOUT_MS is in effect.
 * - `cli_flag`: --planner-timeout-ms supplied on the CLI.
 * - `env_var`: RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS supplied in the environment.
 *
 * Precedence (CLI > env > default) is encoded in `resolvePlannerTimeout`.
 */
export const PLANNER_TIMEOUT_SOURCES = ['default', 'cli_flag', 'env_var'] as const;
export type PlannerTimeoutSource = (typeof PLANNER_TIMEOUT_SOURCES)[number];

/** A resolved planner-timeout configuration: the value in milliseconds plus its origin. */
export interface PlannerTimeoutConfig {
  value: number;
  source: PlannerTimeoutSource;
}

/** Discriminated-union result for the pure validator. */
export type PlannerTimeoutValidationResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

/** Discriminated-union result for the precedence resolver. */
export type PlannerTimeoutResolutionResult =
  | { ok: true; value: number; source: PlannerTimeoutSource }
  | { ok: false; error: string };

/**
 * Validate a raw planner-timeout value (from CLI flag or env var). The
 * surface label is included verbatim in the error message so operators
 * see which knob they got wrong. Accepts only base-10 integers; rejects
 * negatives, zero, unit suffixes, and values above MAX_PLANNER_TIMEOUT_MS.
 *
 * Pure — no side effects. Tested in isolation in
 * test/r018-planner-timeout-override.test.ts.
 */
export function validatePlannerTimeoutValue(
  raw: string,
  surface: Exclude<PlannerTimeoutSource, 'default'>,
): PlannerTimeoutValidationResult {
  const surfaceLabel =
    surface === 'cli_flag' ? '--planner-timeout-ms' : 'RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS';
  // Strict base-10 integer check. parseInt('30000ms', 10) === 30000 would
  // silently accept the unit-suffixed string; we reject any trailing
  // non-digit (other than a leading minus) explicitly so operators see the
  // typo loudly instead of getting a misleading default.
  if (!/^-?\d+$/.test(raw)) {
    return {
      ok: false,
      error: `${surfaceLabel}: expected positive integer (milliseconds), got '${raw}'. Valid range: ${MIN_PLANNER_TIMEOUT_MS}–${MAX_PLANNER_TIMEOUT_MS}.`,
    };
  }
  const n = parseInt(raw, 10);
  if (n < MIN_PLANNER_TIMEOUT_MS) {
    return {
      ok: false,
      error: `${surfaceLabel}: value '${raw}' is below minimum (${MIN_PLANNER_TIMEOUT_MS}ms). Zero and negative values are not accepted.`,
    };
  }
  if (n > MAX_PLANNER_TIMEOUT_MS) {
    return {
      ok: false,
      error: `${surfaceLabel}: value '${raw}' exceeds the safety upper bound (${MAX_PLANNER_TIMEOUT_MS}ms = 10 minutes). Operators rarely need more than 1–2 minutes; values this large are usually typos.`,
    };
  }
  return { ok: true, value: n };
}

/**
 * Resolve the active planner-timeout value from CLI flag + env var sources,
 * with CLI > env > default precedence. The CLI flag is passed as a
 * pre-coerced number (commander already runs `validatePlannerTimeoutValue`
 * on the flag value through the cli.ts surface); the env var is the raw
 * string so this function can run the same validator and emit a
 * surface-naming error.
 *
 * Empty string env var is treated as unset (matches conventional shell
 * behavior where `export FOO=` clears the variable's effective value).
 */
export function resolvePlannerTimeout(args: {
  cliFlagMs: number | undefined;
  envVar: string | undefined;
}): PlannerTimeoutResolutionResult {
  if (args.cliFlagMs !== undefined) {
    // CLI was already validated by commander on the way in; defend
    // against caller-side mistakes by re-running the validator anyway.
    const check = validatePlannerTimeoutValue(String(args.cliFlagMs), 'cli_flag');
    if (!check.ok) return check;
    return { ok: true, value: check.value, source: 'cli_flag' };
  }
  if (args.envVar !== undefined && args.envVar !== '') {
    const check = validatePlannerTimeoutValue(args.envVar, 'env_var');
    if (!check.ok) return check;
    return { ok: true, value: check.value, source: 'env_var' };
  }
  return { ok: true, value: DEFAULT_PLANNER_TIMEOUT_MS, source: 'default' };
}

/**
 * Format a single-line, grep-friendly stderr summary of the active
 * planner-timeout configuration. Emitted by section-run.ts / cli.ts
 * before prose generation begins so operators can grep for
 * `planner_timeout_ms=` to see what budget was in effect for a given
 * synth section invocation.
 *
 * Shape: `[synth] planner_timeout_ms=<N> source=<default|cli_flag|env_var>`
 *
 * Single line — no embedded newlines, so it survives Windows + POSIX
 * stderr piping uniformly.
 */
export function formatPlannerTimeoutLogLine(config: PlannerTimeoutConfig): string {
  return `[synth] planner_timeout_ms=${config.value} source=${config.source}`;
}

/**
 * Decorate a ProseCallToolClient with a per-callTool Promise.race timeout.
 *
 * On timeout, rejects with a `TIER_TIMEOUT`-shaped Error whose message
 * embeds `elapsed=<N>ms` and `budget=<N>ms` so R-010's
 * `classifyFallbackCause` regex extracts numbers unchanged and the
 * AI-advisor TIER_TIMEOUT visibility path keeps working downstream.
 *
 * Caller-side errors (transport, parse, etc.) pass through unchanged —
 * the wrapper only ever introduces a new error on the timeout edge.
 */
export function wrapClientWithTimeout(
  client: ProseCallToolClient,
  timeoutMs: number,
): ProseCallToolClient {
  return {
    async callTool(params) {
      const startedAt = Date.now();
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const elapsed = Date.now() - startedAt;
          reject(
            new Error(
              `TIER_TIMEOUT: synth prose MCP call (${params.name}) timed out — elapsed=${elapsed}ms budget=${timeoutMs}ms`,
            ),
          );
        }, timeoutMs);
        client.callTool(params).then(
          (resp) => {
            clearTimeout(timer);
            resolve(resp);
          },
          (err) => {
            clearTimeout(timer);
            reject(err);
          },
        );
      });
    },
  };
}

// ── End R-018 ────────────────────────────────────────────────────────────────

export const PROSE_ROLES = [
  'answer',
  'evidence',
  'qualifier',
  'caveat',
  'implication',
  'thin_evidence',
] as const;

export type ProseRole = (typeof PROSE_ROLES)[number];

// Planner-only role: 'unused' means accepted but does not help answer this section purpose.
export type PlannerRole = ProseRole | 'unused';

export const VERIFIER_DECISIONS = [
  'faithful',
  'unsupported_connective',
  'omits_critical_qualifier',
] as const;

export type VerifierDecision = (typeof VERIFIER_DECISIONS)[number];

export interface PlannerAssignment {
  claim_id: string;
  role: PlannerRole;
  // One-sentence explanation of how this claim helps (or fails to help) answer the section purpose.
  role_rationale: string;
}

export type PlannerResult =
  | { ok: true; assignments: PlannerAssignment[] }
  | { ok: false; error: string };

// Disclosure record for an accepted claim the planner could not map to the section purpose.
export interface UnusedClaimDisclosure {
  claim_id: string;
  source_card_ids: string[];
  role_rationale: string;
}

// R-020: a recovery action surfaced inline in the no_answer_cluster failure
// body. Mirrors the action-graph's AllowedAction shape (action_id + why +
// command_hint) but is a separate type so the prose layer doesn't import
// the recover layer's types directly. section-run.ts decorates the bare
// ProseNoAnswerClusterError with these before writing artifacts.
export interface NoAnswerClusterRecoveryAction {
  action_id: string;
  why: string;
  command_hint: string;
}

// Structured error for the no-answer-cluster failure mode (returned when no claim earns role=answer).
export interface ProseNoAnswerClusterError {
  code: 'no_answer_cluster';
  message: string;
  accepted_claim_count: number;
  unused_count: number;
  section_purpose: string;
  unused_claims: UnusedClaimDisclosure[];
  // R-020: populated by section-run.ts after runProseSynthesis returns the
  // bare error. Inline-actionable recovery hints derived from the recover
  // action graph's `prose_error_no_answer_cluster` allowed actions. Optional
  // so unit tests of runProseSynthesis can still assert against bare errors
  // without depending on the decoration step.
  recovery_actions?: NoAnswerClusterRecoveryAction[];
}

export type DraftResult =
  | { ok: true; paragraph: string }
  | { ok: false; error: string };

export type VerifyResult =
  | { ok: true; decision: VerifierDecision; rationale: string }
  | { ok: false; error: string };

export interface SupportBundle {
  claim_ids: string[];
  source_card_ids: string[];
  waiver_ids: string[];
  thin_evidence: boolean;
}

export interface DraftedParagraph {
  paragraph_id: string;
  role: ProseRole;
  text: string;
  support_bundle: SupportBundle;
  verifier_decision: VerifierDecision;
}

export interface ProseDisclosures {
  waivers: Array<{ waiver_id: string; reason: string }>;
  thin_evidence_paragraphs: string[];
  unused_claims: UnusedClaimDisclosure[];
}

export interface ProseGenerator {
  activity_id: string;
  drafter_model: string;
  verifier_model: string;
  prompt_version: string;
}

export interface ProseBlock {
  section_purpose: string;
  paragraphs: DraftedParagraph[];
  disclosures: ProseDisclosures;
  generator: ProseGenerator;
  /**
   * R-018 (v0.12.1) — active planner-timeout value in milliseconds. Always
   * populated. Default runs record `DEFAULT_PLANNER_TIMEOUT_MS`; override
   * runs record the resolved override value. Pre-R-018 stored artifacts
   * will not have this field (additive evolution; readers should treat
   * missing as "v0.12.0-era artifact, default-behavior assumed").
   */
  planner_timeout_ms: number;
  /**
   * R-018 (v0.12.1) — origin of the active planner timeout, populated ONLY
   * when an override was supplied. Default runs omit this field entirely.
   */
  planner_timeout_overridden_by?: Exclude<PlannerTimeoutSource, 'default'>;
}

// Minimal structural interface for the MCP Client. Tests substitute fakes via
// dependency injection; production code passes a real connected MCPClientHandle.
export interface ProseCallToolClient {
  callTool(params: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<{ content?: Array<{ type?: string; text?: string }>; isError?: boolean }>;
}

export interface SourceCardMeta {
  source_id: string;
  title: string | null;
  publisher: string | null;
  source_type: string;
  url: string;
}

export interface WaiverMeta {
  waiver_id: string;
  family: string;
  reason: string;
  applied_to: string;
}

export interface AcceptedClaimInput {
  claim_id: string;
  asserts: string;
  scope: string | null;
  not: string | null;
  source_ids: string[];
  confidence: string;
}

export interface ProseRunInput {
  sectionPurpose: string;
  acceptedClaims: AcceptedClaimInput[];
  sourceCards: SourceCardMeta[];
  waivers: WaiverMeta[];
  gateVerdict: string | null;
  packMode: string;
  client: ProseCallToolClient;
  // Model hint — undefined means "let the server pick its default".
  model?: string;
  /**
   * R-018 (v0.12.1) — planner-timeout budget in milliseconds applied as a
   * per-callTool Promise.race wrapper around the MCP client. Undefined →
   * DEFAULT_PLANNER_TIMEOUT_MS (15000ms). Validated and resolved at the CLI
   * surface (cli.ts) via `resolvePlannerTimeout`; pass-through-only here.
   */
  plannerTimeoutMs?: number;
  /**
   * R-018 (v0.12.1) — origin of the active planner-timeout value. Surfaces
   * as `ProseBlock.planner_timeout_overridden_by` when source !== 'default'.
   */
  plannerTimeoutSource?: PlannerTimeoutSource;
}

export type ProseRunResult =
  | { ok: true; block: ProseBlock }
  | { ok: false; error: string; noAnswerCluster?: ProseNoAnswerClusterError };
