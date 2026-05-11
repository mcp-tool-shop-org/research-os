import { z } from 'zod';

// Sampling parameters passed verbatim to the Ollama /api/chat `options` field.
// Used by OllamaInternReviewer to control determinism. All fields optional —
// omitted keys fall back to Ollama/model defaults. Introduced in Experiment 6
// Session 2 to make reviewer conditions explicit in calibration receipts.
//
// LOAD-BEARING: temperature: 0 is valid and must not be dropped. All merges
// in OllamaInternReviewer use `!== undefined` checks, NOT truthiness.
export const ReviewerOptionsSchema = z.object({
  num_ctx: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  seed: z.number().int().optional(),
  top_p: z.number().min(0).max(1).optional(),
  top_k: z.number().int().nonnegative().optional(),
  repeat_penalty: z.number().min(0).optional(),
});

export type ReviewerOptions = z.infer<typeof ReviewerOptionsSchema>;
