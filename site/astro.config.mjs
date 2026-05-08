// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://mcp-tool-shop-org.github.io',
  base: '/research-os',
  integrations: [
    starlight({
      title: 'research-os',
      description: 'Local-first research control plane for gated source packs, claim truth, contradiction handling, and long-running AI synthesis',
      disable404Route: true,
      logo: {
        src: './src/assets/logo.png',
        alt: 'research-os',
        href: '/research-os/',
        replacesTitle: false,
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/mcp-tool-shop-org/research-os' },
      ],
      sidebar: [
        {
          label: 'Handbook',
          autogenerate: { directory: 'handbook' },
        },
      ],
      customCss: ['./src/styles/starlight-custom.css'],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
