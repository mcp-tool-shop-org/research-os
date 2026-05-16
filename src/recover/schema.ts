// Zod schemas for the recovery artifact + advisor I/O.
// These are the contract boundary for `recovery/blocked-section-recovery.json`
// and the advisor's MCP response shape.

import { z } from 'zod';

import {
  ADVICE_CONFIDENCE_LEVELS,
  ADVISOR_PATHS,
  FAILURE_SHAPES,
  FALLBACK_CAUSES,
  PIPELINE_STAGES,
  RECOVERY_ACTIONS,
  RECOVERY_ARTIFACT_STATUS,
  VERIFIER_REJECTION_REASONS,
} from './types.js';

export const FailureShapeSchema = z.enum(FAILURE_SHAPES);
export const RecoveryActionIdSchema = z.enum(RECOVERY_ACTIONS);
export const PipelineStageSchema = z.enum(PIPELINE_STAGES);
export const AdviceConfidenceSchema = z.enum(ADVICE_CONFIDENCE_LEVELS);
export const AdvisorPathSchema = z.enum(ADVISOR_PATHS);
export const VerifierRejectionReasonSchema = z.enum(VERIFIER_REJECTION_REASONS);
export const FallbackCauseSchema = z.enum(FALLBACK_CAUSES);
export const FallbackTimingSchema = z
  .object({
    elapsed_ms: z.number().int().nonnegative(),
    budget_ms: z.number().int().nonnegative(),
  })
  .strict();

export const ReversibilitySchema = z.enum(['high', 'medium', 'low']);

export const EvidenceStateSchema = z
  .object({
    extracted_claims: z.number().int().nonnegative(),
    accepted_claims: z.number().int().nonnegative(),
    frame_excluded_claims: z.number().int().nonnegative(),
    needs_repair_claims: z.number().int().nonnegative(),
    sources: z.number().int().nonnegative(),
    distinct_publishers: z.number().int().nonnegative(),
    distinct_primary_publishers: z.number().int().nonnegative(),
  })
  .strict();

export const SectionDiagnosisSchema = z
  .object({
    section_id: z.string().min(1),
    section_purpose: z.string(),
    failure_shape: FailureShapeSchema,
    blocking: z.boolean(),
    waiveable: z.boolean(),
    stage: PipelineStageSchema,
    evidence_state: EvidenceStateSchema,
    detail: z.string(),
  })
  .strict();

export const AllowedActionSchema = z
  .object({
    action_id: RecoveryActionIdSchema,
    rank: z.number().int().positive(),
    reversibility: ReversibilitySchema,
    command_hint: z.string(),
    why: z.string(),
  })
  .strict();

export const ForbiddenActionSchema = z
  .object({
    action_id: RecoveryActionIdSchema,
    why_forbidden: z.string().min(1),
  })
  .strict();

export const LawfulActionGraphSchema = z
  .object({
    section_id: z.string().min(1),
    allowed_actions: z.array(AllowedActionSchema),
    forbidden_actions: z.array(ForbiddenActionSchema),
  })
  .strict();

// Advisor JSON-schema-friendly version (for ollama_extract structured output).
// Same shape, but a plain object the MCP tool can pass through.
export const RECOVERY_ADVICE_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    section_id: { type: 'string' },
    failure_summary: { type: 'string', minLength: 1 },
    recommended_action: {
      type: 'object',
      properties: {
        action_id: { type: 'string', enum: [...RECOVERY_ACTIONS] },
        rank_taken: { type: 'integer', minimum: 1 },
        contrastive_framing: { type: 'string', minLength: 1 },
        why_smallest_reversible: { type: 'string', minLength: 1 },
        command_hint: { type: 'string' },
        expected_outcome: { type: 'string', minLength: 1 },
      },
      required: [
        'action_id',
        'rank_taken',
        'contrastive_framing',
        'why_smallest_reversible',
        'command_hint',
        'expected_outcome',
      ],
      additionalProperties: false,
    },
    also_consider: {
      type: 'array',
      maxItems: 2,
      items: {
        type: 'object',
        properties: {
          action_id: { type: 'string', enum: [...RECOVERY_ACTIONS] },
          when_to_prefer: { type: 'string', minLength: 1 },
        },
        required: ['action_id', 'when_to_prefer'],
        additionalProperties: false,
      },
    },
    do_not: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action_id: { type: 'string', enum: [...RECOVERY_ACTIONS] },
          why_not: { type: 'string', minLength: 1 },
        },
        required: ['action_id', 'why_not'],
        additionalProperties: false,
      },
    },
    system_cannot_see: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      minItems: 1,
    },
    confidence: { type: 'string', enum: [...ADVICE_CONFIDENCE_LEVELS] },
  },
  required: [
    'section_id',
    'failure_summary',
    'recommended_action',
    'also_consider',
    'do_not',
    'system_cannot_see',
    'confidence',
  ],
  additionalProperties: false,
};

// Zod parse for the advisor's response shape (post-MCP, pre-verifier).
export const RecoveryAdviceSchema = z
  .object({
    section_id: z.string().min(1),
    failure_summary: z.string().min(1),
    recommended_action: z
      .object({
        action_id: RecoveryActionIdSchema,
        rank_taken: z.number().int().positive(),
        contrastive_framing: z.string().min(1),
        why_smallest_reversible: z.string().min(1),
        command_hint: z.string(),
        expected_outcome: z.string().min(1),
      })
      .strict(),
    also_consider: z
      .array(
        z
          .object({
            action_id: RecoveryActionIdSchema,
            when_to_prefer: z.string().min(1),
          })
          .strict(),
      )
      .max(2),
    do_not: z.array(
      z
        .object({
          action_id: RecoveryActionIdSchema,
          why_not: z.string().min(1),
        })
        .strict(),
    ),
    system_cannot_see: z.array(z.string().min(1)).min(1),
    confidence: AdviceConfidenceSchema,
  })
  .strict();

export const AdvisorVerifierExhaustedErrorSchema = z
  .object({
    code: z.literal('advisor_verifier_exhausted'),
    message: z.string().min(1),
    attempts: z.number().int().positive(),
    last_rejection_reason: z.string(),
    fallback_cause: FallbackCauseSchema.optional(),
    timing_ms: FallbackTimingSchema.optional(),
  })
  .strict();

export const RecoveryProseErrorSchema = AdvisorVerifierExhaustedErrorSchema;

export const SectionRecoveryResultSchema = z
  .object({
    section_id: z.string().min(1),
    section_purpose: z.string(),
    status: z.enum(['recovery_advised', 'healthy']),
    diagnosis: SectionDiagnosisSchema.nullable(),
    action_graph: LawfulActionGraphSchema.nullable(),
    advice: RecoveryAdviceSchema.nullable(),
    advisor_path: AdvisorPathSchema.nullable(),
    prose_error: RecoveryProseErrorSchema.optional(),
  })
  .strict();

export const RecoveryArtifactSchema = z
  .object({
    status: z.literal(RECOVERY_ARTIFACT_STATUS),
    pack_id: z.string().min(1),
    pack_topic: z.string(),
    pack_mode: z.string(),
    generated_at: z.string().min(1),
    research_os_version: z.string().min(1),
    sections: z.array(SectionRecoveryResultSchema),
  })
  .strict();
