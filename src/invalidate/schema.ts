import { z } from 'zod';

// An invalidation receipt records that a class of artifacts was archived
// because the contract that produced them was superseded. It is the
// truth-preserving alternative to silent deletion: the old artifacts move
// into audits/legacy/<label>/<timestamp>/, the receipt names what moved and
// why, and downstream consumers can see that legacy state existed and
// what replaced it.

export const ArchivedArtifactSchema = z.object({
  src: z.string(), // path relative to packPath, before archival
  dst: z.string(), // path relative to packPath, after archival
});

export const SectionStatusChangeSchema = z.object({
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  before: z.string(),
  after: z.string(),
});

export const InvalidationReceiptSchema = z.object({
  receipt_id: z.string().regex(/^inv_[0-9]+_[a-z0-9-]+$/),
  contract_label: z.string().min(1),
  superseded_contract: z.string().min(1).nullable(),
  new_contract: z.string().min(1),
  reason: z.string().min(8),
  invalidated_at: z.string(),
  research_os_version: z.string(),
  affected_sections: z.array(z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/)),
  archived_artifacts: z.array(ArchivedArtifactSchema),
  section_status_changes: z.array(SectionStatusChangeSchema),
  frozen_at_cleared: z.boolean(),
  notes: z.string().nullable(),
});

export type InvalidationReceipt = z.infer<typeof InvalidationReceiptSchema>;
export type ArchivedArtifact = z.infer<typeof ArchivedArtifactSchema>;
export type SectionStatusChange = z.infer<typeof SectionStatusChangeSchema>;
