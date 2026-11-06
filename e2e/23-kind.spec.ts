import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { openBoards } from './helpers';

// Rolle „Kind": reduzierte Oberfläche und die Bestätigung bis zum Ende (Kind hakt ab, Elternteil bestätigt oder sagt „Nochmal").
// Der Test-Server meldet jeden als „rene" (Administrator) an; das Kind kommt über die Kopfzeilen von Home Assistant.
test.describe.configure({ mode: 'serial' });

const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const tag = unique();
const KID = `Kind${tag}`;
const kidHeaders = { 'x-remote-user-id': `ha-kid-${tag}`, 'x-remote-user-name': `kid${tag}`, 'x-remote-user-display-name': KID, 'x-stups-language': 'de' };

let kidId = '';
let mineName = '';
let mineId = '';
let otherName = '';
const boardIds: string[] = [];
const cardIds: Record<string, string> = {};

async function board(request: APIRequestContext, name: string) {
  const b = (await (await request.post('/api/boards', { data: { name } })).json()) as { id: string };
  boardIds.push(b.id);
  const view = (await (await request.get(`/api/boards/${b.id}`)).json()) as { columns: { id: string }[] };
  return { id: b.id, columnId: view.columns[0]!.id };
}

async function card(request: APIRequestContext, b: { id: string; columnId: string }, title: string, assigneeIds: string[]) {
  const res = await request.post(`/api/boards/${b.id}/cards`, { data: { title, columnId: b.columnId, assigneeIds } });
  expect(res.status(), await res.text()).toBe(201);
  const id = ((await res.json()) as { id: string }).id;
  cardIds[title] = id;
  return id;
}

