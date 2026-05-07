export { map } from './map.js';
export {
  HeuristicContradictionDetector,
  OllamaInternContradictionDetector,
  defaultContradictionDetectors,
  pickContradictionDetector,
} from './detectors/index.js';
export {
  ContradictionSchema,
  ContradictionTypeSchema,
  SeveritySchema,
  OverlapAssessmentSchema,
  ContradictionStatusSchema,
  ContradictionDetectorSchema,
  ContradictionConfidenceSchema,
  type Contradiction,
} from './schema.js';
export {
  assessScopeOverlap,
  jaccardSimilarity,
  hasNegation,
  tokenize,
} from './scope.js';
export { renderMarkdownView } from './markdown.js';
export type {
  ContradictionType,
  Severity,
  ContradictionDetectorName,
  OverlapAssessment,
  ContradictionStatus,
  DraftContradiction,
  PairedDraft,
  DetectionResult,
  ContradictionDetector,
  MapOptions,
  MapSummary,
} from './types.js';
