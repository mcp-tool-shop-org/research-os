import { normalizeOllamaHost } from '../../sources/extractors/ollama-intern.js';
import { emitProgress } from '../../util/progress.js';
import type { Claim } from '../../claims/schema.js';
import {
  DEFAULT_AUTO_MODE_PAIR_TIMEOUT_MS,
  DEFAULT_AUTO_MODE_FALL_THROUGH_AFTER_N,
} from '../types.js';
import type {
  ContradictionDetector,
  ContradictionType,
  DetectionResult,
  DraftContradiction,
  OverlapAssessment,
  PairedDraft,
  Severity,
} from '../types.js';

const DEFAULT_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'hermes3:8b';

const SYSTEM_PROMPT = `You are detecting tension between two atomic claims from a research pack.

Return ONE JSON object. If there is no contradiction, return {"type": "none"}.

If there IS a contradiction:
{
  "type": "direct_conflict" | "scope_conflict" | "temporal_conflict" | "definition_conflict" | "evidence_conflict" | "overgeneralization_risk",
  "summary": "ONE sentence describing the tension",
  "scope_analysis": "ONE sentence on whether and how the claims' scopes overlap",
  "overlap_assessment": "fully_overlapping" | "partially_overlapping" | "non_overlapping" | "unknown",
  "severity": "low" | "medium" | "high" | "blocking",
  "confidence": "low" | "medium" | "high",
  "evidence": "what specifically about the two claims signals the tension"
}

Hard rules:
- direct_conflict requires overlapping scopes. If scopes do not overlap, choose scope_conflict, temporal_conflict, definition_conflict, evidence_conflict, or "none".
- overgeneralization_risk fires when one claim appears to widen a contextual assertion into a universal rule without evidence. The publish-policy-promoted-from-role-os-rollout failure mode is the canonical example.
- Be conservative. If the tension is unclear, return "none".
- Do not invent claims. Only assess what is given.
- Do not decide which claim is true.`;

interface ChatResponse {
  message?: { content?: string };
  response?: string;
}

const VALID_TYPES: ContradictionType[] = [
  'direct_conflict',
  'scope_conflict',
  'temporal_conflict',
  'definition_conflict',
  'evidence_conflict',
  'overgeneralization_risk',
];

const VALID_OVERLAPS: OverlapAssessment[] = [
  'fully_overlapping',
  'partially_overlapping',
  'non_overlapping',
  'unknown',
];

const VALID_SEVERITIES: Severity[] = ['low', 'medium', 'high', 'blocking'];

const VALID_CONFIDENCES = ['low', 'medium', 'high'] as const;
type ValidConfidence = (typeof VALID_CONFIDENCES)[number];

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

// R-021 — per-pair classification outcome.
//
// The original code returned `DraftContradiction | null` and the loop could
// not distinguish "LLM said no contradiction" (a successful classification)
// from "the call timed out / errored" (a failure). The fall-through trigger
// needs that distinction — consecutive type-none responses are NOT a hang
// signal; consecutive timeouts/HTTP errors/parse errors ARE.
type ClassifyOutcome =
  | { kind: 'draft'; draft: DraftContradiction; elapsedMs: number }
  | { kind: 'none'; elapsedMs: number }
  | { kind: 'timeout'; elapsedMs: number }
  | { kind: 'http_error'; status: number; elapsedMs: number }
  | { kind: 'parse_error'; elapsedMs: number }
  | { kind: 'network_error'; message: string; elapsedMs: number };

export interface OllamaContradictionConfig {
  host?: string;
  model?: string;
  // Per-pair classification timeout in ms. R-021 default = 90_000.
  timeoutMs?: number;
  // Consecutive-failure threshold that triggers fall-through to heuristic.
  // R-021 default = 5.
  fallThroughAfterN?: number;
  fetchImpl?: typeof fetch;
}

