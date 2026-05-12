// LEGACY — direct-Ollama claim extractor. Replaced in v0.8.0 by the
// MCP-backed extractor at ./mcp.ts. Retained in tree for archival
// through Phase 2-5 of the v0.8.0 architecture recovery in case
// rollback is needed. NOT the default code path — see ./index.ts.

import { renderLedgerForPrompt } from '../../sources/excerpts/ledger.js';
import { normalizeOllamaHost } from '../../sources/extractors/ollama-intern.js';
import type { Excerpt } from '../../sources/excerpts/schema.js';
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
// Per-window character budget. Keeps the rendered ledger small enough that a
// 12B-class model can return JSON within DEFAULT_TIMEOUT_MS even on a modest
// rig. Larger ledgers are paged into multiple windows; claims are merged and
// deduped after.
const DEFAULT_WINDOW_CHARS = 5_000;

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
  // Per-window ledger character budget. Defaults to DEFAULT_WINDOW_CHARS.
  windowChars?: number;
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

// Split an excerpt list into windows each under windowChars, never breaking
// inside an excerpt. Deterministic — same input → same windows.
export function pageExcerpts(excerpts: Excerpt[], windowChars: number): Excerpt[][] {
  const windows: Excerpt[][] = [];
  let cursor: Excerpt[] = [];
  let cursorChars = 0;
  for (const ex of excerpts) {
    // Approximate the rendered cost: id + location_hint + ': ' + text + '\n'
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

export class OllamaInternClaimExtractor implements ClaimExtractorAdapter {
  readonly name = 'ollama-intern' as const;
  private readonly host: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly windowChars: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OllamaClaimConfig = {}) {
    this.host = normalizeOllamaHost(config.host ?? process.env.OLLAMA_HOST ?? DEFAULT_HOST);
    this.model = config.model ?? process.env.OLLAMA_INTERN_MODEL ?? DEFAULT_MODEL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const envWindow = process.env.OLLAMA_INTERN_WINDOW_CHARS;
    this.windowChars =
      config.windowChars ??
      (envWindow ? parseInt(envWindow, 10) || DEFAULT_WINDOW_CHARS : DEFAULT_WINDOW_CHARS);
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

  // One LLM call against a single ledger window. Returns drafts or an error.
  // Errors here become page-level failures; the orchestrating extract() method
  // tolerates page failures and merges drafts from successful pages.
  private async extractOnePage(
    cardSummary: string,
    ledgerText: string,
  ): Promise<{ ok: true; drafts: DraftClaim[] } | { ok: false; error: string }> {
    const userMsg = `${cardSummary}

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
          // Override Ollama's default 4096 context — the rendered ledger
          // window is sized in chars, but the prompt + system message can
          // easily exceed 4K tokens for hermes3:8b without this option,
          // and the silent server-side truncation eats excerpt IDs.
          options: { num_ctx: 8192 },
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

    // JSON.parse('null') / '[]' / '"string"' all yield valid JSON that is not
    // a usable object. Guard before dereferencing parsed.claims.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Ollama response was not a JSON object' };
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
    return { ok: true, drafts };
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
    const allDrafts: DraftClaim[] = [];
    const pageErrors: string[] = [];
    let pagesOk = 0;
    for (const window of windows) {
      const ledgerText = renderLedgerForPrompt(window);
      const page = await this.extractOnePage(cardSummary, ledgerText);
      if (!page.ok) {
        pageErrors.push(page.error);
        continue;
      }
      pagesOk += 1;
      allDrafts.push(...page.drafts);
    }

    // If every page failed, surface the most common error so the caller sees
    // the right diagnostic (HTTP 500 vs JSON parse vs timeout).
    if (pagesOk === 0) {
      const summary =
        pageErrors.length === 1
          ? pageErrors[0]!
          : `all ${windows.length} ledger pages failed (first error: ${pageErrors[0] ?? 'unknown'})`;
      return { ok: false, error: summary };
    }

    // Dedup by normalised asserts — when the same theme appears in adjacent
    // windows the model often emits parallel claims.
    const seen = new Set<string>();
    const drafts: DraftClaim[] = [];
    for (const d of allDrafts) {
      const key = d.asserts.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) continue;
      seen.add(key);
      drafts.push(d);
    }

    if (drafts.length === 0) {
      return { ok: false, error: 'Ollama returned no usable claims (all missing evidence_excerpt_ids)' };
    }

    const method =
      windows.length > 1 ? 'ollama_intern_propositional_paged' : 'ollama_intern_propositional';
    return { ok: true, claims: drafts, method };
  }
}
