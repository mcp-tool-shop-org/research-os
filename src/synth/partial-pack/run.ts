// v0.9 Slice 3b — partial-pack synthesis orchestrator with embedded recovery.
//
// Pipeline:
//   1. Read research.yaml + cowork-handoff.json.
//   2. Classify every section as included or excluded (pure function).
//   3. Resolve MCP client (now mandatory — recovery engine always runs).
//   4. Run lawful recovery for the WHOLE pack (Slice 3a engine via the
//      Slice 3b refactored buildRecoveryArtifact()). Write the canonical
//      recovery/blocked-section-recovery.{md,json} artifact. Build a map
//      from section_id to the canonical SectionRecoveryResult so each
//      excluded section gets a recovery_summary projected from the same
//      in-memory object.
//   5. Apply recovery_summary to each excluded section. If a section is
//      missing from the canonical recovery output (engine error, mismatch),
//      surface an explicit `recovery_unavailable` block — silent omission
//      is forbidden by the no-silent-skip guardrail.
//   6a. If zero included: write artifact with no_included_sections proseError,
//       still carrying recovery_summary on every excluded section.
//   6b. If ≥2 included: call bundle planner to preselect the answer
//       paragraph's required cross-section support bundle.
//       - On insufficient_cross_section_candidates: write failure marker.
//   6c. If exactly 1 included: skip bundle planner (Slice 2 behavior).
//   7. Run partial-pack drafter with the required bundle (or null for
//      single-section).
//   8. Validate the answer paragraph against the required bundle. On
//      failure, retry the drafter ONCE with a strengthened addendum.
//      On second failure, write cross_section_answer_support_missing.
//   9. Write partial-pack-synthesis.{md,json} to synthesis/ at pack root.
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
//   - Slice 3b: every excluded section in fresh output has a recovery_summary
//     populated. Either real guidance (advisor_path in {ai_with_verifier_pass,
//     ai_with_retry_pass, deterministic_fallback}) OR an explicit
//     recovery_unavailable block. NEVER silently omitted.
//   - Slice 3b: the standalone recovery/blocked-section-recovery.{md,json}
//     artifact is written from the SAME in-memory recovery object as the
//     partial-pack embed — single source of truth.

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
import {
  buildRecoveryArtifact,
  writeRecoveryArtifact,
} from '../../recover/run.js';
import type { SectionRecoveryResult } from '../../recover/types.js';

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
  projectRecoverySummary,
  recoveryUnavailableSummary,
  type RecoverySummary,
} from './recovery-embed.js';
import {
  PARTIAL_PACK_STATUS,
  type PartialPackArtifact,
  type PartialPackCrossSectionAnswerSupportMissingError,
  type PartialPackExcludedSection,
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

/**
 * Slice 3b — apply recovery_summary to every excluded section.
 *
 * The orchestrator passes a map from section_id to the canonical
 * SectionRecoveryResult produced by buildRecoveryArtifact(). For each
 * excluded section:
 *   - If the section appears in the map, project the canonical result to
 *     a compact recovery_summary.
 *   - Else, surface an explicit recovery_unavailable block with reason
 *     `engine_error` and a diagnostic detail. This honors the no-silent-skip
 *     guardrail: every excluded section in fresh output has a populated
 *     recovery_summary, even when the canonical engine failed for it.
 */
function applyRecoverySummaries(args: {
  excluded: PartialPackExcludedSection[];
  recoveryBySectionId: Map<string, SectionRecoveryResult>;
  recoveryBuildFailureDetail: string | null;
}): PartialPackExcludedSection[] {
  const { excluded, recoveryBySectionId, recoveryBuildFailureDetail } = args;

  return excluded.map((e) => {
    const recoveryResult = recoveryBySectionId.get(e.section_id);
    let recovery_summary: RecoverySummary;
    if (recoveryResult) {
      recovery_summary = projectRecoverySummary(recoveryResult);
    } else {
      // No canonical recovery result for this excluded section. Could mean:
      // - buildRecoveryArtifact threw entirely → use the failure detail
      // - the canonical artifact didn't include this section_id (mismatch)
      const detail = recoveryBuildFailureDetail
        ? `Recovery engine failed for the entire pack: ${recoveryBuildFailureDetail}`
        : `Canonical recovery artifact did not include section "${e.section_id}".`;
      recovery_summary = recoveryUnavailableSummary({
        reason: 'engine_error',
        detail,
      });
    }
    return { ...e, recovery_summary };
  });
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
  const classified = await classifySections({
    packPath,
    research,
    handoff,
  });
  const included = classified.included;
  const drafterInputs = classified.drafterInputs;

  const sourceSynthPaths = included.map((s) => s.section_synthesis_path);

  // ── Step 2: Resolve MCP client (now mandatory — recovery always runs) ─────
  // TS-narrowing trick: hold spawned handle on an object property rather than
  // a plain `let` so the inner assignment doesn't narrow to `never` across the
  // closure boundary.
  const mcpState: { handle: MCPClientHandle | null; client: ProseCallToolClient | null } = {
    handle: null,
    client: options.mcpClient ?? null,
  };
  const ensureClient = async (): Promise<ProseCallToolClient> => {
    if (mcpState.client !== null) return mcpState.client;
    if (options.spawnMcpClient) {
      mcpState.handle = new MCPClientHandle();
      const sdkClient = await mcpState.handle.connect();
      mcpState.client = sdkClient as unknown as ProseCallToolClient;
      return mcpState.client;
    }
    throw new Error(
      'Partial-pack synthesis requires an MCP client. Pass `mcpClient` (tests) or `spawnMcpClient: true` (CLI).',
    );
  };

  // Helper to write the artifact + return the summary. Wrapped here so the
  // excluded list (with recovery_summary applied) and other shared state are
  // accessible without rethreading every helper.
  const writeArtifactWith = async (args: {
    excludedWithRecovery: PartialPackExcludedSection[];
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
      excluded_sections: args.excludedWithRecovery,
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
      excludedCount: args.excludedWithRecovery.length,
      paragraphCount: args.paragraphs.length,
      jsonPath,
      markdownPath: mdPath,
      proseGenerated: args.paragraphs.length > 0,
      proseError: args.proseErrorMsg,
    };
  };

  try {
    // ── Step 3: Resolve client + run recovery + write canonical ─────────────
    const client = await ensureClient();

    // Build the canonical recovery artifact. If the engine throws entirely,
    // we don't fail the partial-pack run — we mark every excluded section's
    // recovery_summary as `recovery_unavailable` (engine_error) so the
    // operator still gets an honest partial-pack artifact + an explicit
    // admission that recovery wasn't computed.
    const recoveryBySectionId = new Map<string, SectionRecoveryResult>();
    let recoveryBuildFailureDetail: string | null = null;
    try {
      const { artifact: recoveryArtifact } = await buildRecoveryArtifact({
        packPath,
        research,
        handoff,
        client,
        model: options.proseModel,
        generatedAt,
      });
      // Persist the canonical recovery artifact — same in-memory object as
      // the embed (single source of truth).
      await writeRecoveryArtifact({ packPath, artifact: recoveryArtifact });
      for (const r of recoveryArtifact.sections) {
        recoveryBySectionId.set(r.section_id, r);
      }
    } catch (err) {
      recoveryBuildFailureDetail = err instanceof Error ? err.message : String(err);
    }

    // ── Step 4: Apply recovery_summary to excluded sections ─────────────────
    const excludedWithRecovery = applyRecoverySummaries({
      excluded: classified.excluded,
      recoveryBySectionId,
      recoveryBuildFailureDetail,
    });

    // ── Step 5: Zero-included-sections → honest failure marker ──────────────
    if (included.length === 0) {
      const noIncluded: PartialPackNoIncludedSectionsError = {
        code: 'no_included_sections',
        message:
          'No section has valid section-level prose. Partial-pack synthesis cannot generate without at least one included section.',
        excluded_sections: excludedWithRecovery,
      };
      return await writeArtifactWith({
        excludedWithRecovery,
        paragraphs: [],
        requiredAnswerBundle: null,
        proseError: noIncluded,
        proseErrorMsg: noIncluded.message,
      });
    }

    // ── Step 6: Multi-section bundle planning (Slice 2c) ────────────────────
    // For 1-included input, bundle planner is bypassed (Slice 2 behavior).
    let requiredBundle: RequiredAnswerBundle | null = null;
    if (included.length >= 2) {
      const planResult = planAnswerBundle(drafterInputs);
      if (!planResult.ok) {
        // No viable cross-section candidates — write failure marker.
        const err: PartialPackInsufficientCrossSectionCandidatesError = planResult.error;
        return await writeArtifactWith({
          excludedWithRecovery,
          paragraphs: [],
          requiredAnswerBundle: null,
          proseError: err,
          proseErrorMsg: err.message,
        });
      }
      requiredBundle = planResult.bundle;
    }

    // ── Step 7: Draft + validate + retry once ───────────────────────────────
    let paragraphs: PartialPackParagraph[] = [];
    let proseErrorMsg: string | null = null;
    let proseErrorStructured: PartialPackArtifact['proseError'] | undefined;
    const excludedForPrompt = excludedWithRecovery.map((e) => ({
      section_id: e.section_id,
      reason: e.reason,
    }));

    // First attempt.
    const attempt1 = await runOnceWithValidation({
      packTopic: handoff.pack_topic,
      packMode: handoff.mode,
      drafterInputs,
      excludedForPrompt,
      requiredBundle,
      rejectionAddendum: null,
      client,
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
        client,
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

    return await writeArtifactWith({
      excludedWithRecovery,
      paragraphs,
      requiredAnswerBundle: requiredBundle,
      proseError: proseErrorStructured,
      proseErrorMsg,
    });
  } finally {
    if (mcpState.handle) {
      try {
        await mcpState.handle.close();
      } catch {
        /* swallow — cleanup only */
      }
    }
  }
}
