// Markdown renderer for `recovery/blocked-section-recovery.md`.
//
// Renders per-section recovery guidance. The Markdown is designed for
// operator scanning: top callout with pack state, then one block per section
// in research.yaml order. Healthy sections get a short "no action" line so
// the operator sees the full pack at a glance without false alarms.

import type {
  AdvisorPath,
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
    lines.push(`> **Deterministic fallback applied to:** ${fallbackCount} section(s) (AI advisor exhausted)`);
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
