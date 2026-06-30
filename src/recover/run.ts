// Orchestrator for the lawful recovery advisor.
//
// Pipeline (per section):
//   1. Read research.yaml + cowork handoff.
//   2. For each section in research.yaml:
//      a. diagnose() — returns SectionDiagnosis or HealthySectionResult.
//      b. If healthy: emit a `status: healthy` result, no advisor call.
//      c. Else: buildActionGraph(diagnosis) — pure function.
//      d. Call advisor with diagnosis + action graph + system_cannot_see.
//      e. If MCP/parse error → fall back to deterministic rendering.
//      f. Else: run verifier on the advice.
//          - valid: emit `advisor_path: ai_with_verifier_pass`.
//          - invalid: retry advisor ONCE with strengthened addendum
//            (without the previous rejected output, Kim 2025 mitigation).
//            - retry valid: emit `advisor_path: ai_with_retry_pass`.
//            - retry invalid OR retry MCP error → fall back.
//   3. Write recovery/blocked-section-recovery.{json,md}.
//
// Slice 3b refactor — single source of truth:
//   - `buildRecoveryArtifact()` produces the full RecoveryArtifact in-memory
//     from pre-resolved inputs (research, handoff, MCP client). Pure compute +
//     advisor calls; no file I/O.
//   - `writeRecoveryArtifact()` persists JSON + MD from an existing artifact.
//   - `recoverPack()` is a thin wrapper: read pack inputs, resolve MCP client,
//     call build + write, return summary.
//
// Both `recoverPack()` (standalone CLI) and `partialPackSynthesis()` (Slice 3b
// integration) consume `buildRecoveryArtifact()` so the canonical recovery
// artifact comes from the same in-memory object regardless of caller.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as yamlParse } from 'yaml';

import { HandoffNotFoundError, PackNotFoundError } from '../errors.js';
import { ResearchYamlSchema, type ResearchYaml } from '../intake/schema.js';
import {
  CoworkHandoffPayloadSchema,
  type CoworkHandoffPayload,
} from '../cowork/schema.js';
import { RESEARCH_OS_VERSION } from '../index.js';
import { MCPClientHandle } from '../mcp/client.js';

import { buildActionGraph } from './action-graph.js';
import { runRecoveryAdvisor } from './advisor.js';
import { diagnoseSection, isHealthy } from './diagnose.js';
import { deterministicFallbackAdvice } from './fallback.js';
import { classifyFallbackCause } from './fallback-cause.js';
import { renderRecoveryMarkdown } from './markdown.js';
import { defaultSystemCannotSee } from './prompt.js';
import {
  appendRegenerationLedgerRecord,
  archiveExistingRecoveryFiles,
  buildRegenerationLedgerRecord,
  classifyRegenerationReason,
  computeInputStateHash,
  readExistingRecoveryArtifact,
  restoreArchivedRecoveryFiles,
  type ArchiveResult,
} from './regeneration-ledger.js';
import { RecoveryArtifactSchema } from './schema.js';
import { verifyRecoveryAdvice } from './verifier.js';
import {
  RECOVERY_ARTIFACT_STATUS,
  type AdvisorPath,
  type AdviceVerificationResult,
  type HealthySectionResult,
  type RecoverPackOptions,
  type RecoverPackSummary,
  type RecoveryAdvice,
  type RecoveryArtifact,
  type RecoveryProseError,
  type RegenerationReason,
  type SectionDiagnosis,
  type SectionRecoveryResult,
} from './types.js';
import type { ProseCallToolClient } from '../synth/prose/types.js';

const RECOVERY_JSON = 'blocked-section-recovery.json';
const RECOVERY_MD = 'blocked-section-recovery.md';

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
 * Try the advisor once + verify. Returns the verified advice + path, or a
 * pair of (rejection reason, ok-or-error from MCP) for the orchestrator's
 * retry decision.
 */
async function advisorAttempt(args: {
  packTopic: string;
  packMode: string;
  diagnosis: SectionDiagnosis;
  actionGraph: ReturnType<typeof buildActionGraph>;
  systemCannotSee: string[];
  rejectionAddendum: string | null;
  client: ProseCallToolClient;
  model: string | undefined;
}): Promise<
  | { ok: true; advice: RecoveryAdvice }
  | { ok: false; mcp_error: string }
  | { ok: false; verifier: AdviceVerificationResult & { valid: false } }
