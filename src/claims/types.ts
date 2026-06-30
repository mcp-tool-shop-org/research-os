import type { Excerpt } from '../sources/excerpts/schema.js';
import type { SourceCard, FetchReceipt } from '../sources/schema.js';
import type {
  FrameRescueStatus,
  RescueEligibilityResult,
} from './critic/rescue-eligibility.js';

// ── R-024 (v0.13.1) — Extract tier-budget configuration ──────────────────────
//
// R-024 extends R-019's tier-budget authority (which reached synth prose only)
// to the claim-extract stage by mirroring R-019's client wire-up. Every
// `ollama_extract` MCP call made during `claim extract` (extractOnePage +
// runCritic + runRescueCritic — the three call sites that can produce the same
// inner ollama-intern-mcp TIER_TIMEOUT) now forwards an operator-controlled
// `tier_budget_ms_override` value to ollama-intern-mcp@>=2.6.0.
//
// Default behavior preserved: when no override is set, the field is omitted
// from toolArgs and ollama-intern-mcp's per-tier profile timeouts govern
// byte-identically — pre-R-024 callers see zero change.
//
// Closes the v0.5 operator-aloneness gate's R-019-extract-stage-scope-gap
// (3 of 8 sources in section 02 hit 15s instant-tier TIER_TIMEOUT with no
// operator-facing override). Mirrors R-018's CLI flag / env-var pattern.

/** Minimum accepted extract tier budget. Zero is rejected — zero-budget calls are useless. */
export const MIN_EXTRACT_TIER_BUDGET_MS = 1;

/**
 * Upper safety rail for the extract tier-budget — 10 minutes. Mirrors R-018's
 * MAX_PLANNER_TIMEOUT_MS rail to protect against typo runaway.
 */
export const MAX_EXTRACT_TIER_BUDGET_MS = 600_000;

/**
 * Closed-enum vocabulary for the source of an active extract tier-budget value.
 * - `default`: neither CLI flag nor env var was set; ollama-intern-mcp's
 *   per-tier profile timeouts govern (byte-identical to pre-R-024 behavior).
 * - `cli_flag`: --tier-budget-ms supplied on `claim extract`.
 * - `env_var`: RESEARCH_OS_EXTRACT_TIER_BUDGET_MS supplied in the environment.
 *
 * Precedence (CLI > env > default) is encoded in `resolveExtractTierBudget`.
 * Kept as a NEW closed enum (semantically parallel to PLANNER_TIMEOUT_SOURCES
 * in src/synth/prose/types.ts) rather than reusing R-018's enum, so the claims
 * layer does not import from synth/prose.
 */
export const EXTRACT_TIER_BUDGET_SOURCES = ['default', 'cli_flag', 'env_var'] as const;
export type ExtractTierBudgetSource = (typeof EXTRACT_TIER_BUDGET_SOURCES)[number];

/** Discriminated-union result for the pure validator. */
export type ExtractTierBudgetValidationResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

/** Discriminated-union result for the precedence resolver. */
export type ExtractTierBudgetResolutionResult =
  | { ok: true; value: number | undefined; source: ExtractTierBudgetSource }
  | { ok: false; error: string };

/**
 * Validate a raw extract tier-budget value (from CLI flag or env var). The
 * surface label is included verbatim in the error message so operators see
 * which knob they got wrong. Accepts only base-10 integers; rejects negatives,
 * zero, unit suffixes, and values above MAX_EXTRACT_TIER_BUDGET_MS.
 *
 * Pure — no side effects. Tested in isolation in
 * test/r024-tier-budget-override.test.ts.
 */
export function validateExtractTierBudgetValue(
  raw: string,
  surface: Exclude<ExtractTierBudgetSource, 'default'>,
): ExtractTierBudgetValidationResult {
  const surfaceLabel =
    surface === 'cli_flag' ? '--tier-budget-ms' : 'RESEARCH_OS_EXTRACT_TIER_BUDGET_MS';
  if (!/^-?\d+$/.test(raw)) {
    return {
      ok: false,
      error: `${surfaceLabel}: expected positive integer (milliseconds), got '${raw}'. Valid range: ${MIN_EXTRACT_TIER_BUDGET_MS}–${MAX_EXTRACT_TIER_BUDGET_MS}.`,
    };
  }
  const n = parseInt(raw, 10);
  if (n < MIN_EXTRACT_TIER_BUDGET_MS) {
    return {
      ok: false,
      error: `${surfaceLabel}: value '${raw}' is below minimum (${MIN_EXTRACT_TIER_BUDGET_MS}ms). Zero and negative values are not accepted.`,
    };
  }
  if (n > MAX_EXTRACT_TIER_BUDGET_MS) {
    return {
      ok: false,
      error: `${surfaceLabel}: value '${raw}' exceeds the safety upper bound (${MAX_EXTRACT_TIER_BUDGET_MS}ms = 10 minutes). Operators rarely need more than 1–2 minutes; values this large are usually typos.`,
    };
  }
  return { ok: true, value: n };
}

