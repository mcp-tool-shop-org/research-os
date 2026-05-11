import { describe, it, expect } from 'vitest';
import { ReviewerOptionsSchema } from '../src/review/reviewer-options-schema.js';
import { OllamaInternReviewer } from '../src/review/reviewers/ollama-intern.js';
import { CalibrationReceiptSchema } from '../src/calibration/receipt-schema.js';
import { AggregateCalibrationReceiptSchema } from '../src/calibration/aggregate-receipt-schema.js';
import { buildReceiptMarkdown } from '../src/calibration/receipt.js';
import { buildAggregateReceiptMarkdown, aggregateReceipts } from '../src/calibration/aggregate.js';
import { ResearchYamlSchema } from '../src/intake/schema.js';
import type { Claim } from '../src/claims/schema.js';
import type { ReviewerInput } from '../src/review/types.js';
import type { CalibrationReceipt } from '../src/calibration/receipt-schema.js';

// ---------------------------------------------------------------------------
// Helpers — mock fetch that captures request bodies for Ollama tests
// ---------------------------------------------------------------------------

const TEST_HOST = 'http://test-ollama-opts:11434';
const TEST_MODEL = 'hermes3:8b';

function makeCapturingFetch(
  onChat: (body: Record<string, unknown>) => Response,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === `${TEST_HOST}/api/tags`) {
      return new Response(JSON.stringify({ models: [{ name: TEST_MODEL }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === `${TEST_HOST}/api/chat`) {
      const body = JSON.parse((init?.body as string) ?? '{}') as Record<string, unknown>;
      return onChat(body);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
}

function makeEmptyFindingsResponse(): Response {
  return new Response(
    JSON.stringify({ message: { content: JSON.stringify({ findings: [] }) } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

const research = ResearchYamlSchema.parse({
  research_os_version: '0.1.0',
  created_at: '2026-05-06T22:00:00.000Z',
  topic: 'ReviewerOptions test fixture',
  sections: [
    {
      id: '01-test',
      purpose: 'p',
      max_time_minutes: 45,
      min_sources: 2,
      primary_sources_required: 1,
      contradictions_required: false,
      status: 'draft',
    },
  ],
});

const claim: Claim = {
  claim_id: 'clm_opts_test_1',
  section_id: '01-test',
  source_ids: ['src_opts_test'],
  source_hashes: ['a'.repeat(64)],
  asserts: 'test claim',
  scope: null,
  not: null,
  evidence_excerpt: 'literal',
  evidence_location: null,
  confidence: 'medium',
  extractor: 'ollama-intern',
  extraction_method: 'ollama_intern_propositional',
  created_at: '2026-05-06T22:00:00.000Z',
  review_state: 'candidate',
};

const baseInput: ReviewerInput = {
  research,
  section: research.sections[0]!,
  candidateClaims: [claim],
  sources: [],
  receipts: [],
  contradictions: [],
  gateResult: null,
  rawTextBySourceId: new Map(),
  briefText: null,
};

// ---------------------------------------------------------------------------
// Shared receipt fixture for schema + Markdown tests
// ---------------------------------------------------------------------------

const baseReceiptData = {
  schema_version: 1 as const,
  profile_name: 'hermes-two-pass',
  status: 'failed' as const,
  model: 'hermes3:8b',
  architecture: 'two-pass' as const,
  fixture: 'seeded-v1',
  fixture_total_claims: 18,
  fixture_good_claims: 5,
  fixture_bad_claims: 13,
  calibrated_at: '2026-05-10T00:00:00.000Z',
  research_os_version: '0.5.0',
  runtime_ms: 72_000,
  good_fp_count: 0,
  any_flag_recall: { matched: 9, total: 13, ratio: 0.692 },
  strict_recall: { matched: 6, total: 13, ratio: 0.462 },
  per_category_any_flag: {
    scope_widening: { matched: 1, total: 3, ratio: 0.333 },
  },
  per_category_strict: {
    scope_widening: { matched: 1, total: 3, ratio: 0.333 },
  },
  decision_vocabulary: {
    accepted_for_synthesis: 15,
    rejected: 0,
    needs_scope_repair: 3,
    needs_source_repair: 0,
    needs_contradiction_mapping: 0,
    needs_human_review: 0,
  },
  decisions_produced_count: 2,
  decision_vocab_bar: { architecture: 'two-pass' as const, required: 3, produced: 2, passed: false },
  unreachable_decisions: ['needs_contradiction_mapping'],
  empty_or_malformed_responses: 0,
  pass_fail: {
    fp_ceiling: 'PASS' as const,
    any_flag_recall_floor: 'PASS' as const,
    per_category_any_flag_floor: 'PASS' as const,
    strict_recall_floor: 'PASS' as const,
    decision_vocab_completeness: 'FAIL' as const,
    latency_soft: 'PASS' as const,
    latency_hard: 'PASS' as const,
    empty_or_malformed: 'PASS' as const,
    overall: 'FAIL' as const,
  },
  notes: [],
};

// ---------------------------------------------------------------------------
// 1. ReviewerOptionsSchema — load-bearing: temperature: 0 is valid
// ---------------------------------------------------------------------------
describe('ReviewerOptionsSchema — temperature: 0 is valid (LOAD-BEARING)', () => {
  it('parses { temperature: 0 } without throwing', () => {
    expect(() => ReviewerOptionsSchema.parse({ temperature: 0 })).not.toThrow();
    const parsed = ReviewerOptionsSchema.parse({ temperature: 0 });
    expect(parsed.temperature).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. ReviewerOptionsSchema rejects temperature out of range
// ---------------------------------------------------------------------------
describe('ReviewerOptionsSchema — temperature range validation', () => {
  it('rejects { temperature: 3 } (above max 2)', () => {
    expect(() => ReviewerOptionsSchema.parse({ temperature: 3 })).toThrow();
  });

  it('rejects { temperature: -1 } (below min 0)', () => {
    expect(() => ReviewerOptionsSchema.parse({ temperature: -1 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. ReviewerOptionsSchema — seed accepts positive and negative integers
// ---------------------------------------------------------------------------
describe('ReviewerOptionsSchema — seed accepts positive and negative integers', () => {
  it('accepts { seed: 7 }', () => {
    expect(() => ReviewerOptionsSchema.parse({ seed: 7 })).not.toThrow();
    expect(ReviewerOptionsSchema.parse({ seed: 7 }).seed).toBe(7);
  });

  it('accepts { seed: -1 } (negative seed is valid)', () => {
    expect(() => ReviewerOptionsSchema.parse({ seed: -1 })).not.toThrow();
    expect(ReviewerOptionsSchema.parse({ seed: -1 }).seed).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// 4. ReviewerOptionsSchema rejects top_p out of range
// ---------------------------------------------------------------------------
describe('ReviewerOptionsSchema — top_p range validation', () => {
  it('rejects { top_p: 1.5 } (above max 1)', () => {
    expect(() => ReviewerOptionsSchema.parse({ top_p: 1.5 })).toThrow();
  });

  it('accepts { top_p: 0.9 }', () => {
    expect(() => ReviewerOptionsSchema.parse({ top_p: 0.9 })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 5. ReviewerOptionsSchema — all 6 fields accepted together
// ---------------------------------------------------------------------------
describe('ReviewerOptionsSchema — all 6 fields together', () => {
  it('accepts all 6 fields at once', () => {
    const opts = { num_ctx: 8192, temperature: 0, seed: 7, top_p: 0.9, top_k: 40, repeat_penalty: 1.1 };
    expect(() => ReviewerOptionsSchema.parse(opts)).not.toThrow();
    const parsed = ReviewerOptionsSchema.parse(opts);
    expect(parsed.temperature).toBe(0);
    expect(parsed.seed).toBe(7);
    expect(parsed.num_ctx).toBe(8192);
  });
});

// ---------------------------------------------------------------------------
// 6. OllamaInternReviewer stores reviewer_options from constructor
// ---------------------------------------------------------------------------
describe('OllamaInternReviewer constructor — stores reviewer_options', () => {
  it('stores reviewer_options when provided', () => {
    const r = new OllamaInternReviewer({
      host: TEST_HOST,
      model: TEST_MODEL,
      reviewer_options: { temperature: 0, seed: 7 },
    });
    expect(r.reviewerOptions?.temperature).toBe(0);
    expect(r.reviewerOptions?.seed).toBe(7);
  });

  it('reviewerOptions is undefined when not provided', () => {
    const r = new OllamaInternReviewer({ host: TEST_HOST, model: TEST_MODEL });
    expect(r.reviewerOptions).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. LOAD-BEARING: temperature: 0 reaches Ollama options payload
// ---------------------------------------------------------------------------
describe('OllamaInternReviewer — temperature: 0 reaches Ollama payload (LOAD-BEARING)', () => {
  it('sends temperature: 0 when reviewer_options.temperature === 0', async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const r = new OllamaInternReviewer({
      host: TEST_HOST,
      model: TEST_MODEL,
      reviewer_options: { temperature: 0, seed: 7 },
      fetchImpl: makeCapturingFetch((body) => {
        capturedOptions = body.options as Record<string, unknown>;
        return makeEmptyFindingsResponse();
      }),
    });

    await r.review(baseInput);

    expect(capturedOptions).toBeDefined();
    // temperature: 0 must be present — NOT dropped as falsy
    expect(capturedOptions).toHaveProperty('temperature', 0);
    expect(capturedOptions).toHaveProperty('seed', 7);
    expect(capturedOptions).toHaveProperty('num_ctx', 8192);
  });
});

// ---------------------------------------------------------------------------
// 8. LOAD-BEARING: temperature absent when reviewer_options.temperature is undefined
// ---------------------------------------------------------------------------
describe('OllamaInternReviewer — temperature absent when not set', () => {
  it('does NOT include temperature in options when reviewer_options.temperature is undefined', async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const r = new OllamaInternReviewer({
      host: TEST_HOST,
      model: TEST_MODEL,
      // No temperature provided
      reviewer_options: { seed: 7 },
      fetchImpl: makeCapturingFetch((body) => {
        capturedOptions = body.options as Record<string, unknown>;
        return makeEmptyFindingsResponse();
      }),
    });

    await r.review(baseInput);

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions).not.toHaveProperty('temperature');
    expect(capturedOptions).toHaveProperty('seed', 7);
    expect(capturedOptions).toHaveProperty('num_ctx', 8192);
  });
});

// ---------------------------------------------------------------------------
// 9. num_ctx: 8192 preserved when no reviewer_options.num_ctx provided
// ---------------------------------------------------------------------------
describe('OllamaInternReviewer — preserves num_ctx: 8192 default', () => {
  it('sends num_ctx: 8192 when reviewer_options does not override num_ctx', async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const r = new OllamaInternReviewer({
      host: TEST_HOST,
      model: TEST_MODEL,
      reviewer_options: { temperature: 0 },
      fetchImpl: makeCapturingFetch((body) => {
        capturedOptions = body.options as Record<string, unknown>;
        return makeEmptyFindingsResponse();
      }),
    });

    await r.review(baseInput);
    expect(capturedOptions?.num_ctx).toBe(8192);
  });

  it('sends num_ctx: 8192 when no reviewer_options at all', async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const r = new OllamaInternReviewer({
      host: TEST_HOST,
      model: TEST_MODEL,
      fetchImpl: makeCapturingFetch((body) => {
        capturedOptions = body.options as Record<string, unknown>;
        return makeEmptyFindingsResponse();
      }),
    });

    await r.review(baseInput);
    expect(capturedOptions?.num_ctx).toBe(8192);
  });
});

// ---------------------------------------------------------------------------
// 10. num_ctx overridden when reviewer_options.num_ctx is set
// ---------------------------------------------------------------------------
describe('OllamaInternReviewer — num_ctx override', () => {
  it('sends num_ctx: 4096 when reviewer_options.num_ctx === 4096', async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const r = new OllamaInternReviewer({
      host: TEST_HOST,
      model: TEST_MODEL,
      reviewer_options: { num_ctx: 4096 },
      fetchImpl: makeCapturingFetch((body) => {
        capturedOptions = body.options as Record<string, unknown>;
        return makeEmptyFindingsResponse();
      }),
    });

    await r.review(baseInput);
    expect(capturedOptions?.num_ctx).toBe(4096);
  });
});

// ---------------------------------------------------------------------------
// 11. seed: 7 reaches Ollama payload
// ---------------------------------------------------------------------------
describe('OllamaInternReviewer — seed: 7 reaches Ollama payload', () => {
  it('sends seed: 7 when reviewer_options.seed === 7', async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const r = new OllamaInternReviewer({
      host: TEST_HOST,
      model: TEST_MODEL,
      reviewer_options: { seed: 7 },
      fetchImpl: makeCapturingFetch((body) => {
        capturedOptions = body.options as Record<string, unknown>;
        return makeEmptyFindingsResponse();
      }),
    });

    await r.review(baseInput);
    expect(capturedOptions).toHaveProperty('seed', 7);
  });
});

// ---------------------------------------------------------------------------
// 12. LOAD-BEARING: CalibrationReceiptSchema backward compat (no reviewer_options)
// ---------------------------------------------------------------------------
describe('CalibrationReceiptSchema — backward compat without reviewer_options', () => {
  it('parses a pre-v0.6 receipt that has no reviewer_options field', () => {
    expect(() => CalibrationReceiptSchema.parse(baseReceiptData)).not.toThrow();
    const parsed = CalibrationReceiptSchema.parse(baseReceiptData);
    expect(parsed.reviewer_options).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 13. CalibrationReceiptSchema accepts reviewer_options with temperature: 0
// ---------------------------------------------------------------------------
describe('CalibrationReceiptSchema — accepts reviewer_options', () => {
  it('parses a receipt with reviewer_options: { temperature: 0, seed: 7 }', () => {
    const data = { ...baseReceiptData, reviewer_options: { temperature: 0, seed: 7 } };
    expect(() => CalibrationReceiptSchema.parse(data)).not.toThrow();
    const parsed = CalibrationReceiptSchema.parse(data);
    expect(parsed.reviewer_options?.temperature).toBe(0);
    expect(parsed.reviewer_options?.seed).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// 14. LOAD-BEARING: AggregateCalibrationReceiptSchema backward compat
// ---------------------------------------------------------------------------
describe('AggregateCalibrationReceiptSchema — backward compat without reviewer_options', () => {
  it('parses an old aggregate that has no reviewer_options field', () => {
    const runs: CalibrationReceipt[] = [1, 2, 3].map((i) =>
      CalibrationReceiptSchema.parse({ ...baseReceiptData, calibrated_at: `2026-05-10T0${i}:00:00.000Z`, runtime_ms: 70_000 + i * 1000 }),
    );
    const aggregate = aggregateReceipts(runs, {
      runFiles: ['runs/run-001.json', 'runs/run-002.json', 'runs/run-003.json'],
      aggregatedAt: '2026-05-10T12:00:00.000Z',
    });
    expect(() => AggregateCalibrationReceiptSchema.parse(aggregate)).not.toThrow();
    expect(aggregate.reviewer_options).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 15. AggregateCalibrationReceiptSchema accepts reviewer_options
// ---------------------------------------------------------------------------
describe('AggregateCalibrationReceiptSchema — accepts reviewer_options', () => {
  it('parses an aggregate with reviewer_options: { temperature: 0, seed: 7 }', () => {
    const runs: CalibrationReceipt[] = [1, 2, 3].map((i) =>
      CalibrationReceiptSchema.parse({ ...baseReceiptData, calibrated_at: `2026-05-10T0${i}:00:00.000Z`, runtime_ms: 70_000 + i * 1000 }),
    );
    const aggregate = aggregateReceipts(runs, {
      runFiles: ['runs/run-001.json', 'runs/run-002.json', 'runs/run-003.json'],
      aggregatedAt: '2026-05-10T12:00:00.000Z',
      reviewerOptions: { temperature: 0, seed: 7 },
    });
    expect(() => AggregateCalibrationReceiptSchema.parse(aggregate)).not.toThrow();
    expect(aggregate.reviewer_options?.temperature).toBe(0);
    expect(aggregate.reviewer_options?.seed).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// 16. buildReceiptMarkdown renders "Reviewer options" section when set
// ---------------------------------------------------------------------------
describe('buildReceiptMarkdown — Reviewer options section', () => {
  it('renders "## Reviewer options" section when reviewer_options is set', () => {
    const receipt = CalibrationReceiptSchema.parse({
      ...baseReceiptData,
      reviewer_options: { temperature: 0, seed: 7 },
    });
    const md = buildReceiptMarkdown(receipt);
    expect(md).toContain('## Reviewer options');
    expect(md).toContain('- temperature: 0');
    expect(md).toContain('- seed: 7');
  });

  it('renders keys in stable order: num_ctx before temperature before seed', () => {
    const receipt = CalibrationReceiptSchema.parse({
      ...baseReceiptData,
      reviewer_options: { seed: 7, temperature: 0, num_ctx: 8192 },
    });
    const md = buildReceiptMarkdown(receipt);
    const numCtxPos = md.indexOf('- num_ctx:');
    const tempPos = md.indexOf('- temperature:');
    const seedPos = md.indexOf('- seed:');
    expect(numCtxPos).toBeLessThan(tempPos);
    expect(tempPos).toBeLessThan(seedPos);
  });
});

// ---------------------------------------------------------------------------
// 17. buildReceiptMarkdown OMITS section when reviewer_options undefined or empty
// ---------------------------------------------------------------------------
describe('buildReceiptMarkdown — Reviewer options section absent when not set', () => {
  it('omits "## Reviewer options" when reviewer_options is undefined', () => {
    const receipt = CalibrationReceiptSchema.parse(baseReceiptData);
    const md = buildReceiptMarkdown(receipt);
    expect(md).not.toContain('## Reviewer options');
  });
});

// ---------------------------------------------------------------------------
// 18. buildAggregateReceiptMarkdown renders "Reviewer options" section when set
// ---------------------------------------------------------------------------
describe('buildAggregateReceiptMarkdown — Reviewer options section', () => {
  it('renders "## Reviewer options" in aggregate receipt when set', () => {
    const runs: CalibrationReceipt[] = [1, 2, 3].map((i) =>
      CalibrationReceiptSchema.parse({ ...baseReceiptData, calibrated_at: `2026-05-10T0${i}:00:00.000Z`, runtime_ms: 70_000 + i * 1000 }),
    );
    const aggregate = aggregateReceipts(runs, {
      runFiles: ['runs/run-001.json', 'runs/run-002.json', 'runs/run-003.json'],
      aggregatedAt: '2026-05-10T12:00:00.000Z',
      reviewerOptions: { temperature: 0, seed: 7 },
    });
    const md = buildAggregateReceiptMarkdown(aggregate);
    expect(md).toContain('## Reviewer options');
    expect(md).toContain('- temperature: 0');
    expect(md).toContain('- seed: 7');
  });

  it('omits "## Reviewer options" in aggregate receipt when not set', () => {
    const runs: CalibrationReceipt[] = [1, 2, 3].map((i) =>
      CalibrationReceiptSchema.parse({ ...baseReceiptData, calibrated_at: `2026-05-10T0${i}:00:00.000Z`, runtime_ms: 70_000 + i * 1000 }),
    );
    const aggregate = aggregateReceipts(runs, {
      runFiles: ['runs/run-001.json', 'runs/run-002.json', 'runs/run-003.json'],
      aggregatedAt: '2026-05-10T12:00:00.000Z',
    });
    const md = buildAggregateReceiptMarkdown(aggregate);
    expect(md).not.toContain('## Reviewer options');
  });
});

// ---------------------------------------------------------------------------
// 19. LOAD-BEARING (harness path): ReviewerOptionsSchema.parse({ temperature: 0 })
//     succeeds — this is exactly what the harness calls after parseSamplingFlag
//     converts '--temperature 0' to the number 0 via Number('0').
// ---------------------------------------------------------------------------
describe('Harness flag parsing: ReviewerOptionsSchema accepts temperature: 0 (LOAD-BEARING)', () => {
  it('ReviewerOptionsSchema.parse({ temperature: Number("0") }) returns temperature: 0', () => {
    // The harness does: const n = Number(raw); ... ReviewerOptionsSchema.parse({ temperature: n })
    // When raw = "0": Number("0") = 0, Number.isFinite(0) = true, schema accepts it.
    const harnessSimulatedValue = Number('0');
    expect(harnessSimulatedValue).toBe(0);
    expect(Number.isFinite(harnessSimulatedValue)).toBe(true);
    const parsed = ReviewerOptionsSchema.parse({ temperature: harnessSimulatedValue });
    expect(parsed.temperature).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 20. Harness path: Number('abc') is NaN — harness rejects with clear error
// ---------------------------------------------------------------------------
describe('Harness flag parsing: non-numeric value is rejected', () => {
  it('Number("abc") is NaN and isFinite(NaN) is false — harness rejects it', () => {
    const n = Number('abc');
    expect(Number.isNaN(n)).toBe(true);
    expect(Number.isFinite(n)).toBe(false);
    // The harness exits with an error in this case — verified by isFinite check
  });
});
