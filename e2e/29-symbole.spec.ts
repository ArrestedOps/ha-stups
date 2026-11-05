import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { newTaskSheet, openBoards, openSettingsPage, pickDue } from './helpers';

// Symbol pro Karte (Neues Design, Phase 3): erkennen, ändern, Farbe, Termin-Sheet, „Symbole aus Titeln erkennen“.
// Jeder Test arbeitet auf einem eigenen Board mit eindeutigen Titeln (die Projekte teilen sich den Server).
const unique = (base: string) => `${base} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

async function ownBoard(request: APIRequestContext, page: Page, name: string) {
  const board = (await (await request.post('/api/boards', { data: { name } })).json()) as { id: string };
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), board.id);
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string }[] };
  return { id: board.id, columnId: view.columns[0]!.id };
}

const cardsOf = async (request: APIRequestContext, boardId: string) =>
  ((await (await request.get(`/api/boards/${boardId}`)).json()) as { cards: { id: string; title: string; icon: string | null; iconColor: string | null; iconSource: string | null; dueAt: string | null; columnId: string }[] }).cards;

async function openNew(page: Page) {
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  return page.getByLabel('Was steht an?');
}

test('Symbol wird aus dem Titel erkannt: Funken-Abzeichen, Chip „Symbol: …“, an der Karte gespeichert', async ({ page, request }) => {
  const board = await ownBoard(request, page, unique('Erkennen'));
  const input = await openNew(page);
  // ohne erkannten Teil: Standard „Aufgabe“, kein Funken
  await expect(page.getByTestId('symbol-tile')).toHaveAttribute('aria-label', 'Symbol ändern, gerade: Aufgabe');
  await expect(page.getByTestId('symbol-spark')).toHaveCount(0);

  const title = unique('Müll raus');
  await input.fill(title);
  await expect(page.getByTestId('symbol-spark')).toBeVisible();
  await expect(page.getByTestId('symbol-tile')).toHaveAttribute('aria-label', 'Symbol ändern, gerade: Mülleimer');
  await expect(page.getByTestId('symbol-chip')).toContainText('Symbol: Mülleimer');
  await expect(page.getByTestId('symbol-tile').locator('.tile-orange')).toHaveCount(1);

  await page.getByRole('button', { name: 'Aufgabe anlegen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Karte angelegt' })).toBeVisible();
  const created = (await cardsOf(request, board.id)).find((c) => c.title === title)!;
  expect(created).toMatchObject({ icon: 'trash-can-outline', iconSource: 'auto', iconColor: null });
});

test('Der Chip „Symbol“ lässt sich entfernen: die Karte bekommt dann keins (Standard „Aufgabe“)', async ({ page, request }) => {
  const board = await ownBoard(request, page, unique('Entfernen'));
  const input = await openNew(page);
  const title = unique('Müll raus');
  await input.fill(title);
  await expect(page.getByTestId('symbol-chip')).toBeVisible();
  await page.getByRole('button', { name: 'Symbol entfernen' }).click();
  await expect(page.getByTestId('symbol-chip')).toHaveCount(0);
  await expect(page.getByTestId('symbol-spark')).toHaveCount(0);
  await expect(page.getByTestId('symbol-tile')).toHaveAttribute('aria-label', 'Symbol ändern, gerade: Aufgabe');
  await page.getByRole('button', { name: 'Aufgabe anlegen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Karte angelegt' })).toBeVisible();
  expect((await cardsOf(request, board.id)).find((c) => c.title === title)).toMatchObject({ icon: null, iconSource: null });
});

test('Symbol wählen: Suche findet „Wäsche“ bei der Waschmaschine, Farbe fest, Auswahl wird übernommen', async ({ page, request }) => {
  const board = await ownBoard(request, page, unique('Wählen'));
  const input = await openNew(page);
  const title = unique('Etwas ganz anderes');
  await input.fill(title);
  await page.getByTestId('symbol-tile').click();
  const sheet = page.getByRole('dialog', { name: 'Symbol wählen' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('symbol-name')).toHaveText('Aufgabe');
  // sechs Bereiche, jeder mit Zähler
  for (const name of ['Haushalt', 'Küche und Einkauf', 'Garten und Tiere', 'Familie', 'Technik und Reparatur', 'Unterwegs und Finanzen']) {
    await expect(sheet.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  // Suche: ähnliche Wörter
  await sheet.getByRole('searchbox', { name: 'Symbol suchen' }).fill('Wäsche');
  await expect(sheet.getByRole('heading', { name: 'Treffer' })).toBeVisible();
  await sheet.getByRole('group', { name: 'Treffer' }).getByRole('button', { name: 'Waschmaschine' }).click();
  await expect(sheet.getByTestId('symbol-name')).toHaveText('Waschmaschine');
  await expect(sheet.getByText('Von dir gewählt')).toBeVisible();
  // nichts gefunden
  await sheet.getByRole('searchbox', { name: 'Symbol suchen' }).fill('xyzqwv');
  await expect(sheet.getByRole('status')).toContainText('Nichts gefunden für „xyzqwv“');
  await sheet.getByRole('button', { name: 'Suche leeren' }).click();
  // feste Farbe statt Auto
  const colors = sheet.getByRole('radiogroup', { name: 'Farbe' });
  await expect(colors.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');
  await colors.getByRole('radio', { name: 'Blau' }).click();
  await expect(colors.getByRole('radio', { name: 'Blau' })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('button', { name: 'Symbol übernehmen' }).click();
  await expect(sheet).toHaveCount(0);

  const tile = page.getByTestId('symbol-tile');
  await expect(tile).toHaveAttribute('aria-label', 'Symbol ändern, gerade: Waschmaschine');
  await expect(tile.locator('.tile-blue')).toHaveCount(1);
  await expect(page.getByTestId('symbol-spark')).toHaveCount(0); // von Hand gewählt: kein Funken
  await page.getByRole('button', { name: 'Aufgabe anlegen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Karte angelegt' })).toBeVisible();
  expect((await cardsOf(request, board.id)).find((c) => c.title === title)).toMatchObject({ icon: 'washing-machine', iconColor: 'blue', iconSource: 'manual' });

  // „zuletzt benutzt“ merkt es sich (auf diesem Gerät)
  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  await page.getByTestId('symbol-tile').click();
  await expect(page.getByRole('dialog', { name: 'Symbol wählen' }).getByRole('heading', { name: 'Zuletzt benutzt' })).toBeVisible();
});

test('Symbol per Tastatur: Pfeiltasten im Raster, Eingabe wählt', async ({ page, request }) => {
  await ownBoard(request, page, unique('Tastatur'));
  await openNew(page);
  await page.getByTestId('symbol-tile').click();
  const sheet = page.getByRole('dialog', { name: 'Symbol wählen' });
  const grid = sheet.getByRole('group', { name: 'Haushalt', exact: true });
  const first = grid.getByRole('button').first();
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(grid.getByRole('button').nth(1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(grid.getByRole('button').nth(7)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(grid.getByRole('button').nth(6)).toHaveAttribute('aria-pressed', 'true');
  // Escape schließt nur das Symbol-Fenster, „Neue Aufgabe“ bleibt offen
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(newTaskSheet(page)).toBeVisible();
});

test('Symbol an einer bestehenden Karte ändern, Farbe wechseln; ein erkanntes Symbol folgt dem Titel, ein gewähltes nicht', async ({ page, request }) => {
  const board = await ownBoard(request, page, unique('Ändern'));
  const t1 = unique('Rasen mähen');
  const t2 = unique('Staubsauger leeren');
  const a = (await (await request.post(`/api/boards/${board.id}/cards`, { data: { title: t1, columnId: board.columnId, icon: 'grass', iconSource: 'auto' } })).json()) as { id: string };
  const b = (await (await request.post(`/api/boards/${board.id}/cards`, { data: { title: t2, columnId: board.columnId, icon: 'vacuum-outline' } })).json()) as { id: string };
  await page.goto('/');
  await openBoards(page);
  const row = (title: string) => page.locator('[role=presentation]').filter({ hasText: title });
  // in der Liste: Symbol und Farbe der Karte (Gras: Bereich Garten, grün)
  await expect(row(t1).locator('.tile-green')).toHaveCount(1);
  await expect(row(t2).locator('.tile-orange')).toHaveCount(1);

  // Karte öffnen, Symbol ändern
  await row(t1).getByText(t1).click();
  const dialog = page.getByRole('dialog').first();
  await expect(dialog.getByTestId('symbol-spark')).toBeVisible(); // erkannt
  await dialog.getByTestId('symbol-tile').click();
  const sheet = page.getByRole('dialog', { name: 'Symbol wählen' });
  await sheet.getByRole('searchbox', { name: 'Symbol suchen' }).fill('Auto');
  await sheet.getByRole('group', { name: 'Treffer' }).getByRole('button', { name: 'Auto', exact: true }).click();
  await sheet.getByRole('radiogroup', { name: 'Farbe' }).getByRole('radio', { name: 'Türkis' }).click();
  await sheet.getByRole('button', { name: 'Symbol übernehmen' }).click();
  await expect.poll(async () => ((await (await request.get(`/api/cards/${a.id}`)).json()) as { icon: string; iconColor: string; iconSource: string })).toMatchObject({ icon: 'car-outline', iconColor: 'teal', iconSource: 'manual' });
  await expect(dialog.getByTestId('symbol-spark')).toHaveCount(0);

  // ein gewähltes Symbol bleibt, auch wenn sich der Titel ändert
  const renamed = unique('Wäsche waschen');
  await dialog.getByLabel('Titel').fill(renamed);
  await dialog.getByLabel('Titel').blur();
  await expect.poll(async () => ((await (await request.get(`/api/cards/${a.id}`)).json()) as { title: string }).title).toBe(renamed);
  expect(((await (await request.get(`/api/cards/${a.id}`)).json()) as { icon: string }).icon).toBe('car-outline');
  await dialog.getByRole('button', { name: 'Fertig' }).click();

  // ein erkanntes Symbol folgt dem Titel: wieder auf „auto“ setzen und umbenennen
  await request.patch(`/api/cards/${b.id}`, { data: { icon: 'trash-can-outline', iconSource: 'auto' } });
  await page.reload();
  await openBoards(page);
  await row(t2).getByText(t2).click();
  const d2 = page.getByRole('dialog').first();
  const t3 = unique('Waschmaschine ausräumen');
  await d2.getByLabel('Titel').fill(t3);
  await d2.getByLabel('Titel').blur();
  await expect.poll(async () => ((await (await request.get(`/api/cards/${b.id}`)).json()) as { icon: string }).icon).toBe('washing-machine');
  expect(((await (await request.get(`/api/cards/${b.id}`)).json()) as { iconSource: string }).iconSource).toBe('auto');
});

test('Termin-Sheet: Kalender und Uhrzeit per Tastatur, „Kein Termin“, „Geplant“ nur mit Termin nach heute', async ({ page, request }) => {
  const board = await ownBoard(request, page, unique('Termin'));
  const input = await openNew(page);
  const title = unique('Ohne Datumswort');
  await input.fill(title);
  const sheet = newTaskSheet(page);
  await expect(sheet.getByRole('button', { name: /^Termin wählen, gerade: Kein Termin/ })).toBeVisible();

  await page.getByRole('button', { name: /^Termin wählen/ }).click();
  const dateSheet = page.getByRole('dialog', { name: 'Termin' });
  await expect(dateSheet.getByRole('grid')).toBeVisible();
  // Uhrzeit: zwei Listen mit Pfeiltasten
  const hours = dateSheet.getByRole('listbox', { name: 'Stunde' });
  const minutes = dateSheet.getByRole('listbox', { name: 'Minute' });
  await expect(hours.getByRole('option', { selected: true })).toHaveCount(1);
  await hours.focus();
  await page.keyboard.type('18');
  await minutes.focus();
  await page.keyboard.type('30');
  await expect(dateSheet.getByRole('group', { name: 'Uhrzeit 18:30' })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(dateSheet.getByRole('group', { name: 'Uhrzeit 18:35' })).toBeVisible();
  await page.keyboard.press('ArrowUp');
  // Kalender: Pfeiltasten wechseln den Tag, Bild auf den Monat
  const selected = dateSheet.locator('[data-day][aria-pressed=true]');
  const today = await selected.getAttribute('data-day');
  await selected.focus();
  await page.keyboard.press('ArrowRight');
  await expect(dateSheet.locator('[data-day][aria-pressed=true]')).not.toHaveAttribute('data-day', today!);
  await page.keyboard.press('PageDown');
  await page.keyboard.press('PageDown');
  // zwei Monate später: der Termin liegt nach heute, die Karte kommt von selbst nach „Geplant“
  await dateSheet.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(sheet.getByRole('button', { name: /^Termin wählen, gerade: .*18:30/ })).toBeVisible();
  await expect(sheet.getByText('Spalte Geplant')).toBeVisible();

  // Kein Termin: zurück in „Offen“
  await page.getByRole('button', { name: /^Termin wählen/ }).click();
  await page.getByRole('dialog', { name: 'Termin' }).getByRole('button', { name: 'Kein Termin' }).click();
  await expect(sheet.getByRole('button', { name: /^Termin wählen, gerade: Kein Termin/ })).toBeVisible();
  await expect(sheet.getByText('Spalte Offen')).toBeVisible();

  // heute 23:30 wählen: bleibt in „Offen“
  const todayLocal = await page.evaluate(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:30`;
  });
  await pickDue(page, todayLocal);
  await expect(sheet.getByText('Spalte Offen')).toBeVisible();
  await page.getByRole('button', { name: 'Aufgabe anlegen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Karte angelegt' })).toBeVisible();
  const made = (await cardsOf(request, board.id)).find((c) => c.title === title)!;
  expect(made.dueAt).not.toBeNull();
  const hour = await page.evaluate((iso) => new Date(iso as string).getHours(), made.dueAt);
  expect(hour).toBe(23);
});

