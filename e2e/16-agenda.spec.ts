import { expect, test } from '@playwright/test';
import { openList, openBoards } from './helpers';

// Fehler aus der Praxis: Karten, die mehr als 60 Tage entfernt sind, standen nicht in der Agenda. Die Liste in Aufgaben schaut jetzt über Jahre voraus.
const DAY = 86_400_000;

test('Liste: Karten in über 60 Tagen stehen unter „Später", auch wenn sonst nichts ansteht', async ({ page, request }) => {
  // eindeutiger Name: das Projekt läuft in dunkel und hell auf demselben Server
  const name = `Fern ${Date.now().toString(36)}`;
  const board = (await (await request.post('/api/boards', { data: { name } })).json()) as { id: string };
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  const openId = view.columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  const far = await request.post(`/api/boards/${board.id}/cards`, { data: { columnId: openId, title: 'Treppen mit Spots versehen', dueAt: new Date(Date.now() + 100 * DAY).toISOString() } });
  expect(far.status()).toBe(201);

  await page.goto('/');

  await openBoards(page);
  await openList(page);

  await page.getByRole('button', { name: 'Filter' }).click();
  // nur dieses Board zeigen (wie in der Praxis: ein Board-Filter, in dem nichts in den nächsten 60 Tagen liegt)
  await page.getByRole('group', { name: 'Boards' }).getByRole('button', { name: new RegExp('^' + name) }).click();
  // die Karte liegt in 100 Tagen: die Liste schaut über Jahre voraus, sie steht in „Später" (kein Knopf „Weitere Tage laden" mehr nötig)
  await expect(page.getByTestId('group-later').getByText('Treppen mit Spots versehen')).toBeVisible();
});