/**
 * Resolve the active extract tier-budget value from CLI flag + env var sources
 * with CLI > env > default precedence. Unlike R-018's planner timeout (which
 * has a hard default of 15000ms because R-018 is an OUTER wrapper that always
 * fires), R-024's resolver returns `value: undefined` on the default path —
 * absence signals "let ollama-intern-mcp's profile defaults govern," which is
 * byte-identical to pre-R-024 behavior.
 *
 * Empty-string env var is treated as unset (matches conventional shell
 * behavior where `export FOO=` clears the variable's effective value).
 */
export function resolveExtractTierBudget(args: {
  cliFlagMs: number | undefined;
  envVar: string | undefined;
}): ExtractTierBudgetResolutionResult {
  if (args.cliFlagMs !== undefined) {
    const check = validateExtractTierBudgetValue(String(args.cliFlagMs), 'cli_flag');
    if (!check.ok) return check;
    return { ok: true, value: check.value, source: 'cli_flag' };
  }
  if (args.envVar !== undefined && args.envVar !== '') {
    const check = validateExtractTierBudgetValue(args.envVar, 'env_var');
    if (!check.ok) return check;
    return { ok: true, value: check.value, source: 'env_var' };
  }
  return { ok: true, value: undefined, source: 'default' };
}

/**
 * Format a single-line, grep-friendly stderr summary of the active extract
 * tier-budget configuration. Emitted by extract() in src/claims/extract.ts
 * BEFORE the per-source loop begins so operators can `2>&1 | grep
 * tier_budget_ms=` to see what budget was in effect for a given run.
 *
 * Shape: `[extract] tier_budget_ms=<N|default> source=<default|cli_flag|env_var>`
 *
 * The literal `default` token (when value is undefined) communicates that
 * ollama-intern-mcp's per-tier profile timeouts govern, which is NOT a
 * research-os-side single number. This matches the surface-promise: presence
 * of a numeric value ⇒ operator opted in; literal `default` ⇒ profile
 * defaults govern.
 */
export function formatExtractTierBudgetLogLine(
  value: number | undefined,
  source: ExtractTierBudgetSource,
): string {
  return `[extract] tier_budget_ms=${value ?? 'default'} source=${source}`;
}

// ── End R-024 ────────────────────────────────────────────────────────────────

export type ClaimExtractor = 'heuristic' | 'ollama-intern';
export type Confidence = 'low' | 'medium' | 'high';
export type ReviewState =
  | 'candidate'
  | 'gated'
  | 'reviewed'
  | 'rejected'
  | 'accepted';

// A draft claim authored by an extractor. Per the span-first law, the extractor
// authors the interpretation layer (asserts/scope/not) and chooses excerpt IDs
// from the supplied ledger. It MUST NOT author evidence text — research-os
// fills evidence_excerpt from the ledger after validation.
export interface DraftClaim {
  asserts: string;
  scope: string | null;
  not: string | null;
  evidence_excerpt_ids: string[];
  evidence_location: string | null;
  confidence: Confidence;
  // Phase 1 (v0.8.0): when the MCP extractor's frame_alignment judges the
  // ledger window off-topic for the section purpose, every draft from that
  // window is marked frame_excluded so the persisted claim carries it forward.
  // Heuristic extractor never sets this.
  //
  // Phase 1b-b (v0.8.0): the per-claim section-evidence critic populates
  // frame_exclusion_reason + frame_exclusion_rationale when it returns a
  // non-supports_section label. Both fields are present only on excluded
  // drafts; supports_section + heuristic drafts leave them undefined.
  //
  // The reason enum carries FOUR values; critic_unavailable is a
  // system-state label set when the critic call itself fails (transport,
  // parse, invalid label, empty rationale, or timeout). The model never
  // emits critic_unavailable — see CRITIC_EXCLUSION_LABELS in
  // src/claims/critic/prompt.ts for the three model-output labels.
  frame_excluded?: boolean;
  // v0.11 Slice 3 (R-011) — source_content_mismatch added for the
  // deterministic precheck firing path in MCPClaimExtractor's critic loop.
  frame_exclusion_reason?:
    | 'off_topic'
    | 'background_only'
    | 'source_chrome'
    | 'critic_unavailable'
    | 'source_content_mismatch';
  frame_exclusion_rationale?: string;

