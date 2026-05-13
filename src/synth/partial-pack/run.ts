// v0.9 Slice 2 — partial-pack synthesis orchestrator.
//
// Pipeline:
//   1. Read research.yaml + cowork-handoff.json.
//   2. Classify every section as included or excluded (pure function).
//   3. If zero included: write artifact with no_included_sections proseError.
//   4. Otherwise: run partial-pack drafter against included sections' prose.
//   5. Write partial-pack-synthesis.{md,json} to synthesis/ at pack root.
//
// Hard invariants (enforced here):
//   - status is always PARTIAL_PACK_STATUS.
//   - not_freezable_as_pack and not_publishable_as_pack are always true.
//   - included_sections and excluded_sections are always present (possibly empty).
//   - Pack-level support_bundle references section_paragraph_ids only.
//   - Existing full-pack synthesis files in synthesis/ are NEVER touched —
//     this writes new files (partial-pack-synthesis.{md,json}).

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as yamlParse } from 'yaml';

import { HandoffNotFoundError, PackNotFoundError } from '../../errors.js';
import { ResearchYamlSchema, type ResearchYaml } from '../../intake/schema.js';
import {
  CoworkHandoffPayloadSchema,
  type CoworkHandoffPayload,
} from '../../cowork/schema.js';
import { RESEARCH_OS_VERSION } from '../../index.js';
import { MCPClientHandle } from '../../mcp/client.js';

import { classifySections } from './classifier.js';
import { runPartialPackDrafter } from './drafter.js';
import { renderPartialPackMarkdown } from './markdown.js';
import { PartialPackArtifactSchema } from './schema.js';
import {
  PARTIAL_PACK_STATUS,
  type PartialPackArtifact,
  type PartialPackNoIncludedSectionsError,
  type PartialPackOptions,
  type PartialPackParagraph,
  type PartialPackSummary,
} from './types.js';
import type { ProseCallToolClient } from '../prose/types.js';

const PARTIAL_PACK_JSON = 'partial-pack-synthesis.json';
const PARTIAL_PACK_MD = 'partial-pack-synthesis.md';

function paragraphId(n: number): string {
  return `pp${n + 1}`;
}

/**
 * Read research.yaml and cowork-handoff.json from the pack. Handoff is
 * optional — if missing, every section gets classified as 'unrun'.
 */
async function readPackInputs(packPath: string): Promise<{
  research: ResearchYaml;
  handoff: CoworkHandoffPayload | null;
}> {
  const yamlPath = join(packPath, 'research.yaml');
  if (!existsSync(yamlPath)) throw new PackNotFoundError(packPath);
  const research = ResearchYamlSchema.parse(yamlParse(await readFile(yamlPath, 'utf8')));

  const handoffPath = join(packPath, 'handoffs', 'cowork-handoff.json');
  let handoff: CoworkHandoffPayload | null = null;
  if (existsSync(handoffPath)) {
    handoff = CoworkHandoffPayloadSchema.parse(
      JSON.parse(await readFile(handoffPath, 'utf8')),
    );
  }
  return { research, handoff };
}

