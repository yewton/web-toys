import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH ?? (mode === 'production' ? '/web-toys/' : '/'),
  server: {
    host: process.env.VITE_DEV_HOST,
    allowedHosts: process.env.VITE_ALLOWED_HOSTS?.split(','),
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      injectRegister: 'inline',
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2020',
    rollupOptions: {
      input: {
        main: 'index.html',
        solitaire: 'solitaire-cascade/index.html',
        ants: 'ants-nest-simulator/index.html',
        clicker: 'inflation-clicker/index.html',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['**/src/__tests__/**/*.test.ts'],
    reporters: ['default', 'junit'],
    outputFile: { junit: 'test-results/junit.xml' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      exclude: [
        // DOM-only module: requires document.createElement('canvas'), untestable in node env
        '**/textures.ts',
        // Canvas-only renderer for the HP gauge; its pure model lives in hpGauge.ts (tested)
        '**/gaugeView.ts',
      ],
    },
  },
}));
