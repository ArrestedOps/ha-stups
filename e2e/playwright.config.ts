import { defineConfig, devices } from '@playwright/test';

const PORT = 18400;
const HA_PORT = 18410;
const STANDALONE_PORT = 18430;
const STANDALONE_HA_PORT = 18440;
const BETA_PORT = 18450;

/**
 * Die App startet immer auf „Aufgaben“ (auch nach dem Neuladen). Tests, die auf den Boards arbeiten, wechseln den Reiter selbst
 * (`openBoards` in helpers.ts).
 */

/** Die Desktop-Specs (35-desktop, 36-desktop-ha) laufen nur in den Desktop-Projekten (am Dateinamen erkannt, nicht am Ordner) */
const DESKTOP_SPECS = /\/3[56]-desktop[^/]*\.spec\.ts$/;
const DESKTOP = { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } };

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
    { name: 'dunkel', testIgnore: [/waechter|haus|standalone|beta|english/, DESKTOP_SPECS], use: { colorScheme: 'dark' } },
    { name: 'hell', testIgnore: [/waechter|haus|standalone|beta|english/, DESKTOP_SPECS], use: { colorScheme: 'light' } },
    // Desktop (ab 1024 px, hier 1440 × 900): Seitenleiste, Detailspalte, Dialoge; dasselbe in Dunkel und Hell. Das Handy bleibt in den Projekten oben.
    { name: 'desktop-dunkel', testMatch: /\/35-desktop\.spec\.ts$/, use: { ...DESKTOP, colorScheme: 'dark' } },
    { name: 'desktop-hell', testMatch: /\/35-desktop\.spec\.ts$/, use: { ...DESKTOP, colorScheme: 'light' } },
    // Wächter am Desktop brauchen Home Assistant: derselbe nachgebaute Server wie „waechter“
    { name: 'desktop-ha', testMatch: /\/36-desktop-ha\.spec\.ts$/, use: { ...DESKTOP, colorScheme: 'dark', baseURL: `http://127.0.0.1:${HA_PORT}` } },
    // Ein Gerät, das Englisch meldet: Oberfläche, Schnell-Eingabe und Sprachwahl (gleicher Server wie dunkel und hell)
    { name: 'english', testMatch: /18-english\.spec\.ts$/, use: { colorScheme: 'dark', locale: 'en-GB', extraHTTPHeaders: { 'x-stups-language': 'en' } } },
    // Wächter brauchen Home Assistant: eigener Server mit nachgebautem Home Assistant (e2e/server-ha.mjs)
    { name: 'waechter', testMatch: /waechter|haus/, use: { colorScheme: 'dark', baseURL: `http://127.0.0.1:${HA_PORT}` } },
    // Eigener Container ohne Home Assistant, Anmeldung mit Konto (e2e/server-standalone.mjs)
    { name: 'standalone', testMatch: /standalone\.spec\.ts$/, use: { colorScheme: 'dark', baseURL: `http://127.0.0.1:${STANDALONE_PORT}` } },
    // Eigener Container mit Verbindung zu einem nachgebauten Home Assistant (e2e/server-standalone-ha.mjs)
    { name: 'standalone-ha', testMatch: /standalone-ha\.spec\.ts$/, use: { colorScheme: 'dark', baseURL: `http://127.0.0.1:${STANDALONE_HA_PORT}` } },
    // Beta-App: STUPS_CHANNEL=beta, Push und Wächter zunächst aus (e2e/server-beta.mjs)
    { name: 'beta', testMatch: /14-beta\.spec\.ts$/, use: { colorScheme: 'dark', baseURL: `http://127.0.0.1:${BETA_PORT}` } },
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
