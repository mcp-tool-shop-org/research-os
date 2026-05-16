// MCP-backed claim extractor. Replaces the legacy direct-Ollama extractor in
// v0.8.0. Per-call contract:
//
//   - Caller hands us the source card + deterministic excerpt ledger (paged
//     into windows so a 12B-class model can return JSON within budget).
//   - We render each window as the `text` input to ollama_extract, attach the
//     section purpose as `frame`, optionally pin a `model`, and parse the
//     response envelope.
//   - When the envelope's `result.frame_alignment.on_topic === false`, every
//     claim in that window is tagged `frame_excluded: true` so downstream
//     gates/triage can filter without re-asking the model.
//   - When `envelope.model_requested` differs from `envelope.model`, a
//     ModelFallbackEvent is recorded so the section report can disclose that
//     part of the run came from a fallback tier.
//
// research-os never speaks HTTP to Ollama directly. The MCPClientHandle owns
// the subprocess lifecycle for the duration of this extractor's invocation.

import {
  buildExcerptIndex,
  renderLedgerForPrompt,
} from '../../sources/excerpts/ledger.js';
import { MCPClientHandle, type MCPClientOptions } from '../../mcp/client.js';
import type { Excerpt } from '../../sources/excerpts/schema.js';
import type {
  ClaimExtractionInput,
  ClaimExtractionResult,
  ClaimExtractorAdapter,
  Confidence,
  CriticTally,
  DraftClaim,
  ModelFallbackEvent,
} from '../types.js';
import { runCritic, type CriticCallToolClient } from '../critic/mcp-critic.js';
import { isExclusionLabel } from '../critic/prompt.js';
import {
  checkClaimSourceContentMatch,
  computeSourceContentSignature,
  DEFAULT_FRAME_SOURCE_CONTENT_THRESHOLD,
} from '../critic/source-content.js';
import {
  checkRescueEligibility,
  type PeerSnapshot,
} from '../critic/rescue-eligibility.js';
import { runRescueCritic } from '../critic/rescue-critic.js';

// Phase 1b-b diagnostic finding (2026-05-12): under 5_000 the cosmology
// off-topic source on the dev-rtx5080 workhorse profile (8K context) pages
// into windows whose largest token count exceeds the model's safe budget and
// hits TIER_TIMEOUT — any window timing out kills the source. Reducing to
// 3_000 keeps all 3 Section-01 off-topic sources completing cleanly on the
// reference profile out-of-the-box. The legacy direct-Ollama extractor at
// src/claims/extractors/direct-ollama-legacy-extractor.ts intentionally
// retains 5_000 because it is unwired archival code and its tests pin to
// historical byte counts.
const DEFAULT_WINDOW_CHARS = 3_000;

/**
 * v0.12 Slice 1 (R-012) — rescue stage for source_content_mismatch
 * exclusions. Runs ONCE per source after the per-window per-claim critic
 * loop and dedup have completed; mutates drafts in place to set
 * rescue_status, rescue_eligibility_check, and (on LLM rescue) clear
 * frame_excluded + populate rescue_boundary / rescue_scope / rescue_reason.
 *
 * Sequential pipeline (kickoff-locked architecture):
 *   1. Eligibility gate (deterministic): non_excluded_peer_count >= 2
 *   2. LLM rescue critic (ONLY when eligible): rescue / decline + boundary
 *   3. Operator rescue surface (post-extraction, via CLI): handled elsewhere
 *
 * The gate is NEVER bypassed: ineligible drafts get rescue_status=
 * ineligible_for_rescue and the LLM call is short-circuited.
 *
 * Failure routing (LLM stage): any failure mode (transport error, parse
 * error, timeout, label-without-boundary) → rescue_status='not_rescued'
 * (DEFAULT). The claim remains frame_excluded=true and is open to operator
 * rescue via the CLI. NEVER silently rescues on LLM failure.
 *
 * Env opt-out: when RESEARCH_OS_FRAME_SOURCE_CONTENT=0, R-011's precheck
 * doesn't fire, so there are no source_content_mismatch drafts and this
 * stage is a no-op by virtue of having no candidates.
 */
