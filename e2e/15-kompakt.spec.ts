import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openBoards } from './helpers';

// Kompakte Aufgaben: Ziel sind mindestens vier Aufgaben auf einem iPhone 15 im Hochformat (393 × 852).
test.use({ viewport: { width: 393, height: 852 } });

const DAY = 86_400_000;

/** Ein eigenes Board mit typischen Aufgaben (Titel, Termin, eine Person, eine Kategorie) */
async function typicalBoard(request: APIRequestContext, page: Page, name: string, count = 6) {
  const board = (await (await request.post('/api/boards', { data: { name } })).json()) as { id: string };
  const category = (await (await request.post(`/api/boards/${board.id}/categories`, { data: { name: 'Haushalt', color: 'green' } })).json()) as { id: string };
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  const openId = view.columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  const rene = ((await (await request.get('/api/people')).json()) as { id: string; name: string }[]).find((p) => p.name === 'Rene')!;
  for (let i = 0; i < count; i++) {
    const res = await request.post(`/api/boards/${board.id}/cards`, {
      data: { columnId: openId, title: `Typische Aufgabe ${i + 1}`, dueAt: new Date(Date.now() + (2 + i) * DAY).toISOString(), assigneeIds: [rene.id], categoryIds: [category.id] },
    });
    expect(res.status()).toBe(201);
  }
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), board.id);
  return { boardId: board.id, openId };
}

test('Mindestens vier typische Aufgaben stehen vollständig über der Leiste, jede mit höchstens einer Meta-Zeile', async ({ page, request }) => {
  await typicalBoard(request, page, 'Kompakt');
  await page.goto('/');
  await openBoards(page);
  // Aufgaben mit Termin in der Zukunft liegen von selbst in „Geplant"
  await page.getByRole('tab', { name: /^Geplant/ }).click();
  await expect(page.locator('[role=presentation]').first()).toBeVisible();

  const tabBarTop = await page.getByRole('navigation', { name: 'Ansicht' }).evaluate((el) => el.getBoundingClientRect().top);
  const boxes = await page.locator('[role=presentation]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    }),
  );
  const fully = boxes.filter((b) => b.top >= 0 && b.bottom <= tabBarTop);
  expect(fully.length, `vollständig sichtbar: ${fully.length}, Höhen ${boxes.map((b) => Math.round(b.height)).join('/')}`).toBeGreaterThanOrEqual(4);
  for (const b of boxes) expect(b.height).toBeLessThan(110);

  // genau eine Meta-Zeile je Aufgabe (eine Zeile hoch), „Angelegt …" gibt es in der Liste nicht mehr
  const meta = await page.getByTestId('card-meta').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(meta.length).toBeGreaterThanOrEqual(4);
  for (const h of meta) expect(h).toBeLessThan(24);
  await expect(page.getByTestId('card-created')).toHaveCount(0);
  await expect(page.getByText(/^Angelegt/)).toHaveCount(0);
});

