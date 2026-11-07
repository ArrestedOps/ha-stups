import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { openBoards } from './helpers';

// Der Test-Server meldet jeden als „rene" an (DEV_USER). Rene ist eine Person und gilt ohne Home Assistant
// als Administrator. Ein zweiter Benutzer kommt über die Header, die sonst der Ingress-Proxy setzt.
const fremdHeaders = {
  'x-remote-user-id': 'ha-fremd-e2e',
  'x-remote-user-name': 'fremd',
  'x-remote-user-display-name': 'Fremd',
};

// Nach den Board-Tests liegt ein großes Board im Hintergrund (300 Karten), das Öffnen der Fenster dauert dann länger
test.describe.configure({ timeout: 90_000 });

async function openPeople(page: Page) {
  await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Personen & Zugriff/ }).click();
  await expect(page.getByRole('radiogroup', { name: 'Zugriff' })).toBeVisible();
}

const mode = (page: Page, name: string) => page.getByRole('radio', { name });

// Ein eigenes, leeres Board: Das große Board des Performance-Tests würde jedes Öffnen in diesem Test verlangsamen
const TEST_BOARD = 'Personen-Test';
async function emptyBoardId(request: APIRequestContext): Promise<string> {
  const boards = (await (await request.get('/api/boards')).json()) as { id: string; name: string }[];
  const found = boards.find((b) => b.name === TEST_BOARD);
  if (found) return found.id;
  return (await (await request.post('/api/boards', { data: { name: TEST_BOARD } })).json()).id as string;
}

async function fremdPage(browser: Browser, baseURL: string, boardId: string) {
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: fremdHeaders });
  await context.addInitScript((id) => localStorage.setItem('stups.board', id), boardId);
  return context.newPage();
}

let boardId = '';
let fremdRef: Page | undefined; // die Seite des zweiten Benutzers, wird in afterEach aufgeräumt

test.beforeEach(async ({ page, request }) => {
  boardId = await emptyBoardId(request);
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), boardId);
  await page.goto('/');
  await openBoards(page);
  await expect(page.getByRole('tablist', { name: 'Spalten' })).toBeVisible();
});

// Läuft auch, wenn ein Test in die Zeitgrenze läuft: Der Zugriffsmodus und die Testperson dürfen den nächsten Test nicht stören
test.afterEach(async ({ request }, testInfo) => {
  if (fremdRef) {
    if (testInfo.status !== testInfo.expectedStatus) {
      // Zeigt, was der zweite Benutzer beim Fehlschlag sah
      const text = await fremdRef.evaluate(() => document.body.innerText).catch(() => '(nicht lesbar)');
      await testInfo.attach('seite-des-zweiten-benutzers', { body: text, contentType: 'text/plain' });
      console.log('Seite des zweiten Benutzers:\n' + text);
    }
    await fremdRef.context().close().catch(() => undefined);
    fremdRef = undefined;
  }
  const opts = { timeout: 20_000 };
  await request.put('/api/access/mode', { data: { mode: 'everyone' }, ...opts });
  const info = await (await request.get('/api/access', opts)).json();
  for (const person of info.people as { id: string; displayName: string }[]) {
    if (person.displayName === 'Fremd' || /^Gast/.test(person.displayName)) await request.delete(`/api/access/people/${person.id}`, opts);
  }
});
test('Personen & Zugriff: Liste, Modus wechseln und zurück', async ({ page }) => {
  await openPeople(page);
  await expect(page.getByText('Rene', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Conny').first()).toBeVisible();
  await expect(mode(page, 'Alle in Home Assistant')).toHaveAttribute('aria-checked', 'true');

  await mode(page, 'Nur diese Personen').click();
  await expect(mode(page, 'Nur diese Personen')).toHaveAttribute('aria-checked', 'true');
  await mode(page, 'Alle in Home Assistant').click();
  await expect(mode(page, 'Alle in Home Assistant')).toHaveAttribute('aria-checked', 'true');
});

test('Person hinzufügen, Push-Geräte-Hinweis, umbenennen und mit Bestätigung entfernen', async ({ page }) => {
  const name = `Gast${Date.now().toString(36)}`;
  await openPeople(page);

  await page.getByLabel('Name der neuen Person').fill(name);
  await page.getByRole('button', { name: 'Hinzufügen' }).last().click();
  const row = page.getByRole('dialog').getByRole('button', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Kein Push-Gerät');

  await row.click();
  const neu = `${name}-neu`;
  await page.getByLabel(`Anzeigename von ${name}`).fill(neu);
  await page.getByLabel(`Anzeigename von ${name}`).blur();
  await expect(page.getByRole('dialog').getByRole('button', { name: new RegExp(neu) })).toBeVisible();

  // die Zeile ist nach dem Umbenennen noch offen
  await page.getByRole('button', { name: 'Aus Stups entfernen' }).click();
  await expect(page.getByText('Zugewiesene Karten behalten die Zuweisung')).toBeVisible();
  await page.getByRole('button', { name: 'Ja, entfernen' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: new RegExp(neu) })).toHaveCount(0);
});

test('Nur freigegebene: Fremder sieht „Kein Zugriff", der Administrator gibt ihn frei', async ({ page, browser }, info) => {
  test.setTimeout(60_000); // mehrere Seiten und Anmeldungen: im vollen Lauf reichen 30 Sekunden auf einem ausgelasteten Rechner nicht
  const baseURL = String(info.project.use.baseURL);
  await openPeople(page);
  await mode(page, 'Nur diese Personen').click();
  await expect(mode(page, 'Nur diese Personen')).toHaveAttribute('aria-checked', 'true');

  const fremd = await fremdPage(browser, baseURL, boardId);
  fremdRef = fremd;
  try {
    await fremd.goto('/');
    await expect(fremd.getByTestId('no-access')).toContainText('Noch kein Zugriff');
    await expect(fremd.getByTestId('no-access')).toContainText('Fremd');
    await expect(fremd.getByRole('tablist', { name: 'Spalten' })).toHaveCount(0);

    // Der Administrator sieht den Wartenden und gibt ihn frei
    await page.reload();
    await openBoards(page);
    await openPeople(page);
    await expect(page.getByRole('heading', { name: 'Wartet auf Freigabe' })).toBeVisible();
    // Andere Tests lassen entfernte Personen zurück, die als wartend erscheinen: gezielt „Fremd" freigeben, nicht den ersten
    await page.getByTestId(/^pending-/).filter({ hasText: 'Fremd' }).getByRole('button', { name: 'Freigeben' }).click();

    await fremd.reload();
    await openBoards(fremd);
    await expect(fremd.getByRole('tablist', { name: 'Spalten' })).toBeVisible();
    // Als Mitglied sieht er nicht „Haushalt": Personen und Zugriff ändern nur Administratoren (das eigene Dashboard wählt jeder selbst)
    await fremd.getByRole('button', { name: 'Einstellungen öffnen' }).click();
    const dialog = fremd.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Sprache und Farbe' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Personen & Zugriff/ })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Dashboard-Button' })).toHaveCount(0);
    await expect(dialog.getByText('Haushalt', { exact: true })).toHaveCount(0);
  } finally {
    fremdRef = fremd;
  }
});
