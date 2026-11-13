import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openBoards, openWatcherCategory } from './helpers';

// Läuft nur im Projekt „waechter": eigener Server mit nachgebautem Home Assistant (e2e/server-ha.mjs).
const MOCK = 'http://127.0.0.1:18411';
test.describe.configure({ timeout: 90_000, mode: 'serial' });

const connyHeaders = {
  'x-remote-user-id': 'ha-conny-e2e',
  'x-remote-user-name': 'conny',
  'x-remote-user-display-name': 'Conny',
};

const setState = (request: APIRequestContext, entityId: string, state: string) =>
  request.post(`${MOCK}/mock/state`, { data: { entityId, state } });

interface Person {
  id: string;
  name: string;
}

async function setup(request: APIRequestContext) {
  const people = (await (await request.get('/api/people')).json()) as Person[];
  const rene = people.find((p) => p.name === 'Rene')!;
  const conny = people.find((p) => p.name === 'Conny')!;
  await request.patch(`/api/access/people/${rene.id}`, { data: { notifyServices: ['mobile_app_rene_e2e'], quietOff: true } });
  await request.patch(`/api/access/people/${conny.id}`, { data: { notifyServices: ['mobile_app_conny_e2e'], quietOff: true } });
  const tag = Date.now().toString(36);
  const board = (await (await request.post('/api/boards', { data: { name: `Wächter ${tag}` } })).json()) as { id: string };
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  const columnId = view.columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  return { rene, conny, boardId: board.id, columnId, tag };
}

const cardsOf = async (request: APIRequestContext, boardId: string) =>
  ((await (await request.get(`/api/boards/${boardId}`)).json()) as { cards: { id: string; title: string; columnId: string; assigneeIds: string[]; completedAt: string | null; dueAt: string | null; watcherId: string | null }[] }).cards;

/** Reiter Wächter (dort wird alles verwaltet) */
async function openWatchersPage(page: Page) {
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Wächter' }).click();
}

async function openWatcherForm(page: Page) {
  await openWatchersPage(page);
  await page.getByRole('button', { name: 'Neuer Wächter', exact: true }).first().click();
}

