import { defineConfig, devices } from '@playwright/test';

// Nur die Feedback-Tests, auf eigenen Ports (19700 ff.), damit sie neben den festen Ports 18400 bis 18450 laufen (zum Beispiel, wenn dort
// schon ein anderer Lauf steht). Aufruf: pnpm exec playwright test -c e2e/playwright.feedback.config.ts   (nach pnpm build)
const PORT = 19700;

export default defineConfig({
  testDir: '.',
  testMatch: '35-feedback.spec.ts',
  outputDir: './test-results-feedback',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices['iPhone 13'],
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
    extraHTTPHeaders: { 'x-stups-language': 'de' },
  },
  projects: [
    { name: 'dunkel', use: { colorScheme: 'dark' } },
    { name: 'hell', use: { colorScheme: 'light' } },
  ],
  webServer: [
    {
      command: 'node e2e/server.mjs',
      cwd: '..',
      url: `http://127.0.0.1:${PORT}/healthz`,
      env: { PORT: String(PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