  // v0.12 Slice 1 (R-012) — rescue path for source_content_mismatch
  // exclusions. The eligibility gate runs once per source, after the
  // per-claim critic loop has decided every draft. Drafts that R-011
  // excluded with source_content_mismatch AND that have ≥2 non-excluded
  // peers from the same source body become rescue-candidates. The LLM
  // rescue critic may accept (rescue_status=rescued_by_llm,
  // frame_excluded=false, rescue_boundary set) or decline (rescue_status=
  // not_rescued, claim remains excluded but open to operator rescue
  // post-extraction). Ineligible drafts get rescue_status=
  // ineligible_for_rescue.
  //
  // The original frame_exclusion_reason stays on the draft for ledger /
  // audit even after rescue (rescue_status disambiguates downstream).
  // The original scope/not fields are NEVER rewritten by R-012 — operator-
  // supplied scope goes into rescue_boundary, separate from the original.
  rescue_status?: FrameRescueStatus;
  rescue_eligibility_check?: RescueEligibilityResult;
  rescue_boundary?: string;
  // TRANSIENT (DraftClaim-only — NOT persisted to Claim record). Carries
  // ledger-only fields from the extractor through to extract.ts so the
  // ledger writer can compose the full RescueLedgerRecord without
  // re-doing the rescue. These never reach the persisted claims.jsonl
  // — only the rescue ledger.
  rescue_scope?: string;
  rescue_reason?: string;
}

// Substitution surfaced by the MCP envelope when model_requested !== model.
// One per window where it happened. Lifted into the extraction summary so the
// section report can display "X claims came from a fallback tier" without
// re-walking response logs.
export interface ModelFallbackEvent {
  source_id: string;
  window_index: number;
  model_requested: string;
  model_used: string;
  fallback_from?: string;
}

// Phase 1b-b summary breakdown: how many claims the per-claim critic kept vs
// excluded under each exclusion label, plus the number of critic calls that
// failed transport / parse. When the critic call failed we admit the claim
// with frame_excluded=false (we cannot prove it off-topic) but record the
// failure so the operator sees the count.
export interface CriticTally {
  supports_section: number;
  off_topic: number;
  background_only: number;
  source_chrome: number;
  critic_call_failed: number;
  // v0.11 Slice 3 (R-011) — count of claims caught by the deterministic
  // source-content precheck before the LLM critic was invoked. Surfacing
  // this separately from off_topic lets operators see how often the
  // deterministic layer is firing vs. the LLM layer. Optional for
  // back-compat with pre-v0.11 callers that destructure CriticTally.
  source_content_mismatch?: number;
  // v0.12 Slice 1 (R-012) — rescue stage counters. Surfaces how many
  // source_content_mismatch exclusions the rescue path acted on at
  // extract time. Operator-rescue events occur post-extraction via the
  // CLI and are tracked in the append-only rescue ledger, not here.
  // All fields optional for back-compat with pre-v0.12 callers.
  rescue_eligible_evaluated?: number;
  rescue_ineligible?: number;
  rescued_by_llm?: number;
  rescue_llm_declined?: number;
  rescue_llm_call_failed?: number;
}

