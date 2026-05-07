import { normalizeOllamaHost } from '../../sources/extractors/ollama-intern.js';
import type {
  DiscoverProposal,
  DiscoverProvider,
  DiscoverProviderInput,
  DiscoverProviderResult,
} from '../types.js';
import type { SourceTypeGuess } from '../schema.js';

const DEFAULT_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'hermes3:8b';
const DEFAULT_TIMEOUT_MS = 240_000;

const SYSTEM_PROMPT = `You are proposing source URLs for a research-pack section. You produce LEADS, not evidence. The system fetches each lead and decides on its own whether the URL is real and the content is acceptable.

Return ONE JSON object: {"candidates": [...]}.

For each candidate:
{
  "url": "absolute https URL",
  "title": "short human-readable title",
  "publisher": "the entity that hosts/publishes this page, or null if unknown",
  "source_type_guess": one of "primary" | "docs" | "paper" | "standard" | "article" | "forum" | "benchmark" | "unknown",
  "why_relevant": "ONE sentence on why this source is relevant to the section purpose",
  "rank": integer 1..N where 1 is most central
}

Hard rules:
- Propose ONLY URLs you have high confidence exist. Canonical documentation, well-known papers, foundational standards, recognized authority sites. If you would have to guess, do not propose it.
- Prefer primary sources (specs, official docs, peer-reviewed papers, standards bodies) over blog posts or forum threads.
- Each URL must be a syntactically valid absolute https://… URL. No relative paths. No placeholder URLs.
- Each title must be the actual page title or a tight summary, not a generic search-keyword string.
- Be honest about source_type_guess; use "unknown" if truly unsure.
- Order by rank — most central first. Do not return more than the requested target count.
- If you cannot find enough confident candidates, return fewer. Quality over quantity.`;

export interface LlmHeuristicConfig {
  host?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface ChatResponse {
  message?: { content?: string };
  response?: string;
}

const VALID_SOURCE_TYPES: SourceTypeGuess[] = [
  'primary',
  'docs',
  'paper',
  'standard',
  'article',
  'forum',
  'benchmark',
  'unknown',
];

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : fallback;
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function asSourceType(v: unknown): SourceTypeGuess {
  return typeof v === 'string' && (VALID_SOURCE_TYPES as readonly string[]).includes(v)
    ? (v as SourceTypeGuess)
    : 'unknown';
}

export class LlmHeuristicDiscoverProvider implements DiscoverProvider {
  readonly name = 'llm-heuristic';
  private readonly host: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: LlmHeuristicConfig = {}) {
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

  async propose(input: DiscoverProviderInput): Promise<DiscoverProviderResult> {
    const userMsg = `Section: ${input.sectionId}
Section purpose: ${input.sectionPurpose}
Query: ${input.query}
Target candidate count: ${input.targetCount}

Propose source-URL candidates for this section. Quality over quantity.`;

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
    let parsed: { candidates?: unknown };
    try {
      parsed = JSON.parse(text) as { candidates?: unknown };
    } catch {
      return { ok: false, error: 'Ollama response was not valid JSON' };
    }
    if (!Array.isArray(parsed.candidates)) {
      return { ok: false, error: 'Ollama response did not contain a candidates array' };
    }

    const proposals: DiscoverProposal[] = [];
    let nextRank = 1;
    for (const raw of parsed.candidates) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const url = asString(r.url);
      const title = asString(r.title);
      const why = asString(r.why_relevant);
      if (!url || !title || !why) continue;
      const rRank = typeof r.rank === 'number' && r.rank >= 1 ? Math.floor(r.rank) : nextRank;
      proposals.push({
        url,
        title,
        publisher: asStringOrNull(r.publisher),
        source_type_guess: asSourceType(r.source_type_guess),
        why_relevant: why,
        rank: rRank,
      });
      nextRank += 1;
    }
    return { ok: true, proposals, method: 'llm_heuristic_canonical_only' };
  }
}
