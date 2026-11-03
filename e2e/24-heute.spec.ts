import { expect, test, type APIRequestContext } from '@playwright/test';

// Heute: was ist für mich dran, was haben die anderen. Der Test-Server meldet jeden als „rene" an (eine Person, ohne Home Assistant Administrator).
// Der Server wird mit anderen Tests geteilt: eindeutige Titel, Termine mit festem Abstand zu „jetzt" (nicht abhängig von der Tageszeit:
// „vor einer Stunde" ist überfällig, „in einem Tag" ist morgen, beides liegt in jedem Fall im Fenster bis Ende morgen).
const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const boardIds: string[] = [];

test.afterAll(async ({ request }) => {
  for (const id of boardIds) await request.delete(`/api/boards/${id}`);
});

async function seed(request: APIRequestContext) {
  const people = (await (await request.get('/api/people')).json()) as { id: string; name: string; isPerson: boolean }[];
  const me = ((await (await request.get('/api/me')).json()) as { user: { id: string } }).user.id;
  const other = people.find((p) => p.isPerson && p.id !== me)!;
  const tag = unique();
  const board = (await (await request.post('/api/boards', { data: { name: `Heute ${tag}` } })).json()) as { id: string };
  boardIds.push(board.id);
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  const columnId = view.columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  const mk = async (title: string, extra: Record<string, unknown>) =>
    ((await (await request.post(`/api/boards/${board.id}/cards`, { data: { title, columnId, ...extra } })).json()) as { id: string });
  return { me, other, tag, boardId: board.id, mk };
}

test('Heute: meine Karten mit Termin bis morgen, die anderen nicht; Erledigen nimmt sie weg', async ({ page, request }) => {
  const s = await seed(request);
  const overdue = `Überfällig ${s.tag}`;
  const tomorrow = `Morgen ${s.tag}`;
  const later = `Später ${s.tag}`;
  const foreign = `Fremd ${s.tag}`;
  await s.mk(overdue, { assigneeIds: [s.me], dueAt: new Date(Date.now() - 3_600_000).toISOString() });
  await s.mk(tomorrow, { assigneeIds: [s.me], dueAt: new Date(Date.now() + 86_400_000).toISOString() });
  await s.mk(later, { assigneeIds: [s.me], dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString() });
  await s.mk(foreign, { assigneeIds: [s.other.id], dueAt: new Date(Date.now() - 3_600_000).toISOString() });

  await page.goto('/');
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Heute' }).click();
  const mine = page.getByTestId('today-mine');
  await expect(mine.getByText(overdue)).toBeVisible();
  await expect(mine.getByText(tomorrow)).toBeVisible();
  await expect(mine.getByText(later)).toHaveCount(0);
  await expect(mine.getByText(foreign)).toHaveCount(0);
  await expect(page.getByTestId('today-sentence')).toContainText('für dich');

  // Erledigen per Kreis nimmt die Karte weg
  await mine.getByRole('button', { name: `„${overdue}“ erledigen` }).click();
  await expect(mine.getByText(overdue)).toHaveCount(0);
  const done = (await (await request.get(`/api/boards/${s.boardId}`)).json()) as { cards: { title: string; completedAt: string | null }[] };
  expect(done.cards.find((c) => c.title === overdue)?.completedAt).not.toBeNull();
});

test('Heute: „Bei den anderen" führt zu „Diese Woche", ohne Rangliste', async ({ page, request }) => {
  const s = await seed(request);
  await s.mk(`Für andere ${s.tag}`, { assigneeIds: [s.other.id] });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Heute' }).click();
  await page.getByRole('button', { name: /Karten? offen/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Diese Woche', { exact: true }).first()).toBeVisible();
  await expect(dialog.getByTestId('fairness')).toBeVisible();
  await expect(dialog).not.toContainText(/Platz|Rang|Sieger|Punkte|%/);
});

test('Kopfzeile: „‹ Dashboard" steht auf allen vier Reitern, der Avatar rechts', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Ansicht' });
  for (const tab of ['Heute', 'Boards', 'Kalender', 'Zuhause']) {
    await nav.getByRole('button', { name: tab }).click();
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Einstellungen öffnen' })).toBeVisible();
  }
});
