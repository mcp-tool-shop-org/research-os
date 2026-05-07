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
