// Prose synthesis planner: assigns each accepted claim to exactly one role.
//
// Claims are processed in chunks of PLANNER_CHUNK_SIZE. Each chunk is one
// ollama_extract call (workhorse tier, 20s budget). Chunking avoids the
// timeout that occurs when many claims are batched in a single call. The
// chunk size was reduced from 10 to 5 in Slice 1f after Slice 2b's
// multi-section acceptance bed surfaced TIER_TIMEOUT on real-world 10-claim
// chunks under generation-rate variance. Merge is a deterministic set union
// keyed by claim_id.
//
// Frame_excluded, rejected, needs_repair, and unreviewed claims MUST NOT
// enter. That exclusion is enforced at the call site (section-run.ts) before
// the planner is invoked — the planner trusts its input is already clean.

import {
  PLANNER_RESULT_SCHEMA,
  PLANNER_HINT,
  renderPlannerPrompt,
  PLANNER_ROLES_ENUM,
} from './prompt.js';
import type { AcceptedClaimInput, PlannerAssignment, PlannerResult, PlannerRole, ProseCallToolClient } from './types.js';

// Maximum claims per planner MCP call. Keeps each call well within the
// workhorse tier's 20s budget for hermes3:8b with 8K context, even under
// real-world generation-rate variance.
//
// History: started at 10 in Slice 1b. Reduced to 5 in Slice 1f after
// Slice 2b's multi-section acceptance bed surfaced TIER_TIMEOUT on
// real-world 10-claim chunks (workhorse 20s + instant 15s fallback both
// exhausted). The single-section happy path was the wrong sample size for
// the product-level chunking decision; multi-section beds with substantive
// claims need headroom against generation-rate noise.
//
// Shape A regression test asserts no chunk exceeds this value AND that
// the constant is exactly 5 (locks the operationally-proven value against
// future drift).
export const PLANNER_CHUNK_SIZE = 5;

interface MCPEnvelope {
  result?: {
    ok?: boolean;
    data?: unknown;
    error?: string;
  };
}

function isPlannerRole(v: unknown): v is PlannerRole {
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
  tierBudgetMsOverride?: number,
): Record<string, unknown> {
  const args: Record<string, unknown> = {
    text: renderPlannerPrompt(sectionPurpose, claims),
    schema: PLANNER_RESULT_SCHEMA,
    hint: PLANNER_HINT,
  };
  if (model !== undefined && model.trim().length > 0) args.model = model.trim();
  // R-019 — forward the operator's planner-timeout budget into the MCP-side
  // tier guardrail so the inner runWithTimeoutAndFallback honors the
  // operator's intent. Omitted on default-path runs (preserves byte-identical
  // ollama-intern-mcp behavior for pre-R-019 callers).
  if (tierBudgetMsOverride !== undefined) {
    args.tier_budget_ms_override = tierBudgetMsOverride;
  }
  return args;
}

async function runPlannerChunk(
  client: ProseCallToolClient,
  sectionPurpose: string,
  chunk: AcceptedClaimInput[],
  model?: string,
  tierBudgetMsOverride?: number,
): Promise<{ ok: true; assignments: PlannerAssignment[] } | { ok: false; error: string }> {
  const toolArgs = buildPlannerToolArgs(sectionPurpose, chunk, model, tierBudgetMsOverride);

  let response: Awaited<ReturnType<ProseCallToolClient['callTool']>>;
  try {
    response = await client.callTool({ name: 'ollama_extract', arguments: toolArgs });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'MCP callTool failed' };
  }

  const text = extractText(response);
  if (text === null) {
    return {
      ok: false,
      error: response.isError
        ? (response.content?.[0]?.text ?? 'MCP tool returned isError')
        : 'MCP response had no text content',
    };
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

  // ollama_extract returns data as an object; the assignments live in data.assignments.
  const dataObj = result.data as Record<string, unknown> | undefined;
  const rawAssignments = dataObj?.assignments;
  if (!Array.isArray(rawAssignments)) {
    return { ok: false, error: 'MCP planner result.data.assignments was not an array' };
  }

  const assignments: PlannerAssignment[] = [];
  const seenIds = new Set<string>();

  for (const item of rawAssignments) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const cid = typeof obj.claim_id === 'string' ? obj.claim_id.trim() : null;
    const role = isPlannerRole(obj.role) ? obj.role : null;
    if (!cid || !role) continue;
    if (seenIds.has(cid)) continue;
    // role_rationale is required; reject assignment if empty or missing.
    const rationale = typeof obj.role_rationale === 'string' ? obj.role_rationale.trim() : '';
    if (rationale.length === 0) {
      return { ok: false, error: `claim ${cid} is missing role_rationale` };
    }
    seenIds.add(cid);
    assignments.push({ claim_id: cid, role, role_rationale: rationale });
  }

  return { ok: true, assignments };
}

export async function runPlanner(
  client: ProseCallToolClient,
  sectionPurpose: string,
  claims: AcceptedClaimInput[],
  model?: string,
  tierBudgetMsOverride?: number,
): Promise<PlannerResult> {
  if (claims.length === 0) {
    return { ok: true, assignments: [] };
  }

  // Split into chunks of PLANNER_CHUNK_SIZE.
  const chunks: AcceptedClaimInput[][] = [];
  for (let i = 0; i < claims.length; i += PLANNER_CHUNK_SIZE) {
    chunks.push(claims.slice(i, i + PLANNER_CHUNK_SIZE));
  }

  const allAssignments: PlannerAssignment[] = [];
  const seenIds = new Set<string>();

  for (const chunk of chunks) {
    const chunkResult = await runPlannerChunk(client, sectionPurpose, chunk, model, tierBudgetMsOverride);
    if (!chunkResult.ok) {
      return { ok: false, error: chunkResult.error };
    }
    for (const a of chunkResult.assignments) {
      if (!seenIds.has(a.claim_id)) {
        seenIds.add(a.claim_id);
        allAssignments.push(a);
      }
    }
  }

  // Fill in any claims the model omitted — default to 'evidence'.
  for (const c of claims) {
    if (!seenIds.has(c.claim_id)) {
      allAssignments.push({
        claim_id: c.claim_id,
        role: 'evidence',
        role_rationale: 'Not assigned by planner; defaulted to evidence role.',
      });
    }
  }

  return { ok: true, assignments: allAssignments };
}
