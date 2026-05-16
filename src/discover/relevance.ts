/**
 * Discover-time URL relevance check — v0.11 Slice 2 (R-008).
 *
 * Closes the v0.2 originating-bug shape (operator_aloneness_dst_v0.2): the
 * `llm-heuristic` discover provider returned 8 candidate URLs, 3 of which
 * were real PMC IDs that pointed to entirely unrelated papers (Andalusia
 * cancer mortality, carboxylesterase biochem, HIV-associated lymphoma) for
 * a daylight-savings-time workplace research query. The LLM provider's
 * titles and `why_relevant` strings were confabulations — same model that
 * picked the URL also picked the metadata, so they were self-supporting.
 *
 * The defense: fetch the URL's <title> tag at discover time and compare
 * it against the discover query via deterministic keyword overlap. Below
 * threshold → `topic_mismatch`. Title fetch failure → `unverified` (graceful
 * degradation; do NOT over-block on transient network issues). Above
 * threshold → `verified`.
 *
 * Pure modules. The fetcher is injectable so tests can deterministically
 * exercise the v0.2 regression replay without hitting the network.
 *
 * Reuses the *spirit* of R-003's source-card severity + clear_severities[]
 * override pattern (severity at admission layer; operator clears by explicit
 * action). The override surface here is the existing approve `--candidate
 * <id>` semantics: naming the candidate explicitly is the operator's
 * acknowledgement that they accept the relevance flag — analogous to
 * naming the severity in clear_severities[].
 */

/** Default keyword-overlap threshold (≥ this fraction of query keywords must
 * appear in the fetched title for the candidate to be `verified`). 0.2 is
 * permissive enough to admit borderline-relevant titles while definitively
 * catching the v0.2 cancer/biochem/HIV cases (overlap = 0). */
export const DEFAULT_RELEVANCE_THRESHOLD = 0.2;

/** Default per-URL fetch timeout for the title-only metadata fetch. */
export const DEFAULT_RELEVANCE_FETCH_TIMEOUT_MS = 5000;

/** Default per-discover-run cap on parallel title fetches (rate-limit guard). */
export const DEFAULT_RELEVANCE_FETCH_CONCURRENCY = 4;

/** Common English stopwords. Small list — keeps tokenization deterministic
 * without depending on a stemmer or NLP library. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'by', 'with', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could',
  'should', 'may', 'might', 'must', 'shall', 'this', 'that', 'these', 'those',
  'it', 'its', 'they', 'them', 'their', 'we', 'us', 'our', 'you', 'your',
  'he', 'she', 'his', 'her', 'who', 'what', 'when', 'where', 'why', 'how',
  'not', 'no', 'yes', 'all', 'any', 'some', 'each', 'every', 'one', 'two',
  'into', 'onto', 'over', 'under', 'between', 'across', 'within', 'without',
  'than', 'then', 'so', 'such', 'about', 'after', 'before', 'while',
]);

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&rdquo;': '”',
  '&ldquo;': '“',
};

function decodeBasicHtmlEntities(text: string): string {
  let out = text;
  for (const [ent, ch] of Object.entries(HTML_ENTITIES)) {
    out = out.split(ent).join(ch);
  }
  // Numeric entities &#NNN;
  out = out.replace(/&#(\d+);/g, (_m, n) => {
    const code = Number(n);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
  });
  return out;
}

/**
 * Tokenize text for overlap comparison. Lowercase, split on non-alphanumeric,
 * remove stopwords, drop tokens shorter than 3 chars, deduplicate. Pure.
 */
