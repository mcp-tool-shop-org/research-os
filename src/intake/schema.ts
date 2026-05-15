import { z } from 'zod';
import { ReviewerOptionsSchema } from '../review/reviewer-options-schema.js';

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

// v0.10 Slice 3 (R-003 + R-005) — per-pack overrides for source-card
// severity-detection thresholds. Optional; absence yields DEFAULT_SEVERITY_THRESHOLDS.
// Every threshold is itself optional so a pack can tune one knob without
// re-declaring the rest.
export const BotCheckThresholdsConfigSchema = z
  .object({
    max_body_words_with_marker: z.number().int().positive().optional(),
    max_bytes_for_script_density: z.number().int().positive().optional(),
    min_script_density_ratio: z.number().min(0).max(1).optional(),
    max_prose_words_no_marker: z.number().int().nonnegative().optional(),
    max_bytes_for_fast_response: z.number().int().positive().optional(),
    max_response_time_ms: z.number().int().positive().optional(),
  })
  .strict();

export const ExtractionRatioThresholdsConfigSchema = z
  .object({
    max_source_words: z.number().int().positive().optional(),
    min_extracted_words: z.number().int().positive().optional(),
    min_ratio: z.number().positive().optional(),
  })
  .strict();

export const SeverityThresholdsConfigSchema = z
  .object({
    bot_check: BotCheckThresholdsConfigSchema.optional(),
    extraction_word_count_ratio: ExtractionRatioThresholdsConfigSchema.optional(),
  })
  .strict();

export const AuditConfigSchema = z
  .object({
    severity_thresholds: SeverityThresholdsConfigSchema.optional(),
  })
  .strict();

// Section-scoped source-floor waiver. Each entry stands alone with its own
// reason + compensating_controls audit trail. Earned by Experiment 3 XRPL
// Pack Session 2 — canonical-protocol sections (XRPL Foundation docs, XLS
// standards, rippled implementation) are structurally single-publisher and
// the global publisher-diversity floor inappropriately fails them. The
// waiver is per-(section_id, scope), so a section can have separate
// waivers for different floor checks without weakening the pack default.
export const SectionScopedWaiverSchema = z.object({
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/, 'Section id must look like "01-landscape"'),
  scope: z.enum(['min_independent_publishers', 'primary_sources_required']),
  reason: z.string().min(1),
  compensating_controls: z.array(z.string()).min(1),
});

export const PrimarySourceWaiverSchema = z.object({
  status: z.enum(['none', 'requested', 'granted']).default('none'),
  reason: z.string().optional(),
  compensating_controls: z.array(z.string()).default([]),
  // Section-scoped waivers; each entry is its own waiver record. Independent
  // of the pack-level status/reason/compensating_controls fields above.
  // Defaults to [] for backward compatibility — existing packs unaffected.
  section_waivers: z.array(SectionScopedWaiverSchema).default([]),
});

export const FreshnessRequirementsSchema = z.object({
  required: z.boolean().default(true),
  max_source_age_months: z.number().int().positive().nullable().default(null),
});

// A documented reviewer-profile preset. Bundles the model/window/mode that
// were known-good (or known-bad) on a given rig so future runs don't have
// to rediscover timeout/context/false-positive issues. Status:
//   - calibrated_baseline: passed seeded calibration; safe default
//   - experimental:        not yet calibrated; results untrusted
//   - deprecated:          shipped, then disqualified by calibration
export const ReviewProfilePresetSchema = z.object({
  general_model: z.string().nullable().default(null),
  critic_model: z.string().nullable().default(null),
  review_window: z.number().int().positive().nullable().default(null),
  mode: z.enum(['general', 'two_pass']).default('two_pass'),
  status: z
    .enum(['calibrated_baseline', 'experimental', 'deprecated'])
    .default('experimental'),
  notes: z.string().nullable().default(null),
  reviewer_options: ReviewerOptionsSchema.optional(),
});

export const DEFAULT_REVIEW_PROFILES: Record<string, z.input<typeof ReviewProfilePresetSchema>> = {
  // The dogfood-validated baseline. Section 03 of research-os-spec is the
  // calibration fixture: long sources, waiver pressure, 715 candidates,
  // hermes3:8b-only two-pass with window 10 hits 0% false-flag on the
  // seeded fixture and the narrow_critic actually fires.
  'hermes-two-pass': {
    general_model: 'hermes3:8b',
    critic_model: 'hermes3:8b',
    review_window: 10,
    mode: 'two_pass',
    status: 'calibrated_baseline',
    notes:
      'Calibrated baseline as of v0.1. 0% good-claim FPR on the seeded fixture; bad-claim any-flag recall 9/13 (69%). Smaller window required because hermes3:8b at 4-bit on a 5080 cannot complete 25-claim windows within a 3-minute budget.',
  },
  'hermes-two-pass-deterministic': {
    general_model: 'hermes3:8b',
    critic_model: 'hermes3:8b',
    review_window: 30,
    mode: 'two_pass',
    status: 'experimental',
    notes:
      'Deterministic Hermes baseline (temperature=0, seed=7). seeded-v1 canonical receipt: failed (recurring per_category_any_flag_floor + decision_vocab_completeness — F-52, F-49). See calibration/reviewer-profiles/hermes-two-pass-deterministic/seeded-v1.md.',
    reviewer_options: { temperature: 0, seed: 7 },
  },
};

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
  // v0.10 Slice 3 — optional per-pack audit configuration. Source-card
  // severity-detection thresholds for R-003 (bot-check) + R-005 (extraction
  // ratio) live here. Defaults come from DEFAULT_SEVERITY_THRESHOLDS.
  audit: AuditConfigSchema.optional(),
  // Reviewer-profile presets baked into the pack so future review runs
  // (across any section in this pack) inherit the calibrated configuration
  // without rediscovering rig-specific timeouts and context issues. Override
  // with `--preset <name>` on `research-os review`.
  review_profiles: z
    .record(z.string(), ReviewProfilePresetSchema)
    .default(() => ({ ...DEFAULT_REVIEW_PROFILES })),
  frozen_at: z.string().nullable().default(null),
});

export type Section = z.infer<typeof SectionSchema>;
export type GateConfig = z.infer<typeof GateConfigSchema>;
export type AuditConfig = z.infer<typeof AuditConfigSchema>;
export type SeverityThresholdsConfig = z.infer<typeof SeverityThresholdsConfigSchema>;
export type PrimarySourceWaiver = z.infer<typeof PrimarySourceWaiverSchema>;
export type SectionScopedWaiver = z.infer<typeof SectionScopedWaiverSchema>;
export type ReviewProfilePreset = z.infer<typeof ReviewProfilePresetSchema>;
export type ResearchYaml = z.infer<typeof ResearchYamlSchema>;
