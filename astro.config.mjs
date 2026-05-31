import { defineConfig } from 'astro/config';
import { SITE } from './src/lib/site.js';

// Static generation = the SEO-correct route for thousands of programmatic pages.
export default defineConfig({
  site: SITE.url,
  output: 'static',
  build: { format: 'directory' },
});
