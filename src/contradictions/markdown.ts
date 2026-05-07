import type { Contradiction } from './schema.js';

export function renderMarkdownView(args: {
  sectionId: string;
  candidateClaims: number;
  contradictions: Contradiction[];
  detector: string;
  detectionMethod: string;
}): string {
  const { sectionId, candidateClaims, contradictions, detector, detectionMethod } = args;
  const lines: string[] = [];
  lines.push(`# Contradictions: ${sectionId}`);
  lines.push('');
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
