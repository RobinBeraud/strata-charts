import { defineConfig } from 'vite';

// Builds the demo page (index.html + demo/) as a static site, e.g. for GitHub Pages.
export default defineConfig({
  base: process.env.DEMO_BASE ?? './',
  build: { outDir: 'demo-dist', target: 'es2022' },
});