async function runR012RescueStage(args: {
  client: CriticCallToolClient;
  drafts: DraftClaim[];
  sectionPurpose: string;
  sourceRawText: string | null;
  sourceTitle: string;
  sourcePublisher: string | null;
  sourceType: string | null;
  effectiveModel: string | undefined;
  criticTally: CriticTally;
}): Promise<void> {
  const { client, drafts, sectionPurpose, sourceRawText, sourceTitle,
    sourcePublisher, sourceType, effectiveModel, criticTally } = args;

  // Find rescue candidates: drafts excluded with source_content_mismatch.
  // Other exclusion reasons (off_topic, background_only, source_chrome,
  // critic_unavailable) are NOT in R-012's scope — they ARE off-topic
  // and rescuing them would weaken R-011's defense floor.
  const candidates: DraftClaim[] = [];
  for (const d of drafts) {
    if (
      d.frame_excluded === true &&
      d.frame_exclusion_reason === 'source_content_mismatch'
    ) {
      candidates.push(d);
    }
  }
  if (candidates.length === 0) return;

  // Pre-compute the peer asserts that the LLM rescue critic will see as
  // topical-relevance evidence: non-excluded drafts from the same source.
  // These are the same peers the eligibility gate counts.
  const peerAsserts: string[] = [];
  for (const d of drafts) {
    if (d.frame_excluded === false) {
      peerAsserts.push(d.asserts);
    }
  }

  for (const target of candidates) {
    // Build the peer snapshot for the eligibility gate. Exclude the target
    // draft itself (defensive — the gate is robust to its inclusion, but
    // semantically peers are OTHER drafts).
    const peers: PeerSnapshot[] = [];
    for (const d of drafts) {
      if (d === target) continue;
      peers.push({ frame_excluded: d.frame_excluded ?? false });
    }
    const eligibility = checkRescueEligibility({ peers });
    target.rescue_eligibility_check = eligibility;
    criticTally.rescue_eligible_evaluated =
      (criticTally.rescue_eligible_evaluated ?? 0) + 1;

    // Gate failed → terminal ineligible_for_rescue. The LLM rescue critic
    // and the operator rescue command both refuse on this state. This is
    // the LOAD-BEARING defense-floor preservation: no rescue from a
    // source body that hasn't proven topical relevance.
    if (!eligibility.passed) {
      target.rescue_status = 'ineligible_for_rescue';
      criticTally.rescue_ineligible =
        (criticTally.rescue_ineligible ?? 0) + 1;
      continue;
    }

    // Eligible — invoke the LLM rescue critic. Failure modes → not_rescued
    // (operator rescue path remains open via the CLI).
    const rescue = await runRescueCritic(client, {
      sectionPurpose,
      claimAsserts: target.asserts,
      sourceTitle,
      sourcePublisher,
      sourceType,
      sourceExcerpt: sourceRawText,
      peerAsserts,
      effectiveModel,
    });

    if (!rescue.ok) {
      target.rescue_status = 'not_rescued';
      criticTally.rescue_llm_call_failed =
        (criticTally.rescue_llm_call_failed ?? 0) + 1;
      continue;
    }
    if (rescue.label === 'decline') {
      target.rescue_status = 'not_rescued';
      criticTally.rescue_llm_declined =
        (criticTally.rescue_llm_declined ?? 0) + 1;
      continue;
    }
    // rescue.label === 'rescue' — apply the rescue: frame_excluded flips
    // to false, rescue metadata stamped on the draft. The original
    // frame_exclusion_reason is DELETED on rescue (the claim is no longer
    // excluded — keeping the reason would be a silent contradiction).
    // The original scope/not stay intact; rescue_boundary is a separate
    // field carrying the rescue-supplied constraint.
    target.frame_excluded = false;
    delete target.frame_exclusion_reason;
    delete target.frame_exclusion_rationale;
    target.rescue_status = 'rescued_by_llm';
    target.rescue_boundary = rescue.rescueBoundary;
    target.rescue_scope = rescue.rescueScope;
    target.rescue_reason = rescue.rationale;
    criticTally.rescued_by_llm = (criticTally.rescued_by_llm ?? 0) + 1;
  }
}

