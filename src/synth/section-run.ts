/**
 * v0.7.1 — section-scoped synthesis.
 *
 * Partial-synthesis path: produces a section-scoped artifact for a single
 * gate-eligible section while the parent pack is in `repair_required` mode.
 * Failed sections stay in the pack as evidence; the pack itself does NOT
 * become freezable or publishable as a whole.
 *
 * Hard rules (enforced here and in tests):
 * - Only allowed if the named section has `synthesis_eligible: true` in the
 *   cowork handoff.
 * - Uses ONLY claims from `handoff.accepted_claim_ids` that belong to the
 *   target section.
 * - Writes to `sections/<id>/synthesis/`, never the pack-level `synthesis/`.
 * - Does NOT mutate cowork handoff, claims.jsonl, gate results, or other
 *   sections' directories.
 * - Does NOT change freeze / publish behavior — both continue to refuse the
 *   pack as a whole until every section is ready.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as yamlParse } from 'yaml';

import {
  HandoffNotFoundError,
  PackNotFoundError,
  ResearchOSError,
  SectionNotFoundError,
} from '../errors.js';
import { ResearchYamlSchema, type ResearchYaml } from '../intake/schema.js';
import { ClaimSchema, type Claim } from '../claims/schema.js';
import { SourceCardSchema, type SourceCard } from '../sources/schema.js';
import {
  CoworkHandoffPayloadSchema,
  type CoworkHandoffPayload,
} from '../cowork/schema.js';
import { RESEARCH_OS_VERSION } from '../index.js';
import { MCPClientHandle } from '../mcp/client.js';

import { runProseSynthesis } from './prose/run.js';
import { renderSectionSynthesisMarkdown, renderNoAnswerClusterMarker } from './prose/markdown.js';
import {
  DEFAULT_PLANNER_TIMEOUT_MS,
  formatPlannerTimeoutLogLine,
} from './prose/types.js';
import type {
  AcceptedClaimInput,
  PlannerTimeoutSource,
  ProseCallToolClient,
  ProseNoAnswerClusterError,
  SourceCardMeta,
  WaiverMeta,
} from './prose/types.js';
// R-020 — single source of truth for the no_answer_cluster recovery actions
// lives in the recover action graph; this import lets the failure body be
// decorated inline at the moment runProseSynthesis returns the bare error.
import { getNoAnswerClusterRecoveryActions } from '../recover/action-graph.js';
import type { SectionSynthesisOptions, SectionSynthesisSummary } from './types.js';

type SectionState = ReturnType<typeof CoworkHandoffPayloadSchema.parse>['sections'][number];

async function readJsonl<T>(path: string, parse: (raw: unknown) => T): Promise<T[]> {
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const out: T[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    out.push(parse(JSON.parse(line)));
  }
  return out;
}

async function readSectionSourceCards(packPath: string, sourceIds: Set<string>): Promise<SourceCard[]> {
  const dir = join(packPath, 'evidence', 'source-cards');
  if (!existsSync(dir)) return [];
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir);
  const cards: SourceCard[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const text = await readFile(join(dir, entry), 'utf8');
    const card = SourceCardSchema.parse(JSON.parse(text));
    if (sourceIds.has(card.source_id)) cards.push(card);
  }
  return cards;
}

/**
 * Refuse with structured detail when the target section is not eligible.
 * Reason naming intentionally mirrors handoff `blocking_reasons` so operators
 * see consistent vocabulary across handoff + section synth output.
 */
export class SectionNotSynthesisEligibleError extends ResearchOSError {
  constructor(
    public readonly sectionId: string,
    public readonly blockingReasons: string[],
  ) {
    const reasons =
      blockingReasons.length === 0
        ? 'no blocking_reasons recorded — section may have never been gated; run `research-os gate` first.'
        : blockingReasons.join(' | ');
    super(
      `Section "${sectionId}" is not synthesis-eligible. Cannot produce section-scoped synthesis. Blocking: ${reasons}`,
      'SECTION_NOT_SYNTHESIS_ELIGIBLE',
      'Resolve the section\'s blocking gate failures, or pick a section with synthesis_eligible=true in handoffs/cowork-handoff.json.',
    );
    this.name = 'SectionNotSynthesisEligibleError';
  }
}

