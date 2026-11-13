import { expect, test, type APIRequestContext } from '@playwright/test';

// Glocke und Mitteilungen: der Posteingang je Person (Server: GET /api/inbox). Die kleine Zahl zeigt nur Ungelesenes, „Alle gelesen“ gilt je Person
// und bleibt nach dem Neuladen; ein Kind sieht nur Eigenes. Der Test-Server meldet jeden als „rene" an, Conny kommt über die Header des Ingress-Proxys.
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

test('Glocke: ein Stups an mich setzt den Punkt, Blatt und Banner zeigen ihn, ein Tipp öffnet die Aufgabe, „Alle gelesen“ löscht den Punkt (auch nach dem Neuladen)', async ({ browser, request }, info) => {
  const { cardId, title, connyId } = await setup(request);
  const context = await browser.newContext({ baseURL: String(info.project.use.baseURL), extraHTTPHeaders: connyHeaders, colorScheme: 'dark' });
  const conny = await context.newPage();
  try {
    await conny.goto('/');
    await conny.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Aufgaben' }).click();
    await expect(conny.getByRole('heading', { name: 'Aufgaben', exact: true })).toBeVisible();
    // (frühere Läufe haben Conny schon gestupst: der Punkt kann schon da sein, darum zählt unten die neue Aufgabe im Blatt)

    // Rene stupst Conny
    const sent = await request.post(`/api/cards/${cardId}/nudge`, { data: { to: [connyId], template: 'today' } });
    expect(sent.status()).toBe(201);

    // Conny sieht es ohne Neuladen: Punkt an der Glocke und Banner in Aufgaben
    await expect(conny.getByTestId('bell-dot')).toBeVisible({ timeout: 20_000 });
    // eine kleine Zahl (ab 10 „9+"), der Screenreader nennt die Anzahl
    await expect(conny.getByTestId('bell-dot')).toHaveText(/^(\d|9\+)$/);
    await expect(conny.getByTestId('bell')).toHaveAccessibleName(/^Mitteilungen, \d+ ungelesen$/);
    await expect(conny.getByRole('button', { name: /Rene stupst dich!/ })).toBeVisible();

    // Das Blatt zeigt den Stups mit der Aufgabe; ein Tipp öffnet die Aufgabe
    await conny.getByTestId('bell').click();
    const sheet = conny.getByTestId('notifications');
    await expect(sheet).toContainText('Rene stupst dich 👋');
    await expect(sheet).toContainText(title);
    await expect(sheet.getByTestId('inbox-group-today')).toBeVisible();
    // Filter: unter „Kommentare“ steht dieser Stups nicht
    await conny.getByRole('group', { name: 'Art der Mitteilung' }).getByRole('button', { name: 'Kommentare' }).click();
    await expect(sheet).not.toContainText(title);
    await conny.getByRole('group', { name: 'Art der Mitteilung' }).getByRole('button', { name: 'Stupse' }).click();
    await expect(sheet).toContainText(title);
    await conny.getByRole('group', { name: 'Art der Mitteilung' }).getByRole('button', { name: 'Alle', exact: true }).click();

    // „Alle gelesen“: Punkt weg, Eintrag bleibt; nach dem Neuladen immer noch gelesen (der Marker liegt auf dem Server)
    await conny.getByRole('dialog', { name: 'Mitteilungen' }).getByRole('button', { name: 'Alle gelesen' }).click();
    await expect(conny.getByTestId('bell-dot')).toHaveCount(0);
    await expect(sheet.getByRole('img', { name: 'Neu' })).toHaveCount(0);
    await expect(sheet).toContainText(title);
    await conny.reload();
    await expect(conny.getByRole('button', { name: /^Mitteilungen/ })).toBeVisible();
    await expect(conny.getByTestId('bell-dot')).toHaveCount(0);

    await conny.getByTestId('bell').click();
    await conny.getByTestId('notifications').getByRole('button', { name: /Rene stupst dich/ }).filter({ hasText: title }).click();
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

test('Ein Kommentar von Rene erscheint bei Conny als Mitteilung mit Punkt; Rene sieht ihn nicht bei sich', async ({ browser, request }, info) => {
  const { cardId } = await setup(request);
  const context = await browser.newContext({ baseURL: String(info.project.use.baseURL), extraHTTPHeaders: connyHeaders, colorScheme: 'dark' });
  const conny = await context.newPage();
  try {
    await conny.goto('/');
    await conny.request.put('/api/me/inbox-seen', { data: {} });
    await conny.reload();
    await expect(conny.getByTestId('bell-dot')).toHaveCount(0);
    const text = `Elektriker kommt am Dienstag ${Date.now().toString(36)}`;
    expect((await request.post(`/api/cards/${cardId}/comments`, { data: { text } })).status()).toBe(201);
    await expect(conny.getByTestId('bell-dot')).toBeVisible({ timeout: 45_000 });
    await conny.getByTestId('bell').click();
    const sheet = conny.getByTestId('notifications');
    await expect(sheet).toContainText('Rene hat kommentiert');
    await expect(sheet).toContainText(text);
    await conny.getByRole('group', { name: 'Art der Mitteilung' }).getByRole('button', { name: 'Kommentare' }).click();
    await expect(sheet).toContainText(text);
    // Rene hat den eigenen Kommentar nicht als Mitteilung
    const mine = (await (await request.get('/api/inbox')).json()) as { items: { text: string | null }[] };
    expect(mine.items.some((i) => i.text === text)).toBe(false);
  } finally {
    await context.close();
  }
});

test('Kind: die Mitteilungen zeigen nur Eigenes, nichts von fremden Aufgaben und Boards', async ({ browser, request }, info) => {
  const tag = Date.now().toString(36);
  const kid = (await (await request.post('/api/access/people', { data: { name: `Kind${tag}`, haUserId: `ha-kid-${tag}` } })).json()) as { id: string };
  await request.patch(`/api/access/people/${kid.id}`, { data: { isChild: true, childScope: 'assigned', quietOff: true } });
  const boards: string[] = [];
  const mk = async (name: string, assignees: string[]) => {
    const b = (await (await request.post('/api/boards', { data: { name: `${name} ${tag}` } })).json()) as { id: string };
    boards.push(b.id);
    const col = ((await (await request.get(`/api/boards/${b.id}`)).json()) as { columns: { id: string }[] }).columns[0]!.id;
    const c = (await (await request.post(`/api/boards/${b.id}/cards`, { data: { title: `${name} Aufgabe ${tag}`, columnId: col, assigneeIds: assignees } })).json()) as { id: string };
    await request.post(`/api/cards/${c.id}/comments`, { data: { text: `Kommentar zu ${name}` } });
    return c.id;
  };
  const own = await mk('Eigene', [kid.id]);
  await mk('Fremde', []);
  const context = await browser.newContext({
    baseURL: String(info.project.use.baseURL),
    extraHTTPHeaders: { 'x-remote-user-id': `ha-kid-${tag}`, 'x-remote-user-name': `kid${tag}`, 'x-remote-user-display-name': `Kind${tag}`, 'x-stups-language': 'de' },
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  try {
    await page.goto('/');
    const res = (await (await context.request.get('/api/inbox')).json()) as { items: { cardId: string }[] };
    expect(res.items.map((i) => i.cardId)).toEqual([own]);
    await expect(page.getByTestId('bell-dot')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('bell').click();
    const sheet = page.getByTestId('notifications');
    await expect(sheet).toContainText(`Eigene Aufgabe ${tag}`);
    await expect(sheet).not.toContainText(`Fremde Aufgabe ${tag}`);
    await expect(sheet).not.toContainText('Kommentar zu Fremde');
  } finally {
    await context.close();
    for (const id of boards) await request.delete(`/api/boards/${id}`);
    await request.delete(`/api/access/people/${kid.id}`);
  }
});
