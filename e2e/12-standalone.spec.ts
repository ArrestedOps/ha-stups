import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// Betriebsart 3: eigener Container ohne Home Assistant (e2e/server-standalone.mjs), Anmeldung mit eigenem Konto.
// Die Tests bauen aufeinander auf: erst die Einrichtung, dann Anmeldung, Benutzer, Mitglied.
test.describe.configure({ mode: 'serial' });

const CODE_FILE = join(tmpdir(), 'stups-e2e-standalone-code.txt');
const PW = 'ein-langes-passwort';
const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });

async function melden(page: Page, user: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Benutzername').fill(user);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
}

async function einstellungen(page: Page) {
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  return page.getByRole('dialog');
}

test('Erster Start: ohne Konto sperrt die API, die Einrichtung verlangt den Code aus dem Protokoll', async ({ page, request }) => {
  expect((await request.get('/api/boards')).status()).toBe(401);
  // gefälschte Ingress-Kopfzeilen helfen nicht
  expect((await request.get('/api/boards', { headers: { 'x-remote-user-id': 'admin', 'x-remote-user-name': 'admin' } })).status()).toBe(401);

  await page.goto('/');
  await expect(page.getByTestId('setup')).toBeVisible();
  await expect(page.getByText('Willkommen! Richte den ersten Administrator ein.')).toBeVisible();
  await expect(nav(page)).toHaveCount(0);

  const form = page.getByRole('form', { name: 'Einrichtung' });
  await form.getByLabel('Einrichtungscode').fill('ZZZZ-ZZZZ');
  await form.getByLabel('Benutzername').fill('anna');
  await form.getByLabel('Name in Stups').fill('Anna');
  await form.getByLabel('Passwort', { exact: true }).fill(PW);
  await form.getByLabel('Passwort wiederholen').fill(PW);
  await form.getByRole('button', { name: 'Einrichten' }).click();
  await expect(page.getByRole('alert')).toContainText('Einrichtungscode stimmt nicht');

  const code = readFileSync(CODE_FILE, 'utf8').trim();
  expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  await form.getByLabel('Einrichtungscode').fill(code);
  await form.getByLabel('Passwort wiederholen').fill('anderes-passwort-1');
  await form.getByRole('button', { name: 'Einrichten' }).click();
  await expect(page.getByRole('alert')).toContainText('nicht gleich');

  await form.getByLabel('Passwort wiederholen').fill(PW);
  await form.getByRole('button', { name: 'Einrichten' }).click();
  await expect(nav(page)).toBeVisible(); // gleich angemeldet
});

