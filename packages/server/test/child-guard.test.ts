import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';

// Rolle „Kind": Der Server verweigert alles, was nicht ausdrücklich erlaubt ist (Erlaubnisliste statt Verbotsliste).
// Dieser Test geht jede Route der Schnittstelle durch; eine neue Route ist für ein Kind automatisch verboten.
const ROUTES = JSON.parse(readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'api-routes.json'), 'utf8')) as string[];

// Bewusst hier noch einmal aufgeschrieben (nicht aus dem Quelltext übernommen): Wer die Liste im Server erweitert, muss auch hier bewusst nachziehen.
const ALLOWED_WRITES = [
  'POST /api/cards/:id/complete',
  'POST /api/completions/:id/undo',
  'POST /api/cards/:id/checklist',
  'PATCH /api/checklist/:id',
  'POST /api/cards/:id/comments',
  'POST /api/cards/:id/attachments',
  'POST /api/cards/:id/links',
  'PUT /api/me/language',
  'PUT /api/me/accent',
  'PUT /api/me/inbox-seen',
  'PUT /api/me/onboarding',
  'DELETE /api/me/onboarding',
  'PUT /api/me/onboarding/progress',
  // Handy-Schritt der Einrichtung: die Testnachricht an das eigene Handy (an andere schickt nur ein Administrator, das prüft die Route)
  'POST /api/push/test',
];
const ALLOWED_READS = [
  'GET /api/attachments/:id',
  'GET /api/attachments/:id/thumb',
  'GET /api/boards',
  'GET /api/boards/:id',
  'GET /api/capabilities',
  'GET /api/cards',
  'GET /api/cards/:id',
  'GET /api/cards/:id/comments',
  'GET /api/cards/:id/completions',
  'GET /api/events',
  'GET /api/inbox',
  'GET /api/me',
  'GET /api/people',
  'GET /api/people/:id/avatar',
  'GET /api/schedule',
  'GET /api/settings',
  'GET /api/today',
];

// Nur im eigenen Board „nur ich" erlaubt (eigene Prüfung, siehe „Eigene Boards eines Kindes")
const OWN_BOARD_ROUTES = [
  'POST /api/boards',
  'PATCH /api/boards/:id',
  'DELETE /api/boards/:id',
  'GET /api/boards/:id/archive',
  'POST /api/boards/:id/cards',
  'POST /api/boards/:id/columns',
  'POST /api/boards/:id/categories',
  'PATCH /api/columns/:id',
  'POST /api/columns/:id/move',
  'DELETE /api/columns/:id',
  'PATCH /api/categories/:id',
  'DELETE /api/categories/:id',
  'PATCH /api/cards/:id',
  'DELETE /api/cards/:id',
  'POST /api/cards/:id/move',
  'POST /api/cards/:id/duplicate',
  'POST /api/cards/:id/archive',
  'POST /api/cards/:id/restore-archived',
];
const isRead = (r: string) => r.startsWith('GET ');
const WRITES = ROUTES.filter((r) => !isRead(r) && !r.startsWith('HEAD ') && !r.startsWith('OPTIONS '));
const READS = ROUTES.filter((r) => isRead(r) && r !== 'GET /api/events'); // der WebSocket braucht einen Handschlag, siehe unten

const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const mia = as('ha-mia', 'Mia');
const ben = as('ha-ben', 'Ben');
const admin = as('ha-admin', 'Admin');

let app: FastifyInstance;
let store: Store;
let miaId: string;
let boardId: string;
let mine: string; // Aufgabe, die Mia zugewiesen ist
let others: string; // Aufgabe, die Mia nicht zugewiesen ist
let item: string; // Checklistenpunkt einer fremden Aufgabe
let myItem: string;
let completion: string; // Erledigung einer fremden Aufgabe
let myCompletion: string;