// The span-grounding rule lives in the MCP `hint` parameter. The server prepends
// it as `\nHint: ${hint}` to the prompt, so it has to stand on its own (no
// SYSTEM frame). The imperative is the load-bearing line.
const SPAN_GROUNDING_HINT =
  'You are extracting atomic propositional claims from a source for a gated research pack. ' +
  'Each claim is an atomic source-grounded proposition that asserts one thing and is grounded ' +
  'in one or more LITERAL excerpt spans you select from the supplied ledger (each excerpt has a ' +
  'stable ID like "ex_abcdef012345_001"). Pick the IDs that ground each claim. Do NOT author or ' +
  'paraphrase evidence text — only cite excerpt IDs from the ledger above. Do not widen scope ' +
  'beyond what the chosen spans actually say. Do not synthesize across multiple claims into one. ' +
  'Return 3 to 7 claims per source unless the source genuinely makes fewer distinct propositions. ' +
  'Required fields per claim: asserts (one sentence), scope (one sentence naming contextual scope, ' +
  'or null only if the wording is genuinely universal), not (one sentence stating what the claim is ' +
  'NOT about, or null), evidence_excerpt_ids (>=1 IDs verbatim from the ledger), evidence_location ' +
  '(short locator string or null), confidence ("low"|"medium"|"high").';

// JSON schema we hand to ollama_extract. The server enforces JSON-only output;
// fields the source can't address are null/omitted per schema. We do NOT include
// evidence_excerpt — research-os fills that from the ledger after validation,
// because models that author evidence text drift into paraphrase-as-quote.
const CLAIM_BATCH_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          asserts: { type: 'string' },
          scope: { type: ['string', 'null'] },
          not: { type: ['string', 'null'] },
          evidence_excerpt_ids: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
          },
          evidence_location: { type: ['string', 'null'] },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['asserts', 'evidence_excerpt_ids', 'confidence'],
      },
    },
  },
  required: ['claims'],
};

function asConfidence(v: unknown): Confidence {
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  return 'low';
}

function asStringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.toLowerCase() === 'null') return null;
  return trimmed;
}

function asIdArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string' && x.trim().length > 0) out.push(x.trim());
  }
  return out;
}

// Split an excerpt list into windows each under windowChars, never breaking
// inside an excerpt. Deterministic — same input → same windows. Identical to
// the legacy extractor's pagination so window indices stay comparable.
export function pageExcerpts(excerpts: Excerpt[], windowChars: number): Excerpt[][] {
  const windows: Excerpt[][] = [];
  let cursor: Excerpt[] = [];
  let cursorChars = 0;
  for (const ex of excerpts) {
    const approxLine =
      ex.excerpt_id.length +
      (ex.location_hint ? ex.location_hint.length + 3 : 0) +
      2 +
      ex.text.length +
      1;
    if (cursor.length > 0 && cursorChars + approxLine > windowChars) {
      windows.push(cursor);
      cursor = [];
      cursorChars = 0;
    }
    cursor.push(ex);
    cursorChars += approxLine;
  }
  if (cursor.length > 0) windows.push(cursor);
  return windows;
}

// Minimal structural type for the MCP `Client` returned by MCPClientHandle.
// We avoid importing the SDK Client type directly because tests substitute
// fakes via clientFactory; structural typing keeps the test seam clean.
interface CallToolClient {
  callTool(params: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<{ content?: Array<{ type?: string; text?: string }>; isError?: boolean }>;
}

// Parsed envelope shape we care about. Anything we don't read is ignored —
// the MCP server is allowed to add fields without breaking us.
interface ExtractEnvelope {
  result?: {
    ok?: boolean;
    data?: { claims?: unknown };
    error?: string;
    raw?: string;
    frame_alignment?: { on_topic?: boolean; reason?: string };
  };
  model?: string;
  model_requested?: string;
  fallback_from?: string;
  warnings?: unknown;
}

export interface MCPClaimExtractorConfig {
  // Per-window ledger character budget. Defaults to DEFAULT_WINDOW_CHARS.
  windowChars?: number;
  // Injection points for tests — when omitted, a real subprocess-backed handle
  // is constructed lazily on first extract().
  clientOptions?: MCPClientOptions;
  // When the test wants to substitute the MCPClientHandle wholesale (e.g. to
  // skip binary discovery entirely), pass a factory here.
  handleFactory?: () => MCPClientHandle;
}

export class MCPClaimExtractor implements ClaimExtractorAdapter {
  readonly name = 'ollama-intern' as const;
  private readonly windowChars: number;
  private readonly clientOptions: MCPClientOptions | undefined;
  private readonly handleFactory: (() => MCPClientHandle) | undefined;

