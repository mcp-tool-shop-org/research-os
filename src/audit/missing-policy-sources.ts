/**
 * R-017 — Pack-scope-aware policy-source warning (v0.12 Slice 4).
 *
 * Surfaces failure_4 from operator-aloneness DST v0.3 (AASM/policy-society
 * source absent on a policy-oriented pack). The audit warning is
 * INFORMATIONAL ONLY — it does not affect gate verdict, freeze receipt, or
 * pack-publish. It writes audits/missing-policy-sources.{json,md} alongside
 * the existing informational audits (weak-sources, source-diversity-gaps,
 * stale-sources, scope-widening-risks).
 *
 * Detection law (LOCKED, deterministic, no LLM):
 *   - Pack decision question (research.yaml.topic + research.yaml.decision)
 *     contains at least one closed-list policy keyword (case-insensitive
 *     substring match) AND
 *   - Source set contains ZERO sources whose effective_source_type is in
 *     POLICY_RELEVANT_SOURCE_TYPES.
 *
 * Closed lists live in code, not config — operators cannot extend via env
 * var or pack-level setting in this slice (would require a config-schema
 * decision that doesn't belong in an ergonomic closure).
 *
 * Source-type subset: the v0.4 source_type enum is
 *   primary | secondary | forum | benchmark | docs | unknown
 * (no scientific_society / official_public_source / regulatory_body — the
 * kickoff anticipated that mismatch). Policy-relevant maps to ['docs'] —
 * institutional documentation pages from regulators, professional
 * societies, government agencies, and standards bodies (AASM position
 * pages, CDC/NIOSH/WHO guidance, IEEE/ACM standards). 'primary' alone is
 * too broad (peer-reviewed AEA economics studies are primary but not
 * policy-society); 'docs' alone is the narrowest faithful subset.
 *
 * Effective source_type honors R-013 rebuild semantics: after
 * `audit --apply --rebuild-cards` runs, raw card.source_type equals the
 * effective value. Before rebuild, the override layer is applied here via
 * getEffectiveSourceType so the warning correctly suppresses on either
 * persistence state.
 */
import type { ResearchYaml } from '../intake/schema.js';
import type { SourceCard } from '../sources/schema.js';
import { getEffectiveSourceType } from '../sources/effective-card.js';
import type { SourceCardOverride } from '../sources/source-card-overrides-schema.js';

/**
 * Closed list of policy keywords. Substring match (case-insensitive). Kept
 * intentionally small (8 entries) — each keyword is a distinct semantic
 * concept, and substring match handles morphology (policy/policies/
 * policymaker; regulation/regulations; guideline/guidelines).
 *
 * "regulate" was considered but rejected — it's not a substring of
 * "regulatory" (the 'e' at the end of "regulate" is not in "regulatory"),
 * so it would miss the common form. Listing "regulation" and "regulatory"
 * explicitly costs one more entry but matches both the common operator
 * phrasings.
 */
export const POLICY_KEYWORDS = [
  'policy',
  'regulation',
  'regulatory',
  'decision maker',
  'decision-maker',
  'operations decision',
  'guideline',
  'guidance',
] as const;

/**
 * Closed subset of source_type values considered policy-relevant. See
 * module-level comment for the rationale on 'docs' alone (narrowest
 * faithful subset given the existing enum; 'primary' is too broad).
 */
export const POLICY_RELEVANT_SOURCE_TYPES = ['docs'] as const;

export type PolicyRelevantSourceType = (typeof POLICY_RELEVANT_SOURCE_TYPES)[number];

export interface MissingPolicySourcesAudit {
  /**
   * True iff the warning fired — i.e., policy keyword(s) matched AND zero
   * policy-relevant sources exist.
   */
  fired: boolean;
  /**
   * The set of POLICY_KEYWORDS that case-insensitively matched as
   * substrings in the pack's decision question. Empty when no keywords
   * matched. Sorted for stable output.
   */
  matched_keywords: string[];
  /**
   * The pack-level decision question text used for keyword matching. We
   * include both research.yaml.topic and research.yaml.decision (concatenated
   * with a separator) so operators can verify what was scanned.
   */
  decision_question_scanned: string;
  /**
   * The POLICY_RELEVANT_SOURCE_TYPES values that are absent from the
   * source set. When the warning fires, this equals the entire subset.
   * When the warning does NOT fire and the warning is recorded for
   * observability, this is empty.
   */
  policy_relevant_source_types_absent: PolicyRelevantSourceType[];
  /**
   * The number of policy-relevant sources present (post-effective-source-type
   * resolution). When this is > 0, the warning does not fire.
   */
  policy_relevant_source_count: number;
  /**
   * ISO timestamp at audit-build time. Mirrors the rest of the audit
   * artifacts.
   */
  generated_at: string;
}

