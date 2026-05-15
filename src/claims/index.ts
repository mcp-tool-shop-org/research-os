export { extract, evidenceGrounded } from './extract.js';
export {
  auditDensity,
  ClaimDensityAuditSchema,
  PerSourceDensitySchema,
  NearDuplicateClusterSchema,
  DensityFlagSchema,
  type ClaimDensityAudit,
  type PerSourceDensity,
  type NearDuplicateCluster,
  type DensityFlag,
  type AuditDensityOptions,
  type AuditDensityResult,
} from './density/index.js';
export {
  HeuristicClaimExtractor,
  OllamaInternClaimExtractor,
  defaultClaimExtractors,
  pickClaimExtractor,
} from './extractors/index.js';
export {
  ClaimSchema,
  ConfidenceSchema,
  ClaimExtractorSchema,
  ReviewStateSchema,
  type Claim,
} from './schema.js';
export {
  runScopeRepair,
  type ScopeRepairMode,
  type ScopeRepairOptions,
  type ScopeRepairResult,
  type ScopeRepairPrompter,
  type ScopeRepairPrompterContext,
  type ScopeRepairPrompterResponse,
} from './repair-scope.js';
export {
  ScopeRepairSchema,
  ScopeRepairModeSchema,
  validateScopeRepair,
  type ScopeRepair,
} from './scope-repairs-schema.js';
export {
  readScopeRepairs,
  appendScopeRepair,
  latestScopeRepairPerClaim,
  scopeRepairsLedgerPath,
} from './scope-repairs.js';
export {
  proposeScopeForClaim,
  type ScopeProposal,
  type ScopeProposalInput,
} from './scope-proposer.js';
export type {
  ClaimExtractor,
  ClaimExtractorAdapter,
  ClaimExtractionInput,
  ClaimExtractionResult,
  Confidence,
  DraftClaim,
  ExtractClaimsOptions,
  ExtractClaimsSummary,
  ReviewState,
  SourceFetchPair,
} from './types.js';
