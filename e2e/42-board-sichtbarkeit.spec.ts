import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { newTaskSheet, openBoards } from './helpers';

// Sichtbarkeit von Boards mit zwei Personen: Rene (Administrator, der Test-Server meldet jeden als Rene an) und Conny (über die Header des
// Ingress-Proxys). Ein privates Board sieht nur sein Besitzer, auch nicht der Administrator Conny gegenüber; alles Angelegte wird am Ende entfernt.
test.describe.configure({ mode: 'serial', timeout: 90_000 });

const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const connyHeaders = { 'x-remote-user-id': 'ha-conny-e2e', 'x-remote-user-name': 'conny', 'x-remote-user-display-name': 'Conny', 'x-stups-language': 'de' };

const created: string[] = [];
async function board(request: APIRequestContext, name: string, extra: Record<string, unknown> = {}) {
  const res = await request.post('/api/boards', { data: { name, ...extra } });
  expect(res.status()).toBe(201);
  const b = (await res.json()) as { id: string };
  created.push(b.id);
  return b.id;
}
async function conny(browser: Browser, baseURL: string) {
  const ctx = await browser.newContext({ baseURL, locale: 'de-DE', extraHTTPHeaders: connyHeaders });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByTestId('bell')).toBeVisible();
  return { ctx, page };
}
const names = async (ctx: { request: APIRequestContext }) => ((await (await ctx.request.get('/api/boards')).json()) as { name: string }[]).map((b) => b.name);

