import { defineConfig, devices } from '@playwright/test';

const PORT = 18400;
const HA_PORT = 18410;
const STANDALONE_PORT = 18430;
const STANDALONE_HA_PORT = 18440;
const BETA_PORT = 18450;
const ONBOARDING_PORT = 18460;
const OPTIONS_PORT = 18470;

/**
 * Die App startet immer auf „Aufgaben“ (auch nach dem Neuladen). Tests, die auf den Boards arbeiten, wechseln den Reiter selbst
 * (`openBoards` in helpers.ts).
 */

/** Die Desktop-Specs (35-desktop, 36-desktop-ha) laufen nur in den Desktop-Projekten (am Dateinamen erkannt, nicht am Ordner) */
const DESKTOP_SPECS = /\/(3[56]|4[245])-desktop[^/]*\.spec\.ts$/;
const DESKTOP = { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } };

/**
 * Eine kleine Auswahl der Kernabläufe auch in Chromium (die Android-Companion-App ist ein Chromium-WebView) und Firefox: Karten anlegen,
 * wischen, erledigen, Aufgaben und Kalender, Live-Sync. Bewusst nicht alle Specs in allen Browsern, sondern die, an denen sich Browser unterscheiden
 * (Zeigerereignisse, Scrollen, Datumsfelder).
 */
const KERN_SPECS = /\/(1-board|7-agenda|16-agenda|8-calendar|2-live-sync|24-heute)\.spec\.ts$/;

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
    { name: 'dunkel', testIgnore: [/waechter|haus|standalone|beta|english|onboarding|optionen/, DESKTOP_SPECS], use: { colorScheme: 'dark' } },
    { name: 'hell', testIgnore: [/waechter|haus|standalone|beta|english|onboarding|optionen/, DESKTOP_SPECS], use: { colorScheme: 'light' } },
    // Desktop (ab 1024 px, hier 1440 × 900): Seitenleiste, Detailspalte, Dialoge; dasselbe in Dunkel und Hell. Das Handy bleibt in den Projekten oben.
    { name: 'desktop-dunkel', testMatch: /\/35-desktop\.spec\.ts$/, use: { ...DESKTOP, colorScheme: 'dark' } },
    { name: 'desktop-hell', testMatch: /\/35-desktop\.spec\.ts$/, use: { ...DESKTOP, colorScheme: 'light' } },
    // Wächter am Desktop brauchen Home Assistant: derselbe nachgebaute Server wie „waechter“
    { name: 'desktop-ha', testMatch: /\/(36-desktop-(ha|formular)|42-desktop-board|44-desktop-nachhaken|45-desktop-board)\.spec\.ts$/, use: { ...DESKTOP, colorScheme: 'dark', baseURL: `http://127.0.0.1:${HA_PORT}` } },
    // Kernabläufe in anderen Browsern (gleicher Server wie dunkel und hell): Android-Handy (Chromium) und Firefox am Desktop
    { name: 'chromium-handy', testMatch: KERN_SPECS, use: { ...devices['Pixel 7'], colorScheme: 'dark' } },
    { name: 'firefox-desktop', testMatch: /\/35-desktop\.spec\.ts$/, use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 }, isMobile: false, colorScheme: 'dark' } },
    // Ein Gerät, das Englisch meldet: Oberfläche, Schnell-Eingabe und Sprachwahl (gleicher Server wie dunkel und hell)
    { name: 'english', testMatch: /18-english\.spec\.ts$/, use: { colorScheme: 'dark', locale: 'en-GB', extraHTTPHeaders: { 'x-stups-language': 'en' } } },
    // Wächter brauchen Home Assistant: eigener Server mit nachgebautem Home Assistant (e2e/server-ha.mjs)
    { name: 'waechter', testMatch: /waechter|haus/, use: { colorScheme: 'dark', baseURL: `http://127.0.0.1:${HA_PORT}` } },
    // Eigener Container ohne Home Assistant, Anmeldung mit Konto (e2e/server-standalone.mjs)
    { name: 'standalone', testMatch: /standalone\.spec\.ts$/, use: { colorScheme: 'dark', baseURL: `http://127.0.0.1:${STANDALONE_PORT}` } },
    // Eigener Container mit Verbindung zu einem nachgebauten Home Assistant (e2e/server-standalone-ha.mjs)
    { name: 'standalone-ha', testMatch: /standalone-ha\.spec\.ts$/, use: { colorScheme: 'dark', baseURL: `http://127.0.0.1:${STANDALONE_HA_PORT}` } },
    // Add-on mit options.json aus der Zeit vor 1.41: der erste Start übernimmt die Optionen in die App (e2e/server-options.mjs)
    { name: 'optionen', testMatch: /47-optionen-uebernahme.spec.ts$/, use: { colorScheme: 'dark', baseURL: `http://127.0.0.1:${OPTIONS_PORT}` } },
    // Einrichtung beim ersten Start: frischer Server mit nachgebautem Home Assistant, ohne den Schalter DEV_NO_ONBOARDING (e2e/server-onboarding.mjs);
    // Handy und Desktop, hell und dunkel. Jeder Durchlauf setzt den Stand selbst zurück (46-onboarding.spec.ts), damit die Projekte hintereinander laufen.
    ...(['dark', 'light'] as const).flatMap((colorScheme) => [
      { name: `onboarding-${colorScheme}`, testMatch: /\/46-onboarding\.spec\.ts$/, use: { colorScheme, baseURL: `http://127.0.0.1:${ONBOARDING_PORT}` } },
      { name: `onboarding-desktop-${colorScheme}`, testMatch: /\/46-onboarding\.spec\.ts$/, use: { ...DESKTOP, colorScheme, baseURL: `http://127.0.0.1:${ONBOARDING_PORT}` } },
    ]),
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
    {
      command: 'node e2e/server-options.mjs',
      cwd: '..',
      url: `http://127.0.0.1:${OPTIONS_PORT}/healthz`,
      env: { PORT: String(OPTIONS_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node e2e/server-onboarding.mjs',
      cwd: '..',
      url: `http://127.0.0.1:${ONBOARDING_PORT}/healthz`,
      env: { PORT: String(ONBOARDING_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
