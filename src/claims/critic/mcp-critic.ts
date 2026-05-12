// Phase 1b-b (v0.8.0): MCP-backed extract-time section-evidence critic.
//
// Per-claim contract:
//   - Caller hands us (sectionPurpose, claim asserts, source metadata) + a
//     live MCPClientHandle that was already opened by the surrounding
//     extractor. We DO NOT spawn a second MCP subprocess; we share the
//     extractor's connection. That keeps a single CLI invocation to one
//     subprocess lifecycle.
//   - We render the locked critic prompt template (see prompt.ts) with the
//     supplied substitutions and call ollama_extract with the locked
//     four-label schema.
//   - On success we return {label, rationale}. On any transport / parse
//     failure we return ok:false with a string error; the caller decides
//     how to log / fail-soft. A claim whose critic call fails is admitted
//     with frame_excluded=false because we cannot prove it off-topic — but
//     we DO surface the per-claim failure to the extraction summary so the
//     operator sees it.
//
// IMPORTANT: the critic runs on EVERY claim, regardless of extract's
// frame_alignment.on_topic value. Extract's frame_alignment is telemetry
// for calibration receipts; it is NEVER a decision input here. Tests
// guard this property.
//
// Tool name: `ollama_extract` (NOT `ollama_classify`). Reason: classify's
// frame contract is a 2-label "on-topic / off-topic" with a sentinel; we
// need a 4-label set plus rationale text. Extract's flexible schema is the
// right surface.

import {
  CRITIC_LABELS,
  CRITIC_RESULT_SCHEMA,
  renderCriticPrompt,
  type CriticLabel,
} from './prompt.js';

// Hard imperative the model must obey. Goes in the `hint` parameter so the
// server prepends `\nHint: ${hint}` to the prompt. The rendered template
// itself is the `text` (option β — Question-as-text). Reasoning: the locked
// prompt is a multi-line question, not a thing-being-classified — extract's
// `text` is the most natural slot, and the load-bearing imperative ("Return
// one label" + "must help answer the section purpose") already lives inside
// the template, so the hint stays narrow.
const CRITIC_HINT =
  'Decide whether the claim could be cited as evidence for the section purpose. ' +
  'Pick exactly one label from the enum and write a one-sentence rationale. ' +
  'Do not invent additional labels and do not return prose outside the schema.';

// Minimal structural type for the MCP `Client`. Mirrors the one in mcp.ts so
// we don't import the SDK Client type directly — tests substitute fakes via
// the extractor's handle injection.
export interface CriticCallToolClient {
  callTool(params: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<{ content?: Array<{ type?: string; text?: string }>; isError?: boolean }>;
}

interface CriticEnvelope {
  result?: {
    ok?: boolean;
    data?: { label?: unknown; rationale?: unknown };
    error?: string;
    raw?: string;
  };
}

export interface CriticInput {
  sectionPurpose: string;
  claimAsserts: string;
  sourceTitle?: string | null;
  sourcePublisher?: string | null;
  sourceType?: string | null;
  // Operator override threaded into ollama_extract as the per-call `model`
  // parameter. undefined means "let the MCP server pick its default" — the
  // critic should run on the same model tier as the parent extractor unless
  // the operator pinned an override.
  effectiveModel?: string;
}

export type CriticResult =
  | { ok: true; label: CriticLabel; rationale: string }
  | { ok: false; error: string };

// Type guard so we can assert string-from-JSON is a known label without an
// any-cast. Zod's enum would do the same job; we stay manual to keep this
// module dependency-light.
function isCriticLabel(v: unknown): v is CriticLabel {
  return typeof v === 'string' && (CRITIC_LABELS as readonly string[]).includes(v);
}

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Build the ollama_extract arguments for a single critic call. Exported so
// the request-shape test can assert exact bytes without exercising the full
// runCritic() flow.
export function buildCriticToolArgs(input: CriticInput): Record<string, unknown> {
  const text = renderCriticPrompt({
    sectionPurpose: input.sectionPurpose,
    claimAsserts: input.claimAsserts,
    sourceTitle: input.sourceTitle ?? null,
    sourcePublisher: input.sourcePublisher ?? null,
    sourceType: input.sourceType ?? null,
  });
  const args: Record<string, unknown> = {
    text,
    schema: CRITIC_RESULT_SCHEMA,
    hint: CRITIC_HINT,
  };
  if (input.effectiveModel !== undefined && input.effectiveModel.trim().length > 0) {
    args.model = input.effectiveModel.trim();
  }
  return args;
}

// Issue one critic call against an already-connected MCP client. The caller
// owns the client lifecycle; we just send a tool request and parse the
// envelope.
export async function runCritic(
  client: CriticCallToolClient,
  input: CriticInput,
): Promise<CriticResult> {
  const toolArgs = buildCriticToolArgs(input);

  let response: Awaited<ReturnType<CriticCallToolClient['callTool']>>;
  try {
    response = await client.callTool({ name: 'ollama_extract', arguments: toolArgs });
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

  let envelope: CriticEnvelope;
  try {
    envelope = JSON.parse(textBody) as CriticEnvelope;
  } catch {
    return { ok: false, error: 'MCP response was not valid JSON' };
  }

  const result = envelope.result;
  if (!result || typeof result !== 'object') {
    return { ok: false, error: 'MCP envelope missing result' };
  }
  if (result.ok === false) {
    return { ok: false, error: result.error ?? 'MCP ollama_extract returned ok:false' };
  }
  const data = result.data;
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'MCP envelope missing result.data' };
  }
  if (!isCriticLabel(data.label)) {
    return { ok: false, error: `MCP critic returned invalid label: ${String(data.label)}` };
  }
  const rationale = asTrimmedString(data.rationale);
  if (rationale === null) {
    return { ok: false, error: 'MCP critic returned empty rationale' };
  }
  return { ok: true, label: data.label, rationale };
}
