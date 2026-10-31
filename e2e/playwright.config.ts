import { defineConfig, devices } from '@playwright/test';

const PORT = 18400;

// Läuft gegen den gebauten Server (pnpm build zuerst), in WebKit mit iPhone-Ansicht wie die Companion App.
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices['iPhone 13'],
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
  },
  // Die Companion App folgt dem Hell/Dunkel des iPhones, beide Themes werden geprüft
  projects: [
    { name: 'dunkel', use: { colorScheme: 'dark' } },
    { name: 'hell', use: { colorScheme: 'light' } },
  ],
  webServer: {
    command: 'node e2e/server.mjs',
    cwd: '..',
    url: `http://127.0.0.1:${PORT}/healthz`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
