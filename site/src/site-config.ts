import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'research-os',
  description: 'Local-first research control plane for gated source packs, claim truth, contradiction handling, and long-running AI synthesis',
  logoBadge: 'RO',
  brandName: 'research-os',
  repoUrl: 'https://github.com/mcp-tool-shop-org/research-os',
  npmUrl: 'https://www.npmjs.com/package/@mcptoolshop/research-os',
  footerText: 'MIT Licensed — built by <a href="https://mcp-tool-shop.github.io/" style="color:var(--color-muted);text-decoration:underline">MCP Tool Shop</a>',

  hero: {
    badge: 'v0.1.0 — dogfood-proven',
    headline: 'research-os',
    headlineAccent: 'No synthesis before source truth.',
    description: 'A local-first CLI that turns an open-ended topic into a gated research-pack — a structured repo where Claude, Cowork, or a swarm can work for hours without hallucinating or flattening the investigation.',
    primaryCta: { href: 'https://github.com/mcp-tool-shop-org/research-os', label: 'View on GitHub' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Init', code: 'research-os init "How should X be structured?"' },
      { label: 'Chain', code: 'research-os gather 01-landscape --url https://...\nresearch-os claim extract 01-landscape\nresearch-os gate 01-landscape' },
      { label: 'Freeze', code: 'research-os audit\nresearch-os freeze\n# audits/freeze-receipt.json written' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: '16 load-bearing laws',
      subtitle: 'Every step in the chain is enforced, not trusted.',
      features: [
        {
          title: 'Source truth first',
          desc: 'No synthesis before source truth. Fetch is evidence; extraction is interpretation. Models interpret source spans — they never author evidence text.',
        },
        {
          title: 'Claim integrity',
          desc: 'Extraction may overproduce; synthesis may not inherit abundance. A formal triage pass deduplicates and parks low-leverage candidates before review.',
        },
        {
          title: 'Freeze-locked output',
          desc: 'Freeze writes a sha256-fingerprinted receipt of every canonical and synthesis artifact. Unfinished research cannot masquerade as done.',
        },
      ],
    },
    {
      kind: 'code-cards',
      id: 'usage',
      title: 'The workflow chain',
      cards: [
        {
          title: 'Create a pack',
          code: 'research-os init "How should X be structured?"\nresearch-os section add 01-landscape --purpose "Map the landscape"',
        },
        {
          title: 'Gather and gate',
          code: 'research-os gather 01-landscape --url https://example.com/paper\nresearch-os claim extract 01-landscape\nresearch-os claim triage 01-landscape\nresearch-os contradict map 01-landscape\nresearch-os gate 01-landscape',
        },
        {
          title: 'Review and freeze',
          code: 'research-os review 01-landscape --two-pass-llm\nresearch-os review-promote 01-landscape\nresearch-os cowork handoff\nresearch-os audit\nresearch-os freeze',
        },
      ],
    },
  ],
};
