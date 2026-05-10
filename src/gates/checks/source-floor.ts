import type { GateCheckResult, GateInput } from '../types.js';

export function checkSourceFloor(input: GateInput): GateCheckResult[] {
  const cfg = input.research.gates.source_floor;
  const results: GateCheckResult[] = [];
  const cards = input.sources;
  const sectionCards = cards.filter((c) => c.section_id === input.section.id);

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

  // min_independent_publishers — pack-wide accumulation; section-scoped count shown for operator awareness
  const publishers = new Set(
    cards.map((c) => c.publisher).filter((p): p is string => typeof p === 'string'),
  );
  const sectionPublishers = new Set(
    sectionCards.map((c) => c.publisher).filter((p): p is string => typeof p === 'string'),
  );
  if (publishers.size < cfg.min_independent_publishers) {
    results.push({
      family: 'source_floor',
      check: 'min_independent_publishers',
      status: 'fail',
      detail: `Found ${publishers.size} independent publisher(s); minimum ${cfg.min_independent_publishers} required. (pack-wide=${publishers.size}, section-scoped=${sectionPublishers.size})`,
      evidence: [...publishers],
      blocks_synthesis: true,
    });
  } else {
    results.push({
      family: 'source_floor',
      check: 'min_independent_publishers',
      status: 'pass',
      detail: `${publishers.size} independent publisher(s) >= minimum ${cfg.min_independent_publishers}. (pack-wide=${publishers.size}, section-scoped=${sectionPublishers.size})`,
      evidence: [],
      blocks_synthesis: false,
    });
  }

  // primary_sources_required — pack-wide accumulation; section-scoped count shown for operator awareness
  const primaryCount = cards.filter((c) => c.source_type === 'primary').length;
  const sectionPrimaryCount = sectionCards.filter((c) => c.source_type === 'primary').length;
  if (primaryCount < cfg.primary_sources_required) {
    results.push({
      family: 'source_floor',
      check: 'primary_sources_required',
      status: 'fail',
      detail: `Found ${primaryCount} primary source(s); minimum ${cfg.primary_sources_required} required. Pre-waiver. (pack-wide=${primaryCount}, section-scoped=${sectionPrimaryCount})`,
      evidence: cards.filter((c) => c.source_type === 'primary').map((c) => c.source_id),
      blocks_synthesis: true,
    });
  } else {
    results.push({
      family: 'source_floor',
      check: 'primary_sources_required',
      status: 'pass',
      detail: `${primaryCount} primary source(s) >= minimum ${cfg.primary_sources_required}. (pack-wide=${primaryCount}, section-scoped=${sectionPrimaryCount})`,
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
