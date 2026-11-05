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
  'GET /api/me',
  'GET /api/people',
  'GET /api/people/:id/avatar',
  'GET /api/schedule',
  'GET /api/settings',
  'GET /api/today',
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
let mine: string; // Karte, die Mia zugewiesen ist
let others: string; // Karte, die Mia nicht zugewiesen ist
let item: string; // Checklistenpunkt einer fremden Karte
let myItem: string;
let completion: string; // Erledigung einer fremden Karte
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
    for (const r of [...ALLOWED_WRITES, ...ALLOWED_READS]) expect(ROUTES, r).toContain(r);
  });
});

describe('Ein Kind darf nur, was ausdrücklich erlaubt ist', () => {
  it('alle anderen schreibenden Routen: 403', async () => {
    const denied = WRITES.filter((r) => !ALLOWED_WRITES.includes(r));
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
    const denied = READS.filter((r) => !ALLOWED_READS.includes(r));
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

  it('erlaubte Änderungen nur an eigenen (zugewiesenen) Karten', async () => {
    const cardRoutes = ALLOWED_WRITES.filter((r) => r.includes('/cards/:id/'));
    for (const route of cardRoutes) {
      expect((await call(mia, route, others)).statusCode, `${route} fremd`).toBe(403);
      expect((await call(mia, route, mine)).statusCode, `${route} eigen`).not.toBe(403);
    }
  });

  it('Checklistenpunkte und Erledigungen: nur die der eigenen Karten', async () => {
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

  it('erledigen darf ein Kind seine Karte wirklich', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/cards/${mine}/complete`, headers: mia, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(store.getCard(mine).completedAt).not.toBeNull();
  });

  it('eine Karte nicht erledigen, die man nicht hat', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/cards/${others}/complete`, headers: mia, payload: {} });
    expect(res.statusCode).toBe(403);
    expect(store.getCard(others).completedAt).toBeNull();
  });

  it('der Live-Sync-Weg (WebSocket) steht in der Erlaubnisliste und wird nicht blockiert', () => {
    expect(ALLOWED_READS).toContain('GET /api/events');
  });
});

describe('Routen, die es in diesem Aufbau nicht gibt', () => {
  it('es sind nur die mit eigenen Abhängigkeiten (Konten, Passkeys, ntfy, Beta, Wächter, Home Assistant, Haus)', async () => {
    for (const route of [...WRITES.filter((r) => !ALLOWED_WRITES.includes(r)), ...READS.filter((r) => !ALLOWED_READS.includes(r))]) {
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
