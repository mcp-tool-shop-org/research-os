// v0.9 Slice 3b — Recovery summary projection for partial-pack embed.
//
// Slice 3a (commit 35d4c29) shipped the canonical lawful recovery advisor as
// a standalone command (`research-os recover pack`) producing
// `recovery/blocked-section-recovery.{md,json}`.
//
// Slice 3b makes the advisor's output VISIBLE in the artifact operators
// actually read — `partial-pack-synthesis.{md,json}`. Each excluded section
// gains a `recovery_summary` field that condenses the canonical advice to a
// compact operator-facing surface: recommended_action_id + 1-sentence prose +
// why_this_action + do_not[] + advisor_path + canonical pointer.
//
// Single source of truth: the projection consumes a SectionRecoveryResult
// produced by `buildRecoveryArtifact()` (the same in-memory object written
// to the canonical artifact). No duplicated decision logic.
//
// No-silent-skip guardrail: every excluded section in fresh Slice 3b output
// MUST receive a `recovery_summary`. If the canonical recovery engine cannot
// produce a result for some section (engine error, missing entry, etc.), the
// embed surfaces an explicit `recovery_unavailable` block — NEVER silently
// omits the field.
//
// Projection rules (locked per dispatch):
//   recommended_action_id ← advice.recommended_action.action_id
//   recommended_action    ← advice.recommended_action.expected_outcome
//   why_this_action       ← advice.recommended_action.why_smallest_reversible
//   do_not[]              ← advice.do_not[].{ action_id, reason: why_not }
//   advisor_path          ← result.advisor_path
//   source                ← "recovery/blocked-section-recovery.json"
//
// The `do_not[].why_not` → `do_not[].reason` rename is deliberate: the embed
// is a compact partial-pack surface, not the canonical schema. The canonical
// `do_not[].why_not` shape remains unchanged in `blocked-section-recovery.json`.

import { z } from 'zod';

import { RecoveryActionIdSchema } from '../../recover/schema.js';
import type {
  RecoveryActionId,
  SectionRecoveryResult,
} from '../../recover/types.js';

/**
 * Canonical pointer rendered in every recovery_summary.source field. The
 * partial-pack artifact is one click away from the full canonical recovery
 * document via this relative path.
 */
export const RECOVERY_SUMMARY_SOURCE = 'recovery/blocked-section-recovery.json';
export const RECOVERY_SUMMARY_MARKDOWN_SOURCE = 'recovery/blocked-section-recovery.md';

/**
 * Closed enum of advisor paths surfaced in the embed. The first three come
 * directly from the canonical SectionRecoveryResult.advisor_path. The fourth
 * (`recovery_unavailable`) is embed-specific and indicates the recovery engine
 * itself could not produce a result for the section. Silent omission of
 * recovery_summary is forbidden — if the engine fails, the embed says so
 * explicitly.
 */
export const RECOVERY_SUMMARY_ADVISOR_PATHS = [
  'ai_with_verifier_pass',
  'ai_with_retry_pass',
  'deterministic_fallback',
  'recovery_unavailable',
] as const;

export type RecoverySummaryAdvisorPath = (typeof RECOVERY_SUMMARY_ADVISOR_PATHS)[number];

/**
 * Closed enum of reasons the embed can mark a section's recovery as
 * unavailable. These cover engine-side failure modes the orchestrator can
 * detect deterministically. New reasons require a code change.
 */
export const RECOVERY_UNAVAILABLE_REASONS = [
  'diagnosis_failed',   // recovery engine could not produce a diagnosis (e.g., diagnose threw)
  'action_graph_empty', // diagnosis succeeded but action graph had zero allowed actions
  'engine_error',       // engine threw / produced unexpected shape / no matching section result
] as const;

export type RecoveryUnavailableReason = (typeof RECOVERY_UNAVAILABLE_REASONS)[number];

/**
 * One do-not entry surfaced in the embed. Field-named `reason` (not `why_not`)
 * as a deliberate reshape — the embed is a partial-pack surface, not the
 * canonical RecoveryDoNot schema.
 */
export interface RecoveryDoNotSummary {
  action_id: RecoveryActionId;
  reason: string;
}

/**
 * The recovery_summary projected onto a partial-pack excluded section.
 *
 * Discriminated by `advisor_path`:
 *  - For the 3 happy paths, `recommended_action_id`, `recommended_action`,
 *    `why_this_action`, and `do_not[]` are populated; `reason` and `detail`
 *    are absent.
 *  - For `recovery_unavailable`, `reason` + `detail` are populated; the
 *    happy-path guidance fields are absent.
 *
 * Every variant carries `source` so the operator can navigate to the full
 * canonical recovery artifact.
 */
export type RecoverySummary =
  | {
      advisor_path: 'ai_with_verifier_pass' | 'ai_with_retry_pass' | 'deterministic_fallback';
      recommended_action_id: RecoveryActionId;
      recommended_action: string;
      why_this_action: string;
      do_not: RecoveryDoNotSummary[];
      source: string;
    }
  | {
      advisor_path: 'recovery_unavailable';
      reason: RecoveryUnavailableReason;
      detail: string;
      source: string;
    };

// ── Zod schemas ─────────────────────────────────────────────────────────────

export const RecoveryDoNotSummarySchema = z
  .object({
    action_id: RecoveryActionIdSchema,
    reason: z.string().min(1),
  })
  .strict();

export const RecoveryUnavailableReasonSchema = z.enum(RECOVERY_UNAVAILABLE_REASONS);

/**
 * Strict discriminated union for the recovery_summary field. Zod's
 * `discriminatedUnion` requires literal discriminators per branch; we use
 * separate object schemas joined via `union` so the happy-path branch can
 * cover three advisor_path literals at once via `z.enum`.
 */
