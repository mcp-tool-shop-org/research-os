import type { ResearchYaml } from '../intake/schema.js';
import type { Claim } from '../claims/schema.js';
import type { ClaimReview, ReviewFinding } from '../review/schema.js';
import type { Contradiction } from '../contradictions/schema.js';
import type { ContradictionResolution } from '../contradictions/resolution-schema.js';
import type { ClaimSynthesisDisposition } from '../dispositions/schema.js';
import type { SectionGateResult } from '../gates/schema.js';
import type { FetchReceipt, SourceCard } from '../sources/schema.js';
import type { CoworkHandoffPayload } from '../cowork/schema.js';

import type {
  ClaimSummary,
  ContradictionSummary,
  HandoffMode,
  OrphanClaimRow,
  PackAuditPayload,
  PackVerdict,
  ReadinessSummary,
  ReviewSummary,
  ScopeWideningRiskRow,
  SourceDiversityGapRow,
  SourceSummary,
  StaleSourceRow,
  SynthesisReadinessRow,
  UnresolvedContradictionRow,
  WaiverSummary,
  WeakSourceRow,
} from './types.js';

export interface AggregateInput {
  research: ResearchYaml;
  perSection: Map<
    string,
    {
      claims: Claim[];
      candidateClaims: Claim[];
      claimReviews: ClaimReview[];
      contradictions: Contradiction[];
      resolutions?: ContradictionResolution[];
      dispositions?: ClaimSynthesisDisposition[];
      gate: SectionGateResult | null;
      findings: ReviewFinding[];
      sourceIdsForSection: string[];
    }
  >;
  sources: SourceCard[];
  receipts: FetchReceipt[];
  handoff: CoworkHandoffPayload | null;
  generatedAt: string;
  warnings: string[];
}

export interface AggregateOutput {
  payload: PackAuditPayload;
  orphanClaims: OrphanClaimRow[];
  staleSources: StaleSourceRow[];
  weakSources: WeakSourceRow[];
  unresolvedContradictions: UnresolvedContradictionRow[];
  scopeWideningRisks: ScopeWideningRiskRow[];
  sourceDiversityGaps: SourceDiversityGapRow[];
}

function packId(research: ResearchYaml): string {
  // Stable ID derived from topic + created_at; same logic as cowork derive
  // (kept inline so audit module does not depend on cowork internals).
  const fingerprint = `${research.topic}|${research.created_at}`;
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i += 1) {
    hash = Math.imul(31, hash) + fingerprint.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(12, '0').slice(-12);
}

function latestDecisionByClaim(reviews: ClaimReview[]): Map<string, ClaimReview> {
  const m = new Map<string, ClaimReview>();
  for (const r of reviews) {
    const existing = m.get(r.claim_id);
    if (!existing || r.created_at > existing.created_at) m.set(r.claim_id, r);
  }
  return m;
}

function buildEffectiveStatuses(resolutions: ContradictionResolution[]): Map<string, string> {
  const map = new Map<string, string>();
  if (resolutions.length === 0) return map;
  const sorted = [...resolutions].sort((a, b) => a.resolved_at.localeCompare(b.resolved_at));
  for (const r of sorted) map.set(r.contradiction_id, r.status);
  return map;
}

function buildEffectiveDispositions(
  dispositions: ClaimSynthesisDisposition[],
  decisionByClaim: Map<string, ClaimReview>,
  warnings: string[],
): Map<string, string> {
  const map = new Map<string, string>();
  if (dispositions.length === 0) return map;
  const sorted = [...dispositions].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const d of sorted) {
    const review = decisionByClaim.get(d.claim_id);
    if (review?.decision === 'accepted_for_synthesis') {
      warnings.push(
        `invalid disposition: claim ${d.claim_id} has accepted_for_synthesis review but a disposition entry was found — layer separation violated`,
      );
      continue;
    }
    map.set(d.claim_id, d.status);
  }
  return map;
}

