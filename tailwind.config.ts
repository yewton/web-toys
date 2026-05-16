import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './ants-nest-simulator/index.html',
    './src/**/*.{ts,js}',
    './ants-nest-simulator/src/**/*.{ts,js}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
