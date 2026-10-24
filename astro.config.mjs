import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import svelte from '@astrojs/svelte';

export default defineConfig({
  site: 'https://danieljsmith.org',
  integrations: [tailwind(), svelte()],
  redirects: {
    '/testimonials': 'https://tuition.danieljsmith.org/testimonials/',
  },
});
