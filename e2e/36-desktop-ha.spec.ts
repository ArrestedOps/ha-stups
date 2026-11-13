import { expect, test } from '@playwright/test';

// Wächter am Desktop (Server mit nachgebautem Home Assistant): Raster aus gleich hohen Aufgaben, „Neuer Wächter“ als Knopf neben dem Kopf.
const MOCK = 'http://127.0.0.1:18411';
test.describe.configure({ timeout: 90_000 });

// Die Wächter gehören dem ganzen Lauf: auch ein gescheiterter Test räumt auf
test.afterEach(async ({ request }) => {
  for (const w of ((await (await request.get('/api/watchers')).json()) as { items: { id: string }[] }).items) await request.delete(`/api/watchers/${w.id}`);
});

const sideNav = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Ansicht' });

test('Wächter: Raster in zwei oder drei Spalten, alle Aufgaben einer Reihe gleich hoch, kein „+“ des Handys, Neuer Wächter als Knopf in der Leiste', async ({ page, request }) => {
  const people = (await (await request.get('/api/people')).json()) as { id: string; name: string }[];
  const rene = people.find((p) => p.name === 'Rene')!;
  const tag = Date.now().toString(36);
  const board = (await (await request.post('/api/boards', { data: { name: `Desk Wächter ${tag}` } })).json()) as { id: string };
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  const columnId = view.columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  await request.post(`${MOCK}/mock/state`, { data: { entityId: 'sensor.waschmaschine_leistung', state: '120' } });
  for (let i = 0; i < 4; i += 1) {
    const r = await request.post('/api/watchers', {
      data: {
        name: `Desk Wächter ${tag}${i}`,
        trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5, forMin: 0 },
        card: { boardId: board.id, columnId, title: `Ausräumen ${tag} ${i}`, due: { kind: 'none' } },
        assign: { mode: 'fixed', personIds: [rene.id] },
        cooldownMin: 0,
      },
    });
    expect(r.status()).toBe(201);
  }
  // alle vier lösen aus: vier offene Aufgaben vom Haus, Abschnitt „Wartet auf jemanden“ mit vier Aufgaben
  await request.post(`${MOCK}/mock/state`, { data: { entityId: 'sensor.waschmaschine_leistung', state: '2' } });
  await expect
    .poll(async () => ((await (await request.get(`/api/boards/${board.id}`)).json()) as { cards: unknown[] }).cards.length, { timeout: 20_000 })
    .toBe(4);
  await page.goto('/');
  await sideNav(page).getByRole('button', { name: 'Wächter' }).click();
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.getByTestId('new-watcher')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Neuer Wächter', exact: true })).toHaveCount(1); // nur der Knopf, nicht zusätzlich der „+“ des Handys
  await expect(page.getByTestId('sidebar')).toBeVisible();

  // jedes Raster: Zeilen mit gleich hohen Aufgaben, bis zu drei Spalten
  const grids = page.getByTestId('home').locator('ul.grid');
  await expect(grids.first()).toBeVisible();
  const info = await grids.evaluateAll((els) =>
    els.map((ul) => {
      const items = [...ul.children].map((li) => li.getBoundingClientRect());
      const rows = new Map<number, number[]>();
      for (const r of items) rows.set(Math.round(r.top), [...(rows.get(Math.round(r.top)) ?? []), Math.round(r.height)]);
      return { cols: Math.max(...[...rows.values()].map((r) => r.length)), equal: [...rows.values()].every((h) => Math.max(...h) - Math.min(...h) <= 1) };
    }),
  );
  for (const g of info) {
    expect(g.equal, 'Aufgaben einer Reihe gleich hoch').toBe(true);
    expect(g.cols).toBeLessThanOrEqual(3);
  }
  expect(Math.max(...info.map((g) => g.cols)), 'mehrere Spalten').toBeGreaterThanOrEqual(2);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);

  // Suche: filtert die Wächter nach Namen
  await page.keyboard.press('Control+k');
  await page.keyboard.type('gibt-es-nicht');
  await expect(page.getByTestId('home-no-match')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('home-no-match')).toHaveCount(0);

  // „Neuer Wächter“ klappt über der Liste auf (kein Fenster): derselbe Knopf klappt wieder zu
  const bar = page.getByTestId('new-watcher');
  await expect(bar).toHaveAttribute('aria-expanded', 'false');
  await bar.click();
  await expect(bar).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('watcher-desk')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await bar.click();
  await expect(page.getByTestId('watcher-desk')).toHaveCount(0);
  await expect(bar).toHaveAttribute('aria-expanded', 'false');
});