interface SectionSynthesisManifest {
  status: 'partial_synthesis';
  scope: 'section';
  section_id: string;
  section_purpose: string;
  pack_id: string;
  pack_topic: string;
  pack_mode: string;
  not_freezable_as_pack: true;
  not_publishable_as_pack: true;
  accepted_claim_ids: string[];
  source_ids: string[];
  waivers_applied: Array<{
    scope: 'pack' | 'gate';
    family: string;
    reason: string;
    compensating_controls: string[];
    applied_to: string;
  }>;
  gate_verdict: string | null;
  generated_at: string;
  research_os_version: string;
  /**
   * R-018 (v0.12.1) — active planner-timeout in milliseconds. Always
   * populated. Default runs record DEFAULT_PLANNER_TIMEOUT_MS (15000ms);
   * override runs record the resolved override value.
   */
  planner_timeout_ms: number;
  /**
   * R-018 (v0.12.1) — origin of the active planner-timeout value. Present
   * only when the operator supplied an override; absent on default runs.
   */
  planner_timeout_overridden_by?: Exclude<PlannerTimeoutSource, 'default'>;
}

function buildManifest(args: {
  research: ResearchYaml;
  handoff: CoworkHandoffPayload;
  handoffSection: SectionState;
  acceptedClaims: Claim[];
  sourceIds: string[];
  generatedAt: string;
  plannerTimeoutMs: number;
  plannerTimeoutSource: PlannerTimeoutSource;
}): SectionSynthesisManifest {
  const {
    research,
    handoff,
    handoffSection,
    acceptedClaims,
    sourceIds,
    generatedAt,
    plannerTimeoutMs,
    plannerTimeoutSource,
  } = args;
  const section = research.sections.find((s) => s.id === handoffSection.section_id);
  // Waivers that apply to this section: pack-scope waivers, or gate-scope
  // waivers whose applied_to mentions this section. Audit-trail only — we do
  // not validate the waiver here; that already happened in gate run.
  const waivers = handoff.waivers.filter(
    (w) => w.scope === 'pack' || w.applied_to.includes(handoffSection.section_id),
  );
  // Mirror cross-section-map's waiver_dependencies shape (compensating_controls
  // included) so downstream readers can normalize either source.
  return {
    status: 'partial_synthesis',
    scope: 'section',
    section_id: handoffSection.section_id,
    section_purpose: section?.purpose ?? handoffSection.purpose,
    pack_id: handoff.pack_id,
    pack_topic: handoff.pack_topic,
    pack_mode: handoff.mode,
    not_freezable_as_pack: true,
    not_publishable_as_pack: true,
    accepted_claim_ids: acceptedClaims.map((c) => c.claim_id),
    source_ids: sourceIds,
    waivers_applied: waivers.map((w) => ({
      scope: w.scope,
      family: w.family,
      reason: w.reason,
      compensating_controls: w.compensating_controls,
      applied_to: w.applied_to,
    })),
    gate_verdict: handoffSection.gate_verdict,
    generated_at: generatedAt,
    research_os_version: RESEARCH_OS_VERSION,
    planner_timeout_ms: plannerTimeoutMs,
    ...(plannerTimeoutSource !== 'default'
      ? { planner_timeout_overridden_by: plannerTimeoutSource }
      : {}),
  };
}