const url = (route: string, id = 'x') => route.replace(/^\w+ /, '').replace(/:\w+/g, id);
const method = (route: string) => route.split(' ')[0]! as 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
// Routen, die es nur mit bestimmten Abhängigkeiten gibt (Konten, Passkeys, ntfy …), fehlen in diesem Aufbau: Sie antworten „Route nicht gefunden"
const missing: string[] = [];
const isMissing = (res: { statusCode: number; json(): { message?: string } }) => res.statusCode === 404 && /^Route .* not found$/.test(res.json().message ?? '');
const call = (who: object, route: string, id = 'x') => app.inject({ method: method(route), url: url(route, id), headers: who as Record<string, string>, payload: method(route) === 'GET' ? undefined : {} });

beforeEach(async () => {
  store = createStore(openDb(':memory:'));
  miaId = store.addPerson({ haUserId: 'ha-mia', name: 'Mia' }).id;
  const benId = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
  store.addPerson({ haUserId: 'ha-admin', name: 'Admin' });
  store.setChild(miaId, { isChild: true });
  const board = store.createBoard({ name: 'Haushalt' });
  boardId = board.id;
  const col = store.getBoardView(board.id).columns[0]!.id;
  mine = store.createCard(boardId, { columnId: col, title: 'Meine', assigneeIds: [miaId] }, benId).id;
  others = store.createCard(boardId, { columnId: col, title: 'Fremde', assigneeIds: [benId] }, benId).id;
  myItem = store.addChecklistItem(mine, 'eins').id;
  item = store.addChecklistItem(others, 'zwei').id;
  myCompletion = store.completeCard(store.createCard(boardId, { columnId: col, title: 'Schon erledigt', assigneeIds: [miaId] }, benId).id, { by: miaId, source: 'app' }).completionId!;
  completion = store.completeCard(store.createCard(boardId, { columnId: col, title: 'Fremd erledigt', assigneeIds: [benId] }, benId).id, { by: benId, source: 'app' }).completionId!;
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, { store, directory: { isAdmin: async (id) => id === 'ha-admin', persons: async () => [] } });
});

describe('Erlaubnislisten', () => {
  it('jeder erlaubte Eintrag ist eine Route, die es gibt (kein Tippfehler macht etwas still unerreichbar)', () => {
    for (const r of [...ALLOWED_WRITES, ...ALLOWED_READS, ...OWN_BOARD_ROUTES]) expect(ROUTES, r).toContain(r);
  });
});

