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

// "Erst vorschlagen": die Karte entsteht ohne Zuständige, die Anwesenden werden gefragt, die erste Antwort gewinnt, nach 30 Minuten greift der Rückfall
const ENTITY = 'sensor.wm';
let t: number;
let store: Store;
let data: WatcherData;
let ha: FakeHa;
let engine: Watchers;
let anna: string;
let ben: string;
let conny: string;
let mia: string;
let boardId: string;
let columnId: string;
let asked: { card: Card; ids: string[] }[];
let assigned: { card: Card; ids: string[] }[];
let closed: string[];

const advance = (min: number) => (t += min * 60_000);

beforeEach(() => {
  t = Date.parse('2026-11-04T10:00:00Z');
  ha = new FakeHa();
  asked = [];
  assigned = [];
  closed = [];
  const db = openDb(':memory:');
  store = createStore(db, { now: () => new Date(t), timeZone: () => 'Europe/Berlin' });
  data = createWatcherData(db, () => new Date(t));
  anna = store.addPerson({ haUserId: 'u-anna', name: 'Anna' }).id;
  ben = store.addPerson({ haUserId: 'u-ben', name: 'Ben' }).id;
  conny = store.addPerson({ haUserId: 'u-conny', name: 'Conny' }).id;
  mia = store.addPerson({ haUserId: 'u-mia', name: 'Mia' }).id;
  store.setChild(mia, { isChild: true });
  const board = store.createBoard({ name: 'Haushalt', withPlanned: true });
  boardId = board.id;
  columnId = store.getBoardView(board.id).columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  ha.set(ENTITY, '120');
  for (const p of ['anna', 'ben', 'conny', 'mia']) ha.set(`person.${p}`, 'home', '2026-11-04T08:00:00Z', { friendly_name: p[0]!.toUpperCase() + p.slice(1), user_id: `u-${p}` });
  engine = createWatchers({
    store,
    data,
    ha,
    now: () => new Date(t),
    timeZone: () => 'Europe/Berlin',
    onSuggest: (card, ids) => asked.push({ card, ids }),
    onSuggestClosed: (card) => closed.push(card.id),
    onAssigned: (card, ids) => assigned.push({ card, ids }),
  });
  engine.start();
});

async function suggestWatcher(extra: Record<string, unknown> = {}): Promise<{ w: Watcher; card: Card }> {
  const w = data.create(
    parseWatcher({
      name: 'Waschmaschine fertig',
      trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 0 },
      card: { boardId, columnId, title: 'Wäsche' },
      assign: { mode: 'suggest', personIds: [], fallback: 'next', ...extra },
    }),
  );
  await engine.onSaved(w.id);
  ha.emit(`w:${w.id}:fire`, '120');
  await engine.idle();
  ha.set(ENTITY, '1');
  ha.emit(`w:${w.id}:fire`, '1');
  await engine.idle();
  return { w, card: store.getBoardView(boardId).cards.at(-1)! };
}

describe('Karte entsteht ohne Zuständige', () => {
  it('fragt alle Erwachsenen, die zu Hause sind (nicht Abwesende, nicht Kinder)', async () => {
    ha.set('person.ben', 'not_home');
    const { w, card } = await suggestWatcher();
    expect(card.assigneeIds).toEqual([]);
    expect(asked).toHaveLength(1);
    expect(asked[0]!.ids.sort()).toEqual([anna, conny].sort());
    expect(assigned).toEqual([]);
    expect(data.getSuggest(card.id)).toMatchObject({ watcherId: w.id });
    expect(data.runsOfCard(card.id).map((r) => r.result)).toContain('suggested');
  });

  it('niemand zu Hause: sofort der Rückfall des Wächters, keine Frage', async () => {
    for (const p of ['anna', 'ben', 'conny', 'mia']) ha.set(`person.${p}`, 'not_home');
    const { card } = await suggestWatcher({ fallback: 'fixed', fallbackPersonId: conny });
    expect(asked).toEqual([]);
    expect(card.assigneeIds).toEqual([conny]);
    expect(data.getSuggest(card.id)).toBeNull();
  });
});

describe('Übernehmen', () => {
  it('die erste Person bekommt die Karte, die Frage bei den anderen wird weggeräumt', async () => {
    const { card } = await suggestWatcher();
    await engine.claim(card.id, ben);
    expect(store.getCard(card.id).assigneeIds).toEqual([ben]);
    expect(data.getSuggest(card.id)).toBeNull();
    expect(closed).toEqual([card.id]);
    expect(data.runsOfCard(card.id).map((r) => r.result)).toContain('claimed');
  });

  it('die zweite Person erfährt, wer schneller war (Konflikt, nichts ändert sich)', async () => {
    const { card } = await suggestWatcher();
    await engine.claim(card.id, ben);
    await expect(engine.claim(card.id, anna)).rejects.toBeInstanceOf(ConflictError);
    await expect(engine.claim(card.id, anna)).rejects.toThrow(/Ben/);
    expect(store.getCard(card.id).assigneeIds).toEqual([ben]);
  });

  it('ein Kind übernimmt nicht; eine erledigte Karte lässt sich nicht mehr übernehmen', async () => {
    const { card } = await suggestWatcher();
    await expect(engine.claim(card.id, mia)).rejects.toBeInstanceOf(ForbiddenError);
    store.completeCard(card.id, { by: anna, source: 'app' });
    await expect(engine.claim(card.id, anna)).rejects.toBeInstanceOf(ConflictError);
  });

  it('wer wenig Zeit hat, darf trotzdem übernehmen', async () => {
    const { card } = await suggestWatcher();
    store.setBusyUntil(anna, '2026-11-10');
    await engine.claim(card.id, anna);
    expect(store.getCard(card.id).assigneeIds).toEqual([anna]);
  });
});