function renderSectionBrief(manifest: SectionSynthesisManifest, acceptedClaims: Claim[], cards: SourceCard[]): string {
  const lines: string[] = [];
  lines.push(`# Section Synthesis (Partial): \`${manifest.section_id}\``);
  lines.push('');
  lines.push('> **This is a partial section-scoped synthesis. The parent pack is in repair_required mode. This artifact is NOT a pack-level synthesis and the pack is NOT freezable or publishable.**');
  lines.push('>');
  lines.push('> Failed and unrun sections in the same pack remain preserved as evidence. They are not touched by this command. Pack-level `synth workspace`, `freeze`, and `pack publish` continue to refuse until every section is ready.');
  lines.push('');
  lines.push(`**Pack:** ${manifest.pack_topic}`);
  lines.push(`**Pack ID:** \`${manifest.pack_id}\``);
  lines.push(`**Pack mode:** \`${manifest.pack_mode}\``);
  lines.push(`**Section purpose:** ${manifest.section_purpose}`);
  lines.push(`**Section gate verdict:** ${manifest.gate_verdict ?? '_(no gate run recorded)_'}`);
  lines.push(`**Accepted claims:** ${manifest.accepted_claim_ids.length}`);
  lines.push(`**Sources referenced:** ${manifest.source_ids.length}`);
  lines.push(`**Generated:** ${manifest.generated_at}`);
  lines.push(`**research-os version:** \`${manifest.research_os_version}\``);
  lines.push('');

  lines.push('## Scope of this artifact');
  lines.push('');
  lines.push('- Cites ONLY accepted claims from this section.');
  lines.push('- Does NOT speak for any other section in the pack.');
  lines.push('- Does NOT make the pack freezable.');
  lines.push('- Does NOT make the pack publishable.');
  lines.push('- Cannot be used as evidence that the pack passed full synthesis review.');
  lines.push('');

  lines.push('## Accepted claims');
  lines.push('');
  if (acceptedClaims.length === 0) {
    lines.push('_(none — section had `synthesis_eligible=true` but no accepted claims were forwarded by the handoff. This is an unusual shape; verify before drafting.)_');
  } else {
    for (const c of acceptedClaims) {
      lines.push(`- \`${c.claim_id}\` — ${c.asserts}`);
      lines.push(`  - Scope: ${c.scope === null ? '_(universal)_' : c.scope}`);
      lines.push(`  - Not: ${c.not === null ? '_(none)_' : c.not}`);
      lines.push(`  - Sources: ${c.source_ids.map((sid) => `\`${sid}\``).join(', ')}`);
      lines.push(`  - Evidence excerpt: ${c.evidence_excerpt.slice(0, 240)}${c.evidence_excerpt.length > 240 ? '…' : ''}`);
    }
  }
  lines.push('');

  lines.push('## Sources cited');
  lines.push('');
  if (cards.length === 0) {
    lines.push('_(none — no source cards matched the accepted claims; verify before drafting.)_');
  } else {
    for (const card of cards) {
      lines.push(`- \`${card.source_id}\` — ${card.title || card.url}`);
      lines.push(`  - Publisher: ${card.publisher ?? '_(unknown)_'}`);
      lines.push(`  - Type: ${card.source_type}`);
      lines.push(`  - URL: ${card.url}`);
    }
  }
  lines.push('');

  lines.push('## Waivers active for this section');
  lines.push('');
  if (manifest.waivers_applied.length === 0) {
    lines.push('_None._');
  } else {
    for (const w of manifest.waivers_applied) {
      lines.push(`- **${w.scope}.${w.family}** applied to \`${w.applied_to}\``);
      lines.push(`  - Reason: ${w.reason}`);
      if (w.compensating_controls.length === 0) {
        lines.push('  - Compensating controls: _(none recorded)_');
      } else {
        for (const cc of w.compensating_controls) lines.push(`  - Compensating: ${cc}`);
      }
    }
  }
  lines.push('');

  lines.push('## Pack-level state (for transparency)');
  lines.push('');
  lines.push(`- Pack mode: \`${manifest.pack_mode}\``);
  lines.push('- Sibling sections may be preserved-as-evidence or unrun. They are deliberately untouched by this command.');
  lines.push('- Pack-level `freeze`, `pack publish`, and unflagged `synth workspace` all continue to refuse this pack as a whole.');
  lines.push('');

  lines.push('## Guardrails for any downstream prose drafted from this artifact');
  lines.push('');
  lines.push('- Cite only `claim_id` values listed under "Accepted claims" above.');
  lines.push('- Do not assert pack-level conclusions; this is a single-section view.');
  lines.push('- Disclose every active waiver from "Waivers active for this section" above.');
  lines.push('- Do not represent this artifact as a frozen pack or as a complete answer to the pack\'s decision question.');
  lines.push('');

  lines.push('## Provenance');
  lines.push('');
  lines.push('- This artifact was generated by `research-os synth section <id>`.');
  lines.push(`- It lives at \`sections/${manifest.section_id}/synthesis/section-brief.md\` and \`sections/${manifest.section_id}/synthesis/section-synthesis.json\`.`);
  lines.push('- Pack-level synthesis output (when the pack reaches `synthesis_ready`) goes to `synthesis/` at the pack root — a separate directory.');
  lines.push('');

  return lines.join('\n');
}