describe('Ein Kind darf nur, was ausdrücklich erlaubt ist', () => {
  it('alle anderen schreibenden Routen: 403', async () => {
    const denied = WRITES.filter((r) => !ALLOWED_WRITES.includes(r) && !OWN_BOARD_ROUTES.includes(r));
    expect(denied.length).toBeGreaterThan(30);
    for (const route of denied) {
      const res = await call(mia, route);
      if (isMissing(res)) {
        missing.push(route);
        continue;
      }
      expect(res.statusCode, `${route} → ${res.body}`).toBe(403);
      expect(res.json().error).toMatch(/Kind/);
    }
  });

  it('alle anderen lesenden Routen: 403', async () => {
    const denied = READS.filter((r) => !ALLOWED_READS.includes(r) && !OWN_BOARD_ROUTES.includes(r));
    expect(denied).toEqual(expect.arrayContaining(['GET /api/fairness', 'GET /api/access', 'GET /api/house/channels', 'GET /api/watchers', 'GET /api/watchers/history', 'GET /api/watchers/order', 'GET /api/templates', 'GET /api/trash']));
    for (const route of denied) {
      const res = await call(mia, route);
      if (isMissing(res)) {
        missing.push(route);
        continue;
      }
      expect(res.statusCode, `${route} → ${res.body}`).toBe(403);
    }
  });

  it('die erlaubten Lesewege gehen (sie liefern etwas oder 404, aber nie 403)', async () => {
    for (const route of READS.filter((r) => ALLOWED_READS.includes(r))) {
      const res = await call(mia, route, mine);
      expect(res.statusCode, `${route} → ${res.body}`).not.toBe(403);
    }
  });

  it('erlaubte Änderungen nur an eigenen (zugewiesenen) Aufgaben', async () => {
    const cardRoutes = ALLOWED_WRITES.filter((r) => r.includes('/cards/:id/'));
    for (const route of cardRoutes) {
      expect((await call(mia, route, others)).statusCode, `${route} fremd`).toBe(403);
      expect((await call(mia, route, mine)).statusCode, `${route} eigen`).not.toBe(403);
    }
  });

  it('Checklistenpunkte und Erledigungen: nur die der eigenen Aufgaben', async () => {
    expect((await call(mia, 'PATCH /api/checklist/:id', item)).statusCode).toBe(403);
    expect((await call(mia, 'PATCH /api/checklist/:id', myItem)).statusCode).not.toBe(403);
    expect((await call(mia, 'POST /api/completions/:id/undo', completion)).statusCode).toBe(403);
    expect((await call(mia, 'POST /api/completions/:id/undo', myCompletion)).statusCode).not.toBe(403);
  });

  it('Sprache und Farbe der eigenen Oberfläche dürfen sie ändern', async () => {
    const lang = await app.inject({ method: 'PUT', url: '/api/me/language', headers: mia, payload: { choice: 'en', effective: 'en' } });
    expect(lang.statusCode).toBe(204);
    const accent = await app.inject({ method: 'PUT', url: '/api/me/accent', headers: mia, payload: { hue: 120 } });
    expect(accent.statusCode).toBe(204);
  });

  it('erledigen darf ein Kind seine Aufgabe wirklich', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/cards/${mine}/complete`, headers: mia, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(store.getCard(mine).completedAt).not.toBeNull();
  });

  it('eine Aufgabe nicht erledigen, die man nicht hat', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/cards/${others}/complete`, headers: mia, payload: {} });
    expect(res.statusCode).toBe(403);
    expect(store.getCard(others).completedAt).toBeNull();
  });

  it('der Live-Sync-Weg (WebSocket) steht in der Erlaubnisliste und wird nicht blockiert', () => {
    expect(ALLOWED_READS).toContain('GET /api/events');
  });
});

describe('Eigene Boards eines Kindes („nur ich")', () => {
  const send = (who: object, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: who as Record<string, string>, payload: method === 'GET' ? undefined : (payload ?? {}) });

  it('ein Kind legt nur Boards „nur ich" an, Boards für alle oder Ausgewählte nie', async () => {
    expect((await send(mia, 'POST', '/api/boards', { name: 'Geheim' })).statusCode).toBe(403);
    expect((await send(mia, 'POST', '/api/boards', { name: 'Alle', visibility: 'all' })).statusCode).toBe(403);
    expect((await send(mia, 'POST', '/api/boards', { name: 'Gruppe', visibility: 'selected', memberIds: [] })).statusCode).toBe(403);
    const ok = await send(mia, 'POST', '/api/boards', { name: 'Meins', visibility: 'private' });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ visibility: 'private', ownerId: miaId });
  });

  it('im eigenen Board darf das Kind frei arbeiten, in anderen nur an zugewiesenen Aufgaben', async () => {
    const own = (await send(mia, 'POST', '/api/boards', { name: 'Meins', visibility: 'private' })).json() as { id: string };
    const col = store.getBoardView(own.id).columns[0]!.id;
    const card = await send(mia, 'POST', `/api/boards/${own.id}/cards`, { columnId: col, title: 'Mein Plan' });
    expect(card.statusCode).toBe(201);
    const id = (card.json() as { id: string }).id;
    expect((await send(mia, 'PATCH', `/api/cards/${id}`, { title: 'Neu' })).statusCode).toBe(200);
    expect((await send(mia, 'PATCH', `/api/boards/${own.id}`, { name: 'Meins 2' })).statusCode).toBe(200);
    // an der zugewiesenen Aufgabe im geteilten Board bleibt es beim Erledigen
    expect((await send(mia, 'PATCH', `/api/cards/${mine}`, { title: 'x' })).statusCode).toBe(403);
    expect((await send(mia, 'POST', `/api/boards/${boardId}/cards`, { title: 'x' })).statusCode).toBe(403);
    expect((await send(mia, 'PATCH', `/api/boards/${boardId}`, { name: 'x' })).statusCode).toBe(403);
    // Sichtbarkeit ändern: nur auf „nur ich"
    expect((await send(mia, 'PATCH', `/api/boards/${own.id}`, { visibility: 'all' })).statusCode).toBe(403);
  });

  it('Erledigen im eigenen Board braucht keine Bestätigung (niemand sonst sieht die Aufgabe)', async () => {
    store.setChild(miaId, { isChild: true, confirmDefault: true });
    const own = (await send(mia, 'POST', '/api/boards', { name: 'Meins', visibility: 'private' })).json() as { id: string };
    const col = store.getBoardView(own.id).columns[0]!.id;
    const id = (await send(mia, 'POST', `/api/boards/${own.id}/cards`, { columnId: col, title: 'Mein Plan' })).json().id as string;
    const done = await send(mia, 'POST', `/api/cards/${id}/complete`);
    expect(done.statusCode).toBe(200);
    expect(done.json().awaitingConfirmation).toBeUndefined();
    expect(store.getCard(id).completedAt).not.toBeNull();
  });

  it('ein Kind sieht seine Boards „nur ich" auch mit „nur Boards mit eigenen Aufgaben", Erwachsene nie', async () => {
    store.setChild(miaId, { isChild: true, childScope: 'assigned' });
    const own = (await send(mia, 'POST', '/api/boards', { name: 'Meins', visibility: 'private' })).json() as { id: string };
    expect(((await send(mia, 'GET', '/api/boards')).json() as { id: string }[]).map((b) => b.id)).toContain(own.id);
    expect((await send(ben, 'GET', `/api/boards/${own.id}`)).statusCode).toBe(404);
    expect(((await send(admin, 'GET', '/api/boards')).json() as { id: string }[]).map((b) => b.id)).not.toContain(own.id);
  });
});

