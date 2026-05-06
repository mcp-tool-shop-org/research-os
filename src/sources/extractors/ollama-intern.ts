import type {
  Extractor,
  ExtractionInput,
  ExtractionResult,
  SourceType,
  Relevance,
} from '../types.js';

const DEFAULT_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'hermes3:8b';

export function normalizeOllamaHost(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

const SYSTEM_PROMPT = `You are an extractor for a gated research pack. Given the URL, content type, and raw text of a fetched source, return ONE JSON object with these fields and no other prose:

{
  "publisher": string | null,
  "published_at": ISO-8601 string | null,
  "title": short string,
  "source_type": "primary" | "secondary" | "forum" | "benchmark" | "docs" | "unknown",
  "relevance": "high" | "medium" | "low" | "unknown",
  "key_points": string[]    // 3-5 short factual points the source actually makes
  "limitations": string[]   // honest caveats about source quality, recency, scope
  "asserts": string         // ONE sentence summarizing what the source claims as its main thrust
  "scope": string | null    // ONE sentence naming the contextual scope of "asserts" (the situation, system, or domain to which it applies). null only if the scope is genuinely indeterminable from the source.
  "not": string | null      // ONE sentence stating what the source explicitly is NOT a claim about, to prevent overgeneralization. null if no such limit can be inferred.
}

Be strict. Do not fabricate. If the source does not state a value, leave it null. If the source argues a contextual position, "scope" must reflect that context — never widen a contextual claim into a universal one.`;

export interface OllamaConfig {
  host?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class OllamaInternExtractor implements Extractor {
  readonly name = 'ollama-intern' as const;
  private readonly host: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OllamaConfig = {}) {
    this.host = normalizeOllamaHost(config.host ?? process.env.OLLAMA_HOST ?? DEFAULT_HOST);
    this.model = config.model ?? process.env.OLLAMA_INTERN_MODEL ?? DEFAULT_MODEL;
    this.timeoutMs = config.timeoutMs ?? 60_000;
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
      return names.some((n) => n === this.model || n.startsWith(this.model.split(':')[0]));
    } catch {
      return false;
    }
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    if (!input.rawText) {
      return { ok: false, error: 'No raw text available for extraction' };
    }

    const truncated = input.rawText.slice(0, 16_000);
    const userMsg = `URL: ${input.url}\nFinal URL: ${input.finalUrl ?? input.url}\nContent-Type: ${input.contentType ?? 'unknown'}\n\nRAW TEXT BEGIN\n${truncated}\nRAW TEXT END`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);

    let body: { message?: { content?: string }; response?: string };
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
      if (!res.ok) {
        return { ok: false, error: `Ollama HTTP ${res.status}` };
      }
      body = (await res.json()) as typeof body;
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Ollama request failed',
      };
    } finally {
      clearTimeout(t);
    }

    const text = body.message?.content ?? body.response ?? '';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'Ollama response was not valid JSON' };
    }

    const sourceTypes: SourceType[] = ['primary', 'secondary', 'forum', 'benchmark', 'docs', 'unknown'];
    const relevances: Relevance[] = ['high', 'medium', 'low', 'unknown'];

    const sourceType = sourceTypes.includes(parsed.source_type as SourceType)
      ? (parsed.source_type as SourceType)
      : 'unknown';
    const relevance = relevances.includes(parsed.relevance as Relevance)
      ? (parsed.relevance as Relevance)
      : 'unknown';

    const stringOrNull = (v: unknown): string | null =>
      typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;

    const stringArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()) : [];

    return {
      ok: true,
      publisher: stringOrNull(parsed.publisher),
      published_at: stringOrNull(parsed.published_at),
      title: typeof parsed.title === 'string' && parsed.title.trim().length > 0 ? parsed.title.trim() : '(untitled)',
      source_type: sourceType,
      relevance,
      key_points: stringArray(parsed.key_points),
      limitations: stringArray(parsed.limitations),
      asserts: typeof parsed.asserts === 'string' && parsed.asserts.trim().length > 0 ? parsed.asserts.trim() : '(no assertion extracted)',
      scope: stringOrNull(parsed.scope),
      not: stringOrNull(parsed.not),
    };
  }
}
