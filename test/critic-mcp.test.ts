// Phase 1b-b (v0.8.0): MCP critic adapter tests.
//
// We mock the MCP client/transport and verify:
//   - the request body uses ollama_extract (NOT ollama_classify)
//   - the locked critic prompt is rendered into the `text` parameter
//   - the schema enforces the four-label enum
//   - the model override threads through correctly
//   - response envelopes parse into {label, rationale}
//   - transport / parse / schema failures return ok:false with a useful message

import { describe, it, expect } from 'vitest';

import {
  buildCriticToolArgs,
  runCritic,
  type CriticCallToolClient,
} from '../src/claims/critic/mcp-critic.js';
import { CRITIC_LABELS } from '../src/claims/critic/prompt.js';

interface CapturedCall {
  name: string;
  arguments: Record<string, unknown>;
}

function fakeClient(opts: {
  capture: CapturedCall[];
  response: () => { content: Array<{ type: string; text: string }>; isError?: boolean };
}): CriticCallToolClient {
  return {
    async callTool(params) {
      opts.capture.push({ name: params.name, arguments: params.arguments });
      return opts.response();
    },
  };
}

function envelopeOk(label: string, rationale: string): {
  content: Array<{ type: string; text: string }>;
} {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          result: { ok: true, data: { label, rationale } },
          tier_used: 'workhorse',
          model: 'hermes3:8b',
          hardware_profile: 'test',
          tokens_in: 100,
          tokens_out: 30,
          elapsed_ms: 12,
        }),
      },
    ],
  };
}

describe('buildCriticToolArgs (request shape)', () => {
  it('targets ollama_extract — never ollama_classify (verified via callTool name in runCritic)', () => {
    // The tool-name contract is enforced inside runCritic. Here we sanity-check
    // that buildCriticToolArgs returns the shape extract expects (text/schema/hint).
    const args = buildCriticToolArgs({
      sectionPurpose: 'p',
      claimAsserts: 'c',
    });
    expect(args).toHaveProperty('text');
    expect(args).toHaveProperty('schema');
    expect(args).toHaveProperty('hint');
  });

  it('puts the rendered locked prompt into `text` (option β)', () => {
    const args = buildCriticToolArgs({
      sectionPurpose: 'gates and waivers — what blocks synthesis',
      claimAsserts: 'patch publish before next repo',
      sourceTitle: 'A Title',
      sourcePublisher: 'A Pub',
      sourceType: 'docs',
    });
    expect(typeof args.text).toBe('string');
    const text = args.text as string;
    expect(text).toContain('Section purpose:\ngates and waivers');
    expect(text).toContain('Claim:\npatch publish before next repo');
    expect(text).toContain('Source title: A Title');
    expect(text).toContain('Publisher: A Pub');
    expect(text).toContain('Source type: docs');
    expect(text).toContain('Return one label:');
    expect(text).toContain('- supports_section');
    expect(text).toContain('- off_topic');
    expect(text).toContain('- background_only');
    expect(text).toContain('- source_chrome');
    expect(text).toContain(
      'Do not mark a claim supports_section merely because it contains words related to research',
    );
  });

  it('schema has the four-label enum', () => {
    const args = buildCriticToolArgs({ sectionPurpose: 'p', claimAsserts: 'c' });
    const schema = args.schema as {
      type: string;
      properties: { label: { enum: string[] }; rationale: { type: string } };
      required: string[];
    };
    expect(schema.type).toBe('object');
    expect(schema.properties.label.enum).toEqual([...CRITIC_LABELS]);
    expect(schema.properties.rationale.type).toBe('string');
    expect(schema.required).toEqual(['label', 'rationale']);
  });

  it('threads effectiveModel into `model` when supplied', () => {
    const args = buildCriticToolArgs({
      sectionPurpose: 'p',
      claimAsserts: 'c',
      effectiveModel: 'qwen3:14b',
    });
    expect(args.model).toBe('qwen3:14b');
  });

  it('omits `model` when effectiveModel is empty / undefined', () => {
    expect(
      buildCriticToolArgs({ sectionPurpose: 'p', claimAsserts: 'c' }),
    ).not.toHaveProperty('model');
    expect(
      buildCriticToolArgs({ sectionPurpose: 'p', claimAsserts: 'c', effectiveModel: '' }),
    ).not.toHaveProperty('model');
    expect(
      buildCriticToolArgs({ sectionPurpose: 'p', claimAsserts: 'c', effectiveModel: '   ' }),
    ).not.toHaveProperty('model');
  });
});

