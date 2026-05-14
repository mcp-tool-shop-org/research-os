// v0.9 Slice 2c — partial-pack synthesis orchestrator.
//
// Pipeline:
//   1. Read research.yaml + cowork-handoff.json.
//   2. Classify every section as included or excluded (pure function).
//   3a. If zero included: write artifact with no_included_sections proseError.
//   3b. If ≥2 included: call bundle planner to preselect the answer
//       paragraph's required cross-section support bundle.
//       - On insufficient_cross_section_candidates: write failure marker.
//   3c. If exactly 1 included: skip bundle planner (Slice 2 behavior).
//   4. Run partial-pack drafter with the required bundle (or null for
//      single-section).
//   5. Validate the answer paragraph against the required bundle. On
//      failure, retry the drafter ONCE with a strengthened addendum.
//      On second failure, write cross_section_answer_support_missing.
//   6. Write partial-pack-synthesis.{md,json} to synthesis/ at pack root.
//
// Hard invariants (enforced here):
//   - status is always PARTIAL_PACK_STATUS.
//   - not_freezable_as_pack and not_publishable_as_pack are always true.
//   - included_sections and excluded_sections are always present (possibly empty).
//   - Pack-level support_bundle references section_paragraph_ids only.
//   - Existing full-pack synthesis files in synthesis/ are NEVER touched —
//     this writes new files (partial-pack-synthesis.{md,json}).
//   - When ≥2 sections are included, the answer paragraph's support_bundle
//     MUST satisfy validateAnswerBundle or the drafter is retried; persistent
//     failure emits a structured proseError.

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
  planAnswerBundle,
  validateAnswerBundle,
  type AnswerBundleValidationResult,
} from './bundle-planner.js';
import {
  PARTIAL_PACK_STATUS,
  type PartialPackArtifact,
  type PartialPackCrossSectionAnswerSupportMissingError,
  type PartialPackInsufficientCrossSectionCandidatesError,
  type PartialPackNoIncludedSectionsError,
  type PartialPackOptions,
  type PartialPackParagraph,
  type PartialPackSectionInput,
  type PartialPackSummary,
  type RequiredAnswerBundle,
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

/**
 * Map a drafter call's raw paragraphs into the persisted PartialPackParagraph
 * shape. Derives section_ids from each paragraph's section_paragraph_ids and
 * assigns stable pp1.. paragraph_ids.
 */
function mapDrafterOutput(
  rawParagraphs: Array<{ role: string; text: string; section_paragraph_ids: string[] }>,
): PartialPackParagraph[] {
  return rawParagraphs.map((d, i) => {
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
      // Drafter only produces roles in PartialPackRole — coerce by trust.
      role: d.role as PartialPackParagraph['role'],
      text: d.text,
      support_bundle: {
        section_ids: sectionIds,
        section_paragraph_ids: d.section_paragraph_ids,
        section_synthesis_paths: synthPaths,
      },
    };
  });
}

/**
 * Run the drafter once and validate its answer paragraph. Returns the
 * mapped paragraphs + the validation outcome for the orchestrator to act on.
 */
async function runOnceWithValidation(args: {
  packTopic: string;
  packMode: string;
  drafterInputs: PartialPackSectionInput[];
  excludedForPrompt: Array<{ section_id: string; reason: string }>;
  requiredBundle: RequiredAnswerBundle | null;
  rejectionAddendum: string | null;
  client: ProseCallToolClient;
  model: string | undefined;
  includedCount: number;
}): Promise<
  | {
      ok: true;
      paragraphs: PartialPackParagraph[];
      validation: AnswerBundleValidationResult;
    }
  | { ok: false; error: string }
