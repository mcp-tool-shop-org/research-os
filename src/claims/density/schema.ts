import { z } from 'zod';

// A claim density audit reports how dense and redundant a section's
// candidate claim ledger is, BEFORE review runs. It surfaces signals the
// reviewer can route into claim_overproduction findings (or that a human
// can use to decide whether to consolidate the ledger by hand).
//
// Span-first + paged extraction can yield individually-grounded but
// collectively-noisy claim sets. This audit measures that without
// touching the canonical artifacts.

export const PerSourceDensitySchema = z.object({
  source_id: z.string().regex(/^src_[a-f0-9]{12}$/),
  publisher: z.string().nullable(),
  source_word_count: z.number().int().nonnegative(),
  claim_count: z.number().int().nonnegative(),
  claims_per_1k_words: z.number(),
  share_of_section: z.number(), // share of section's total claim-source attributions; sums to 1.0 ± epsilon across sources
  weak_scope_count: z.number().int().nonnegative(),
  generic_scope_count: z.number().int().nonnegative(),
});

export const NearDuplicateClusterSchema = z.object({
  representative_assert: z.string(),
  member_count: z.number().int().nonnegative(),
  claim_ids: z.array(z.string().regex(/^clm_[a-f0-9]{12}_(heuristic|ollama_intern)_\d+$/)),
});

export const DensityFlagSchema = z.object({
  type: z.enum([
    'source_dominance',
    'high_per_word_density',
    'large_near_duplicate_cluster',
    'weak_scope_majority',
  ]),
  severity: z.enum(['info', 'warn', 'block']),
  message: z.string(),
  affects_source_ids: z.array(z.string().regex(/^src_[a-f0-9]{12}$/)).default([]),
  affects_claim_ids: z
    .array(z.string().regex(/^clm_[a-f0-9]{12}_(heuristic|ollama_intern)_\d+$/))
    .default([]),
});

export const ClaimDensityAuditSchema = z.object({
  audit_id: z.string().regex(/^cda_[0-9]+_[a-z0-9-]+$/),
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  audited_at: z.string(),
  research_os_version: z.string(),
  candidate_claim_count: z.number().int().nonnegative(),
  source_count: z.number().int().nonnegative(),
  total_source_word_count: z.number().int().nonnegative(),
  claims_per_1k_words: z.number(),
  weak_scope_count: z.number().int().nonnegative(),
  generic_scope_count: z.number().int().nonnegative(),
  per_source: z.array(PerSourceDensitySchema),
  near_duplicate_clusters: z.array(NearDuplicateClusterSchema),
  flags: z.array(DensityFlagSchema),
});

export type PerSourceDensity = z.infer<typeof PerSourceDensitySchema>;
export type NearDuplicateCluster = z.infer<typeof NearDuplicateClusterSchema>;
export type DensityFlag = z.infer<typeof DensityFlagSchema>;
export type ClaimDensityAudit = z.infer<typeof ClaimDensityAuditSchema>;
