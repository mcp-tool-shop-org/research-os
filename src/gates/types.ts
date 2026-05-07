import type { ResearchYaml, Section } from '../intake/schema.js';
import type { Claim } from '../claims/schema.js';
import type { Contradiction } from '../contradictions/schema.js';
import type { FetchReceipt, SourceCard } from '../sources/schema.js';

export type GateFamily =
  | 'source_floor'
  | 'claim_integrity'
  | 'scope_integrity'
  | 'freshness'
  | 'contradiction'
  | 'section_budget'
  | 'waivers';

export type GateCheckStatus =
  | 'pass'
  | 'warn'
  | 'fail'
  | 'pass_with_waiver'
  | 'warn_with_waiver';

export type Verdict = 'pass' | 'warn' | 'fail' | 'blocked';

export interface GateCheckResult {
  family: GateFamily;
  check: string;
  status: GateCheckStatus;
  detail: string;
  evidence: string[];
  blocks_synthesis: boolean;
}

export interface WaiverApplication {
  family: GateFamily;
  check: string;
  reason: string;
  compensating_controls: string[];
  original_status: GateCheckStatus;
  new_status: GateCheckStatus;
}

export interface ClaimCounts {
  total: number;
  candidate: number;
  with_evidence_excerpt: number;
  with_source_hashes: number;
  with_scope: number;
  with_not: number;
  universal_scope_null: number;
  orphans: number;
}

export interface SourceCounts {
  total: number;
  primary: number;
  secondary: number;
  forum: number;
  benchmark: number;
  docs: number;
  unknown: number;
  independent_publishers: number;
  failed_fetches: number;
}

export interface ContradictionCounts {
  total: number;
  unresolved: number;
  blocking: number;
  by_type: Record<string, number>;
}

export interface FreshnessSummary {
  policy_required: boolean;
  max_source_age_months: number | null;
  stale_source_policy: 'warn' | 'fail';
  stale_count: number;
  unknown_date_count: number;
}

export interface ScopeIntegritySummary {
  universal_claims: number;
  scoped_claims: number;
  with_not_constraint: number;
  overgen_risks_total: number;
  overgen_risks_blocking: number;
}

export interface SectionGateResult {
  section_id: string;
  verdict: Verdict;
  summary: string;
  checked_at: string;
  synthesis_eligible: boolean;
  gate_results: GateCheckResult[];
  failures: GateCheckResult[];
  warnings: GateCheckResult[];
  waivers_applied: WaiverApplication[];
  blocking_reasons: string[];
  claim_counts: ClaimCounts;
  source_counts: SourceCounts;
  contradiction_counts: ContradictionCounts;
  freshness_summary: FreshnessSummary;
  scope_integrity_summary: ScopeIntegritySummary;
  next_actions: string[];
}

export interface GateInput {
  research: ResearchYaml;
  section: Section;
  claims: Claim[];
  candidateClaims: Claim[];
  sources: SourceCard[];
  receipts: FetchReceipt[];
  contradictions: Contradiction[];
}

export interface RunGateOptions {
  sectionId: string;
  packPath?: string;
}