> {
  const result = await runRecoveryAdvisor({
    packTopic: args.packTopic,
    packMode: args.packMode,
    diagnosis: args.diagnosis,
    actionGraph: args.actionGraph,
    systemCannotSee: args.systemCannotSee,
    rejectionAddendum: args.rejectionAddendum,
    client: args.client,
    model: args.model,
  });
  if (!result.ok) {
    return { ok: false, mcp_error: result.error };
  }
  const verification = verifyRecoveryAdvice({
    advice: result.advice,
    actionGraph: args.actionGraph,
    diagnosis: args.diagnosis,
  });
  if (verification.valid) {
    return { ok: true, advice: result.advice };
  }
  return { ok: false, verifier: { valid: false, reason: verification.reason, detail: verification.detail } };
}

/**
 * Per-section recovery. Returns the full SectionRecoveryResult + stats.
 * Single source of truth for "what did the recovery engine decide for this
 * section." Called by `buildRecoveryArtifact()` for each section.
 */
async function recoverOneSection(args: {
  packPath: string;
  packTopic: string;
  packMode: string;
  section: { id: string; purpose: string };
  handoff: CoworkHandoffPayload;
  client: ProseCallToolClient;
  model: string | undefined;
}): Promise<{
  result: SectionRecoveryResult;
  verifierRejections: number;
  wasFallback: boolean;
  wasHealthy: boolean;
}> {
  const { packPath, packTopic, packMode, section, handoff, client, model } = args;

  // Layer 1: diagnose.
  const diag = await diagnoseSection({
    packPath,
    sectionId: section.id,
    sectionPurpose: section.purpose,
    handoff,
  });

  if (isHealthy(diag)) {
    return {
      result: {
        section_id: diag.section_id,
        section_purpose: diag.section_purpose,
        status: 'healthy',
        diagnosis: null,
        action_graph: null,
        advice: null,
        advisor_path: null,
      },
      verifierRejections: 0,
      wasFallback: false,
      wasHealthy: true,
    };
  }

  // Layer 2: action graph.
  const actionGraph = buildActionGraph(diag);
  const systemCannotSee = defaultSystemCannotSee(diag);

  // Layer 3 + 4: advisor + verifier with one retry on validation failure.
  // `advice` and `advisorPath` are assigned in every branch below before use;
  // declared without initializers so ESLint's no-useless-assignment is happy.
  let advice: RecoveryAdvice;
  let advisorPath: AdvisorPath;
  let proseError: RecoveryProseError | undefined;
  let verifierRejections = 0;
  let wasFallback = false;

  const attempt1 = await advisorAttempt({
    packTopic,
    packMode,
    diagnosis: diag,
    actionGraph,
    systemCannotSee,
    rejectionAddendum: null,
    client,
    model,
  });

  if (attempt1.ok) {
    advice = attempt1.advice;
    advisorPath = 'ai_with_verifier_pass';
  } else {
    const firstReason =
      'mcp_error' in attempt1
        ? `mcp_error: ${attempt1.mcp_error}`
        : `${attempt1.verifier.reason}: ${attempt1.verifier.detail}`;
    if ('verifier' in attempt1) verifierRejections += 1;

    const attempt2 = await advisorAttempt({
      packTopic,
      packMode,
      diagnosis: diag,
      actionGraph,
      systemCannotSee,
      rejectionAddendum: firstReason,
      client,
      model,
    });

    if (attempt2.ok) {
      advice = attempt2.advice;
      advisorPath = 'ai_with_retry_pass';
    } else {
      if ('verifier' in attempt2) verifierRejections += 1;
      // Both attempts failed → deterministic fallback.
      const fallback = deterministicFallbackAdvice({ diagnosis: diag, actionGraph });
      advice = fallback;
      advisorPath = 'deterministic_fallback';
      wasFallback = true;
      const lastRejectionReason =
        'mcp_error' in attempt2
          ? `mcp_error: ${attempt2.mcp_error}`
          : `${attempt2.verifier.reason}: ${attempt2.verifier.detail}`;
      // R-010: structural cause classification + optional timing.
      // Pure read over the rejection string; no logic change.
      const { cause, timing } = classifyFallbackCause(lastRejectionReason);
      proseError = {
        code: 'advisor_verifier_exhausted',
        message:
          'Recovery advisor failed verifier checks twice. Deterministic recovery rendering applied.',
        attempts: 2,
        last_rejection_reason: lastRejectionReason,
        fallback_cause: cause,
        ...(timing ? { timing_ms: timing } : {}),
      };
    }
  }

  return {
    result: {
      section_id: diag.section_id,
      section_purpose: diag.section_purpose,
      status: 'recovery_advised',
      diagnosis: diag,
      action_graph: actionGraph,
      advice,
      advisor_path: advisorPath,
      ...(proseError ? { prose_error: proseError } : {}),
    },
    verifierRejections,
    wasFallback,
    wasHealthy: false,
  };
}

