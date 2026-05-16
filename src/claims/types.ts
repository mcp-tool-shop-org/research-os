import type { Excerpt } from '../sources/excerpts/schema.js';
import type { SourceCard, FetchReceipt } from '../sources/schema.js';

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
}

export interface ExtractClaimsFailure {
  source_id: string;
  reason: string;
}

// Six precise rejection categories replace the umbrella "hallucination" label.
// At extract time we can detect three of them mechanically; the other three
// (unsupported_claim, scope_widening, cross_source_contam) are reviewer concerns.
export interface ExtractClaimsSummary {
  sectionId: string;
  extractor: ClaimExtractor;
  extractionMethod: string;
  sourcesProcessed: number;
  sourcesSkipped: number;
  sourcesFailed: number;
  excerptLedgersBuilt: number;
  claimsAdded: number;
  claimsDeduped: number;
  // Aggregate of all "evidence couldn't be grounded" rejections — kept for
  // continuity with earlier summaries.
  claimsRejectedUngrounded: number;
  // Precise span-first rejection categories.
  claimsRejectedExcerptIdMissing: number;
  claimsRejectedExcerptIdMalformed: number;
  claimsRejectedScopeMissing: number;
  claimsRejectedExtractorParaphrase: number;
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
}

export interface SourceFetchPair {
  card: SourceCard;
  latestReceipt: FetchReceipt | null;
}
