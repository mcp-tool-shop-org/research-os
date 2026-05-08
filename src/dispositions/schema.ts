import { z } from 'zod';

export const ClaimSynthesisDispositionStatusSchema = z.enum([
  'parked_not_for_synthesis',
  'preserved_for_human_note',
  'needs_human_review_excluded',
  'out_of_bounds_regression_fixture',
]);

export const ClaimSynthesisDispositionSchema = z.object({
  claim_id: z.string().min(1),
  section_id: z.string().min(1),
  status: ClaimSynthesisDispositionStatusSchema,
  reason: z.string().min(4),
  decided_by: z.string().min(1),
  authorized_by: z.string().min(1),
  source: z.string().min(1),
  created_at: z.string().min(1),
});

export type ClaimSynthesisDisposition = z.infer<typeof ClaimSynthesisDispositionSchema>;
export type ClaimSynthesisDispositionStatus = z.infer<typeof ClaimSynthesisDispositionStatusSchema>;
