/**
 * Source-card override ledger schema — v0.4 Component A.
 *
 * Append-only ledger at evidence/source-card-overrides.jsonl.
 * Schema is advisor-locked (Q2 field set).
 * Latest-wins per source_id per field, computed at read time by the helpers
 * in effective-card.ts.
 *
 * Mirrors claim-reviews.jsonl Pattern 2 (Law 15 — append-only audit-trail).
 */
import { z } from 'zod';
import { SourceTypeSchema } from './schema.js';

export const SourceCardOverrideSchema = z
  .object({
    source_id: z.string().min(1, 'source_id must be non-empty'),
    url: z.string().min(1, 'url must be non-empty'),
    previous_source_type: z.string().nullable().optional(),
    new_source_type: SourceTypeSchema.nullable().optional(),
    previous_publisher: z.string().nullable().optional(),
    new_publisher: z.string().nullable().optional(),
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
      (obj.new_source_type != null && obj.new_source_type !== undefined) ||
      (obj.new_publisher != null && obj.new_publisher !== undefined),
    {
      message:
        'At least one of new_source_type or new_publisher must be present and non-null',
    },
  );

export type SourceCardOverride = z.infer<typeof SourceCardOverrideSchema>;

export function validateSourceCardOverride(input: unknown): SourceCardOverride {
  return SourceCardOverrideSchema.parse(input);
}
