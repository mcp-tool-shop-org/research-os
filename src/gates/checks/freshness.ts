import type { GateCheckResult, GateInput } from '../types.js';

function monthsAgo(iso: string): number | null {
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return null;
  return (Date.now() - d) / (1000 * 60 * 60 * 24 * 30.44);
}

export function checkFreshness(input: GateInput): GateCheckResult[] {
  const cfg = input.research.gates.freshness;
  const policy = input.research.freshness;
  const results: GateCheckResult[] = [];
  const cards = input.sources;

  if (!policy.required && !cfg.required_for_current_topics) {
    results.push({
      family: 'freshness',
      check: 'policy_applicability',
      status: 'pass',
      detail: `Freshness policy not required for this pack.`,
      evidence: [],
      blocks_synthesis: false,
    });
    return results;
  }

  if (cards.length === 0) {
    results.push({
      family: 'freshness',
      check: 'policy_applicability',
      status: 'warn',
      detail: `Freshness policy required but no sources to evaluate.`,
      evidence: [],
      blocks_synthesis: false,
    });
    return results;
  }

  const maxAge = policy.max_source_age_months;
  const stale: string[] = [];
  const unknownDate: string[] = [];

  for (const card of cards) {
    if (!card.published_at) {
      unknownDate.push(card.source_id);
      continue;
    }
    if (maxAge === null) continue;
    const age = monthsAgo(card.published_at);
    if (age === null) {
      unknownDate.push(card.source_id);
      continue;
    }
    if (age > maxAge) stale.push(card.source_id);
  }

  if (stale.length > 0) {
    if (cfg.stale_source_policy === 'fail') {
      results.push({
        family: 'freshness',
        check: 'no_stale_sources',
        status: 'fail',
        detail: `${stale.length} source(s) older than ${maxAge ?? 'unset'} months. Pack policy: fail.`,
        evidence: stale,
        blocks_synthesis: true,
      });
    } else {
      results.push({
        family: 'freshness',
        check: 'no_stale_sources',
        status: 'warn',
        detail: `${stale.length} source(s) older than ${maxAge ?? 'unset'} months. Pack policy: warn.`,
        evidence: stale,
        blocks_synthesis: false,
      });
    }
  } else {
    results.push({
      family: 'freshness',
      check: 'no_stale_sources',
      status: 'pass',
      detail: maxAge === null
        ? `No max_source_age_months configured; per-source recency not evaluated.`
        : `No source older than ${maxAge} months.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  if (unknownDate.length > 0) {
    results.push({
      family: 'freshness',
      check: 'publication_date_known',
      status: 'warn',
      detail: `${unknownDate.length} source(s) have no parseable published_at. Recency cannot be evaluated for these.`,
      evidence: unknownDate,
      blocks_synthesis: false,
    });
  } else {
    results.push({
      family: 'freshness',
      check: 'publication_date_known',
      status: 'pass',
      detail: `All sources have a recorded published_at date.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  return results;
}