describe('Besitzprüfung eines Kindes im Detail', () => {
  type Kind = 'boards' | 'columns' | 'categories' | 'cards';
  const idRoutes = OWN_BOARD_ROUTES.filter((r) => r.includes(':id'));
  const kindOf = (route: string) => /\/api\/(\w+)\/:id/.exec(route)![1] as Kind;
  // Ein Board samt Spalte, Kategorie und Aufgabe
  const setup = (board: { id: string }): Record<Kind, string> => {
    const column = store.getBoardView(board.id).columns[0]!.id;
    const category = store.addCategory(board.id, { name: 'Kat', color: '#ff0000' }).id;
    const card = store.createCard(board.id, { columnId: column, title: 'K' }, miaId).id;
    return { boards: board.id, columns: column, categories: category, cards: card };
  };
  const benId = () => store.people().find((p) => p.name === 'Ben')!.id;

  it('in fremden Boards (für alle, auch mit dem Kind als Besitzer, oder privat von jemand anderem) bleibt jede eigene Route verboten', async () => {
    const foreign = [
      setup({ id: boardId }),
      setup(store.createBoard({ name: 'Für alle, Mias', ownerId: miaId })),
      setup(store.createBoard({ name: 'Bens', visibility: 'private', ownerId: benId() })),
    ];
    for (const ids of foreign) {
      for (const route of idRoutes) {
        const res = await call(mia, route, ids[kindOf(route)]);
        expect(res.statusCode, `${route} fremd`).toBe(403);
        expect(res.json().error).toMatch(/Kind/);
      }
    }
  });

  it('im eigenen Board „nur ich" ist jede eigene Route erlaubt', async () => {
    for (const route of idRoutes) {
      const ids = setup(store.createBoard({ name: 'Meins', visibility: 'private', ownerId: miaId }));
      const res = await call(mia, route, ids[kindOf(route)]);
      expect(res.statusCode, `${route} eigen → ${res.body}`).not.toBe(403);
    }
  });

  it('ein Board, das es nicht gibt: die Route antwortet selbst mit „nicht gefunden", nicht der Wächter mit 403', async () => {
    for (const route of idRoutes.filter((r) => kindOf(r) !== 'cards')) {
      const res = await call(mia, route, 'gibt-es-nicht');
      expect(res.statusCode, route).toBe(404);
    }
    for (const route of ['POST /api/cards/:id/complete', 'POST /api/cards/:id/comments', 'PATCH /api/checklist/:id', 'POST /api/completions/:id/undo']) {
      const res = await call(mia, route, 'gibt-es-nicht');
      expect(res.statusCode, route).toBe(404);
    }
  });

  it('Routen ohne Besitzprüfung prüfen auch bei einer fremden Kennung nichts nach', async () => {
    // Die Kennung einer fremden Erledigung würde eine Besitzprüfung auslösen; erlaubte Leserouten dürfen sie nie ablehnen
    for (const route of ALLOWED_READS.filter((r) => r.includes(':id'))) {
      const res = await call(mia, route, completion);
      expect(res.statusCode, `${route} → ${res.body}`).not.toBe(403);
    }
  });

  it('Boards anlegen: ohne Angabe, ohne Nutzlast oder für andere 403, nur „nur ich" 201', async () => {
    const bare = await app.inject({ method: 'POST', url: '/api/boards', headers: mia });
    expect(bare.statusCode).toBe(403);
    expect(bare.json().error).toMatch(/Kind/);
    const open = await app.inject({ method: 'POST', url: '/api/boards', headers: mia, payload: { name: 'Offen' } });
    expect(open.statusCode).toBe(403);
    const ok = await app.inject({ method: 'POST', url: '/api/boards', headers: mia, payload: { name: 'Meins', visibility: 'private' } });
    expect(ok.statusCode).toBe(201);
  });
});