export const RecoverySummarySchema = z.union([
  z
    .object({
      advisor_path: z.enum([
        'ai_with_verifier_pass',
        'ai_with_retry_pass',
        'deterministic_fallback',
      ]),
      recommended_action_id: RecoveryActionIdSchema,
      recommended_action: z.string().min(1),
      why_this_action: z.string().min(1),
      do_not: z.array(RecoveryDoNotSummarySchema),
      source: z.string().min(1),
    })
    .strict(),
  z
    .object({
      advisor_path: z.literal('recovery_unavailable'),
      reason: RecoveryUnavailableReasonSchema,
      detail: z.string().min(1),
      source: z.string().min(1),
    })
    .strict(),
]);

// ── Projection ──────────────────────────────────────────────────────────────

/**
 * Project a canonical SectionRecoveryResult into the compact embed shape.
 *
 * Returns the happy-path summary when `status === 'recovery_advised'` and the
 * canonical advice + advisor_path are present. Falls through to
 * `recovery_unavailable` with reason `engine_error` if the canonical result
 * exists but is structurally incomplete — this is defensive: the canonical
 * SectionRecoveryResultSchema permits null advice on healthy sections, but
 * we shouldn't see null advice on recovery_advised sections in fresh output.
 */
export function projectRecoverySummary(result: SectionRecoveryResult): RecoverySummary {
  // Healthy sections shouldn't end up in partial-pack's excluded list, but
  // be defensive: surface as recovery_unavailable rather than throwing.
  if (result.status === 'healthy') {
    return {
      advisor_path: 'recovery_unavailable',
      reason: 'engine_error',
      detail: `Section "${result.section_id}" is healthy at section level but was excluded by partial-pack — no recovery advice required.`,
      source: RECOVERY_SUMMARY_SOURCE,
    };
  }

  // status === 'recovery_advised'
  if (!result.advice || !result.advisor_path) {
    return {
      advisor_path: 'recovery_unavailable',
      reason: 'engine_error',
      detail: `Canonical recovery result for "${result.section_id}" was present but missing advice or advisor_path.`,
      source: RECOVERY_SUMMARY_SOURCE,
    };
  }

  // Happy path: produce the compact embed from the canonical advice. The
  // happy-path advisor_path is constrained to the 3 canonical values; we
  // assert the type witness here for the discriminated union.
  const advisorPath = result.advisor_path as
    | 'ai_with_verifier_pass'
    | 'ai_with_retry_pass'
    | 'deterministic_fallback';

  return {
    advisor_path: advisorPath,
    recommended_action_id: result.advice.recommended_action.action_id,
    recommended_action: result.advice.recommended_action.expected_outcome,
    why_this_action: result.advice.recommended_action.why_smallest_reversible,
    do_not: result.advice.do_not.map((d) => ({
      action_id: d.action_id,
      reason: d.why_not,
    })),
    source: RECOVERY_SUMMARY_SOURCE,
  };
}

/**
 * Construct an explicit `recovery_unavailable` summary. Used by the
 * partial-pack orchestrator when the canonical recovery engine produced no
 * result for a given section (e.g., engine threw, missing section entry, etc.).
 *
 * The orchestrator MUST call this for every excluded section that has no
 * canonical SectionRecoveryResult rather than omit the field — silent omission
 * is forbidden by Slice 3b's pass bar (condition 10).
 */
export function recoveryUnavailableSummary(args: {
  reason: RecoveryUnavailableReason;
  detail: string;
}): RecoverySummary {
  return {
    advisor_path: 'recovery_unavailable',
    reason: args.reason,
    detail: args.detail,
    source: RECOVERY_SUMMARY_SOURCE,
  };
}

// ── Markdown rendering ──────────────────────────────────────────────────────

/**
 * Render the recovery_summary block as Markdown lines, formatted to sit
 * directly under an excluded section's heading in partial-pack-synthesis.md.
 *
 * Shape (locked per dispatch):
 *
 *     **Recommended next action:** <recommended_action>
 *
 *     > <why_this_action>
 *
 *     **Do not:** <do_not[0].action_id>. <do_not[0].reason>
 *     [...one line per do_not entry...]
 *
 *     Full recovery detail: `recovery/blocked-section-recovery.md`
 *
 * For `recovery_unavailable`, the block reads:
 *
 *     **Recovery guidance unavailable** (<reason>): <detail>
 *
 *     Full recovery detail: `recovery/blocked-section-recovery.md`
 *
 * Always returns lines (caller appends to a growing buffer); the returned
 * lines start fresh and end with a blank line so the next block has a gap.
 */
export function renderRecoverySummaryMarkdown(summary: RecoverySummary): string[] {
  const lines: string[] = [];

  if (summary.advisor_path === 'recovery_unavailable') {
    lines.push(
      `**Recovery guidance unavailable** (\`${summary.reason}\`): ${summary.detail}`,
    );
    lines.push('');
    lines.push(`Full recovery detail: \`${RECOVERY_SUMMARY_MARKDOWN_SOURCE}\``);
    lines.push('');
    return lines;
  }

  // Happy path: render recommended action + why + do_not + link.
  lines.push(`**Recommended next action:** ${summary.recommended_action}`);
  lines.push('');
  lines.push(`> ${summary.why_this_action}`);
  lines.push('');

  if (summary.do_not.length > 0) {
    for (const dn of summary.do_not) {
      lines.push(`**Do not:** \`${dn.action_id}\` — ${dn.reason}`);
    }
    lines.push('');
  }

  lines.push(`Full recovery detail: \`${RECOVERY_SUMMARY_MARKDOWN_SOURCE}\``);
  lines.push('');
  return lines;
}
