import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { isBusy, localDateKey } from '../src/busy.js';
import { openDb } from '../src/db.js';
import { ValidationError } from '../src/errors.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';
import { createWatcherData, type Watcher, type WatcherData } from '../src/watcher-data.js';
import { parseWatcher } from '../src/watcher-types.js';
import { createWatchers, type Watchers } from '../src/watchers.js';
import { FakeHa } from './helpers/fake-ha.js';

// „Wenig Zeit": Rotationen der Wächter überspringen die Person bis zu einem Datum; manuelle Zuweisung bleibt möglich
const TZ = 'Europe/Berlin';
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
const ENTITY = 'sensor.wm';

beforeEach(() => {
  t = Date.parse('2026-11-04T10:00:00Z'); // Mi 11:00 Berlin
  ha = new FakeHa();
  const db = openDb(':memory:');
  store = createStore(db, { now: () => new Date(t), timeZone: () => TZ });
  data = createWatcherData(db, () => new Date(t));
  anna = store.addPerson({ haUserId: 'u-anna', name: 'Anna' }).id;
  ben = store.addPerson({ haUserId: 'u-ben', name: 'Ben' }).id;
  conny = store.addPerson({ haUserId: 'u-conny', name: 'Conny' }).id;
  const board = store.createBoard({ name: 'Haushalt', withPlanned: true });
  boardId = board.id;
  columnId = store.getBoardView(board.id).columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  ha.set(ENTITY, '120');
  for (const p of ['anna', 'ben', 'conny']) ha.set(`person.${p}`, 'home', '2026-11-04T08:00:00Z', { friendly_name: p[0]!.toUpperCase() + p.slice(1), user_id: `u-${p}` });
  engine = createWatchers({ store, data, ha, now: () => new Date(t), timeZone: () => TZ });
  engine.start();
});

describe('Datum und Zeitzone', () => {
  it('localDateKey ist der Tag in der Zeitzone des Haushalts', () => {
    expect(localDateKey(Date.parse('2026-11-04T22:30:00Z'), TZ)).toBe('2026-11-04');
    expect(localDateKey(Date.parse('2026-11-04T23:30:00Z'), TZ)).toBe('2026-11-05');
  });
  it('bis einschließlich dem Datum ist die Person beschäftigt', () => {
    const at = (iso: string) => Date.parse(iso);
    expect(isBusy('2026-11-06', at('2026-11-06T22:59:00Z'), TZ)).toBe(true); // 6.11. 23:59 Berlin
    expect(isBusy('2026-11-06', at('2026-11-06T23:00:00Z'), TZ)).toBe(false); // 7.11. 00:00 Berlin
    expect(isBusy(null, at('2026-11-06T10:00:00Z'), TZ)).toBe(false);
  });
});

describe('Speichern', () => {
  it('setBusyUntil nimmt ein Datum von heute bis 90 Tage und null (zurücknehmen)', () => {
    expect(store.setBusyUntil(anna, '2026-11-10').busyUntil).toBe('2026-11-10');
    expect(store.setBusyUntil(anna, '2026-11-04').busyUntil).toBe('2026-11-04'); // heute zählt
    expect(store.setBusyUntil(anna, null).busyUntil).toBeNull();
    expect(store.setBusyUntil(anna, '2027-02-02').busyUntil).toBe('2027-02-02'); // 90 Tage
  });
  it('lehnt Vergangenheit, zu weit Entferntes, Unsinn und nicht existierende Tage ab', () => {
    for (const bad of ['2026-11-03', '2027-02-03', 'morgen', '2026-13-01', '2026-02-30', 5, {}]) {
      expect(() => store.setBusyUntil(anna, bad), String(bad)).toThrow(ValidationError);
    }
    expect(store.userById(anna)?.busyUntil).toBeNull();
  });
});

