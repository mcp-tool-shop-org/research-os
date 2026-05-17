// Prose synthesis verifier: checks each drafted paragraph for faithfulness.
//
// The verifier cannot bless a proposition merely because it could be found in
// raw source text. If an assertion is not in the support claim set, it is
// unsupported_connective — even if it is true and traceable to a source.
// When in doubt, the verifier MUST return unsupported_connective, not faithful.
// This is the conservative-exclude posture from Phase 1b-b.
//
// On failure (transport, parse, invalid decision), the verifier returns ok:false.
// The caller (run.ts) then marks the paragraph as thin_evidence and discloses
// it rather than admitting an unverified paragraph.

import {
  VERIFIER_RESULT_SCHEMA,
  VERIFIER_HINT,
  VERIFIER_DECISIONS_ENUM,
  renderVerifierPrompt,
} from './prompt.js';
import type {
  AcceptedClaimInput,
  ProseCallToolClient,
  ProseRole,
  VerifierDecision,
  VerifyResult,
} from './types.js';

interface MCPEnvelope {
  result?: {
    ok?: boolean;
    data?: unknown;
    error?: string;
  };
}

function isVerifierDecision(v: unknown): v is VerifierDecision {
  return (
    typeof v === 'string' &&
    (VERIFIER_DECISIONS_ENUM as readonly string[]).includes(v)
  );
}

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function buildVerifierToolArgs(
  sectionPurpose: string,
  role: ProseRole,
  paragraph: string,
  claims: AcceptedClaimInput[],
  model?: string,
  tierBudgetMsOverride?: number,
): Record<string, unknown> {
  const args: Record<string, unknown> = {
    text: renderVerifierPrompt(sectionPurpose, role, paragraph, claims),
    schema: VERIFIER_RESULT_SCHEMA,
    hint: VERIFIER_HINT,
  };
  if (model !== undefined && model.trim().length > 0) args.model = model.trim();
  // R-019 — forward the operator's planner-timeout budget into the MCP-side
  // tier guardrail. Same semantics as planner.ts; verifier must carry the
  // override too or TIER_TIMEOUT moves from drafter stage to verifier stage.
  if (tierBudgetMsOverride !== undefined) {
    args.tier_budget_ms_override = tierBudgetMsOverride;
  }
  return args;
}

export async function runVerifier(
  client: ProseCallToolClient,
  sectionPurpose: string,
  role: ProseRole,
  paragraph: string,
  claims: AcceptedClaimInput[],
  model?: string,
  tierBudgetMsOverride?: number,
): Promise<VerifyResult> {
  const toolArgs = buildVerifierToolArgs(sectionPurpose, role, paragraph, claims, model, tierBudgetMsOverride);

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
    return { ok: false, error: 'MCP verifier response had no text content' };
  }

  let envelope: MCPEnvelope;
  try {
    envelope = JSON.parse(text) as MCPEnvelope;
  } catch {
    return { ok: false, error: 'MCP verifier response was not valid JSON' };
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

  const obj = data as Record<string, unknown>;
  if (!isVerifierDecision(obj.decision)) {
    return { ok: false, error: `MCP verifier returned invalid decision: ${String(obj.decision)}` };
  }
  const rationale = asTrimmedString(obj.rationale);
  if (rationale === null) {
    return { ok: false, error: 'MCP verifier returned empty rationale' };
  }

  return { ok: true, decision: obj.decision, rationale };
}
