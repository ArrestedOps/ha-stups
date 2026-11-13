import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Läuft nur im Projekt „desktop-ha“ (1440 × 900, nachgebautes Home Assistant). Desktop-Optik zu Boards und Wächtern: der Dialog „Person entfernen"
// (breit, Wächter und „Zuständige jetzt" einzeilig, nur „Danach" bricht um), die Felder einer Reihe auf einer Linie, Board-Auswahl und
// Fairness-Karte im Formular „Neuer Wächter".
test.describe.configure({ timeout: 90_000, mode: 'serial' });

const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const ENTITY = 'sensor.iphone_rene_battery_level';
const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });
const created: string[] = [];
let boardId = '';
let columnId = '';
let reneId = '';
let connyId = '';

test.beforeAll(async ({ request }) => {
  const people = (await (await request.get('/api/people')).json()) as { id: string; name: string }[];
  reneId = people.find((p) => p.name === 'Rene')!.id;
  connyId = people.find((p) => p.name === 'Conny')!.id;
  const b = (await (await request.post('/api/boards', { data: { name: `Bad ${tag}`, visibility: 'selected', memberIds: [connyId] } })).json()) as { id: string };
  boardId = b.id;
  created.push(b.id);
  const view = (await (await request.get(`/api/boards/${b.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  columnId = view.columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  const mk = (name: string, assign: object) =>
    request.post('/api/watchers', { data: { name, trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 10 }, card: { boardId, columnId, title: `${name} Aufgabe`, due: { kind: 'none' } }, assign } });
  expect((await mk(`Waschmaschine fertig ${tag}`, { mode: 'rotation', personIds: [reneId, connyId] })).status()).toBe(201);
  expect((await mk(`Heizung prüfen ${tag}`, { mode: 'fixed', personIds: [connyId] })).status()).toBe(201);
});

test.afterAll(async ({ request }: { request: APIRequestContext }) => {
  const items = ((await (await request.get('/api/watchers')).json()) as { items: { id: string }[] }).items;
  for (const w of items) await request.delete(`/api/watchers/${w.id}`);
  for (const id of created) await request.delete(`/api/boards/${id}`);
});

test('Dialog „Conny entfernen": breit, Spalten „Wächter" und „Zuständige jetzt" einzeilig, nur „Danach" darf umbrechen', async ({ page }) => {
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), boardId);
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Boards' }).click();
  await page.getByRole('button', { name: 'Board-Einstellungen' }).click();
  const settings = page.getByRole('dialog', { name: 'Board-Einstellungen' });
  await settings.getByTestId('visibility-members').getByRole('button', { name: /Conny/ }).click();
  const dialog = page.getByTestId('board-access-dialog');
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.width).toBeGreaterThan(800);
  expect(box.width).toBeLessThanOrEqual(862);
  const table = dialog.getByTestId('access-table');
  await expect(table).toBeVisible();
  // jede Zelle der ersten beiden Spalten bricht nie um (nowrap, der Text steht in einer Zeile), nur „Danach" darf umbrechen
  const wrap = (sel: string) => table.locator(sel).evaluateAll((els) => els.map((e) => getComputedStyle(e).whiteSpace));
  for (const sel of ['th:nth-child(1)', 'th:nth-child(2)', 'td:nth-child(1)', 'td:nth-child(2)']) for (const w of await wrap(sel)) expect(w, sel).toBe('nowrap');
  for (const w of await wrap('td:nth-child(3)')) expect(w).not.toBe('nowrap');
  // und der Text selbst belegt eine Zeile: seine Höhe entspricht einer Textzeile
  const lines = await table.locator('td:nth-child(1), td:nth-child(2)').evaluateAll((els) =>
    els.map((e) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      return r.getClientRects().length;
    }),
  );
  for (const n of lines) expect(n).toBeLessThanOrEqual(2); // Text (und ein Zeichen davor): nowrap oben stellt sicher, dass nichts umbricht
  // die Reihe „Danach" bricht bei Bedarf um: die Zeile „niemand …" ist die höchste
  await expect(table.locator('tr[data-missing]')).toContainText('niemand');
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(dialog).toHaveCount(0);
});

test('Formular „Neuer Wächter": die Felder der Reihe „Dann" stehen auf einer Linie, Board-Auswahl und Fairness-Karte', async ({ page }) => {
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), boardId);
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await page.getByTestId('new-watcher').click();
  const pills = page.getByTestId('desk-pills');
  await expect(pills).toBeVisible();
  // gleiche Oberkante und gleiche Höhe für alle Felder der Reihe
  const boxes = await pills.locator('> *').evaluateAll((els) => els.map((e) => ({ top: Math.round(e.getBoundingClientRect().top), height: Math.round(e.getBoundingClientRect().height) })).filter((b) => b.height > 0));
  expect(boxes.length).toBeGreaterThanOrEqual(4);
  expect(new Set(boxes.map((b) => b.height)).size).toBe(1);
  // was in einer Reihe steht (bei Platzmangel bricht die Reihe um), hat dieselbe Oberkante
  for (const a of boxes) for (const b of boxes) if (Math.abs(a.top - b.top) < a.height / 2) expect(a.top).toBe(b.top);
  // Board-Auswahl: „Name · Rene, Conny" in der Liste, der Name allein in der Pille
  const select = pills.locator('select[aria-label="Board"]');
  await expect(select.locator('option', { hasText: `Bad ${tag}` })).toHaveText(`Bad ${tag} · Rene, Conny`);
  await select.selectOption(boardId);
  await expect(pills.getByTestId('select-value').first()).toHaveText(`Bad ${tag}`);
  // Wer: der Chip „Nur Mitglieder von …"
  await expect(page.getByTestId('board-people-chip')).toContainText(`Nur Mitglieder von „Bad ${tag}“`);
  // Fairness-Karte (breit) mit Schalter
  await page.getByTestId('desk-more-settings').getByRole('button').first().click();
  const fairness = page.getByTestId('fairness-row');
  await expect(fairness).toBeVisible();
  await expect(fairness.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
});