export async function sectionSynthesis(
  options: SectionSynthesisOptions,
): Promise<SectionSynthesisSummary> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  const yamlPath = join(packPath, 'research.yaml');
  if (!existsSync(yamlPath)) throw new PackNotFoundError(packPath);
  const research: ResearchYaml = ResearchYamlSchema.parse(
    yamlParse(await readFile(yamlPath, 'utf8')),
  );

  const handoffPath = join(packPath, 'handoffs', 'cowork-handoff.json');
  if (!existsSync(handoffPath)) throw new HandoffNotFoundError();
  const handoff: CoworkHandoffPayload = CoworkHandoffPayloadSchema.parse(
    JSON.parse(await readFile(handoffPath, 'utf8')),
  );

  const sectionExists = research.sections.some((s) => s.id === options.sectionId);
  if (!sectionExists) throw new SectionNotFoundError(options.sectionId);

  const handoffSection = handoff.sections.find((s) => s.section_id === options.sectionId);
  if (!handoffSection) {
    // Pack has the section but the handoff doesn't carry an entry for it —
    // common when handoff predates section_add. Treat as not-eligible.
    throw new SectionNotSynthesisEligibleError(options.sectionId, [
      `No handoff entry for section "${options.sectionId}". Run 'research-os cowork handoff' to refresh.`,
    ]);
  }

  if (!handoffSection.synthesis_eligible) {
    throw new SectionNotSynthesisEligibleError(
      options.sectionId,
      handoffSection.blocking_reasons.length > 0
        ? handoffSection.blocking_reasons
        : ['section is not synthesis_eligible per cowork handoff'],
    );
  }

  // Filter pack-wide accepted_claim_ids down to this section. Use the
  // section-state's accepted_claim_ids directly; cross-check against the
  // pack-level list to catch any divergence (defensive — handoff producer
  // already enforces this, but the gate JSON is the source of truth).
  const sectionAcceptedIds = new Set(handoffSection.accepted_claim_ids);
  const packAcceptedIds = new Set(handoff.accepted_claim_ids);
  const acceptedIdsForThisSection = handoffSection.accepted_claim_ids.filter((id) =>
    packAcceptedIds.has(id),
  );

  // Read claims for ONLY this section. We do not load other sections'
  // claims.jsonl — section synthesis is by-construction section-scoped.
  const sectionClaims = await readJsonl<Claim>(
    join(packPath, 'sections', options.sectionId, 'claims.jsonl'),
    (r) => ClaimSchema.parse(r),
  );
  const acceptedClaims = sectionClaims.filter((c) => sectionAcceptedIds.has(c.claim_id));

  // Source IDs referenced by accepted claims (deduped, sorted for determinism).
  const sourceIdSet = new Set<string>();
  for (const c of acceptedClaims) {
    for (const sid of c.source_ids) sourceIdSet.add(sid);
  }
  const sortedSourceIds = [...sourceIdSet].sort();
  const cards = await readSectionSourceCards(packPath, sourceIdSet);

  // R-018 (v0.12.1) — resolve the active planner-timeout from options. The
  // CLI surface (cli.ts) calls resolvePlannerTimeout(...) and forwards the
  // already-resolved numeric value + source through SectionSynthesisOptions.
  // When options omit both fields (legacy callers / tests), default to
  // DEFAULT_PLANNER_TIMEOUT_MS / 'default'.
  const plannerTimeoutMs = options.plannerTimeoutMs ?? DEFAULT_PLANNER_TIMEOUT_MS;
  const plannerTimeoutSource: PlannerTimeoutSource =
    options.plannerTimeoutSource ?? 'default';
  // R-018.6 — emit a single-line, grep-friendly stderr summary of the
  // active planner-timeout configuration BEFORE prose generation begins.
  // Operators can `2>&1 | grep planner_timeout_ms=` to see what budget was
  // in effect for a given run. The line goes to stderr so it does not
  // pollute stdout (which carries the structured CLI summary).
  process.stderr.write(
    `${formatPlannerTimeoutLogLine({ value: plannerTimeoutMs, source: plannerTimeoutSource })} section=${options.sectionId}\n`,
  );

  const generatedAt = new Date().toISOString();
  const manifest = buildManifest({
    research,
    handoff,
    handoffSection,
    acceptedClaims,
    sourceIds: sortedSourceIds,
    generatedAt,
    plannerTimeoutMs,
    plannerTimeoutSource,
  });

  const synthDir = join(packPath, 'sections', options.sectionId, 'synthesis');
  await mkdir(synthDir, { recursive: true });
  const jsonPath = join(synthDir, 'section-synthesis.json');
  const mdPath = join(synthDir, 'section-brief.md');
  const proseMdPath = join(synthDir, 'section-synthesis.md');

  // Write section-brief.md and section-synthesis.json (existing behavior, preserved).
  await writeFile(jsonPath, JSON.stringify(manifest, null, 2), 'utf8');
  await writeFile(mdPath, renderSectionBrief(manifest, acceptedClaims, cards), 'utf8');

  // ── Prose synthesis (v0.9 slice 1) ─────────────────────────────────────────
  // Build clean prose inputs — only accepted_for_synthesis claims. Frame_excluded,
  // rejected, needs_repair, and unreviewed claims were already excluded above when
  // we filtered to sectionAcceptedIds (which comes from handoff.accepted_claim_ids).
  const proseClaimInputs: AcceptedClaimInput[] = acceptedClaims.map((c) => ({
    claim_id: c.claim_id,
    asserts: c.asserts,
    scope: c.scope,
    not: c.not,
    source_ids: c.source_ids,
    confidence: c.confidence,
  }));

  const proseSourceCards: SourceCardMeta[] = cards.map((c) => ({
    source_id: c.source_id,
    title: c.title ?? null,
    publisher: c.publisher ?? null,
    source_type: c.source_type,
    url: c.url,
  }));

  const proseWaivers: WaiverMeta[] = manifest.waivers_applied.map((w, i) => ({
    waiver_id: `w${i + 1}`,
    family: w.family,
    reason: w.reason,
    applied_to: w.applied_to,
  }));

  let proseGenerated = false;
  let proseMarkdownPath: string | null = null;
  let proseError: string | null = null;
  let noAnswerCluster: ProseNoAnswerClusterError | undefined;

  // Resolve the MCP client. Use injected client (tests) or spawn MCPClientHandle
  // only when options.spawnMcpClient === true (CLI path). Tests that predate
  // prose synthesis call sectionSynthesis without either option; they get prose
  // skipped immediately rather than hanging on a subprocess connect.
  let resolvedClient: ProseCallToolClient | null = options.mcpClient ?? null;
  let mcpHandle: MCPClientHandle | null = null;

  if (resolvedClient === null && options.spawnMcpClient) {
    try {
      mcpHandle = new MCPClientHandle();
      const sdkClient = await mcpHandle.connect();
      resolvedClient = sdkClient as unknown as ProseCallToolClient;
    } catch (err) {
      proseError = `MCP unavailable: ${err instanceof Error ? err.message : String(err)}`;
    }
  } else if (resolvedClient === null) {
    proseError = 'prose skipped: no mcpClient provided';
  }

  if (resolvedClient !== null) {
    try {
      const proseResult = await runProseSynthesis({
        sectionPurpose: manifest.section_purpose,
        acceptedClaims: proseClaimInputs,
        sourceCards: proseSourceCards,
        waivers: proseWaivers,
        gateVerdict: manifest.gate_verdict,
        packMode: manifest.pack_mode,
        client: resolvedClient,
        model: options.proseModel,
        plannerTimeoutMs,
        plannerTimeoutSource,
      });

      if (proseResult.ok) {
        // Overwrite section-synthesis.json with the prose block added.
        await writeFile(
          jsonPath,
          JSON.stringify({ ...manifest, prose: proseResult.block }, null, 2),
          'utf8',
        );
        // Write section-synthesis.md.
        const proseMd = renderSectionSynthesisMarkdown({
          sectionId: options.sectionId,
          sectionPurpose: manifest.section_purpose,
          packMode: manifest.pack_mode,
          gateVerdict: manifest.gate_verdict,
          waiversApplied: manifest.waivers_applied,
          proseBlock: proseResult.block,
          generatedAt,
          researchOsVersion: manifest.research_os_version,
        });
        await writeFile(proseMdPath, proseMd, 'utf8');
        proseMarkdownPath = proseMdPath;
        proseGenerated = true;
      } else {
        proseError = proseResult.error;
        noAnswerCluster = proseResult.noAnswerCluster;
        if (noAnswerCluster) {
          // R-020 — decorate the bare error with inline recovery actions so
          // the JSON artifact + markdown render BOTH surface actionable
          // commands at the point the failure is written, not only via a
          // separate `research-os recover` invocation. Same source of truth
          // as buildActionGraph's prose_error_no_answer_cluster case.
          noAnswerCluster = {
            ...noAnswerCluster,
            recovery_actions: getNoAnswerClusterRecoveryActions(options.sectionId),
          };
          // R-020 — single-line stderr hint at the moment no_answer_cluster
          // fires. Mirrors R-015's [extract] progress pattern; gives the
          // operator immediate signal without parsing markdown.
          process.stderr.write(
            `[synth] no_answer_cluster — see section-synthesis.md "Recovery actions" block for actionable steps\n`,
          );
          // Write structured error to JSON so operators can inspect the planner rationale.
          await writeFile(
            jsonPath,
            JSON.stringify({ ...manifest, proseError: noAnswerCluster }, null, 2),
            'utf8',
          );
        }
      }
    } catch (err) {
      proseError = err instanceof Error ? err.message : 'prose synthesis threw unexpectedly';
    } finally {
      if (mcpHandle) {
        try { await mcpHandle.close(); } catch { /* swallow — cleanup only */ }
      }
    }
  }

  // Write a failure artifact so the operator knows prose was attempted.
  if (!proseGenerated) {
    let failMd: string;
    if (noAnswerCluster) {
      failMd = renderNoAnswerClusterMarker(noAnswerCluster, manifest.section_purpose);
    } else {
      const errorMsg = proseError ?? 'unknown error';
      failMd = [
        '> **Status:** generation_failed',
        `> **Error:** ${errorMsg}`,
        '>',
        '> Prose synthesis did not complete. Consult `section-brief.md` for the evidence index.',
        '',
      ].join('\n');
    }
    await writeFile(proseMdPath, failMd, 'utf8');
    proseMarkdownPath = proseMdPath;
  }

  return {
    packPath,
    sectionId: options.sectionId,
    packMode: handoff.mode,
    notFreezableAsPack: true,
    notPublishableAsPack: true,
    acceptedClaims: acceptedClaims.length,
    sourceCount: sortedSourceIds.length,
    waiversApplied: manifest.waivers_applied.length,
    gateVerdict: handoffSection.gate_verdict,
    jsonPath,
    markdownPath: mdPath,
    proseGenerated,
    proseMarkdownPath,
    proseError,
    acceptedIdsCrossCheckOk: acceptedIdsForThisSection.length === sectionAcceptedIds.size,
  };
}
