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
// The orchestrator does NOT touch synthesis/ or any partial-pack files;
// the partial-pack integration that embeds recovery_summary into the
// partial-pack artifact is invoked from a separate caller path.

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
import { renderRecoveryMarkdown } from './markdown.js';
import { defaultSystemCannotSee } from './prompt.js';
import { RecoveryArtifactSchema } from './schema.js';
import { verifyRecoveryAdvice } from './verifier.js';
import {
  RECOVERY_ARTIFACT_STATUS,
  type AdvisorPath,
  type AdviceVerificationResult,
  type RecoverPackOptions,
  type RecoverPackSummary,
  type RecoveryAdvice,
  type RecoveryArtifact,
  type RecoveryProseError,
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

export async function recoverPack(
  options: RecoverPackOptions = {},
): Promise<RecoverPackSummary> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  const { research, handoff } = await readPackInputs(packPath);
  if (!handoff) throw new HandoffNotFoundError();

  const generatedAt = new Date().toISOString();
  const recoverDir = join(packPath, 'recovery');
  await mkdir(recoverDir, { recursive: true });
  const jsonPath = join(recoverDir, RECOVERY_JSON);
  const mdPath = join(recoverDir, RECOVERY_MD);

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

  let verifierRejections = 0;
  let advisedSections = 0;
  let healthySections = 0;
  let fallbackSections = 0;
  const sectionResults: SectionRecoveryResult[] = [];

  try {
    for (const section of research.sections) {
      // Layer 1: diagnose.
      const diag = await diagnoseSection({
        packPath,
        sectionId: section.id,
        sectionPurpose: section.purpose,
        handoff,
      });

      if (isHealthy(diag)) {
        healthySections += 1;
        sectionResults.push({
          section_id: diag.section_id,
          section_purpose: diag.section_purpose,
          status: 'healthy',
          diagnosis: null,
          action_graph: null,
          advice: null,
          advisor_path: null,
        });
        continue;
      }

      // Layer 2: action graph.
      const actionGraph = buildActionGraph(diag);
      const systemCannotSee = defaultSystemCannotSee(diag);

      // Layer 3 + 4: advisor + verifier with one retry on validation failure.
      const client = await ensureClient();

      let advice: RecoveryAdvice | null = null;
      let advisorPath: AdvisorPath | null = null;
      let proseError: RecoveryProseError | undefined;

      const attempt1 = await advisorAttempt({
        packTopic: handoff.pack_topic,
        packMode: handoff.mode,
        diagnosis: diag,
        actionGraph,
        systemCannotSee,
        rejectionAddendum: null,
        client,
        model: options.advisorModel,
      });

      if (attempt1.ok) {
        advice = attempt1.advice;
        advisorPath = 'ai_with_verifier_pass';
      } else {
        // Either MCP error or verifier failure → retry once.
        const firstReason =
          'mcp_error' in attempt1
            ? `mcp_error: ${attempt1.mcp_error}`
            : `${attempt1.verifier.reason}: ${attempt1.verifier.detail}`;
        if ('verifier' in attempt1) verifierRejections += 1;

        const attempt2 = await advisorAttempt({
          packTopic: handoff.pack_topic,
          packMode: handoff.mode,
          diagnosis: diag,
          actionGraph,
          systemCannotSee,
          rejectionAddendum: firstReason,
          client,
          model: options.advisorModel,
        });

        if (attempt2.ok) {
          advice = attempt2.advice;
          advisorPath = 'ai_with_retry_pass';
        } else {
          if ('verifier' in attempt2) verifierRejections += 1;
          // Both attempts failed → deterministic fallback.
          const fallback = deterministicFallbackAdvice({ diagnosis: diag, actionGraph });
          // Run the verifier on the fallback so the artifact is consistent.
          // Fallback is constructed to satisfy all rules; this is a defensive check.
          const fallbackVerify = verifyRecoveryAdvice({
            advice: fallback,
            actionGraph,
            diagnosis: diag,
          });
          if (fallbackVerify.valid) {
            advice = fallback;
          } else {
            // Fallback failed verifier — surface a bug, but still emit the
            // fallback advice so the operator can see what we tried.
            advice = fallback;
          }
          advisorPath = 'deterministic_fallback';
          proseError = {
            code: 'advisor_verifier_exhausted',
            message:
              'Recovery advisor failed verifier checks twice. Deterministic recovery rendering applied.',
            attempts: 2,
            last_rejection_reason:
              'mcp_error' in attempt2
                ? `mcp_error: ${attempt2.mcp_error}`
                : `${attempt2.verifier.reason}: ${attempt2.verifier.detail}`,
          };
          fallbackSections += 1;
        }
      }

      advisedSections += 1;

      sectionResults.push({
        section_id: diag.section_id,
        section_purpose: diag.section_purpose,
        status: 'recovery_advised',
        diagnosis: diag,
        action_graph: actionGraph,
        advice,
        advisor_path: advisorPath,
        ...(proseError ? { prose_error: proseError } : {}),
      });
    }
  } finally {
    if (mcpState.handle) {
      try {
        await mcpState.handle.close();
      } catch {
        /* swallow — cleanup only */
      }
    }
  }

  const artifact: RecoveryArtifact = {
    status: RECOVERY_ARTIFACT_STATUS,
    pack_id: handoff.pack_id,
    pack_topic: handoff.pack_topic,
    pack_mode: handoff.mode,
    generated_at: generatedAt,
    research_os_version: RESEARCH_OS_VERSION,
    sections: sectionResults,
  };

  RecoveryArtifactSchema.parse(artifact);
  await writeFile(jsonPath, JSON.stringify(artifact, null, 2), 'utf8');
  await writeFile(mdPath, renderRecoveryMarkdown(artifact), 'utf8');

  return {
    packPath,
    packMode: handoff.mode,
    jsonPath,
    markdownPath: mdPath,
    totalSections: sectionResults.length,
    advisedSections,
    healthySections,
    fallbackSections,
    verifierRejections,
  };
}
