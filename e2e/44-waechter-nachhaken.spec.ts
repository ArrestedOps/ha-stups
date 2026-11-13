import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Läuft nur im Projekt „waechter“ (nachgebautes Home Assistant, Handy): Stupsen, wenn noch offen, als Aufgabe mit Zeilen und dem Beispiel darin;
// die Regel kommt als Erinnerung an der Aufgabe beim Anlegen an.
test.describe.configure({ timeout: 90_000, mode: 'serial' });

const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });

async function setup(request: APIRequestContext) {
  const tag = Date.now().toString(36);
  const board = (await (await request.post('/api/boards', { data: { name: `Stups ${tag}` } })).json()) as { id: string };
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  return { tag, boardId: board.id, columnId: view.columns.find((c) => !c.isDone && !c.isPlanned)!.id };
}

test('Aufgabe mit Zeilen Nach / Wiederholen alle / Höchstens, Beispiel in der Aufgabe; gespeichert als nudge', async ({ page, request }) => {
  const s = await setup(request);
  const name = `Stups-Regel ${s.tag}`;
  const created = await request.post('/api/watchers', {
    data: {
      name,
      trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5, forMin: 3 },
      card: { boardId: s.boardId, columnId: s.columnId, title: `Ausräumen ${s.tag}`, due: { kind: 'in', minutes: 30 } },
      assign: { mode: 'rotation', personIds: [] },
      nudge: { afterMin: 30, everyMin: 30, max: 3 },
    },
  });
  expect(created.status()).toBe(201);
  const id = ((await created.json()) as { id: string; nudge: unknown }).id;
  expect(((await (await request.get('/api/watchers')).json()) as { items: { id: string; nudge: unknown }[] }).items.find((w) => w.id === id)!.nudge).toEqual({ afterMin: 30, everyMin: 30, max: 3 });

  await page.addInitScript((b) => localStorage.setItem('stups.board', b), s.boardId);
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await page.getByRole('button', { name: `Wächter ${name} öffnen` }).first().click();
  const d = page.getByRole('dialog');
  await d.getByRole('group', { name: 'Feinschliff' }).getByRole('button', { name: 'Stupsen nach 30 Min., alle 30 Min., 3 ×' }).click();
  const card = d.getByTestId('nudge-card');
  for (const row of ['Nach', 'Wiederholen alle', 'leer = nur einmal', 'Höchstens']) await expect(card).toContainText(row);
  await expect(card.getByTestId('nudge-example')).toContainText('Aufgabe angelegt 12:00 → Stups 12:30 · 13:00 · 13:30 (letzter)');
  await expect(card.getByTestId('nudge-example')).toContainText('Endet, sobald die Aufgabe erledigt ist.');
  // das alte Feld „Stupsen nach Minuten“ als eigene Zeile gibt es nicht mehr: alles steht in dieser einen Aufgabe
  await expect(d.getByTestId('nudge-card')).toHaveCount(1);

  // leer bei „Wiederholen alle“ = nur einmal: ein Stups, Höchstens gesperrt
  await card.getByLabel('Wiederholen alle Minuten').fill('');
  await expect(card.getByLabel('Höchstens so viele Stupse')).toBeDisabled();
  await expect(card.getByTestId('nudge-example')).toContainText('Stups 12:30');
  await expect(card.getByTestId('nudge-example')).not.toContainText('(letzter)');
  await d.getByRole('button', { name: 'Speichern', exact: true }).last().click();
  await expect(page.getByText('Wächter gespeichert')).toBeVisible();
  const saved = ((await (await request.get('/api/watchers')).json()) as { items: { id: string; nudge: unknown }[] }).items.find((w) => w.id === id)!;
  expect(saved.nudge).toEqual({ afterMin: 30, everyMin: null, max: 1 });
  await request.delete(`/api/watchers/${id}`);
});
