import { expect, test, type Browser, type Page } from '@playwright/test';
import pngjs from 'pngjs';
import { openSettingsPage } from './helpers';

// Feedback: eine Person (Mitglied, kein Administrator) sendet Art, Text und ein Bild; der Administrator sieht es in den Einstellungen,
// schaltet den Stand um, kopiert es als Text und löscht es; das Mitglied sieht die Liste nicht. Der Test-Server meldet jeden als „rene"
// (Administrator) an; das Mitglied kommt über die Kopfzeilen von Home Assistant.
test.describe.configure({ mode: 'serial', timeout: 90_000 });

const { PNG } = pngjs;
const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const MEMBER = `Mitglied${tag}`;
const memberHeaders = { 'x-remote-user-id': `ha-fb-${tag}`, 'x-remote-user-name': `fb${tag}`, 'x-remote-user-display-name': MEMBER, 'x-stups-language': 'de' };
const TEXT = `Der Knopf klemmt ${tag}`;
const API = { 'x-stups-client': 'e2e' };

let personId = '';

/** Ein Bild mit etwas Inhalt (kein Foto, nur Farbflächen) */
const picture = () => {
  const png = new PNG({ width: 64, height: 48 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = (i / 4) % 64 * 4;
    png.data[i + 1] = 120;
    png.data[i + 2] = 200;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
};

test.beforeAll(async ({ request }) => {
  const res = await request.post('/api/access/people', { data: { name: MEMBER, haUserId: `ha-fb-${tag}` }, headers: API });
  expect(res.status(), await res.text()).toBe(201);
  personId = ((await res.json()) as { id: string }).id;
});

test.afterAll(async ({ request }) => {
  const list = (await (await request.get('/api/feedback')).json()) as { items: { id: string; message: string }[] };
  for (const i of list.items) if (i.message.includes(tag)) await request.delete(`/api/feedback/${i.id}`, { headers: API });
  if (personId) await request.delete(`/api/access/people/${personId}`, { headers: API });
});

async function memberPage(browser: Browser, baseURL: string | undefined): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ baseURL, locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: 390, height: 780 }, extraHTTPHeaders: memberHeaders });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByTestId('tasks')).toBeVisible();
  return { page, close: () => ctx.close() };
}

const feedbackDialog = (page: Page) => page.getByRole('dialog', { name: 'Feedback', exact: true });

test('Mitglied sendet einen Fehler mit Text und Bild: Zähler, Grenze 1000, Bild mit Vorschau, Danke', async ({ browser, baseURL, request }) => {
  const { page, close } = await memberPage(browser, baseURL);

  // Einstieg: Einstellungen, ganz oben
  await openSettingsPage(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Feedback & Ideen' }).click();

  // Schritt 1: Art wählen, fünf Kacheln
  const sheet = feedbackDialog(page);
  await expect(sheet.getByText('Was möchtest du uns sagen?')).toBeVisible();
  for (const k of ['bug', 'idea', 'praise', 'criticism', 'other']) await expect(sheet.getByTestId(`feedback-kind-${k}`)).toBeVisible();
  await expect(sheet.getByText('nur auf dieser Stups-Installation gespeichert')).toBeVisible();
  await sheet.getByTestId('feedback-kind-bug').click();

  // Schritt 2: Text ist Pflicht (Senden gesperrt), Platzhalter nach Art, Zähler
  const dlg = feedbackDialog(page);
  const text = dlg.getByTestId('feedback-text');
  await expect(text).toHaveAttribute('placeholder', 'Was ist passiert? Was hast du erwartet?');
  await expect(dlg.getByRole('button', { name: 'Senden' })).toBeDisabled();
  await expect(dlg.getByTestId('feedback-count')).toHaveText('0 / 1000');
  await text.fill(TEXT);
  await expect(dlg.getByTestId('feedback-count')).toHaveText(`${TEXT.length} / 1000`);
  await expect(dlg.getByTestId('feedback-count')).toHaveAttribute('data-tone', 'ok');

  // Grenze: mehr als 1000 Zeichen werden nicht angenommen, der Zähler warnt vorher
  await text.fill('x'.repeat(950));
  await expect(dlg.getByTestId('feedback-count')).toHaveAttribute('data-tone', 'warn');
  await text.fill('y'.repeat(1200));
  await expect(dlg.getByTestId('feedback-count')).toHaveText('1000 / 1000');
  await expect(dlg.getByTestId('feedback-count')).toHaveAttribute('data-tone', 'full');
  expect(await text.inputValue()).toHaveLength(1000);
  await text.fill(TEXT);

  // Bild: Vorschau, Entfernen, wieder anhängen
  await dlg.getByTestId('feedback-file').setInputFiles({ name: 'screen.png', mimeType: 'image/png', buffer: picture() });
  const preview = dlg.getByTestId('feedback-image');
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('img', { name: 'Vorschau des Bildes' })).toBeVisible();
  await preview.getByRole('button', { name: 'Bild entfernen' }).click();
  await expect(preview).toHaveCount(0);
  await dlg.getByTestId('feedback-file').setInputFiles({ name: 'screen.png', mimeType: 'image/png', buffer: picture() });
  await expect(dlg.getByTestId('feedback-image')).toBeVisible();

  await dlg.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByRole('status').getByText(/Danke/)).toBeVisible();
  await expect(feedbackDialog(page)).toHaveCount(0);
  // Das Feedback liegt über den Einstellungen und schließt dorthin zurück
  await expect(page.getByRole('dialog', { name: 'Einstellungen', exact: true })).toBeVisible();

  // Der Server hat Art, Text, Bild und die mitgesendeten Angaben
  const list = (await (await request.get('/api/feedback')).json()) as { items: { kind: string; message: string; hasImage: boolean; personName: string; status: string; meta: Record<string, any> }[] };
  const mine = list.items.find((i) => i.message === TEXT)!;
  expect(mine).toMatchObject({ kind: 'bug', hasImage: true, personName: MEMBER, status: 'neu' });
  expect(mine.meta).toMatchObject({ view: 'tasks', language: 'de', embedded: false });
  expect(mine.meta.viewport.w).toBeGreaterThan(300);
  expect(['dark', 'light']).toContain(mine.meta.scheme);
  expect(mine.meta.userAgent).toBeTruthy();
  expect(JSON.stringify(mine.meta)).not.toMatch(new RegExp(`ha-fb-${tag}`));
  await close();
});