  constructor(config: MCPClaimExtractorConfig = {}) {
    const envWindow = process.env.OLLAMA_INTERN_WINDOW_CHARS;
    this.windowChars =
      config.windowChars ??
      (envWindow ? parseInt(envWindow, 10) || DEFAULT_WINDOW_CHARS : DEFAULT_WINDOW_CHARS);
    this.clientOptions = config.clientOptions;
    this.handleFactory = config.handleFactory;
  }

  // Available iff a binary can be discovered. We do NOT connect here — that
  // happens lazily in extract() so available() stays cheap. Failed discovery
  // returns false; the caller falls back to the heuristic extractor in the
  // ladder, which is exactly what the legacy extractor's available() did
  // when /api/tags was unreachable.
  async available(): Promise<boolean> {
    try {
      // The handle's constructor does no I/O. We only check binary discovery.
      // Test injection paths that supply a clientFactory or binaryPath
      // short-circuit the discovery error.
      const { discoverBinary } = await import('../../mcp/client.js');
      if (this.clientOptions?.binaryPath) return true;
      if (this.clientOptions?.clientFactory || this.clientOptions?.transportFactory) {
        return true;
      }
      discoverBinary(this.clientOptions?.discoveryEnv);
      return true;
    } catch {
      return false;
    }
  }

  private makeHandle(): MCPClientHandle {
    if (this.handleFactory) return this.handleFactory();
    return new MCPClientHandle(this.clientOptions);
  }

  // One ollama_extract call against a single ledger window. Returns the parsed
  // envelope + drafts, or an error string. The envelope is needed by the caller
  // to derive frame_alignment + model_requested signals.
  private async extractOnePage(
    client: CallToolClient,
    args: {
      cardSummary: string;
      ledgerText: string;
      frame?: string;
      model?: string;
    },
  ): Promise<
    | { ok: true; drafts: DraftClaim[]; envelope: ExtractEnvelope }
    | { ok: false; error: string }
  > {
    const text = `${args.cardSummary}

EXCERPT LEDGER BEGIN
${args.ledgerText}
EXCERPT LEDGER END`;

    const toolArgs: Record<string, unknown> = {
      text,
      schema: CLAIM_BATCH_SCHEMA,
      hint: SPAN_GROUNDING_HINT,
    };
    // Only include frame/model when the operator actually supplied them.
    // Empty strings, undefined, and missing values all collapse to "let the
    // server pick its default."
    if (args.frame !== undefined && args.frame.trim().length > 0) {
      toolArgs.frame = args.frame;
    }
    if (args.model !== undefined && args.model.trim().length > 0) {
      toolArgs.model = args.model;
    }

    let response: Awaited<ReturnType<CallToolClient['callTool']>>;
    try {
      response = await client.callTool({ name: 'ollama_extract', arguments: toolArgs });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'MCP callTool failed' };
    }

    if (response.isError) {
      const errText = response.content?.[0]?.text ?? 'MCP tool returned isError';
      return { ok: false, error: errText };
    }

    const textBody = response.content?.[0]?.text;
    if (typeof textBody !== 'string' || textBody.length === 0) {
      return { ok: false, error: 'MCP response had no text content' };
    }

    let envelope: ExtractEnvelope;
    try {
      envelope = JSON.parse(textBody) as ExtractEnvelope;
    } catch {
      return { ok: false, error: 'MCP response was not valid JSON' };
    }

    const result = envelope.result;
    if (!result || typeof result !== 'object') {
      return { ok: false, error: 'MCP envelope missing result' };
    }
    if (result.ok === false) {
      return { ok: false, error: result.error ?? 'MCP ollama_extract returned ok:false' };
    }

    const claimsRaw = result.data?.claims;
    if (!Array.isArray(claimsRaw)) {
      return { ok: false, error: 'MCP extract did not return a claims array' };
    }