test('Ein langer Titel braucht genau eine Zeile (hinten abgeschnitten), die Zeile bleibt 68 px hoch', async ({ page, request }) => {
  const { boardId, openId } = await typicalBoard(request, page, 'Langer Titel', 1);
  const long = 'Ein sehr langer Titel, der in der Liste nicht mehr als eine Zeile brauchen darf, auch wenn er viel länger ist als jeder Bildschirm breit sein kann';
  await request.post(`/api/boards/${boardId}/cards`, { data: { columnId: openId, title: long } });
  await page.goto('/');
  await openBoards(page);
  const card = page.locator('[role=presentation]').filter({ hasText: 'Ein sehr langer Titel' });
  await expect(card).toBeVisible();
  const title = card.locator('span.truncate').first();
  // Zeilenhöhe „normal" wie im Mockup: eine Zeile ist 15 px Schrift mal etwa 1,25 hoch, zwei Zeilen wären gut doppelt so hoch
  const fontSize = await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(await title.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(fontSize * 1.6);
  expect(Math.round(await card.evaluate((el) => el.getBoundingClientRect().height))).toBeLessThanOrEqual(70);
});

test('Termin: überfällig ist rot und erledigt nie, Wiederholung, Priorität und Checkliste erscheinen in der Zeile', async ({ page, request }) => {
  const { boardId, openId } = await typicalBoard(request, page, 'Meta', 1);
  const late = (await (await request.post(`/api/boards/${boardId}/cards`, { data: { columnId: openId, title: 'Zu spät', dueAt: new Date(Date.now() - 2 * DAY).toISOString(), priority: 'high', recurrence: { type: 'fixed', freq: 'weekly', every: 1, weekdays: [1] } } })).json()) as { id: string };
  await request.post(`/api/cards/${late.id}/checklist`, { data: { text: 'Eins' } });
  await page.goto('/');
  await openBoards(page);
  const row = page.locator('[role=presentation]').filter({ hasText: 'Zu spät' });
  await expect(row.getByTestId('card-due')).toHaveAttribute('data-overdue', 'true');
  await expect(row.getByTestId('card-due')).toHaveAccessibleName(/^Überfällig/);
  await expect(row.getByTestId('card-priority')).toHaveAttribute('data-level', 'high');
  await expect(row.getByLabel(/^Wiederholt:/)).toBeVisible();
  await expect(row.getByLabel('Checkliste 0 von 1')).toBeVisible();
  // eine Zeile, auch mit allen Angaben
  expect(await row.getByTestId('card-meta').evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(24);
  await page.getByRole('tab', { name: /^Geplant/ }).click();
  const normal = page.locator('[role=presentation]').filter({ hasText: 'Typische Aufgabe 1' });
  await expect(normal.getByTestId('card-due')).toHaveAttribute('data-overdue', 'false');
});


test('Der „+"-Knopf verdeckt nichts: die letzte Aufgabe lässt sich über ihn hinaus scrollen', async ({ page, request }) => {
  const { boardId, openId } = await typicalBoard(request, page, 'Knopf', 1);
  for (let i = 0; i < 9; i++) await request.post(`/api/boards/${boardId}/cards`, { data: { columnId: openId, title: `Eintrag ${i + 1}` } });
  await page.goto('/');
  await openBoards(page);
  const list = page.getByTestId('boards-scroll'); // die ganze Seite Boards scrollt (wie im Mockup)
  await expect(page.locator('[role=presentation]').nth(5)).toBeVisible();
  await list.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.waitForTimeout(150);
  const fabTop = await page.getByRole('button', { name: 'Neue Aufgabe', exact: true }).evaluate((el) => el.getBoundingClientRect().top);
  const lastBottom = await page.locator('[role=presentation]').last().evaluate((el) => el.getBoundingClientRect().bottom);
  expect(lastBottom, 'Die letzte Aufgabe endet über dem Knopf').toBeLessThanOrEqual(fabTop);
});

test('Spalten-Tabs: Verlauf am Rand zeigt, dass man wischen kann, und die aktive Spalte rückt ins Bild', async ({ page, request }) => {
  const { boardId } = await typicalBoard(request, page, 'Leiste', 1);
  for (const name of ['Wartet auf Rückmeldung', 'Beim Handwerker', 'Zur Prüfung beim Amt', 'Später im Jahr']) {
    await request.post(`/api/boards/${boardId}/columns`, { data: { name } });
  }
  await page.goto('/');
  await openBoards(page);
  const tabs = page.getByRole('tablist', { name: 'Spalten' });
  await expect(tabs).toHaveAttribute('data-fade-end', 'true');
  await expect(tabs).toHaveAttribute('data-fade-start', 'false');

  // Klick ohne Scrollen (wie ein Tipp auf eine halb sichtbare Spalte): die Leiste holt sie von selbst ins Bild
  await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[role=tab]')].find((t) => t.textContent?.includes('Später im Jahr'))!.click());
  const last = page.getByRole('tab', { name: /^Später im Jahr/ });
  await expect(last).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(async () => {
      const t = await tabs.evaluate((el) => el.getBoundingClientRect());
      const a = await last.evaluate((el) => el.getBoundingClientRect());
      return a.left >= t.left && a.right <= t.right;
    })
    .toBe(true);
  await expect(tabs).toHaveAttribute('data-fade-start', 'true');
  await expect(tabs).toHaveAttribute('data-fade-end', 'false');
});

test('Auswahlfelder zeigen den Wert und einen Pfeil; die Wahl am (durchsichtigen) Picker ändert die Anzeige', async ({ page, request }) => {
  const { boardId, openId } = await typicalBoard(request, page, 'Auswahl', 1);
  const card = (await (await request.post(`/api/boards/${boardId}/cards`, { data: { columnId: openId, title: 'Mit Termin', dueAt: new Date(Date.now() + 3 * DAY).toISOString() } })).json()) as { id: string };
  await page.goto(`/?card=${card.id}`);
  await page.getByRole('button', { name: /^Erinnerung: / }).click();
  const select = page.getByLabel('Vorab-Erinnerung');
  const shown = select.locator('xpath=..').getByTestId('select-value');
  await expect(shown).toHaveText('Nur zur Fälligkeit');
  await expect(select.locator('xpath=..').locator('svg')).toBeVisible(); // der Pfeil
  await select.selectOption({ index: 1 });
  const chosen = await select.evaluate((s: HTMLSelectElement) => s.selectedOptions[0]!.textContent!.trim());
  expect(chosen).not.toBe('Nur zur Fälligkeit');
  await expect(shown).toHaveText(chosen);
});
