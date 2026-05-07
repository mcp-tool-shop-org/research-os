import { createHash } from 'node:crypto';

import type { Claim } from '../claims/schema.js';
import type { ClaimReview } from '../review/schema.js';
import type { Contradiction } from '../contradictions/schema.js';
import type { SourceCard } from '../sources/schema.js';
import type { ResearchYaml } from '../intake/schema.js';
import type { CoworkHandoffPayload } from '../cowork/schema.js';
import { jaccardSimilarity } from '../contradictions/scope.js';

import type {
  AllowedSynthesisInput,
  ClaimCluster,
  CrossSectionContradictionRef,
  CrossSectionMap,
  ForbiddenInput,
  ScopeOverlap,
  SectionAcceptedSummary,
  SharedSource,
  WaiverDependency,
} from './types.js';

const SCOPE_OVERLAP_THRESHOLD = 0.3;

export interface DeriveMapInput {
  research: ResearchYaml;
  handoff: CoworkHandoffPayload;
  claimsBySection: Map<string, Claim[]>;
  reviewsBySection: Map<string, ClaimReview[]>;
  contradictionsBySection: Map<string, Contradiction[]>;
  sources: SourceCard[];
  generatedAt: string;
}

function latestDecisionByClaim(reviews: ClaimReview[]): Map<string, ClaimReview> {
  const map = new Map<string, ClaimReview>();
  for (const r of reviews) {
    const existing = map.get(r.claim_id);
    if (!existing || r.created_at > existing.created_at) {
      map.set(r.claim_id, r);
    }
  }
  return map;
}

function clusterClaimsBySharedSources(claims: Claim[]): ClaimCluster[] {
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let root = a;
    while (parent.get(root) && parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    if (!parent.has(root)) parent.set(root, root);
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const c of claims) parent.set(c.claim_id, c.claim_id);

  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const shared = claims[i]!.source_ids.filter((s) => claims[j]!.source_ids.includes(s));
      if (shared.length > 0) union(claims[i]!.claim_id, claims[j]!.claim_id);
    }
  }

  const groups = new Map<string, Claim[]>();
  for (const c of claims) {
    const root = find(c.claim_id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(c);
  }

  const clusters: ClaimCluster[] = [];
  for (const [, members] of groups) {
    if (members.length === 0) continue;
    const sharedSet = new Set<string>();
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        for (const sid of members[i]!.source_ids) {
          if (members[j]!.source_ids.includes(sid)) sharedSet.add(sid);
        }
      }
    }
    const memberIds = members.map((m) => m.claim_id).sort();
    const sections = Array.from(new Set(members.map((m) => m.section_id))).sort();
    const clusterId = `cls_${createHash('sha256').update(memberIds.join('|')).digest('hex').slice(0, 12)}`;
    clusters.push({
      cluster_id: clusterId,
      shared_source_ids: Array.from(sharedSet).sort(),
      member_claim_ids: memberIds,
      spans_sections: sections,
    });
  }
  return clusters;
}

function buildSharedSources(
  acceptedClaims: Claim[],
  sources: SourceCard[],
): SharedSource[] {
  const usage = new Map<string, { claims: Set<string>; sections: Set<string> }>();
  for (const c of acceptedClaims) {
    for (const sid of c.source_ids) {
      if (!usage.has(sid)) {
        usage.set(sid, { claims: new Set(), sections: new Set() });
      }
      usage.get(sid)!.claims.add(c.claim_id);
      usage.get(sid)!.sections.add(c.section_id);
    }
  }
  const out: SharedSource[] = [];
  for (const [sid, { claims: cs, sections: secs }] of usage) {
    if (cs.size < 2 && secs.size < 2) continue;
    const card = sources.find((s) => s.source_id === sid);
    out.push({
      source_id: sid,
      publisher: card?.publisher ?? null,
      source_type: card?.source_type ?? 'unknown',
      used_by_claim_ids: Array.from(cs).sort(),
      spans_sections: Array.from(secs).sort(),
    });
  }
  return out;
}

function buildScopeOverlaps(acceptedClaims: Claim[]): ScopeOverlap[] {
  const out: ScopeOverlap[] = [];
  for (let i = 0; i < acceptedClaims.length; i += 1) {
    for (let j = i + 1; j < acceptedClaims.length; j += 1) {
      const a = acceptedClaims[i]!;
      const b = acceptedClaims[j]!;
      if (a.scope === null || b.scope === null) continue;
      const sim = jaccardSimilarity(a.scope, b.scope);
      if (sim < SCOPE_OVERLAP_THRESHOLD) continue;
      const crossSection = a.section_id !== b.section_id;
      const warning = crossSection
        ? `Cross-section scope overlap (jaccard=${sim.toFixed(2)}). Synthesis must not silently merge these claims; cite each separately and note their scope.`
        : `In-section scope overlap (jaccard=${sim.toFixed(2)}). Synthesis must keep each claim's scope tag intact.`;
      out.push({
        claim_a: a.claim_id,
        claim_b: b.claim_id,
        scope_a: a.scope,
        scope_b: b.scope,
        jaccard: Number(sim.toFixed(4)),
        cross_section: crossSection,
        warning,
      });
    }
  }
  return out;
}