export interface BuildRecoveryArtifactInput {
  packPath: string;
  research: ResearchYaml;
  handoff: CoworkHandoffPayload;
  client: ProseCallToolClient;
  model?: string;
  // Optional override of generated_at — useful for deterministic tests.
  generatedAt?: string;
  // R-014: when supplied, embed this hash on the resulting artifact. Callers
  // that need to short-circuit on a hash-match (recoverPack with
  // `regenerateActionGraph: true`) pre-compute the hash from the diagnoses
  // and pass it through here so the persisted artifact carries it.
  inputStateHash?: string;
}

export interface BuildRecoveryArtifactOutput {
  artifact: RecoveryArtifact;
  stats: {
    advisedSections: number;
    healthySections: number;
    fallbackSections: number;
    verifierRejections: number;
  };
}

/**
 * Build the canonical recovery artifact in-memory. Pure compute + advisor
 * calls; no file I/O. Single source of truth for both `recoverPack()` and
 * `partialPackSynthesis()` (Slice 3b).
 */
export async function buildRecoveryArtifact(
  input: BuildRecoveryArtifactInput,
): Promise<BuildRecoveryArtifactOutput> {
  const { packPath, research, handoff, client, model } = input;
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  let verifierRejections = 0;
  let advisedSections = 0;
  let healthySections = 0;
  let fallbackSections = 0;
  const sectionResults: SectionRecoveryResult[] = [];
  const diagnosesForHash: Array<SectionDiagnosis | HealthySectionResult> = [];

  for (const section of research.sections) {
    const out = await recoverOneSection({
      packPath,
      packTopic: handoff.pack_topic,
      packMode: handoff.mode,
      section: { id: section.id, purpose: section.purpose },
      handoff,
      client,
      model,
    });
    sectionResults.push(out.result);
    verifierRejections += out.verifierRejections;
    if (out.wasHealthy) {
      healthySections += 1;
      diagnosesForHash.push({
        section_id: out.result.section_id,
        section_purpose: out.result.section_purpose,
        status: 'healthy',
      });
    } else {
      advisedSections += 1;
      if (out.wasFallback) fallbackSections += 1;
      if (out.result.diagnosis) diagnosesForHash.push(out.result.diagnosis);
    }
  }

  // R-014: always populate input_state_hash on the persisted artifact. The
  // hash discriminates regenerate-needed vs already-current state. Pre-R-014
  // artifacts on disk lack this field; the regenerate path treats absence
  // as "stale" via the classifier in regeneration-ledger.ts.
  const inputStateHash = input.inputStateHash ?? computeInputStateHash(diagnosesForHash);

  const artifact: RecoveryArtifact = {
    status: RECOVERY_ARTIFACT_STATUS,
    pack_id: handoff.pack_id,
    pack_topic: handoff.pack_topic,
    pack_mode: handoff.mode,
    generated_at: generatedAt,
    research_os_version: RESEARCH_OS_VERSION,
    sections: sectionResults,
    input_state_hash: inputStateHash,
  };

  RecoveryArtifactSchema.parse(artifact);

  return {
    artifact,
    stats: { advisedSections, healthySections, fallbackSections, verifierRejections },
  };
}

export interface WriteRecoveryArtifactInput {
  packPath: string;
  artifact: RecoveryArtifact;
}

