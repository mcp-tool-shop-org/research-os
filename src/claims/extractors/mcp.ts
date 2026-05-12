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
    };
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

    // Dedup by normalised asserts — same as the legacy extractor. Off-topic
    // markers DO NOT prevent dedup: if two windows produce the same assert,
    // keep one. If either window was off-topic, preserve the off-topic flag
    // (any-off-topic wins) so we don't silently launder a frame_excluded claim
    // into the accepted set via deduplication. Critic-derived
    // frame_exclusion_reason / rationale flow with whichever copy was marked
    // excluded — if both were, prefer the prior one (stable order).
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
        // Carry forward exclusion metadata from whichever copy had it. If
        // the prior already has a reason, keep it; otherwise inherit from
        // the duplicate.
        if (!prior.frame_exclusion_reason && d.frame_exclusion_reason) {
          prior.frame_exclusion_reason = d.frame_exclusion_reason;
        }
        if (!prior.frame_exclusion_rationale && d.frame_exclusion_rationale) {
          prior.frame_exclusion_rationale = d.frame_exclusion_rationale;
        }
      }
    }
    const drafts = Array.from(seen.values());

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