function buildOrphanClaims(input: AggregateInput): OrphanClaimRow[] {
  const out: OrphanClaimRow[] = [];
  const cardIds = new Set(input.sources.map((c) => c.source_id));
  const okReceiptSourceIds = new Set(
    input.receipts.filter((r) => r.fetch_outcome === 'ok').map((r) => r.source_id),
  );

  for (const [sid, data] of input.perSection) {
    const path = `sections/${sid}/claims.jsonl`;
    for (const claim of data.candidateClaims) {
      for (const refSid of claim.source_ids) {
        if (!cardIds.has(refSid)) {
          out.push({
            claim_id: claim.claim_id,
            section_id: sid,
            reason: 'missing_source_card',
            details: `Claim cites source_id ${refSid} but no source card exists at evidence/source-cards/${refSid}.json`,
            artifact_path: path,
          });
        }
        if (!okReceiptSourceIds.has(refSid)) {
          out.push({
            claim_id: claim.claim_id,
            section_id: sid,
            reason: 'unresolvable_source_id',
            details: `Claim cites source_id ${refSid} which has no successful fetch receipt in evidence/fetch-log.jsonl`,
            artifact_path: path,
          });
        }
      }
      if (claim.source_hashes.length === 0) {
        out.push({
          claim_id: claim.claim_id,
          section_id: sid,
          reason: 'missing_source_hash',
          details: 'Claim has empty source_hashes — tamper detection is not anchored to a fetch receipt.',
          artifact_path: path,
        });
      }
      if (claim.evidence_excerpt.trim().length === 0) {
        out.push({
          claim_id: claim.claim_id,
          section_id: sid,
          reason: 'missing_evidence_excerpt',
          details: 'Claim has empty evidence_excerpt.',
          artifact_path: path,
        });
      }
    }
  }
  return out;
}

function buildStaleSources(input: AggregateInput): StaleSourceRow[] {
  const out: StaleSourceRow[] = [];
  const policy = {
    required: input.research.freshness.required,
    max_source_age_months: input.research.freshness.max_source_age_months,
    stale_source_policy: input.research.gates.freshness.stale_source_policy,
  };
  if (!policy.required) return out;
  for (const card of input.sources) {
    const path = `evidence/source-cards/${card.source_id}.json`;
    if (!card.published_at) {
      out.push({
        source_id: card.source_id,
        section_id: card.section_id,
        publisher: card.publisher,
        reason: 'missing_date',
        details: 'Source card has no published_at; freshness cannot be evaluated.',
        artifact_path: path,
        policy,
      });
      continue;
    }
    const d = Date.parse(card.published_at);
    if (Number.isNaN(d)) {
      out.push({
        source_id: card.source_id,
        section_id: card.section_id,
        publisher: card.publisher,
        reason: 'unparseable_date',
        details: `published_at "${card.published_at}" is not a valid date.`,
        artifact_path: path,
        policy,
      });
      continue;
    }
    if (policy.max_source_age_months !== null) {
      const ageMonths = (Date.now() - d) / (1000 * 60 * 60 * 24 * 30.44);
      if (ageMonths > policy.max_source_age_months) {
        out.push({
          source_id: card.source_id,
          section_id: card.section_id,
          publisher: card.publisher,
          reason: 'too_old',
          details: `Source is ~${ageMonths.toFixed(1)} months old; pack policy max=${policy.max_source_age_months}. stale_source_policy=${policy.stale_source_policy}.`,
          artifact_path: path,
          policy,
        });
      }
    }
  }
  return out;
}

