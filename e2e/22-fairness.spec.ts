import { expect, test, type APIRequestContext } from '@playwright/test';

// Fairness: Aufwand an der Karte setzen und die Fairness-Ansicht in der Agenda. Die Zahlen werden gegen den Stand VOR dem Test
// verglichen (der Server ist mit anderen Tests geteilt) und hängen nicht von der Tageszeit ab.
test.describe.configure({ mode: 'serial' });

interface FairnessData {
  total: { done: number };
  people: { id: string; name: string; done: number; effort: number }[];
}

const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const boardIds: string[] = [];
test.afterAll(async ({ request }) => {
  for (const id of boardIds) await request.delete(`/api/boards/${id}`);
});

const fairness = async (request: APIRequestContext) => (await (await request.get('/api/fairness?period=month')).json()) as FairnessData;
const me = async (request: APIRequestContext) => ((await (await request.get('/api/me')).json()) as { user: { id: string } }).user.id;

async function board(request: APIRequestContext) {
  const name = `Fair ${unique()}`;
  const b = (await (await request.post('/api/boards', { data: { name } })).json()) as { id: string };
  boardIds.push(b.id);
  const view = (await (await request.get(`/api/boards/${b.id}`)).json()) as { columns: { id: string }[] };
  return { id: b.id, name, columnId: view.columns[0]!.id };
}

test('Aufwand an der Karte wählen: gespeichert und als Chip zu sehen', async ({ page, request }) => {
  const b = await board(request);
  const title = `Groß ${unique()}`;
  const card = (await (await request.post(`/api/boards/${b.id}/cards`, { data: { title, columnId: b.columnId } })).json()) as { id: string };
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), b.id);
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(`^${title}`) }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Aufwand' }).click();
  await dialog.getByRole('button', { name: 'Groß', exact: true }).click();
  await expect.poll(async () => ((await (await request.get(`/api/cards/${card.id}`)).json()) as { effort: string | null }).effort).toBe('large');
  await expect(dialog.getByRole('button', { name: 'Groß', exact: true }).first()).toBeVisible();
});

test('Fairness-Ansicht: Umschalter in der Agenda, Zahlen steigen mit dem Erledigen, keine Rangliste', async ({ page, request }) => {
  const before = await fairness(request);
  const myId = await me(request);
  const mineBefore = before.people.find((p) => p.id === myId)!;

  const b = await board(request);
  for (const [title, effort] of [['Klein', 'small'], ['Groß', 'large']] as const) {
    const card = (await (await request.post(`/api/boards/${b.id}/cards`, { data: { title: `${title} ${unique()}`, columnId: b.columnId, effort, assigneeIds: [myId] } })).json()) as { id: string };
    const done = await request.post(`/api/cards/${card.id}/complete`);
    expect(done.status()).toBe(200);
  }

  await page.goto('/');
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Agenda' }).click();
  const group = page.getByRole('group', { name: 'Ansicht der Agenda' });
  await expect(group.getByRole('button', { name: 'Termine' })).toHaveAttribute('aria-pressed', 'true');
  await group.getByRole('button', { name: 'Fairness' }).click();
  await page.getByRole('group', { name: 'Zeitraum' }).getByRole('button', { name: 'Dieser Monat' }).click();

  const view = page.getByTestId('fairness');
  await expect(view).toBeVisible();
  await expect(page.getByTestId('fairness-sentence')).toContainText(`${before.total.done + 2} Aufgaben erledigt`);
  await expect(page.getByTestId(`fairness-${myId}`)).toContainText(`${mineBefore.done + 2} erledigt`);

  const after = await fairness(request);
  expect(after.people.find((p) => p.id === myId)!.effort - mineBefore.effort).toBe(1 + 3); // klein = 1, groß = 3

  // Keine Rangliste: Die Reihenfolge ist die der Personenliste, nicht nach Zahlen sortiert; keine Plätze oder Medaillen im Text
  const names = await view.locator('li span.truncate').allTextContents();
  expect(names).toEqual(after.people.map((p) => p.name));
  await expect(view).not.toContainText(/Platz|Rang|Sieger|🥇|🏆/);

  // Zurück zu den Terminen: die Wahl wird gemerkt
  await group.getByRole('button', { name: 'Termine' }).click();
  await expect(view).toHaveCount(0);
  await page.reload();
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Agenda' }).click();
  await expect(page.getByRole('group', { name: 'Ansicht der Agenda' }).getByRole('button', { name: 'Termine' })).toHaveAttribute('aria-pressed', 'true');
});
