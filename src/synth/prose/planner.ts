// Prose synthesis planner: assigns each accepted claim to exactly one role.
//
// One batch MCP call (ollama_extract) classifies all accepted claims at once.
// The planner's contract: every claim in → every claim out, each with a role.
// Frame_excluded, rejected, needs_repair, and unreviewed claims MUST NOT enter.
// That exclusion is enforced at the call site (section-run.ts) before the
// planner is invoked — the planner trusts its input is already clean.

import {
  PLANNER_RESULT_SCHEMA,
  PLANNER_HINT,
  renderPlannerPrompt,
  PLANNER_ROLES_ENUM,
} from './prompt.js';
import type { AcceptedClaimInput, PlannerAssignment, PlannerResult, ProseCallToolClient, ProseRole } from './types.js';

interface MCPEnvelope {
  result?: {
    ok?: boolean;
    data?: unknown;
    error?: string;
  };
}

function isProseRole(v: unknown): v is ProseRole {
  return typeof v === 'string' && (PLANNER_ROLES_ENUM as readonly string[]).includes(v);
}

function extractText(
  response: { content?: Array<{ type?: string; text?: string }>; isError?: boolean },
): string | null {
  if (response.isError) return null;
  const text = response.content?.[0]?.text;
  return typeof text === 'string' && text.length > 0 ? text : null;
}

export function buildPlannerToolArgs(
  sectionPurpose: string,
  claims: AcceptedClaimInput[],
  model?: string,
): Record<string, unknown> {
  const args: Record<string, unknown> = {
    text: renderPlannerPrompt(sectionPurpose, claims),
    schema: PLANNER_RESULT_SCHEMA,
    hint: PLANNER_HINT,
  };
  if (model !== undefined && model.trim().length > 0) args.model = model.trim();
  return args;
}

export async function runPlanner(
  client: ProseCallToolClient,
  sectionPurpose: string,
  claims: AcceptedClaimInput[],
  model?: string,
): Promise<PlannerResult> {
  if (claims.length === 0) {
    return { ok: true, assignments: [] };
  }

  const toolArgs = buildPlannerToolArgs(sectionPurpose, claims, model);

  let response: Awaited<ReturnType<ProseCallToolClient['callTool']>>;
  try {
    response = await client.callTool({ name: 'ollama_extract', arguments: toolArgs });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'MCP callTool failed' };
  }

  const text = extractText(response);
  if (text === null) {
    return { ok: false, error: response.isError ? (response.content?.[0]?.text ?? 'MCP tool returned isError') : 'MCP response had no text content' };
  }

  let envelope: MCPEnvelope;
  try {
    envelope = JSON.parse(text) as MCPEnvelope;
  } catch {
    return { ok: false, error: 'MCP planner response was not valid JSON' };
  }

  const result = envelope.result;
  if (!result || typeof result !== 'object') {
    return { ok: false, error: 'MCP envelope missing result' };
  }
  if (result.ok === false) {
    return { ok: false, error: result.error ?? 'MCP ollama_extract returned ok:false' };
  }

  const data = result.data;
  if (!Array.isArray(data)) {
    return { ok: false, error: 'MCP planner result.data was not an array' };
  }

  const assignments: PlannerAssignment[] = [];
  const seenIds = new Set<string>();

  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const cid = typeof obj.claim_id === 'string' ? obj.claim_id : null;
    const role = isProseRole(obj.role) ? obj.role : null;
    if (!cid || !role) continue;
    if (seenIds.has(cid)) continue;
    seenIds.add(cid);
    assignments.push({ claim_id: cid, role });
  }

  // Fill in any claims the model omitted — default to 'evidence'.
  for (const c of claims) {
    if (!seenIds.has(c.claim_id)) {
      assignments.push({ claim_id: c.claim_id, role: 'evidence' });
    }
  }

  return { ok: true, assignments };
}
