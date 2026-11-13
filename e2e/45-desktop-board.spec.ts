import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Läuft nur im Projekt „desktop-ha“ (1440 × 900, nachgebautes Home Assistant). Desktop: Seitenleiste mit „Neues Board“, „Board-Einstellungen“,
// „Archivierte Boards“ und „Reihenfolge ändern“; die Board-Einstellungen als breites Fenster (links die Boards, rechts die Einstellungen des
// gewählten); Archivieren, Wiederherstellen, Löschen mit Wahl je Wächter.
test.describe.configure({ timeout: 90_000, mode: 'serial' });

const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const ENTITY = 'sensor.iphone_rene_battery_level';
const created: string[] = [];
const side = (page: Page) => page.getByTestId('sidebar');
const sideBoards = (page: Page) => side(page).getByRole('navigation', { name: 'Boards' });

type B = { id: string; name: string };
const list = async (request: APIRequestContext) => (await (await request.get('/api/boards')).json()) as B[];
async function board(request: APIRequestContext, name: string) {
  const b = (await (await request.post('/api/boards', { data: { name } })).json()) as { id: string };
  created.push(b.id);
  const view = (await (await request.get(`/api/boards/${b.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  return { id: b.id, columnId: view.columns.find((c) => !c.isDone && !c.isPlanned)!.id };
}

test.afterAll(async ({ request }) => {
  for (const w of ((await (await request.get('/api/watchers')).json()) as { items: { id: string; name: string }[] }).items) if (w.name.includes(tag)) await request.delete(`/api/watchers/${w.id}`);
  for (const b of (await (await request.get('/api/boards/archived')).json()) as { id: string }[]) await request.post(`/api/boards/${b.id}/unarchive`);
  for (const id of created) await request.delete(`/api/boards/${id}`);
});

test('Seitenleiste: Neues Board, Board-Einstellungen und Reihenfolge ändern; Archivierte Boards erst, wenn es welche gibt', async ({ page, request }) => {
  await board(request, `Erste ${tag}`);
  const second = await board(request, `Zweite ${tag}`);
  await page.goto('/');
  await expect(side(page)).toBeVisible();
  for (const name of ['Neues Board', 'Board-Einstellungen', 'Reihenfolge ändern']) await expect(sideBoards(page).getByRole('button', { name })).toBeVisible();
  await expect(sideBoards(page).getByRole('button', { name: /^Archivierte Boards/ })).toHaveCount(0);
  // Neues Board öffnet das Anlegen (mit Sichtbarkeit und Fairness)
  await sideBoards(page).getByRole('button', { name: 'Neues Board' }).click();
  await expect(page.getByRole('dialog', { name: 'Neues Board erstellen' })).toBeVisible();
  await expect(page.getByTestId('visibility-picker')).toBeVisible();
  await page.keyboard.press('Escape');

  // archivieren: die Zeile „Archivierte Boards (1)“ erscheint, das Board ist aus der Seitenleiste verschwunden
  await request.post(`/api/boards/${second.id}/archive-board`);
  await page.reload();
  await expect(sideBoards(page).getByRole('button', { name: /^Archivierte Boards \(\d+\)/ })).toBeVisible();
  await expect(sideBoards(page).getByRole('button', { name: new RegExp(`^Zweite ${tag}`) })).toHaveCount(0);
  await sideBoards(page).getByRole('button', { name: /^Archivierte Boards/ }).click();
  await page.getByTestId(`archived-${second.id}`).getByRole('button', { name: 'Wiederherstellen' }).click();
  await expect(sideBoards(page).getByRole('button', { name: new RegExp(`^Zweite ${tag}`) })).toBeVisible();
});

test('Board-Einstellungen: breites Fenster, links die Boards (Wechsel ohne Schließen), rechts Name, Symbol, Farbe, Verwalten; Löschen steht ganz unten', async ({ page, request }) => {
  const a = await board(request, `Alpha ${tag}`);
  const b = await board(request, `Beta ${tag}`);
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), a.id);
  await page.goto('/');
  await sideBoards(page).getByRole('button', { name: 'Board-Einstellungen' }).click();
  const settings = page.getByRole('dialog', { name: 'Board-Einstellungen' });
  const box = (await settings.boundingBox())!;
  expect(box.width).toBeGreaterThan(900);
  const left = settings.getByTestId('settings-boards');
  await expect(left).toBeVisible();
  await expect(settings.getByRole('heading', { name: `Alpha ${tag}` })).toBeVisible();
  await expect(left.getByRole('button', { name: new RegExp(`^Alpha ${tag}`) })).toHaveAttribute('aria-current', 'true');
  await left.getByRole('button', { name: new RegExp(`^Beta ${tag}`) }).click();
  await expect(settings.getByRole('heading', { name: `Beta ${tag}` })).toBeVisible();
  await expect(settings.getByLabel('Name des Boards')).toHaveValue(`Beta ${tag}`);
  expect(b.id).toBeTruthy();

  // rechts: die Gruppe „Board verwalten“, Board löschen zuletzt (unter allem anderen, abgesetzt)
  const manage = settings.getByTestId('board-manage');
  for (const name of [/^Board duplizieren/, /^Als Vorlage speichern/, /^Board archivieren/]) await expect(manage.getByRole('button', { name })).toBeVisible();
  const del = settings.getByTestId('board-delete');
  const delBox = (await del.boundingBox())!;
  for (const name of [/^Board duplizieren/, /^Als Vorlage speichern/, /^Board archivieren/]) {
    const r = (await manage.getByRole('button', { name }).boundingBox())!;
    expect(delBox.y).toBeGreaterThan(r.y + r.height);
  }
  // die Seitenleiste des Fensters hat „Neues Board“, „Reihenfolge ändern“
  await expect(left.getByRole('button', { name: 'Neues Board' })).toBeVisible();
  await expect(left.getByRole('button', { name: 'Reihenfolge ändern' })).toBeVisible();
});

test('Reihenfolge ändern über die Seitenleiste: die Seitenleiste folgt, die Reihenfolge gilt für alle', async ({ page, request }) => {
  const a = await board(request, `Eins ${tag}`);
  const b = await board(request, `Zwei ${tag}`);
  await page.goto('/');
  await sideBoards(page).getByRole('button', { name: 'Reihenfolge ändern' }).click();
  const sheet = page.getByRole('dialog', { name: 'Reihenfolge' });
  await sheet.getByRole('button', { name: `Zwei ${tag} nach oben` }).click();
  await sheet.getByRole('button', { name: `Zwei ${tag} nach oben` }).click();
  await sheet.getByRole('button', { name: 'Fertig' }).click();
  await expect.poll(async () => (await list(request)).map((x) => x.id).filter((id) => [a.id, b.id].includes(id))).toEqual([b.id, a.id]);
  const names = await sideBoards(page).getByRole('button', { name: new RegExp(`^(Eins|Zwei) ${tag}`) }).allInnerTexts();
  expect(names.map((n) => n.split('\n')[0]!.trim())).toEqual([`Zwei ${tag}`, `Eins ${tag}`]);
});

test('Löschen am Desktop: Dialog mit Wahl je Wächter (Umziehen), danach läuft der Wächter im Ziel-Board weiter', async ({ page, request }) => {
  const quelle = await board(request, `Quelle ${tag}`);
  const ziel = await board(request, `Ziel ${tag}`);
  const res = await request.post('/api/watchers', {
    data: { name: `Waschmaschine ${tag}`, trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 10 }, card: { boardId: quelle.id, columnId: quelle.columnId, title: 'Aufgabe', due: { kind: 'none' } }, assign: { mode: 'none', personIds: [] } },
  });
  const wid = ((await res.json()) as { id: string }).id;
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), quelle.id);
  await page.goto('/');
  await sideBoards(page).getByRole('button', { name: 'Board-Einstellungen' }).click();
  const settings = page.getByRole('dialog', { name: 'Board-Einstellungen' });
  await settings.getByTestId('board-delete').click();
  const dialog = page.getByTestId('board-delete-dialog');
  const row = dialog.getByTestId(`delete-watcher-${wid}`);
  await row.getByRole('radio', { name: 'Umziehen' }).click();
  await row.getByLabel(`Ziel-Board für „Waschmaschine ${tag}“`).selectOption(ziel.id);
  await dialog.getByTestId('delete-confirm').click();
  await expect.poll(async () => (await list(request)).some((x) => x.id === quelle.id)).toBe(false);
  const items = ((await (await request.get('/api/watchers')).json()) as { items: { id: string; status: string; active: boolean; card: { boardId: string } }[] }).items;
  expect(items.find((w) => w.id === wid)).toMatchObject({ status: 'ok', active: true, card: { boardId: ziel.id } });
});
