// Partial-pack drafter — wraps a single MCP ollama_extract call that produces
// pack-level paragraphs from section prose.
//
// The drafter is strict about its inputs and outputs:
//   - Input: section paragraphs (text + role + section_paragraph_id) only.
//   - Output: pack-level paragraphs with role, text, and the section_paragraph_ids
//     each one draws from.
//   - Banned-opener guard inherited from Slice 1c: the answer paragraph must
//     not open with meta-preamble.
//   - References to section_paragraph_ids not present in the input are dropped
//     (no fabricated citations).

import {
  PARTIAL_PACK_DRAFTER_SCHEMA,
  PARTIAL_PACK_DRAFTER_HINT,
  renderPartialPackPrompt,
  BANNED_OPENERS,
} from './prompt.js';
import {
  PARTIAL_PACK_ROLES,
  type PartialPackDraftResult,
  type PartialPackRole,
  type PartialPackSectionInput,
} from './types.js';
import type { ProseCallToolClient } from '../prose/types.js';

interface MCPEnvelope {
  result?: {
    ok?: boolean;
    data?: unknown;
    error?: string;
  };
}

function hasBannedOpener(text: string): boolean {
  const lower = text.trimStart().toLowerCase();
  return (BANNED_OPENERS as readonly string[]).some((p) => lower.startsWith(p));
}

function isPartialPackRole(v: unknown): v is PartialPackRole {
  return typeof v === 'string' && (PARTIAL_PACK_ROLES as readonly string[]).includes(v);
}

export interface PartialPackDrafterInput {
  packTopic: string;
  packMode: string;
  includedSections: PartialPackSectionInput[];
  excludedSections: Array<{ section_id: string; reason: string }>;
  client: ProseCallToolClient;
  model?: string;
}

export function buildPartialPackDrafterArgs(
  input: Omit<PartialPackDrafterInput, 'client'>,
): Record<string, unknown> {
  const args: Record<string, unknown> = {
    text: renderPartialPackPrompt({
      packTopic: input.packTopic,
      packMode: input.packMode,
      includedSections: input.includedSections,
      excludedSections: input.excludedSections,
    }),
    schema: PARTIAL_PACK_DRAFTER_SCHEMA,
    hint: PARTIAL_PACK_DRAFTER_HINT,
  };
  if (input.model !== undefined && input.model.trim().length > 0) {
    args.model = input.model.trim();
  }
  return args;
}

export async function runPartialPackDrafter(
  input: PartialPackDrafterInput,
): Promise<PartialPackDraftResult> {
  if (input.includedSections.length === 0) {
    return { ok: false, error: 'no included sections — drafter requires ≥1 to generate' };
  }

  // Build the universe of valid section_paragraph_ids the drafter is allowed
  // to reference. Anything else gets dropped from support bundles.
  const validIds = new Set<string>();
  for (const s of input.includedSections) {
    for (const p of s.paragraphs) {
      validIds.add(p.section_paragraph_id);
    }
  }

  const toolArgs = buildPartialPackDrafterArgs(input);

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
    return {
      ok: false,
      error: result.error ?? 'MCP ollama_extract returned ok:false',
    };
  }

  const data = result.data as Record<string, unknown> | undefined;
  const rawParagraphs = data?.paragraphs;
  if (!Array.isArray(rawParagraphs)) {
    return { ok: false, error: 'MCP drafter result.data.paragraphs was not an array' };
  }

  const paragraphs: Array<{
    role: PartialPackRole;
    text: string;
    section_paragraph_ids: string[];
  }> = [];

  for (const raw of rawParagraphs) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    if (!isPartialPackRole(obj.role)) continue;
    const paragraphText = typeof obj.text === 'string' ? obj.text.trim() : '';
    if (paragraphText.length === 0) continue;
    const idsRaw = Array.isArray(obj.section_paragraph_ids) ? obj.section_paragraph_ids : [];
    const ids: string[] = [];
    for (const id of idsRaw) {
      if (typeof id !== 'string') continue;
      if (!validIds.has(id)) continue; // drop fabricated citations
      if (!ids.includes(id)) ids.push(id);
    }
    if (ids.length === 0) continue; // require at least one valid section paragraph
    paragraphs.push({ role: obj.role, text: paragraphText, section_paragraph_ids: ids });
  }

  if (paragraphs.length === 0) {
    return { ok: false, error: 'MCP drafter returned no usable paragraphs' };
  }

  // First paragraph must be role=answer per the dispatch's product contract.
  // If the drafter didn't put the answer first, reorder the answer to slot 0.
  const firstAnswerIdx = paragraphs.findIndex((p) => p.role === 'answer');
  if (firstAnswerIdx === -1) {
    return {
      ok: false,
      error: 'MCP drafter returned no paragraph with role=answer',
    };
  }
  if (firstAnswerIdx !== 0) {
    const [answer] = paragraphs.splice(firstAnswerIdx, 1);
    paragraphs.unshift(answer!);
  }

  // Banned-opener guard on the answer paragraph (inherited from Slice 1c).
  if (hasBannedOpener(paragraphs[0]!.text)) {
    return {
      ok: false,
      error: 'answer paragraph opens with meta-description instead of direct answer',
    };
  }

  return { ok: true, paragraphs };
}
