import { createHash } from 'node:crypto';

import type { ResearchYaml } from '../intake/schema.js';
import type { Claim } from '../claims/schema.js';
import type { ClaimReview } from '../review/schema.js';
import type { Contradiction } from '../contradictions/schema.js';
import type { SectionGateResult } from '../gates/schema.js';

import type {
  CoworkHandoffPayload,
  HandoffMode,
  IndexStatus,
  ReviewDecisionCount,
  SectionState,
  WaiverEntry,
} from './types.js';

export interface DeriveInput {
  research: ResearchYaml;
  perSection: Map<
    string,
    {
      gate: SectionGateResult | null;
      candidateClaims: Claim[];
      claimReviews: ClaimReview[];
      contradictions: Contradiction[];
    }
  >;
  indexStatus: IndexStatus;
  generatedAt: string;
  warnings: string[];
}

export const FORBIDDEN_ACTIONS_ALWAYS = [
  'Mutate sections/<id>/claims.jsonl directly — it is extraction truth (append-only via research-os tools)',
  'Mutate evidence/source-cards/*.json or evidence/fetch-log.jsonl — these are fetched-truth artifacts',
  'Mutate audits/*-gate.json or audits/*-review.json — these are immutable audit snapshots',
  'Cite a source_id that is not present in evidence/source-cards/',
  'Cite a claim_id that is not present in sections/<id>/claims.jsonl',
  'Treat a claim with scope=null as broadly applicable — null-scope means scope-undetermined, not scope-universal',
  'Widen the scope of a claim beyond what the source explicitly supports',
  'Flatten an unresolved contradiction; preserve it deliberately or route it through claim-reviews',
  'Write final synthesis prose unless mode == synthesis_ready',
  'Reconcile contradictions silently — use research-os contradict map / research-os review with explicit decisions',
];

const ALLOWED_WRITE_BASE = [
  'handoffs/cowork-options.md',
  'handoffs/cowork-notes.md',
];

const ALLOWED_WRITE_REPAIR = [
  ...ALLOWED_WRITE_BASE,
  'sections/<id>/open_questions.md',
  'sections/<id>/brief.md (working notes only — final brief lands at synthesis time)',
  'audits/<id>-cowork-repair-notes.md',
];

const ALLOWED_WRITE_SYNTHESIS = [
  ...ALLOWED_WRITE_BASE,
  'synthesis/cross-section-map.md',
  'synthesis/decision-brief.md',
  'synthesis/final-report.md',
  'synthesis/working-report.md',
  'sections/<id>/brief.md (final form, drawing from accepted claims only)',
];

