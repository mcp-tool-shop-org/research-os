// Markdown renderer for `recovery/blocked-section-recovery.md`.
//
// Renders per-section recovery guidance. The Markdown is designed for
// operator scanning: top callout with pack state, then one block per section
// in research.yaml order. Healthy sections get a short "no action" line so
// the operator sees the full pack at a glance without false alarms.

import type {
  AdvisorPath,
  FallbackCause,
  FallbackTiming,
  RecoveryAdvice,
  RecoveryArtifact,
  RecoveryProseError,
  SectionRecoveryResult,
} from './types.js';

function advisorPathLabel(path: AdvisorPath | null): string {
  if (path === null) return 'n/a';
  switch (path) {
    case 'ai_with_verifier_pass':
      return 'AI advice (verified)';
    case 'ai_with_retry_pass':
      return 'AI advice (verified after one retry)';
    case 'deterministic_fallback':
      return 'Deterministic fallback (AI advisor exhausted)';
  }
}

function confidenceBadge(confidence: RecoveryAdvice['confidence']): string {
  switch (confidence) {
    case 'high':
      return '**Confidence:** high';
    case 'medium':
      return '**Confidence:** medium';
    case 'needs_human_judgment':
      return '**Confidence:** needs human judgment';
  }
}

// R-010 — operator-readable headline for the fallback cause. The cause is
// classified at orchestrator time from the existing last_rejection_reason;
// here we just project it into language an operator can act on.
function fallbackCauseHeadline(cause: FallbackCause, timing: FallbackTiming | undefined): string {
  switch (cause) {
    case 'tier_timeout':
      if (timing) {
        return `AI advisor timed out (TIER_TIMEOUT) — elapsed ${timing.elapsed_ms}ms over ${timing.budget_ms}ms budget.`;
      }
      return 'AI advisor timed out (TIER_TIMEOUT).';
    case 'mcp_error':
      return 'AI advisor unavailable — the MCP advisor call returned an error.';
    case 'retry_exhausted':
      return 'AI advisor exhausted — both attempts were rejected by the verifier (retry-exhausted).';
  }
}

function renderFallbackCauseBlock(proseError: RecoveryProseError): string[] {
  const lines: string[] = [];
  // Defensive: only fired for the deterministic-fallback path. Older
  // recovery artifacts written before R-010 won't have fallback_cause —
  // in that case, render nothing new (graceful back-compat).
  if (!proseError.fallback_cause) return lines;

  lines.push('### Why the AI advisor fell back');
  lines.push('');
  lines.push(`**Cause:** ${fallbackCauseHeadline(proseError.fallback_cause, proseError.timing_ms)}`);
  lines.push('');
  lines.push(
    'The recovery guidance below was generated deterministically from pack law rather than the AI advisor. The fallback recovery action and pack-law forbiddings are unchanged.',
  );
  lines.push('');
  lines.push(
    'Raw error and timing are preserved at `prose_error.last_rejection_reason` (and `prose_error.timing_ms` when parseable) in `recovery/blocked-section-recovery.json` for full inspection.',
  );
  lines.push('');
  return lines;
}

// Per-cause counter for the top callout — operators see at a glance whether
// fallbacks were primarily timeouts vs verifier-rejected.
function summarizeFallbackCauses(sections: SectionRecoveryResult[]): string | null {
  const counts: Record<FallbackCause, number> = {
    tier_timeout: 0,
    mcp_error: 0,
    retry_exhausted: 0,
  };
  let total = 0;
  for (const s of sections) {
    if (s.advisor_path !== 'deterministic_fallback') continue;
    const cause = s.prose_error?.fallback_cause;
    if (!cause) continue;
    counts[cause] += 1;
    total += 1;
  }
  if (total === 0) return null;
  const parts: string[] = [];
  if (counts.tier_timeout > 0) parts.push(`${counts.tier_timeout} timeout`);
  if (counts.mcp_error > 0) parts.push(`${counts.mcp_error} mcp_error`);
  if (counts.retry_exhausted > 0) parts.push(`${counts.retry_exhausted} retry_exhausted`);
  return parts.join(', ');
}

function renderHealthy(section: SectionRecoveryResult): string[] {
  const lines: string[] = [];
  lines.push(`## ${section.section_id} — healthy`);
  lines.push('');
  lines.push(`**Purpose:** ${section.section_purpose}`);
  lines.push('');
  lines.push('_No recovery action needed — this section is on track._');
  lines.push('');
  return lines;
}