function buildWeakSources(input: AggregateInput): WeakSourceRow[] {
  const out: WeakSourceRow[] = [];
  const cfg = input.research.gates.source_floor;
  for (const [sid, data] of input.perSection) {
    const sectionSources = input.sources.filter((c) => data.sourceIdsForSection.includes(c.source_id));
    if (sectionSources.length === 0) continue;
    const publishers = new Set(
      sectionSources.map((c) => c.publisher).filter((p): p is string => typeof p === 'string'),
    );
    if (publishers.size === 1 && sectionSources.length >= 2) {
      out.push({
        reason: 'source_cluster_monopoly',
        section_id: sid,
        details: `Every source in this section traces to a single publisher (${[...publishers][0]}).`,
        evidence_ids: sectionSources.map((s) => s.source_id),
        artifact_path: `sections/${sid}/sources.jsonl`,
      });
    }
    if (publishers.size < cfg.min_independent_publishers) {
      out.push({
        reason: 'low_independent_publishers',
        section_id: sid,
        details: `${publishers.size} independent publisher(s) — pack policy requires at least ${cfg.min_independent_publishers}.`,
        evidence_ids: [...publishers],
        artifact_path: `sections/${sid}/sources.jsonl`,
      });
    }
    const primary = sectionSources.filter((c) => c.source_type === 'primary').length;
    if (primary < cfg.primary_sources_required) {
      out.push({
        reason: 'missing_primary_source',
        section_id: sid,
        details: `${primary} primary source(s) — pack policy requires at least ${cfg.primary_sources_required}.`,
        evidence_ids: sectionSources.filter((c) => c.source_type === 'primary').map((c) => c.source_id),
        artifact_path: `sections/${sid}/sources.jsonl`,
      });
    }
    const types = new Map<string, number>();
    for (const c of sectionSources) types.set(c.source_type, (types.get(c.source_type) ?? 0) + 1);
    let dominantType: string | null = null;
    let dominantCount = 0;
    for (const [t, n] of types) if (n > dominantCount) { dominantType = t; dominantCount = n; }
    if (dominantType && sectionSources.length >= 4 && dominantCount / sectionSources.length > 0.8) {
      out.push({
        reason: 'excessive_type_imbalance',
        section_id: sid,
        details: `${dominantCount}/${sectionSources.length} (${Math.round((100 * dominantCount) / sectionSources.length)}%) of sources are type=${dominantType}.`,
        evidence_ids: sectionSources.filter((s) => s.source_type === dominantType).map((s) => s.source_id),
        artifact_path: `sections/${sid}/sources.jsonl`,
      });
    }
    const failedReceipts = input.receipts.filter(
      (r) => r.section_id === sid && r.fetch_outcome !== 'ok',
    );
    if (failedReceipts.length > 0 && sectionSources.length < cfg.min_sources) {
      out.push({
        reason: 'failed_fetches_reducing_floor',
        section_id: sid,
        details: `${failedReceipts.length} failed fetch(es) recorded; section currently has ${sectionSources.length} source(s) vs minimum ${cfg.min_sources}.`,
        evidence_ids: failedReceipts.map((r) => r.receipt_id),
        artifact_path: `evidence/fetch-log.jsonl`,
      });
    }
  }
  return out;
}

function buildUnresolvedContradictions(input: AggregateInput): UnresolvedContradictionRow[] {
  const out: UnresolvedContradictionRow[] = [];
  for (const [sid, data] of input.perSection) {
    const effectiveStatuses = buildEffectiveStatuses(data.resolutions ?? []);
    for (const c of data.contradictions) {
      const eff = effectiveStatuses.get(c.contradiction_id);
      const isUnresolved = eff !== undefined ? eff === 'unresolved' : c.status === 'unresolved';
      if (!isUnresolved) continue;
      out.push({
        contradiction_id: c.contradiction_id,
        section_id: sid,
        type: c.type,
        severity: c.severity,
        status: c.status,
        claim_ids: c.claim_ids,
        artifact_path: `sections/${sid}/contradictions.jsonl`,
      });
    }
  }
  return out;
}

