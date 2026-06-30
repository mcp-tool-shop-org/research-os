// Prose synthesis pipeline orchestrator: plan → draft → verify.
//
// Hard invariants enforced here:
//   - Only accepted_for_synthesis claims enter the pipeline.
//   - frame_excluded, rejected, needs_repair, and unreviewed claims are
//     excluded before the planner is called.
//   - The drafter does NOT receive raw source text — only claim text +
//     source-card metadata (id, title, publisher, source_type, url).
//   - A paragraph rejected by the verifier is retried once. On second
//     failure it is disclosed as thin_evidence but NOT admitted as faithful.
//   - The verifier cannot bless any proposition merely because it could be
//     inferred from source material; it must be in the support claim set.

import { createHash, randomBytes } from 'node:crypto';

import { runPlanner } from './planner.js';
import { runDrafter } from './drafter.js';
import { runVerifier } from './verifier.js';
import { PROSE_PROMPT_VERSION, PLANNER_ROLES_ENUM } from './prompt.js';
import {
  DEFAULT_PLANNER_TIMEOUT_MS,
  wrapClientWithTimeout,
} from './types.js';
import type {
  AcceptedClaimInput,
  DraftedParagraph,
  PlannerRole,
  PlannerTimeoutSource,
  ProseBlock,
  ProseNoAnswerClusterError,
  ProseRole,
  ProseRunInput,
  ProseRunResult,
  SourceCardMeta,
  SupportBundle,
  UnusedClaimDisclosure,
  VerifierDecision,
  WaiverMeta,
} from './types.js';

const THIN_EVIDENCE_THRESHOLD = 1; // clusters of this size or less with confidence=low are thin

function isThinEvidence(claims: AcceptedClaimInput[]): boolean {
  if (claims.length > THIN_EVIDENCE_THRESHOLD) return false;
  return claims.every((c) => c.confidence === 'low');
}

function sourceIdsForClaims(claims: AcceptedClaimInput[]): string[] {
  const seen = new Set<string>();
  for (const c of claims) {
    for (const sid of c.source_ids) seen.add(sid);
  }
  return Array.from(seen).sort();
}

function sourceCardsForClaims(
  claims: AcceptedClaimInput[],
  allCards: SourceCardMeta[],
): SourceCardMeta[] {
  const needed = sourceIdsForClaims(claims);
  return allCards.filter((c) => needed.includes(c.source_id));
}

function activityId(): string {
  return `prose_${randomBytes(6).toString('hex')}`;
}

function paragraphId(n: number): string {
  return `p${n + 1}`;
}

// Resolve which waivers apply to a given support bundle. We record all
// pack-scope waivers (they apply everywhere) + section-scope waivers.
// The waiver_id is derived from scope+family+applied_to to give a stable key.
function buildWaiverId(w: WaiverMeta): string {
  return createHash('sha256')
    .update(`${w.family}|${w.applied_to}`)
    .digest('hex')
    .slice(0, 12);
}

