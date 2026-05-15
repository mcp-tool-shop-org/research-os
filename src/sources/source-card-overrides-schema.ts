/**
 * Source-card override ledger schema — v0.4 Component A, v0.10 Slice 3 extension.
 *
 * Append-only ledger at evidence/source-card-overrides.jsonl.
 * Schema is advisor-locked (Q2 field set).
 * Latest-wins per source_id per field, computed at read time by the helpers
 * in effective-card.ts.
 *
 * Mirrors claim-reviews.jsonl Pattern 2 (Law 15 — append-only audit-trail).
 *
 * v0.10 Slice 3 (R-003 + R-005): adds `clear_severities[]` so an operator
 * can clear a source-card quarantine signal when they have out-of-band
 * evidence the fetch was legitimate. The refine relaxes to: at least one
 * of new_source_type, new_publisher, or clear_severities must be present.
 */
import { z } from 'zod';
import { SourceTypeSchema } from './schema.js';

export const SourceSeveritySchema = z.enum([
  'bot_check_or_captcha_detected',
  'extraction_suspect_word_count_mismatch',
]);

export const SourceCardOverrideSchema = z
  .object({
    source_id: z.string().min(1, 'source_id must be non-empty'),
    url: z.string().min(1, 'url must be non-empty'),
    previous_source_type: z.string().nullable().optional(),
    new_source_type: SourceTypeSchema.nullable().optional(),
    previous_publisher: z.string().nullable().optional(),
    new_publisher: z.string().nullable().optional(),
    /**
     * v0.10 Slice 3 — clear the named severities for this source_id.
     * Each entry is a SourceSeverity value. Latest-wins semantics: a later
     * override that does NOT mention a previously-cleared severity does NOT
     * un-clear it (clear_severities is monotonic union per source_id).
     */
    clear_severities: z.array(SourceSeveritySchema).optional(),
    reason: z
      .string()
      .refine((v) => v.trim().length > 0, { message: 'reason must be non-empty after trim' }),
    operator: z.string().min(1, 'operator must be non-empty'),
    created_at: z
      .string()
      .refine((v) => isFinite(Date.parse(v)), {
        message: 'created_at must be a valid ISO 8601 timestamp',
      }),
    rule_hint: z.string().nullable().optional(),
    pack_version: z.string().min(1, 'pack_version must be non-empty'),
  })
  .refine(
    (obj) =>
      Object.prototype.hasOwnProperty.call(obj, 'new_source_type') ||
      Object.prototype.hasOwnProperty.call(obj, 'new_publisher') ||
      (Array.isArray(obj.clear_severities) && obj.clear_severities.length > 0),
    {
      message:
        'At least one of new_source_type, new_publisher, or clear_severities must be provided (publisher-only nulling is permitted)',
    },
  );

export type SourceCardOverride = z.infer<typeof SourceCardOverrideSchema>;

export function validateSourceCardOverride(input: unknown): SourceCardOverride {
  return SourceCardOverrideSchema.parse(input);
}