test('Wächter anlegen (mit Vorlage), Ereignis simulieren: Aufgabe erscheint live bei beiden, zugewiesen und mit Push', async ({ page, browser, request, baseURL }) => {
  const s = await setup(request);
  await request.post(`${MOCK}/mock/pushes/clear`);
  await setState(request, 'person.rene', 'home');
  await setState(request, 'person.conny', 'home');
  await setState(request, 'sensor.waschmaschine_leistung', '120');
  const title = `Waschmaschine ausräumen ${s.tag}`;

  await page.addInitScript((id) => localStorage.setItem('stups.board', id), s.boardId);
  await page.goto('/');
  await openBoards(page);
  await openWatcherForm(page);

  // Assistent: Vorlage und Entität (Schritt 1), Wartezeit 0 (sonst müsste der Test 3 Minuten warten), Titel und Board (Schritt 2), Wer (3), Feinschliff (4)
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Waschmaschine fertig' }).click();
  await dialog.getByRole('button', { name: /Waschmaschine Leistung/ }).click();
  await expect(dialog.getByTestId('entity-graph')).toBeVisible();
  await dialog.getByRole('group', { name: 'Wartezeit in Minuten' }).getByRole('button', { name: 'sofort' }).click();
  await dialog.getByRole('button', { name: 'Weiter: Dann' }).click();
  await dialog.getByLabel('Board', { exact: true }).selectOption(s.boardId);
  await expect(dialog.getByLabel('Spalte', { exact: true })).toHaveValue(s.columnId);
  await dialog.getByLabel('Titel der Aufgabe').fill(title);
  await dialog.getByRole('button', { name: 'Weiter: Wer' }).click();
  await expect(dialog.getByRole('radio', { name: /Eine anwesende Person, abwechselnd/ })).toHaveAttribute('aria-checked', 'true'); // die Vorlage will es so
  await dialog.getByRole('button', { name: 'Weiter: Feinschliff' }).click();
  await expect(dialog.getByTestId('watcher-sentence')).toContainText(`bekommt wer zu Hause ist, reihum die Aufgabe „${title}“`);
  await dialog.getByRole('button', { name: 'Wächter anlegen' }).click();
  await expect(page.getByText('Wächter gespeichert')).toBeVisible();
  // nach dem Speichern steht der Reiter Wächter wieder da, der neue Wächter ist angelegt
  await expect(page.getByTestId('home')).toBeVisible();
  await expect.poll(async () => ((await (await request.get('/api/watchers')).json()) as { items: { name: string }[] }).items.some((w) => w.name === 'Waschmaschine fertig')).toBe(true);

  // Conny sieht die Aufgabe, ohne neu zu laden
  const connyCtx = await browser.newContext({ baseURL: String(baseURL), extraHTTPHeaders: connyHeaders });
  await connyCtx.addInitScript((id) => localStorage.setItem('stups.board', id), s.boardId);
  const conny = await connyCtx.newPage();
  try {
    await conny.goto('/');
    await openBoards(conny);
    await conny.getByRole('tab', { name: /^Offen/ }).click();

    // die Waschmaschine ist fertig: Leistung fällt unter 5 W
    await setState(request, 'sensor.waschmaschine_leistung', '2');
    await expect.poll(async () => (await cardsOf(request, s.boardId)).length, { timeout: 15_000 }).toBe(1);
    const card = (await cardsOf(request, s.boardId))[0]!;
    // die Aufgabe bekommt den Namen der Entität dazu, der Wächter selbst bleibt sauber
    expect(card).toMatchObject({ title: `${title}: Waschmaschine Leistung`, assigneeIds: [s.rene.id] });
    expect(card.watcherId).not.toBeNull();
    expect(card.dueAt).not.toBeNull();

    // Die Aufgabe ist „fällig in 30 Min.": kurz vor Mitternacht ist das schon morgen, und sie liegt in „Geplant" statt in „Offen"
    const columns = ((await (await request.get(`/api/boards/${s.boardId}`)).json()) as { columns: { id: string; name: string }[] }).columns;
    await conny.getByRole('tab', { name: new RegExp(`^${columns.find((c) => c.id === card.columnId)!.name}`) }).click();

    await expect(conny.locator('[role=presentation]').filter({ hasText: title }).getByTestId('card-watcher')).toBeVisible({ timeout: 15_000 });

    // Der Reiter „Wächter": Conny ist keine Administratorin, sieht ihn aber, nur lesend. Die Aufgabe wartet auf Rene.
    await conny.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Wächter' }).click();
    const waiting = conny.getByTestId('home-waiting');
    await expect(waiting).toContainText(title);
    await expect(waiting).toContainText('Waschmaschine fertig');
    await expect(conny.getByRole('button', { name: 'Wächter einrichten' })).toHaveCount(0);
    await expect(conny.getByRole('button', { name: 'Wächter hinzufügen' })).toHaveCount(0);

    // Push an Rene mit „Erledigt"
    const pushes = (await (await request.get(`${MOCK}/mock/pushes`)).json()) as { service: string; title: string; message: string; data: { actions?: unknown[] } }[];
    const toRene = pushes.find((p) => p.service === 'mobile_app_rene_e2e' && p.title === `${title}: Waschmaschine Leistung`);
    expect(toRene?.message).toMatch(/^Neue Aufgabe für dich · fällig/);
    expect(toRene?.data.actions).toHaveLength(1);
    expect(pushes.some((p) => p.service === 'mobile_app_conny_e2e')).toBe(false);
  } finally {
    await connyCtx.close();
  }

  // Sperrzeit und offene Aufgabe: ein zweites Auslösen legt keine zweite Aufgabe an
  await setState(request, 'sensor.waschmaschine_leistung', '120');
  await setState(request, 'sensor.waschmaschine_leistung', '2');
  await page.waitForTimeout(500);
  expect(await cardsOf(request, s.boardId)).toHaveLength(1);
});

