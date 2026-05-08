import { z } from 'zod';

export const ResolutionStatusSchema = z.enum([
  'unresolved',
  'resolved',
  'preserved',
  'rejected',
]);

export const ContradictionResolutionSchema = z.object({
  contradiction_id: z.string().min(1),
  status: ResolutionStatusSchema,
  reason: z.string().min(4),
  resolved_at: z.string().min(1),
  resolved_by: z.string().min(1),
});

export type ContradictionResolution = z.infer<typeof ContradictionResolutionSchema>;
export type ResolutionStatus = z.infer<typeof ResolutionStatusSchema>;
