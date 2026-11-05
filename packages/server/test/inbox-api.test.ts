import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';

const as = (id: string) => ({ 'x-remote-user-id': `ha-${id}`, 'x-remote-user-name': id, 'x-remote-user-display-name': id });
let app: FastifyInstance;
let store: Store;
let now: Date;
let cardId: string;
let annaId: string;
let benId: string;

beforeEach(async () => {
  now = new Date('2026-11-04T10:00:00Z');
  store = createStore(openDb(':memory:'), { now: () => now });
  annaId = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
  benId = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
  const b = store.createBoard({ name: 'Haushalt' });
  cardId = store.createCard(b.id, { columnId: store.getBoardView(b.id).columns[0]!.id, title: 'Bad putzen', assigneeIds: [annaId] }, benId).id;
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, { store, directory: { isAdmin: async (id: string) => id === 'ha-ben', persons: async () => [] } });
});

const get = (who: string, qs = '') => app.inject({ method: 'GET', url: `/api/inbox${qs}`, headers: as(who) });

describe('GET /api/inbox und PUT /api/me/inbox-seen', () => {
  it('liefert die Einträge der angemeldeten Person und nur ihre', async () => {
    store.addComment(cardId, benId, 'Hallo');
    const a = (await get('anna')).json();
    expect(a.items).toEqual([expect.objectContaining({ kind: 'comment', cardId, cardTitle: 'Bad putzen', actorId: benId, text: 'Hallo' })]);
    expect(a.hasMore).toBe(false);
    expect((await get('ben')).json().items).toEqual([]);
  });

  it('„before" wird geprüft (400, nie 500) und blättert', async () => {
    store.addComment(cardId, benId, 'Hallo');
    for (const bad of ['gestern', '2026-11-04', '1', "x'; drop table users;--", '2026-13-45T99:99:99Z']) {
      expect((await get('anna', `?before=${encodeURIComponent(bad)}`)).statusCode, bad).toBe(400);
    }
    expect((await get('anna', `?before=${encodeURIComponent('2026-11-04T09:00:00.000Z')}`)).json().items).toEqual([]);
    expect((await get('anna', `?before=${encodeURIComponent('2026-11-04T11:00:00.000Z')}`)).json().items).toHaveLength(1);
  });

  it('Alle gelesen setzt den Marker der Person auf jetzt', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/me/inbox-seen', headers: as('anna'), payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ seenAt: '2026-11-04T10:00:00.000Z' });
    expect((await get('anna')).json().seenAt).toBe('2026-11-04T10:00:00.000Z');
    expect((await get('ben')).json().seenAt).toBeNull(); // später angelegt: noch nichts gelesen
  });

  it('der Administrator sieht Bitten um Bestätigung für Kinder, andere ohne Recht nicht', async () => {
    const kim = store.addPerson({ haUserId: 'ha-kim', name: 'Kim' }).id;
    store.setChild(kim, { isChild: true, confirmers: [annaId] });
    store.requestConfirmation(cardId, kim);
    expect((await get('ben')).json().items.map((i: { kind: string }) => i.kind)).toContain('confirm'); // Administrator
    expect((await get('anna')).json().items.map((i: { kind: string }) => i.kind)).toContain('confirm'); // gewählter Bestätiger
  });
});