describe('Rotation überspringt Personen mit wenig Zeit', () => {
  async function watcher(assign: Record<string, unknown>): Promise<Watcher> {
    const w = data.create(
      parseWatcher({
        name: 'Waschmaschine fertig',
        trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 0 },
        card: { boardId, columnId, title: 'Wäsche' },
        assign,
        cooldownMin: 0,
        dedupe: false,
      }),
    );
    await engine.onSaved(w.id);
    return w;
  }
  const trigger = async (w: Watcher) => {
    ha.set(ENTITY, '120');
    ha.emit(`w:${w.id}:fire`, '120');
    await engine.idle();
    t += 60_000;
    ha.set(ENTITY, '1');
    ha.emit(`w:${w.id}:fire`, '1');
    await engine.idle();
    t += 60_000;
  };
  const last = () => store.getBoardView(boardId).cards.at(-1)!.assigneeIds;

  it('Reihum: die beschäftigte Person wird übersprungen, danach ist sie wieder dran', async () => {
    const w = await watcher({ mode: 'rotation', personIds: [anna, ben, conny] });
    store.setBusyUntil(ben, '2026-11-04');
    await trigger(w);
    expect(last()).toEqual([anna]);
    await trigger(w);
    expect(last()).toEqual([conny]); // Ben ist dran, hat aber wenig Zeit
    t = Date.parse('2026-11-05T10:00:00Z'); // am nächsten Tag ist Ben wieder dabei
    await trigger(w);
    expect(last()).toEqual([anna]);
    await trigger(w);
    expect(last()).toEqual([ben]);
  });

  it('Reihum, wer zu Hause ist: ebenso', async () => {
    const w = await watcher({ mode: 'rotation_present', personIds: [anna, ben, conny] });
    store.setBusyUntil(anna, '2026-11-04');
    await trigger(w);
    expect(last()).toEqual([ben]);
  });

  it('sind alle beschäftigt, geht keine Aufgabe verloren: es gilt die normale Reihenfolge', async () => {
    const w = await watcher({ mode: 'rotation', personIds: [anna, ben] });
    store.setBusyUntil(anna, '2026-11-10');
    store.setBusyUntil(ben, '2026-11-10');
    await trigger(w);
    expect(last()).toEqual([anna]);
  });

  it('feste Zuweisung bleibt bei der beschäftigten Person (manuell/fest ist möglich)', async () => {
    const w = await watcher({ mode: 'fixed', personIds: [anna] });
    store.setBusyUntil(anna, '2026-11-10');
    await trigger(w);
    expect(last()).toEqual([anna]);
  });
});

describe('Schnittstelle', () => {
  let app: FastifyInstance;
  const as = (id: string) => ({ 'x-remote-user-id': id, 'x-remote-user-name': id, 'x-remote-user-display-name': id });
  const patch = (who: object, id: string, payload: object) => app.inject({ method: 'PATCH', url: `/api/access/people/${id}`, headers: who as Record<string, string>, payload });

  beforeEach(async () => {
    app = Fastify();
    await app.register(ingressAuth, { enforceIp: false });
    await app.register(apiRoutes, { store, directory: { isAdmin: async (id: string) => id === 'u-conny', persons: async () => [] } });
  });

  it('jeder stellt sich selbst ein, ein Mitglied nicht die anderen, ein Administrator jeden', async () => {
    const res = await patch(as('u-anna'), anna, { busyUntil: '2026-11-08' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ busyUntil: '2026-11-08' });
    expect((await patch(as('u-anna'), ben, { busyUntil: '2026-11-08' })).statusCode).toBe(403);
    expect((await patch(as('u-conny'), ben, { busyUntil: '2026-11-08' })).statusCode).toBe(200);
    expect((await patch(as('u-anna'), anna, { busyUntil: null })).json()).toMatchObject({ busyUntil: null });
    expect((await patch(as('u-anna'), anna, { busyUntil: '2020-01-01' })).statusCode).toBe(400);
  });
});
