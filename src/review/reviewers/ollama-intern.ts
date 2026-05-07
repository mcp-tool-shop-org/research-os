import { normalizeOllamaHost } from '../../sources/extractors/ollama-intern.js';
import type {
  DraftFinding,
  FindingCategory,
  FindingSeverity,
  Reviewer,
  ReviewerInput,
  ReviewerResult,
} from '../types.js';

const DEFAULT_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'hermes3:8b';
const DEFAULT_TIMEOUT_MS = 180_000;

const SYSTEM_PROMPT = `You are an adversarial reviewer for a gated research pack.

You are given a list of candidate claims with their asserts/scope/not/evidence_excerpt and source IDs. Find INTEGRITY problems. You are NOT here to synthesize; you are here to attack.

Look for:
- overgeneralized_claim: claim widens beyond what the source supports
- scope_widening: scope is broader than evidence justifies
- definition_drift: terms used differently across claims (cite the conflicting claim_ids)
- recommendation_exceeds_evidence: claim implies an action the source does not support
- hidden_synthesis: claim asserts a conclusion not present in the cited source
- temporal_mismatch: claim cites a source from a different time period than its asserts implies
- claim_overproduction: a cluster of grounded but redundant/atomized claims from one source — collectively synthesis noise. Cite all claim_ids in the cluster on a single finding.

Return ONE JSON object: {"findings": [...]}.

For each finding:
{
  "category": one of the LLM-relevant categories above (use exact strings),
  "severity": "info" | "warn" | "block",
  "summary": ONE sentence,
  "evidence": short string referencing the conflicting parts,
  "required_action": ONE sentence,
  "claim_ids": array of claim_ids that EXIST in the input — do NOT invent IDs,
  "source_ids": array of source_ids cited by those claims,
  "confidence": "low" | "medium" | "high"
}

Hard rules:
- Cite ONLY claim_ids and source_ids that appear in the input. Findings with invented IDs are rejected.
- Do not introduce new facts.
- Do not synthesize or rewrite claims.
- Do not assess "correctness" of the world; assess integrity of the claim against its source.
- If you find no problems, return {"findings": []}. A clean review is a valid result.`;

interface ChatResponse {
  message?: { content?: string };
  response?: string;
}

const VALID_CATEGORIES: FindingCategory[] = [
  'overgeneralized_claim',
  'scope_widening',
  'definition_drift',
  'recommendation_exceeds_evidence',
  'hidden_synthesis',
  'temporal_mismatch',
  'claim_overproduction',
  // The reviewer prompt uses the LLM-relevant subset; heuristic handles the others.
];

const VALID_SEVERITIES: FindingSeverity[] = ['info', 'warn', 'block'];
const VALID_CONFIDENCES = ['low', 'medium', 'high'] as const;

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter((s) => s.length > 0)
    : [];
}

export interface OllamaReviewerConfig {
  host?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class OllamaInternReviewer implements Reviewer {
  readonly name = 'ollama-intern' as const;
  private readonly host: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OllamaReviewerConfig = {}) {
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
      return names.some((n) => n === this.model || n === family || n.startsWith(`${family}:`));
    } catch {
      return false;
    }
  }

  async review(input: ReviewerInput): Promise<ReviewerResult> {
    if (input.candidateClaims.length === 0) {
      return { ok: true, drafts: [], method: 'ollama_intern_adversarial_review' };
    }

    const claimsBlock = input.candidateClaims
      .map((c) => [
        `Claim ${c.claim_id}:`,
        `  asserts: ${c.asserts}`,
        `  scope: ${c.scope ?? 'null'}`,
        `  not: ${c.not ?? 'null'}`,
        `  evidence_excerpt: ${c.evidence_excerpt}`,
        `  confidence: ${c.confidence}`,
        `  source_ids: ${c.source_ids.join(', ')}`,
      ].join('\n'))
      .join('\n\n');

    const userMsg = `Section: ${input.section.id}\nPurpose: ${input.section.purpose}\n\nCANDIDATE CLAIMS:\n\n${claimsBlock}`;

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
      if (!res.ok) return { ok: false, error: `Ollama HTTP ${res.status}` };
      body = (await res.json()) as ChatResponse;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Ollama request failed' };
    } finally {
      clearTimeout(t);
    }

    const text = body.message?.content ?? body.response ?? '';
    let parsed: { findings?: unknown };
    try {
      parsed = JSON.parse(text) as { findings?: unknown };
    } catch {
      return { ok: false, error: 'Ollama response was not valid JSON' };
    }
    if (!Array.isArray(parsed.findings)) {
      return { ok: false, error: 'Ollama response did not contain a findings array' };
    }

    const drafts: DraftFinding[] = [];
    for (const raw of parsed.findings) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const category = asEnum<FindingCategory>(r.category, VALID_CATEGORIES, 'overgeneralized_claim');
      if (!VALID_CATEGORIES.includes(r.category as FindingCategory)) continue;
      const summary = typeof r.summary === 'string' && r.summary.trim().length > 0 ? r.summary.trim() : null;
      if (!summary) continue;
      drafts.push({
        category,
        severity: asEnum<FindingSeverity>(r.severity, VALID_SEVERITIES, 'warn'),
        summary,
        evidence: typeof r.evidence === 'string' ? r.evidence.trim() : '',
        required_action: typeof r.required_action === 'string' ? r.required_action.trim() : '',
        claim_ids: asStringArray(r.claim_ids),
        source_ids: asStringArray(r.source_ids),
        confidence: asEnum(r.confidence, VALID_CONFIDENCES, 'low'),
      });
    }

    return { ok: true, drafts, method: 'ollama_intern_adversarial_review' };
  }
}
