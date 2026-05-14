// Layer 3 — AI recovery advisor.
//
// Wraps a single ollama_extract call. Receives typed facts + action graph;
// returns a RecoveryAdvice object validated against the locked Zod schema.
//
// Hard constraints (enforced before the verifier even runs):
//   - The MCP response is parsed by `RecoveryAdviceSchema`. Any shape
//     mismatch (extra/missing fields, wrong types, empty required strings)
//     becomes a clean parse error returned as { ok: false }.
//   - action_ids referenced by the model that are not in our closed enum
//     fail at Zod parse — the model cannot invent vocabulary.
//   - The MCP call has no access to raw claim text or source bodies; the
//     prompt passes typed facts only.

import { RECOVERY_ADVISOR_HINT, renderRecoveryAdvisorPrompt } from './prompt.js';
import { RECOVERY_ADVICE_OUTPUT_SCHEMA, RecoveryAdviceSchema } from './schema.js';
import type {
  AdvisorCallResult,
  AdvisorMCPInput,
  RecoveryAdvice,
} from './types.js';
import type { ProseCallToolClient } from '../synth/prose/types.js';

interface MCPEnvelope {
  result?: {
    ok?: boolean;
    data?: unknown;
    error?: string;
  };
}

export interface RecoveryAdvisorInput extends AdvisorMCPInput {
  client: ProseCallToolClient;
  model?: string;
}

export function buildAdvisorToolArgs(
  input: Omit<RecoveryAdvisorInput, 'client'>,
): Record<string, unknown> {
  const args: Record<string, unknown> = {
    text: renderRecoveryAdvisorPrompt(input),
    schema: RECOVERY_ADVICE_OUTPUT_SCHEMA,
    hint: RECOVERY_ADVISOR_HINT,
  };
  if (input.model !== undefined && input.model.trim().length > 0) {
    args.model = input.model.trim();
  }
  return args;
}

export async function runRecoveryAdvisor(
  input: RecoveryAdvisorInput,
): Promise<AdvisorCallResult> {
  const toolArgs = buildAdvisorToolArgs(input);

  let response: Awaited<ReturnType<ProseCallToolClient['callTool']>>;
  try {
    response = await input.client.callTool({
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
    return {
      ok: false,
      error: response.content?.[0]?.text ?? 'MCP tool returned isError',
    };
  }

  const text = response.content?.[0]?.text;
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: false, error: 'MCP advisor response had no text content' };
  }

  let envelope: MCPEnvelope;
  try {
    envelope = JSON.parse(text) as MCPEnvelope;
  } catch {
    return { ok: false, error: 'MCP advisor response was not valid JSON' };
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

  // Parse + validate via Zod. Any failure becomes an advisor-level error
  // (separate from verifier-level rejection).
  const data = result.data;
  try {
    const advice: RecoveryAdvice = RecoveryAdviceSchema.parse(data);
    // Ensure section_id matches the one we asked about (defensive — guards
    // against the model echoing a stale id from a prior conversation).
    if (advice.section_id !== input.diagnosis.section_id) {
      return {
        ok: false,
        error: `advisor returned section_id "${advice.section_id}" — expected "${input.diagnosis.section_id}"`,
      };
    }
    return { ok: true, advice };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `advisor output failed schema validation: ${err.message}` : 'advisor output failed schema validation',
    };
  }
}
