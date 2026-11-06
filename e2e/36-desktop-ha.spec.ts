import { expect, test } from '@playwright/test';

// Wächter am Desktop (Server mit nachgebautem Home Assistant): Raster aus gleich hohen Karten, „Neuer Wächter“ als Knopf neben dem Kopf.
const MOCK = 'http://127.0.0.1:18411';
test.describe.configure({ timeout: 90_000 });

const sideNav = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Ansicht' });

test('Wächter: Raster in zwei oder drei Spalten, alle Karten einer Reihe gleich hoch, kein „+“ des Handys, Neuer Wächter als Knopf', async ({ page, request }) => {
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
  // alle vier lösen aus: vier offene Karten vom Haus, Abschnitt „Wartet auf jemanden“ mit vier Karten
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

  // jedes Raster: Zeilen mit gleich hohen Karten, bis zu drei Spalten
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
    expect(g.equal, 'Karten einer Reihe gleich hoch').toBe(true);
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

  await page.getByTestId('new-watcher').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect.poll(async () => Math.round((await page.getByRole('dialog').boundingBox())!.width)).toBe(600);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
