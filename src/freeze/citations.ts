// Permissive at extract; strict at validate. Anything inside [claim:...] counts as
// an attempted citation — freeze then checks whether the captured id resolves.
const CITATION_PATTERN = /\[claim:([^\]\s]+)\]/g;
const STRICT_CLAIM_ID_PATTERN = /^clm_[a-f0-9]{12}_(heuristic|ollama_intern)_\d+$/;

export function isWellFormedClaimId(id: string): boolean {
  return STRICT_CLAIM_ID_PATTERN.test(id);
}

export function extractClaimCitations(text: string): string[] {
  const out = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = CITATION_PATTERN.exec(text)) !== null) {
    out.add(match[1]!);
  }
  return Array.from(out);
}

export function extractContradictionDisclosures(text: string, contradictionIds: string[]): string[] {
  const out: string[] = [];
  for (const id of contradictionIds) {
    if (text.includes(id)) out.push(id);
  }
  return out;
}

export function extractWaiverDisclosures(
  text: string,
  waivers: Array<{ family: string; applied_to: string; reason: string }>,
): string[] {
  // A waiver counts as disclosed if its applied_to identifier OR its family appears
  // verbatim in the synthesis text.
  const out: string[] = [];
  for (const w of waivers) {
    if (
      text.includes(w.applied_to) ||
      text.includes(w.family) ||
      (w.reason && w.reason.length > 12 && text.includes(w.reason.slice(0, 40)))
    ) {
      out.push(`${w.family}.${w.applied_to}`);
    }
  }
  return out;
}