export async function runProseSynthesis(input: ProseRunInput): Promise<ProseRunResult> {
  const { sectionPurpose, acceptedClaims, sourceCards, waivers, model } = input;

  if (acceptedClaims.length === 0) {
    return { ok: false, error: 'no accepted claims — cannot generate prose' };
  }

  // R-018 — wrap the MCP client with a per-callTool Promise.race timeout.
  // Default budget is DEFAULT_PLANNER_TIMEOUT_MS (15000ms); the override
  // (cli flag / env var) raises the ceiling. The wrapper rejects with a
  // TIER_TIMEOUT-shaped error whose message embeds `elapsed=…ms` /
  // `budget=…ms` so R-010's classifyFallbackCause regex extracts numbers
  // unchanged. Pre-R-018 callers (no plannerTimeoutMs supplied) still get
  // wrapped at the default — this is the active number recorded in
  // ProseBlock.planner_timeout_ms.
  const plannerTimeoutMs = input.plannerTimeoutMs ?? DEFAULT_PLANNER_TIMEOUT_MS;
  const plannerTimeoutSource: PlannerTimeoutSource =
    input.plannerTimeoutSource ?? 'default';
  const client = wrapClientWithTimeout(input.client, plannerTimeoutMs);

  // R-019 — only propagate the override value into the MCP-side tier guardrail
  // when the operator explicitly set one (source !== 'default'). On the
  // default path we pass `undefined` so ollama-intern-mcp's per-tier profile
  // timeouts govern byte-identically — pre-R-019 callers' wire calls are
  // unchanged. The R-018 wrapper still wraps at DEFAULT_PLANNER_TIMEOUT_MS
  // either way; that outer layer remains the structural hard rail.
  const tierBudgetMsOverride =
    plannerTimeoutSource === 'default' ? undefined : plannerTimeoutMs;

  // ── Step 1: Plan ────────────────────────────────────────────────────────
  const plannerResult = await runPlanner(
    client,
    sectionPurpose,
    acceptedClaims,
    model,
    tierBudgetMsOverride,
  );
  if (!plannerResult.ok) {
    return { ok: false, error: `planner failed: ${plannerResult.error}` };
  }

  // Build role and rationale maps from planner assignments.
  const roleMap = new Map<string, PlannerRole>();
  const rationaleMap = new Map<string, string>();
  for (const a of plannerResult.assignments) {
    roleMap.set(a.claim_id, a.role);
    rationaleMap.set(a.claim_id, a.role_rationale);
  }

  // Separate unused claims (admitted by gate, but off-topic for this section purpose).
  const unusedClaims: UnusedClaimDisclosure[] = [];
  for (const claim of acceptedClaims) {
    const role = roleMap.get(claim.claim_id) ?? 'evidence';
    if (role === 'unused') {
      unusedClaims.push({
        claim_id: claim.claim_id,
        source_card_ids: claim.source_ids,
        role_rationale: rationaleMap.get(claim.claim_id) ?? '(no rationale provided)',
      });
    }
  }

  // Build prose role buckets — exclude unused claims entirely.
  const buckets = new Map<ProseRole, AcceptedClaimInput[]>();
  for (const role of PLANNER_ROLES_ENUM) {
    if (role !== 'unused') buckets.set(role as ProseRole, []);
  }
  for (const claim of acceptedClaims) {
    const role = roleMap.get(claim.claim_id) ?? 'evidence';
    if (role === 'unused') continue;
    buckets.get(role as ProseRole)!.push(claim);
  }

  // Fail with structured error if no claim earned the answer role.
  // Better to signal the gap honestly than to produce off-topic prose.
  const answerBucket = buckets.get('answer') ?? [];
  if (answerBucket.length === 0) {
    const noAnswerCluster: ProseNoAnswerClusterError = {
      code: 'no_answer_cluster',
      message:
        'No accepted claim was assigned the answer role. The section has accepted claims but none directly address the section purpose.',
      accepted_claim_count: acceptedClaims.length,
      unused_count: unusedClaims.length,
      section_purpose: sectionPurpose,
      unused_claims: unusedClaims,
    };
    return { ok: false, error: noAnswerCluster.message, noAnswerCluster };
  }

  // ── Step 2: Draft + Verify ───────────────────────────────────────────────
  // Process roles in display order: answer first (answers the purpose).
  const ROLE_ORDER: ProseRole[] = [
    'answer',
    'evidence',
    'qualifier',
    'caveat',
    'implication',
    'thin_evidence',
  ];

  const paragraphs: DraftedParagraph[] = [];
  const thinParagraphIds: string[] = [];
  const drafterModel = 'unknown';
  const verifierModel = 'unknown';
  let paraIndex = 0;

  for (const role of ROLE_ORDER) {
    const clusterClaims = buckets.get(role) ?? [];
    if (clusterClaims.length === 0) continue;

    const clusterSourceCards = sourceCardsForClaims(clusterClaims, sourceCards);
    const thin = isThinEvidence(clusterClaims) || role === 'thin_evidence';

    // Draft (max 2 attempts: first draft, one retry on verifier rejection).
    let paragraph: string | null = null;
    let verifierDecision: VerifierDecision = 'faithful';

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const draftResult = await runDrafter(
        client,
        sectionPurpose,
        role,
        clusterClaims,
        clusterSourceCards,
        model,
        tierBudgetMsOverride,
      );

      if (!draftResult.ok) {
        if (attempt === 0) continue; // retry once (covers banned opener, transient failure)
        paragraph = null;
        break;
      }

      if (attempt === 0) {
        // Capture model name from the first real drafter envelope — but we
        // only have the paragraph text here. We'll update drafterModel after
        // getting a raw response; for now track via the paragraph.
        // (Model info comes from the raw envelope, not the parsed result.
        //  Since runDrafter only returns the paragraph, we skip model capture
        //  here — 'unknown' is honest.)
      }

      const verifyResult = await runVerifier(
        client,
        sectionPurpose,
        role,
        draftResult.paragraph,
        clusterClaims,
        model,
        tierBudgetMsOverride,
      );

      if (!verifyResult.ok) {
        // A-SYNTH-003: the verifier CALL ITSELF failed (transport /
        // TIER_TIMEOUT / parse) — verification is unavailable, NOT confirmed
        // faithful. Record the distinct `verification_unavailable` decision
        // so downstream `=== 'faithful'` filters exclude this paragraph. We
        // still admit the drafted paragraph with a thin_evidence disclosure
        // (operators need to see the section addressed), but it is no longer
        // miscounted as verified.
        paragraph = draftResult.paragraph;
        verifierDecision = 'verification_unavailable';
        thinParagraphIds.push(paragraphId(paraIndex));
        break;
      }

      verifierDecision = verifyResult.decision;

      if (verifyResult.decision === 'faithful') {
        paragraph = draftResult.paragraph;
        break;
      }

      if (attempt === 1) {
        // Second attempt still failed verification — mark thin_evidence and admit
        // with explicit disclosure, per dispatch: "or marked thin_evidence:true
        // and disclosed in the top block, or omitted from prose".
        // We admit with disclosure rather than dropping — operators need to see
        // the section addressed even with thin evidence.
        paragraph = draftResult.paragraph;
        if (!thinParagraphIds.includes(paragraphId(paraIndex))) {
          thinParagraphIds.push(paragraphId(paraIndex));
        }
      }
    }

    if (paragraph === null) {
      // Drafter failed entirely — skip this cluster.
      continue;
    }

    const pid = paragraphId(paraIndex);
    paraIndex += 1;

    const supportBundle: SupportBundle = {
      claim_ids: clusterClaims.map((c) => c.claim_id),
      source_card_ids: sourceIdsForClaims(clusterClaims),
      waiver_ids: [], // waivers are disclosed at top level, not per-paragraph
      thin_evidence: thin || thinParagraphIds.includes(pid),
    };

    paragraphs.push({
      paragraph_id: pid,
      role,
      text: paragraph,
      support_bundle: supportBundle,
      verifier_decision: verifierDecision,
    });

    if (thin && !thinParagraphIds.includes(pid)) {
      thinParagraphIds.push(pid);
    }
  }

  // ── Disclosures ──────────────────────────────────────────────────────────
  const waiverDisclosures = waivers.map((w) => ({
    waiver_id: buildWaiverId(w),
    reason: w.reason,
  }));

  const block: ProseBlock = {
    section_purpose: sectionPurpose,
    paragraphs,
    disclosures: {
      waivers: waiverDisclosures,
      thin_evidence_paragraphs: thinParagraphIds,
      unused_claims: unusedClaims,
    },
    generator: {
      activity_id: activityId(),
      drafter_model: drafterModel,
      verifier_model: verifierModel,
      prompt_version: PROSE_PROMPT_VERSION,
    },
    planner_timeout_ms: plannerTimeoutMs,
    // Default source → omit overridden_by field entirely so default-path
    // artifacts stay minimal and the override field has unambiguous semantics
    // (presence ⇒ operator opted in).
    ...(plannerTimeoutSource !== 'default'
      ? { planner_timeout_overridden_by: plannerTimeoutSource }
      : {}),
  };

  return { ok: true, block };
}