const state = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/cards/${id}`)).json()) as { completedAt: string | null; confirmRequestedAt: string | null; history: { completedBy: string | null }[] };

test.beforeAll(async ({ request }) => {
  const person = (await (await request.post('/api/access/people', { data: { name: KID, haUserId: `ha-kid-${tag}` } })).json()) as { id: string };
  kidId = person.id;
  const set = await request.patch(`/api/access/people/${kidId}`, { data: { isChild: true, childScope: 'assigned', confirmDefault: true, confirmers: [], quietOff: true } });
  expect(set.status(), await set.text()).toBe(200);

  mineName = `Zimmer ${tag}`;
  otherName = `Nur Erwachsene ${tag}`;
  const mine = await board(request, `Kinderboard ${tag}`);
  mineId = await card(request, mine, mineName, [kidId]);
  await card(request, mine, `Noch eine ${tag}`, [kidId]);
  const other = await board(request, `Erwachsenenboard ${tag}`);
  await card(request, other, otherName, []);
});

test.afterAll(async ({ request }) => {
  for (const id of boardIds) await request.delete(`/api/boards/${id}`);
  if (kidId) await request.delete(`/api/access/people/${kidId}`);
});

async function kidPage(browser: Browser, baseURL: string | undefined): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ baseURL, locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: 390, height: 780 }, extraHTTPHeaders: kidHeaders });
  const page = await ctx.newPage();
  await page.goto('/');
  await openBoards(page);
  return { page, close: () => ctx.close() };
}

async function openCard(page: Page, title: string) {
  await page.getByRole('button', { name: new RegExp(`^${title}`) }).first().click();
  return page.getByRole('dialog');
}

test('Einrichtung: der Administrator macht eine Person zum Kind, ein Administrator kann es nicht sein', async ({ page, request }) => {
  const people = (await (await request.get('/api/access')).json()) as { people: { id: string; displayName: string; isAdmin: boolean }[] };
  const rene = people.people.find((p) => p.isAdmin)!;
  const res = await request.patch(`/api/access/people/${rene.id}`, { data: { isChild: true } });
  expect(res.status()).toBe(409);

  await page.goto('/');

  await openBoards(page);
  await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Personen & Zugriff' }).click();
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(KID) }).click();
  const setup = page.getByTestId('child-setup');
  await setup.scrollIntoViewIfNeeded();
  await expect(setup.getByLabel(`Kind: ${KID}`)).toBeChecked();
  await expect(setup.getByLabel(`Welche Boards ${KID} sieht`)).toHaveValue('assigned');
  await expect(setup.getByLabel(`Bestätigung als Vorgabe für ${KID}`)).toBeChecked();
});

test('reduzierte Oberfläche: nur eigene Boards, kein Plus, keine Verwaltung, keine Fairness', async ({ browser, baseURL }) => {
  const kid = await kidPage(browser, baseURL);
  try {
    const page = kid.page;
    await expect(page.getByRole('button', { name: mineName }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Neue Karte' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Menü für/ })).toHaveCount(0);

    // Board-Wechsler: nur das eigene Board, nichts zum Anlegen oder Verwalten
    await page.getByRole('button', { name: 'Board wechseln' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText(`Kinderboard ${tag}`)).toBeVisible();
    await expect(sheet.getByText(`Erwachsenenboard ${tag}`)).toHaveCount(0);
    // ein Kind legt Boards an, aber nur „Nur ich“ (die anderen beiden Karten fehlen)
    await expect(sheet.getByLabel('Name des neuen Boards')).toHaveCount(1);
    await expect(sheet.getByRole('radio', { name: /Nur ich/ })).toBeVisible();
    await expect(sheet.getByRole('radio', { name: /Alle in Stups/ })).toHaveCount(0);
    await expect(sheet.getByRole('radio', { name: /Ausgewählte Personen/ })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Bearbeiten' })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Papierkorb' })).toHaveCount(0);

    // Einstellungen: nur Sprache und Farbe
    await sheet.getByRole('button', { name: 'Einstellungen', exact: true }).click();
    const settings = page.getByRole('dialog');
    await expect(settings.getByRole('button', { name: 'Sprache und Farbe' })).toBeVisible();
    await expect(settings.getByRole('button', { name: 'Personen & Zugriff' })).toHaveCount(0);
    await expect(settings.getByText('Benachrichtigungen')).toHaveCount(0);
    await settings.getByRole('button', { name: 'Sprache und Farbe' }).click();
    await expect(settings.getByTestId('accent-wheel')).toBeVisible();
    await page.keyboard.press('Escape');

    // Zwei Reiter (Aufgaben, Boards, kein Wächter); in Aufgaben kein „Wer"-Filter, kein „Vom Haus", keine Zeilen „Bei den anderen" und Fairness
    const nav = page.getByRole('navigation', { name: 'Ansicht' });
    await expect(nav.getByRole('button')).toHaveText(['Aufgaben', 'Boards']);
    await expect(nav.getByRole('button', { name: 'Wächter' })).toHaveCount(0);
    await nav.getByRole('button', { name: 'Aufgaben' }).click();
    await expect(page.getByTestId('tasks-sub')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Personen' })).toHaveCount(0);
    await expect(page.getByTestId('today-house')).toHaveCount(0);
    await expect(page.getByText('Bei den anderen')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Fairness/ })).toHaveCount(0);
  } finally {
    await kid.close();
  }
});

test('der Server verweigert, was die Oberfläche nicht zeigt', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, extraHTTPHeaders: kidHeaders });
  try {
    const api = ctx.request;
    expect((await api.get('/api/fairness')).status()).toBe(403);
    // Wächter-Editor: Verlauf der Entität und Reihenfolge für „An wen“ bleiben für Kinder verboten
    expect((await api.get('/api/watchers/history?entityId=sensor.waschmaschine_leistung')).status()).toBe(403);
    expect((await api.get('/api/watchers/order?mode=rotation')).status()).toBe(403);
    expect((await api.post('/api/boards', { data: { name: 'Nein' } })).status()).toBe(403);
    expect((await api.delete(`/api/cards/${mineId}`)).status()).toBe(403);
    expect((await api.get(`/api/cards/${cardIds[otherName]}`)).status()).toBe(404); // fremdes Board: gibt es nicht
  } finally {
    await ctx.close();
  }
});

test('Kind hakt ab: die Karte wartet auf Bestätigung, ein Elternteil bestätigt, sie zählt auf das Kind', async ({ browser, baseURL, page, request }) => {
  const kid = await kidPage(browser, baseURL);
  try {
    const kp = kid.page;
    await kp.getByRole('checkbox', { name: `„${mineName}“ erledigen` }).click();
    await expect(kp.getByText('Gemeldet: wartet auf Bestätigung')).toBeVisible();
    const waiting = kp.getByTestId('card-waiting');
    await expect(waiting).toHaveCount(1);
    await expect(kp.getByRole('checkbox', { name: 'Wartet auf Bestätigung' }).first()).toBeDisabled();
    expect((await state(request, mineId)).completedAt).toBeNull();
    expect((await state(request, mineId)).confirmRequestedAt).not.toBeNull();

    // Das Kind sieht in der Karte keine Antwort-Knöpfe
    const kd = await openCard(kp, mineName);
    await expect(kd.getByTestId('confirm-note')).toContainText('wartet auf Bestätigung');
    await expect(kd.getByRole('button', { name: 'Bestätigen' })).toHaveCount(0);
    await expect(kd.getByRole('button', { name: 'Karte löschen' })).toHaveCount(0);
    await expect(kd.getByLabel('Titel')).toHaveJSProperty('readOnly', true);
    await kp.keyboard.press('Escape');

    // Der Erwachsene bestätigt
    await page.addInitScript((id) => localStorage.setItem('stups.board', id), boardIds[0]!);
    await page.goto('/');
    await openBoards(page);
    const pd = await openCard(page, mineName);
    await expect(pd.getByTestId('confirm-note')).toContainText(`${KID} wartet auf Bestätigung`);
    await pd.getByRole('button', { name: 'Bestätigen' }).click();
    await expect.poll(async () => (await state(request, mineId)).completedAt).not.toBeNull();
    const done = await state(request, mineId);
    expect(done.confirmRequestedAt).toBeNull();
    expect(done.history[0]!.completedBy).toBe(kidId);
  } finally {
    await kid.close();
  }
});

test('„Nochmal": die Anfrage entfällt, die Karte bleibt offen und das Kind kann es erneut versuchen', async ({ browser, baseURL, page, request }) => {
  const title = `Noch eine ${tag}`;
  const id = cardIds[title]!;
  const kid = await kidPage(browser, baseURL);
  try {
    await kid.page.getByRole('checkbox', { name: `„${title}“ erledigen` }).click();
    await expect(kid.page.getByTestId('card-waiting')).toHaveCount(1);

    await page.addInitScript((boardId) => localStorage.setItem('stups.board', boardId), boardIds[0]!);
    await page.goto('/');
    await openBoards(page);
    const pd = await openCard(page, title);
    await pd.getByRole('button', { name: 'Nochmal' }).click();
    await expect.poll(async () => (await state(request, id)).confirmRequestedAt).toBeNull();
    expect((await state(request, id)).completedAt).toBeNull();

    // Das Kind sieht es nach dem Laden wieder als offen und kann erneut abhaken
    await kid.page.reload();
    await openBoards(kid.page);
    await expect(kid.page.getByTestId('card-waiting')).toHaveCount(0);
    await kid.page.getByRole('checkbox', { name: `„${title}“ erledigen` }).click();
    await expect(kid.page.getByTestId('card-waiting')).toHaveCount(1);
  } finally {
    await kid.close();
  }
});

test('Kind: Filter ohne „Wer" und ohne „nur von Wächtern", mit Wann, Priorität und Sortierung; nur eigene Karten', async ({ browser, baseURL }) => {
  const kd = await kidPage(browser, baseURL);
  try {
    await kd.page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Aufgaben' }).click();
    await expect(kd.page.getByRole('group', { name: 'Personen' })).toHaveCount(0);
    await kd.page.getByRole('button', { name: /^Filter(, \d+ aktiv)?$/ }).click();
    const sheet = kd.page.getByTestId('filter-sheet');
    await expect(sheet.getByRole('group', { name: 'Wann' })).toBeVisible();
    await expect(sheet.getByRole('radiogroup', { name: 'Priorität' })).toBeVisible();
    await expect(sheet.getByRole('radiogroup', { name: 'Sortierung' })).toBeVisible();
    await expect(sheet.getByRole('group', { name: 'Personen' })).toHaveCount(0);
    await expect(sheet.getByRole('switch', { name: 'Nur von Wächtern' })).toHaveCount(0);
    await expect(sheet.getByRole('switch', { name: 'Nur mit offenem Stups' })).toHaveCount(0);
    await expect(sheet.getByRole('switch', { name: 'Erledigte anzeigen' })).toBeVisible();
    // „Ohne Termin" zeigt die eigenen Karten ohne Termin, nie die Karte aus dem Erwachsenenboard
    await sheet.getByRole('group', { name: 'Wann' }).getByRole('button', { name: /^Ohne Termin/ }).click();
    await kd.page.getByRole('dialog').getByRole('button', { name: /Aufgaben? anzeigen$/ }).click();
    await expect(kd.page.getByTestId('group-undated').getByText(`Noch eine ${tag}`)).toBeVisible();
    await expect(kd.page.getByText(otherName)).toHaveCount(0);
  } finally {
    await kd.close();
  }
});

test('Kind sieht die Symbole seiner Karten (Kachel in der Liste und im Karten-Fenster), ändern kann es sie nicht', async ({ browser, baseURL, request }) => {
  const b = await board(request, `Symbolboard ${tag}`);
  const title = `Pflanzen gießen ${tag}`;
  const res = await request.post(`/api/boards/${b.id}/cards`, { data: { title, columnId: b.columnId, assigneeIds: [kidId], dueAt: new Date(Date.now() + 3_600_000).toISOString(), icon: 'leaf', iconColor: 'green', iconSource: 'manual' } });
  expect(res.status()).toBe(201);
  const kd = await kidPage(browser, baseURL);
  try {
    // „Aufgaben" zeigt dem Kind alle eigenen Karten, auch die aus dem Board, das gerade nicht gewählt ist
    await kd.page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Aufgaben' }).click();
    const row = kd.page.locator('[data-variant=task]').filter({ hasText: title });
    await expect(row.locator('.tile-green')).toHaveCount(1);
    await row.getByRole('button', { name: new RegExp(`^${title}`) }).click();
    const dialog = kd.page.getByRole('dialog');
    await expect(dialog.locator('.tile-green')).toHaveCount(1);
    await expect(dialog.getByTestId('symbol-tile')).toHaveCount(0); // keine Schaltfläche zum Ändern
    // der Server verbietet es ebenfalls
    const cardId = ((await res.json()) as { id: string }).id;
    const patch = await kd.page.request.patch(`/api/cards/${cardId}`, { data: { icon: 'dog' } });
    expect(patch.status()).toBe(403);
  } finally {
    await kd.close();
  }
});
