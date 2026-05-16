import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/web-toys/' : '/',
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
}));
