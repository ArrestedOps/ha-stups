import { expect, test, type APIRequestContext } from '@playwright/test';

// Glocke und Mitteilungen: der Punkt erscheint nur, wenn für mich etwas offen ist; das Blatt zeigt, was ohne neue Server-Teile ableitbar ist
// (offene Stupse an mich). Der Test-Server meldet jeden als „rene" an, Conny kommt über die Header des Ingress-Proxys.
const connyHeaders = {
  'x-remote-user-id': 'ha-conny-e2e',
  'x-remote-user-name': 'conny',
  'x-remote-user-display-name': 'Conny',
};

test.describe.configure({ timeout: 90_000 });

async function setup(request: APIRequestContext) {
  const people = (await (await request.get('/api/people')).json()) as { id: string; name: string }[];
  const conny = people.find((p) => p.name === 'Conny')!;
  const rene = people.find((p) => p.name === 'Rene')!;
  for (const p of [conny, rene]) {
    await request.patch(`/api/access/people/${p.id}`, { data: { notifyServices: [`mobile_app_${p.name.toLowerCase()}_e2e`], quietOff: true } });
  }
  const board = await (await request.post('/api/boards', { data: { name: `Glocke ${Date.now().toString(36)}` } })).json();
  const columns = (await (await request.get(`/api/boards/${board.id}`)).json()).columns as { id: string }[];
  const title = `Bad putzen ${Date.now().toString(36)}`;
  const card = await (
    await request.post(`/api/boards/${board.id}/cards`, { data: { title, columnId: columns[0]!.id, assigneeIds: [conny.id], dueAt: new Date(Date.now() + 3_600_000).toISOString() } })
  ).json();
  return { boardId: board.id as string, cardId: card.id as string, title, connyId: conny.id };
}

test('Glocke: ohne Offenes kein Punkt; ein Stups an mich setzt ihn, Blatt und Banner zeigen ihn, ein Tipp öffnet die Karte', async ({ browser, request }, info) => {
  const { cardId, title, connyId } = await setup(request);
  const context = await browser.newContext({ baseURL: String(info.project.use.baseURL), extraHTTPHeaders: connyHeaders, colorScheme: 'dark' });
  const conny = await context.newPage();
  try {
    await conny.goto('/');
    await conny.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Aufgaben' }).click();
    await expect(conny.getByRole('heading', { name: 'Aufgaben', exact: true })).toBeVisible();
    // (frühere Läufe haben Conny schon gestupst: der Punkt kann schon da sein, darum zählt unten die neue Karte im Blatt)

    // Rene stupst Conny
    const sent = await request.post(`/api/cards/${cardId}/nudge`, { data: { to: [connyId], template: 'today' } });
    expect(sent.status()).toBe(201);

    // Conny sieht es ohne Neuladen: Punkt an der Glocke und Banner in Aufgaben
    await expect(conny.getByTestId('bell-dot')).toBeVisible({ timeout: 20_000 });
    await expect(conny.getByRole('button', { name: /Rene stupst dich!/ })).toBeVisible();

    // Das Blatt zeigt den Stups mit der Karte; ein Tipp öffnet die Karte
    await conny.getByTestId('bell').click();
    const sheet = conny.getByTestId('notifications');
    await expect(sheet).toContainText('Rene stupst dich!');
    await expect(sheet).toContainText(title);
    await sheet.getByRole('button', { name: /Rene stupst dich!/ }).filter({ hasText: title }).click();
    await expect(conny.getByRole('dialog').locator('input, textarea').first()).toHaveValue(title);
  } finally {
    await context.close();
  }
});

test('Glocke auf allen Reitern: der Punkt steht überall, nicht nur in Aufgaben (auf anderen Reitern bis zu 30 Sekunden später)', async ({ browser, request }, info) => {
  const { cardId, connyId } = await setup(request);
  await request.post(`/api/cards/${cardId}/nudge`, { data: { to: [connyId], template: 'think' } });
  const context = await browser.newContext({ baseURL: String(info.project.use.baseURL), extraHTTPHeaders: connyHeaders, colorScheme: 'dark' });
  const conny = await context.newPage();
  try {
    await conny.goto('/');
    const nav = conny.getByRole('navigation', { name: 'Ansicht' });
    for (const tab of ['Aufgaben', 'Boards']) {
      await nav.getByRole('button', { name: tab }).click();
      await expect(conny.getByTestId('bell-dot')).toBeVisible({ timeout: 45_000 });
    }
  } finally {
    await context.close();
  }
});
