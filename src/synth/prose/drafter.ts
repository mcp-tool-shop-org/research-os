// Prose synthesis drafter: generates one paragraph per role cluster.
//
// Each call is frame-bound: the model receives accepted claim text + source-card
// metadata. Raw source text / source excerpts / extracted_content are NEVER
// passed in — the accepted claim graph is the generative substrate.
//
// On MCP failure (transport, parse, invalid schema), the drafter returns
// ok:false. The caller (run.ts) decides how to handle: retry once, then mark
// the paragraph as omitted and disclose it.

import {
  DRAFTER_RESULT_SCHEMA,
  DRAFTER_HINT,
  renderDrafterPrompt,
} from './prompt.js';
import type {
  AcceptedClaimInput,
  DraftResult,
  ProseCallToolClient,
  ProseRole,
  SourceCardMeta,
} from './types.js';

interface MCPEnvelope {
  result?: {
    ok?: boolean;
    data?: unknown;
    error?: string;
  };
}

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function buildDrafterToolArgs(
  sectionPurpose: string,
  role: ProseRole,
  claims: AcceptedClaimInput[],
  sourceCards: SourceCardMeta[],
  model?: string,
): Record<string, unknown> {
  const args: Record<string, unknown> = {
    text: renderDrafterPrompt(sectionPurpose, role, claims, sourceCards),
    schema: DRAFTER_RESULT_SCHEMA,
    hint: DRAFTER_HINT,
  };
  if (model !== undefined && model.trim().length > 0) args.model = model.trim();
  return args;
}

export async function runDrafter(
  client: ProseCallToolClient,
  sectionPurpose: string,
  role: ProseRole,
  claims: AcceptedClaimInput[],
  sourceCards: SourceCardMeta[],
  model?: string,
): Promise<DraftResult> {
  if (claims.length === 0) {
    return { ok: false, error: 'empty cluster — no claims to draft from' };
  }

  const toolArgs = buildDrafterToolArgs(sectionPurpose, role, claims, sourceCards, model);

  let response: Awaited<ReturnType<ProseCallToolClient['callTool']>>;
  try {
    response = await client.callTool({ name: 'ollama_extract', arguments: toolArgs });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'MCP callTool failed' };
  }

  if (response.isError) {
    return { ok: false, error: response.content?.[0]?.text ?? 'MCP tool returned isError' };
  }

  const text = response.content?.[0]?.text;
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: false, error: 'MCP drafter response had no text content' };
  }

  let envelope: MCPEnvelope;
  try {
    envelope = JSON.parse(text) as MCPEnvelope;
  } catch {
    return { ok: false, error: 'MCP drafter response was not valid JSON' };
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

  const paragraph = asTrimmedString((data as Record<string, unknown>).paragraph);
  if (paragraph === null) {
    return { ok: false, error: 'MCP drafter returned empty paragraph' };
  }

  return { ok: true, paragraph };
}