export async function partialPackSynthesis(
  options: PartialPackOptions = {},
): Promise<PartialPackSummary> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  const { research, handoff } = await readPackInputs(packPath);

  if (!handoff) {
    throw new HandoffNotFoundError();
  }

  const generatedAt = new Date().toISOString();
  const synthDir = join(packPath, 'synthesis');
  await mkdir(synthDir, { recursive: true });
  const jsonPath = join(synthDir, PARTIAL_PACK_JSON);
  const mdPath = join(synthDir, PARTIAL_PACK_MD);

  // ── Step 1: Classify ──────────────────────────────────────────────────────
  const { included, excluded, drafterInputs } = await classifySections({
    packPath,
    research,
    handoff,
  });

  const sourceSynthPaths = included.map((s) => s.section_synthesis_path);

  // ── Step 2: Zero-included-sections → honest failure marker ────────────────
  if (included.length === 0) {
    const noIncluded: PartialPackNoIncludedSectionsError = {
      code: 'no_included_sections',
      message:
        'No section has valid section-level prose. Partial-pack synthesis cannot generate without at least one included section.',
      excluded_sections: excluded,
    };
    const artifact: PartialPackArtifact = {
      status: PARTIAL_PACK_STATUS,
      scope: 'pack',
      pack_id: handoff.pack_id,
      pack_topic: handoff.pack_topic,
      pack_mode: handoff.mode,
      not_freezable_as_pack: true,
      not_publishable_as_pack: true,
      included_sections: included,
      excluded_sections: excluded,
      source_section_syntheses: sourceSynthPaths,
      prose: null,
      proseError: noIncluded,
      generated_at: generatedAt,
      research_os_version: RESEARCH_OS_VERSION,
    };
    // Validate the artifact before persistence — catches contract drift early.
    PartialPackArtifactSchema.parse(artifact);
    await writeFile(jsonPath, JSON.stringify(artifact, null, 2), 'utf8');
    await writeFile(mdPath, renderPartialPackMarkdown({ artifact }), 'utf8');

    return {
      packPath,
      packMode: handoff.mode,
      notFreezableAsPack: true,
      notPublishableAsPack: true,
      includedCount: 0,
      excludedCount: excluded.length,
      paragraphCount: 0,
      jsonPath,
      markdownPath: mdPath,
      proseGenerated: false,
      proseError: noIncluded.message,
    };
  }

  // ── Step 3: Resolve MCP client ────────────────────────────────────────────
  let resolvedClient: ProseCallToolClient | null = options.mcpClient ?? null;
  let mcpHandle: MCPClientHandle | null = null;

  if (resolvedClient === null && options.spawnMcpClient) {
    mcpHandle = new MCPClientHandle();
    const sdkClient = await mcpHandle.connect();
    resolvedClient = sdkClient as unknown as ProseCallToolClient;
  }
  if (resolvedClient === null) {
    throw new Error(
      'Partial-pack synthesis requires an MCP client. Pass `mcpClient` (tests) or `spawnMcpClient: true` (CLI).',
    );
  }

  // ── Step 4: Draft pack-level prose ────────────────────────────────────────
  let paragraphs: PartialPackParagraph[] = [];
  let proseError: string | null = null;
  try {
    const draftResult = await runPartialPackDrafter({
      packTopic: handoff.pack_topic,
      packMode: handoff.mode,
      includedSections: drafterInputs,
      excludedSections: excluded.map((e) => ({ section_id: e.section_id, reason: e.reason })),
      client: resolvedClient,
      model: options.proseModel,
    });

    if (draftResult.ok) {
      // Map drafter output → PartialPackParagraph[] with stable paragraph_ids.
      paragraphs = draftResult.paragraphs.map((d, i) => {
        // Derive section_ids from section_paragraph_ids ("<section_id>:<p_id>").
        const sectionIds: string[] = [];
        for (const spid of d.section_paragraph_ids) {
          const sid = spid.split(':')[0]!;
          if (!sectionIds.includes(sid)) sectionIds.push(sid);
        }
        const synthPaths = sectionIds.map(
          (sid) => `sections/${sid}/synthesis/section-synthesis.json`,
        );
        return {
          paragraph_id: paragraphId(i),
          role: d.role,
          text: d.text,
          support_bundle: {
            section_ids: sectionIds,
            section_paragraph_ids: d.section_paragraph_ids,
            section_synthesis_paths: synthPaths,
          },
        };
      });
    } else {
      proseError = draftResult.error;
    }
  } finally {
    if (mcpHandle) {
      try {
        await mcpHandle.close();
      } catch {
        /* swallow — cleanup only */
      }
    }
  }

  // ── Step 5: Build and persist the artifact ────────────────────────────────
  const artifact: PartialPackArtifact = {
    status: PARTIAL_PACK_STATUS,
    scope: 'pack',
    pack_id: handoff.pack_id,
    pack_topic: handoff.pack_topic,
    pack_mode: handoff.mode,
    not_freezable_as_pack: true,
    not_publishable_as_pack: true,
    included_sections: included,
    excluded_sections: excluded,
    source_section_syntheses: sourceSynthPaths,
    prose: paragraphs.length > 0 ? { paragraphs } : null,
    generated_at: generatedAt,
    research_os_version: RESEARCH_OS_VERSION,
  };

  PartialPackArtifactSchema.parse(artifact);
  await writeFile(jsonPath, JSON.stringify(artifact, null, 2), 'utf8');
  await writeFile(mdPath, renderPartialPackMarkdown({ artifact }), 'utf8');

  return {
    packPath,
    packMode: handoff.mode,
    notFreezableAsPack: true,
    notPublishableAsPack: true,
    includedCount: included.length,
    excludedCount: excluded.length,
    paragraphCount: paragraphs.length,
    jsonPath,
    markdownPath: mdPath,
    proseGenerated: paragraphs.length > 0,
    proseError,
  };
}