export type ClaimExtractionResult =
  | {
      ok: true;
      claims: DraftClaim[];
      method: string;
      // Optional — populated by extractors that surface MCP envelopes.
      modelFallbacks?: ModelFallbackEvent[];
      // Number of ledger windows judged off-topic by frame_alignment.
      framesExcluded?: number;
      // Phase 1b-b: per-claim critic decisions for the whole extract run on
      // this source. Optional; only the MCP extractor populates it.
      criticTally?: CriticTally;
      // B-CLAIMS-001 (Stage B proactive hardening) — count of ledger windows
      // that FAILED (TIER_TIMEOUT / transport / parse) on an otherwise-ok:true
      // extraction. A partial-window failure means ≥1 window succeeded (so the
      // result is ok:true and some claims came back) but other windows dropped
      // their claims silently. When > 0, extract.ts folds it into the summary +
      // receipt AND withholds the completion-ledger entry so --resume
      // re-attempts the source and recovers the dropped windows' claims.
      // Absent / 0 on a clean run preserves byte-identical pre-hardening behavior.
      windowsFailed?: number;
      // B-CLAIMS-001 — the per-window error strings collected during a
      // partial-window failure (the same strings that, when EVERY window fails,
      // become the ok:false error summary). Optional; present only alongside a
      // positive windowsFailed so operators can see WHY windows dropped.
      pageErrors?: string[];
    }
  | { ok: false; error: string };

export interface ClaimExtractionInput {
  sourceCard: SourceCard;
  sourceHash: string | null;
  // The deterministic excerpt ledger for this source. The extractor sees ONLY
  // these spans plus the source-card metadata — it does not see the raw text.
  excerpts: Excerpt[];
  // Section purpose — passed to the MCP extractor as `frame` for topicality
  // judgement. Optional; the heuristic extractor ignores it.
  framePurpose?: string;
  // Operator-selected model override. Threaded into ollama_extract as the
  // per-call `model` parameter (v2.3.0 contract). undefined means "let the MCP
  // server pick its default"; the heuristic extractor ignores it.
  effectiveModel?: string;
  // v0.11 Slice 3 (R-011) — full fetched body text used to compute the
  // source-content topical signature for the frame-critic precheck.
  // Optional for back-compat (heuristic extractor + pre-v0.11 callers
  // omit it; the MCP extractor's R-011 precheck degrades gracefully to
  // "no signal, no precheck" when absent).
  sourceRawText?: string | null;
  // R-024 (v0.13.1) — per-call tier-budget override forwarded to
  // ollama-intern-mcp@>=2.6.0 as `tier_budget_ms_override` on EVERY
  // `ollama_extract` callTool invocation made during this source's extract
  // (extractOnePage per window + runCritic per claim + runRescueCritic per
  // rescue candidate). undefined preserves byte-identical pre-R-024 behavior
  // (ollama-intern-mcp profile defaults govern). The heuristic extractor
  // ignores this field.
  tierBudgetMsOverride?: number;
}

export interface ClaimExtractorAdapter {
  readonly name: ClaimExtractor;
  available(): Promise<boolean>;
  extract(input: ClaimExtractionInput): Promise<ClaimExtractionResult>;
}

export interface ExtractClaimsOptions {
  sectionId: string;
  packPath?: string;
  extractors?: ClaimExtractorAdapter[];
  // Operator override threaded into ollama_extract as the per-call `model`
  // parameter (MCP v2.3.0 contract). Precedence in cli.ts: `--model` flag ??
  // OLLAMA_INTERN_MODEL env var ?? undefined. The extractor receives this
  // verbatim on every ClaimExtractionInput it processes.
  effectiveModel?: string;
  // v0.12 Slice 4 (R-015) — when true, skip sources whose successful
  // extraction is already recorded in evidence/extract-completion.jsonl
  // for this section. Default false preserves byte-identical behavior.
  resume?: boolean;
  // v0.12 Slice 4 (R-015) — when true, emit per-source [extract N/M]
  // progress lines to stderr (or to the supplied progressStream). stdout
  // canonical output is unchanged. Default false.
  progress?: boolean;
  // Test seam: injection point for progress emission. Defaults to
  // process.stderr.write when progress=true. Tests pass a capture
  // function; the orchestrator never imports process.stderr directly
  // through this path.
  progressStream?: (line: string) => void;
  // R-024 (v0.13.1) — operator-supplied per-call tier-budget override
  // forwarded to the MCP extractor's `tier_budget_ms_override` field on
  // every `ollama_extract` call during this section's extract run.
  // Resolved at the CLI surface (cli.ts) via resolveExtractTierBudget;
  // undefined preserves byte-identical pre-R-024 behavior.
  tierBudgetMs?: number;
  // R-024 (v0.13.1) — origin of the active tier-budget value. Surfaces in
  // the extract receipt as `tier_budget_overridden_by` when source !== 'default'.
  tierBudgetSource?: ExtractTierBudgetSource;
}

