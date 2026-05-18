import type { Contradiction } from './schema.js';
import type { AutoModeFallThroughInfo } from './types.js';

// R-021 — render the "## Auto-mode fall-through" block immediately after the
// document header and before the contradictions list (or before the empty-
// state notice). Named reason + budget + consecutive-timeout count + per-
// detector pair counts. Backward-compat: when autoModeFallThrough is absent,
// the block is omitted and the markdown is byte-identical to the prior
// rendering.
function renderAutoModeFallThroughBlock(info: AutoModeFallThroughInfo): string[] {
  const lines: string[] = [];
  lines.push('## Auto-mode fall-through');
  lines.push('');
  lines.push(
    `Auto-mode (ollama-intern LLM detector) hit ${info.consecutiveTimeouts} ` +
      `consecutive timeouts at the configured per-pair timeout ` +
      `(${info.perPairTimeoutMs}ms). The orchestrator fell through to the ` +
      `heuristic detector for the remaining pairs.`,
  );
  lines.push('');
  lines.push(`- **Reason:** \`${info.reason}\``);
  lines.push(`- **Per-pair timeout:** ${info.perPairTimeoutMs}ms`);
  lines.push(`- **Consecutive timeouts before fall-through:** ${info.consecutiveTimeouts}`);
  lines.push(`- **Triggered at pair index:** ${info.triggeredAtPairIndex}`);
  lines.push(`- **Pairs attempted by auto-mode:** ${info.autoClassifiedPairs}`);
  lines.push(`- **Pairs classified by heuristic after fall-through:** ${info.heuristicClassifiedPairs}`);
  lines.push('');
  lines.push(
    'If auto-mode is silently underperforming on this hardware/model combination, ' +
      'consider either: (a) raising `--auto-mode-pair-timeout-ms` if the LLM is ' +
      'merely slow rather than stuck; (b) running `--detector heuristic` directly ' +
      'to skip the LLM probe entirely; (c) running `--detector heuristic --triaged-only` ' +
      'for the densest sections.',
  );
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines;
}

export function renderMarkdownView(args: {
  sectionId: string;
  candidateClaims: number;
  contradictions: Contradiction[];
  detector: string;
  detectionMethod: string;
  autoModeFallThrough?: AutoModeFallThroughInfo;
}): string {
  const { sectionId, candidateClaims, contradictions, detector, detectionMethod, autoModeFallThrough } = args;
  const lines: string[] = [];
  lines.push(`# Contradictions: ${sectionId}`);
  lines.push('');

  // R-021 — render the fall-through block at the top when present. It
  // describes how this artifact came to exist (auto-mode bailed, heuristic
  // finished). Operators need this context to interpret the rest of the file.
  if (autoModeFallThrough) {
    for (const l of renderAutoModeFallThroughBlock(autoModeFallThrough)) lines.push(l);
  }

  if (contradictions.length === 0) {
    lines.push(
      `No contradiction candidates detected by ${detector} (${detectionMethod}) over ${candidateClaims} candidate claim${candidateClaims === 1 ? '' : 's'}.`,
    );
    lines.push('');
    lines.push(
      `Detection methods are not exhaustive. Adversarial review may surface tensions the detector missed. A clean section is a valid result, not proof of completeness.`,
    );
    return lines.join('\n') + '\n';
  }

  lines.push(
    `${contradictions.length} contradiction candidate${contradictions.length === 1 ? '' : 's'} detected by ${detector} (${detectionMethod}) over ${candidateClaims} candidate claim${candidateClaims === 1 ? '' : 's'}.`,
  );
  lines.push('');
  lines.push(
    'Status: all unresolved. The gate engine determines whether unresolved contradictions block synthesis. The adversarial reviewer determines whether each contradiction is real, weak, or misclassified. This view is the map, not the judgment.',
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const c of contradictions) {
    lines.push(`## ${c.contradiction_id}: ${c.type}`);
    lines.push('');
    lines.push(`- **Severity:** ${c.severity}`);
    lines.push(`- **Confidence:** ${c.confidence}`);
    lines.push(`- **Status:** ${c.status}`);
    lines.push(`- **Overlap:** ${c.overlap_assessment}`);
    lines.push(`- **Detector:** ${c.detector} (${c.detection_method})`);
    lines.push('');
    lines.push(`**Claims:** \`${c.claim_ids.join('`, `')}\``);
    lines.push(`**Sources:** \`${c.source_ids.join('`, `')}\``);
    lines.push('');
    lines.push(`**Summary:** ${c.summary}`);
    lines.push('');
    if (c.scope_analysis) {
      lines.push(`**Scope analysis:** ${c.scope_analysis}`);
      lines.push('');
    }
    if (c.evidence) {
      lines.push(`**Evidence:** ${c.evidence}`);
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}
