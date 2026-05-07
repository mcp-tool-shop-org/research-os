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
  private readonly model: string;
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
    const drafts: PairedDraft[] = [];
    for (let i = 0; i < claims.length; i += 1) {
      for (let j = i + 1; j < claims.length; j += 1) {
        const a = claims[i]!;
        const b = claims[j]!;
        const draft = await this.classifyPair(a, b);
        if (draft) drafts.push({ claim_a: a, claim_b: b, draft });
      }
    }
    return { ok: true, drafts, method: 'ollama_intern_pairwise_classification' };
  }
}
