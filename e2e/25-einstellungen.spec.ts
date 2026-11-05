import { expect, test, type Page } from '@playwright/test';
import pngjs from 'pngjs';
import { openSettingsPage, openBoards } from './helpers';

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
  await openBoards(page);
  await openSettingsPage(page);
  const d = dialog(page);
  for (const group of ['Für mich', 'Haushalt', 'Home Assistant', 'Hilfe und Daten']) await expect(d.getByText(group, { exact: true })).toBeVisible();
  // Fuß: angemeldet als, Link zur Diagnose-Seite
  await expect(d.getByText(/Angemeldet als/)).toBeVisible();
  await expect(d.getByRole('link', { name: 'Diagnose-Seite' })).toBeVisible();

  for (const page_ of ['Benachrichtigungen', 'Sprache und Farbe', 'Personen & Zugriff', 'Vorlagen', 'Termine', 'Dashboard', 'Dashboard-Button', 'Tageszusammenfassung', 'Warum kommt nichts an?', 'Papierkorb, Archiv, Umzug']) {
    await d.getByRole('button', { name: page_, exact: true }).click();
    await expect(d.getByRole('button', { name: 'Zurück zu den Einstellungen' })).toBeVisible();
    await back(page);
    await expect(d.getByText('Hilfe und Daten', { exact: true })).toBeVisible();
  }
});

test('Nichts geht verloren: Sprache und Farbe, Termine, Dashboard, Benachrichtigungen, Daten', async ({ page }) => {
  await page.goto('/');
  await openBoards(page);
  await openSettingsPage(page, 'Sprache und Farbe');
  const d = dialog(page);
  await expect(d.getByLabel('Sprache', { exact: true })).toBeVisible();
  await expect(d.getByTestId('accent-wheel')).toBeVisible();
  await back(page);

  await d.getByRole('button', { name: 'Termine' }).click();
  await expect(d.getByLabel('Standard-Uhrzeit für Termine')).toBeVisible();
  await back(page);

  // Dashboard: Ziel des Home-Knopfs (die Kopfzeile von Home Assistant ausblenden steht in der Übersicht)
  await d.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(d.getByTestId('dashboard-choices')).toBeVisible();
  await expect(d.getByTestId('dashboard-default')).toBeVisible();
  await back(page);
  await expect(d.getByRole('switch', { name: 'Kopfzeile von Home Assistant ausblenden' })).toBeVisible();

  // Dashboard-Button: Vorschau und Bubble-Card-YAML mit dem Sensor „heute fällig"
  await d.getByRole('button', { name: 'Dashboard-Button' }).click();
  await expect(d.getByTestId('bubble-preview')).toContainText('heute fällig');
  await expect(d.getByTestId('bubble-yaml')).toContainText('type: custom:bubble-card');
  await expect(d.getByTestId('bubble-yaml')).toContainText('entity: sensor.stups_heute_faellig');
  await expect(d.getByRole('button', { name: 'YAML kopieren' })).toBeVisible();
  await back(page);

  await d.getByRole('button', { name: 'Benachrichtigungen' }).click();
  await expect(d.getByRole('button', { name: 'An mich senden' })).toBeVisible();
  await expect(d.getByLabel(/Ruhezeit für Stupse von/)).toBeVisible();
  await expect(d.getByLabel(/Wöchentliche Zusammenfassung von/)).toBeVisible();
  await expect(d.getByLabel(/Wenig Zeit bis \(Datum\) für/)).toBeVisible();
  await back(page);

  await d.getByRole('button', { name: 'Warum kommt nichts an?' }).click();
  await expect(d.getByTestId('push-ok')).toBeVisible();
  await expect(d.getByText('Nächste Karten mit Termin')).toBeVisible();
  await back(page);

  await d.getByRole('button', { name: 'Papierkorb, Archiv, Umzug' }).click();
  await expect(d.getByRole('button', { name: 'Papierkorb', exact: true })).toBeVisible();
  await expect(d.getByRole('button', { name: 'Archiv', exact: true })).toBeVisible();
  await expect(d.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
});

test('Wenig Zeit: Datum eintragen, gespeichert, „Wieder normal" nimmt es zurück', async ({ page, request }) => {
  const me = ((await (await request.get('/api/me')).json()) as { user: { id: string; displayName: string } }).user;
  const inTwoDays = new Date(Date.now() + 2 * 86_400_000);
  const key = `${inTwoDays.getFullYear()}-${String(inTwoDays.getMonth() + 1).padStart(2, '0')}-${String(inTwoDays.getDate()).padStart(2, '0')}`;
  await page.goto('/');
  await openBoards(page);
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
  await openBoards(page);
  await openSettingsPage(page);
  const d = dialog(page);
  await expect(d.getByTestId('avatar-origin')).toContainText('Noch kein Bild');
  await d.getByLabel('Bild wählen').setInputFiles({ name: 'ich.png', mimeType: 'image/png', buffer: PNG.sync.write(png) });
  await expect(d.getByTestId('avatar-origin')).toContainText('Eigenes Bild');
  await expect(page.getByRole('button', { name: 'Profil öffnen' }).locator('img')).toBeVisible();
  await d.getByRole('button', { name: 'Bild entfernen' }).click();
  await expect(d.getByTestId('avatar-origin')).toContainText('Noch kein Bild');
  await expect(page.getByRole('button', { name: 'Profil öffnen' }).locator('img')).toHaveCount(0);
});

test('Tageszusammenfassung: Uhrzeit in der App ändern gilt vor der Option, „Zurücksetzen" stellt die Option wieder her', async ({ page, request }) => {
  await page.goto('/');
  await openBoards(page);
  await openSettingsPage(page);
  const d = dialog(page);
  // die Übersicht hat keine Zeile „Wächter" mehr
  await expect(d.getByRole('button', { name: 'Wächter', exact: true })).toHaveCount(0);

  await d.getByRole('button', { name: 'Tageszusammenfassung' }).click();
  const field = d.getByLabel('Uhrzeit der Tageszusammenfassung');
  await field.fill('06:45');
  await expect.poll(async () => ((await (await request.get('/api/settings')).json()) as { dailySummaryTime: string | null }).dailySummaryTime).toBe('06:45');
  await expect(d.getByRole('button', { name: /Zurücksetzen/ })).toBeVisible();
  await d.getByRole('button', { name: /Zurücksetzen/ }).click();
  await expect.poll(async () => ((await (await request.get('/api/settings')).json()) as { dailySummaryTime: string | null }).dailySummaryTime).toBeNull();
  await expect(d.getByRole('button', { name: /Zurücksetzen/ })).toHaveCount(0);

  // zurück in der Übersicht steht die Uhrzeit als Wert in der Zeile
  await back(page);
  await expect(d.getByText(/^\d\d:\d\d$/).first()).toBeVisible();
});
