import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5199, open: false },
  build: {
    lib: {
      entry: {
        strata: 'src/index.ts',
        core: 'src/core.ts',
        compat: 'src/compat/highcharts.ts',
      },
      formats: ['es'],
    },
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
  },
} as never);