/**
 * Detect which POLICY_KEYWORDS appear in the supplied text (case-insensitive
 * substring match). Returns a sorted, de-duplicated array of matched
 * keywords. Empty when no match.
 */
export function detectPolicyKeywords(text: string): string[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const kw of POLICY_KEYWORDS) {
    if (lower.includes(kw)) matched.push(kw);
  }
  matched.sort();
  return matched;
}

/**
 * Return true iff the given card's effective source_type (post override layer,
 * matching R-013 rebuild semantics) is in POLICY_RELEVANT_SOURCE_TYPES.
 */
export function isPolicyRelevantCard(
  card: SourceCard,
  overrides: SourceCardOverride[],
): boolean {
  const effective = getEffectiveSourceType(card, overrides);
  return (POLICY_RELEVANT_SOURCE_TYPES as readonly string[]).includes(effective);
}

/**
 * Compose the decision-question text the keyword scan operates on. The
 * pack-level decision question lives in research.yaml.decision (the
 * canonical operationalization) AND research.yaml.topic (the framing
 * question). We concatenate both so operators who put their policy framing
 * in either field still get the warning.
 */
function buildScannedDecisionQuestion(research: ResearchYaml): string {
  const parts: string[] = [];
  if (research.topic && research.topic.trim().length > 0) parts.push(research.topic.trim());
  if (research.decision && research.decision.trim().length > 0) parts.push(research.decision.trim());
  return parts.join(' || ');
}

/**
 * Build the audit object. Always returns a record (fired or not) — the
 * surface is always present so operators get an explicit "no warning"
 * signal rather than an implicit absence (mirrors the R-014 "no
 * regeneration needed" trust-building pattern).
 */
export function buildMissingPolicySourcesAudit(args: {
  research: ResearchYaml;
  sources: SourceCard[];
  overrides: SourceCardOverride[];
  generatedAt: string;
}): MissingPolicySourcesAudit {
  const decisionQuestion = buildScannedDecisionQuestion(args.research);
  const matched = detectPolicyKeywords(decisionQuestion);
  const policyRelevantCount = args.sources.filter((c) => isPolicyRelevantCard(c, args.overrides))
    .length;
  const fired = matched.length > 0 && policyRelevantCount === 0;
  return {
    fired,
    matched_keywords: matched,
    decision_question_scanned: decisionQuestion,
    policy_relevant_source_types_absent: fired
      ? [...POLICY_RELEVANT_SOURCE_TYPES]
      : [],
    policy_relevant_source_count: policyRelevantCount,
    generated_at: args.generatedAt,
  };
}

/**
 * Render the operator-facing markdown. When the warning did NOT fire, the
 * MD still exists with an explicit "no warning" body — operators don't have
 * to infer absence from file-not-present.
 */
export function renderMissingPolicySourcesMarkdown(audit: MissingPolicySourcesAudit): string {
  const lines: string[] = [];
  lines.push('# Missing policy / scientific-society sources');
  lines.push('');
  if (!audit.fired) {
    lines.push('_(no warning — either the pack decision question contains no policy keywords,_');
    lines.push('_ or at least one policy-relevant source is present.)_');
    lines.push('');
    lines.push(`**Generated:** ${audit.generated_at}`);
    lines.push('');
    lines.push(`**Decision question scanned:** ${audit.decision_question_scanned || '_(none)_'}`);
    lines.push('');
    lines.push(`**Matched keywords:** ${audit.matched_keywords.length > 0 ? audit.matched_keywords.join(', ') : '_(none)_'}`);
    lines.push('');
    lines.push(`**Policy-relevant source count:** ${audit.policy_relevant_source_count}`);
    lines.push('');
    return lines.join('\n');
  }
  lines.push(
    '> The pack decision question references policy or regulatory decisions, but the',
  );
  lines.push(
    '> source set contains zero sources whose effective source_type maps to institutional',
  );
  lines.push(
    '> documentation (regulators, professional societies, government agencies,',
  );
  lines.push(
    '> standards bodies). Consider adding sources from bodies like AASM, CDC,',
  );
  lines.push('> NIOSH, IEEE, or equivalent authoritative publishers for the topic domain.');
  lines.push('');
  lines.push(`**Generated:** ${audit.generated_at}`);
  lines.push('');
  lines.push(`**Decision question scanned:** ${audit.decision_question_scanned}`);
  lines.push('');
  lines.push(`**Matched keywords:** ${audit.matched_keywords.join(', ')}`);
  lines.push('');
  lines.push(
    `**Policy-relevant source types absent:** ${audit.policy_relevant_source_types_absent.join(', ')}`,
  );
  lines.push('');
  lines.push(
    'This warning is INFORMATIONAL. It does not affect gate verdict, freeze, or pack-publish.',
  );
  lines.push('The operator may proceed with disclosure.');
  lines.push('');
  return lines.join('\n');
}