export interface ExtractClaimsFailure {
  source_id: string;
  reason: string;
}

// Precise rejection categories replace the umbrella "hallucination" label.
// At extract time we mechanically detect only two of them — excerpt_id_missing
// and excerpt_id_malformed; the rest (e.g. unsupported_claim, scope_widening,
// cross_source_contam) are reviewer concerns decided downstream.
export interface ExtractClaimsSummary {
  sectionId: string;
  extractor: ClaimExtractor;
  extractionMethod: string;
  sourcesProcessed: number;
  sourcesSkipped: number;
  sourcesFailed: number;
  // v0.12 Slice 4 (R-015) — sources excluded from the extract loop because
  // their successful extraction is already in evidence/extract-completion.jsonl
  // for this section AND --resume was passed. Distinct from sourcesSkipped
  // (in-loop gate skips: no card, no excerpts, severity quarantine). Zero
  // by default; only positive on --resume runs against a pre-existing ledger.
  sourcesSkippedByResume: number;
  excerptLedgersBuilt: number;
  claimsAdded: number;
  claimsDeduped: number;
  // Aggregate of all "evidence couldn't be grounded" rejections — kept for
  // continuity with earlier summaries.
  claimsRejectedUngrounded: number;
  // Precise span-first rejection categories.
  claimsRejectedExcerptIdMissing: number;
  claimsRejectedExcerptIdMalformed: number;
  claimIds: string[];
  // Phase 1b-b v0.8.0 — count of claims persisted to claims.jsonl with
  // frame_excluded:false. Sourced from the actual persistence loop, NOT the
  // critic tally. Diverges from criticTally.supports_section when a draft is
  // critic'd as supports_section but later rejected (ungrounded /
  // excerpt_id_missing / excerpt_id_malformed) or deduped against an existing
  // claim. Operator-trust contract: this matches `grep -c '"frame_excluded":false'
  // claims.jsonl` after the run completes.
  claimsAdmittedPersisted: number;
  failures: ExtractClaimsFailure[];
  // Phase 1 v0.8.0 — populated only when the MCP-backed extractor encounters
  // model substitution or off-topic windows. Empty otherwise; legacy callers
  // can ignore.
  modelFallbacks: ModelFallbackEvent[];
  framesExcluded: number;
  // Phase 1b-b v0.8.0 — pack-wide critic tally aggregated across every source
  // processed for this section. Always present (zero counts when the
  // heuristic extractor ran, since heuristic never invokes the critic).
  criticTally: CriticTally;
  // B-CLAIMS-001 (Stage B proactive hardening) — pack-wide count of ledger
  // windows that FAILED on otherwise-successful per-source extractions (the
  // partial-window-failure case: ≥1 window ok, others TIER_TIMEOUT / transport
  // / parse). When > 0, the affected sources did NOT get a completion-ledger
  // entry, so `claim extract --resume` re-attempts them to recover the dropped
  // windows' claims. Zero on a clean run. Surfaced in the extract receipt as
  // `windows_failed`.
  windowsFailed: number;
  // B-CLAIMS-002 (Stage B proactive hardening) — true when the MCP extractor
  // was first preference but unavailable, so extraction fell through to the
  // deterministic heuristic, which bypasses the entire topicality defense floor
  // (frame critic / source-content guard / rescue). A run-start contrastive
  // stderr warning is also emitted. Surfaced in the extract receipt as
  // `degraded_to_heuristic`. false on the happy path (MCP available) and when
  // the heuristic was the operator's explicit first preference.
  degradedToHeuristic: boolean;
  // R-024 (v0.13.1) — active extract tier-budget in milliseconds. undefined
  // when no override is in effect (ollama-intern-mcp profile defaults govern,
  // byte-identical to pre-R-024 behavior). Surfaced in the extract receipt at
  // `audits/<section>-claim-extract.json` as `tier_budget_ms`.
  tierBudgetMs?: number;
  // R-024 (v0.13.1) — origin of the active tier-budget value. Present only
  // when the operator supplied an override; absent on default runs. Surfaced
  // in the extract receipt as `tier_budget_overridden_by` when present.
  tierBudgetOverriddenBy?: Exclude<ExtractTierBudgetSource, 'default'>;
}

export interface SourceFetchPair {
  card: SourceCard;
  latestReceipt: FetchReceipt | null;
}