test('Wächter am Desktop: Tabelle mit Spaltenkopf, bündige Spalten, Schalter, Zeile öffnet, Kategorien klappen, bei 1024 px weniger Spalten', async ({ page, request }) => {
  for (const w of ((await (await request.get('/api/watchers')).json()) as { items: { id: string }[] }).items) await request.delete(`/api/watchers/${w.id}`);
  const people = (await (await request.get('/api/people')).json()) as { id: string; name: string }[];
  const rene = people.find((p) => p.name === 'Rene')!;
  const tag = Date.now().toString(36);
  const board = (await (await request.post('/api/boards', { data: { name: `Desk Tabelle ${tag}` } })).json()) as { id: string };
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  const columnId = view.columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  await request.post(`${MOCK}/mock/state`, { data: { entityId: 'sensor.waschmaschine_leistung', state: '120' } });
  const make = (name: string, entityId: string, category: string | null, extra: Record<string, unknown> = {}) => ({
    name,
    category,
    trigger: { entityId, kind: 'below', value: 5, forMin: 10 }, // Batterien liegen darüber: ruhig, keine sofortige Aufgabe
    card: { boardId: board.id, columnId, title: `Aufgabe ${name}`, due: { kind: 'none' } },
    assign: { mode: 'fixed', personIds: [rene.id] },
    ...extra,
  });
  const ids: string[] = [];
  for (const body of [
    make(`Maschine ${tag}`, 'sensor.waschmaschine_leistung', 'Haushaltsgeräte', { trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5, forMin: 0 } }),
    make(`Bad ${tag}`, 'sensor.bad_batterie', 'Batterien'),
    make(`Handy ${tag}`, 'sensor.iphone_rene_battery_level', 'Batterien', { assign: { mode: 'rotation_present', personIds: [] } }),
    make(`Ohne ${tag}`, 'sensor.trockner_leistung', null),
  ]) {
    const r = await request.post('/api/watchers', { data: body });
    expect(r.status()).toBe(201);
    ids.push(((await r.json()) as { id: string }).id);
  }
  await page.goto('/');
  await sideNav(page).getByRole('button', { name: 'Wächter' }).click();
  const list = page.getByTestId('watcher-list');
  await expect(list).toBeVisible();

  // Läuft gerade (die Maschine), danach die Kategorien; jeder Wächter genau einmal
  await expect(page.getByTestId('home-running')).toContainText(`Maschine ${tag}`);
  await expect(page.getByTestId('watcher-row')).toHaveCount(4);
  await expect(page.getByTestId('watcher-category')).toHaveCount(2);
  await expect(page.getByTestId('watcher-category').nth(0)).toContainText('Batterien');
  await expect(page.getByTestId('watcher-category').nth(1)).toContainText('Ohne Kategorie');

  // Spaltenkopf und Zeilen: alle Spalten bei 1440 px, bündig (gleiche linke Kante je Spalte)
  const head = page.getByTestId('watcher-table-head');
  for (const label of ['Wächter', 'Bedingung', 'Aktuell', 'Status', 'Zuletzt', 'Nächste Aufgabe', 'Zuständig']) await expect(head).toContainText(label);
  const cols = async () =>
    page.evaluate(() => {
      const headCells = [...document.querySelectorAll('[data-testid=watcher-table-head] > div > span')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().left));
      const rows = [...document.querySelectorAll('[data-testid=watcher-row]')].map((li) => [...li.children].filter((e) => e.tagName !== 'BUTTON' && e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().left)));
      return { headCells, rows };
    });
  let c = await cols();
  expect(c.headCells.length).toBe(8);
  for (const r of c.rows) {
    expect(r.length).toBe(8);
    r.forEach((x, i) => expect(Math.abs(x - c.headCells[i]!), `Spalte ${i} bündig`).toBeLessThanOrEqual(2));
  }
  const row = page.getByTestId('watcher-row').filter({ hasText: `Bad ${tag}` });
  await expect(row.getByTestId('watcher-condition')).toContainText('unter 5 % liegt');
  await expect(row.getByTestId('watcher-value')).toHaveText('12 %');
  await expect(row.getByTestId('watcher-last')).toHaveText('Nie');
  await expect(row.getByTestId('watcher-next')).toContainText(`Aufgabe Bad ${tag}`);
  await expect(row.getByTestId('watcher-who')).toBeVisible();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);

  // Schalter in der Zeile: wirkt auf den Server, die Zeile bleibt, gedämpft, Status „Aus"
  await row.getByRole('switch', { name: `Bad ${tag} aktiv` }).click();
  await expect.poll(async () => ((await (await request.get('/api/watchers')).json()) as { items: { id: string; active: boolean }[] }).items.find((w) => w.id === ids[1])!.active).toBe(false);
  await expect(row.getByTestId('watcher-status')).toContainText('Aus');
  await expect(page.getByTestId('watcher-row')).toHaveCount(4);

  // Tippen auf die Zeile (irgendwo außer dem Schalter) öffnet den Wächter
  const cell = (await row.getByTestId('watcher-condition').boundingBox())!;
  await page.mouse.click(cell.x + cell.width / 2, cell.y + cell.height / 2); // wie ein Mensch: ein Klick auf die Fläche, nicht auf einen Knopf
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Tastatur: der Name ist ein Knopf (Enter öffnet)
  await row.getByRole('button', { name: `Wächter Bad ${tag} öffnen` }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');

  // Kategorien klappen (aria-expanded), die Suche klappt Treffer-Gruppen wieder auf
  const batt = page.getByTestId('watcher-category').nth(0);
  await batt.getByRole('button', { expanded: true }).click();
  await expect(batt.getByTestId('watcher-row')).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await page.keyboard.type(`Handy ${tag}`);
  await expect(page.getByTestId('watcher-row')).toHaveCount(1);
  await expect(page.getByTestId('watcher-category').nth(0)).toContainText('Batterien');
  await page.keyboard.press('Escape');
  await batt.getByRole('button', { expanded: false }).click();
  await expect(batt.getByTestId('watcher-row')).toHaveCount(2);

  // schmaleres Fenster (1024 px): Spalten fallen weg statt zu quetschen, nichts läuft über
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect.poll(async () => (await cols()).headCells.length).toBeLessThan(8);
  c = await cols();
  expect(c.headCells.length).toBeGreaterThanOrEqual(4);
  for (const r of c.rows) r.forEach((x, i) => expect(Math.abs(x - c.headCells[i]!)).toBeLessThanOrEqual(2));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  for (const id of ids) await request.delete(`/api/watchers/${id}`);
});