export interface WriteRecoveryArtifactOutput {
  jsonPath: string;
  markdownPath: string;
}

/**
 * Persist the canonical recovery artifact as JSON + Markdown under
 * `recovery/blocked-section-recovery.{json,md}`. The single canonical write
 * path used by both `recoverPack()` and `partialPackSynthesis()`.
 */
export async function writeRecoveryArtifact(
  input: WriteRecoveryArtifactInput,
): Promise<WriteRecoveryArtifactOutput> {
  const { packPath, artifact } = input;
  const recoverDir = join(packPath, 'recovery');
  await mkdir(recoverDir, { recursive: true });
  const jsonPath = join(recoverDir, RECOVERY_JSON);
  const mdPath = join(recoverDir, RECOVERY_MD);
  await writeFile(jsonPath, JSON.stringify(artifact, null, 2), 'utf8');
  await writeFile(mdPath, renderRecoveryMarkdown(artifact), 'utf8');
  return { jsonPath, markdownPath: mdPath };
}

/**
 * R-014: pre-flight diagnose pass used by the regenerate-action-graph path
 * to compute the current state-hash WITHOUT triggering the advisor. This
 * is the work `buildRecoveryArtifact` would do anyway via `recoverOneSection`
 * — but we need the result before deciding whether to short-circuit, and
 * the per-section advisor calls (LLM) are the expensive part we want to
 * skip when state is unchanged.
 */
async function diagnoseAllSections(args: {
  packPath: string;
  research: ResearchYaml;
  handoff: CoworkHandoffPayload;
}): Promise<Array<SectionDiagnosis | HealthySectionResult>> {
  const { packPath, research, handoff } = args;
  const results: Array<SectionDiagnosis | HealthySectionResult> = [];
  for (const section of research.sections) {
    const diag = await diagnoseSection({
      packPath,
      sectionId: section.id,
      sectionPurpose: section.purpose,
      handoff,
    });
    results.push(diag);
  }
  return results;
}