function buildCrossSectionContradictions(
  byClaim: Map<string, string>,
  contradictionsBySection: Map<string, Contradiction[]>,
): CrossSectionContradictionRef[] {
  const out: CrossSectionContradictionRef[] = [];
  for (const list of contradictionsBySection.values()) {
    for (const c of list) {
      const sections = new Set<string>();
      for (const cid of c.claim_ids) {
        const sec = byClaim.get(cid);
        if (sec) sections.add(sec);
      }
      if (sections.size <= 1) continue;
      out.push({
        contradiction_id: c.contradiction_id,
        claim_ids: c.claim_ids,
        sections: Array.from(sections).sort(),
        type: c.type,
        severity: c.severity,
        status: c.status,
      });
    }
  }
  return out;
}

function buildWaiverDependencies(handoff: CoworkHandoffPayload): WaiverDependency[] {
  return handoff.waivers.map((w) => ({
    scope: w.scope,
    family: w.family,
    reason: w.reason,
    compensating_controls: w.compensating_controls,
    applied_to: w.applied_to,
    must_disclose_in: 'both' as const,
  }));
}

function buildSectionsSummary(
  research: ResearchYaml,
  handoff: CoworkHandoffPayload,
): SectionAcceptedSummary[] {
  return research.sections.map((s) => {
    const handoffSection = handoff.sections.find((hs) => hs.section_id === s.id);
    const accepted = handoffSection?.accepted_claim_ids ?? [];
    let excludedReason: string | null = null;
    if (handoffSection) {
      if (!handoffSection.synthesis_eligible) {
        excludedReason = `Section gate verdict ${handoffSection.gate_verdict ?? 'unknown'}; synthesis-eligible=false.`;
      } else if (accepted.length === 0) {
        excludedReason = 'No claims accepted for synthesis in this section.';
      }
    } else {
      excludedReason = 'No handoff entry for this section.';
    }
    return {
      section_id: s.id,
      purpose: s.purpose,
      status: s.status,
      accepted_claim_ids: accepted,
      excluded_reason: excludedReason,
    };
  });
}

export function deriveCrossSectionMap(input: DeriveMapInput): CrossSectionMap {
  const acceptedSet = new Set(input.handoff.accepted_claim_ids);
  const acceptedClaims: Claim[] = [];
  const claimToSection = new Map<string, string>();
  for (const [sectionId, claims] of input.claimsBySection) {
    for (const c of claims) {
      claimToSection.set(c.claim_id, sectionId);
      if (acceptedSet.has(c.claim_id)) acceptedClaims.push(c);
    }
  }

  const claimClusters = clusterClaimsBySharedSources(acceptedClaims);
  const sharedSources = buildSharedSources(acceptedClaims, input.sources);
  const scopeOverlaps = buildScopeOverlaps(acceptedClaims);
  const crossSectionContradictions = buildCrossSectionContradictions(
    claimToSection,
    input.contradictionsBySection,
  );

  const allowedInputs: AllowedSynthesisInput[] = acceptedClaims.map((c) => ({
    claim_id: c.claim_id,
    section_id: c.section_id,
    artifact_path: `sections/${c.section_id}/claims.jsonl`,
    asserts: c.asserts,
    scope: c.scope,
    not: c.not,
    source_ids: c.source_ids,
  }));

  const forbidden: ForbiddenInput[] = [];
  for (const [sectionId, claims] of input.claimsBySection) {
    const reviews = input.reviewsBySection.get(sectionId) ?? [];
    const latest = latestDecisionByClaim(reviews);
    for (const c of claims) {
      if (acceptedSet.has(c.claim_id)) continue;
      const decision = latest.get(c.claim_id)?.decision ?? 'no_review';
      forbidden.push({
        claim_id: c.claim_id,
        section_id: sectionId,
        decision,
        reason:
          decision === 'rejected'
            ? 'Claim rejected by adversarial review.'
            : decision === 'no_review'
              ? 'Claim has no review decision; cannot be cited in synthesis.'
              : `Claim status is "${decision}"; only accepted_for_synthesis claims may enter synthesis.`,
      });
    }
  }

  return {
    pack_id: input.handoff.pack_id,
    pack_topic: input.research.topic,
    pack_decision: input.research.decision,
    generated_at: input.generatedAt,
    accepted_claim_ids: input.handoff.accepted_claim_ids,
    sections: buildSectionsSummary(input.research, input.handoff),
    claim_clusters: claimClusters,
    shared_sources: sharedSources,
    scope_overlaps: scopeOverlaps,
    cross_section_contradictions: crossSectionContradictions,
    waiver_dependencies: buildWaiverDependencies(input.handoff),
    open_questions: [],
    allowed_synthesis_inputs: allowedInputs,
    forbidden_inputs: forbidden,
  };
}
