/**
 * R-012 — LLM rescue critic (v0.12 Slice 1).
 *
 * Sequential rescue pipeline stage 2: after the deterministic eligibility
 * gate (rescue-eligibility.ts) returns passed=true on a
 * source_content_mismatch exclusion, this module asks the LLM whether
 * the claim is a legitimate aside / moderator / tangential finding from
 * a source body that otherwise supports the section topic.
 *
 * Architecture:
 * - Sequential, not parallel: the LLM runs ONLY when the deterministic
 *   eligibility gate has already accepted the claim as rescue-eligible.
 *   Operator rescue is a downstream escape valve when the LLM declines.
 * - Mirror of mcp-critic.ts: same MCP transport pattern (ollama_extract
 *   with structured schema), same error-routing discipline, same
 *   conservative-fail (any error → decline, NEVER silently rescue).
 *
 * Research grounding for the prompt design:
 * - Buçinca 2024 (contrastive framing): present both rescue + decline
 *   as parallel options with clear criteria, not as a leading question.
 * - Kim 2025 (sycophancy-under-rebuttal): the prompt frames the LLM's
 *   independent judgment, not "the precheck thinks X but maybe you
 *   disagree" — that would anchor toward agreeing with the precheck.
 *
 * Conservative fail discipline (v0.8.0 phase 1b-b correctness fix
 * carries forward): any failure mode — transport, parse, invalid label,
 * empty rationale, timeout — returns ok:false. The caller treats
 * ok:false as "LLM declined / timed out / was unavailable" and falls
 * through to the operator rescue surface (which still requires the
 * eligibility gate to pass — defense floor preserved).
 */
import {
  type CriticCallToolClient,
} from './mcp-critic.js';

// Hard imperative the model must obey. Goes in the `hint` parameter so the
// MCP server prepends it as `\nHint: ${hint}` to the rendered prompt text.
const RESCUE_HINT =
  'Decide whether the claim is a legitimate aside / moderator / tangential finding ' +
  'from a source body that otherwise supports the section topic. ' +
  'Pick exactly one label from the enum and write a one-sentence rationale. ' +
  "If you pick 'rescue', also return rescue_scope (one sentence stating what the rescue " +
  'admits — the positive claim) AND rescue_boundary (one sentence stating what the rescue ' +
  'does NOT admit — the negative constraint). Example pair: rescue_scope = ' +
  '"western-edge-of-time-zone moderator effect on motor-vehicle crash rates"; ' +
  'rescue_boundary = "not generalizing to all DST effects or other geographical moderators." ' +
  "If you pick 'decline', leave rescue_scope and rescue_boundary as null. " +
  'Do not invent additional labels and do not return prose outside the schema.';

/**
 * Maximum source-body excerpt length we hand to the LLM. Bounded to keep
 * the rescue critic call within budget on long bodies. Most real research
 * papers (5–50KB) fit comfortably; degenerate large bodies are truncated
 * — the goal is to give the LLM enough topical context to judge alignment,
 * not to reproduce the source.
 */
const MAX_RESCUE_EXCERPT_CHARS = 3000;

/**
 * Maximum number of peer asserts we surface to the LLM for context. Hick's
 * Law caution: showing 20 peer claims overwhelms the decision; showing 5
 * gives enough signal without dilution. The rescue critic's job is to
 * judge alignment, not to inventory the source.
 */
const MAX_RESCUE_PEER_CLAIMS = 5;

export interface RescueCriticInput {
  /** The section's purpose — same string passed to the LLM critic. */
  sectionPurpose: string;
  /** Asserts text of the source_content_mismatch claim under rescue review. */
  claimAsserts: string;
  /** Source-card title, publisher, source_type — for context. */
  sourceTitle?: string | null;
  sourcePublisher?: string | null;
  sourceType?: string | null;
  /** Truncated source-body excerpt — gives the LLM topical context. */
  sourceExcerpt?: string | null;
  /**
   * Asserts text of other claims from the same source that PASSED the
   * frame critic. Surfaces topical-relevance evidence to the LLM. The
   * caller pre-selects up to MAX_RESCUE_PEER_CLAIMS; the prompt renders
   * a numbered list.
   */
  peerAsserts: string[];
  /** Operator-selected model override, threaded into ollama_extract. */
  effectiveModel?: string;
}