test('Ohne Home Assistant: drei Reiter, kein Dashboard-Button, nichts von Home Assistant in den Einstellungen', async ({ page }) => {
  await melden(page, 'anna', PW);
  await expect(nav(page).getByRole('button')).toHaveCount(3);
  await expect(nav(page).getByRole('button', { name: 'Wächter' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dashboard' })).toHaveCount(0);

  const dialog = await einstellungen(page);
  await expect(dialog.getByText('Konto', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Angemeldet als')).toBeVisible();
  for (const weg of ['Zurück zum Dashboard', 'Darstellung', 'Wächter', 'Benachrichtigungen', 'Bubble Card', 'Umzug', 'Diagnose-Seite']) {
    await expect(dialog.getByText(weg, { exact: false })).toHaveCount(0);
  }
  // kein Fehler, keine leere Gruppe
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);
});

test('Anmelden, Karte anlegen, nach dem Neuladen noch angemeldet; Abmelden sperrt wieder', async ({ page }) => {
  await melden(page, 'anna', 'falsches-passwort');
  await expect(page.getByRole('alert')).toContainText('Benutzername oder Passwort stimmt nicht');
  await page.getByLabel('Passwort', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(nav(page)).toBeVisible();

  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  await page.getByLabel('Titel').fill('Fenster putzen');
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await expect(page.getByText('Fenster putzen')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Fenster putzen')).toBeVisible();

  const dialog = await einstellungen(page);
  await dialog.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page.getByTestId('login')).toBeVisible();
  await expect(page.getByText('Fenster putzen')).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByTestId('login')).toBeVisible(); // das Cookie ist weg
});

test('Administrator legt Ben an; Ben meldet sich an und sieht keine Verwaltung', async ({ page, browser, baseURL }) => {
  await melden(page, 'anna', PW);
  const dialog = await einstellungen(page);
  await dialog.getByRole('button', { name: 'Personen & Zugriff' }).click();

  const form = page.getByRole('form', { name: 'Benutzer anlegen' });
  await form.getByLabel('Name der neuen Person').fill('Ben');
  await form.getByLabel('Benutzername').fill('ben');
  await form.getByLabel('Passwort').fill('kurz');
  await expect(form.getByRole('button', { name: 'Benutzer anlegen' })).toBeDisabled(); // zu kurz
  await form.getByLabel('Passwort').fill('bens-passwort-1');
  await form.getByRole('button', { name: 'Benutzer anlegen' }).click();
  await expect(page.getByRole('button', { name: /Ben.*Benutzername ben/ })).toBeVisible();
  await expect(page.getByText('Wer darf Stups öffnen?')).toHaveCount(0);
  await expect(page.getByText('Push-Geräte')).toHaveCount(0);

  const ctx = await browser.newContext({ baseURL: String(baseURL), locale: 'de-DE' });
  const ben = await ctx.newPage();
  try {
    await melden(ben, 'ben', 'bens-passwort-1');
    await expect(nav(ben)).toBeVisible();
    await expect(ben.getByText('Fenster putzen').first()).toBeVisible(); // gemeinsame Boards

    const d = await einstellungen(ben);
    await d.getByRole('button', { name: 'Personen & Zugriff' }).click();
    await expect(ben.getByRole('form', { name: 'Benutzer anlegen' })).toHaveCount(0);
    // die Verwaltung der Benutzer ist auch per API zu
    expect((await ctx.request.get('/api/auth/users')).status()).toBe(403);
  } finally {
    await ctx.close();
  }
});

test('Passwort ändern: das neue gilt, das alte nicht mehr', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL: String(baseURL), locale: 'de-DE' });
  const page = await ctx.newPage();
  try {
    await melden(page, 'ben', 'bens-passwort-1');
    const dialog = await einstellungen(page);
    await dialog.getByRole('button', { name: 'Ändern' }).click();
    const form = page.getByRole('form', { name: 'Passwort ändern' });
    await form.getByLabel('Aktuelles Passwort').fill('bens-passwort-1');
    await form.getByLabel('Neues Passwort', { exact: true }).fill('bens-neues-passwort');
    await form.getByLabel('Neues Passwort wiederholen').fill('bens-neues-passwort');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Passwort geändert')).toBeVisible();
    await dialog.getByRole('button', { name: 'Abmelden' }).click();
    await expect(page.getByTestId('login')).toBeVisible();

    await melden(page, 'ben', 'bens-passwort-1');
    await expect(page.getByRole('alert')).toContainText('stimmt nicht');
    await page.getByLabel('Passwort', { exact: true }).fill('bens-neues-passwort');
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await expect(nav(page)).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test('Nach fünf Fehlversuchen heißt es warten', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL: String(baseURL), locale: 'de-DE' });
  const page = await ctx.newPage();
  try {
    await page.goto('/');
    for (let i = 0; i < 5; i += 1) {
      await page.getByLabel('Benutzername').fill('gast-versuch');
      await page.getByLabel('Passwort', { exact: true }).fill(`falsch-falsch-${i}`);
      await page.getByRole('button', { name: 'Anmelden' }).click();
      await expect(page.getByRole('alert')).toBeVisible();
    }
    await page.getByLabel('Passwort', { exact: true }).fill('noch-ein-versuch');
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await expect(page.getByRole('alert')).toContainText('Zu viele Versuche');
  } finally {
    await ctx.close();
  }
});
