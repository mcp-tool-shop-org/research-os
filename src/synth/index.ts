export { workspace } from './run.js';
export { sectionSynthesis, SectionNotSynthesisEligibleError } from './section-run.js';
export { deriveCrossSectionMap } from './derive.js';
export {
  renderCrossSectionMapMarkdown,
  renderDecisionBrief,
  renderWorkingReport,
  renderFinalReport,
} from './markdown.js';
export {
  CrossSectionMapSchema,
  SectionAcceptedSummarySchema,
  ClaimClusterSchema,
  SharedSourceSchema,
  ScopeOverlapSchema,
  CrossSectionContradictionRefSchema,
  WaiverDependencySchema,
  AllowedSynthesisInputSchema,
  ForbiddenInputSchema,
} from './schema.js';
export type {
  CrossSectionMap,
  SectionAcceptedSummary,
  ClaimCluster,
  SharedSource,
  ScopeOverlap,
  CrossSectionContradictionRef,
  WaiverDependency,
  AllowedSynthesisInput,
  ForbiddenInput,
  WorkspaceOptions,
  WorkspaceSummary,
  SectionSynthesisOptions,
  SectionSynthesisSummary,
} from './types.js';