function buildScopeWideningRisks(input: AggregateInput): ScopeWideningRiskRow[] {
  const out: ScopeWideningRiskRow[] = [];
  for (const [sid, data] of input.perSection) {
    for (const f of data.findings) {
      if (f.category === 'overgeneralized_claim' || f.category === 'scope_widening') {
        for (const cid of f.claim_ids) {
          out.push({
            reason: 'overgeneralization_finding',
            claim_id: cid,
            section_id: sid,
            details: `${f.category} (${f.severity}): ${f.summary}`,
            artifact_path: `audits/${sid}-findings.jsonl`,
          });
        }
      }
      if (f.category === 'missing_not_constraint') {
        for (const cid of f.claim_ids) {
          out.push({
            reason: 'missing_not_flagged',
            claim_id: cid,
            section_id: sid,
            details: f.summary,
            artifact_path: `audits/${sid}-findings.jsonl`,
          });
        }
      }
    }
    for (const claim of data.candidateClaims) {
      if (claim.scope === null && claim.asserts.length > 40) {
        out.push({
          reason: 'scope_null_in_use',
          claim_id: claim.claim_id,
          section_id: sid,
          details: 'Candidate claim has scope=null with substantive assertion — synthesis must not treat it as broad.',
          artifact_path: `sections/${sid}/claims.jsonl`,
        });
      }
    }
  }
  return out;
}

function buildSourceDiversityGaps(input: AggregateInput): SourceDiversityGapRow[] {
  const out: SourceDiversityGapRow[] = [];
  const cfg = input.research.gates.source_floor;
  const allPublishersBySection = new Map<string, Set<string>>();
  for (const [sid, data] of input.perSection) {
    const sectionSources = input.sources.filter((c) => data.sourceIdsForSection.includes(c.source_id));
    const publishers = new Set(
      sectionSources.map((c) => c.publisher).filter((p): p is string => typeof p === 'string'),
    );
    allPublishersBySection.set(sid, publishers);
    if (sectionSources.length === 0) {
      out.push({
        reason: 'section_has_no_sources',
        section_id: sid,
        details: 'Section has no source cards on file.',
        evidence_ids: [],
      });
      continue;
    }
    if (publishers.size === 1 && sectionSources.length >= 2) {
      out.push({
        reason: 'section_publisher_monopoly',
        section_id: sid,
        details: `Section sources monopolized by ${[...publishers][0]}.`,
        evidence_ids: sectionSources.map((s) => s.source_id),
      });
    } else if (publishers.size < cfg.min_independent_publishers) {
      out.push({
        reason: 'low_section_publisher_count',
        section_id: sid,
        details: `${publishers.size} publisher(s); pack policy requires ${cfg.min_independent_publishers}.`,
        evidence_ids: [...publishers],
      });
    }
  }
  // cross-section overlap: a publisher dominating across multiple sections
  const pubSectionCount = new Map<string, Set<string>>();
  for (const [sid, pubs] of allPublishersBySection) {
    for (const p of pubs) {
      if (!pubSectionCount.has(p)) pubSectionCount.set(p, new Set());
      pubSectionCount.get(p)!.add(sid);
    }
  }
  for (const [pub, sects] of pubSectionCount) {
    if (sects.size >= 3 && allPublishersBySection.size >= 4) {
      out.push({
        reason: 'cross_section_publisher_overlap',
        section_id: '*',
        details: `Publisher "${pub}" appears in ${sects.size} sections; cross-section diversity is reduced.`,
        evidence_ids: [...sects],
      });
    }
  }
  return out;
}

