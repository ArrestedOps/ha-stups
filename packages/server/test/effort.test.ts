import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { migrations } from '../src/migrations.js';
import { createStore, type Store } from '../src/store.js';

const TZ = 'Europe/Berlin';
let now: Date;
let store: Store;
let rene: string;
let boardId: string;
let openId: string;

beforeEach(() => {
  now = new Date('2026-11-03T08:00:00Z');
  store = createStore(openDb(':memory:'), { now: () => now, timeZone: () => TZ });
  rene = store.addPerson({ haUserId: 'ha-rene', name: 'Rene' }).id;
  const b = store.createBoard({ name: 'Haushalt', withPlanned: true });
  boardId = b.id;
  openId = store.getBoardView(b.id).columns[0]!.id;
});

describe('Migration 18', () => {
  it('übernimmt eine Datenbank im Stand von 17 unverändert: Aufwand leer, Zusammenfassung aus', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-mig18-'));
    const file = join(dir, 'k.sqlite');
    const old = openDb(file, { migrations: migrations.filter((m) => m.version <= 17) });
    old.exec(`insert into users (id, name, display_name, is_person, color, created_at, notify_services) values ('u1','anna','Anna',1,'#fff','2026-01-01T00:00:00Z','["svc"]')`);
    old.exec(`insert into boards (id, name, position, archive_after_days, created_at, updated_at) values ('b1','B','a',7,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`);
    old.exec(`insert into columns (id, board_id, name, position, is_done, is_planned) values ('c1','b1','Offen','a',0,0)`);
    old.exec(`insert into cards (id, board_id, column_id, position, title, created_at, updated_at) values ('k1','b1','c1','a','Alt','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`);
    old.close();
    const db = openDb(file, { backupDir: join(dir, 'backups') });
    const s = createStore(db);
    expect(s.getCard('k1').effort).toBeNull();
    expect(s.people()[0]!.weeklySummary).toBe(false);
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBeGreaterThanOrEqual(18);
    expect(() => new DatabaseSync(file).prepare('select effort from cards').all()).not.toThrow();
    db.close();
  });
});

describe('Aufwand an der Aufgabe', () => {
  it('beim Anlegen und Ändern: klein, mittel, groß oder leer', () => {
    const none = store.createCard(boardId, { columnId: openId, title: 'A' }, rene);
    expect(none.effort).toBeNull();
    const big = store.createCard(boardId, { columnId: openId, title: 'B', effort: 'large' }, rene);
    expect(big.effort).toBe('large');
    expect(store.updateCard(big.id, { effort: 'small' }).effort).toBe('small');
    expect(store.updateCard(big.id, { effort: null }).effort).toBeNull();
    expect(store.getBoardView(boardId).cards.find((c) => c.id === big.id)!.effort).toBeNull();
  });

  it('ungültige Werte werden abgelehnt', () => {
    expect(() => store.createCard(boardId, { columnId: openId, title: 'A', effort: 'riesig' }, rene)).toThrow(/Aufwand/);
    const c = store.createCard(boardId, { columnId: openId, title: 'A' }, rene);
    expect(() => store.updateCard(c.id, { effort: 3 })).toThrow(/Aufwand/);
    expect(() => store.updateCard(c.id, { effort: '' })).toThrow(/Aufwand/);
  });

  it('Duplizieren übernimmt den Aufwand', () => {
    const c = store.createCard(boardId, { columnId: openId, title: 'A', effort: 'large' }, rene);
    expect(store.duplicateCard(c.id, rene).effort).toBe('large');
  });

  it('die nächste Aufgabe einer Wiederholung erbt den Aufwand', () => {
    const c = store.createCard(
      boardId,
      { columnId: openId, title: 'Müll', effort: 'small', dueAt: '2026-11-03T07:00:00.000Z', recurrence: { type: 'after_completion', every: 1, unit: 'weeks' } },
      rene,
    );
    const done = store.completeCard(c.id, { by: rene, source: 'app' });
    expect(store.getCard(done.nextCardId!).effort).toBe('small');
  });

  it('eine Vorlage bringt den Aufwand mit, und eine gespeicherte Vorlage behält ihn', () => {
    const board = store.createBoardFromTemplate({ name: 'Zuhause', template: 'household', lang: 'de', by: rene });
    const cards = store.getBoardView(board.id).cards;
    expect(cards.find((c) => c.title === 'Müll rausbringen')!.effort).toBe('small');
    expect(cards.find((c) => c.title === 'Frühjahrsputz')!.effort).toBe('large');
    const saved = store.saveBoardAsTemplate(board.id, 'Meine', rene);
    const data = store.getTemplateData(saved.id, 'de')!;
    expect(data.cards.find((c) => c.title === 'Müll rausbringen')!.effort).toBe('small');
  });
});

describe('Aufwand über die Schnittstelle', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = Fastify();
    await app.register(ingressAuth, { enforceIp: false });
    await app.register(apiRoutes, { store, directory: { isAdmin: async () => true, persons: async () => [] } });
  });
  const headers = { 'x-remote-user-id': 'ha-rene', 'x-remote-user-name': 'Rene', 'x-remote-user-display-name': 'Rene' };

  it('anlegen und ändern', async () => {
    const created = await app.inject({ method: 'POST', url: `/api/boards/${boardId}/cards`, headers, payload: { columnId: openId, title: 'X', effort: 'medium' } });
    expect(created.statusCode).toBe(201);
    expect(created.json().effort).toBe('medium');
    const patched = await app.inject({ method: 'PATCH', url: `/api/cards/${created.json().id}`, headers, payload: { effort: 'large' } });
    expect(patched.json().effort).toBe('large');
    const bad = await app.inject({ method: 'PATCH', url: `/api/cards/${created.json().id}`, headers, payload: { effort: 'riesig' } });
    expect(bad.statusCode).toBe(400);
  });
});