export type RescueCriticResult =
  | {
      ok: true;
      label: 'rescue';
      rationale: string;
      rescueScope: string;
      rescueBoundary: string;
    }
  | { ok: true; label: 'decline'; rationale: string }
  | { ok: false; error: string };

const RESCUE_LABELS = ['rescue', 'decline'] as const;
type RescueLabel = (typeof RESCUE_LABELS)[number];

interface RescueEnvelope {
  result?: {
    ok?: boolean;
    data?: {
      label?: unknown;
      rationale?: unknown;
      rescue_scope?: unknown;
      rescue_boundary?: unknown;
    };
    error?: string;
    raw?: string;
  };
}

const RESCUE_RESULT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    label: {
      type: 'string',
      enum: [...RESCUE_LABELS],
    },
    rationale: { type: 'string' },
    rescue_scope: { type: ['string', 'null'] },
    rescue_boundary: { type: ['string', 'null'] },
  },
  required: ['label', 'rationale'],
};

function isRescueLabel(v: unknown): v is RescueLabel {
  return typeof v === 'string' && (RESCUE_LABELS as readonly string[]).includes(v);
}

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isPresent(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function truncateExcerpt(raw: string | null | undefined): string {
  if (!isPresent(raw)) return '(source body not available)';
  if (raw.length <= MAX_RESCUE_EXCERPT_CHARS) return raw;
  return raw.slice(0, MAX_RESCUE_EXCERPT_CHARS - 2).trimEnd() + ' …';
}

/**
 * Render the rescue-critic prompt with explicit contrastive framing.
 * Exported so the request-shape test can assert exact bytes without
 * exercising the full runRescueCritic() flow.
 */
export function renderRescuePrompt(input: RescueCriticInput): string {
  const lines: string[] = [];
  lines.push(
    'The deterministic vocabulary-overlap precheck excluded a claim from being cited',
  );
  lines.push(
    'as evidence because the claim\'s asserts text shares low lexical overlap with the',
  );
  lines.push('source body.');
  lines.push('');
  lines.push(
    `However, the same source body produced ${input.peerAsserts.length} other claim(s)`,
  );
  lines.push(
    'that DID pass the frame critic (listed below). Your job is to decide whether',
  );
  lines.push(
    "the claim under review is a legitimate aside / moderator / tangential finding from",
  );
  lines.push(
    "a source whose primary topical content otherwise supports the section topic, OR",
  );
  lines.push(
    'whether the precheck is correctly excluding content not substantively grounded in',
  );
  lines.push('this source.');
  lines.push('');
  lines.push('Section purpose:');
  lines.push(input.sectionPurpose);
  lines.push('');
  lines.push('Claim under rescue review:');
  lines.push(input.claimAsserts);
  lines.push('');
  if (isPresent(input.sourceTitle)) {
    lines.push(`Source title: ${input.sourceTitle.trim()}`);
  }
  if (isPresent(input.sourcePublisher)) {
    lines.push(`Publisher: ${input.sourcePublisher.trim()}`);
  }
  if (isPresent(input.sourceType)) {
    lines.push(`Source type: ${input.sourceType.trim()}`);
  }
  lines.push('');
  lines.push('Source body excerpt:');
  lines.push(truncateExcerpt(input.sourceExcerpt));
  lines.push('');
  lines.push('Other claims from this source that passed the frame critic:');
  if (input.peerAsserts.length === 0) {
    lines.push('  (none — but the eligibility gate said there are ≥2 such peers; the caller should not invoke rescue when peerAsserts is empty)');
  } else {
    const shown = input.peerAsserts.slice(0, MAX_RESCUE_PEER_CLAIMS);
    for (let i = 0; i < shown.length; i += 1) {
      lines.push(`  ${i + 1}. ${shown[i]}`);
    }
    if (input.peerAsserts.length > shown.length) {
      lines.push(
        `  … and ${input.peerAsserts.length - shown.length} more not shown`,
      );
    }
  }
  lines.push('');
  lines.push('Decide:');
  lines.push(
    '- rescue: the claim IS legitimately grounded in this source body, even though its',
  );
  lines.push(
    '  specific asserts text has low lexical overlap with the body. The claim represents',
  );
  lines.push(
    '  a tangential / moderator / aside finding from a source whose primary topical',
  );
  lines.push('  content otherwise supports the section topic.');
  lines.push(
    '- decline: the precheck is correct — the claim is not substantively grounded in',
  );
  lines.push(
    '  this source. Either the claim was confabulated by the upstream extractor, or it',
  );
  lines.push(
    '  is genuinely off-topic for the source even if the source as a whole is on-topic',
  );
  lines.push('  for the section.');
  lines.push('');
  lines.push(
    "If you choose 'rescue', return rescue_boundary as a one-sentence constraint",
  );
  lines.push(
    'that downstream synthesis MUST honor when citing this claim (e.g., "rescue',
  );
  lines.push(
    'limited to the moderator finding about western-edge-of-time-zone effects, not',
  );
  lines.push('the broader study claims").');
  lines.push('');
  lines.push(
    "If you choose 'decline', return rescue_boundary as null. Always return a one-sentence",
  );
  lines.push('rationale explaining your label choice.');
  return lines.join('\n');
}

/**
 * Build the ollama_extract arguments for a single rescue-critic call.
 * Exported so the request-shape test can assert exact bytes without
 * exercising the full runRescueCritic() flow.
 */
export function buildRescueCriticToolArgs(
  input: RescueCriticInput,
): Record<string, unknown> {
  const text = renderRescuePrompt(input);
  const args: Record<string, unknown> = {
    text,
    schema: RESCUE_RESULT_SCHEMA,
    hint: RESCUE_HINT,
  };
  if (isPresent(input.effectiveModel)) {
    args.model = input.effectiveModel.trim();
  }
  return args;
}

/**
 * Issue one rescue-critic call against an already-connected MCP client.
 * The caller owns the client lifecycle; we just send a tool request and
 * parse the envelope.
 *
 * Failure routing (mirrors mcp-critic.ts's policy inversion):
 *   - transport error / parse error / invalid label / empty rationale /
 *     'rescue' label with empty rescue_boundary → return ok:false.
 *   - The caller treats ok:false as "LLM declined / unavailable" and
 *     leaves the claim's rescue_status at 'not_rescued' (open for
 *     operator rescue via the CLI).
 */
export async function runRescueCritic(
  client: CriticCallToolClient,
  input: RescueCriticInput,
): Promise<RescueCriticResult> {
  const toolArgs = buildRescueCriticToolArgs(input);

  let response: Awaited<ReturnType<CriticCallToolClient['callTool']>>;
  try {
    response = await client.callTool({
      name: 'ollama_extract',
      arguments: toolArgs,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'MCP callTool failed',
    };
  }

  if (response.isError) {
    const errText = response.content?.[0]?.text ?? 'MCP tool returned isError';
    return { ok: false, error: errText };
  }

  const textBody = response.content?.[0]?.text;
  if (typeof textBody !== 'string' || textBody.length === 0) {
    return { ok: false, error: 'MCP response had no text content' };
  }

  let envelope: RescueEnvelope;
  try {
    envelope = JSON.parse(textBody) as RescueEnvelope;
  } catch {
    return { ok: false, error: 'MCP response was not valid JSON' };
  }

  const result = envelope.result;
  if (!result || typeof result !== 'object') {
    return { ok: false, error: 'MCP envelope missing result' };
  }
  if (result.ok === false) {
    return {
      ok: false,
      error: result.error ?? 'MCP ollama_extract returned ok:false',
    };
  }
  const data = result.data;
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'MCP envelope missing result.data' };
  }
  if (!isRescueLabel(data.label)) {
    return {
      ok: false,
      error: `MCP rescue critic returned invalid label: ${String(data.label)}`,
    };
  }
  const rationale = asTrimmedString(data.rationale);
  if (rationale === null) {
    return { ok: false, error: 'MCP rescue critic returned empty rationale' };
  }

  if (data.label === 'decline') {
    return { ok: true, label: 'decline', rationale };
  }

  // label === 'rescue' — require non-empty rescue_scope AND rescue_boundary.
  // Either missing on a rescue label is a contract violation; treat as a
  // failed call so the operator-rescue path picks it up. The deterministic
  // eligibility gate already passed; we don't want to silently route
  // through with no scope/boundary.
  const rescueScope = asTrimmedString(data.rescue_scope);
  const rescueBoundary = asTrimmedString(data.rescue_boundary);
  if (rescueScope === null || rescueBoundary === null) {
    return {
      ok: false,
      error:
        'MCP rescue critic returned rescue label but empty rescue_scope or rescue_boundary',
    };
  }
  return {
    ok: true,
    label: 'rescue',
    rationale,
    rescueScope,
    rescueBoundary,
  };
}
