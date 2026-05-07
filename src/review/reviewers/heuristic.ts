import type { Claim } from '../../claims/schema.js';
import type {
  DraftFinding,
  Reviewer,
  ReviewerInput,
  ReviewerResult,
} from '../types.js';

const STUB_BRIEF_MARKER = 'This section has not been gathered yet';
const MIN_BRIEF_LENGTH_FOR_HIDDEN_SYNTHESIS = 600;

function normalize(text: string): string {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
}

function evidenceGroundedInRaw(claim: Claim, rawTextBySourceId: Map<string, string>): boolean {
  const excerpt = normalize(claim.evidence_excerpt);
  if (excerpt.length < 8) return false;
  for (const sid of claim.source_ids) {
    const raw = rawTextBySourceId.get(sid);
    if (!raw) continue;
    if (normalize(raw).includes(excerpt)) return true;
  }
  return false;
}

export class HeuristicReviewer implements Reviewer {
  readonly name = 'heuristic' as const;

  async available(): Promise<boolean> {
    return true;
  }

  async review(input: ReviewerInput): Promise<ReviewerResult> {
    const drafts: DraftFinding[] = [];
    const cardIds = new Set(input.sources.map((c) => c.source_id));
    const okReceiptSourceIds = new Set(
      input.receipts.filter((r) => r.fetch_outcome === 'ok').map((r) => r.source_id),
    );

    for (const claim of input.candidateClaims) {
      // unsupported_claim — claim cites no source_id that resolves to a card+receipt
      const validCites = claim.source_ids.filter(
        (sid) => cardIds.has(sid) && okReceiptSourceIds.has(sid),
      );
      if (validCites.length === 0) {
        drafts.push({
          category: 'unsupported_claim',
          severity: 'block',
          summary: `Claim ${claim.claim_id} cites no source that resolves to both a source card and a successful fetch receipt.`,
          evidence: `Cited source_ids: ${claim.source_ids.join(', ') || '(none)'}`,
          required_action: 'Re-run gather for the cited sources, or remove the claim.',
          claim_ids: [claim.claim_id],
          source_ids: claim.source_ids,
          confidence: 'high',
        });
      }

      // ungrounded_excerpt — excerpt does not appear in any cited source's raw text
      if (
        validCites.length > 0 &&
        !evidenceGroundedInRaw(claim, input.rawTextBySourceId)
      ) {
        drafts.push({
          category: 'ungrounded_excerpt',
          severity: 'block',
          summary: `Claim ${claim.claim_id} has an evidence_excerpt that does not appear in any cited source's raw text.`,
          evidence: `Excerpt (truncated): ${claim.evidence_excerpt.slice(0, 200)}`,
          required_action: 'Re-extract the claim from the cited source, or remove it.',
          claim_ids: [claim.claim_id],
          source_ids: claim.source_ids,
          confidence: 'high',
        });
      }

      // overgeneralized_claim / scope_widening — scope null with substantive asserts
      if (claim.scope === null && claim.asserts.length > 40) {
        drafts.push({
          category: 'overgeneralized_claim',
          severity: 'warn',
          summary: `Claim ${claim.claim_id} has scope=null with a substantive assertion. It cannot be treated as broad without scope-widening evidence.`,
          evidence: `Asserts: ${claim.asserts.slice(0, 200)}`,
          required_action: 'Add an explicit scope tag or restrict the claim to the source\'s actual scope.',
          claim_ids: [claim.claim_id],
          source_ids: claim.source_ids,
          confidence: 'medium',
        });
      }

      // missing_not_constraint
      if (claim.not === null) {
        drafts.push({
          category: 'missing_not_constraint',
          severity: 'info',
          summary: `Claim ${claim.claim_id} has no 'not' constraint recorded.`,
          evidence: `Asserts: ${claim.asserts.slice(0, 160)}`,
          required_action: 'Consider adding a not-constraint to defend against overgeneralization downstream.',
          claim_ids: [claim.claim_id],
          source_ids: claim.source_ids,
          confidence: 'low',
        });
      }

      // source_quality_problem — claim with high confidence but weak source type
      const cards = input.sources.filter((c) => claim.source_ids.includes(c.source_id));
      const weakTypes = cards.filter((c) => c.source_type === 'forum' || c.source_type === 'unknown');
      if (claim.confidence === 'high' && weakTypes.length === cards.length && cards.length > 0) {
        drafts.push({
          category: 'source_quality_problem',
          severity: 'warn',
          summary: `Claim ${claim.claim_id} carries confidence=high but every cited source is forum/unknown quality.`,
          evidence: `Source types: ${cards.map((c) => c.source_type).join(', ')}`,
          required_action: 'Lower confidence or add a higher-quality corroborating source.',
          claim_ids: [claim.claim_id],
          source_ids: claim.source_ids,
          confidence: 'medium',
        });
      }

      // source_cluster_monopoly — every cited source from one publisher
      const publishers = new Set(
        cards.map((c) => c.publisher).filter((p): p is string => typeof p === 'string'),
      );
      if (cards.length > 0 && publishers.size <= 1 && claim.source_ids.length >= 2) {
        drafts.push({
          category: 'source_cluster_monopoly',
          severity: 'warn',
          summary: `Claim ${claim.claim_id} sources every cite from a single publisher.`,
          evidence: `Publishers: ${[...publishers].join(', ') || '(unknown)'}`,
          required_action: 'Add a citation from an independent publisher or downgrade the claim.',
          claim_ids: [claim.claim_id],
          source_ids: claim.source_ids,
          confidence: 'medium',
        });
      }

      // stale_claim — based on freshness policy
      if (input.research.freshness.required && input.research.freshness.max_source_age_months !== null) {
        const maxAge = input.research.freshness.max_source_age_months;
        for (const card of cards) {
          if (!card.published_at) continue;
          const d = Date.parse(card.published_at);
          if (Number.isNaN(d)) continue;
          const ageMonths = (Date.now() - d) / (1000 * 60 * 60 * 24 * 30.44);
          if (ageMonths > maxAge) {
            drafts.push({
              category: 'stale_claim',
              severity: 'warn',
              summary: `Claim ${claim.claim_id} cites a source older than the pack freshness policy (${maxAge} months).`,
              evidence: `Source ${card.source_id} published_at=${card.published_at}.`,
              required_action: 'Replace with a more recent source, or mark the section as not requiring freshness.',
              claim_ids: [claim.claim_id],
              source_ids: [card.source_id],
              confidence: 'medium',
            });
            break;
          }
        }
      }

      // unmapped_contradiction — claim is involved in an unresolved contradiction
      const involved = input.contradictions.filter(
        (c) => c.claim_ids.includes(claim.claim_id) && c.status === 'unresolved',
      );
      const blockingInvolved = involved.filter(
        (c) => c.severity === 'high' || c.severity === 'blocking',
      );
      if (blockingInvolved.length > 0) {
        drafts.push({
          category: 'unmapped_contradiction',
          severity: 'block',
          summary: `Claim ${claim.claim_id} is involved in ${blockingInvolved.length} unresolved high/blocking contradiction(s).`,
          evidence: `Contradiction IDs: ${blockingInvolved.map((c) => c.contradiction_id).join(', ')}`,
          required_action: 'Reconcile, preserve_deliberately, or reject the contradicting claim before synthesis.',
          claim_ids: [claim.claim_id],
          source_ids: claim.source_ids,
          confidence: 'high',
        });
      } else if (involved.length > 0) {
        drafts.push({
          category: 'unmapped_contradiction',
          severity: 'warn',
          summary: `Claim ${claim.claim_id} is involved in ${involved.length} unresolved low/medium-severity contradiction(s).`,
          evidence: `Contradiction IDs: ${involved.map((c) => c.contradiction_id).join(', ')}`,
          required_action: 'Resolve or note the contradiction before relying on the claim.',
          claim_ids: [claim.claim_id],
          source_ids: claim.source_ids,
          confidence: 'medium',
        });
      }
    }

    // section-level source_cluster_monopoly — every section source from a single publisher
    if (input.sources.length >= 2 && input.candidateClaims.length > 0) {
      const sectionPublishers = new Set(
        input.sources.map((c) => c.publisher).filter((p): p is string => typeof p === 'string'),
      );
      if (sectionPublishers.size === 1) {
        const [pub] = sectionPublishers;
        drafts.push({
          category: 'source_cluster_monopoly',
          severity: 'warn',
          summary: `Every source for this section traces to a single publisher (${pub}). Claims drawn from this section inherit a publisher-monopoly limitation.`,
          evidence: `Section sources: ${input.sources.length}; distinct publishers: 1 (${pub}).`,
          required_action: 'Add at least one source from an independent publisher before treating these claims as broadly corroborated.',
          claim_ids: input.candidateClaims.map((c) => c.claim_id),
          source_ids: input.sources.map((c) => c.source_id),
          confidence: 'high',
        });
      }
    }

    // claim_overproduction — span-first + paged extraction can yield dense
    // claim sets where one source dominates the section, or a cluster of
    // claims share near-identical asserts. We surface BOTH signals so the
    // reviewer can collapse before synthesis treats every grounded span as
    // equally decision-useful. This is structural — interpretive judgement
    // (which claims to keep) belongs to the LLM reviewer or the human.
    if (input.candidateClaims.length > 0) {
      const claimsBySrc = new Map<string, Claim[]>();
      for (const c of input.candidateClaims) {
        for (const sid of c.source_ids) {
          const arr = claimsBySrc.get(sid) ?? [];
          arr.push(c);
          claimsBySrc.set(sid, arr);
        }
      }
      const total = input.candidateClaims.length;
      // Density flag: any source contributing >= 30 claims, OR (when the
      // section has substantive volume — >= 10 total claims and >= 8 from
      // this source) >= 40% of the section's candidate claims.
      // Tiny sections (1-2 claims) never qualify — there's nothing to flag.
      const MIN_TOTAL_FOR_RATIO = 10;
      const MIN_PER_SOURCE_FOR_RATIO = 8;
      for (const [sid, claims] of claimsBySrc.entries()) {
        const ratio = claims.length / Math.max(1, total);
        const ratioFlag =
          total >= MIN_TOTAL_FOR_RATIO &&
          claims.length >= MIN_PER_SOURCE_FOR_RATIO &&
          ratio >= 0.4;
        if (claims.length >= 30 || ratioFlag) {
          const severity = claims.length >= 50 || (ratioFlag && ratio >= 0.6) ? 'block' : 'warn';
          drafts.push({
            category: 'claim_overproduction',
            severity,
            summary: `Source ${sid} contributes ${claims.length} of ${total} candidate claim(s) (${(ratio * 100).toFixed(0)}% of the section). Even if every claim is grounded, the cluster is likely synthesis noise.`,
            evidence: `Top source: ${sid}; claims=${claims.length}; share=${(ratio * 100).toFixed(0)}%.`,
            required_action:
              'Collapse near-duplicate claims into a smaller set of decision-useful propositions before synthesis.',
            claim_ids: claims.map((c) => c.claim_id),
            source_ids: [sid],
            confidence: 'high',
          });
        }
      }
      // Near-duplicate clustering — group claims by normalised asserts. Any
      // cluster with >= 3 members raises a single finding spanning the cluster.
      const clusters = new Map<string, Claim[]>();
      for (const c of input.candidateClaims) {
        const key = c.asserts.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
        const arr = clusters.get(key) ?? [];
        arr.push(c);
        clusters.set(key, arr);
      }
      for (const [, members] of clusters.entries()) {
        if (members.length >= 3) {
          drafts.push({
            category: 'claim_overproduction',
            severity: 'warn',
            summary: `${members.length} claims in this section share a normalised assertion. Likely extractor over-atomization.`,
            evidence: `Sample assert: "${members[0]!.asserts.slice(0, 140)}"`,
            required_action:
              'Keep one representative claim and reject the duplicates, or merge them into a single claim with combined excerpt IDs.',
            claim_ids: members.map((c) => c.claim_id),
            source_ids: Array.from(new Set(members.flatMap((c) => c.source_ids))),
            confidence: 'medium',
          });
        }
      }
    }

    // hidden_synthesis — section brief.md has been edited beyond stub state
    if (input.briefText !== null) {
      const isStub = input.briefText.includes(STUB_BRIEF_MARKER);
      if (!isStub && input.briefText.length > MIN_BRIEF_LENGTH_FOR_HIDDEN_SYNTHESIS) {
        drafts.push({
          category: 'hidden_synthesis',
          severity: 'warn',
          summary: `Section brief.md has substantive prose. Verify every assertion in the brief traces to a candidate claim in claims.jsonl.`,
          evidence: `brief.md length: ${input.briefText.length} chars; candidate claims: ${input.candidateClaims.length}.`,
          required_action: 'Audit brief.md sentence-by-sentence against the claim ledger; flag any prose without a backing claim.',
          claim_ids: input.candidateClaims.map((c) => c.claim_id),
          source_ids: [],
          confidence: 'low',
        });
      }
    }

    return { ok: true, drafts, method: 'heuristic_field_and_grounding_checks' };
  }
}
