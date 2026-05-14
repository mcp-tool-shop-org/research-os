// Zod schemas for the partial-pack-synthesis.json artifact.
//
// These schemas mirror src/synth/partial-pack/types.ts. They are the contract
// boundary for the artifact: reading code uses them to parse and writing code
// uses them to validate output before persistence.

import { z } from 'zod';

import {
  PARTIAL_PACK_EXCLUSION_REASONS,
  PARTIAL_PACK_ROLES,
  PARTIAL_PACK_STATUS,
} from './types.js';
import { RecoverySummarySchema } from './recovery-embed.js';

export const PartialPackExclusionReasonSchema = z.enum(PARTIAL_PACK_EXCLUSION_REASONS);
export const PartialPackRoleSchema = z.enum(PARTIAL_PACK_ROLES);

// Format invariant for section_paragraph_ids: must be "<section_id>:<paragraph_id>".
// Section IDs follow the existing pack convention (2 digits + dash + slug), but
// to keep the schema permissive against future format evolution we accept any
// non-empty string before/after the colon.
const SectionParagraphIdSchema = z
  .string()
  .min(3)
  .regex(/^[^:]+:[^:]+$/, 'expected "<section_id>:<paragraph_id>" format');

export const PartialPackSupportBundleSchema = z
  .object({
    section_ids: z.array(z.string().min(1)),
    section_paragraph_ids: z.array(SectionParagraphIdSchema),
    section_synthesis_paths: z.array(z.string().min(1)),
  })
  .strict();

export const PartialPackParagraphSchema = z
  .object({
    paragraph_id: z.string().min(1),
    role: PartialPackRoleSchema,
    text: z.string().min(1),
    support_bundle: PartialPackSupportBundleSchema,
  })
  .strict();

export const PartialPackIncludedSectionSchema = z
  .object({
    section_id: z.string().min(1),
    section_purpose: z.string(),
    section_synthesis_path: z.string().min(1),
    paragraph_count: z.number().int().nonnegative(),
  })
  .strict();

// Slice 3b — recovery_summary is an additive optional field embedded under
// every excluded section in fresh partial-pack artifacts. Older artifacts
// without it still parse cleanly (backward-compat).
export const PartialPackExcludedSectionSchema = z
  .object({
    section_id: z.string().min(1),
    section_purpose: z.string(),
    reason: PartialPackExclusionReasonSchema,
    detail: z.string(),
    recovery_summary: RecoverySummarySchema.optional(),
  })
  .strict();

export const PartialPackNoIncludedSectionsErrorSchema = z
  .object({
    code: z.literal('no_included_sections'),
    message: z.string().min(1),
    excluded_sections: z.array(PartialPackExcludedSectionSchema),
  })
  .strict();

// Slice 2c — bundle planner failure when <2 sections qualify for the
// cross-section answer bundle.
export const PartialPackInsufficientCrossSectionCandidatesErrorSchema = z
  .object({
    code: z.literal('insufficient_cross_section_candidates'),
    message: z.string().min(1),
    candidate_pool: z.array(
      z.object({
        section_id: z.string().min(1),
        qualified: z.boolean(),
        reason: z.string(),
      }).strict(),
    ),
  })
  .strict();

// Slice 2c — validator failure persisting after the one allowed retry.
export const PartialPackCrossSectionAnswerSupportMissingErrorSchema = z
  .object({
    code: z.literal('cross_section_answer_support_missing'),
    message: z.string().min(1),
    required_section_paragraph_ids: z.array(z.string()),
    observed_section_paragraph_ids: z.array(z.string()),
    final_reason: z.string(),
  })
  .strict();

// Discriminated union of all partial-pack prose-error shapes.
export const PartialPackProseErrorSchema = z.union([
  PartialPackNoIncludedSectionsErrorSchema,
  PartialPackInsufficientCrossSectionCandidatesErrorSchema,
  PartialPackCrossSectionAnswerSupportMissingErrorSchema,
]);

// Slice 2c — required answer support bundle preselected by the planner.
export const RequiredAnswerBundleSchema = z
  .object({
    role: z.literal('answer'),
    required_section_paragraph_ids: z.array(z.string().min(1)).min(1),
    required_section_ids: z.array(z.string().min(1)).min(1),
  })
  .strict();

// Top-level artifact. `prose` is null when proseError is set; both can be
// present in a single artifact but only one is expected to be active.
export const PartialPackArtifactSchema = z
  .object({
    status: z.literal(PARTIAL_PACK_STATUS),
    scope: z.literal('pack'),
    pack_id: z.string().min(1),
    pack_topic: z.string(),
    pack_mode: z.string(),
    not_freezable_as_pack: z.literal(true),
    not_publishable_as_pack: z.literal(true),
    included_sections: z.array(PartialPackIncludedSectionSchema),
    excluded_sections: z.array(PartialPackExcludedSectionSchema),
    source_section_syntheses: z.array(z.string()),
    // Slice 2c — bundle planner output (null in single-section or
    // pre-planner-failure cases).
    required_answer_bundle: RequiredAnswerBundleSchema.nullable(),
    prose: z
      .object({
        paragraphs: z.array(PartialPackParagraphSchema),
      })
      .strict()
      .nullable(),
    proseError: PartialPackProseErrorSchema.optional(),
    generated_at: z.string().min(1),
    research_os_version: z.string().min(1),
  })
  .strict();

// Schema for reading Slice 1's section-synthesis.json. Intentionally lenient
// via passthrough — Slice 2 reads only the fields it needs (status, prose,
// proseError) and forward-tolerates any added Slice 1 fields.
export const SectionSynthesisProsePartSchema = z.object({
  status: z.string().optional(),
  // section_id and section_purpose at the top level of section-synthesis.json.
  section_id: z.string().optional(),
  section_purpose: z.string().optional(),
  prose: z
    .object({
      paragraphs: z.array(
        z.object({
          paragraph_id: z.string(),
          role: z.string(),
          text: z.string(),
          verifier_decision: z.string(),
        }).passthrough(),
      ),
    }).passthrough().optional(),
  proseError: z.object({
    code: z.string(),
    message: z.string(),
  }).passthrough().optional(),
}).passthrough();

export type PartialPackArtifactParsed = z.infer<typeof PartialPackArtifactSchema>;
