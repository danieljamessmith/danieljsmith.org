import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://danieljsmith.org',
  integrations: [tailwind()],
  redirects: {
    '/testimonials': 'https://tuition.danieljsmith.org/testimonials/',
  },
});
