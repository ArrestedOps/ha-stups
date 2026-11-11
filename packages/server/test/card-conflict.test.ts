import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ConflictError, ValidationError } from '../src/errors.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';

/**
 * Konfliktschutz beim Ändern einer Karte: Wer mit `expectedVersion` schreibt, bekommt 409, wenn die Karte inzwischen jemand anderes
 * geändert hat. Die neuere Änderung bleibt dann unberührt. Ohne `expectedVersion` gilt wie bisher: die letzte Änderung gewinnt.
 */
const h = { 'x-remote-user-id': 'ha-anna', 'x-remote-user-name': 'Anna', 'x-remote-user-display-name': 'Anna' };

let store: Store;
let app: FastifyInstance;
let annaId: string;
let cardId: string;

beforeEach(async () => {
  store = createStore(openDb(':memory:'));
  annaId = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
  const board = store.createBoard({ name: 'Haushalt' });
  const col = store.getBoardView(board.id).columns[0]!.id;
  cardId = store.createCard(board.id, { columnId: col, title: 'Müll raus', dueAt: '2026-11-05T10:00:00Z' }, annaId).id;
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, { store, directory: { isAdmin: async () => false, persons: async () => [] } });
});

const patch = (payload: object) => app.inject({ method: 'PATCH', url: `/api/cards/${cardId}`, headers: h, payload });

describe('expectedVersion beim Ändern einer Karte', () => {
  it('passt die Version, wird geändert und die Version steigt; ohne Angabe gewinnt wie bisher die letzte Änderung', () => {
    const before = store.getCard(cardId);
    const after = store.updateCard(cardId, { title: 'Müll runter', expectedVersion: before.version });
    expect(after.title).toBe('Müll runter');
    expect(after.version).toBe(before.version + 1);
    expect(store.updateCard(cardId, { title: 'ohne Vorbedingung' }).title).toBe('ohne Vorbedingung');
  });

  it('eine veraltete Version wird abgewiesen (ConflictError) und ändert nichts, auch nicht Zuständige oder Kategorien', () => {
    const stale = store.getCard(cardId).version;
    store.updateCard(cardId, { dueAt: '2026-11-07T10:00:00Z' }, annaId); // Ben legt zwischendurch einen anderen Termin fest
    const now = store.getCard(cardId);
    expect(() => store.updateCard(cardId, { dueAt: '2026-11-06T10:00:00Z', title: 'Alt', assigneeIds: [annaId], expectedVersion: stale })).toThrow(ConflictError);
    const unchanged = store.getCard(cardId);
    expect(unchanged).toMatchObject({ dueAt: '2026-11-07T10:00:00.000Z', title: 'Müll raus', version: now.version });
    expect(unchanged.assigneeIds).toEqual(now.assigneeIds);
  });

  it('die Vorbedingung muss eine ganze Zahl sein (sonst 400-Fehler, nie 500)', () => {
    for (const bad of ['1', 1.5, -1, null, {}]) {
      expect(() => store.updateCard(cardId, { title: 'x', expectedVersion: bad }), String(bad)).toThrow(ValidationError);
    }
    expect(store.getCard(cardId).title).toBe('Müll raus');
  });
});

describe('PATCH /api/cards/:id mit expectedVersion', () => {
  it('veraltet: 409 mit verständlicher Meldung und der aktuellen Version, die Karte bleibt wie sie ist', async () => {
    const stale = store.getCard(cardId).version;
    store.updateCard(cardId, { dueAt: '2026-11-07T10:00:00Z' }, annaId);
    const res = await patch({ dueAt: '2026-11-06T10:00:00Z', expectedVersion: stale });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/zwischenzeitlich geändert/);
    expect(store.getCard(cardId).dueAt).toBe('2026-11-07T10:00:00.000Z');
  });

  it('aktuell: 200; ungültig: 400; fehlt sie: wie bisher', async () => {
    expect((await patch({ title: 'A', expectedVersion: store.getCard(cardId).version })).statusCode).toBe(200);
    expect((await patch({ title: 'B', expectedVersion: 'abc' })).statusCode).toBe(400);
    expect((await patch({ title: 'C' })).statusCode).toBe(200);
    expect(store.getCard(cardId).title).toBe('C');
  });
});
