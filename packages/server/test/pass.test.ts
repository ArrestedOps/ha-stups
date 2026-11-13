import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ConflictError, ForbiddenError } from '../src/errors.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Card, type Store } from '../src/store.js';
import { createWatcherData, type Watcher, type WatcherData } from '../src/watcher-data.js';
import { parseWatcher } from '../src/watcher-types.js';
import { createWatchers, type Watchers } from '../src/watchers.js';
import { FakeHa } from './helpers/fake-ha.js';

// Weitergeben: die Aufgabe vom Haus geht an die nächste Person der Rotation, ohne dass die Rotation weiterrückt
const ENTITY = 'sensor.wm';
let t: number;
let store: Store;
let data: WatcherData;
let ha: FakeHa;
let engine: Watchers;
let anna: string;
let ben: string;
let conny: string;
let boardId: string;
let columnId: string;
let assigned: { card: Card; ids: string[] }[];

beforeEach(() => {
  t = Date.parse('2026-11-04T10:00:00Z');
  ha = new FakeHa();
  assigned = [];
  const db = openDb(':memory:');
  store = createStore(db, { now: () => new Date(t), timeZone: () => 'Europe/Berlin' });
  data = createWatcherData(db, () => new Date(t));
  anna = store.addPerson({ haUserId: 'u-anna', name: 'Anna' }).id;
  ben = store.addPerson({ haUserId: 'u-ben', name: 'Ben' }).id;
  conny = store.addPerson({ haUserId: 'u-conny', name: 'Conny' }).id;
  const board = store.createBoard({ name: 'Haushalt', withPlanned: true });
  boardId = board.id;
  columnId = store.getBoardView(board.id).columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  ha.set(ENTITY, '1');
  for (const p of ['anna', 'ben', 'conny']) ha.set(`person.${p}`, 'home', '2026-11-04T08:00:00Z', { friendly_name: p[0]!.toUpperCase() + p.slice(1), user_id: `u-${p}` });
  engine = createWatchers({ store, data, ha, now: () => new Date(t), timeZone: () => 'Europe/Berlin', onAssigned: (card, ids) => assigned.push({ card, ids }) });
  engine.start();
});

/** Ein Wächter mit einer offenen Aufgabe, die Anna hat */
async function setup(assign: Record<string, unknown>): Promise<{ w: Watcher; card: Card }> {
  const w = data.create(
    parseWatcher({
      name: 'Waschmaschine fertig',
      trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 0 },
      card: { boardId, columnId, title: 'Wäsche' },
      assign,
    }),
  );
  await engine.onSaved(w.id);
  const card = store.createCard(boardId, { columnId, title: 'Wäsche', assigneeIds: [anna] }, null);
  store.setCardOrigin(card.id, { watcherId: w.id });
  data.patchState(w.id, { lastPerson: anna });
  assigned.length = 0;
  return { w, card };
}

describe('Weitergeben', () => {
  it('geht an die nächste Person der Rotation; die Rotation rückt nicht weiter', async () => {
    const { w, card } = await setup({ mode: 'rotation', personIds: [anna, ben, conny] });
    const res = await engine.pass(card.id, anna);
    expect(res).toEqual({ to: ben });
    expect(store.getCard(card.id).assigneeIds).toEqual([ben]);
    expect(data.getState(w.id).lastPerson).toBe(anna);
    expect(assigned).toHaveLength(1);
    expect(assigned[0]!.ids).toEqual([ben]);
    // Verlauf: Weitergegeben
    expect(data.runsOfCard(card.id).some((r) => r.result === 'passed' && r.assignedTo[0] === ben)).toBe(true);
    // zählt nicht als erledigt
    expect(store.getCard(card.id).completedAt).toBeNull();
  });

  it('Anwesenheitsregel: nur wer zu Hause ist', async () => {
    const { card } = await setup({ mode: 'rotation_present', personIds: [anna, ben, conny] });
    ha.set('person.ben', 'not_home');
    expect(await engine.pass(card.id, anna)).toEqual({ to: conny });
  });

  it('„wenig Zeit" wird übersprungen', async () => {
    const { card } = await setup({ mode: 'rotation', personIds: [anna, ben, conny] });
    store.setBusyUntil(ben, '2026-11-04');
    expect(await engine.pass(card.id, anna)).toEqual({ to: conny });
  });

  it('niemand sonst im Kreis oder da: die Aufgabe bleibt bei mir', async () => {
    const { card } = await setup({ mode: 'rotation', personIds: [anna] });
    expect(await engine.pass(card.id, anna)).toEqual({ to: null });
    expect(store.getCard(card.id).assigneeIds).toEqual([anna]);
    expect(assigned).toEqual([]);
    ha.set('person.ben', 'not_home');
    ha.set('person.conny', 'not_home');
    const second = await setup({ mode: 'rotation_present', personIds: [anna, ben, conny] });
    ha.set('person.ben', 'not_home');
    ha.set('person.conny', 'not_home');
    expect(await engine.pass(second.card.id, anna)).toEqual({ to: null });
  });

  it('nicht meine Aufgabe: verboten; keine Aufgabe vom Haus oder schon erledigt: Konflikt', async () => {
    const { card } = await setup({ mode: 'rotation', personIds: [anna, ben, conny] });
    await expect(engine.pass(card.id, ben)).rejects.toBeInstanceOf(ForbiddenError);
    const plain = store.createCard(boardId, { columnId, title: 'Normal', assigneeIds: [anna] }, null);
    await expect(engine.pass(plain.id, anna)).rejects.toBeInstanceOf(ConflictError);
    store.completeCard(card.id, { by: anna, source: 'app' });
    await expect(engine.pass(card.id, anna)).rejects.toBeInstanceOf(ConflictError);
  });

  it('zweimal hintereinander: die zweite Anfrage bekommt einen Konflikt (die Aufgabe gehört schon Ben)', async () => {
    const { card } = await setup({ mode: 'rotation', personIds: [anna, ben, conny] });
    await engine.pass(card.id, anna);
    await expect(engine.pass(card.id, anna)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('Schnittstelle', () => {
  let app: FastifyInstance;
  const as = (id: string) => ({ 'x-remote-user-id': id, 'x-remote-user-name': id, 'x-remote-user-display-name': id });
  const post = (who: object, id: string) => app.inject({ method: 'POST', url: `/api/cards/${id}/pass`, headers: who as Record<string, string> });

  beforeEach(async () => {
    app = Fastify();
    await app.register(ingressAuth, { enforceIp: false });
    await app.register(apiRoutes, { store, watchers: engine, watcherData: data, directory: { isAdmin: async () => false, persons: async () => [] } });
  });

  it('Anna gibt weiter, Ben nicht (nicht seine Aufgabe), ein Kind nie', async () => {
    const { card } = await setup({ mode: 'rotation', personIds: [anna, ben, conny] });
    expect((await post(as('u-ben'), card.id)).statusCode).toBe(403);
    store.setChild(conny, { isChild: true });
    expect((await post(as('u-conny'), card.id)).statusCode).toBe(403);
    const res = await post(as('u-anna'), card.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ to: ben });
  });
});