describe('Kind mit „nur Boards mit eigenen Aufgaben"', () => {
  let garden: string;
  let gardenCard: string;
  beforeEach(() => {
    store.setChild(miaId, { isChild: true, childScope: 'assigned' });
    garden = store.createBoard({ name: 'Garten' }).id;
    const col = store.getBoardView(garden).columns[0]!.id;
    gardenCard = store.createCard(garden, { columnId: col, title: 'Rasen' }, miaId).id;
  });
  const get = (url: string) => app.inject({ method: 'GET', url, headers: mia });

  it('ein Board ohne eigene Aufgabe gibt es für das Kind nicht (404 mit Meldung), das mit eigener Aufgabe schon', async () => {
    const hidden = await get(`/api/boards/${garden}`);
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json().error).toBe('Board nicht gefunden');
    expect((await get(`/api/boards/${boardId}`)).statusCode).toBe(200);
  });

  it('eine Aufgabe in einem fremden Board gibt es für das Kind nicht (404 mit Meldung)', async () => {
    const hidden = await get(`/api/cards/${gardenCard}`);
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json().error).toBe('Aufgabe nicht gefunden');
    expect((await get(`/api/cards/${mine}`)).statusCode).toBe(200);
  });

  it('Boards, die dem Kind gehören, aber nicht „nur ich" sind, zählen nicht als eigene', async () => {
    const forAll = store.createBoard({ name: 'Für alle, Mias', ownerId: miaId }).id;
    const selected = store.createBoard({ name: 'Auswahl', visibility: 'selected', ownerId: miaId, memberIds: [] }).id;
    const ids = ((await get('/api/boards')).json() as { id: string }[]).map((b) => b.id);
    expect(ids).toContain(boardId);
    expect(ids).not.toContain(forAll);
    expect(ids).not.toContain(selected);
    expect(ids).not.toContain(garden);
  });

  it('nur die Listen der Boards und Aufgaben werden gefiltert, andere Listen bleiben vollständig', async () => {
    store.addComment(mine, store.people().find((p) => p.name === 'Ben')!.id, 'Hallo');
    const comments = (await get(`/api/cards/${mine}/comments`)).json() as unknown[];
    expect(comments).toHaveLength(1);
    const people = (await get('/api/people')).json() as { name: string }[];
    expect(people.map((p) => p.name).sort()).toEqual(['Admin', 'Ben', 'Mia']);
  });
});

