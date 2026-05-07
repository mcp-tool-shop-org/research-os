export interface TriageOptions {
  sectionId: string;
  packPath?: string;
  // Per-source claim cap. Default 10. Source dominance threshold; claims
  // beyond this rank get parked_overdense_source.
  perSourceCap?: number;
  // Optional override for low-value detection: asserts shorter than this
  // count as parked_low_value. Default 30.
  minAssertChars?: number;
  // Override the deterministic "now" for receipts.
  now?: () => Date;
}

export interface TriageRunResult {
  triageJsonlPath: string;
  triageMarkdownPath: string;
  summaryJsonPath: string;
  selectedCount: number;
  parkedCount: number;
  needsRepairCount: number;
  candidateClaims: number;
  decisions: Record<string, number>;
}
