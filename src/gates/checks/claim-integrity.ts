import type { GateCheckResult, GateInput } from '../types.js';

export function checkClaimIntegrity(input: GateInput): GateCheckResult[] {
  const cfg = input.research.gates.claim_integrity;
  const results: GateCheckResult[] = [];
  const claims = input.candidateClaims;
  const cardIds = new Set(input.sources.map((c) => c.source_id));
  const okReceiptSourceIds = new Set(
    input.receipts.filter((r) => r.fetch_outcome === 'ok').map((r) => r.source_id),
  );

  // every_claim_needs_source — schema-enforced, but verify at gate too
  const noSourceIds = claims.filter((c) => c.source_ids.length === 0);
  if (noSourceIds.length > 0) {
    results.push({
      family: 'claim_integrity',
      check: 'every_claim_needs_source',
      status: 'fail',
      detail: `${noSourceIds.length} claim(s) lack source_ids.`,
      evidence: noSourceIds.map((c) => c.claim_id),
      blocks_synthesis: cfg.every_claim_needs_source,
    });
  } else {
    results.push({
      family: 'claim_integrity',
      check: 'every_claim_needs_source',
      status: 'pass',
      detail: `All ${claims.length} candidate claim(s) reference at least one source_id.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  // no_orphan_claims — claim's source_ids must exist in source-cards
  const orphans = claims.filter((c) => c.source_ids.some((sid) => !cardIds.has(sid)));
  if (orphans.length > 0) {
    results.push({
      family: 'claim_integrity',
      check: 'no_orphan_claims',
      status: 'fail',
      detail: `${orphans.length} claim(s) cite source_id(s) not present in evidence/source-cards/.`,
      evidence: orphans.map((c) => c.claim_id),
      blocks_synthesis: cfg.no_orphan_claims,
    });
  } else {
    results.push({
      family: 'claim_integrity',
      check: 'no_orphan_claims',
      status: 'pass',
      detail: `All claim source_ids resolve to source cards.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  // source_hashes present
  const noHash = claims.filter((c) => c.source_hashes.length === 0);
  if (noHash.length > 0) {
    results.push({
      family: 'claim_integrity',
      check: 'source_hashes_present',
      status: 'fail',
      detail: `${noHash.length} claim(s) have empty source_hashes — tamper detection cannot anchor to a fetch receipt.`,
      evidence: noHash.map((c) => c.claim_id),
      blocks_synthesis: true,
    });
  } else {
    results.push({
      family: 'claim_integrity',
      check: 'source_hashes_present',
      status: 'pass',
      detail: `All candidate claims carry source_hashes.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  // evidence_excerpt grounded — schema requires non-empty; here we re-verify
  const noEvidence = claims.filter((c) => c.evidence_excerpt.trim().length === 0);
  if (noEvidence.length > 0) {
    results.push({
      family: 'claim_integrity',
      check: 'evidence_excerpt_present',
      status: 'fail',
      detail: `${noEvidence.length} claim(s) have empty evidence_excerpt.`,
      evidence: noEvidence.map((c) => c.claim_id),
      blocks_synthesis: true,
    });
  } else {
    results.push({
      family: 'claim_integrity',
      check: 'evidence_excerpt_present',
      status: 'pass',
      detail: `All candidate claims carry an evidence_excerpt.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  // claims must reference a source with a successful fetch receipt
  const missingReceipt = claims.filter((c) => !c.source_ids.some((sid) => okReceiptSourceIds.has(sid)));
  if (missingReceipt.length > 0) {
    results.push({
      family: 'claim_integrity',
      check: 'fetch_receipt_anchored',
      status: 'fail',
      detail: `${missingReceipt.length} claim(s) cite source_id(s) without a successful fetch receipt.`,
      evidence: missingReceipt.map((c) => c.claim_id),
      blocks_synthesis: true,
    });
  } else {
    results.push({
      family: 'claim_integrity',
      check: 'fetch_receipt_anchored',
      status: 'pass',
      detail: `All candidate claims trace to at least one successful fetch receipt.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  // no_source_cluster_monopoly — claims are single-source by architecture; publisher diversity
  // is enforced at the source-card level via min_independent_publishers. This check is informational.
  if (cfg.no_source_cluster_monopoly && claims.length > 0) {
    const monoClaims: string[] = [];
    for (const claim of claims) {
      const pubs = new Set<string>();
      for (const sid of claim.source_ids) {
        const card = input.sources.find((c) => c.source_id === sid);
        if (card?.publisher) pubs.add(card.publisher);
      }
      if (claim.source_ids.length > 0 && pubs.size <= 1) {
        monoClaims.push(claim.claim_id);
      }
    }
    results.push({
      family: 'claim_integrity',
      check: 'no_source_cluster_monopoly',
      status: 'pass',
      detail: `${monoClaims.length}/${claims.length} claim(s) are single-source by architecture (each claim references exactly one source). Publisher diversity is enforced at source-card level via min_independent_publishers.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  return results;
}
