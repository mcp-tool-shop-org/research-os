/**
 * Effective-view helpers for source-card overrides — v0.4 Component A.
 *
 * Pure functions. No I/O. Mirror getEffectiveAcceptedClaimIds (F-36 pattern)
 * from src/closure-ledger/effective-accepted.ts.
 *
 * Latest-wins per source_id per field — independent across fields.
 * A later override that sets only new_source_type does NOT clear an earlier
 * override's new_publisher, and vice-versa.
 *
 * Reusable by Component D (audit CLI, Session 4) without further refactor.
 */
import type { SourceCard } from './schema.js';
import type { SourceCardOverride } from './source-card-overrides-schema.js';

export type SourceType = SourceCard['source_type'];

/**
 * Return the effective source_type for a card, applying override precedence (L1).
 *
 * Filters overrides to those matching card.source_id that carry a non-null
 * new_source_type. Walks newest-to-oldest (ISO-8601 lexicographic sort);
 * returns the first non-null new_source_type found. Falls back to
 * card.source_type when no matching override exists.
 */
export function getEffectiveSourceType(
  card: Pick<SourceCard, 'source_id' | 'source_type'>,
  overrides: SourceCardOverride[],
): SourceType {
  const matched = overrides
    .filter((o) => o.source_id === card.source_id && o.new_source_type != null)
    .sort((a, b) => (a.created_at > b.created_at ? -1 : a.created_at < b.created_at ? 1 : 0));

  return matched.length > 0 ? (matched[0].new_source_type as SourceType) : card.source_type;
}

/**
 * Return the effective publisher for a card, applying override precedence (L1).
 *
 * Filters overrides to those matching card.source_id that explicitly set
 * new_publisher (including null — "set publisher to null" is a valid correction).
 * Walks newest-to-oldest; returns the first entry's new_publisher.
 * Falls back to card.publisher when no matching override exists.
 */
export function getEffectivePublisher(
  card: Pick<SourceCard, 'source_id' | 'publisher'>,
  overrides: SourceCardOverride[],
): string | null {
  const matched = overrides
    .filter((o) => o.source_id === card.source_id && o.new_publisher !== undefined)
    .sort((a, b) => (a.created_at > b.created_at ? -1 : a.created_at < b.created_at ? 1 : 0));

  if (matched.length === 0) return card.publisher;
  return (matched[0].new_publisher ?? null);
}
