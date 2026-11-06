import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openBoards } from './helpers';

// Läuft nur im Projekt „waechter": nachgebautes Home Assistant (e2e/server-ha.mjs). Der Reiter Wächter zeigt den Zustand der Wächter;
// Aufgaben zeigt, was vom Haus kam, mit Erledigen und Weitergeben.
const MOCK = 'http://127.0.0.1:18411';
test.describe.configure({ timeout: 90_000, mode: 'serial' });

const setState = (request: APIRequestContext, entityId: string, state: string) => request.post(`${MOCK}/mock/state`, { data: { entityId, state } });
const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });

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
  ((await (await request.get(`/api/boards/${boardId}`)).json()) as { cards: { id: string; title: string; assigneeIds: string[]; completedAt: string | null }[] }).cards;

test('Wächter: läuft gerade → wartet auf jemanden; Aufgaben zeigt die Karte vom Haus, Erledigen nimmt sie weg', async ({ page, request }) => {
  const s = await setup(request);
  await setState(request, 'person.rene', 'home');
  await setState(request, 'person.conny', 'not_home');
  await setState(request, 'sensor.waschmaschine_leistung', '2');
  const name = `Maschine ${s.tag}`;
  const title = `Aufhängen ${s.tag}`;
  const created = await request.post('/api/watchers', {
    data: {
      name,
      trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5, forMin: 0 },
      card: { boardId: s.boardId, columnId: s.columnId, title, due: { kind: 'none' } },
      assign: { mode: 'fixed', personIds: [s.rene.id] },
      cooldownMin: 0,
    },
  });
  expect(created.status()).toBe(201);

  await page.goto('/');

  await openBoards(page);
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  // Alle Wächter sind immer sichtbar: ohne Kategorie steht er unter „Ohne Kategorie"
  await expect(page.getByTestId('watcher-categories')).toContainText(name);

  // Die Maschine läuft: Leistung über der Schwelle
  await setState(request, 'sensor.waschmaschine_leistung', '120');
  await expect(page.getByTestId('home-running')).toContainText(name, { timeout: 20_000 });
  await expect(page.getByTestId('home-running')).toContainText(`danach: ${title}`);

  // Fertig: die Karte entsteht, der Wächter wartet auf Rene
  await setState(request, 'sensor.waschmaschine_leistung', '2');
  await expect(page.getByTestId('home-waiting')).toContainText(title, { timeout: 20_000 });
  expect((await cardsOf(request, s.boardId)).some((c) => c.title === title)).toBe(true);

  // Aufgaben: „Vom Haus", mit Türkis-Quelle; Erledigen
  await nav(page).getByRole('button', { name: 'Aufgaben' }).click();
  const house = page.getByTestId('today-house');
  await expect(house).toContainText(name);
  await expect(house.getByText(title)).toBeVisible();
  await house.getByRole('button', { name: 'Erledigt' }).first().click();
  await expect.poll(async () => (await cardsOf(request, s.boardId)).find((c) => c.title === title)?.completedAt ?? null).not.toBeNull();
  await expect(house.getByText(title)).toHaveCount(0);
});

test('Aufgaben: Weitergeben schiebt die Karte an die nächste Person, ohne sie zu erledigen', async ({ page, request }) => {
  const s = await setup(request);
  await setState(request, 'person.rene', 'home');
  await setState(request, 'person.conny', 'not_home'); // nur Rene ist da: die Karte entsteht bei ihm
  await setState(request, 'sensor.waschmaschine_leistung', '120');
  const title = `Weiterreichen ${s.tag}`;
  const created = await request.post('/api/watchers', {
    data: {
      name: `Reihum ${s.tag}`,
      trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5, forMin: 0 },
      card: { boardId: s.boardId, columnId: s.columnId, title, due: { kind: 'none' } },
      assign: { mode: 'rotation_present', personIds: [s.rene.id, s.conny.id] },
      cooldownMin: 0,
    },
  });
  expect(created.status()).toBe(201);
  await setState(request, 'sensor.waschmaschine_leistung', '2');
  await expect.poll(async () => (await cardsOf(request, s.boardId)).length, { timeout: 20_000 }).toBe(1);
  expect((await cardsOf(request, s.boardId))[0]!.assigneeIds).toEqual([s.rene.id]);

  await page.goto('/');

  await openBoards(page);
  await nav(page).getByRole('button', { name: 'Aufgaben' }).click();
  const house = page.getByTestId('today-house');
  await expect(house.getByText(title)).toBeVisible();

  // Ist niemand sonst zu Hause, bleibt die Karte bei mir, mit Hinweis
  await house.getByRole('button', { name: 'Weitergeben' }).first().click();
  await expect(page.getByText('Gerade ist niemand sonst dran')).toBeVisible();
  expect((await cardsOf(request, s.boardId))[0]!.assigneeIds).toEqual([s.rene.id]);

  // Conny kommt heim: jetzt geht die Karte an sie
  await setState(request, 'person.conny', 'home');
  await house.getByRole('button', { name: 'Weitergeben' }).first().click();
  await expect(page.getByText('Weitergegeben an Conny')).toBeVisible();
  await expect.poll(async () => (await cardsOf(request, s.boardId)).find((c) => c.title === title)?.assigneeIds).toEqual([s.conny.id]);
  expect((await cardsOf(request, s.boardId)).find((c) => c.title === title)?.completedAt).toBeNull();
  await expect(house.getByText(title)).toHaveCount(0);
});

