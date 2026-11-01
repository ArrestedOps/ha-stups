import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

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
  ((await (await request.get(`/api/boards/${boardId}`)).json()) as { cards: { id: string; title: string; assigneeIds: string[]; completedAt: string | null; dueAt: string | null; watcherId: string | null }[] }).cards;

async function openWatcherForm(page: Page) {
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('button', { name: 'Wächter hinzufügen' }).click();
}

test('Wächter anlegen (mit Vorlage), Ereignis simulieren: Karte erscheint live bei beiden, zugewiesen und mit Push', async ({ page, browser, request, baseURL }) => {
  const s = await setup(request);
  await request.post(`${MOCK}/mock/pushes/clear`);
  await setState(request, 'person.rene', 'home');
  await setState(request, 'person.conny', 'home');
  await setState(request, 'sensor.waschmaschine_leistung', '120');
  const title = `Waschmaschine ausräumen ${s.tag}`;

  await page.addInitScript((id) => localStorage.setItem('stups.board', id), s.boardId);
  await page.goto('/');
  await openWatcherForm(page);

  // Vorlage, Entität suchen, Board wählen, Wartezeit 0 (sonst müsste der Test 3 Minuten warten)
  await page.getByRole('button', { name: 'Waschmaschine fertig' }).click();
  await page.getByRole('button', { name: /Waschmaschine Leistung/ }).click();
  await page.getByLabel('Board', { exact: true }).selectOption(s.boardId);
  await expect(page.getByLabel('Spalte', { exact: true })).toHaveValue(s.columnId);
  await page.getByLabel('Wartezeit in Minuten').fill('0');
  await page.getByLabel('Titel der Karte').fill(title);
  await expect(page.getByTestId('watcher-preview')).toContainText(`bekommt eine anwesende Person abwechselnd die Karte „${title}“ (fällig in 30 Min.)`);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Wächter gespeichert')).toBeVisible();
  await expect(page.getByRole('button', { name: /Wächter Waschmaschine fertig bearbeiten/ })).toBeVisible();

  // Conny sieht die Karte, ohne neu zu laden
  const connyCtx = await browser.newContext({ baseURL: String(baseURL), extraHTTPHeaders: connyHeaders });
  await connyCtx.addInitScript((id) => localStorage.setItem('stups.board', id), s.boardId);
  const conny = await connyCtx.newPage();
  try {
    await conny.goto('/');
    await conny.getByRole('tab', { name: /^Offen/ }).click();

    // die Waschmaschine ist fertig: Leistung fällt unter 5 W
    await setState(request, 'sensor.waschmaschine_leistung', '2');
    await expect.poll(async () => (await cardsOf(request, s.boardId)).length, { timeout: 15_000 }).toBe(1);
    const card = (await cardsOf(request, s.boardId))[0]!;
    expect(card).toMatchObject({ title, assigneeIds: [s.rene.id] });
    expect(card.watcherId).not.toBeNull();
    expect(card.dueAt).not.toBeNull();

    await expect(conny.locator('[role=presentation]').filter({ hasText: title }).getByTestId('card-watcher')).toBeVisible({ timeout: 15_000 });

    // Push an Rene mit „Erledigt"
    const pushes = (await (await request.get(`${MOCK}/mock/pushes`)).json()) as { service: string; title: string; message: string; data: { actions?: unknown[] } }[];
    const toRene = pushes.find((p) => p.service === 'mobile_app_rene_e2e' && p.title === title);
    expect(toRene?.message).toMatch(/^Neue Karte für dich · fällig/);
    expect(toRene?.data.actions).toHaveLength(1);
    expect(pushes.some((p) => p.service === 'mobile_app_conny_e2e')).toBe(false);
  } finally {
    await connyCtx.close();
  }

  // Sperrzeit und offene Karte: ein zweites Auslösen legt keine zweite Karte an
  await setState(request, 'sensor.waschmaschine_leistung', '120');
  await setState(request, 'sensor.waschmaschine_leistung', '2');
  await page.waitForTimeout(500);
  expect(await cardsOf(request, s.boardId)).toHaveLength(1);
});

test('Wer zuerst nach Hause kommt: Karte wartet, die erste Heimkehr bekommt sie und die Nachricht; die Tür erledigt sie von selbst', async ({ request }) => {
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

  // Roboter fertig, niemand zu Hause: Karte da, aber ohne Zuständige und ohne Push
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

  // Die Tür der Waschmaschine geht auf: die Karte erledigt sich von selbst
  await setState(request, 'binary_sensor.waschmaschine_tuer', 'on');
  await expect.poll(async () => (await cardsOf(request, s.boardId))[0]!.completedAt, { timeout: 15_000 }).not.toBeNull();
});

test('Eigene Automation: das Ereignis stups_create_card legt eine Karte an, ohne Doppel bei gleichem dedupe_key', async ({ request }) => {
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

  await fire(); // gleiche Karte noch offen
  await expect
    .poll(async () => ((await (await request.get('/api/admin/automation-log')).json()) as { result: string }[])[0]?.result, { timeout: 10_000 })
    .toBe('duplicate');
  expect(await cardsOf(request, s.boardId)).toHaveLength(1);
});

test('„Testen" legt eine Karte an, und die Einstellungen zeigen den Wächter mit letztem Lauf', async ({ page, request }) => {
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
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`Wächter Test ${s.tag} bearbeiten`) }).click();
  await page.getByRole('button', { name: /Testen: Karte jetzt anlegen/ }).click();
  await expect(page.getByText('Testkarte angelegt')).toBeVisible();

  const cards = await cardsOf(request, s.boardId);
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({ title: `Probe ${s.tag}`, assigneeIds: [s.rene.id], watcherId: id });
});
