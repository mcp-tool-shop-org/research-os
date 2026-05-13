// Test class 2: Drafter unit tests.
// Verifies: given a claim cluster, produces non-empty paragraph; rejects empty cluster.

import { describe, it, expect } from 'vitest';
import { runDrafter, buildDrafterToolArgs } from '../src/synth/prose/drafter.js';
import type { AcceptedClaimInput, ProseCallToolClient, SourceCardMeta } from '../src/synth/prose/types.js';

const CLAIM: AcceptedClaimInput = {
  claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
  asserts: 'Local-first tools maintain data integrity across network partitions',
  scope: 'distributed systems with intermittent connectivity',
  not: 'cloud-first SaaS architectures',
  source_ids: ['src_bbbbbbbbbbbb'],
  confidence: 'medium',
};

const SOURCE: SourceCardMeta = {
  source_id: 'src_bbbbbbbbbbbb',
  title: 'Local-First Software',
  publisher: 'Ink & Switch',
  source_type: 'secondary',
  url: 'https://example.com/local-first',
};

function envelopeOk(paragraph: string): string {
  return JSON.stringify({ result: { ok: true, data: { paragraph } } });
}

function envelopeError(msg: string): string {
  return JSON.stringify({ result: { ok: false, error: msg } });
}

function makeClient(text: string, capture: string[] = []): ProseCallToolClient {
  return {
    async callTool(params) {
      capture.push(params.name);
      return { content: [{ type: 'text', text }] };
    },
  };
}

describe('buildDrafterToolArgs', () => {
  it('includes section purpose in the text', () => {
    const args = buildDrafterToolArgs('purpose text', 'answer', [CLAIM], [SOURCE]);
    expect(args.text as string).toContain('purpose text');
  });

  it('includes all claim IDs in the text', () => {
    const args = buildDrafterToolArgs('purpose', 'evidence', [CLAIM], [SOURCE]);
    expect(args.text as string).toContain(CLAIM.claim_id);
  });

  it('includes source metadata (not raw excerpt)', () => {
    const args = buildDrafterToolArgs('purpose', 'evidence', [CLAIM], [SOURCE]);
    const text = args.text as string;
    expect(text).toContain(SOURCE.source_id);
    expect(text).toContain(SOURCE.title!);
    expect(text).toContain(SOURCE.publisher!);
    // Verify there is no "raw text" or "excerpt" field accidentally included.
    expect(text).not.toContain('extracted_content');
    expect(text).not.toContain('raw_text');
  });

  it('includes the role in the text', () => {
    const args = buildDrafterToolArgs('purpose', 'qualifier', [CLAIM], []);
    expect(args.text as string).toContain('qualifier');
  });

  it('threads model through', () => {
    const args = buildDrafterToolArgs('purpose', 'answer', [CLAIM], [], 'hermes3:8b');
    expect(args.model).toBe('hermes3:8b');
  });
});

describe('runDrafter', () => {
  it('returns ok:false for an empty cluster', async () => {
    const client = makeClient('unused');
    const result = await runDrafter(client, 'purpose', 'evidence', [], []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/empty cluster/);
  });

  it('returns ok:true with a non-empty paragraph on success', async () => {
    const expected = 'Local-first tools maintain data integrity under network partitions.';
    const result = await runDrafter(
      makeClient(envelopeOk(expected)),
      'purpose',
      'answer',
      [CLAIM],
      [SOURCE],
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.paragraph).toBe(expected);
  });

  it('uses ollama_extract as the tool name', async () => {
    const called: string[] = [];
    await runDrafter(
      makeClient(envelopeOk('paragraph'), called),
      'purpose',
      'evidence',
      [CLAIM],
      [],
    );
    expect(called).toContain('ollama_extract');
  });

  it('returns ok:false on MCP transport error', async () => {
    const client: ProseCallToolClient = {
      async callTool() { throw new Error('transport died'); },
    };
    const result = await runDrafter(client, 'purpose', 'evidence', [CLAIM], []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('transport died');
  });

  it('returns ok:false when envelope has ok:false', async () => {
    const result = await runDrafter(
      makeClient(envelopeError('quota exhausted')),
      'purpose',
      'evidence',
      [CLAIM],
      [],
    );
    expect(result.ok).toBe(false);
  });

  it('returns ok:false when response is not valid JSON', async () => {
    const result = await runDrafter(
      makeClient('plaintext response'),
      'purpose',
      'evidence',
      [CLAIM],
      [],
    );
    expect(result.ok).toBe(false);
  });

  it('returns ok:false when paragraph field is empty or missing', async () => {
    const emptyParagraph = JSON.stringify({ result: { ok: true, data: { paragraph: '   ' } } });
    const result = await runDrafter(makeClient(emptyParagraph), 'purpose', 'evidence', [CLAIM], []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/empty paragraph/);
  });
});