function buildSectionReadiness(input: AggregateInput, warnings: string[]): SynthesisReadinessRow[] {
  const handoffMode: HandoffMode =
    (input.handoff?.mode as HandoffMode | undefined) ?? 'unknown';
  const workspaceAllowed = input.handoff?.synthesis_allowed ?? false;
  return input.research.sections.map((s) => {
    const data = input.perSection.get(s.id);
    const decisionByClaim = data ? latestDecisionByClaim(data.claimReviews) : new Map();
    const effectiveDispositions = buildEffectiveDispositions(
      data?.dispositions ?? [],
      decisionByClaim,
      warnings,
    );
    let accepted = 0;
    let repair = 0;
    let rejected = 0;
    let dispositioned = 0;
    if (data) {
      for (const c of data.candidateClaims) {
        const d = decisionByClaim.get(c.claim_id);
        if (!d) continue;
        if (d.decision === 'accepted_for_synthesis') {
          accepted += 1;
        } else if (d.decision === 'rejected') {
          rejected += 1;
        } else if (effectiveDispositions.has(c.claim_id)) {
          dispositioned += 1;
        } else {
          repair += 1;
        }
      }
    }
    return {
      section_id: s.id,
      purpose: s.purpose,
      status: s.status,
      has_gate_run: !!data?.gate,
      has_review_run: (data?.claimReviews.length ?? 0) > 0,
      gate_verdict: data?.gate?.verdict ?? null,
      synthesis_eligible: data?.gate?.synthesis_eligible ?? false,
      candidate_claims: data?.candidateClaims.length ?? 0,
      accepted_claims: accepted,
      repair_claims: repair,
      rejected_claims: rejected,
      dispositioned_claims: dispositioned,
      blocking_reasons: data?.gate?.blocking_reasons ?? [],
      cowork_handoff_mode: handoffMode,
      workspace_allowed: workspaceAllowed,
    };
  });
}

function buildClaimSummary(input: AggregateInput, orphans: OrphanClaimRow[], warnings: string[]): ClaimSummary {
  let total = 0;
  let candidate = 0;
  let accepted = 0;
  let rejected = 0;
  let repair = 0;
  let dispositioned = 0;
  let noReview = 0;
  let withEvidence = 0;
  let withSourceHashes = 0;
  let scopeNull = 0;
  let notNull = 0;
  for (const data of input.perSection.values()) {
    total += data.claims.length;
    candidate += data.candidateClaims.length;
    const decisionByClaim = latestDecisionByClaim(data.claimReviews);
    const effectiveDispositions = buildEffectiveDispositions(
      data.dispositions ?? [],
      decisionByClaim,
      warnings,
    );
    for (const c of data.candidateClaims) {
      if (c.evidence_excerpt.trim().length > 0) withEvidence += 1;
      if (c.source_hashes.length > 0) withSourceHashes += 1;
      if (c.scope === null) scopeNull += 1;
      if (c.not !== null) notNull += 1;
      const d = decisionByClaim.get(c.claim_id);
      if (!d) noReview += 1;
      else if (d.decision === 'accepted_for_synthesis') accepted += 1;
      else if (d.decision === 'rejected') rejected += 1;
      else if (effectiveDispositions.has(c.claim_id)) dispositioned += 1;
      else repair += 1;
    }
  }
  const orphanIds = new Set(orphans.map((o) => o.claim_id));
  return {
    total,
    candidate,
    accepted_for_synthesis: accepted,
    rejected,
    needs_repair: repair,
    dispositioned,
    no_review: noReview,
    with_evidence_excerpt: withEvidence,
    with_source_hashes: withSourceHashes,
    scope_null: scopeNull,
    not_null: notNull,
    orphans: orphanIds.size,
  };
}

function buildSourceSummary(input: AggregateInput): SourceSummary {
  const cards = input.sources;
  const failed = input.receipts.filter((r) => r.fetch_outcome !== 'ok').length;
  const publishers = new Set(
    cards.map((c) => c.publisher).filter((p): p is string => typeof p === 'string'),
  );
  let withSources = 0;
  let withoutSources = 0;
  for (const data of input.perSection.values()) {
    if (data.sourceIdsForSection.length > 0) withSources += 1;
    else withoutSources += 1;
  }
  return {
    total: cards.length,
    primary: cards.filter((c) => c.source_type === 'primary').length,
    secondary: cards.filter((c) => c.source_type === 'secondary').length,
    forum: cards.filter((c) => c.source_type === 'forum').length,
    benchmark: cards.filter((c) => c.source_type === 'benchmark').length,
    docs: cards.filter((c) => c.source_type === 'docs').length,
    unknown: cards.filter((c) => c.source_type === 'unknown').length,
    independent_publishers: publishers.size,
    failed_fetches: failed,
    sections_with_sources: withSources,
    sections_without_sources: withoutSources,
  };
}

