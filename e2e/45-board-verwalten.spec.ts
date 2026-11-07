import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { openBoards } from './helpers';

// Board-Auswahl, Board-Einstellungen mit Board-Wahl, Reihenfolge, Duplizieren, Archivieren und Wiederherstellen, Löschen mit Dialog (Handy,
// ohne Home Assistant). Läuft auf dem gemeinsamen Server (dunkel und hell nacheinander): Namen sind eindeutig, alles Angelegte wird am Ende
// entfernt (ein archiviertes Board erst zurückholen).
test.describe.configure({ mode: 'serial', timeout: 90_000 });

const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const connyHeaders = { 'x-remote-user-id': 'ha-conny-e2e', 'x-remote-user-name': 'conny', 'x-remote-user-display-name': 'Conny', 'x-stups-language': 'de' };

type B = { id: string; name: string; visibility: string; ownerId: string | null; archivedAt?: string | null; icon: string | null; color: string | null };
const list = async (request: APIRequestContext) => (await (await request.get('/api/boards')).json()) as B[];
const archived = async (request: APIRequestContext) => (await (await request.get('/api/boards/archived')).json()) as B[];
const mine = async (request: APIRequestContext) => (await list(request)).filter((b) => b.name.includes(tag));

async function board(request: APIRequestContext, name: string, extra: Record<string, unknown> = {}) {
  const res = await request.post('/api/boards', { data: { name, ...extra } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}
async function firstColumn(request: APIRequestContext, boardId: string) {
  const cols = ((await (await request.get(`/api/boards/${boardId}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] }).columns;
  return cols.find((c) => !c.isDone && !c.isPlanned)!.id;
}
async function card(request: APIRequestContext, boardId: string, title: string, extra: Record<string, unknown> = {}) {
  const res = await request.post(`/api/boards/${boardId}/cards`, { data: { title, columnId: await firstColumn(request, boardId), ...extra } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test.afterAll(async ({ request }) => {
  for (const b of await archived(request)) if (b.name.includes(tag)) await request.post(`/api/boards/${b.id}/unarchive`);
  for (const b of await mine(request)) await request.delete(`/api/boards/${b.id}`);
});

/** Die Board-Auswahl öffnen; `current` merkt das Board vor, das beim Start gilt */
async function openSwitcher(page: Page, current?: string) {
  if (current) await page.addInitScript((id) => localStorage.setItem('stups.board', id), current);
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('button', { name: 'Board wechseln' }).click();
}
async function openSettings(page: Page, current?: string) {
  await openSwitcher(page, current);
  await page.getByRole('dialog', { name: 'Boards' }).getByRole('button', { name: 'Board-Einstellungen' }).click();
  const settings = page.getByRole('dialog', { name: 'Board-Einstellungen' });
  await expect(settings.getByTestId('settings-board')).toBeVisible();
  return settings;
}

test('Board-Auswahl: Liste mit offenen Karten und Sichtbarkeit, darunter Neues Board erstellen und Board-Einstellungen; „Einstellungen“ und „Bearbeiten“ entfallen', async ({ page, request }) => {
  const name = `Auswahl ${tag}`;
  const id = await board(request, name, { visibility: 'private' });
  await board(request, `Daneben ${tag}`); // bei nur einem Board gibt es nichts zu ordnen
  await card(request, id, `Karte ${tag}`);
  await openSwitcher(page);
  const sheet = page.getByRole('dialog', { name: 'Boards' });
  const row = sheet.getByRole('button', { name });
  await expect(row).toContainText('1 offen');
  await expect(row).toContainText('nur ich');
  await expect(sheet.getByRole('button', { name: 'Neues Board erstellen' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Board-Einstellungen' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Reihenfolge ändern' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Einstellungen', exact: true })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Bearbeiten' })).toHaveCount(0);
  // kein Anlege-Formular mehr in der Auswahl, es steht hinter „Neues Board erstellen“ (mit Sichtbarkeit und Fairness)
  await expect(sheet.getByLabel('Name des neuen Boards')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Neues Board erstellen' }).click();
  await expect(page.getByLabel('Name des neuen Boards')).toBeVisible();
  await expect(page.getByTestId('visibility-picker')).toBeVisible();
  // Zurück führt in die Auswahl
  await page.getByRole('dialog', { name: 'Neues Board erstellen' }).getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByRole('dialog', { name: 'Boards' })).toBeVisible();
  // ein Tipp auf ein Board wählt es
  await page.getByRole('dialog', { name: 'Boards' }).getByRole('button', { name }).click();
  await expect(page.getByTestId('board-name')).toHaveText(name);
});

test('Board-Einstellungen: oben die Wahl des Boards (ohne zu schließen), Name, Symbol und Farbe gelten für das gewählte Board', async ({ page, request }) => {
  const alpha = await board(request, `Alpha ${tag}`);
  const beta = await board(request, `Beta ${tag}`);
  const settings = await openSettings(page, alpha);
  await expect(settings.getByTestId('settings-board')).toContainText(`Alpha ${tag}`);
  await settings.getByLabel('Für welches Board?').selectOption(beta);
  await expect(settings.getByTestId('settings-board')).toContainText(`Beta ${tag}`);
  await expect(settings.getByLabel('Name des Boards')).toHaveValue(`Beta ${tag}`);

  // Symbol (Schnellwahl) und Farbe
  await settings.getByRole('group', { name: 'Symbol des Boards' }).getByRole('button').nth(1).click();
  await expect.poll(async () => (await list(request)).find((b) => b.id === beta)!.icon).toBe('hammer');
  await settings.getByRole('radiogroup', { name: 'Farbe des Boards' }).getByRole('radio', { name: 'purple' }).click();
  await expect.poll(async () => (await list(request)).find((b) => b.id === beta)!.color).toBe('purple');
  await expect(settings.getByRole('radiogroup', { name: 'Farbe des Boards' }).getByRole('radio', { name: 'purple' })).toHaveAttribute('aria-checked', 'true');
  // Name
  await settings.getByLabel('Name des Boards').fill(`Beta neu ${tag}`);
  await settings.getByLabel('Name des Boards').press('Tab');
  await expect.poll(async () => (await list(request)).find((b) => b.id === beta)!.name).toBe(`Beta neu ${tag}`);
  // Alpha ist unverändert
  expect((await list(request)).find((b) => b.id === alpha)).toMatchObject({ name: `Alpha ${tag}`, icon: null, color: null });
  // Spalten und Kategorien klappen auf (die Zeilen zeigen die Zahl)
  await expect(settings.getByRole('button', { name: /^Spalten/ })).toContainText('4 Spalten');
  await settings.getByRole('button', { name: /^Spalten/ }).click();
  await expect(settings.getByTestId('columns-editor')).toBeVisible();
  await settings.getByRole('button', { name: /^Kategorien/ }).click();
  await expect(settings.getByTestId('categories-editor')).toBeVisible();
});

test('Reihenfolge ändern: Pfeile verschieben, „Abbrechen“ lässt alles, „Fertig“ speichert für alle', async ({ page, request }) => {
  const a = await board(request, `Erste ${tag}`);
  const b = await board(request, `Zweite ${tag}`);
  const c = await board(request, `Dritte ${tag}`);
  const order = async () => (await list(request)).map((x) => x.id).filter((x) => [a, b, c].includes(x));
  expect(await order()).toEqual([a, b, c]);

  await openSwitcher(page);
  await page.getByRole('dialog', { name: 'Boards' }).getByRole('button', { name: 'Reihenfolge ändern' }).click();
  const sheet = page.getByRole('dialog', { name: 'Reihenfolge' });
  await expect(sheet.getByTestId('order-row').filter({ hasText: `Dritte ${tag}` })).toBeVisible();
  await sheet.getByRole('button', { name: `Dritte ${tag} nach oben` }).click();
  await sheet.getByRole('button', { name: `Dritte ${tag} nach oben` }).click();
  await expect(sheet.getByTestId('order-row').filter({ hasText: `Dritte ${tag}` })).toContainText('wird gerade verschoben');
  // Abbrechen: nichts ist gespeichert, es geht zurück in die Auswahl
  await sheet.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(page.getByRole('dialog', { name: 'Boards' })).toBeVisible();
  expect(await order()).toEqual([a, b, c]);

  await page.getByRole('dialog', { name: 'Boards' }).getByRole('button', { name: 'Reihenfolge ändern' }).click();
  const again = page.getByRole('dialog', { name: 'Reihenfolge' });
  await again.getByRole('button', { name: `Dritte ${tag} nach oben` }).click();
  await again.getByRole('button', { name: `Dritte ${tag} nach oben` }).click();
  await again.getByRole('button', { name: 'Fertig' }).click();
  await expect.poll(order).toEqual([c, a, b]);
  // die Auswahl zeigt die neue Reihenfolge
  const names = await page.getByRole('dialog', { name: 'Boards' }).getByRole('button', { name: new RegExp(`^(Erste|Zweite|Dritte) ${tag}$`) }).allInnerTexts();
  expect(names.map((n) => n.split('\n')[0])).toEqual([`Dritte ${tag}`, `Erste ${tag}`, `Zweite ${tag}`]);
});

test('Duplizieren: „X (Kopie)“ mit Spalten und Kategorien, Aufgaben nur auf Wunsch (ohne Zuständige und Erledigte, Wiederholung bleibt)', async ({ page, request }) => {
  const src = await board(request, `Quelle ${tag}`);
  await request.post(`/api/boards/${src}/categories`, { data: { name: 'Material', color: 'blue' } });
  const me = ((await (await request.get('/api/me')).json()) as { user: { id: string } }).user.id;
  await card(request, src, `Fliesen ${tag}`, { dueAt: '2030-01-05T08:00:00.000Z', assigneeIds: [me], recurrence: { type: 'fixed', freq: 'weekly', every: 2, weekdays: [6] } });
  const done = await card(request, src, `Fertig ${tag}`);
  await request.post(`/api/cards/${done}/complete`);

  const settings = await openSettings(page, src);
  await settings.getByRole('button', { name: /^Board duplizieren/ }).click();
  const dialog = page.getByTestId('board-duplicate-dialog');
  await expect(dialog.getByLabel('Name')).toHaveValue(`Quelle ${tag} (Kopie)`);
  const sw = (name: string) => dialog.getByRole('switch', { name });
  await expect(sw('Spalten und Kategorien')).toHaveAttribute('aria-checked', 'true');
  await expect(sw('Offene Aufgaben')).toHaveAttribute('aria-checked', 'false');
  await expect(sw('Wer sieht es')).toHaveAttribute('aria-checked', 'true');
  await expect(sw('Wächter')).toBeDisabled();
  await sw('Offene Aufgaben').click();
  await dialog.getByTestId('duplicate-confirm').click();

  await expect(page.getByTestId('board-name')).toHaveText(`Quelle ${tag} (Kopie)`);
  const copy = (await list(request)).find((b) => b.name === `Quelle ${tag} (Kopie)`)!;
  expect(copy.ownerId).toBe(me);
  const view = (await (await request.get(`/api/boards/${copy.id}`)).json()) as {
    categories: { name: string }[];
    columns: unknown[];
    cards: { title: string; assigneeIds: string[]; recurrence: unknown }[];
  };
  expect(view.categories.map((c) => c.name)).toEqual(['Material']);
  expect(view.columns).toHaveLength(4);
  expect(view.cards).toHaveLength(1);
  expect(view.cards[0]).toMatchObject({ title: `Fliesen ${tag}`, assigneeIds: [] });
  expect(view.cards[0]!.recurrence).not.toBeNull();
  // das Original ist unverändert
  const orig = (await (await request.get(`/api/boards/${src}`)).json()) as { cards: { assigneeIds: string[] }[] };
  expect(orig.cards.some((c) => c.assigneeIds.length > 0)).toBe(true);
});

test('Archivieren: das Board verschwindet aus der Auswahl, „Archivierte Boards“ holt es zurück', async ({ page, request }) => {
  const id = await board(request, `Archiv ${tag}`);
  await card(request, id, `Bleibt ${tag}`);
  const settings = await openSettings(page, id);
  await settings.getByRole('button', { name: /^Board archivieren/ }).click();
  const dialog = page.getByTestId('board-archive-dialog');
  await expect(dialog).toContainText('Das Board verschwindet aus der Auswahl und den Listen');
  await dialog.getByTestId('archive-confirm').click();
  await expect.poll(async () => (await list(request)).some((b) => b.id === id)).toBe(false);
  expect((await archived(request)).map((b) => b.id)).toContain(id);
  expect((await request.get(`/api/boards/${id}`)).status()).toBe(404);

  // in der Auswahl steht es nicht mehr, dafür die Zeile „Archivierte Boards“
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  const sheet = page.getByRole('dialog', { name: 'Boards' });
  await expect(sheet.getByRole('button', { name: `Archiv ${tag}` })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Archivierte Boards' }).click();
  const arch = page.getByRole('dialog', { name: 'Archivierte Boards' });
  await expect(arch.getByTestId(`archived-${id}`)).toContainText(`Archiv ${tag}`);
  await arch.getByTestId(`archived-${id}`).getByRole('button', { name: 'Wiederherstellen' }).click();
  await expect.poll(async () => (await list(request)).some((b) => b.id === id)).toBe(true);
  const view = (await (await request.get(`/api/boards/${id}`)).json()) as { cards: { title: string }[] };
  expect(view.cards.map((c) => c.title)).toEqual([`Bleibt ${tag}`]);
});

test('Löschen: der Dialog nennt Aufgaben und wiederkehrende Aufgaben mit Regel; danach liegt das Board im Papierkorb', async ({ page, request }) => {
  const id = await board(request, `Weg ${tag}`);
  await card(request, id, `Einfach ${tag}`);
  await card(request, id, `Bett beziehen ${tag}`, { dueAt: '2030-01-05T08:00:00.000Z', recurrence: { type: 'fixed', freq: 'weekly', every: 2, weekdays: [6] } });
  const settings = await openSettings(page, id);
  await settings.getByTestId('board-delete').click();
  const dialog = page.getByTestId('board-delete-dialog');
  await expect(dialog).toContainText(`„Weg ${tag}“ löschen?`);
  await expect(dialog.getByTestId('delete-cards')).toHaveText('2 · 2 offen');
  await expect(dialog).toContainText('Landen 30 Tage im Papierkorb');
  await expect(dialog.getByTestId('delete-recurring')).toContainText(`Bett beziehen ${tag}`);
  await expect(dialog.getByTestId('delete-recurring')).toContainText(/Woche/);
  // Abbrechen schließt nur den Dialog
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(dialog).toHaveCount(0);
  expect((await list(request)).some((b) => b.id === id)).toBe(true);
  await settings.getByTestId('board-delete').click();
  await page.getByTestId('delete-confirm').click();
  await expect.poll(async () => (await list(request)).some((b) => b.id === id)).toBe(false);
  const trash = (await (await request.get('/api/trash')).json()) as { type: string; id: string }[];
  expect(trash.some((t) => t.type === 'board' && t.id === id)).toBe(true);
  // aus dem Papierkorb zurückholen
  expect((await request.post(`/api/trash/board/${id}/restore`)).status()).toBe(204);
  expect((await list(request)).some((b) => b.id === id)).toBe(true);
});

test('Ein Board, das die Person nicht verwalten darf: „Board löschen“ grau mit dem Besitzer im Text', async ({ browser, request }, info) => {
  const id = await board(request, `Fremd ${tag}`);
  const ctx = await (browser as Browser).newContext({ baseURL: String(info.project.use.baseURL), locale: 'de-DE', extraHTTPHeaders: connyHeaders });
  try {
    const page = await ctx.newPage();
    await page.goto('/');
    await openBoards(page);
    await page.getByRole('button', { name: 'Board wechseln' }).click();
    await page.getByRole('dialog', { name: 'Boards' }).getByRole('button', { name: 'Board-Einstellungen' }).click();
    const settings = page.getByRole('dialog', { name: 'Board-Einstellungen' });
    await settings.getByLabel('Für welches Board?').selectOption(id);
    await expect(settings.getByTestId('settings-board')).toContainText(`Fremd ${tag}`);
    await expect(settings.getByTestId('board-delete')).toBeDisabled();
    await expect(settings.getByTestId('board-delete-lock')).toHaveText('Nur Rene oder ein Administrator darf löschen.');
    await expect(settings.getByRole('button', { name: /^Board archivieren/ })).toContainText('Nur Rene oder ein Administrator darf archivieren.');
    // der Server verweigert es ebenso
    const res = await ctx.request.post(`/api/boards/${id}/delete`, { data: {} });
    expect(res.status()).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('Nur Rene oder ein Administrator darf löschen.');
  } finally {
    await ctx.close();
  }
});
