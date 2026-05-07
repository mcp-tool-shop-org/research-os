import { z } from 'zod';

export const SectionStatusSchema = z.enum([
  'draft',
  'gathering',
  'gated',
  'reviewed',
  'frozen',
]);

export const SectionSchema = z.object({
  id: z
    .string()
    .regex(/^[0-9]{2}-[a-z0-9-]+$/, 'Section id must look like "01-landscape"'),
  purpose: z.string().min(1),
  max_time_minutes: z.number().int().positive().default(45),
  min_sources: z.number().int().nonnegative().default(8),
  primary_sources_required: z.number().int().nonnegative().default(2),
  contradictions_required: z.boolean().default(true),
  status: SectionStatusSchema.default('draft'),
});

export const SourceFloorGateSchema = z.object({
  min_sources: z.number().int().nonnegative().default(8),
  min_independent_publishers: z.number().int().nonnegative().default(4),
  primary_sources_required: z.number().int().nonnegative().default(2),
  primary_source_waiver_allowed: z.boolean().default(true),
});

export const ClaimIntegrityGateSchema = z.object({
  every_claim_needs_source: z.boolean().default(true),
  no_orphan_claims: z.boolean().default(true),
  no_source_cluster_monopoly: z.boolean().default(true),
});

export const FreshnessGateSchema = z.object({
  required_for_current_topics: z.boolean().default(true),
  stale_source_policy: z.enum(['warn', 'fail']).default('warn'),
});

export const ContradictionGateSchema = z.object({
  required: z.boolean().default(true),
  unresolved_contradictions_block_synthesis: z.boolean().default(true),
});

export const SectionBudgetGateSchema = z.object({
  max_time_minutes: z.number().int().positive().default(45),
  extension_requires_evidence: z.boolean().default(true),
});

export const GateConfigSchema = z.object({
  source_floor: SourceFloorGateSchema.default({}),
  claim_integrity: ClaimIntegrityGateSchema.default({}),
  freshness: FreshnessGateSchema.default({}),
  contradiction: ContradictionGateSchema.default({}),
  section_budget: SectionBudgetGateSchema.default({}),
});

export const PrimarySourceWaiverSchema = z.object({
  status: z.enum(['none', 'requested', 'granted']).default('none'),
  reason: z.string().optional(),
  compensating_controls: z.array(z.string()).default([]),
});

export const FreshnessRequirementsSchema = z.object({
  required: z.boolean().default(true),
  max_source_age_months: z.number().int().positive().nullable().default(null),
});

export const ResearchYamlSchema = z.object({
  research_os_version: z.string(),
  created_at: z.string(),
  topic: z.string().min(10, 'Topic must be at least 10 characters'),
  decision: z.string().default(''),
  audience: z.string().default('self'),
  desired_output: z.string().default(''),
  max_runtime_minutes: z.number().int().positive().default(240),
  freshness: FreshnessRequirementsSchema.default({}),
  excluded_sources: z.array(z.string()).default([]),
  primary_source_waiver: PrimarySourceWaiverSchema.default({}),
  sections: z.array(SectionSchema).default([]),
  gates: GateConfigSchema.default({}),
  frozen_at: z.string().nullable().default(null),
});

export type Section = z.infer<typeof SectionSchema>;
export type GateConfig = z.infer<typeof GateConfigSchema>;
export type PrimarySourceWaiver = z.infer<typeof PrimarySourceWaiverSchema>;
export type ResearchYaml = z.infer<typeof ResearchYamlSchema>;
