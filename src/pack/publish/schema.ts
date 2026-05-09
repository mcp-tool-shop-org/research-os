import { z } from 'zod';

// Mirror of research-packs/scripts/manifest-schema.mjs in TypeScript.
// Manifests produced by pack publish must validate against both this schema
// and the MJS schema (verified by the dogfood test via verify-pack.mjs).

export const SectionSummarySchema = z.object({
  id: z.string().min(1),
  accepted_claims: z.number().int().min(0),
  gate: z.enum(['pass', 'warn', 'fail', 'blocked', 'pass_with_waiver']),
  synthesis_eligible: z.boolean(),
});

export const TotalsSchema = z.object({
  sections: z.number().int().min(1),
  accepted_claims: z.number().int().min(0),
  dispositioned: z.number().int().min(0),
  unresolved_contradictions: z.number().int().min(0),
  preserved_contradiction_records: z.number().int().min(0).optional(),
});

export const PackManifestSchema = z.object({
  name: z.string().min(1),
  topic: z.string().min(1),
  frozen_at: z.string().datetime(),
  research_os_version: z.string().min(1),
  sections: z.array(SectionSummarySchema).min(1),
  totals: TotalsSchema,
  freeze_receipt_sha256: z.string().regex(/^[a-f0-9]{64}$/, 'Must be a 64-char hex sha256'),
  operator_notes: z.string().default(''),
});

export type PackManifest = z.infer<typeof PackManifestSchema>;
export type SectionSummary = z.infer<typeof SectionSummarySchema>;
export type Totals = z.infer<typeof TotalsSchema>;
