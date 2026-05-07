import { z } from 'zod';

// A section report is a read-only roll-up of every research-os artifact for
// a single section. It does not create new truth; it summarises existing
// truth. The shape mirrors the workflow chain so a reader can follow the
// section from gather → extract → density → contradict → review → gate
// in one document.

export const SectionReportSourcesSchema = z.object({
  fetched_ok: z.number().int().nonnegative(),
  source_cards: z.number().int().nonnegative(),
  publishers: z.array(z.string()),
  primary_source_waiver: z.object({
    status: z.enum(['none', 'requested', 'granted']),
    reason: z.string().nullable(),
    compensating_controls: z.array(z.string()),
  }),
});

export const SectionReportExtractionSchema = z.object({
  candidate_claims: z.number().int().nonnegative(),
  claims_per_source: z.array(
    z.object({
      source_id: z.string(),
      claims: z.number().int().nonnegative(),
    }),
  ),
  claims_per_1k_words: z.number(),
  excerpt_pages_processed: z.number().int().nonnegative().nullable(),
  excerpt_id_failures: z.number().int().nonnegative().nullable(),
  malformed_extractor_outputs: z.number().int().nonnegative().nullable(),
  near_duplicate_clusters: z.number().int().nonnegative(),
  weak_scope_count: z.number().int().nonnegative(),
  generic_scope_count: z.number().int().nonnegative(),
  density_flags: z.number().int().nonnegative(),
});

export const SectionReportContradictionsSchema = z.object({
  pairs_compared: z.number().int().nonnegative().nullable(),
  contradiction_candidates: z.number().int().nonnegative(),
  overgeneralization_risks: z.number().int().nonnegative(),
});

export const SectionReportReviewSchema = z.object({
  reviewed: z.boolean(),
  accepted_for_synthesis: z.number().int().nonnegative(),
  needs_scope_repair: z.number().int().nonnegative(),
  needs_source_repair: z.number().int().nonnegative(),
  needs_contradiction_mapping: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  needs_human_review: z.number().int().nonnegative(),
  rejection_or_repair_by_category: z.array(
    z.object({
      category: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
});

export const SectionReportAcceptanceSchema = z.object({
  candidate_claims: z.number().int().nonnegative(),
  accepted_for_synthesis: z.number().int().nonnegative(),
  acceptance_ratio: z.number(), // 0..1
  accepted_per_source: z.number(), // accepted / source_count, 0 if no sources
  accepted_per_1k_words: z.number(),
  top_rejection_category: z.string().nullable(),
  claim_overproduction_fired: z.boolean(),
  synthesis_ready: z.boolean(),
});

export const SectionReportSchema = z.object({
  report_id: z.string().regex(/^secrep_[0-9]+_[a-z0-9-]+$/),
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  reported_at: z.string(),
  research_os_version: z.string(),
  status: z.string(),
  sources: SectionReportSourcesSchema,
  extraction: SectionReportExtractionSchema,
  contradictions: SectionReportContradictionsSchema,
  review: SectionReportReviewSchema,
  acceptance: SectionReportAcceptanceSchema,
  gate_verdict: z.string().nullable(),
  gate_synthesis_eligible: z.boolean().nullable(),
});

export type SectionReport = z.infer<typeof SectionReportSchema>;