> {
  const draftResult = await runPartialPackDrafter({
    packTopic: args.packTopic,
    packMode: args.packMode,
    includedSections: args.drafterInputs,
    excludedSections: args.excludedForPrompt,
    requiredAnswerBundle: args.requiredBundle,
    rejectionAddendum: args.rejectionAddendum,
    client: args.client,
    model: args.model,
  });
  if (!draftResult.ok) {
    return { ok: false, error: draftResult.error };
  }
  const paragraphs = mapDrafterOutput(draftResult.paragraphs);
  if (paragraphs.length === 0) {
    return { ok: false, error: 'drafter produced no usable paragraphs' };
  }
  const answerPara = paragraphs[0]!;
  const validation = validateAnswerBundle({
    answerSupportSectionIds: answerPara.support_bundle.section_ids,
    answerSupportSectionParagraphIds: answerPara.support_bundle.section_paragraph_ids,
    required: args.requiredBundle,
    includedSectionsCount: args.includedCount,
  });
  return { ok: true, paragraphs, validation };
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

  // Helper to write the artifact + return the summary.
  const writeArtifact = async (args: {
    paragraphs: PartialPackParagraph[];
    requiredAnswerBundle: RequiredAnswerBundle | null;
    proseError?: PartialPackArtifact['proseError'];
    proseErrorMsg: string | null;
  }): Promise<PartialPackSummary> => {
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
      required_answer_bundle: args.requiredAnswerBundle,
      prose: args.paragraphs.length > 0 ? { paragraphs: args.paragraphs } : null,
      ...(args.proseError ? { proseError: args.proseError } : {}),
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
      paragraphCount: args.paragraphs.length,
      jsonPath,
      markdownPath: mdPath,
      proseGenerated: args.paragraphs.length > 0,
      proseError: args.proseErrorMsg,
    };
  };

  // ── Step 2: Zero-included-sections → honest failure marker ────────────────
  if (included.length === 0) {
    const noIncluded: PartialPackNoIncludedSectionsError = {
      code: 'no_included_sections',
      message:
        'No section has valid section-level prose. Partial-pack synthesis cannot generate without at least one included section.',
      excluded_sections: excluded,
    };
    return writeArtifact({
      paragraphs: [],
      requiredAnswerBundle: null,
      proseError: noIncluded,
      proseErrorMsg: noIncluded.message,
    });
  }

  // ── Step 3: Multi-section bundle planning (Slice 2c) ──────────────────────
  // For 1-included input, bundle planner is bypassed (Slice 2 behavior).
  let requiredBundle: RequiredAnswerBundle | null = null;
  if (included.length >= 2) {
    const planResult = planAnswerBundle(drafterInputs);
    if (!planResult.ok) {
      // No viable cross-section candidates — write failure marker. Bundle is
      // null because there was no bundle to construct.
      const err: PartialPackInsufficientCrossSectionCandidatesError = planResult.error;
      return writeArtifact({
        paragraphs: [],
        requiredAnswerBundle: null,
        proseError: err,
        proseErrorMsg: err.message,
      });
    }
    requiredBundle = planResult.bundle;
  }

  // ── Step 4: Resolve MCP client ────────────────────────────────────────────
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

  // ── Step 5: Draft + validate + retry once ─────────────────────────────────
  let paragraphs: PartialPackParagraph[] = [];
  let proseErrorMsg: string | null = null;
  let proseErrorStructured: PartialPackArtifact['proseError'] | undefined;
  const excludedForPrompt = excluded.map((e) => ({ section_id: e.section_id, reason: e.reason }));

  try {
    // First attempt.
    const attempt1 = await runOnceWithValidation({
      packTopic: handoff.pack_topic,
      packMode: handoff.mode,
      drafterInputs,
      excludedForPrompt,
      requiredBundle,
      rejectionAddendum: null,
      client: resolvedClient,
      model: options.proseModel,
      includedCount: included.length,
    });

    if (!attempt1.ok) {
      // Drafter call failed entirely; no usable paragraphs to persist.
      proseErrorMsg = attempt1.error;
    } else if (attempt1.validation.valid) {
      paragraphs = attempt1.paragraphs;
    } else {
      // Validation failed — retry ONCE with strengthened addendum.
      const firstFailureReason = attempt1.validation.detail;
      const attempt2 = await runOnceWithValidation({
        packTopic: handoff.pack_topic,
        packMode: handoff.mode,
        drafterInputs,
        excludedForPrompt,
        requiredBundle,
        rejectionAddendum: firstFailureReason,
        client: resolvedClient,
        model: options.proseModel,
        includedCount: included.length,
      });

      if (attempt2.ok && attempt2.validation.valid) {
        paragraphs = attempt2.paragraphs;
      } else {
        // Persistent failure — emit structured proseError. Keep the second
        // attempt's paragraphs (or empty) so the operator can see what the
        // model produced, but flag it as failed and don't claim success.
        const answerPara = attempt2.ok ? attempt2.paragraphs[0] : attempt1.paragraphs[0];
        const observedIds = answerPara?.support_bundle.section_paragraph_ids ?? [];
        const finalReason = attempt2.ok && !attempt2.validation.valid
          ? attempt2.validation.detail
          : attempt2.ok
          ? 'unknown validation failure on retry'
          : attempt2.error;
        const err: PartialPackCrossSectionAnswerSupportMissingError = {
          code: 'cross_section_answer_support_missing',
          message:
            'Drafter failed to produce an answer paragraph citing the required cross-section support bundle after one retry.',
          required_section_paragraph_ids: requiredBundle?.required_section_paragraph_ids ?? [],
          observed_section_paragraph_ids: observedIds,
          final_reason: finalReason,
        };
        proseErrorStructured = err;
        proseErrorMsg = err.message;
        // Intentionally leave `paragraphs` empty so the artifact's prose is
        // null — operators see honest failure, not silently-admitted prose
        // that violated the contract.
      }
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

  return writeArtifact({
    paragraphs,
    requiredAnswerBundle: requiredBundle,
    proseError: proseErrorStructured,
    proseErrorMsg,
  });
}
