import { describe, it, expect } from 'vitest';
import { ResearchYamlSchema, DEFAULT_REVIEW_PROFILES } from '../src/intake/schema.js';
import { OllamaInternReviewer } from '../src/review/reviewers/ollama-intern.js';
import type { Claim } from '../src/claims/schema.js';
import type { ReviewerInput } from '../src/review/types.js';

// ---------------------------------------------------------------------------
// Helpers — shared fixture and fetch mock (mirrors reviewer-options.test.ts)
// ---------------------------------------------------------------------------

const TEST_HOST = 'http://test-preset:11434';
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
  created_at: '2026-05-10T00:00:00.000Z',
  topic: 'Preset extraction integration fixture',
  sections: [
    {
      id: '01-preset-test',
      purpose: 'probe',
      max_time_minutes: 45,
      min_sources: 2,
      primary_sources_required: 1,
      contradictions_required: false,
      status: 'draft',
    },
  ],
});

const claim: Claim = {
  claim_id: 'clm_preset_1',
  section_id: '01-preset-test',
  source_ids: ['src_preset'],
  source_hashes: ['a'.repeat(64)],
  asserts: 'test preset claim',
  scope: null,
  not: null,
  evidence_excerpt: 'literal',
  evidence_location: null,
  confidence: 'medium',
  extractor: 'ollama-intern',
  extraction_method: 'ollama_intern_propositional',
  created_at: '2026-05-10T00:00:00.000Z',
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
// 1. Schema parse — pre-v0.6 research.yaml (no reviewer_options) parses cleanly
// ---------------------------------------------------------------------------
describe('ReviewProfilePresetSchema — backward compat without reviewer_options', () => {
  it('parses a pre-v0.6 research.yaml with no reviewer_options on any profile', () => {
    const parsed = ResearchYamlSchema.parse({
      research_os_version: '0.1.0',
      created_at: '2026-05-10T00:00:00.000Z',
      topic: 'Backward compat test for pre-v0.6 packs',
      review_profiles: {
        'hermes-two-pass': {
          general_model: 'hermes3:8b',
          critic_model: 'hermes3:8b',
          review_window: 10,
          mode: 'two_pass',
          status: 'calibrated_baseline',
          notes: 'Old profile without reviewer_options',
        },
      },
    });
    expect(parsed.review_profiles['hermes-two-pass']).toBeDefined();
    expect(parsed.review_profiles['hermes-two-pass']!.reviewer_options).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Schema parse — reviewer_options: { temperature: 0, seed: 7 } accepted
// ---------------------------------------------------------------------------
describe('ReviewProfilePresetSchema — accepts reviewer_options', () => {
  it('parses a profile with reviewer_options: { temperature: 0, seed: 7 }', () => {
    const parsed = ResearchYamlSchema.parse({
      research_os_version: '0.1.0',
      created_at: '2026-05-10T00:00:00.000Z',
      topic: 'Reviewer options schema parse test for new profiles',
      review_profiles: {
        'hermes-two-pass-deterministic': {
          general_model: 'hermes3:8b',
          critic_model: 'hermes3:8b',
          review_window: 30,
          mode: 'two_pass',
          status: 'experimental',
          notes: 'Deterministic test',
          reviewer_options: { temperature: 0, seed: 7 },
        },
      },
    });
    const preset = parsed.review_profiles['hermes-two-pass-deterministic']!;
    expect(preset.reviewer_options?.temperature).toBe(0);
    expect(preset.reviewer_options?.seed).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// 3. Schema parse — temperature: 0 is NOT dropped as falsy (LOAD-BEARING)
// ---------------------------------------------------------------------------
describe('ReviewProfilePresetSchema — temperature: 0 not dropped as falsy', () => {
  it('preserves temperature: 0 after schema parse (must not be treated as falsy)', () => {
    const parsed = ResearchYamlSchema.parse({
      research_os_version: '0.1.0',
      created_at: '2026-05-10T00:00:00.000Z',
      topic: 'Temperature zero preservation test for deterministic profiles',
      review_profiles: {
        'deterministic-test': {
          general_model: 'hermes3:8b',
          mode: 'general',
          reviewer_options: { temperature: 0 },
        },
      },
    });
    const opts = parsed.review_profiles['deterministic-test']!.reviewer_options;
    expect(opts).toBeDefined();
    expect(opts!.temperature).toBe(0);
    // Explicit !== undefined check — the load-bearing invariant from OllamaInternReviewer
    expect(opts!.temperature !== undefined).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. LOAD-BEARING: temperature: 0 and seed: 7 reach Ollama /api/chat body
//    when reviewer_options is extracted from hermes-two-pass-deterministic profile
// ---------------------------------------------------------------------------
describe('Preset extraction — hermes-two-pass-deterministic reviewer_options reach Ollama (LOAD-BEARING)', () => {
  it('sends temperature: 0 and seed: 7 when reviewer_options extracted from seeded profile', async () => {
    // Simulate what the CLI preset loader does:
    //   1. parse research.yaml → find profile → extract reviewer_options
    //   2. pass reviewer_options to OllamaInternReviewer constructor
    const researchWithDeterministicProfile = ResearchYamlSchema.parse({
      research_os_version: '0.1.0',
      created_at: '2026-05-10T00:00:00.000Z',
      topic: 'Load bearing test for deterministic reviewer options flow',
      sections: [
        {
          id: '01-preset-test',
          purpose: 'probe',
          max_time_minutes: 45,
          min_sources: 2,
          primary_sources_required: 1,
          contradictions_required: false,
          status: 'draft',
        },
      ],
      review_profiles: {
        'hermes-two-pass-deterministic': {
          general_model: 'hermes3:8b',
          critic_model: 'hermes3:8b',
          review_window: 30,
          mode: 'two_pass',
          status: 'experimental',
          reviewer_options: { temperature: 0, seed: 7 },
        },
      },
    });

    // CLI extraction step (mirrors src/cli.ts preset loader)
    const preset = researchWithDeterministicProfile.review_profiles['hermes-two-pass-deterministic']!;
    const reviewerOptions = preset.reviewer_options ?? undefined;

    let capturedOptions: Record<string, unknown> | undefined;

    // Construct OllamaInternReviewer exactly as the CLI does (general pass)
    const r = new OllamaInternReviewer({
      host: TEST_HOST,
      model: TEST_MODEL,
      claimsPerWindow: preset.review_window ?? undefined,
      reviewer_options: reviewerOptions,
      fetchImpl: makeCapturingFetch((body) => {
        capturedOptions = body.options as Record<string, unknown>;
        return makeEmptyFindingsResponse();
      }),
    });

    await r.review(baseInput);

    expect(capturedOptions).toBeDefined();
    // temperature: 0 must reach Ollama — NOT dropped as falsy
    expect(capturedOptions).toHaveProperty('temperature', 0);
    expect(capturedOptions).toHaveProperty('seed', 7);
    expect(capturedOptions).toHaveProperty('num_ctx', 8192);
  });
});

// ---------------------------------------------------------------------------
// 5. Preset extraction — omitting reviewer_options preserves { num_ctx: 8192 } only
// ---------------------------------------------------------------------------
describe('Preset extraction — omitting reviewer_options preserves current behavior', () => {
  it('sends only num_ctx: 8192 in options when profile has no reviewer_options', async () => {
    const researchWithPlainProfile = ResearchYamlSchema.parse({
      research_os_version: '0.1.0',
      created_at: '2026-05-10T00:00:00.000Z',
      topic: 'Plain profile test for reviewer options fallback behavior',
      sections: [
        {
          id: '01-preset-test',
          purpose: 'probe',
          max_time_minutes: 45,
          min_sources: 2,
          primary_sources_required: 1,
          contradictions_required: false,
          status: 'draft',
        },
      ],
      review_profiles: {
        'plain-profile': {
          general_model: 'hermes3:8b',
          mode: 'general',
          // no reviewer_options
        },
      },
    });

    const preset = researchWithPlainProfile.review_profiles['plain-profile']!;
    const reviewerOptions = preset.reviewer_options ?? undefined;

    let capturedOptions: Record<string, unknown> | undefined;

    const r = new OllamaInternReviewer({
      host: TEST_HOST,
      model: TEST_MODEL,
      reviewer_options: reviewerOptions,
      fetchImpl: makeCapturingFetch((body) => {
        capturedOptions = body.options as Record<string, unknown>;
        return makeEmptyFindingsResponse();
      }),
    });

    await r.review(baseInput);

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions).toHaveProperty('num_ctx', 8192);
    expect(capturedOptions).not.toHaveProperty('temperature');
    expect(capturedOptions).not.toHaveProperty('seed');
  });
});

// ---------------------------------------------------------------------------
// 6. DEFAULT_REVIEW_PROFILES contains both hermes-two-pass and hermes-two-pass-deterministic
// ---------------------------------------------------------------------------
describe('DEFAULT_REVIEW_PROFILES — seeded profiles present', () => {
  it('contains hermes-two-pass (existing, calibrated_baseline)', () => {
    expect(DEFAULT_REVIEW_PROFILES['hermes-two-pass']).toBeDefined();
    expect(DEFAULT_REVIEW_PROFILES['hermes-two-pass']!.status).toBe('calibrated_baseline');
    expect(DEFAULT_REVIEW_PROFILES['hermes-two-pass']!.reviewer_options).toBeUndefined();
  });

  it('contains hermes-two-pass-deterministic (NEW, experimental, temperature=0 seed=7)', () => {
    const det = DEFAULT_REVIEW_PROFILES['hermes-two-pass-deterministic'];
    expect(det).toBeDefined();
    expect(det!.status).toBe('experimental');
    expect(det!.reviewer_options?.temperature).toBe(0);
    expect(det!.reviewer_options?.seed).toBe(7);
    expect(det!.mode).toBe('two_pass');
    expect(det!.general_model).toBe('hermes3:8b');
  });

  it('hermes-two-pass is UNCHANGED by the addition of hermes-two-pass-deterministic', () => {
    const original = DEFAULT_REVIEW_PROFILES['hermes-two-pass']!;
    expect(original.review_window).toBe(10);
    expect(original.mode).toBe('two_pass');
    expect(original.status).toBe('calibrated_baseline');
  });
});