function buildContradictionSummary(input: AggregateInput): ContradictionSummary {
  const all: Contradiction[] = [];
  let cleanLedgers = 0;
  const effectiveUnresolved: Contradiction[] = [];
  for (const [, data] of input.perSection) {
    all.push(...data.contradictions);
    if (data.contradictions.length === 0) cleanLedgers += 1;
    const effectiveStatuses = buildEffectiveStatuses(data.resolutions ?? []);
    for (const c of data.contradictions) {
      const eff = effectiveStatuses.get(c.contradiction_id);
      if (eff !== undefined ? eff === 'unresolved' : c.status === 'unresolved') {
        effectiveUnresolved.push(c);
      }
    }
  }
  const unresolved = effectiveUnresolved;
  const blocking = unresolved.filter(
    (c) => c.severity === 'high' || c.severity === 'blocking',
  );
  const byType: Record<string, number> = {};
  for (const c of all) byType[c.type] = (byType[c.type] ?? 0) + 1;
  return {
    total: all.length,
    unresolved: unresolved.length,
    blocking: blocking.length,
    reconciled: all.filter((c) => c.status === 'reconciled').length,
    preserved_deliberately: all.filter((c) => c.status === 'preserved_deliberately').length,
    rejected: all.filter((c) => c.status === 'rejected').length,
    by_type: byType,
    sections_with_clean_ledger: cleanLedgers,
  };
}

function buildReviewSummary(input: AggregateInput): ReviewSummary {
  let withReview = 0;
  let withoutReview = 0;
  const decisionCounts: Record<string, number> = {};
  let blockingFindings = 0;
  for (const data of input.perSection.values()) {
    if (data.claimReviews.length > 0) withReview += 1;
    else withoutReview += 1;
    const latest = latestDecisionByClaim(data.claimReviews);
    for (const r of latest.values()) {
      decisionCounts[r.decision] = (decisionCounts[r.decision] ?? 0) + 1;
    }
    blockingFindings += data.findings.filter((f) => f.severity === 'block').length;
  }
  return {
    sections_with_review_run: withReview,
    sections_without_review_run: withoutReview,
    decision_counts: decisionCounts,
    blocking_findings: blockingFindings,
  };
}

function buildWaiverSummary(input: AggregateInput): WaiverSummary {
  const byFamily: Record<string, number> = {};
  let total = 0;
  let invalid = 0;
  if (input.handoff) {
    for (const w of input.handoff.waivers) {
      total += 1;
      byFamily[w.family] = (byFamily[w.family] ?? 0) + 1;
      if (!w.reason || w.compensating_controls.length === 0) invalid += 1;
    }
  } else {
    const w = input.research.primary_source_waiver;
    if (w.status === 'granted') {
      total = 1;
      byFamily['source_floor'] = 1;
      if (!w.reason || w.compensating_controls.length === 0) invalid = 1;
    }
  }
  return { total, invalid, by_family: byFamily };
}

function buildReadinessSummary(
  rows: SynthesisReadinessRow[],
  handoff: CoworkHandoffPayload | null,
): ReadinessSummary {
  let ready = 0;
  let repair = 0;
  let blocked = 0;
  let noGate = 0;
  let noReview = 0;
  for (const r of rows) {
    if (!r.has_gate_run) noGate += 1;
    if (!r.has_review_run) noReview += 1;
    if (
      r.has_gate_run &&
      r.synthesis_eligible &&
      r.has_review_run &&
      r.candidate_claims > 0 &&
      r.accepted_claims === r.candidate_claims &&
      r.repair_claims === 0 &&
      r.rejected_claims === 0
    ) {
      ready += 1;
    } else if (r.has_gate_run && r.gate_verdict === 'blocked' && !r.synthesis_eligible) {
      blocked += 1;
    } else {
      repair += 1;
    }
  }
  return {
    total_sections: rows.length,
    ready_sections: ready,
    repair_sections: repair,
    blocked_sections: blocked,
    no_gate_sections: noGate,
    no_review_sections: noReview,
    cowork_handoff_mode: (handoff?.mode as HandoffMode | undefined) ?? 'unknown',
    workspace_allowed: handoff?.synthesis_allowed ?? false,
  };
}