export function tokenizeForRelevance(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const raw = lower.split(/[^a-z0-9]+/).filter((t) => t.length > 0);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    if (t.length < 3) continue;
    if (STOPWORDS.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export interface KeywordOverlapResult {
  queryKeywords: string[];
  titleKeywords: string[];
  matchedKeywords: string[];
  /** matched / queryKeywords.length, in [0, 1]. 0 if either side is empty. */
  overlapScore: number;
}

/**
 * Compute keyword overlap between a fetched URL title and the discover query.
 * Strict (no stemming): "savings" and "saving" do not match. The threshold is
 * lenient enough (default 0.2) to absorb that loss; the v0.2 cancer/biochem
 * cases have zero overlap and trip the floor regardless.
 */
export function computeKeywordOverlap(
  title: string,
  query: string,
): KeywordOverlapResult {
  const queryKeywords = tokenizeForRelevance(query);
  const titleKeywords = tokenizeForRelevance(title);
  if (queryKeywords.length === 0 || titleKeywords.length === 0) {
    return { queryKeywords, titleKeywords, matchedKeywords: [], overlapScore: 0 };
  }
  const titleSet = new Set(titleKeywords);
  const matchedKeywords = queryKeywords.filter((q) => titleSet.has(q));
  const overlapScore = matchedKeywords.length / queryKeywords.length;
  return { queryKeywords, titleKeywords, matchedKeywords, overlapScore };
}

export type RelevanceStatus = 'verified' | 'unverified' | 'topic_mismatch';

export interface RelevanceCheck {
  status: RelevanceStatus;
  fetched_title: string | null;
  query_keywords: string[];
  matched_keywords: string[];
  overlap_score: number;
  threshold: number;
  error: string | null;
  checked_at: string;
}

export function assessRelevance(args: {
  fetchedTitle: string | null;
  query: string;
  threshold: number;
  fetchError: string | null;
  checkedAt?: string;
}): RelevanceCheck {
  const checked_at = args.checkedAt ?? new Date().toISOString();
  // Title fetch failed → no signal either way. Graceful degradation: the
  // candidate is `unverified`, not `topic_mismatch`. Quarantine logic in
  // `approve --top N` honors this distinction (mismatches excluded;
  // unverified eligible).
  if (args.fetchedTitle === null) {
    const overlap = computeKeywordOverlap('', args.query);
    return {
      status: 'unverified',
      fetched_title: null,
      query_keywords: overlap.queryKeywords,
      matched_keywords: [],
      overlap_score: 0,
      threshold: args.threshold,
      error: args.fetchError,
      checked_at,
    };
  }
  const overlap = computeKeywordOverlap(args.fetchedTitle, args.query);
  const status: RelevanceStatus =
    overlap.overlapScore >= args.threshold ? 'verified' : 'topic_mismatch';
  return {
    status,
    fetched_title: args.fetchedTitle,
    query_keywords: overlap.queryKeywords,
    matched_keywords: overlap.matchedKeywords,
    overlap_score: overlap.overlapScore,
    threshold: args.threshold,
    error: null,
    checked_at,
  };
}

/** Maximum response-body bytes we read while looking for the <title> tag.
 * Real-world pages place <title> in <head>, almost always within the first KB.
 * Cap protects against hostile / paginated-document responses. */
const MAX_TITLE_FETCH_BYTES = 64 * 1024;

const TITLE_REGEX = /<title[^>]*>([\s\S]*?)<\/title>/i;

/**
 * Fetch a URL and extract the <title> tag. Returns { title, error }. Never
 * throws (errors become `error` strings; title becomes null). Bounded by
 * `timeoutMs` and reads at most ~64 KB of the response body.
 */
export async function fetchUrlTitle(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ title: string | null; error: string | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        signal: ctrl.signal,
        // Hint: we only need the head of the page. Servers that honor Range
        // can short-circuit here; servers that don't will still cap at the
        // TextDecoder slice below.
        headers: { Range: 'bytes=0-65535', Accept: 'text/html,*/*' },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'fetch failed';
      return { title: null, error: message };
    }
    // Accept 200 (full body), 206 (Range honored), and other 2xx variants.
    // Anything else: treat as fetch failure (no signal).
    if (!response.ok && response.status !== 206) {
      return { title: null, error: `HTTP ${response.status}` };
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !contentType.toLowerCase().includes('text/html')) {
      // Non-HTML response: <title> tag is irrelevant. Don't synthesize a
      // title; let the assessment fall through to `unverified`.
      return { title: null, error: null };
    }
    let bodyText: string;
    try {
      const buf = await response.arrayBuffer();
      const slice = buf.byteLength > MAX_TITLE_FETCH_BYTES
        ? buf.slice(0, MAX_TITLE_FETCH_BYTES)
        : buf;
      bodyText = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(slice));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'body read failed';
      return { title: null, error: message };
    }
    const match = TITLE_REGEX.exec(bodyText);
    if (!match || !match[1]) return { title: null, error: null };
    const title = decodeBasicHtmlEntities(match[1]).replace(/\s+/g, ' ').trim();
    if (!title) return { title: null, error: null };
    return { title, error: null };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Run relevance checks over a list of (url, query) pairs in parallel,
 * bounded by `concurrency`. Returns one RelevanceCheck per input, in input
 * order. Used by the discover orchestrator after provider.propose.
 */
export async function assessRelevanceBatch(args: {
  urls: string[];
  query: string;
  fetchImpl: typeof fetch;
  threshold: number;
  fetchTimeoutMs: number;
  concurrency: number;
  now?: () => Date;
}): Promise<RelevanceCheck[]> {
  const now = args.now ?? (() => new Date());
  const out: RelevanceCheck[] = new Array(args.urls.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(args.concurrency, args.urls.length || 1)) },
    async () => {
      while (true) {
        const idx = cursor;
        cursor += 1;
        if (idx >= args.urls.length) return;
        const url = args.urls[idx]!;
        const { title, error } = await fetchUrlTitle(url, args.fetchImpl, args.fetchTimeoutMs);
        out[idx] = assessRelevance({
          fetchedTitle: title,
          query: args.query,
          threshold: args.threshold,
          fetchError: error,
          checkedAt: now().toISOString(),
        });
      }
    },
  );
  await Promise.all(workers);
  return out;
}
