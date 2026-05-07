import type { GateCheckResult, GateInput } from '../types.js';

export function checkSourceFloor(input: GateInput): GateCheckResult[] {
  const cfg = input.research.gates.source_floor;
  const results: GateCheckResult[] = [];
  const cards = input.sources;

  // min_sources
  const sourceCount = cards.length;
  if (sourceCount < cfg.min_sources) {
    results.push({
      family: 'source_floor',
      check: 'min_sources',
      status: 'fail',
      detail: `Found ${sourceCount} source card(s); minimum ${cfg.min_sources} required.`,
      evidence: cards.map((c) => c.source_id),
      blocks_synthesis: true,
    });
  } else {
    results.push({
      family: 'source_floor',
      check: 'min_sources',
      status: 'pass',
      detail: `${sourceCount} source card(s) >= minimum ${cfg.min_sources}.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  // min_independent_publishers
  const publishers = new Set(
    cards.map((c) => c.publisher).filter((p): p is string => typeof p === 'string'),
  );
  if (publishers.size < cfg.min_independent_publishers) {
    results.push({
      family: 'source_floor',
      check: 'min_independent_publishers',
      status: 'fail',
      detail: `Found ${publishers.size} independent publisher(s); minimum ${cfg.min_independent_publishers} required.`,
      evidence: [...publishers],
      blocks_synthesis: true,
    });
  } else {
    results.push({
      family: 'source_floor',
      check: 'min_independent_publishers',
      status: 'pass',
      detail: `${publishers.size} independent publisher(s) >= minimum ${cfg.min_independent_publishers}.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  // primary_sources_required
  const primaryCount = cards.filter((c) => c.source_type === 'primary').length;
  if (primaryCount < cfg.primary_sources_required) {
    results.push({
      family: 'source_floor',
      check: 'primary_sources_required',
      status: 'fail',
      detail: `Found ${primaryCount} primary source(s); minimum ${cfg.primary_sources_required} required. Pre-waiver.`,
      evidence: cards.filter((c) => c.source_type === 'primary').map((c) => c.source_id),
      blocks_synthesis: true,
    });
  } else {
    results.push({
      family: 'source_floor',
      check: 'primary_sources_required',
      status: 'pass',
      detail: `${primaryCount} primary source(s) >= minimum ${cfg.primary_sources_required}.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  // failed-fetches visibility (warn-only; not fatal unless source floor fails)
  const failed = input.receipts.filter((r) => r.fetch_outcome !== 'ok').length;
  if (failed > 0) {
    results.push({
      family: 'source_floor',
      check: 'failed_fetches_visible',
      status: 'warn',
      detail: `${failed} fetch attempt(s) recorded as non-ok in fetch-log.jsonl.`,
      evidence: [],
      blocks_synthesis: false,
    });
  } else {
    results.push({
      family: 'source_floor',
      check: 'failed_fetches_visible',
      status: 'pass',
      detail: `No failed fetches in fetch-log.jsonl.`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  return results;
}
