/**
 * v0.10 Slice 2 — R-001: scope-proposer.
 *
 * Pure function. No LLM calls.
 *
 * Auto-mode synthesizes a scope string from three inputs:
 *   1. The first source-card associated with the claim — publisher + source_type
 *      tell us the data origin and authority level.
 *   2. The section purpose — the operator's declared domain bound.
 *   3. (Light) the claim's assert text — used only to pick whether to elide
 *      either publisher or source_type when those are unknown.
 *
 * The proposed scope is deterministic, templated, and operator-auditable.
 * It is intentionally NOT clever — auto-mode is the floor. Interactive
 * mode is where operators sharpen scope; auto-mode is what runs when the
 * operator wants to unblock a section without inspecting each claim. The
 * proposal at least gives the reviewer something to check overgeneralization
 * against (which is what an empty scope prevents — see triage parked_weak_scope).
 *
 * source_signals[] is a bag of strings the proposer used. Recorded in the
 * ledger so an operator (or auditor) can trace why this scope was suggested
 * for this claim.
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
 * Build a templated scope string from typed inputs. The template shape:
 *
 *   "per <publisher> <source_type>, on <section_purpose_short>"
 *
 * with graceful degradation when publisher or source_type is unknown.
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
  let proposed: string;
  if (pub && stype) {
    proposed = `per ${pub} ${stype}, on ${purposeShort}`;
  } else if (pub) {
    proposed = `per ${pub}, on ${purposeShort}`;
  } else if (stype) {
    proposed = `per ${stype}, on ${purposeShort}`;
  } else {
    // No source-card signal at all — section purpose is the only bound we
    // can offer. Operator should likely edit in interactive mode but this
    // is still better than null.
    proposed = `on ${purposeShort}`;
  }

  const signals: string[] = [];
  if (anchor) {
    signals.push(`source_id:${anchor.source_id}`);
    if (pub) signals.push(`publisher:${pub}`);
    if (anchor.source_type) signals.push(`source_type:${anchor.source_type}`);
  }
  signals.push(`section_purpose:${purposeShort}`);

  return {
    proposed_scope: proposed,
    source_signals: signals,
  };
}