test('Erst vorschlagen: die Karte entsteht ohne Zuständige, „Übernehmen" auf Heute gibt sie dem, der tippt', async ({ page, request }) => {
  const s = await setup(request);
  await setState(request, 'person.rene', 'home');
  await setState(request, 'person.conny', 'home');
  await setState(request, 'sensor.waschmaschine_leistung', '120');
  const title = `Wer übernimmt ${s.tag}`;
  const created = await request.post('/api/watchers', {
    data: {
      name: `Vorschlag ${s.tag}`,
      trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5, forMin: 0 },
      card: { boardId: s.boardId, columnId: s.columnId, title, due: { kind: 'none' } },
      assign: { mode: 'suggest', personIds: [], fallback: 'none' },
      cooldownMin: 0,
    },
  });
  expect(created.status()).toBe(201);
  await setState(request, 'sensor.waschmaschine_leistung', '2');
  await expect.poll(async () => (await cardsOf(request, s.boardId)).length, { timeout: 20_000 }).toBe(1);
  expect((await cardsOf(request, s.boardId))[0]!.assigneeIds).toEqual([]);

  await page.goto('/');

  await openBoards(page);
  await nav(page).getByRole('button', { name: 'Aufgaben' }).click();
  const house = page.getByTestId('today-house');
  await expect(house.getByText(title)).toBeVisible();
  await expect(house.getByText('Wer übernimmt?')).toBeVisible();
  await house.getByRole('button', { name: 'Übernehmen' }).first().click();
  await expect.poll(async () => (await cardsOf(request, s.boardId))[0]!.assigneeIds).toEqual([s.rene.id]);
  await expect(house.getByRole('button', { name: 'Weitergeben' }).first()).toBeVisible();
});

const connyHeaders = { 'x-remote-user-id': 'ha-conny-e2e', 'x-remote-user-name': 'conny', 'x-remote-user-display-name': 'Conny' };

test('Wächter: Administratoren bearbeiten einen Wächter direkt, Mitglieder sehen ihn lesend, mit Verlauf', async ({ page, browser, request, baseURL }) => {
  const s = await setup(request);
  const name = `Bearbeiten ${s.tag}`;
  const created = await request.post('/api/watchers', {
    data: {
      name,
      trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5, forMin: 3 },
      card: { boardId: s.boardId, columnId: s.columnId, title: `Probe ${s.tag}`, due: { kind: 'none' } },
      assign: { mode: 'fixed', personIds: [s.rene.id] },
    },
  });
  const id = (await created.json()).id as string;
  // ein Lauf für den Verlauf („Test")
  expect((await request.post(`/api/watchers/${id}/test`)).status()).toBe(200);

  // Administrator: Tipp auf den Wächter öffnet den Ablauf (Karten, Satz als Zusammenfassung, Speichern), der Status steht unten
  await page.goto('/');
  await openBoards(page);
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await expect(page.getByTestId('home-activity')).toContainText(name);
  await page.getByRole('button', { name: `Wächter ${name} öffnen` }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('watcher-sentence')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Speichern', exact: true }).first()).toBeVisible();
  await expect(dialog.getByTestId('watcher-flow').getByRole('button', { name: 'Ändern' }).first()).toBeVisible();
  await expect(dialog.getByTestId('watcher-readonly')).toHaveCount(0);
  await expect(dialog.getByText('Status', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Testen: Karte jetzt anlegen/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Mitglied: dieselbe Seite, aber nur lesend
  const ctx = await browser.newContext({ baseURL: String(baseURL), extraHTTPHeaders: connyHeaders });
  const conny = await ctx.newPage();
  try {
    await conny.goto('/');
    await conny.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Wächter' }).click();
    await conny.getByRole('button', { name: `Wächter ${name} öffnen` }).first().click();
    const d = conny.getByRole('dialog');
    await expect(d.getByTestId('watcher-readonly')).toBeVisible();
    await expect(d.getByTestId('watcher-sentence')).toBeVisible();
    // die vier Karten und der Verlauf der Entität sind zu sehen, aber nichts lässt sich ändern
    await expect(d.getByTestId('watcher-flow')).toBeVisible();
    await expect(d.getByTestId('entity-graph')).toBeVisible();
    await expect(d.getByRole('button', { name: 'Ändern' })).toHaveCount(0);
    await expect(d.getByRole('switch', { name: 'Automatisch erledigen' })).toBeDisabled();
    await expect(d.getByRole('button', { name: 'Speichern' })).toHaveCount(0);
    await expect(d.getByRole('button', { name: /Testen: Karte jetzt anlegen/ })).toHaveCount(0);
    await expect(d.getByRole('button', { name: 'Wächter löschen' })).toHaveCount(0);
    await expect(d.getByText('Status', { exact: true })).toBeVisible(); // der Verlauf ist lesbar
    // und die Änderung bleibt auch über die Schnittstelle verboten
    expect((await ctx.request.patch(`/api/watchers/${id}`, { data: { active: false }, headers: { 'x-stups-client': 'e2e' } })).status()).toBe(403);
  } finally {
    await ctx.close();
  }
});
