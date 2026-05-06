import { z } from 'zod';
import { SectionStatusSchema } from '../intake/schema.js';

export const SectionGatesYamlSchema = z.object({
  section_id: z
    .string()
    .regex(/^[0-9]{2}-[a-z0-9-]+$/, 'Section id must look like "01-landscape"'),
  purpose: z.string().min(1),
  status: SectionStatusSchema,
  created_at: z.string(),
  max_time_minutes: z.number().int().positive(),
  min_sources: z.number().int().nonnegative(),
  primary_sources_required: z.number().int().nonnegative(),
  contradictions_required: z.boolean(),
});

export type SectionGatesYaml = z.infer<typeof SectionGatesYamlSchema>;