test('Mitglied findet das Feedback auch am Ende der Aufgaben und sieht die Liste der Rückmeldungen nicht', async ({ browser, baseURL }) => {
  const { page, close } = await memberPage(browser, baseURL);
  const link = page.getByTestId('feedback-link');
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeVisible();
  await link.click();
  await expect(feedbackDialog(page).getByText('Was möchtest du uns sagen?')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(feedbackDialog(page)).toHaveCount(0);

  await openSettingsPage(page);
  const d = page.getByRole('dialog');
  await expect(d.getByRole('button', { name: 'Feedback & Ideen' })).toBeVisible();
  await expect(d.getByRole('button', { name: 'Feedback der Nutzer' })).toHaveCount(0);
  // auch der Server verweigert die Liste
  expect((await page.request.get('/api/feedback')).status()).toBe(403);
  expect((await page.request.get('/api/feedback/summary')).status()).toBe(403);
  await close();
});

test('Der Text bleibt beim Schließen erhalten, bis er gesendet ist', async ({ browser, baseURL }) => {
  const { page, close } = await memberPage(browser, baseURL);
  await page.getByTestId('feedback-link').click();
  await page.getByTestId('feedback-kind-idea').click();
  await page.getByTestId('feedback-text').fill(`Halber Gedanke ${tag}`);
  await feedbackDialog(page).getByRole('button', { name: 'Schließen' }).click();
  await expect(feedbackDialog(page)).toHaveCount(0);
  await page.getByTestId('feedback-link').click();
  await expect(page.getByTestId('feedback-text')).toHaveValue(`Halber Gedanke ${tag}`);
  await close();
});

test('Administrator: Liste in den Einstellungen mit Bild, Stand umschalten, Als Text kopieren, löschen', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.goto('/');
  await openSettingsPage(page);
  await page.getByRole('dialog').getByRole('button', { name: /^Feedback der Nutzer/ }).click();
  const d = page.getByRole('dialog', { name: 'Feedback der Nutzer' });
  const item = d.getByTestId('feedback-item').filter({ hasText: TEXT });
  await expect(item).toBeVisible();
  await expect(item).toContainText('Fehler melden');
  await expect(item).toContainText(MEMBER);
  await expect(item).toHaveAttribute('data-status', 'neu');
  await expect(item.getByTestId('feedback-message')).toHaveText(TEXT);

  // Bild in der Bildansicht
  await item.getByRole('button', { name: 'Bild ansehen' }).click();
  const viewer = page.getByRole('dialog', { name: /^feedback-/ });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('img')).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Entfernen' })).toHaveCount(0); // gehört nicht zu einer Karte
  await viewer.getByRole('button', { name: 'Schließen' }).first().click();
  await expect(viewer).toHaveCount(0);

  // Stand umschalten
  await item.getByRole('radio', { name: 'Gelesen' }).click();
  await expect(item).toHaveAttribute('data-status', 'gelesen');
  await item.getByRole('radio', { name: 'Erledigt' }).click();
  await expect(item).toHaveAttribute('data-status', 'erledigt');
  await d.getByRole('group', { name: 'Stand' }).getByRole('button', { name: /^Erledigt/ }).click();
  await expect(item).toBeVisible();
  await d.getByRole('group', { name: 'Stand' }).getByRole('button', { name: /^Neu/ }).click();
  await expect(item).toHaveCount(0);
  await d.getByRole('group', { name: 'Stand' }).getByRole('button', { name: /^Alle/ }).click();

  // Als Text kopieren: in die Zwischenablage, oder (wo der Browser sie sperrt) als Text zum Markieren
  await item.getByRole('button', { name: 'Als Text kopieren' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '');
  if (copied) {
    expect(copied).toContain(TEXT);
    expect(copied).toContain('Fehler melden');
    expect(copied).toContain(MEMBER);
  } else {
    // WebKit erlaubt das Lesen der Zwischenablage nicht: dann zählt die Meldung „Text kopiert“ oder (Schreiben gesperrt) der Text zum Markieren
    await expect(page.getByRole('status').getByText('Text kopiert').or(item.getByRole('textbox', { name: 'Text zum Kopieren' }))).toBeVisible();
  }

  // Löschen fragt nach
  await item.getByRole('button', { name: 'Löschen' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('Feedback löschen?');
  await confirm.getByRole('button', { name: 'Abbrechen' }).first().click();
  await expect(item).toBeVisible();
  await item.getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(item).toHaveCount(0);
});
