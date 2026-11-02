import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import svelte from '@astrojs/svelte';

export default defineConfig({
  site: 'https://danieljsmith.org',
  compressHTML: true,
  integrations: [svelte()],
  vite: {
    plugins: [tailwindcss()],
  },
  redirects: {
    '/testimonials': 'https://tuition.danieljsmith.org/testimonials/',
  },
});
