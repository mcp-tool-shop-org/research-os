import type { PlannerTimeoutSource, ProseCallToolClient } from './prose/types.js';

export interface SectionAcceptedSummary {
  section_id: string;
  purpose: string;
  status: string;
  accepted_claim_ids: string[];
  excluded_reason: string | null;
}

export interface ClaimCluster {
  cluster_id: string;
  shared_source_ids: string[];
  member_claim_ids: string[];
  spans_sections: string[];
}

export interface SharedSource {
  source_id: string;
  publisher: string | null;
  source_type: string;
  used_by_claim_ids: string[];
  spans_sections: string[];
}

export interface ScopeOverlap {
  claim_a: string;
  claim_b: string;
  scope_a: string | null;
  scope_b: string | null;
  jaccard: number;
  cross_section: boolean;
  warning: string;
}

export interface CrossSectionContradictionRef {
  contradiction_id: string;
  claim_ids: string[];
  sections: string[];
  type: string;
  severity: string;
  status: string;
}

export interface WaiverDependency {
  scope: 'pack' | 'gate';
  family: string;
  reason: string;
  compensating_controls: string[];
  applied_to: string;
  must_disclose_in: 'decision-brief.md' | 'final-report.md' | 'both';
}

export interface AllowedSynthesisInput {
  claim_id: string;
  section_id: string;
  artifact_path: string;
  asserts: string;
  scope: string | null;
  not: string | null;
  source_ids: string[];
}

export interface ForbiddenInput {
  claim_id: string;
  section_id: string;
  decision: string;
  reason: string;
}

export interface CrossSectionMap {
  pack_id: string;
  pack_topic: string;
  pack_decision: string;
  generated_at: string;
  accepted_claim_ids: string[];
  sections: SectionAcceptedSummary[];
  claim_clusters: ClaimCluster[];
  shared_sources: SharedSource[];
  scope_overlaps: ScopeOverlap[];
  cross_section_contradictions: CrossSectionContradictionRef[];
  waiver_dependencies: WaiverDependency[];
  open_questions: string[];
  allowed_synthesis_inputs: AllowedSynthesisInput[];
  forbidden_inputs: ForbiddenInput[];
}

export interface WorkspaceOptions {
  packPath?: string;
  /**
   * v0.7.1 — when set, `workspace` delegates to the section-scoped synthesis
   * path. Lets `synth workspace --section <id>` be the alias-spelling of
   * `synth section <id>`, per the kickoff's CLI shape contract.
   */
  sectionId?: string;
}

export interface WorkspaceSummary {
  packPath: string;
  mode: string;
  refused: boolean;
  refusalReason: string | null;
  filesWritten: string[];
  acceptedClaims: number;
  claimClusters: number;
  scopeOverlaps: number;
  crossSectionContradictions: number;
}

export interface SectionSynthesisOptions {
  sectionId: string;
  packPath?: string;
  // For testing: inject a fake MCP client instead of spawning a real subprocess.
  mcpClient?: ProseCallToolClient;
  // Model hint forwarded to the prose pipeline's MCP calls.
  proseModel?: string;
  // Set to true to allow section-run.ts to spawn an MCPClientHandle subprocess
  // when no mcpClient is injected. Defaults to false so existing tests that
  // don't inject a client are not affected by MCP subprocess startup latency.
  // The CLI sets this to true; test code injects mcpClient directly instead.
  spawnMcpClient?: boolean;
  /**
   * R-018 (v0.12.1) — planner-timeout budget in milliseconds, resolved at
   * the CLI surface via `resolvePlannerTimeout`. Forwarded as-is to
   * `runProseSynthesis`. Undefined → DEFAULT_PLANNER_TIMEOUT_MS (15000).
   */
  plannerTimeoutMs?: number;
  /**
   * R-018 (v0.12.1) — origin of the active planner-timeout value, also
   * forwarded to `runProseSynthesis` so the synthesis-metadata records
   * `planner_timeout_overridden_by` when the operator opted in.
   */
  plannerTimeoutSource?: PlannerTimeoutSource;
}

export interface SectionSynthesisSummary {
  packPath: string;
  sectionId: string;
  packMode: string;
  notFreezableAsPack: true;
  notPublishableAsPack: true;
  acceptedClaims: number;
  sourceCount: number;
  waiversApplied: number;
  gateVerdict: string | null;
  jsonPath: string;
  markdownPath: string;
  // v0.9 slice 1: prose generation result.
  proseGenerated: boolean;
  proseMarkdownPath: string | null;
  proseError: string | null;
  /**
   * Defensive cross-check: section-state's accepted_claim_ids should be a
   * subset of the pack-level accepted_claim_ids. If this is false, the
   * handoff producer has a bug — surface it without failing the run.
   */
  acceptedIdsCrossCheckOk: boolean;
}
