import { defineConfig } from '@playwright/test';

const port = process.env.PORT || '5173';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${port}`,
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
  },
});
