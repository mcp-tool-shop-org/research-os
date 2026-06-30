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

// B-FREEZE-001: previously a bare `text.includes(family|applied_to)` substring
// counted as a deliberate waiver disclosure. That let an internal snake_case
// token ('source_floor' / 'primary_sources_required') pass the
// FREEZE_WAIVER_UNDISCLOSED gate even when it appeared *embedded inside a larger
// identifier* — e.g. `legacy_source_floor_v1` or `audit_primary_sources_required_flag`
// — where the author plainly was not disclosing this waiver. Tighten the matcher
// so a token only counts when it occurs as a standalone snake_case token
// (delimited by a non-[a-z0-9_] boundary on each side), not as a substring of a
// longer identifier. The family+applied_to PAIR and the 40-char reason-prefix
// remain stronger signals and short-circuit the boundary requirement. The freeze
// reason_code + gate structure are unchanged; only this predicate is.

// Whole snake_case-token match: the token must not be glued to surrounding
// [a-z0-9_] characters, so it is a real reference rather than an incidental
// fragment of a bigger identifier. Falls back to a bare-substring test for
// tokens that themselves contain regex-significant characters.
function containsStandaloneToken(text: string, token: string): boolean {
  if (!token) return false;
  let idx = text.indexOf(token);
  while (idx !== -1) {
    const before = idx === 0 ? '' : text[idx - 1]!;
    const afterIdx = idx + token.length;
    const after = afterIdx >= text.length ? '' : text[afterIdx]!;
    const leftOk = before === '' || !/[a-z0-9_]/i.test(before);
    const rightOk = after === '' || !/[a-z0-9_]/i.test(after);
    if (leftOk && rightOk) return true;
    idx = text.indexOf(token, idx + 1);
  }
  return false;
}

export function extractWaiverDisclosures(
  text: string,
  waivers: Array<{ family: string; applied_to: string; reason: string }>,
): string[] {
  const out: string[] = [];
  for (const w of waivers) {
    const familyStandalone = containsStandaloneToken(text, w.family);
    const appliedToStandalone = containsStandaloneToken(text, w.applied_to);
    // Pair both present as standalone tokens — strongest deliberate reference.
    const explicitPair = !!w.family && !!w.applied_to && familyStandalone && appliedToStandalone;
    // Otherwise require a standalone occurrence of family OR applied_to, so a
    // token buried inside a longer identifier no longer counts.
    const standaloneToken = appliedToStandalone || familyStandalone;
    const reasonPrefix =
      !!w.reason && w.reason.length > 12 && text.includes(w.reason.slice(0, 40));
    if (explicitPair || standaloneToken || reasonPrefix) {
      out.push(`${w.family}.${w.applied_to}`);
    }
  }
  return out;
}