export class OllamaInternContradictionDetector implements ContradictionDetector {
  readonly name = 'ollama-intern' as const;
  private readonly host: string;
  readonly model: string;
  // Public for assertion convenience in synthetic tests. Treat as read-only
  // outside the class.
  readonly timeoutMs: number;
  readonly fallThroughAfterN: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OllamaContradictionConfig = {}) {
    this.host = normalizeOllamaHost(config.host ?? process.env.OLLAMA_HOST ?? DEFAULT_HOST);
    this.model = config.model ?? process.env.OLLAMA_INTERN_MODEL ?? DEFAULT_MODEL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_AUTO_MODE_PAIR_TIMEOUT_MS;
    this.fallThroughAfterN = config.fallThroughAfterN ?? DEFAULT_AUTO_MODE_FALL_THROUGH_AFTER_N;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  async available(): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const res = await this.fetchImpl(`${this.host}/api/tags`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return false;
      const body = (await res.json()) as { models?: Array<{ name: string }> };
      const names = (body.models ?? []).map((m) => m.name);
      const family = this.model.split(':')[0] ?? this.model;
      return names.some(
        (n) => n === this.model || n === family || n.startsWith(`${family}:`),
      );
    } catch {
      return false;
    }
  }

  private formatClaim(label: string, claim: Claim): string {
    return [
      `Claim ${label} (${claim.claim_id}):`,
      `  asserts: ${claim.asserts}`,
      `  scope: ${claim.scope ?? 'null'}`,
      `  not: ${claim.not ?? 'null'}`,
      `  evidence_excerpt: ${claim.evidence_excerpt}`,
      `  source_ids: ${claim.source_ids.join(', ')}`,
    ].join('\n');
  }

  // R-021 — returns a structured outcome instead of `DraftContradiction | null`.
  // The detect() loop uses the outcome's `kind` to decide whether to reset or
  // increment the consecutive-failure counter.
  private async classifyPair(a: Claim, b: Claim): Promise<ClassifyOutcome> {
    const userMsg = [this.formatClaim('A', a), '', this.formatClaim('B', b)].join('\n');

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    const startMs = Date.now();
    let body: ChatResponse;
    try {
      const res = await this.fetchImpl(`${this.host}/api/chat`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: 'json',
          // Override Ollama's default 4096 context for the same reason as
          // the claim extractor — pairwise prompts with full claim+scope+
          // not+evidence_excerpt can exceed 4K on dense fields.
          options: { num_ctx: 8192 },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMsg },
          ],
        }),
      });
      if (!res.ok) {
        clearTimeout(t);
        return { kind: 'http_error', status: res.status, elapsedMs: Date.now() - startMs };
      }
      body = (await res.json()) as ChatResponse;
    } catch (err) {
      clearTimeout(t);
      const elapsed = Date.now() - startMs;
      // AbortError → timeout. Anything else → network error.
      const name = (err as { name?: string })?.name ?? '';
      if (name === 'AbortError') {
        return { kind: 'timeout', elapsedMs: elapsed };
      }
      return {
        kind: 'network_error',
        message: (err as { message?: string })?.message ?? String(err),
        elapsedMs: elapsed,
      };
    } finally {
      clearTimeout(t);
    }

    const elapsed = Date.now() - startMs;
    const text = body.message?.content ?? body.response ?? '';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { kind: 'parse_error', elapsedMs: elapsed };
    }

    // JSON.parse('null') / '[]' / '"string"' all yield valid JSON that is not
    // a usable object. Treat anything non-object as a soft parse failure.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { kind: 'parse_error', elapsedMs: elapsed };
    }

    if (parsed.type === 'none' || !parsed.type) {
      return { kind: 'none', elapsedMs: elapsed };
    }

    const type = asEnum<ContradictionType>(parsed.type, VALID_TYPES, 'direct_conflict');
    if (!VALID_TYPES.includes(parsed.type as ContradictionType)) {
      return { kind: 'parse_error', elapsedMs: elapsed };
    }

    return {
      kind: 'draft',
      elapsedMs: elapsed,
      draft: {
        type,
        summary: asString(parsed.summary, '(no summary)'),
        scope_analysis: asString(parsed.scope_analysis, ''),
        overlap_assessment: asEnum<OverlapAssessment>(
          parsed.overlap_assessment,
          VALID_OVERLAPS,
          'unknown',
        ),
        severity: asEnum<Severity>(parsed.severity, VALID_SEVERITIES, 'low'),
        confidence: asEnum<ValidConfidence>(parsed.confidence, VALID_CONFIDENCES, 'low'),
        evidence: asString(parsed.evidence, ''),
      },
    };
  }

  async detect(claims: Claim[]): Promise<DetectionResult> {
    // Prefilter: only LLM-classify pairs that look like potential tensions.
    // For dense sections (50+ claims) full N² is feasible but expensive; for
    // huge sections it's outright intractable. The prefilter is a token
    // Jaccard score plus a scope-overlap signal — both cheap and
    // deterministic. Pairs failing the prefilter contribute nothing to the
    // final ledger; the model never sees them.
    const candidatePairs = candidateContradictionPairs(claims);

    // R-021 — visible "auto-mode engaged" start line on STDOUT.
    //
    // STDOUT (not stderr) because operator visibility was the dominant
    // complaint in the v0.4 rerun: the operator's session piped or redirected
    // stderr, so the existing TTY-gated progress emitter went unseen for 45
    // min. STDOUT is not TTY-gated, survives pipes, and gives the operator a
    // single load-bearing line at start naming the budget and fall-through
    // policy.
    //
    // Format frozen at Phase B: "auto-mode engaged: N candidate pairs;
    // per-pair timeout=Xms; fall-through-after=Y\n"
    process.stdout.write(
      `auto-mode engaged: ${candidatePairs.length} candidate pairs; ` +
        `per-pair timeout=${this.timeoutMs}ms; ` +
        `fall-through-after=${this.fallThroughAfterN}\n`,
    );

    const drafts: PairedDraft[] = [];

    // C2-008: throttled per-pair progress (R-015-style). Emit at most every 5
    // pairs OR every 10s (whichever first). Without the throttle dense sections
    // (435 pairs at 10s/pair) would flood stderr; without the time floor
    // sparse sections would only print every 5*10s.
    const PAIR_INTERVAL = 5;
    const TIME_INTERVAL_MS = 10_000;
    const totalPairs = candidatePairs.length;
    let lastEmittedPair = 0;
    let lastEmittedAt = Date.now();
    let pairIndex = 0;

    // R-021 — consecutive-failure tracking for fall-through trigger. A
    // "failure" is timeout / http_error / parse_error / network_error.
    // Successful classifications (`draft`, `none`) reset the counter — even
    // an honest "no contradiction" from the model proves the call path is
    // working.
    let consecutiveFailures = 0;
    let fallThroughTriggered: {
      triggeredAtPairIndex: number;
      consecutiveTimeouts: number;
      perPairTimeoutMs: number;
      reason: 'consecutive_timeouts';
    } | null = null;
    let unprocessedFromIndex = -1; // 0-based index into candidatePairs

    for (const [i, j] of candidatePairs) {
      pairIndex += 1;
      const a = claims[i]!;
      const b = claims[j]!;
      const outcome = await this.classifyPair(a, b);

      if (outcome.kind === 'draft') {
        drafts.push({ claim_a: a, claim_b: b, draft: outcome.draft });
        consecutiveFailures = 0;
      } else if (outcome.kind === 'none') {
        consecutiveFailures = 0;
      } else {
        // Any other outcome is a failure for fall-through purposes.
        consecutiveFailures += 1;

        // Per-timeout / per-failure stderr emit — bypasses the throttle so
        // the operator sees the failure signal AS IT HAPPENS, not 4 pairs
        // later. Honors TTY/--progress contract via emitProgress.
        if (outcome.kind === 'timeout') {
          emitProgress(
            `auto-mode pair ${pairIndex}/${totalPairs} timed out at ${outcome.elapsedMs}ms`,
          );
        } else {
          emitProgress(
            `auto-mode pair ${pairIndex}/${totalPairs} failed (${outcome.kind}` +
              (outcome.kind === 'http_error' ? ` ${outcome.status}` : '') +
              `) after ${outcome.elapsedMs}ms`,
          );
        }

        if (consecutiveFailures >= this.fallThroughAfterN) {
          fallThroughTriggered = {
            triggeredAtPairIndex: pairIndex,
            consecutiveTimeouts: consecutiveFailures,
            perPairTimeoutMs: this.timeoutMs,
            reason: 'consecutive_timeouts',
          };
          unprocessedFromIndex = pairIndex; // candidatePairs index of the NEXT pair
          // Fall-through trigger is a load-bearing operator-visibility event
          // (silent mode-switching is worse than the fall-through itself).
          // Always emit to stderr regardless of --no-progress / non-TTY —
          // operators need this signal when their auto-mode bailed. The
          // per-pair-timeout lines above remain TTY-gated (routine progress);
          // the trigger event bypasses gating.
          emitProgress(
            `auto-mode fall-through: ${consecutiveFailures} consecutive timeouts at pair ` +
              `${pairIndex}; switching to heuristic for remaining ` +
              `${totalPairs - pairIndex} pairs`,
            { forceProgress: true },
          );
          break;
        }
      }

      const now = Date.now();
      const pairsSince = pairIndex - lastEmittedPair;
      const msSince = now - lastEmittedAt;
      const isLast = pairIndex === totalPairs;
      if (isLast || pairsSince >= PAIR_INTERVAL || msSince >= TIME_INTERVAL_MS) {
        emitProgress(`Classified ${pairIndex}/${totalPairs} pairs`);
        lastEmittedPair = pairIndex;
        lastEmittedAt = now;
      }
    }

    const method = fallThroughTriggered
      ? 'ollama_intern_fell_through_to_heuristic'
      : candidatePairs.length === (claims.length * (claims.length - 1)) / 2
        ? 'ollama_intern_pairwise_classification'
        : 'ollama_intern_prefiltered_pairwise_classification';

    if (fallThroughTriggered && unprocessedFromIndex >= 0) {
      const unprocessed = candidatePairs.slice(unprocessedFromIndex);
      return {
        ok: true,
        drafts,
        method,
        fallThrough: fallThroughTriggered,
        unprocessedPairs: unprocessed,
      };
    }

    return { ok: true, drafts, method };
  }
}

