import { normalizeOllamaHost } from '../../sources/extractors/ollama-intern.js';
import type { Claim } from '../../claims/schema.js';
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
const DEFAULT_TIMEOUT_MS = 120_000;

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

export interface OllamaContradictionConfig {
  host?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class OllamaInternContradictionDetector implements ContradictionDetector {
  readonly name = 'ollama-intern' as const;
  private readonly host: string;
  readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OllamaContradictionConfig = {}) {
    this.host = normalizeOllamaHost(config.host ?? process.env.OLLAMA_HOST ?? DEFAULT_HOST);
    this.model = config.model ?? process.env.OLLAMA_INTERN_MODEL ?? DEFAULT_MODEL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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

  private async classifyPair(a: Claim, b: Claim): Promise<DraftContradiction | null> {
    const userMsg = [this.formatClaim('A', a), '', this.formatClaim('B', b)].join('\n');

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
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
      if (!res.ok) return null;
      body = (await res.json()) as ChatResponse;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }

    const text = body.message?.content ?? body.response ?? '';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }

    if (parsed.type === 'none' || !parsed.type) return null;

    const type = asEnum<ContradictionType>(parsed.type, VALID_TYPES, 'direct_conflict');
    if (!VALID_TYPES.includes(parsed.type as ContradictionType)) return null;

    return {
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
    const drafts: PairedDraft[] = [];
    for (const [i, j] of candidatePairs) {
      const a = claims[i]!;
      const b = claims[j]!;
      const draft = await this.classifyPair(a, b);
      if (draft) drafts.push({ claim_a: a, claim_b: b, draft });
    }
    return {
      ok: true,
      drafts,
      method:
        candidatePairs.length === (claims.length * (claims.length - 1)) / 2
          ? 'ollama_intern_pairwise_classification'
          : 'ollama_intern_prefiltered_pairwise_classification',
    };
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
