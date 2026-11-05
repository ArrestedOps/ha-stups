import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { openBoards } from './helpers';

// Der Test-Server meldet jeden als „rene" an. Conny kommt über die Header, die sonst der Ingress-Proxy setzt;
// ihr Name verknüpft sie mit der vorhandenen Person „Conny".
const connyHeaders = {
  'x-remote-user-id': 'ha-conny-e2e',
  'x-remote-user-name': 'conny',
  'x-remote-user-display-name': 'Conny',
};

test.describe.configure({ timeout: 90_000 });

const BOARD = 'Stups-Test';

async function setup(request: APIRequestContext) {
  const people = (await (await request.get('/api/people')).json()) as { id: string; name: string }[];
  const conny = people.find((p) => p.name === 'Conny')!;
  const rene = people.find((p) => p.name === 'Rene')!;
  // Push-Geräte: nur wer eines hat, ist wählbar. Ruhezeit aus, damit die Tageszeit den Test nicht beeinflusst.
  for (const p of [conny, rene]) {
    await request.patch(`/api/access/people/${p.id}`, { data: { notifyServices: [`mobile_app_${p.name.toLowerCase()}_e2e`], quietOff: true } });
  }
  const boards = (await (await request.get('/api/boards')).json()) as { id: string; name: string }[];
  const boardId = boards.find((b) => b.name === BOARD)?.id ?? ((await (await request.post('/api/boards', { data: { name: BOARD } })).json()).id as string);
  const columns = (await (await request.get(`/api/boards/${boardId}`)).json()).columns as { id: string }[];
  const title = `Mülltonne ${Date.now().toString(36)}`;
  const card = await (
    await request.post(`/api/boards/${boardId}/cards`, { data: { title, columnId: columns[0]!.id, assigneeIds: [conny.id] } })
  ).json();
  return { boardId, cardId: card.id as string, title };
}

async function connyPage(browser: Browser, baseURL: string, boardId: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: connyHeaders });
  await context.addInitScript((id) => localStorage.setItem('stups.board', id), boardId);
  return context.newPage();
}