test('Einstellungen › Symbole: „Symbole aus Titeln erkennen“ mit Rückfrage und Ergebnis als Zahl, nur Karten ohne Symbol', async ({ page, request }) => {
  const board = await ownBoard(request, page, unique('Stapel'));
  const mk = async (title: string, extra: Record<string, unknown> = {}) =>
    ((await (await request.post(`/api/boards/${board.id}/cards`, { data: { title, columnId: board.columnId, ...extra } })).json()) as { id: string }).id;
  const a = await mk(unique('Müll raus'));
  const b = await mk(unique('Milch kaufen'));
  const keep = await mk(unique('Müll vom Nachbarn'), { icon: 'leaf', iconSource: 'manual' });
  const none = await mk(unique('Dinge'));
  await page.goto('/');
  await openBoards(page);
  await openSettingsPage(page, 'Symbole');
  const page2 = page.getByRole('dialog', { name: 'Symbole' });
  await page2.getByRole('button', { name: 'Symbole aus Titeln erkennen' }).click();
  // Rückfrage vor dem Lauf: erst „Abbrechen“ ändert nichts
  const ask = page.getByRole('alertdialog');
  await expect(ask).toContainText('Symbole erkennen?');
  await ask.getByRole('button', { name: 'Abbrechen' }).first().click();
  expect((await (await request.get(`/api/cards/${a}`)).json()).icon).toBeNull();

  await page2.getByRole('button', { name: 'Symbole aus Titeln erkennen' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Erkennen' }).click();
  await expect(page.getByTestId('icons-result')).toContainText(/^\d+ Karten? (hat|haben) jetzt ein Symbol/);
  expect(await (await request.get(`/api/cards/${a}`)).json()).toMatchObject({ icon: 'trash-can-outline', iconSource: 'auto' });
  expect(await (await request.get(`/api/cards/${b}`)).json()).toMatchObject({ icon: 'cart-outline', iconSource: 'auto' });
  expect(await (await request.get(`/api/cards/${keep}`)).json()).toMatchObject({ icon: 'leaf', iconSource: 'manual' }); // blieb
  expect((await (await request.get(`/api/cards/${none}`)).json()).icon).toBeNull(); // nichts passt: bleibt leer
});

test('„Symbole“ in den Einstellungen sehen nur Administratoren', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({
    baseURL: String(baseURL),
    locale: 'de-DE',
    extraHTTPHeaders: { 'x-remote-user-id': 'ha-sym-mitglied', 'x-remote-user-name': 'symmitglied', 'x-remote-user-display-name': 'Sym Mitglied', 'x-stups-language': 'de' },
  });
  const page = await ctx.newPage();
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Benachrichtigungen' }).or(dialog.getByRole('button', { name: 'Sprache und Farbe' })).first()).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Symbole', exact: true })).toHaveCount(0);
    // auch die Schnittstelle sagt nein
    expect((await ctx.request.get('/api/icons/candidates')).status()).toBe(403);
    expect((await ctx.request.post('/api/icons/apply', { data: { items: [] } })).status()).toBe(403);
  } finally {
    await ctx.close();
  }
});
