import { defineConfig, devices } from '@playwright/test';

const PORT = 18400;
const HA_PORT = 18410;
const STANDALONE_PORT = 18430;

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
    { name: 'dunkel', testIgnore: /waechter|standalone/, use: { colorScheme: 'dark' } },
    { name: 'hell', testIgnore: /waechter|standalone/, use: { colorScheme: 'light' } },
    // Wächter brauchen Home Assistant: eigener Server mit nachgebautem Home Assistant (e2e/server-ha.mjs)
    { name: 'waechter', testMatch: /waechter/, use: { colorScheme: 'dark', baseURL: `http://127.0.0.1:${HA_PORT}` } },
    // Eigener Container ohne Home Assistant, Anmeldung mit Konto (e2e/server-standalone.mjs)
    { name: 'standalone', testMatch: /standalone\.spec\.ts$/, use: { colorScheme: 'dark', baseURL: `http://127.0.0.1:${STANDALONE_PORT}` } },
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
    {
      command: 'node e2e/server-ha.mjs',
      cwd: '..',
      url: `http://127.0.0.1:${HA_PORT}/healthz`,
      env: { PORT: String(HA_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node e2e/server-standalone.mjs',
      cwd: '..',
      url: `http://127.0.0.1:${STANDALONE_PORT}/healthz`,
      env: { PORT: String(STANDALONE_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
