/**
 * v0.10 Slice 2 — R-001: scope-proposer.
 * v0.11 Slice 1 — R-007: proposer now ALSO produces a `proposed_not`
 *   (boundary text) alongside `proposed_scope`. The engine applies the
 *   proposed `not` only when claim.not is null at repair time. The
 *   alignment fix: triage requires BOTH scope and not for substantive
 *   claims, so the repair surface must offer both. The proposer always
 *   computes both; the engine decides which to apply.
 *
 * Pure function. No LLM calls.
 *
 * Auto-mode synthesizes scope + boundary strings from three inputs:
 *   1. The first source-card associated with the claim — publisher + source_type
 *      tell us the data origin and authority level.
 *   2. The section purpose — the operator's declared domain bound.
 *   3. (Light) the claim's assert text — used only to pick whether to elide
 *      either publisher or source_type when those are unknown.
 *
 * The proposed scope and `not` are deterministic, templated, and
 * operator-auditable. They are intentionally NOT clever — auto-mode is the
 * floor. Interactive mode is where operators sharpen scope/boundary;
 * auto-mode is what runs when the operator wants to unblock a section
 * without inspecting each claim. The proposals at least give the reviewer
 * something to check overgeneralization against (which is what null
 * scope/not prevents — see triage parked_weak_scope / needs_scope_repair).
 *
 * source_signals[] is a bag of strings the proposer used. Recorded in the
 * ledger so an operator (or auditor) can trace why these proposals were
 * suggested for this claim.
 */

import type { Claim } from './schema.js';
import type { SourceCard } from '../sources/schema.js';

export interface ScopeProposalInput {
  claim: Claim;
  sectionPurpose: string;
  sourceCards: SourceCard[]; // cards associated with the claim's source_ids
}

export interface ScopeProposal {
  proposed_scope: string;
  // R-007: templated boundary text. Always non-empty so the engine can
  // apply it unconditionally when claim.not is null; the engine itself
  // decides whether to apply (only when claim.not === null at repair time).
  proposed_not: string;
  source_signals: string[];
}

const MAX_PURPOSE_CHARS = 180;

function shortPurpose(purpose: string): string {
  const trimmed = purpose.trim();
  if (trimmed.length <= MAX_PURPOSE_CHARS) return trimmed;
  return trimmed.slice(0, MAX_PURPOSE_CHARS).trimEnd() + '…';
}

function publisherPhrase(publisher: string | null | undefined): string {
  if (!publisher || publisher.trim().length === 0 || publisher === 'unknown') return '';
  return publisher.trim();
}

function sourceTypePhrase(source_type: string | undefined): string {
  if (!source_type || source_type === 'unknown') return '';
  switch (source_type) {
    case 'primary':
      return 'primary sources';
    case 'docs':
      return 'official documentation';
    case 'secondary':
      return 'secondary sources';
    case 'forum':
      return 'forum threads';
    default:
      return source_type;
  }
}

/**
 * Build templated scope + boundary strings from typed inputs.
 *
 * Scope template: "per <publisher> <source_type>, on <section_purpose_short>"
 * Boundary template (R-007):
 *   "not generalizing outside <publisher>'s <source_type> context"
 *
 * Both templates degrade gracefully when publisher or source_type is unknown.
 * The boundary text is intentionally cautious: in auto-mode the operator
 * hasn't reviewed each claim, so the proposal limits applicability to the
 * source's authority rather than asserting a sharp negative scope (which
 * would require operator inspection).
 */
export function proposeScopeForClaim(input: ScopeProposalInput): ScopeProposal {
  const { claim, sectionPurpose, sourceCards } = input;
  // First source card in the claim's source_ids array. If the claim has
  // multiple sources, the FIRST is the primary anchor.
  const firstSourceId = claim.source_ids[0];
  const anchor = firstSourceId
    ? sourceCards.find((c) => c.source_id === firstSourceId) ?? null
    : null;

  const pub = anchor ? publisherPhrase(anchor.publisher) : '';
  const stype = anchor ? sourceTypePhrase(anchor.source_type) : '';
  const purposeShort = shortPurpose(sectionPurpose);

  // Build the templated scope. Degrade gracefully when fields are missing.
  let proposedScope: string;
  if (pub && stype) {
    proposedScope = `per ${pub} ${stype}, on ${purposeShort}`;
  } else if (pub) {
    proposedScope = `per ${pub}, on ${purposeShort}`;
  } else if (stype) {
    proposedScope = `per ${stype}, on ${purposeShort}`;
  } else {
    // No source-card signal at all — section purpose is the only bound we
    // can offer. Operator should likely edit in interactive mode but this
    // is still better than null.
    proposedScope = `on ${purposeShort}`;
  }

  // R-007: templated boundary. Mirror the scope template's degradation
  // shape so the two proposals are visually and conceptually paired in the
  // ledger and the prompter UI.
  let proposedNot: string;
  if (pub && stype) {
    proposedNot = `not generalizing outside ${pub}'s ${stype} context`;
  } else if (pub) {
    proposedNot = `not generalizing outside ${pub}'s findings`;
  } else if (stype) {
    proposedNot = `not generalizing outside ${stype}`;
  } else {
    proposedNot = `not generalizing outside the ${purposeShort} scope`;
  }

  const signals: string[] = [];
  if (anchor) {
    signals.push(`source_id:${anchor.source_id}`);
    if (pub) signals.push(`publisher:${pub}`);
    if (anchor.source_type) signals.push(`source_type:${anchor.source_type}`);
  }
  signals.push(`section_purpose:${purposeShort}`);

  return {
    proposed_scope: proposedScope,
    proposed_not: proposedNot,
    source_signals: signals,
  };
}