describe('Rückfall nach 30 Minuten', () => {
  it('vorher nichts, danach greift der Rückfall „nächste Person"', async () => {
    const { card } = await suggestWatcher();
    advance(29);
    await engine.tick();
    expect(store.getCard(card.id).assigneeIds).toEqual([]);
    advance(1);
    await engine.tick();
    expect(store.getCard(card.id).assigneeIds).toHaveLength(1);
    expect(data.getSuggest(card.id)).toBeNull();
    expect(closed).toEqual([card.id]);
    expect(assigned).toHaveLength(1);
    expect(data.runsOfCard(card.id).map((r) => r.result)).toContain('suggest_fallback');
  });

  it('Rückfall „alle": alle im Kreis bekommen die Karte', async () => {
    const { card } = await suggestWatcher({ fallback: 'all', personIds: [anna, ben] });
    advance(31);
    await engine.tick();
    expect(store.getCard(card.id).assigneeIds.sort()).toEqual([anna, ben].sort());
  });

  it('Rückfall „keiner": die Karte bleibt offen und ohne Zuständige', async () => {
    const { card } = await suggestWatcher({ fallback: 'none' });
    advance(31);
    await engine.tick();
    expect(store.getCard(card.id).assigneeIds).toEqual([]);
    expect(data.getSuggest(card.id)).toBeNull();
  });

  it('wurde die Karte inzwischen von Hand zugewiesen oder erledigt, verfällt der Vorschlag ohne Rückfall', async () => {
    const { card } = await suggestWatcher();
    store.updateCard(card.id, { assigneeIds: [ben] });
    advance(31);
    await engine.tick();
    expect(store.getCard(card.id).assigneeIds).toEqual([ben]);
    expect(data.getSuggest(card.id)).toBeNull();
    expect(closed).toEqual([]);
  });
});

describe('Schnittstelle', () => {
  let app: FastifyInstance;
  const as = (id: string) => ({ 'x-remote-user-id': id, 'x-remote-user-name': id, 'x-remote-user-display-name': id });
  const post = (who: object, id: string) => app.inject({ method: 'POST', url: `/api/cards/${id}/claim`, headers: who as Record<string, string> });

  beforeEach(async () => {
    app = Fastify();
    await app.register(ingressAuth, { enforceIp: false });
    await app.register(apiRoutes, { store, watchers: engine, watcherData: data, directory: { isAdmin: async () => false, persons: async () => [] } });
  });

  it('übernehmen: 200 für die erste Person, 409 mit Klartext für die zweite, 403 für ein Kind', async () => {
    const { card } = await suggestWatcher();
    expect((await post(as('u-mia'), card.id)).statusCode).toBe(403);
    expect((await post(as('u-ben'), card.id)).statusCode).toBe(200);
    const second = await post(as('u-anna'), card.id);
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toContain('Ben');
  });
});

describe('Push: Frage und Knopf „Übernehmen"', () => {
  it('die Frage trägt den Knopf, ein Tipp übernimmt, ein zweiter Tipp meldet „taken", die Frage wird weggeräumt', async () => {
    const { createNotifier } = await import('../src/notifications.js');
    const sent: { userId: string; title: string; actions: string[] }[] = [];
    const cleared: string[] = [];
    const notifier = createNotifier({
      store,
      push: {
        canReach: () => true,
        send: async (userId, m) => {
          sent.push({ userId, title: m.title, actions: (m.actions ?? []).map((a) => a.id) });
          return true;
        },
        clear: async (userId) => void cleared.push(userId),
      },
      options: { dailySummaryTime: '23:59', overdueNagTime: '09:00' },
      now: () => new Date(t),
      timeZone: () => 'Europe/Berlin',
      claim: (cardId, userId) => engine.claim(cardId, userId),
    });
    const { card } = await suggestWatcher();
    await notifier.notifySuggest(card, [anna, ben]);
    expect(sent.map((s) => s.userId)).toEqual([anna, ben]);
    expect(sent[0]!.actions).toEqual([`KANBAN_CLAIM:${card.id}`]);
    expect(await notifier.handleAction({ action: `KANBAN_CLAIM:${card.id}`, personId: ben })).toBe('claimed');
    expect(await notifier.handleAction({ action: `KANBAN_CLAIM:${card.id}`, personId: anna })).toBe('taken');
    expect(store.getCard(card.id).assigneeIds).toEqual([ben]);
    await notifier.suggestClosed(card);
    expect(cleared).toHaveLength(store.people().length);
  });
});