describe('Mitteilungen eines Kindes: nur Eigenes', () => {
  const inbox = async (who: object, qs = '') => (await app.inject({ method: 'GET', url: `/api/inbox${qs}`, headers: who as Record<string, string> })).json() as { items: { cardId: string; kind: string }[]; seenAt: string | null };

  it('Einträge zu eigenen Aufgaben erscheinen, fremde Aufgaben, fremde Boards und fremde Stupse nie', async () => {
    const benId = store.people().find((p) => p.name === 'Ben')!.id;
    const garden = store.createBoard({ name: 'Garten' });
    const gardenCol = store.getBoardView(garden.id).columns[0]!.id;
    const foreignBoard = store.createCard(garden.id, { columnId: gardenCol, title: 'Rasen', assigneeIds: [benId] }, benId).id;
    for (const id of [mine, others, foreignBoard]) store.addComment(id, benId, 'Hallo');
    const kids = (await inbox(mia)).items;
    expect(kids.map((i) => [i.kind, i.cardId])).toEqual([['comment', mine]]);
    // ein Erwachsener mit Bezug zu den Aufgaben sieht seine, aber das Kind sieht nie mehr als das eigene
    expect((await inbox(mia, `?before=${encodeURIComponent('2000-01-01T00:00:00.000Z')}`)).items).toEqual([]);
    for (const i of kids) expect(i.cardId).not.toBe(others);
  });

  it('Alle gelesen geht für ein Kind und gilt nur für es selbst', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/me/inbox-seen', headers: mia, payload: {} });
    expect(res.statusCode).toBe(200);
    const seen = res.json().seenAt as string;
    expect((await inbox(mia)).seenAt).toBe(seen);
    expect((await inbox(ben)).seenAt).not.toBe(seen);
  });

  it('das Dashboard wählen und die Liste der Dashboards sind für ein Kind verboten', async () => {
    expect((await app.inject({ method: 'PUT', url: '/api/me/dashboard', headers: mia, payload: { path: '/lovelace' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/ha/dashboards', headers: mia })).statusCode).toBe(403);
    expect(store.people().find((p) => p.id === miaId)!.dashboardPath).toBeNull();
  });
});

describe('Routen, die es in diesem Aufbau nicht gibt', () => {
  it('es sind nur die mit eigenen Abhängigkeiten (Konten, Passkeys, ntfy, Beta, Wächter, Home Assistant, Haus)', async () => {
    for (const route of [...WRITES.filter((r) => !ALLOWED_WRITES.includes(r) && !OWN_BOARD_ROUTES.includes(r)), ...READS.filter((r) => !ALLOWED_READS.includes(r) && !OWN_BOARD_ROUTES.includes(r))]) {
      if (isMissing(await call(mia, route))) missing.push(route);
    }
    const known = ['/api/auth', '/api/passkeys', '/api/push', '/api/beta', '/api/house', '/api/ha/', '/api/watchers', '/api/admin'];
    for (const route of missing) expect(known.some((prefix) => route.includes(" " + prefix)), route).toBe(true);
  });
});

describe('Alle anderen bleiben unverändert', () => {
  it('ein Mitglied (kein Kind) wird nirgends als Kind behandelt', async () => {
    expect((await call(ben, 'DELETE /api/cards/:id', others)).statusCode).toBe(204); // darf löschen
    expect((await call(ben, 'GET /api/fairness')).statusCode).toBe(200);
    expect((await call(ben, 'GET /api/templates')).statusCode).toBe(200);
  });

  it('der Administrator auch', async () => {
    expect((await call(admin, 'GET /api/access')).statusCode).toBe(200);
    expect((await call(admin, 'GET /api/fairness')).statusCode).toBe(200);
  });

  it('ein Administrator, der als Kind eingetragen ist, behält seine Rechte', async () => {
    const adminId = store.people().find((p) => p.name === 'Admin')!.id;
    store.setChild(adminId, { isChild: true });
    expect((await call(admin, 'GET /api/access')).statusCode).toBe(200);
    expect((await call(admin, 'POST /api/boards/:id/columns', boardId)).statusCode).not.toBe(403);
  });
});
