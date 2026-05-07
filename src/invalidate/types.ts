export interface InvalidateExtractionOptions {
  packPath?: string;
  reason: string;
  // Default: 'pre-span-extraction'. The folder name under audits/legacy/.
  label?: string;
  // Default: 'span-first-extraction'. Recorded as new_contract.
  newContract?: string;
  // Default: 'authored-evidence-excerpt'. Recorded as superseded_contract.
  supersededContract?: string;
  notes?: string;
  now?: () => Date;
}

export interface InvalidateExtractionResult {
  performed: boolean; // false if there was nothing to invalidate
  receiptId: string | null;
  contractLabel: string;
  affectedSections: string[];
  archivedCount: number;
  archiveDir: string | null; // relative to packPath
  message: string;
}
