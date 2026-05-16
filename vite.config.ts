import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH ?? (mode === 'production' ? '/web-toys/' : '/'),
  build: {
    target: 'es2020',
    rollupOptions: {
      input: {
        main: 'index.html',
        solitaire: 'solitaire-cascade/index.html',
        ants: 'ants-nest-simulator/index.html',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['**/src/__tests__/**/*.test.ts'],
    reporters: ['default', 'junit'],
    outputFile: { junit: 'test-results/junit.xml' },
  },
}));