export async function recoverPack(
  options: RecoverPackOptions = {},
): Promise<RecoverPackSummary> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  const { research, handoff } = await readPackInputs(packPath);
  if (!handoff) throw new HandoffNotFoundError();

  const regenerateRequested = options.regenerateActionGraph === true;

  // R-014: regenerate pre-flight. Compute the current state-hash WITHOUT
  // calling the advisor; compare with the prior artifact's input_state_hash;
  // short-circuit when the hashes match so we don't waste a model round-trip
  // (the expensive part) on a no-op regeneration. The "no regeneration
  // needed" exit explicitly does NOT mutate disk and does NOT write a
  // ledger entry — that's the operator's clean-state signal.
  let currentStateHash: string | null = null;
  let previousArtifact: RecoveryArtifact | null = null;
  let regenerationReason: RegenerationReason | null = null;
  if (regenerateRequested) {
    const diagnoses = await diagnoseAllSections({ packPath, research, handoff });
    currentStateHash = computeInputStateHash(diagnoses);
    previousArtifact = await readExistingRecoveryArtifact(packPath);
    regenerationReason = classifyRegenerationReason({
      previousArtifact,
      currentStateHash,
    });
    if (regenerationReason === null) {
      // No regeneration needed: prior artifact's hash already matches.
      process.stdout.write(
        'No regeneration needed: existing recovery output reflects current pack state ' +
          `(input_state_hash=${currentStateHash.slice(0, 12)}…). ` +
          'No files written, no ledger entry, no history archive.\n',
      );
      return {
        packPath,
        packMode: handoff.mode,
        jsonPath: join(packPath, 'recovery', 'blocked-section-recovery.json'),
        markdownPath: join(packPath, 'recovery', 'blocked-section-recovery.md'),
        totalSections: previousArtifact ? previousArtifact.sections.length : research.sections.length,
        advisedSections: previousArtifact
          ? previousArtifact.sections.filter((s) => s.status === 'recovery_advised').length
          : 0,
        healthySections: previousArtifact
          ? previousArtifact.sections.filter((s) => s.status === 'healthy').length
          : 0,
        fallbackSections: previousArtifact
          ? previousArtifact.sections.filter(
              (s) => s.advisor_path === 'deterministic_fallback',
            ).length
          : 0,
        verifierRejections: 0,
        regenerated: false,
        regenerationReason: null,
        inputStateHash: currentStateHash,
        previousInputStateHash: previousArtifact?.input_state_hash ?? null,
        archivedJsonPath: null,
        archivedMarkdownPath: null,
      };
    }
  }

  // Resolve MCP client. To keep TypeScript's flow analysis happy across
  // the closure boundary, we hold the spawned handle in an object property
  // rather than a plain `let` (the inner assignment narrows to `never`
  // otherwise).
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
      'Recovery advisor requires an MCP client. Pass `mcpClient` (tests) or `spawnMcpClient: true` (CLI).',
    );
  };

  // A-RECOVER-001: hoisted out of the try block so the catch's NAMED
  // COMPENSATOR can see whether an archive already happened. Tracks the
  // archive result of the irreversible rename so a throw after archiving
  // (write / ledger append) can restore the canonical files.
  let archive: ArchiveResult = { archivedJsonPath: null, archivedMarkdownPath: null };
  let archived = false;

  try {
    // A-RECOVER-001: make the regenerate path atomic. Resolve the MCP client
    // AND build the new artifact FIRST (all in memory — these are the steps
    // that can throw when the MCP binary is absent, ensureClient/advisor
    // fail, or the artifact fails schema validation). ONLY once the new
    // artifact exists do we perform the irreversible archive rename, then
    // immediately write + append the ledger. This guarantees we never strand
    // the canonical recovery files in history/ without a replacement and a
    // ledger entry. If a write/ledger step still throws after archiving, the
    // catch restores the archived files (named compensator).
    const client = await ensureClient();
    const { artifact, stats } = await buildRecoveryArtifact({
      packPath,
      research,
      handoff,
      client,
      model: options.advisorModel,
      inputStateHash: currentStateHash ?? undefined,
    });

    // R-014: archive existing recovery files just before writing the new ones
    // so the operator can correlate the new artifact's input_state_hash with
    // the archived predecessor's filename suffix. Only the regenerate path
    // archives; the default path overwrites in place (legacy behavior). The
    // archive now happens AFTER the (fallible) build above, so an MCP-absent
    // failure never reaches this point.
    if (regenerateRequested && regenerationReason !== null) {
      const previousHash = previousArtifact?.input_state_hash ?? null;
      archive = await archiveExistingRecoveryFiles(packPath, previousHash);
      archived = true;
    }

    const { jsonPath, markdownPath } = await writeRecoveryArtifact({ packPath, artifact });

    if (regenerateRequested && regenerationReason !== null) {
      const record = buildRegenerationLedgerRecord({
        previousArtifact,
        currentArtifact: artifact,
        previousStateHash: previousArtifact?.input_state_hash ?? null,
        newStateHash: artifact.input_state_hash ?? '',
        regenerationReason,
        archive,
      });
      await appendRegenerationLedgerRecord(packPath, record);
    }

    return {
      packPath,
      packMode: handoff.mode,
      jsonPath,
      markdownPath,
      totalSections: artifact.sections.length,
      advisedSections: stats.advisedSections,
      healthySections: stats.healthySections,
      fallbackSections: stats.fallbackSections,
      verifierRejections: stats.verifierRejections,
      ...(regenerateRequested
        ? {
            regenerated: true,
            regenerationReason,
            inputStateHash: artifact.input_state_hash,
            previousInputStateHash: previousArtifact?.input_state_hash ?? null,
            archivedJsonPath: archive.archivedJsonPath,
            archivedMarkdownPath: archive.archivedMarkdownPath,
          }
        : {}),
    };
  } catch (err) {
    // A-RECOVER-001 NAMED COMPENSATOR: if we already performed the
    // irreversible archive rename and a later step (write / ledger append)
    // threw, restore the canonical recovery files from history so they are
    // never stranded without a replacement and without a ledger entry. The
    // restore is best-effort and never clobbers a freshly written artifact;
    // we then re-throw the original error unmasked.
    if (archived) {
      await restoreArchivedRecoveryFiles(packPath, archive);
    }
    throw err;
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
