import { expect, test, type Page } from '@playwright/test';
import pngjs from 'pngjs';
import { openSettingsPage } from './helpers';

// Einstellungen als Übersicht mit Unterseiten. Der Test-Server meldet jeden als „rene" an (Person, ohne Home Assistant Administrator).
// Er prüft auch, dass nichts von dem verloren ging, was früher in einer langen Liste stand.
const { PNG } = pngjs;
const dialog = (page: Page) => page.getByRole('dialog');
const back = (page: Page) => dialog(page).getByRole('button', { name: 'Zurück zu den Einstellungen' }).click();
const API = { 'x-stups-client': 'e2e' };

test.afterEach(async ({ request }) => {
  const me = ((await (await request.get('/api/me')).json()) as { user: { id: string } }).user.id;
  await request.patch(`/api/access/people/${me}`, { data: { busyUntil: null }, headers: API });
  await request.delete(`/api/people/${me}/avatar`, { headers: API });
});

test('Übersicht: Gruppen für den Administrator, jede Seite öffnet und führt zurück', async ({ page }) => {
  await page.goto('/');
  await openSettingsPage(page);
  const d = dialog(page);
  for (const group of ['Für mich', 'Haushalt', 'Home Assistant', 'Hilfe und Daten']) await expect(d.getByText(group, { exact: true })).toBeVisible();
  // Fuß: angemeldet als, Link zur Diagnose-Seite
  await expect(d.getByText(/Angemeldet als/)).toBeVisible();
  await expect(d.getByRole('link', { name: 'Diagnose-Seite' })).toBeVisible();

  for (const page_ of ['Benachrichtigungen', 'Sprache und Farbe', 'Personen und Kinder', 'Vorlagen', 'Termine', 'Dashboard und Kopfzeile', 'Warum kommt nichts an?', 'Papierkorb, Archiv, Umzug']) {
    await d.getByRole('button', { name: page_ }).click();
    await expect(d.getByRole('button', { name: 'Zurück zu den Einstellungen' })).toBeVisible();
    await back(page);
    await expect(d.getByText('Hilfe und Daten', { exact: true })).toBeVisible();
  }
});

test('Nichts geht verloren: Sprache und Farbe, Termine, Dashboard und Kopfzeile, Benachrichtigungen, Daten', async ({ page }) => {
  await page.goto('/');
  await openSettingsPage(page, 'Sprache und Farbe');
  const d = dialog(page);
  await expect(d.getByLabel('Sprache', { exact: true })).toBeVisible();
  await expect(d.getByTestId('accent-wheel')).toBeVisible();
  await back(page);

  await d.getByRole('button', { name: 'Termine' }).click();
  await expect(d.getByLabel('Standard-Uhrzeit für Termine')).toBeVisible();
  await back(page);

  // Dashboard und Kopfzeile: Ziel-Dashboard, HA-Kopfzeile ausblenden, Bubble-Card-YAML
  await d.getByRole('button', { name: 'Dashboard und Kopfzeile' }).click();
  await expect(d.getByText('Zurück zum Dashboard', { exact: true })).toBeVisible();
  await expect(d.getByLabel('Dashboard', { exact: true })).toBeVisible();
  await expect(d.getByLabel('Kopfzeile von Home Assistant ausblenden')).toBeVisible();
  await expect(d.getByText(/type: custom:bubble-card/)).toBeVisible();
  await expect(d.getByRole('button', { name: 'Kopieren' })).toBeVisible();
  await back(page);

  await d.getByRole('button', { name: 'Benachrichtigungen' }).click();
  await expect(d.getByRole('button', { name: 'An mich senden' })).toBeVisible();
  await expect(d.getByLabel(/Ruhezeit für Stupse von/)).toBeVisible();
  await expect(d.getByLabel(/Wöchentliche Zusammenfassung von/)).toBeVisible();
  await expect(d.getByLabel(/Wenig Zeit bis \(Datum\) für/)).toBeVisible();
  await back(page);

  await d.getByRole('button', { name: 'Warum kommt nichts an?' }).click();
  await d.getByRole('button', { name: 'Stand anzeigen' }).click();
  await expect(d.getByText('Nächste Karten mit Termin')).toBeVisible();
  await back(page);

  await d.getByRole('button', { name: 'Papierkorb, Archiv, Umzug' }).click();
  await expect(d.getByRole('button', { name: 'Papierkorb', exact: true })).toBeVisible();
  await expect(d.getByRole('button', { name: 'Archiv', exact: true })).toBeVisible();
  await expect(d.getByRole('button', { name: 'Nach /share' })).toBeVisible();
});

test('Wenig Zeit: Datum eintragen, gespeichert, „Wieder normal" nimmt es zurück', async ({ page, request }) => {
  const me = ((await (await request.get('/api/me')).json()) as { user: { id: string; displayName: string } }).user;
  const inTwoDays = new Date(Date.now() + 2 * 86_400_000);
  const key = `${inTwoDays.getFullYear()}-${String(inTwoDays.getMonth() + 1).padStart(2, '0')}-${String(inTwoDays.getDate()).padStart(2, '0')}`;
  await page.goto('/');
  await openSettingsPage(page, 'Benachrichtigungen');
  const field = dialog(page).getByLabel(`Wenig Zeit bis (Datum) für ${me.displayName}`);
  await field.fill(key);
  await field.dispatchEvent('change');
  await expect.poll(async () => ((await (await request.get('/api/people')).json()) as { id: string; busyUntil: string | null }[]).find((p) => p.id === me.id)?.busyUntil).toBe(key);
  await dialog(page).getByRole('button', { name: 'Wieder normal' }).click();
  await expect.poll(async () => ((await (await request.get('/api/people')).json()) as { id: string; busyUntil: string | null }[]).find((p) => p.id === me.id)?.busyUntil).toBeNull();
});

test('Personenbild: hochladen zeigt das Bild im Avatar, entfernen kehrt zur Initiale zurück', async ({ page }) => {
  const png = new PNG({ width: 8, height: 8 });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([200, 60, 20, 255], i);
  await page.goto('/');
  await openSettingsPage(page);
  const d = dialog(page);
  await expect(d.getByTestId('avatar-origin')).toContainText('Noch kein Bild');
  await d.getByLabel('Bild wählen').setInputFiles({ name: 'ich.png', mimeType: 'image/png', buffer: PNG.sync.write(png) });
  await expect(d.getByTestId('avatar-origin')).toContainText('Eigenes Bild');
  await expect(page.getByRole('button', { name: 'Einstellungen öffnen' }).locator('img')).toBeVisible();
  await d.getByRole('button', { name: 'Bild entfernen' }).click();
  await expect(d.getByTestId('avatar-origin')).toContainText('Noch kein Bild');
  await expect(page.getByRole('button', { name: 'Einstellungen öffnen' }).locator('img')).toHaveCount(0);
});