// Deterministic prefilter for which claim pairs are worth LLM classification.
// Returns pair indices [i,j] (i < j). A pair qualifies if EITHER:
//   - normalised-asserts token Jaccard >= 0.25 (similar topic — potential
//     tension worth checking), OR
//   - scopes both non-null AND share >= 1 token of length > 3 (claims about
//     the same scope are the canonical site of contradiction)
// A claim with empty asserts is never paired.
export function candidateContradictionPairs(claims: Claim[]): Array<[number, number]> {
  const SIM_THRESHOLD = 0.25;
  const tokenSets: Array<Set<string>> = claims.map((c) =>
    tokenSet(c.asserts),
  );
  const scopeTokens: Array<Set<string>> = claims.map((c) =>
    c.scope ? tokenSet(c.scope) : new Set<string>(),
  );

  const out: Array<[number, number]> = [];
  for (let i = 0; i < claims.length; i += 1) {
    if (tokenSets[i]!.size === 0) continue;
    for (let j = i + 1; j < claims.length; j += 1) {
      if (tokenSets[j]!.size === 0) continue;
      const sim = jaccard(tokenSets[i]!, tokenSets[j]!);
      if (sim >= SIM_THRESHOLD) {
        out.push([i, j]);
        continue;
      }
      // Scope-overlap fallback.
      const aScope = scopeTokens[i]!;
      const bScope = scopeTokens[j]!;
      if (aScope.size > 0 && bScope.size > 0) {
        let shared = 0;
        for (const t of aScope) if (bScope.has(t)) shared += 1;
        if (shared >= 1) out.push([i, j]);
      }
    }
  }
  return out;
}

function tokenSet(s: string): Set<string> {
  const out = new Set<string>();
  for (const tok of s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)) {
    if (tok.length > 3) out.add(tok);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
