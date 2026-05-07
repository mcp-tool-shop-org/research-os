import { z } from 'zod';

export const ContradictionTypeSchema = z.enum([
  'direct_conflict',
  'scope_conflict',
  'temporal_conflict',
  'definition_conflict',
  'evidence_conflict',
  'overgeneralization_risk',
]);

export const SeveritySchema = z.enum(['low', 'medium', 'high', 'blocking']);

export const OverlapAssessmentSchema = z.enum([
  'fully_overlapping',
  'partially_overlapping',
  'non_overlapping',
  'unknown',
]);

export const ContradictionDetectorSchema = z.enum(['heuristic', 'ollama-intern']);

export const ContradictionStatusSchema = z.enum([
  'unresolved',
  'reconciled',
  'preserved_deliberately',
  'rejected',
]);

export const ContradictionConfidenceSchema = z.enum(['low', 'medium', 'high']);

export const ContradictionSchema = z.object({
  contradiction_id: z.string().regex(/^cnt_[a-f0-9]{12}_(heuristic|ollama_intern)$/),
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  claim_ids: z
    .array(z.string().regex(/^clm_[a-f0-9]{12}_(heuristic|ollama_intern)_\d+$/))
    .length(2, 'contradictions are pair-wise in v0.1'),
  source_ids: z.array(z.string().regex(/^src_[a-f0-9]{12}$/)).min(1),
  type: ContradictionTypeSchema,
  summary: z.string().min(1),
  scope_analysis: z.string(),
  overlap_assessment: OverlapAssessmentSchema,
  severity: SeveritySchema,
  confidence: ContradictionConfidenceSchema,
  detector: ContradictionDetectorSchema,
  detection_method: z.string().min(1),
  evidence: z.string(),
  status: ContradictionStatusSchema,
  created_at: z.string(),
});

export type Contradiction = z.infer<typeof ContradictionSchema>;
