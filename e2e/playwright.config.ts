import { defineConfig, devices } from '@playwright/test';

const PORT = 18400;
const HA_PORT = 18410;
const STANDALONE_PORT = 18430;
const STANDALONE_HA_PORT = 18440;
const BETA_PORT = 18450;

/**
 * Seit Stufe 4 startet die App auf „Heute". Die meisten Tests gehen von den Boards aus: Der Merkzettel des Geräts (localStorage)
 * stellt sie darauf ein. Tests, die den Start prüfen, nehmen ihn wieder weg (test.use({ storageState: NO_MEMO })).
 */
const startOnBoards = (port: number) => ({
  cookies: [],
  origins: [{ origin: `http://127.0.0.1:${port}`, localStorage: [{ name: 'stups.tab', value: 'boards' }] }],
});

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
    // Die Tests legen Daten über die API an (Boards, Karten): ohne Angabe antwortet der Server Englisch, und neue Boards hießen „Open", „Planned" …
    // Die Seite selbst sendet ihre eigene Sprache; das englische Projekt stellt es auf Englisch um.
    extraHTTPHeaders: { 'x-stups-language': 'de' },
  },
  // Die Companion App folgt dem Hell/Dunkel des iPhones, beide Themes werden geprüft
  projects: [
    { name: 'dunkel', testIgnore: /waechter|haus|standalone|beta|english/, use: { colorScheme: 'dark', storageState: startOnBoards(PORT) } },
    { name: 'hell', testIgnore: /waechter|haus|standalone|beta|english/, use: { colorScheme: 'light', storageState: startOnBoards(PORT) } },
    // Ein Gerät, das Englisch meldet: Oberfläche, Schnell-Eingabe und Sprachwahl (gleicher Server wie dunkel und hell)
    { name: 'english', testMatch: /18-english\.spec\.ts$/, use: { colorScheme: 'dark', locale: 'en-GB', extraHTTPHeaders: { 'x-stups-language': 'en' }, storageState: startOnBoards(PORT) } },
    // Wächter brauchen Home Assistant: eigener Server mit nachgebautem Home Assistant (e2e/server-ha.mjs)
    { name: 'waechter', testMatch: /waechter|haus/, use: { colorScheme: 'dark', baseURL: `http://127.0.0.1:${HA_PORT}`, storageState: startOnBoards(HA_PORT) } },
    // Eigener Container ohne Home Assistant, Anmeldung mit Konto (e2e/server-standalone.mjs)
    { name: 'standalone', testMatch: /standalone\.spec\.ts$/, use: { colorScheme: 'dark', baseURL: `http://127.0.0.1:${STANDALONE_PORT}`, storageState: startOnBoards(STANDALONE_PORT) } },
    // Eigener Container mit Verbindung zu einem nachgebauten Home Assistant (e2e/server-standalone-ha.mjs)
    { name: 'standalone-ha', testMatch: /standalone-ha\.spec\.ts$/, use: { colorScheme: 'dark', baseURL: `http://127.0.0.1:${STANDALONE_HA_PORT}`, storageState: startOnBoards(STANDALONE_HA_PORT) } },
    // Beta-App: STUPS_CHANNEL=beta, Push und Wächter zunächst aus (e2e/server-beta.mjs)
    { name: 'beta', testMatch: /14-beta\.spec\.ts$/, use: { colorScheme: 'dark', baseURL: `http://127.0.0.1:${BETA_PORT}`, storageState: startOnBoards(BETA_PORT) } },
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
    {
      command: 'node e2e/server-standalone-ha.mjs',
      cwd: '..',
      url: `http://127.0.0.1:${STANDALONE_HA_PORT}/healthz`,
      env: { PORT: String(STANDALONE_HA_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node e2e/server-beta.mjs',
      cwd: '..',
      url: `http://127.0.0.1:${BETA_PORT}/healthz`,
      env: { PORT: String(BETA_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