function determineVerdict(args: {
  rows: SynthesisReadinessRow[];
  unresolvedContradictions: UnresolvedContradictionRow[];
  waiverSummary: WaiverSummary;
  warnings: string[];
  readiness: ReadinessSummary;
  totalSections: number;
}): { verdict: PackVerdict; blockingReasons: string[] } {
  const reasons: string[] = [];
  const malformed = args.warnings.filter((w) => /malformed|invalid|parse/i.test(w));
  const blockingContradictions = args.unresolvedContradictions.filter(
    (c) => c.severity === 'blocking' || c.severity === 'high',
  );

  if (malformed.length > 0) {
    reasons.push(...malformed);
    return { verdict: 'human_review_required', blockingReasons: reasons };
  }
  if (args.waiverSummary.invalid > 0) {
    reasons.push('One or more granted waivers are missing reason or compensating_controls.');
    return { verdict: 'human_review_required', blockingReasons: reasons };
  }
  if (blockingContradictions.length > 0) {
    for (const c of blockingContradictions) {
      reasons.push(`Unresolved ${c.severity} contradiction in ${c.section_id}: ${c.contradiction_id}`);
    }
    return { verdict: 'human_review_required', blockingReasons: reasons };
  }

  if (args.readiness.ready_sections === args.totalSections && args.totalSections > 0) {
    return { verdict: 'ready_for_synthesis', blockingReasons: [] };
  }

  // No gates run on any section AND no claims anywhere → blocked (foundational gap).
  if (args.readiness.no_gate_sections === args.totalSections && args.totalSections > 0) {
    reasons.push('No section has a gate result on file. Pack has not begun gating.');
    return { verdict: 'blocked', blockingReasons: reasons };
  }

  // Otherwise repair_required
  if (args.readiness.no_gate_sections > 0) {
    reasons.push(`${args.readiness.no_gate_sections} section(s) have no gate result.`);
  }
  for (const r of args.rows) {
    if (r.gate_verdict === 'blocked') {
      reasons.push(`Section ${r.section_id} is gate-blocked: ${r.blocking_reasons.join('; ')}`);
    }
  }
  return { verdict: 'repair_required', blockingReasons: reasons };
}

function buildNextActions(args: {
  rows: SynthesisReadinessRow[];
  verdict: PackVerdict;
  unresolvedContradictions: UnresolvedContradictionRow[];
  waiverSummary: WaiverSummary;
  weakSources: WeakSourceRow[];
}): string[] {
  const actions = new Set<string>();
  if (args.verdict === 'ready_for_synthesis') {
    actions.add('Run `research-os synth workspace` to lay out the synthesis area.');
    actions.add('Run `research-os index build --all` to refresh the queryable index.');
    return Array.from(actions);
  }
  if (args.verdict === 'human_review_required') {
    actions.add('Stop. Surface blocking reasons to the operator before any further automated work.');
    if (args.waiverSummary.invalid > 0) {
      actions.add('Fix each invalid waiver in research.yaml — granted requires reason + compensating_controls.');
    }
    if (args.unresolvedContradictions.some((c) => c.severity === 'blocking' || c.severity === 'high')) {
      actions.add('Reconcile, preserve_deliberately, or reject blocking contradictions in claim-reviews.');
    }
    return Array.from(actions);
  }
  // repair_required or blocked
  for (const r of args.rows) {
    if (!r.has_gate_run) {
      actions.add(`Run \`research-os gate ${r.section_id}\` (no gate result on file).`);
    } else if (r.gate_verdict === 'blocked') {
      actions.add(`[${r.section_id}] address blocking gate failures, then re-run \`research-os gate ${r.section_id}\`.`);
    }
    if (!r.has_review_run && r.candidate_claims > 0) {
      actions.add(`Run \`research-os review ${r.section_id}\` (no review run on file).`);
    }
    if (r.repair_claims > 0) {
      actions.add(`[${r.section_id}] ${r.repair_claims} claim(s) need repair — re-run gather/extract/review for affected sources.`);
    }
  }
  for (const w of args.weakSources) {
    if (w.reason === 'source_cluster_monopoly') {
      actions.add(`[${w.section_id}] add a source from an independent publisher.`);
    }
  }
  if (actions.size === 0) {
    actions.add('No specific next-actions identified, but pack is not synthesis-ready — re-run audit after refreshing inputs.');
  }
  return Array.from(actions);
}

