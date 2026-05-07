export { gate } from './run.js';
export {
  checkSourceFloor,
  checkClaimIntegrity,
  checkScopeIntegrity,
  checkFreshness,
  checkContradiction,
  checkSectionBudget,
  applyWaivers,
} from './checks/index.js';
export { renderGateMarkdown } from './markdown.js';
export {
  GateFamilySchema,
  GateCheckStatusSchema,
  VerdictSchema,
  GateCheckResultSchema,
  WaiverApplicationSchema,
  SectionGateResultSchema,
} from './schema.js';
export type {
  GateFamily,
  GateCheckStatus,
  Verdict,
  GateCheckResult,
  WaiverApplication,
  ClaimCounts,
  SourceCounts,
  ContradictionCounts,
  FreshnessSummary,
  ScopeIntegritySummary,
  SectionGateResult,
  GateInput,
  RunGateOptions,
} from './types.js';