test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/boards/${id}`);
});

test('ein privates Board sieht nur sein Besitzer: Liste, Direktaufruf und Karten bei Conny nicht', async ({ browser, request }, info) => {
  const secret = `Geheim ${tag}`;
  const open = `Offen ${tag}`;
  const privateId = await board(request, secret, { visibility: 'private' });
  await board(request, open);
  const cols = ((await (await request.get(`/api/boards/${privateId}`)).json()) as { columns: { id: string }[] }).columns;
  const card = (await (await request.post(`/api/boards/${privateId}/cards`, { data: { title: `Plan ${tag}`, columnId: cols[0]!.id } })).json()) as { id: string };

  const c = await conny(browser, String(info.project.use.baseURL));
  try {
    // Server: Liste ohne das private Board, Direktaufrufe 404
    const list = await names(c.ctx);
    expect(list).toContain(open);
    expect(list).not.toContain(secret);
    expect((await c.ctx.request.get(`/api/boards/${privateId}`)).status()).toBe(404);
    expect((await c.ctx.request.get(`/api/cards/${card.id}`)).status()).toBe(404);
    expect(await names({ request })).toContain(secret);

    // Oberfläche: „Board wechseln" zeigt es bei Conny nicht, bei Rene schon
    await openBoards(c.page);
    await c.page.getByRole('button', { name: 'Board wechseln' }).click();
    await expect(c.page.getByRole('dialog').getByText(open)).toBeVisible();
    await expect(c.page.getByRole('dialog').getByText(secret)).toHaveCount(0);
    await c.page.keyboard.press('Escape');
  } finally {
    await c.ctx.close();
  }
});

test('Board anlegen: drei Auswahlkarten; bei „Nur ich" ist der Schalter grau, aus und gesperrt, danach wieder bedienbar', async ({ page, request }) => {
  const name = `Neu ${tag}`;
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('button', { name: 'Neues Board erstellen' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByTestId('visibility-picker')).toBeVisible();
  for (const label of ['🔒 Nur ich', '🏠 Alle in Stups', '👥 Ausgewählte Personen']) await expect(sheet.getByRole('radio', { name: new RegExp(label.slice(3)) })).toBeVisible();
  const fairness = sheet.getByRole('switch', { name: 'Zählt zur Fairness der Woche' });
  await expect(fairness).toBeEnabled();
  await expect(fairness).toHaveAttribute('aria-checked', 'true');

  await sheet.getByTestId('visibility-private').click();
  await expect(fairness).toBeDisabled();
  await expect(fairness).toHaveAttribute('aria-checked', 'false');
  await expect(sheet.getByText('Private Boards zählen nie mit.')).toHaveCount(1);
  // zurück zu „Alle": bedienbar, Wert von vorher (an)
  await sheet.getByTestId('visibility-all').click();
  await expect(fairness).toBeEnabled();
  await expect(fairness).toHaveAttribute('aria-checked', 'true');

  // wirklich anlegen: „Nur ich"
  await sheet.getByTestId('visibility-private').click();
  await sheet.getByLabel('Name des neuen Boards').fill(name);
  await sheet.getByRole('button', { name: 'Board anlegen' }).click();
  await expect.poll(async () => (await names({ request })).includes(name)).toBe(true);
  const mine = ((await (await request.get('/api/boards')).json()) as { id: string; name: string; visibility: string; ownerId: string | null }[]).find((b) => b.name === name)!;
  created.push(mine.id);
  expect(mine.visibility).toBe('private');
  expect(mine.ownerId).not.toBeNull();
});

test('später ändern: auf „Alle" stellen macht das Board für Conny sichtbar, zurück auf „Nur ich" fragt nach und verbirgt es wieder', async ({ browser, page, request }, info) => {
  const name = `Wechsel ${tag}`;
  const id = await board(request, name, { visibility: 'private' });
  const c = await conny(browser, String(info.project.use.baseURL));
  try {
    expect(await names(c.ctx)).not.toContain(name);
    await page.goto('/');
    await openBoards(page);
    await page.evaluate((b) => localStorage.setItem('stups.board', b), id);
    await page.reload();
    await openBoards(page);
    await page.getByRole('button', { name: 'Board wechseln' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Board-Einstellungen' }).click();
    const settings = page.getByRole('dialog', { name: 'Board-Einstellungen' });
    await settings.getByTestId('visibility-all').click();
    await expect.poll(async () => (await names(c.ctx)).includes(name)).toBe(true);

    // zurück auf „Nur ich": erst die Bestätigung („Zuständigkeiten anderer werden entfernt"), erst danach ist es für Conny weg
    await settings.getByTestId('visibility-private').click();
    const dialog = page.getByTestId('board-access-dialog');
    await expect(dialog).toBeVisible();
    expect(await names(c.ctx)).toContain(name);
    await dialog.getByTestId('access-confirm').click();
    await expect.poll(async () => (await names(c.ctx)).includes(name)).toBe(false);
  } finally {
    await c.ctx.close();
  }
});

test('Fairness: ein Board, das nicht zählt, nimmt seine erledigten Karten rückwirkend heraus', async ({ request }) => {
  const id = await board(request, `Fair ${tag}`);
  const cols = ((await (await request.get(`/api/boards/${id}`)).json()) as { columns: { id: string }[] }).columns;
  const card = (await (await request.post(`/api/boards/${id}/cards`, { data: { title: `Zählt ${tag}`, columnId: cols[0]!.id } })).json()) as { id: string };
  await request.post(`/api/cards/${card.id}/complete`);
  const done = async () => ((await (await request.get('/api/fairness?period=week')).json()) as { total: { done: number } }).total.done;
  const before = await done();
  expect((await request.patch(`/api/boards/${id}`, { data: { countsForFairness: false } })).status()).toBe(200);
  expect(await done()).toBe(before - 1);
  expect((await request.patch(`/api/boards/${id}`, { data: { countsForFairness: true } })).status()).toBe(200);
  expect(await done()).toBe(before);
});

async function dateRowArrow(page: Page) {
  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
}

test('Neue Aufgabe: ein Tipp auf den Pfeil der Zeile „Termin" öffnet die Terminwahl wie die Zeile selbst', async ({ page }) => {
  await page.goto('/');
  await openBoards(page);
  await dateRowArrow(page);
  const sheet = newTaskSheet(page);
  await expect(sheet).toBeVisible();
  // das Blatt gleitet ein und wächst noch, wenn Daten nachladen: erst klicken, wenn es vier Messungen lang (je 100 ms) an derselben Stelle steht,
  // sonst trifft der Klick auf einem langsamen Rechner daneben und schließt das Blatt
  let last = '';
  let same = 0;
  for (let i = 0; i < 50 && same < 4; i += 1) {
    const box = JSON.stringify(await sheet.boundingBox());
    same = box === last ? same + 1 : 0;
    last = box;
    await page.waitForTimeout(100);
  }
  // der Pfeil rechts in der Zeile „Termin": ein Tipp darauf macht dasselbe wie ein Tipp auf die Zeile
  const row = sheet.locator('div.rounded-row', { has: page.getByRole('button', { name: /^Termin wählen/ }) }).first();
  await row.locator('[data-icon="chevron-right"]').click();
  await expect(page.getByRole('listbox', { name: 'Stunde' })).toBeVisible();
});