const AUDIT_FILE_PATHS = [
  'audits/pack-audit.json',
  'audits/pack-audit.md',
  'audits/orphan-claims.json',
  'audits/orphan-claims.md',
  'audits/stale-sources.json',
  'audits/stale-sources.md',
  'audits/weak-sources.json',
  'audits/weak-sources.md',
  'audits/unresolved-contradictions.json',
  'audits/unresolved-contradictions.md',
  'audits/scope-widening-risks.json',
  'audits/scope-widening-risks.md',
  'audits/source-diversity-gaps.json',
  'audits/source-diversity-gaps.md',
  'audits/synthesis-readiness.json',
  'audits/synthesis-readiness.md',
];

export function aggregate(input: AggregateInput): AggregateOutput {
  const orphanClaims = buildOrphanClaims(input);
  const staleSources = buildStaleSources(input);
  const weakSources = buildWeakSources(input);
  const unresolvedContradictions = buildUnresolvedContradictions(input);
  const scopeWideningRisks = buildScopeWideningRisks(input);
  const sourceDiversityGaps = buildSourceDiversityGaps(input);
  const sectionRows = buildSectionReadiness(input, input.warnings);

  const claimSummary = buildClaimSummary(input, orphanClaims, input.warnings);
  const sourceSummary = buildSourceSummary(input);
  const contradictionSummary = buildContradictionSummary(input);
  const reviewSummary = buildReviewSummary(input);
  const waiverSummary = buildWaiverSummary(input);
  const readinessSummary = buildReadinessSummary(sectionRows, input.handoff);

  const { verdict, blockingReasons } = determineVerdict({
    rows: sectionRows,
    unresolvedContradictions,
    waiverSummary,
    warnings: input.warnings,
    readiness: readinessSummary,
    totalSections: input.research.sections.length,
  });

  const synthesisAllowed = verdict === 'ready_for_synthesis';
  const nextActions = buildNextActions({
    rows: sectionRows,
    verdict,
    unresolvedContradictions,
    waiverSummary,
    weakSources,
  });

  const payload: PackAuditPayload = {
    pack_id: packId(input.research),
    pack_topic: input.research.topic,
    generated_at: input.generatedAt,
    verdict,
    synthesis_allowed: synthesisAllowed,
    section_summaries: sectionRows,
    claim_summary: claimSummary,
    source_summary: sourceSummary,
    contradiction_summary: contradictionSummary,
    review_summary: reviewSummary,
    waiver_summary: waiverSummary,
    readiness_summary: readinessSummary,
    audit_files: AUDIT_FILE_PATHS,
    blocking_reasons: blockingReasons,
    warnings: input.warnings,
    next_actions: nextActions,
  };

  return {
    payload,
    orphanClaims,
    staleSources,
    weakSources,
    unresolvedContradictions,
    scopeWideningRisks,
    sourceDiversityGaps,
  };
}