test('Stupsen: Rene stupst Conny, Abzeichen und Verlauf erscheinen live bei ihr', async ({ page, browser, request }, info) => {
  const { boardId, title } = await setup(request);
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), boardId);
  const conny = await connyPage(browser, String(info.project.use.baseURL), boardId);
  try {
    await conny.goto('/');
    await openBoards(conny);
    await expect(conny.getByRole('tablist', { name: 'Spalten' })).toBeVisible();
    await conny.getByRole('tab', { name: /^Offen/ }).click();
    await expect(conny.getByRole('button', { name: /Offline/ })).toHaveCount(0);

    // Rene öffnet die Karte und stupst Conny (als Zuständige vorausgewählt)
    await page.goto('/');
    await openBoards(page);
    await page.getByRole('tab', { name: /^Offen/ }).click();
    await page.locator('[role=presentation]').filter({ hasText: title }).getByText(title).click();
    await page.getByRole('button', { name: 'Stupsen' }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Conny', pressed: true })).toBeVisible(); // die Personen sind Chips (aria-pressed)
    await page.getByRole('radio', { name: 'Heute noch?' }).click();
    await page.getByRole('button', { name: 'Stups senden' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Gestupst!' })).toBeVisible();
    await expect(page.getByText('Senden fehlgeschlagen')).toHaveCount(0);

    // Rene sieht den dezenten Hinweis an der Karte
    await expect(page.locator('[role=presentation]').filter({ hasText: title }).getByTestId('nudge-from-me')).toContainText('Du hast Conny gestupst');

    // Conny sieht es ohne Neuladen: deutliches Abzeichen und der Filter „Nur mit offenem Stups" (im Blatt hinter dem Filter-Knopf)
    const row = conny.locator('[role=presentation]').filter({ hasText: title });
    await expect(row.getByTestId('nudge-to-me')).toContainText('Rene stupst dich', { timeout: 15_000 });
    // Der Filter zeigt alle gestupsten Karten des Boards (frühere Läufe liegen noch dort), unsere ist dabei
    await conny.getByRole('button', { name: 'Filter' }).click();
    await conny.getByRole('switch', { name: 'Nur mit offenem Stups' }).click();
    await conny.getByRole('button', { name: /Karten? anzeigen/ }).click();
    await expect(row).toBeVisible();
    await expect(conny.locator('[role=presentation]').filter({ hasNot: conny.getByTestId('nudge-to-me') })).toHaveCount(0);

    // Im Verlauf der Karte steht der Stups
    await row.getByText(title).click();
    await expect(conny.getByText(/Gestupst: Conny · Heute noch\?/)).toBeVisible();
  } finally {
    await conny.context().close();
  }
});

test('Stupsen in der Ruhezeit: Hinweis nennt die Zustellzeit, kein Fehler', async ({ page, request }) => {
  const { boardId, title } = await setup(request);
  const people = (await (await request.get('/api/people')).json()) as { id: string; name: string }[];
  const conny = people.find((p) => p.name === 'Conny')!;
  // Ruhezeit den ganzen Tag: der Stups wartet bis zum Ende
  await request.patch(`/api/access/people/${conny.id}`, { data: { quietStart: '00:00', quietEnd: '23:59', quietOff: false } });
  try {
    await page.addInitScript((id) => localStorage.setItem('stups.board', id), boardId);
    await page.goto('/');
    await openBoards(page);
    await page.getByRole('tab', { name: /^Offen/ }).click();
    await page.locator('[role=presentation]').filter({ hasText: title }).getByText(title).click();
    await page.getByRole('button', { name: 'Stupsen' }).click();
    await page.getByRole('radio', { name: 'Heute noch?' }).click();
    await page.getByRole('button', { name: 'Stups senden' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Gestupst! Conny bekommt es um \d\d:\d\d/ })).toBeVisible();
    await expect(page.getByText('Senden fehlgeschlagen')).toHaveCount(0);
  } finally {
    await request.patch(`/api/access/people/${conny.id}`, { data: { quietOff: true } });
  }
});
test('Stupsen: nach einem Stups ist die Person 30 Minuten gesperrt, mit Uhrzeit', async ({ page, request }) => {
  const { boardId, cardId, title } = await setup(request);
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), boardId);
  const first = await request.post(`/api/cards/${cardId}/nudge`, { data: { to: [(await (await request.get('/api/people')).json()).find((p: { name: string }) => p.name === 'Conny').id], template: 'think' } });
  expect(first.status()).toBe(201);

  await page.goto('/');

  await openBoards(page);
  await page.getByRole('tab', { name: /^Offen/ }).click();
  await page.locator('[role=presentation]').filter({ hasText: title }).getByText(title).click();
  await page.getByRole('button', { name: 'Stupsen' }).click();
  const conny = page.getByRole('dialog').getByRole('button', { name: 'Conny' });
  await expect(conny).toBeDisabled();
  await expect(page.getByText(/wieder ab \d\d:\d\d/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stups senden' })).toBeDisabled();
});

test('Stupsen: wer kein Push-Gerät hat, steht ausgegraut mit Hinweis in der Liste', async ({ page, request }) => {
  const { boardId, title } = await setup(request);
  // Eine dritte Person ohne Gerät
  const name = `Ohne${Date.now().toString(36)}`;
  const person = await (await request.post('/api/access/people', { data: { name } })).json();
  try {
    await page.addInitScript((id) => localStorage.setItem('stups.board', id), boardId);
    await page.goto('/');
    await openBoards(page);
    await page.getByRole('tab', { name: /^Offen/ }).click();
    await page.locator('[role=presentation]').filter({ hasText: title }).getByText(title).click();
    await page.getByRole('button', { name: 'Stupsen' }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name })).toBeDisabled();
    await expect(page.getByText('hat kein Push-Gerät')).toBeVisible();
  } finally {
    await request.delete(`/api/access/people/${person.id}`);
  }
});
