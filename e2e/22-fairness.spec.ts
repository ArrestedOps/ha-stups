import { expect, test, type APIRequestContext } from '@playwright/test';

// Fairness: Aufwand an der Karte setzen und die Seite „Diese Woche". Die Zahlen werden gegen den Stand VOR dem Test
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

/** „Diese Woche" öffnen: über die Zeile „Fairness diese Woche" am Ende von Aufgaben */
async function openWeek(page: import('@playwright/test').Page, request: APIRequestContext) {
  const myId = await me(request);
  const people = (await (await request.get('/api/people')).json()) as { id: string; isPerson: boolean }[];
  const other = people.find((p) => p.isPerson && p.id !== myId);
  if (other) {
    const b = await board(request);
    await request.post(`/api/boards/${b.id}/cards`, { data: { title: `Für andere ${unique()}`, columnId: b.columnId, assigneeIds: [other.id] } });
  }
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Aufgaben' }).click();
  await page.getByRole('button', { name: /Fairness diese Woche/ }).click();
  await expect(page.getByTestId('fairness')).toBeVisible();
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

test('Diese Woche (Aufgaben › Fairness): Zahlen steigen mit dem Erledigen, keine Rangliste', async ({ page, request }) => {
  const before = await fairness(request);
  const myId = await me(request);
  const mineBefore = before.people.find((p) => p.id === myId)!;

  const b = await board(request);
  for (const [title, effort] of [['Klein', 'small'], ['Groß', 'large']] as const) {
    const card = (await (await request.post(`/api/boards/${b.id}/cards`, { data: { title: `${title} ${unique()}`, columnId: b.columnId, effort, assigneeIds: [myId] } })).json()) as { id: string };
    const done = await request.post(`/api/cards/${card.id}/complete`);
    expect(done.status()).toBe(200);
  }

  // „Diese Woche": über die Zeile am Ende von Aufgaben
  await openWeek(page, request);
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

  // Schließen: zurück auf Aufgaben
  await page.keyboard.press('Escape');
  await expect(view).toHaveCount(0);
});
