import { expect, test } from '@playwright/test';

// Fehler aus der Praxis: Karten, die mehr als 60 Tage entfernt sind, standen nicht in der Agenda, und bei leerer Liste fehlte der Knopf „Weitere Tage laden".
const DAY = 86_400_000;

test('Agenda: Karten in über 60 Tagen sind einen Tipp entfernt, auch wenn die Liste sonst leer ist', async ({ page, request }) => {
  // eindeutiger Name: das Projekt läuft in dunkel und hell auf demselben Server
  const name = `Fern ${Date.now().toString(36)}`;
  const board = (await (await request.post('/api/boards', { data: { name } })).json()) as { id: string };
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  const openId = view.columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  const far = await request.post(`/api/boards/${board.id}/cards`, { data: { columnId: openId, title: 'Treppen mit Spots versehen', dueAt: new Date(Date.now() + 100 * DAY).toISOString() } });
  expect(far.status()).toBe(201);

  await page.goto('/');
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Agenda' }).click();
  await expect(page.getByTestId('agenda')).toBeVisible();

  // nur dieses Board zeigen (wie in der Praxis: ein Board-Filter, in dem nichts in den nächsten 60 Tagen liegt)
  await page.getByRole('group', { name: 'Boards' }).getByRole('button', { name: new RegExp('^' + name) }).click();
  const agenda = page.getByTestId('agenda');
  // die Karte liegt in 100 Tagen: entweder schon sichtbar (die Agenda hat ein Jahr vorausgeschaut) oder über den Knopf erreichbar
  const card = agenda.getByText('Treppen mit Spots versehen');
  if (!(await card.isVisible().catch(() => false))) {
    const more = agenda.getByRole('button', { name: /Weitere 60 Tage laden/ });
    await expect(more).toBeVisible(); // auch bei leerer Liste
    await expect(agenda.getByText(/gibt es mit diesem Filter keine Karte mit Termin/)).toBeVisible();
    await more.click();
    await more.click().catch(() => undefined);
  }
  await expect(card).toBeVisible();
});
