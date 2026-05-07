import { renderLedgerForPrompt } from '../../sources/excerpts/ledger.js';
import { normalizeOllamaHost } from '../../sources/extractors/ollama-intern.js';
import type {
  ClaimExtractionInput,
  ClaimExtractionResult,
  ClaimExtractorAdapter,
  Confidence,
  DraftClaim,
} from '../types.js';

const DEFAULT_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'hermes3:8b';
const DEFAULT_TIMEOUT_MS = 240_000;
const MAX_LEDGER_CHARS = 12_000;

// Span-first extraction prompt. The model is shown a deterministic excerpt
// ledger and asked to choose excerpt IDs — it must NOT author or paraphrase
// evidence text. research-os copies the literal text from the ledger into the
// claim's evidence_excerpt field.
const SYSTEM_PROMPT = `You are extracting atomic propositional claims from a source for a gated research pack. Return ONE JSON object: {"claims": [ ... ]}.

Each claim is an atomic, source-grounded proposition that:
- Asserts ONE thing
- Could later be cited, challenged, scoped, contradicted, or promoted into synthesis
- Is grounded in one or more LITERAL excerpt spans you select from the supplied ledger

A claim is NOT a sentence, a paragraph summary, or a generic topic restatement.

You will be given a ledger of source spans, each with a stable ID like "ex_abcdef012345_001". Pick the IDs that ground each claim. DO NOT author or paraphrase evidence text. The system fills the literal text from the ledger after you respond.

Return 3 to 7 claims per source. For each claim:
{
  "asserts": "ONE sentence stating the proposition in your own words",
  "scope": "ONE sentence naming the contextual scope of the assertion (situation, system, domain). null ONLY if the source's wording is genuinely universal.",
  "not": "ONE sentence stating what this claim is explicitly NOT about, to prevent overgeneralization. null if no such limit can be inferred.",
  "evidence_excerpt_ids": ["ex_..._001", "ex_..._002"],   // 1 or more IDs FROM THE LEDGER. Required.
  "evidence_location": "short locator like 'paragraph 3' / 'heading: Foo' / null",
  "confidence": "low" | "medium" | "high"
}

Hard rules:
- Do not fabricate. Every excerpt ID must come from the supplied ledger verbatim.
- Do not author or paraphrase evidence text — only cite excerpt IDs.
- Do not widen scope beyond what the chosen spans actually say.
- Do not synthesize across multiple claims into one — emit them separately.
- If the source genuinely makes fewer than 3 distinct propositional claims, return whatever it actually makes.`;

export interface OllamaClaimConfig {
  host?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface ChatResponse {
  message?: { content?: string };
  response?: string;
}

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

export class OllamaInternClaimExtractor implements ClaimExtractorAdapter {
  readonly name = 'ollama-intern' as const;
  private readonly host: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OllamaClaimConfig = {}) {
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

  async extract(input: ClaimExtractionInput): Promise<ClaimExtractionResult> {
    if (input.excerpts.length === 0) {
      return { ok: false, error: 'No excerpts available; ledger is empty for this source' };
    }

    const card = input.sourceCard;
    let ledgerText = renderLedgerForPrompt(input.excerpts);
    if (ledgerText.length > MAX_LEDGER_CHARS) {
      // Truncate by full lines to keep IDs intact.
      const lines = ledgerText.split('\n');
      let acc = '';
      const kept: string[] = [];
      for (const line of lines) {
        if (acc.length + line.length + 1 > MAX_LEDGER_CHARS) break;
        kept.push(line);
        acc += line.length + 1;
      }
      ledgerText = kept.join('\n');
    }

    const userMsg = `URL: ${card.url}
Source title: ${card.title}
Publisher: ${card.publisher ?? 'unknown'}
Source-card asserts: ${card.asserts}
Source-card scope: ${card.scope ?? 'null'}
Source-card not: ${card.not ?? 'null'}

EXCERPT LEDGER BEGIN
${ledgerText}
EXCERPT LEDGER END`;

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
    let parsed: { claims?: unknown };
    try {
      parsed = JSON.parse(text) as { claims?: unknown };
    } catch {
      return { ok: false, error: 'Ollama response was not valid JSON' };
    }

    if (!Array.isArray(parsed.claims)) {
      return { ok: false, error: 'Ollama response did not contain a claims array' };
    }

    const drafts: DraftClaim[] = [];
    for (const raw of parsed.claims) {
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
      });
    }

    if (drafts.length === 0) {
      return { ok: false, error: 'Ollama returned no usable claims (all missing evidence_excerpt_ids)' };
    }

    return { ok: true, claims: drafts, method: 'ollama_intern_propositional' };
  }
}
