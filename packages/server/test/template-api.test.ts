import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';

const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const admin = as('ha-admin', 'Admin');
const ben = as('ha-ben', 'Ben');
const conny = as('ha-conny', 'Conny');

let app: FastifyInstance;
let store: Store;

beforeEach(async () => {
  store = createStore(openDb(':memory:'));
  store.addPerson({ haUserId: 'ha-admin', name: 'Admin' });
  store.addPerson({ haUserId: 'ha-ben', name: 'Ben' });
  store.addPerson({ haUserId: 'ha-conny', name: 'Conny' });
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, { store, directory: { isAdmin: async (id) => id === 'ha-admin', persons: async () => [] } });
});

const call = (who: object, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object, lang?: string) =>
  app.inject({ method, url, headers: { ...(who as Record<string, string>), ...(lang ? { 'x-stups-language': lang } : {}) }, ...(payload ? { payload } : {}) });

describe('Board aus einer Vorlage anlegen', () => {
  it('ohne Vorlage wie bisher', async () => {
    const res = await call(ben, 'POST', '/api/boards', { name: 'Leer' });
    expect(res.statusCode).toBe(201);
    const view = (await call(ben, 'GET', `/api/boards/${res.json().id}`)).json();
    expect(view.cards).toEqual([]);
  });

  it('mit Vorlage: Spalten, Kategorien und Karten, in der Sprache der Anfrage, Ersteller ist die Person', async () => {
    const res = await call(ben, 'POST', '/api/boards', { name: 'Home', template: 'household' }, 'en');
    expect(res.statusCode).toBe(201);
    const view = (await call(ben, 'GET', `/api/boards/${res.json().id}`)).json();
    expect(view.columns.map((c: { name: string }) => c.name)).toEqual(['Open', 'Planned', 'In progress', 'Done']);
    expect(view.cards.length).toBeGreaterThanOrEqual(6);
    const benId = store.people().find((p) => p.name === 'Ben')!.id;
    expect(view.cards[0].createdBy).toBe(benId);
    const de = await call(ben, 'POST', '/api/boards', { name: 'Zuhause', template: 'household' }, 'de');
    expect((await call(ben, 'GET', `/api/boards/${de.json().id}`)).json().columns[0].name).toBe('Offen');
  });

  it('unbekannte Vorlage: 404, es entsteht kein Board', async () => {
    const before = store.listBoards(null).length;
    expect((await call(ben, 'POST', '/api/boards', { name: 'X', template: 'gibt-es-nicht' })).statusCode).toBe(404);
    expect((await call(ben, 'POST', '/api/boards', { name: 'X', template: 7 })).statusCode).toBe(400);
    expect(store.listBoards(null).length).toBe(before);
  });
});

describe('Vorlagen auflisten, speichern, löschen', () => {
  it('listet die eingebauten in der Sprache der Anfrage, mit Zahlen für die Vorschau', async () => {
    const de = (await call(ben, 'GET', '/api/templates')).json();
    expect(de.map((t: { id: string }) => t.id)).toEqual(['household', 'move', 'renovation', 'packing', 'baby', 'ideas']);
    expect(de[0]).toMatchObject({ name: 'Haushalt', builtin: true, columns: 4, categories: 5 });
    expect(de[0].cards).toBeGreaterThan(5);
    const en = (await call(ben, 'GET', '/api/templates', undefined, 'en')).json();
    expect(en[0].name).toBe('Household');
  });

  it('ein Board als Vorlage speichern, daraus ein neues anlegen', async () => {
    const board = (await call(ben, 'POST', '/api/boards', { name: 'Quelle', template: 'packing' })).json();
    const res = await call(ben, 'POST', `/api/boards/${board.id}/save-as-template`, { name: 'Meine Packliste' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: 'Meine Packliste', builtin: false });
    const list = (await call(ben, 'GET', '/api/templates')).json();
    expect(list.at(-1).name).toBe('Meine Packliste');
    const made = await call(ben, 'POST', '/api/boards', { name: 'Neue Reise', template: res.json().id });
    expect(made.statusCode).toBe(201);
    expect((await call(ben, 'GET', `/api/boards/${made.json().id}`)).json().cards.length).toBeGreaterThan(0);
  });

  it('prüft Namen und Board', async () => {
    const board = (await call(ben, 'POST', '/api/boards', { name: 'B' })).json();
    expect((await call(ben, 'POST', `/api/boards/${board.id}/save-as-template`, { name: '' })).statusCode).toBe(400);
    expect((await call(ben, 'POST', '/api/boards/gibt-es-nicht/save-as-template', { name: 'N' })).statusCode).toBe(404);
  });

  it('löschen: der Ersteller und ein Administrator ja, jemand anderes nein, eingebaute nie', async () => {
    const board = (await call(ben, 'POST', '/api/boards', { name: 'B' })).json();
    const id = (await call(ben, 'POST', `/api/boards/${board.id}/save-as-template`, { name: 'V' })).json().id as string;
    expect((await call(conny, 'DELETE', `/api/templates/${id}`)).statusCode).toBe(403);
    expect((await call(ben, 'DELETE', `/api/templates/${id}`)).statusCode).toBe(204);
    const again = (await call(ben, 'POST', `/api/boards/${board.id}/save-as-template`, { name: 'W' })).json().id as string;
    expect((await call(admin, 'DELETE', `/api/templates/${again}`)).statusCode).toBe(204);
    expect((await call(admin, 'DELETE', '/api/templates/household')).statusCode).toBe(400);
    expect((await call(admin, 'DELETE', '/api/templates/gibt-es-nicht')).statusCode).toBe(404);
  });
});