test('Wer zuerst nach Hause kommt: Aufgabe wartet, die erste Heimkehr bekommt sie und die Nachricht; die Tür erledigt sie von selbst', async ({ request }) => {
  const s = await setup(request);
  await request.post(`${MOCK}/mock/pushes/clear`);
  await setState(request, 'person.rene', 'not_home');
  await setState(request, 'person.conny', 'not_home');
  await setState(request, 'vacuum.s7', 'cleaning');
  await setState(request, 'binary_sensor.waschmaschine_tuer', 'off');
  const title = `Staubbehälter leeren ${s.tag}`;

  const created = await request.post('/api/watchers', {
    data: {
      name: `Saugroboter ${s.tag}`,
      trigger: { entityId: 'vacuum.s7', kind: 'state', to: 'docked', forMin: 0, count: 1 },
      card: { boardId: s.boardId, columnId: s.columnId, title, due: { kind: 'in', minutes: 30 } },
      assign: { mode: 'first_home', personIds: [], waitFallback: 'none' },
      done: { entityId: 'binary_sensor.waschmaschine_tuer', kind: 'state', to: 'on' },
      cooldownMin: 0,
    },
  });
  expect(created.status()).toBe(201);

  // Roboter fertig, niemand zu Hause: Aufgabe da, aber ohne Zuständige und ohne Push
  await setState(request, 'vacuum.s7', 'docked');
  await expect.poll(async () => (await cardsOf(request, s.boardId)).length, { timeout: 15_000 }).toBe(1);
  let card = (await cardsOf(request, s.boardId))[0]!;
  expect(card.assigneeIds).toEqual([]);
  expect(card.dueAt).toBeNull();
  expect(((await (await request.get(`${MOCK}/mock/pushes`)).json()) as unknown[]).length).toBe(0);

  // Conny kommt als Erste heim
  await setState(request, 'person.conny', 'home');
  await expect.poll(async () => (await cardsOf(request, s.boardId))[0]!.assigneeIds, { timeout: 15_000 }).toEqual([s.conny.id]);
  card = (await cardsOf(request, s.boardId))[0]!;
  expect(card.dueAt).not.toBeNull();
  await expect
    .poll(async () => ((await (await request.get(`${MOCK}/mock/pushes`)).json()) as { service: string }[]).map((p) => p.service), { timeout: 10_000 })
    .toEqual(['mobile_app_conny_e2e']);

  // Die Tür der Waschmaschine geht auf: die Aufgabe erledigt sich von selbst
  await setState(request, 'binary_sensor.waschmaschine_tuer', 'on');
  await expect.poll(async () => (await cardsOf(request, s.boardId))[0]!.completedAt, { timeout: 15_000 }).not.toBeNull();
});

test('Eigene Automation: das Ereignis stups_create_card legt eine Aufgabe an, ohne Doppel bei gleichem dedupe_key', async ({ request }) => {
  const s = await setup(request);
  await request.post(`${MOCK}/mock/pushes/clear`);
  await setState(request, 'person.rene', 'not_home');
  await setState(request, 'person.conny', 'home');
  const title = `Aus der Automation ${s.tag}`;
  const fire = () =>
    request.post(`${MOCK}/mock/event`, {
      data: { type: 'stups_create_card', data: { board: `Wächter ${s.tag}`, title, assignees: 'present', due_in_minutes: 20, dedupe_key: `filter-${s.tag}` } },
    });

  await fire();
  await expect.poll(async () => (await cardsOf(request, s.boardId)).length, { timeout: 15_000 }).toBe(1);
  expect((await cardsOf(request, s.boardId))[0]).toMatchObject({ title, assigneeIds: [s.conny.id] });
  await expect
    .poll(async () => ((await (await request.get(`${MOCK}/mock/pushes`)).json()) as { service: string }[]).map((p) => p.service), { timeout: 10_000 })
    .toEqual(['mobile_app_conny_e2e']);

  await fire(); // gleiche Aufgabe noch offen
  await expect
    .poll(async () => ((await (await request.get('/api/admin/automation-log')).json()) as { result: string }[])[0]?.result, { timeout: 10_000 })
    .toBe('duplicate');
  expect(await cardsOf(request, s.boardId)).toHaveLength(1);
});

test('„Testen" legt eine Aufgabe an (Reiter Wächter › Wächter öffnen)', async ({ page, request }) => {
  const s = await setup(request);
  await setState(request, 'person.rene', 'home');
  const created = await request.post('/api/watchers', {
    data: {
      name: `Test ${s.tag}`,
      trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5, forMin: 0 },
      card: { boardId: s.boardId, columnId: s.columnId, title: `Probe ${s.tag}`, due: { kind: 'none' } },
      assign: { mode: 'fixed', personIds: [s.rene.id] },
    },
  });
  const id = (await created.json()).id as string;

  await page.addInitScript((bid) => localStorage.setItem('stups.board', bid), s.boardId);
  await page.goto('/');
  await openBoards(page);
  await openWatchersPage(page);
  await openWatcherCategory(page, /Ohne Kategorie/);
  await page.getByRole('button', { name: new RegExp(`Wächter Test ${s.tag} öffnen`) }).click();
  await page.getByRole('button', { name: /Testen: Aufgabe jetzt anlegen/ }).click();
  await expect(page.getByText('Testaufgabe angelegt')).toBeVisible();

  const cards = await cardsOf(request, s.boardId);
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({ title: `Probe ${s.tag}: Waschmaschine Leistung`, assigneeIds: [s.rene.id], watcherId: id });
});