    const drafts: DraftClaim[] = [];
    const frameExcluded = result.frame_alignment?.on_topic === false;
    for (const raw of claimsRaw) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const asserts = asStringOrNull(r.asserts);
      const ids = asIdArray(r.evidence_excerpt_ids);
      if (!asserts || ids.length === 0) continue;
      drafts.push({
        asserts,
        scope: asStringOrNull(r.scope),
        not: asStringOrNull(r.not),
        evidence_excerpt_ids: ids,
        evidence_location: asStringOrNull(r.evidence_location),
        confidence: asConfidence(r.confidence),
        // Off-topic windows tag every emitted claim. Downstream filters can
        // strip them without re-running the model.
        frame_excluded: frameExcluded,
      });
    }
    return { ok: true, drafts, envelope };
  }

  async extract(input: ClaimExtractionInput): Promise<ClaimExtractionResult> {
    if (input.excerpts.length === 0) {
      return { ok: false, error: 'No excerpts available; ledger is empty for this source' };
    }

    const card = input.sourceCard;
    const cardSummary = `URL: ${card.url}
Source title: ${card.title}
Publisher: ${card.publisher ?? 'unknown'}
Source-card asserts: ${card.asserts}
Source-card scope: ${card.scope ?? 'null'}
Source-card not: ${card.not ?? 'null'}`;

    const windows = pageExcerpts(input.excerpts, this.windowChars);
    const handle = this.makeHandle();
    // Build the excerpt index up-front; used only as a sanity check so we can
    // record evidence_location at draft time even if the model omitted it.
    buildExcerptIndex(input.excerpts);

    const allDrafts: DraftClaim[] = [];
    const pageErrors: string[] = [];
    const modelFallbacks: ModelFallbackEvent[] = [];
    let pagesOk = 0;
    let framesExcluded = 0;
    // Phase 1b-b: per-claim critic decisions. Initialised at zero and
    // populated as we critique each draft. ALWAYS populated on the MCP
    // extractor's success result so the operator sees the split even on
    // perfectly-on-topic packs.
    const criticTally: CriticTally = {
      supports_section: 0,
      off_topic: 0,
      background_only: 0,
      source_chrome: 0,
      critic_call_failed: 0,
      source_content_mismatch: 0,
      // v0.12 Slice 1 (R-012) — rescue stage counters, populated by the
      // post-dedup rescue pass below.
      rescue_eligible_evaluated: 0,
      rescue_ineligible: 0,
      rescued_by_llm: 0,
      rescue_llm_declined: 0,
      rescue_llm_call_failed: 0,
    };
    // v0.11 Slice 3 (R-011) — source-content topical signature, computed
    // once per source (not per claim). The signature is the Set of unique
    // significant tokens in the fetched body text (R-008's tokenizer +
    // stripping). The per-draft precheck runs before the LLM critic call;
    // a sub-threshold overlap with claim asserts short-circuits the LLM
    // call and marks frame_excluded=true with reason=source_content_mismatch.
    // Opt out via RESEARCH_OS_FRAME_SOURCE_CONTENT=0 (mirrors R-008's
    // RESEARCH_OS_DISCOVER_RELEVANCE opt-out).
    const r011Enabled = process.env.RESEARCH_OS_FRAME_SOURCE_CONTENT !== '0';
    const sourceSignature =
      r011Enabled && typeof input.sourceRawText === 'string'
        ? computeSourceContentSignature(input.sourceRawText)
        : new Set<string>();
    // drafts populated INSIDE the try block (after dedup and R-012 stage).
    // Declared at function-scope so the post-try error-check + result-build
    // can see it. No initial value — drafts is always assigned inside the
    // try before any read; if the try throws, the throw propagates without
    // a read.
    let drafts: DraftClaim[];
    try {
      const client = (await handle.connect()) as unknown as CallToolClient;
      for (let i = 0; i < windows.length; i += 1) {
        const window = windows[i]!;
        const ledgerText = renderLedgerForPrompt(window);
        const page = await this.extractOnePage(client, {
          cardSummary,
          ledgerText,
          frame: input.framePurpose,
          model: input.effectiveModel,
        });
        if (!page.ok) {
          pageErrors.push(page.error);
          continue;
        }
        pagesOk += 1;
        const onTopic = page.envelope.result?.frame_alignment?.on_topic;
        if (onTopic === false) framesExcluded += 1;
        // Surface model substitutions. The MCP envelope sets model_requested
        // ONLY when an override was supplied; if it differs from `model`, the
        // server fell back to its tier model. Record one event per window.
        const requested = page.envelope.model_requested;
        const used = page.envelope.model;
        if (
          typeof requested === 'string' &&
          typeof used === 'string' &&
          requested.length > 0 &&
          used.length > 0 &&
          requested !== used
        ) {
          const fallbackEvent: ModelFallbackEvent = {
            source_id: card.source_id,
            window_index: i,
            model_requested: requested,
            model_used: used,
          };
          if (typeof page.envelope.fallback_from === 'string') {
            fallbackEvent.fallback_from = page.envelope.fallback_from;
          }
          modelFallbacks.push(fallbackEvent);
        }

        // Phase 1b-b: per-claim section-evidence critic. Runs on EVERY draft
        // from EVERY window, regardless of envelope.frame_alignment. Extract's
        // frame_alignment becomes calibration telemetry; the critic is the
        // admission gate.
        //
        // Critic returns one of four labels:
        //   - supports_section: admit (frame_excluded=false, no rationale).
        //   - off_topic / background_only / source_chrome: route out
        //     (frame_excluded=true with the reason + rationale stamped on
        //     the draft so the persisted claim and downstream review can
        //     surface them).
        //
        // CRITIC-CALL FAILURE — POLICY INVERSION (v0.8.0 phase 1b-b correctness fix):
        // Any failure mode — transport error, parse error, invalid label,
        // empty rationale, timeout — routes to frame_excluded=true with
        // reason='critic_unavailable'. Live evidence on 2026-05-12 showed
        // the prior soft-fail-admit behavior was admitting chrome content
        // ("contact arXiv Click here to contact arXiv") as on-topic high-
        // confidence claims purely because the critic call failed mid-page.
        // The safe default when topicality cannot be determined is to
        // EXCLUDE the claim. The critic_call_failed counter still tracks
        // event volume for telemetry so the operator can detect critic-
        // health issues; the routing decision is uniform across all five
        // failure modes.
        if (input.framePurpose !== undefined && input.framePurpose.trim().length > 0) {
          const criticClient = client as unknown as CriticCallToolClient;
          for (const draft of page.drafts) {
            // v0.11 Slice 3 (R-011) — deterministic source-content precheck.
            // Fires when the claim's asserts vocabulary has below-threshold
            // overlap with the source body's topical signature. Skips the
            // LLM critic call (the precheck has already decided). Requires
            // a non-empty source signature; empty signature → fall through
            // to the LLM critic (graceful degradation, no over-block).
            if (sourceSignature.size > 0) {
              const precheck = checkClaimSourceContentMatch({
                claimAsserts: draft.asserts,
                sourceSignature,
                threshold: DEFAULT_FRAME_SOURCE_CONTENT_THRESHOLD,
              });
              if (precheck.mismatch) {
                criticTally.source_content_mismatch =
                  (criticTally.source_content_mismatch ?? 0) + 1;
                draft.frame_excluded = true;
                draft.frame_exclusion_reason = 'source_content_mismatch';
                draft.frame_exclusion_rationale =
                  `Claim asserts share only ${Math.round(precheck.overlapScore * 100)}% of vocabulary with the source body (threshold ${Math.round(precheck.threshold * 100)}%); source content does not topically support this claim.`;
                continue;
              }
            }
            const critic = await runCritic(criticClient, {
              sectionPurpose: input.framePurpose,
              claimAsserts: draft.asserts,
              sourceTitle: card.title,
              sourcePublisher: card.publisher,
              sourceType: card.source_type,
              effectiveModel: input.effectiveModel,
            });
            if (!critic.ok) {
              criticTally.critic_call_failed += 1;
              // CONSERVATIVE FAIL: exclude. We cannot prove the claim
              // supports the section, so we must not admit it as evidence.
              // This is NOT inheriting envelope.frame_alignment (the
              // doctrine ratchet still holds — envelope is telemetry only);
              // this is independently deciding that absence-of-judgement
              // routes to exclude, not admit.
              draft.frame_excluded = true;
              draft.frame_exclusion_reason = 'critic_unavailable';
              draft.frame_exclusion_rationale =
                'Critic call failed; conservatively excluded from synthesis evidence.';
              continue;
            }
            if (critic.label === 'supports_section') {
              criticTally.supports_section += 1;
              draft.frame_excluded = false;
              delete draft.frame_exclusion_reason;
              delete draft.frame_exclusion_rationale;
              continue;
            }
            // off_topic / background_only / source_chrome — route out.
            if (isExclusionLabel(critic.label)) {
              criticTally[critic.label] += 1;
            }
            draft.frame_excluded = true;
            draft.frame_exclusion_reason = critic.label as
              | 'off_topic'
              | 'background_only'
              | 'source_chrome';
            draft.frame_exclusion_rationale = critic.rationale;
          }
        }

        allDrafts.push(...page.drafts);
      }

      // PASS 2: dedup. Moved INSIDE the try (was previously post-try) so
      // the R-012 rescue stage below can reuse the live MCP client without
      // re-opening the subprocess. Off-topic markers DO NOT prevent dedup:
      // if two windows produce the same assert, keep one. If either window
      // was off-topic, preserve the off-topic flag (any-off-topic wins) so
      // we don't silently launder a frame_excluded claim into the accepted
      // set via deduplication. Critic-derived frame_exclusion_reason /
      // rationale flow with whichever copy was marked excluded — if both
      // were, prefer the prior one (stable order).
      const seen = new Map<string, DraftClaim>();
      for (const d of allDrafts) {
        const key = d.asserts.toLowerCase().replace(/\s+/g, ' ').trim();
        const prior = seen.get(key);
        if (!prior) {
          seen.set(key, d);
          continue;
        }
        if (d.frame_excluded || prior.frame_excluded) {
          prior.frame_excluded = true;
          // Carry forward exclusion metadata from whichever copy had it.
          if (!prior.frame_exclusion_reason && d.frame_exclusion_reason) {
            prior.frame_exclusion_reason = d.frame_exclusion_reason;
          }
          if (!prior.frame_exclusion_rationale && d.frame_exclusion_rationale) {
            prior.frame_exclusion_rationale = d.frame_exclusion_rationale;
          }
        }
      }
      drafts = Array.from(seen.values());

      // PASS 3: v0.12 Slice 1 (R-012) rescue stage. Runs on the deduped
      // draft set so we don't fire the LLM rescue critic on each window-
      // local duplicate of the same claim. Requires framePurpose (the
      // section context the rescue critic is judging against) and at
      // least one draft. No-op when env opt-out is set because R-011
      // never fires source_content_mismatch in that case (and the loop's
      // candidate filter finds nothing to rescue).
      if (
        input.framePurpose !== undefined &&
        input.framePurpose.trim().length > 0 &&
        drafts.length > 0
      ) {
        const criticClient = client as unknown as CriticCallToolClient;
        await runR012RescueStage({
          client: criticClient,
          drafts,
          sectionPurpose: input.framePurpose,
          sourceRawText: input.sourceRawText ?? null,
          sourceTitle: card.title,
          sourcePublisher: card.publisher,
          sourceType: card.source_type,
          effectiveModel: input.effectiveModel,
          criticTally,
        });
      }
    } finally {
      await handle.close();
    }

    if (pagesOk === 0) {
      const summary =
        pageErrors.length === 1
          ? pageErrors[0]!
          : `all ${windows.length} ledger pages failed (first error: ${pageErrors[0] ?? 'unknown'})`;
      return { ok: false, error: summary };
    }

    if (drafts.length === 0) {
      return {
        ok: false,
        error: 'MCP extract returned no usable claims (all missing evidence_excerpt_ids)',
      };
    }

    const method =
      windows.length > 1 ? 'mcp_ollama_extract_paged' : 'mcp_ollama_extract';

    const out: ClaimExtractionResult = {
      ok: true,
      claims: drafts,
      method,
      criticTally,
    };
    if (modelFallbacks.length > 0) out.modelFallbacks = modelFallbacks;
    if (framesExcluded > 0) out.framesExcluded = framesExcluded;
    return out;
  }
}
