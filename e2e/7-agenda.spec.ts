import { openList, openBoards } from './helpers';
import { expect, test, type APIRequestContext } from '@playwright/test';

test.describe.configure({ timeout: 90_000 });

const DAY = 86_400_000;

async function seed(request: APIRequestContext) {
  const tag = Date.now().toString(36);
  const people = (await (await request.get('/api/people')).json()) as { id: string; name: string }[];
  const conny = people.find((p) => p.name === 'Conny')!;
  const boardA = (await (await request.post('/api/boards', { data: { name: `Haushalt ${tag}` } })).json()).id as string;
  const boardB = (await (await request.post('/api/boards', { data: { name: `Umbau ${tag}` } })).json()).id as string;
  const mk = async (boardId: string, title: string, dueAt: string, assigneeIds: string[]) => {
    const columns = (await (await request.get(`/api/boards/${boardId}`)).json()).columns as { id: string }[];
    const res = await request.post(`/api/boards/${boardId}/cards`, { data: { title, columnId: columns[0]!.id, dueAt, assigneeIds } });
    return (await res.json()).id as string;
  };
  const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();
  const t = { fenster: `Fenster putzen ${tag}`, elektriker: `Elektriker ${tag}`, papier: `Papier ${tag}` };
  await mk(boardA, t.fenster, inDays(1), [conny.id]);
  await mk(boardB, t.elektriker, inDays(3), []);
  const own = await mk(boardA, t.papier, inDays(2), []);
  return { tag, t, own, boardAName: `Haushalt ${tag}`, boardBName: `Umbau ${tag}` };
}

test('Agenda: Karten aller Boards nach Tagen, Filter nach Person und Board', async ({ page, request }) => {
  const s = await seed(request);
  await page.goto('/');
  await openBoards(page);
  await openList(page);

  const agenda = page.getByTestId('tasks');
  for (const title of Object.values(s.t)) await expect(agenda.getByText(title)).toBeVisible();

  // Person: nur Conny
  await page.getByRole('group', { name: 'Personen' }).getByRole('button', { name: /Conny/ }).click();
  await expect(agenda.getByText(s.t.fenster)).toBeVisible();
  await expect(agenda.getByText(s.t.elektriker)).toBeHidden();
  await expect(agenda.getByText(s.t.papier)).toBeHidden();

  // „Niemand" dazu: die Karten ohne Zuständige kommen mit („Niemand" und die Boards stehen im Blatt hinter dem Knopf „Filter")
  await page.getByRole('button', { name: 'Filter' }).click();
  const sheet = page.getByTestId('filter-sheet');
  await sheet.getByRole('group', { name: 'Personen' }).getByRole('button', { name: /Niemand/ }).click();
  await expect(agenda.getByText(s.t.elektriker)).toBeVisible();

  // Board: nur „Umbau"
  await sheet.getByRole('group', { name: 'Boards' }).getByRole('button', { name: new RegExp(s.boardBName) }).click();
  await expect(agenda.getByText(s.t.elektriker)).toBeVisible();
  await expect(agenda.getByText(s.t.fenster)).toBeHidden();

  // Zurücksetzen
  await page.getByRole('dialog').getByRole('button', { name: 'Zurücksetzen' }).click();
  await expect(agenda.getByText(s.t.fenster)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: /Aufgaben? anzeigen/ }).click();

  // Der Filter bleibt auf dem Gerät erhalten
  await page.getByTestId('tasks').getByRole('group', { name: 'Personen' }).getByRole('button', { name: /Conny/ }).click();
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Aufgaben' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('tasks')).toBeVisible();
  await expect(agenda.getByText(s.t.fenster)).toBeVisible();
  await expect(agenda.getByText(s.t.papier)).toBeHidden();
});

test('Agenda: Karte aus einem anderen Board öffnen und von dort erledigen', async ({ page, request }) => {
  const s = await seed(request);
  await page.goto('/');
  await openBoards(page);
  await openList(page);
  const agenda = page.getByTestId('tasks');

  await agenda.getByText(s.t.elektriker).click();
  await expect(page.getByRole('dialog').locator('input, textarea').first()).toHaveValue(s.t.elektriker);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  await agenda.getByRole('checkbox', { name: `„${s.t.papier}“ erledigen` }).click();
  await expect(agenda.getByText(s.t.papier)).toBeHidden();
  // auf Wunsch weiter sichtbar
  await page.getByRole('button', { name: 'Filter' }).click();
  await page.getByRole('switch', { name: 'Erledigte anzeigen' }).click();
  await expect(agenda.getByText(s.t.papier)).toBeVisible();
});

test('Karte löschen fragt vorher nach', async ({ page, request }) => {
  const s = await seed(request);
  await page.goto('/');
  await openBoards(page);
  await openList(page);
  const agenda = page.getByTestId('tasks');

  await agenda.getByText(s.t.fenster).click();
  await page.getByRole('button', { name: 'Karte löschen' }).click();
  const ask = page.getByRole('alertdialog');
  await expect(ask).toContainText('Karte löschen?');

  await ask.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(ask).toBeHidden();
  await expect(page.getByRole('dialog').locator('input, textarea').first()).toHaveValue(s.t.fenster);

  await page.getByRole('button', { name: 'Karte löschen' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText('Karte gelöscht')).toBeVisible();
});