function renderAdvised(section: SectionRecoveryResult): string[] {
  const lines: string[] = [];
  if (!section.diagnosis || !section.action_graph || !section.advice) {
    // Shouldn't happen for status: recovery_advised, but be defensive.
    lines.push(`## ${section.section_id} — recovery_advised (incomplete data)`);
    lines.push('');
    lines.push('_Recovery artifact incomplete for this section._');
    lines.push('');
    return lines;
  }

  const { diagnosis, advice, advisor_path, prose_error } = section;

  lines.push(`## ${diagnosis.section_id}`);
  lines.push('');
  lines.push(`**Purpose:** ${diagnosis.section_purpose}`);
  lines.push(
    `**Failure:** ${diagnosis.failure_shape} (${diagnosis.waiveable ? 'waiveable' : 'unwaiveable'}) — ${diagnosis.detail}`,
  );
  lines.push(`**Advisor path:** ${advisorPathLabel(advisor_path)}`);
  if (prose_error) {
    lines.push(`**ProseError:** \`${prose_error.code}\` — ${prose_error.message}`);
  }
  lines.push('');

  // R-010 — fallback cause callout. Only rendered for the deterministic-
  // fallback path AND only when the orchestrator populated fallback_cause.
  // Operator sees the cause (timeout vs verifier vs other MCP error) +
  // optional elapsed/budget timing before scanning the recommended action.
  if (prose_error) {
    lines.push(...renderFallbackCauseBlock(prose_error));
  }

  // Recommended action
  lines.push('### Recommended next move');
  lines.push('');
  lines.push(`**${advice.recommended_action.action_id}** (rank ${advice.recommended_action.rank_taken})`);
  lines.push('');
  lines.push(`> ${advice.recommended_action.contrastive_framing}`);
  lines.push('');
  lines.push(`**Why this is the smallest reversible move:** ${advice.recommended_action.why_smallest_reversible}`);
  lines.push('');
  lines.push('```');
  lines.push(advice.recommended_action.command_hint);
  lines.push('```');
  lines.push('');
  lines.push(`**Expected outcome:** ${advice.recommended_action.expected_outcome}`);
  lines.push('');

  // Also consider
  if (advice.also_consider.length > 0) {
    lines.push('### Also consider');
    lines.push('');
    for (const ac of advice.also_consider) {
      lines.push(`- **${ac.action_id}** — _when to prefer:_ ${ac.when_to_prefer}`);
    }
    lines.push('');
  }

  // Do not
  if (advice.do_not.length > 0) {
    lines.push('### Do NOT');
    lines.push('');
    for (const dn of advice.do_not) {
      lines.push(`- **${dn.action_id}** — ${dn.why_not}`);
    }
    lines.push('');
  }

  // System cannot see
  lines.push('### What this advisor cannot see');
  lines.push('');
  for (const item of advice.system_cannot_see) {
    lines.push(`- ${item}`);
  }
  lines.push('');

  // Confidence
  lines.push(confidenceBadge(advice.confidence));
  lines.push('');

  // Failure summary as a tail field
  lines.push(`_Failure summary:_ ${advice.failure_summary}`);
  lines.push('');

  return lines;
}

export function renderRecoveryMarkdown(artifact: RecoveryArtifact): string {
  const lines: string[] = [];

  // Top callout
  const advisedCount = artifact.sections.filter((s) => s.status === 'recovery_advised').length;
  const healthyCount = artifact.sections.filter((s) => s.status === 'healthy').length;
  const fallbackCount = artifact.sections.filter((s) => s.advisor_path === 'deterministic_fallback').length;

  lines.push('> **Status:** recovery_advisor_complete');
  lines.push(`> **Pack mode:** ${artifact.pack_mode}`);
  lines.push(`> **Sections:** ${artifact.sections.length} total — ${advisedCount} advised, ${healthyCount} healthy`);
  if (fallbackCount > 0) {
    const causeSummary = summarizeFallbackCauses(artifact.sections);
    const causeSuffix = causeSummary ? ` — ${causeSummary}` : '';
    lines.push(`> **Deterministic fallback applied to:** ${fallbackCount} section(s) (AI advisor exhausted)${causeSuffix}`);
  }
  lines.push('>');
  lines.push('> This is a recovery advisor artifact. It tells the operator what lawful');
  lines.push("> actions are available for blocked sections. The pack remains NOT freezable");
  lines.push('> and NOT publishable; this artifact does not change pack readiness — it only');
  lines.push('> turns blocked sections into actionable next moves.');
  lines.push('');

  // Header
  lines.push('# Blocked-Section Recovery');
  lines.push('');
  lines.push(`**Pack:** ${artifact.pack_topic}`);
  lines.push(`**Pack ID:** \`${artifact.pack_id}\``);
  lines.push(`**Generated:** ${artifact.generated_at}`);
  lines.push(`**research-os version:** \`${artifact.research_os_version}\``);
  lines.push('');

  // Per-section blocks in research.yaml order (orchestrator already
  // preserves this).
  for (const section of artifact.sections) {
    if (section.status === 'healthy') {
      lines.push(...renderHealthy(section));
    } else {
      lines.push(...renderAdvised(section));
    }
  }

  // Guardrails footer
  lines.push('---');
  lines.push('');
  lines.push('## Guardrails');
  lines.push('');
  lines.push('- This advisor reads typed facts from your pack (claim counts, source counts, publisher counts, failure shape). It does NOT read raw claim text or source content.');
  lines.push('- AI-produced advice is verified against a deterministic action graph before being admitted. Advice that violates pack law (e.g., recommending an unwaiveable waiver) is rejected.');
  lines.push('- The pack is **NOT** freezable or publishable. This artifact never changes that.');
  lines.push('- Recovery actions are advisory, never executive. The operator runs the suggested commands.');
  lines.push('');

  return lines.join('\n');
}