function packId(research: ResearchYaml): string {
  const fingerprint = `${research.topic}|${research.created_at}`;
  return createHash('sha256').update(fingerprint).digest('hex').slice(0, 12);
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

function buildSectionState(args: {
  sectionId: string;
  research: ResearchYaml;
  gate: SectionGateResult | null;
  candidateClaims: Claim[];
  claimReviews: ClaimReview[];
  contradictions: Contradiction[];
}): SectionState {
  const { sectionId, research, gate, candidateClaims, claimReviews, contradictions } = args;
  const sectionMeta = research.sections.find((s) => s.id === sectionId);
  const purpose = sectionMeta?.purpose ?? '';
  const status = sectionMeta?.status ?? 'unknown';

  const decisionByClaim = latestDecisionByClaim(claimReviews);

  const accepted: string[] = [];
  const repair: string[] = [];
  const rejected: string[] = [];
  for (const c of candidateClaims) {
    const d = decisionByClaim.get(c.claim_id);
    if (!d) continue;
    if (d.decision === 'accepted_for_synthesis') accepted.push(c.claim_id);
    else if (d.decision === 'rejected') rejected.push(c.claim_id);
    else repair.push(c.claim_id);
  }

  const unresolved = contradictions.filter((c) => c.status === 'unresolved');
  const blocking = unresolved.filter(
    (c) => c.severity === 'high' || c.severity === 'blocking',
  );

  return {
    section_id: sectionId,
    purpose,
    status,
    has_gate_run: !!gate,
    has_review_run: claimReviews.length > 0,
    gate_verdict: gate?.verdict ?? null,
    synthesis_eligible: gate?.synthesis_eligible ?? false,
    accepted_claim_ids: accepted,
    repair_claim_ids: repair,
    rejected_claim_ids: rejected,
    candidate_claims_total: candidateClaims.length,
    unresolved_contradiction_ids: unresolved.map((c) => c.contradiction_id),
    blocking_reasons: gate?.blocking_reasons ?? [],
    blocking_contradictions_unresolved: blocking.length,
  };
}

function collectWaivers(
  research: ResearchYaml,
  perSection: DeriveInput['perSection'],
): WaiverEntry[] {
  const waivers: WaiverEntry[] = [];
  const w = research.primary_source_waiver;
  if (w.status === 'granted') {
    waivers.push({
      scope: 'pack',
      family: 'source_floor',
      reason: w.reason ?? '',
      compensating_controls: w.compensating_controls ?? [],
      applied_to: 'primary_sources_required',
    });
  }
  for (const [sid, data] of perSection) {
    const gate = data.gate;
    if (!gate) continue;
    for (const wa of gate.waivers_applied) {
      waivers.push({
        scope: 'gate',
        family: wa.family,
        reason: wa.reason,
        compensating_controls: wa.compensating_controls,
        applied_to: `${sid}.${wa.check}`,
      });
    }
  }
  return waivers;
}

function determineMode(
  sections: SectionState[],
  waivers: WaiverEntry[],
  warnings: string[],
): HandoffMode {
  const hasMalformed = warnings.some((w) => /malformed|invalid|parse/i.test(w));
  const invalidWaivers = waivers.some(
    (w) => w.reason.trim().length === 0 || w.compensating_controls.length === 0,
  );
  const blockingContradictions = sections.some(
    (s) => s.blocking_contradictions_unresolved > 0,
  );

  if (hasMalformed || invalidWaivers || blockingContradictions) {
    return 'human_review_required';
  }

  const allReady = sections.every(
    (s) =>
      s.has_gate_run &&
      s.synthesis_eligible &&
      s.has_review_run &&
      s.candidate_claims_total > 0 &&
      s.repair_claim_ids.length === 0 &&
      s.rejected_claim_ids.length === 0 &&
      s.accepted_claim_ids.length === s.candidate_claims_total,
  );

  if (allReady && sections.length > 0) return 'synthesis_ready';
  return 'repair_required';
}

function buildRecommendedNextActions(
  sections: SectionState[],
  mode: HandoffMode,
): string[] {
  const actions: string[] = [];
  if (mode === 'synthesis_ready') {
    actions.push('Run `research-os query "<term>"` to navigate the indexed evidence base before drafting synthesis.');
    actions.push('Draft `synthesis/cross-section-map.md` listing how accepted claims relate across sections (no new facts).');
    actions.push('Draft `synthesis/decision-brief.md` for the pack\'s `decision` field, citing only accepted_claim_ids.');
    actions.push('When done, suggest the user run `research-os index build --all` and `research-os cowork handoff` to refresh the runtime contract.');
    return actions;
  }
  if (mode === 'human_review_required') {
    actions.push('Stop and surface the human-review-required reasons to the operator.');
    actions.push('Prepare options in `handoffs/cowork-options.md` — do not decide.');
    return actions;
  }
  // repair_required
  for (const s of sections) {
    if (!s.has_gate_run) {
      actions.push(`Run \`research-os gate ${s.section_id}\` (no gate result on file yet).`);
      continue;
    }
    if (!s.synthesis_eligible) {
      for (const r of s.blocking_reasons) {
        actions.push(`[${s.section_id}] address blocking gate failure: ${r}`);
      }
      if (s.blocking_reasons.length === 0) {
        actions.push(`[${s.section_id}] gate verdict ${s.gate_verdict ?? 'unknown'} but synthesis is not eligible — re-run \`research-os gate ${s.section_id}\` and review the audits.`);
      }
    }
    if (!s.has_review_run && s.candidate_claims_total > 0) {
      actions.push(`Run \`research-os review ${s.section_id}\` (no review on file yet).`);
    }
    if (s.repair_claim_ids.length > 0) {
      actions.push(`[${s.section_id}] ${s.repair_claim_ids.length} claim(s) need repair per latest review — re-run gather/extract for affected sources, then re-run review.`);
    }
    if (s.unresolved_contradiction_ids.length > 0) {
      actions.push(`[${s.section_id}] resolve, preserve, or reject ${s.unresolved_contradiction_ids.length} unresolved contradiction(s).`);
    }
  }
  if (actions.length === 0) {
    actions.push('No specific repair actions identified, but mode=repair_required — re-run `research-os gate --all` and `research-os review --all` to refresh state.');
  }
  return actions;
}

export function derive(input: DeriveInput): CoworkHandoffPayload {
  const sections: SectionState[] = [];
  const acceptedAll: string[] = [];
  const repairAll: string[] = [];
  const blockedAll: string[] = [];
  const unresolvedContradictionsAll: string[] = [];
  const gateVerdicts: CoworkHandoffPayload['gate_verdicts'] = [];
  const reviewDecisionCounts: ReviewDecisionCount[] = [];

  for (const sectionMeta of input.research.sections) {
    const data = input.perSection.get(sectionMeta.id) ?? {
      gate: null,
      candidateClaims: [],
      claimReviews: [],
      contradictions: [],
    };
    const state = buildSectionState({
      sectionId: sectionMeta.id,
      research: input.research,
      gate: data.gate,
      candidateClaims: data.candidateClaims,
      claimReviews: data.claimReviews,
      contradictions: data.contradictions,
    });
    sections.push(state);
    acceptedAll.push(...state.accepted_claim_ids);
    repairAll.push(...state.repair_claim_ids);
    blockedAll.push(...state.rejected_claim_ids);
    unresolvedContradictionsAll.push(...state.unresolved_contradiction_ids);

    if (data.gate) {
      gateVerdicts.push({
        section_id: sectionMeta.id,
        verdict: data.gate.verdict,
        synthesis_eligible: data.gate.synthesis_eligible,
      });
    }

    const decisionTally: Record<string, number> = {};
    const latest = latestDecisionByClaim(data.claimReviews);
    for (const r of latest.values()) {
      decisionTally[r.decision] = (decisionTally[r.decision] ?? 0) + 1;
    }
    for (const [decision, count] of Object.entries(decisionTally)) {
      reviewDecisionCounts.push({ section_id: sectionMeta.id, decision, count });
    }
  }

  const waivers = collectWaivers(input.research, input.perSection);
  const mode = determineMode(sections, waivers, input.warnings);
  const synthesisAllowed = mode === 'synthesis_ready';

  const allowedWritePaths = mode === 'synthesis_ready'
    ? ALLOWED_WRITE_SYNTHESIS
    : mode === 'human_review_required'
      ? ALLOWED_WRITE_BASE
      : ALLOWED_WRITE_REPAIR;

  const summary = (() => {
    const ready = sections.filter((s) => s.synthesis_eligible).length;
    const blocked = sections.length - ready;
    return `Pack mode=${mode}; ${sections.length} section(s) total, ${ready} synthesis-eligible, ${blocked} blocked or unrun. ${acceptedAll.length} accepted claim(s); ${repairAll.length} need repair; ${blockedAll.length} rejected; ${unresolvedContradictionsAll.length} unresolved contradiction(s); ${waivers.length} waiver(s).`;
  })();

  return {
    pack_id: packId(input.research),
    pack_topic: input.research.topic,
    generated_at: input.generatedAt,
    mode,
    synthesis_allowed: synthesisAllowed,
    summary,
    sections,
    accepted_claim_ids: acceptedAll,
    repair_claim_ids: repairAll,
    blocked_claim_ids: blockedAll,
    unresolved_contradiction_ids: unresolvedContradictionsAll,
    waivers,
    gate_verdicts: gateVerdicts,
    review_decisions: reviewDecisionCounts,
    recommended_next_actions: buildRecommendedNextActions(sections, mode),
    allowed_write_paths: allowedWritePaths,
    forbidden_actions: FORBIDDEN_ACTIONS_ALWAYS,
    index_status: input.indexStatus,
    warnings: input.warnings,
  };
}