describe('runCritic — happy path', () => {
  it('calls ollama_extract (NOT ollama_classify) and parses supports_section', async () => {
    const capture: CapturedCall[] = [];
    const client = fakeClient({
      capture,
      response: () => envelopeOk('supports_section', 'directly answers the section purpose'),
    });
    const out = await runCritic(client, {
      sectionPurpose: 'p',
      claimAsserts: 'c',
    });
    expect(capture).toHaveLength(1);
    expect(capture[0]?.name).toBe('ollama_extract');
    expect(capture[0]?.name).not.toBe('ollama_classify');
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.label).toBe('supports_section');
      expect(out.rationale).toBe('directly answers the section purpose');
    }
  });

  it('parses off_topic / background_only / source_chrome labels', async () => {
    for (const label of ['off_topic', 'background_only', 'source_chrome'] as const) {
      const client = fakeClient({
        capture: [],
        response: () => envelopeOk(label, `rationale for ${label}`),
      });
      const out = await runCritic(client, { sectionPurpose: 'p', claimAsserts: 'c' });
      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(out.label).toBe(label);
        expect(out.rationale).toBe(`rationale for ${label}`);
      }
    }
  });
});

describe('runCritic — failure modes', () => {
  it('returns ok:false when MCP response is isError:true', async () => {
    const client = fakeClient({
      capture: [],
      response: () => ({
        content: [{ type: 'text', text: 'boom' }],
        isError: true,
      }),
    });
    const out = await runCritic(client, { sectionPurpose: 'p', claimAsserts: 'c' });
    expect(out.ok).toBe(false);
  });

  it('returns ok:false when MCP response body is not JSON', async () => {
    const client = fakeClient({
      capture: [],
      response: () => ({ content: [{ type: 'text', text: 'not-json' }] }),
    });
    const out = await runCritic(client, { sectionPurpose: 'p', claimAsserts: 'c' });
    expect(out.ok).toBe(false);
  });

  it('returns ok:false when envelope.result.ok is false', async () => {
    const client = fakeClient({
      capture: [],
      response: () => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ result: { ok: false, error: 'unparseable' } }),
          },
        ],
      }),
    });
    const out = await runCritic(client, { sectionPurpose: 'p', claimAsserts: 'c' });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toContain('unparseable');
    }
  });

  it('returns ok:false when label is missing or not one of the four canonical values', async () => {
    const client = fakeClient({
      capture: [],
      response: () => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              result: {
                ok: true,
                data: { label: 'hallucinated_extra_label', rationale: 'r' },
              },
            }),
          },
        ],
      }),
    });
    const out = await runCritic(client, { sectionPurpose: 'p', claimAsserts: 'c' });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toContain('invalid label');
    }
  });

  it('returns ok:false when rationale is empty', async () => {
    const client = fakeClient({
      capture: [],
      response: () => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              result: { ok: true, data: { label: 'supports_section', rationale: '   ' } },
            }),
          },
        ],
      }),
    });
    const out = await runCritic(client, { sectionPurpose: 'p', claimAsserts: 'c' });
    expect(out.ok).toBe(false);
  });

  it('returns ok:false when callTool throws', async () => {
    const client: CriticCallToolClient = {
      async callTool() {
        throw new Error('transport boom');
      },
    };
    const out = await runCritic(client, { sectionPurpose: 'p', claimAsserts: 'c' });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toContain('transport boom');
    }
  });
});
