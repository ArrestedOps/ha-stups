import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';
import { createWatcherData, type WatcherData } from '../src/watcher-data.js';
import { createWatchers } from '../src/watchers.js';
import { FakeHa } from './helpers/fake-ha.js';

/**
 * Board löschen (mit Wahl je Wächter), archivieren, duplizieren, als Vorlage speichern, Reihenfolge. Rene ist Besitzer der Boards, Chef
 * Administrator, Anna ein Mitglied ohne Rechte am Board.
 */
const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const rene = as('ha-rene', 'Rene');
const anna = as('ha-anna', 'Anna');
const chef = as('ha-chef', 'Chef');

const ENTITY = 'sensor.waschmaschine_leistung';
const NOW = new Date('2026-11-04T12:00:00Z');

let app: FastifyInstance;
let store: Store;
let data: WatcherData;
let ids: { rene: string; anna: string; chef: string };
let ha: FakeHa;
let haus: { board: string; col: string };
let bad: { board: string; col: string };

function mk(name: string, visibility: 'all' | 'private' | 'selected' = 'all', owner: string | null = ids.rene, members: string[] = []) {
  const b = store.createBoard({ name, visibility, ownerId: owner, memberIds: members, withPlanned: true });
  return { board: b.id, col: store.getBoardView(b.id).columns.find((c) => !c.isDone && !c.isPlanned)!.id };
}

function watcher(name: string, target: { board: string; col: string }, assign: { mode: 'rotation' | 'fixed' | 'none'; personIds: string[] } = { mode: 'rotation', personIds: [] }, active = true) {
  return data.create({
    name,
    active,
    trigger: { entityId: ENTITY, kind: 'below', to: null, value: 5, forMin: 0, count: 1 },
    card: { boardId: target.board, columnId: target.col, title: name, description: null, categoryIds: [], priority: null, due: { kind: 'none' } },
    assign: { ...assign, fallback: 'next', waitFallback: 'none', fallbackPersonId: null },
    done: null,
    cooldownMin: 10,
    dedupe: true,
    nudge: null,
    category: null,
    countsForFairness: true,
  }).id;
}

async function call(who: object, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const res = await app.inject({ method, url, headers: who as Record<string, string>, payload: method === 'GET' ? undefined : (payload ?? {}) });
  return { status: res.statusCode, body: res.body && res.headers['content-type']?.toString().includes('json') ? (res.json() as any) : null };
}

beforeEach(async () => {
  ha = new FakeHa();
  const db = openDb(':memory:');
  store = createStore(db, { now: () => NOW });
  ids = {
    rene: store.addPerson({ haUserId: 'ha-rene', name: 'Rene' }).id,
    anna: store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id,
    chef: store.addPerson({ haUserId: 'ha-chef', name: 'Chef' }).id,
  };
  haus = mk('Haushalt');
  bad = mk('Bad-Umbau');
  ha.set(ENTITY, '120', '2026-11-04T09:00:00Z', { friendly_name: 'Waschmaschine Leistung', unit_of_measurement: 'W' });
  data = createWatcherData(db);
  const engine = createWatchers({ store, data, ha, now: () => NOW, timeZone: () => 'Europe/Berlin' });
  engine.start();
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    directory: { isAdmin: async (id: string) => id === 'ha-chef', persons: async () => [] },
    ha: { listDashboards: async () => [], getStates: () => ha.getStates() },
    now: () => NOW,
    watchers: engine,
    watcherData: data,
  });
});

const task = (target: { board: string; col: string }, title: string, extra: Record<string, unknown> = {}) =>
  store.createCard(target.board, { columnId: target.col, title, ...extra }, ids.rene);

describe('Löschen: Vorschau', () => {
  it('nennt Aufgaben (davon offen), wiederkehrende mit Regel, Wächter und persönliche Erinnerungen', async () => {
    task(haus, 'Offen');
    const done = task(haus, 'Fertig');
    store.completeCard(done.id, { by: ids.rene, source: 'app' });
    task(haus, 'Bett beziehen', { dueAt: '2026-11-07T08:00:00.000Z', recurrence: { type: 'fixed', freq: 'weekly', every: 2, weekdays: [6] } });
    const remind = task(haus, 'Mit Erinnerung', { dueAt: '2026-11-10T08:00:00.000Z' });
    store.setReminder(remind.id, ids.rene, { anchor: 'due', afterMin: 60, everyMin: null, max: 1, atTime: null });
    const wid = watcher('Waschmaschine fertig', haus);
    const res = await call(rene, 'GET', `/api/boards/${haus.board}/delete-preview`);
    expect(res.status).toBe(200);
    expect(res.body.cards).toEqual({ total: 4, open: 3 });
    expect(res.body.recurring).toEqual([{ id: expect.any(String), title: 'Bett beziehen', recurrence: expect.objectContaining({ freq: 'weekly', every: 2 }) }]);
    expect(res.body.watchers).toEqual([{ id: wid, name: 'Waschmaschine fertig', active: true }]);
    expect(res.body.reminders).toBe(1);
    expect(res.body.lock).toBeNull();
    expect(res.body.mayManage).toBe(true);
  });

  it('meldet das letzte Board als gesperrt und ein fremdes Board mit dem Besitzer', async () => {
    store.deleteBoardWith(bad.board, undefined, ids.rene);
    expect((await call(rene, 'GET', `/api/boards/${haus.board}/delete-preview`)).body.lock).toBe('last');
    const other = mk('Anna-Board', 'all', ids.anna);
    const res = await call(rene, 'GET', `/api/boards/${other.board}/delete-preview`);
    expect(res.body).toMatchObject({ mayManage: false, ownerName: 'Anna', lock: null });
  });
});

describe('Löschen: Sperren und Rechte', () => {
  it('das letzte sichtbare Board ist nicht löschbar (409 mit klarer Meldung), auch nicht über die Wahl der Wächter', async () => {
    store.deleteBoardWith(bad.board, undefined, ids.rene);
    const res = await call(rene, 'POST', `/api/boards/${haus.board}/delete`, { watchers: {} });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Das letzte Board kann nicht gelöscht werden.');
    expect((await call(rene, 'DELETE', `/api/boards/${haus.board}`)).status).toBe(409);
    expect((await call(rene, 'GET', '/api/boards')).body).toHaveLength(1);
  });

  it('„letztes" gilt für die Person: ein Board, das sie als einziges sieht, bleibt, auch wenn andere Boards für andere existieren', async () => {
    store.updateBoard(bad.board, { visibility: 'private' }, ids.rene);
    store.updateBoard(haus.board, { visibility: 'private' }, ids.rene);
    const solo = mk('Meine Ideen', 'private', ids.anna);
    mk('Fremd', 'private', ids.chef);
    expect((await call(anna, 'DELETE', `/api/boards/${solo.board}`)).status).toBe(409);
  });

  it('ein Board, das die Person nicht verwalten darf: 403 mit dem Besitzer; ein Administrator darf', async () => {
    const res = await call(anna, 'POST', `/api/boards/${bad.board}/delete`, {});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Nur Rene oder ein Administrator darf löschen.');
    expect((await call(anna, 'DELETE', `/api/boards/${bad.board}`)).status).toBe(403);
    expect((await call(anna, 'POST', `/api/boards/${bad.board}/archive-board`, {})).body.error).toBe('Nur Rene oder ein Administrator darf archivieren.');
    expect((await call(chef, 'POST', `/api/boards/${bad.board}/delete`, {})).status).toBe(200);
  });

  it('ein Board ohne Besitzer (Bestand) darf jeder Erwachsene löschen', async () => {
    const legacy = mk('Alt', 'all', null);
    expect((await call(anna, 'DELETE', `/api/boards/${legacy.board}`)).status).toBe(204);
  });
});

describe('Löschen: Wahl je Wächter', () => {
  it('Standard ist Pausieren: Status „Board fehlt", aus, mit Grund „deleted"', async () => {
    const wid = watcher('Waschmaschine fertig', haus);
    const res = await call(rene, 'POST', `/api/boards/${haus.board}/delete`, { watchers: {} });
    expect(res.body).toEqual({ paused: [wid], moved: [], removed: [] });
    expect(data.get(wid)).toMatchObject({ status: 'target_missing', active: false });
    const list = (await call(rene, 'GET', '/api/watchers')).body.items;
    expect(list[0]).toMatchObject({ status: 'target_missing', pausedBy: 'deleted' });
  });

  it('Umziehen: Aufgaben-Vorlage auf das Ziel; Zuständige nur aus dem Ziel, sonst „braucht neue Zuständige"', async () => {
    const target = mk('Ziel', 'selected', ids.rene, []); // nur Rene
    const stays = watcher('Bleibt', haus, { mode: 'rotation', personIds: [ids.rene] });
    const loses = watcher('Verliert', haus, { mode: 'fixed', personIds: [ids.anna] });
    const all = watcher('Alle', haus, { mode: 'rotation', personIds: [] });
    const res = await call(rene, 'POST', `/api/boards/${haus.board}/delete`, {
      watchers: { [stays]: { action: 'move', boardId: target.board }, [loses]: { action: 'move', boardId: target.board }, [all]: { action: 'move', boardId: target.board } },
    });
    expect(res.status).toBe(200);
    expect(res.body.moved.sort()).toEqual([stays, loses, all].sort());
    expect(data.get(stays)).toMatchObject({ status: 'ok', active: true, card: { boardId: target.board, columnId: target.col } });
    expect(data.get(loses)).toMatchObject({ status: 'assignees_missing', active: true, assign: { personIds: [] } });
    expect(data.get(all)).toMatchObject({ status: 'ok', assign: { personIds: [] } });
    expect((await call(rene, 'GET', '/api/boards')).body.map((b: any) => b.id)).not.toContain(haus.board);
  });

  it('Löschen: der Wächter ist weg, andere Wächter pausieren', async () => {
    const gone = watcher('Weg', haus);
    const paused = watcher('Pause', haus);
    const elsewhere = watcher('Woanders', bad);
    const res = await call(rene, 'POST', `/api/boards/${haus.board}/delete`, { watchers: { [gone]: { action: 'delete' } } });
    expect(res.body).toEqual({ paused: [paused], moved: [], removed: [gone] });
    expect(() => data.get(gone)).toThrow();
    expect(data.get(paused).status).toBe('target_missing');
    expect(data.get(elsewhere)).toMatchObject({ status: 'ok', active: true });
  });

  it('ein von Hand pausierter Wächter bleibt, wie er ist (kein Status, damit das Wiederherstellen ihn nicht einschaltet)', async () => {
    const off = watcher('Aus', haus, { mode: 'rotation', personIds: [] }, false);
    await call(rene, 'POST', `/api/boards/${haus.board}/delete`, {});
    expect(data.get(off)).toMatchObject({ status: 'ok', active: false });
    await call(rene, 'POST', `/api/trash/board/${haus.board}/restore`);
    expect(data.get(off)).toMatchObject({ status: 'ok', active: false });
  });

  it('prüft die Wahl, bevor etwas geschieht: private, archivierte, dasselbe oder fremde Boards und unbekannte Wächter lehnt der Server ab', async () => {
    const wid = watcher('Waschmaschine fertig', haus);
    const priv = mk('Privat', 'private', ids.rene);
    const arch = mk('Archiv');
    store.archiveBoard(arch.board, ids.rene);
    const fremd = mk('Fremd', 'private', ids.anna);
    for (const boardId of [priv.board, arch.board, haus.board, fremd.board, 'gibt-es-nicht']) {
      const res = await call(rene, 'POST', `/api/boards/${haus.board}/delete`, { watchers: { [wid]: { action: 'move', boardId } } });
      expect(res.status, boardId).toBe(400);
    }
    expect((await call(rene, 'POST', `/api/boards/${haus.board}/delete`, { watchers: { [wid]: { action: 'move' } } })).status).toBe(400);
    expect((await call(rene, 'POST', `/api/boards/${haus.board}/delete`, { watchers: { [wid]: { action: 'explodieren' } } })).status).toBe(400);
    expect((await call(rene, 'POST', `/api/boards/${haus.board}/delete`, { watchers: { 'fremder-waechter': { action: 'delete' } } })).status).toBe(400);
    // nichts ist passiert
    expect(store.listBoards(ids.rene).map((b) => b.id)).toContain(haus.board);
    expect(data.get(wid)).toMatchObject({ status: 'ok', active: true });
  });

  it('alles in einer Transaktion: scheitert ein Teil, bleibt alles, wie es war', async () => {
    const a = watcher('A', haus);
    const b = watcher('B', haus);
    // der zweite Wächter zeigt auf ein Ziel ohne Spalten: der Umzug scheitert mitten in der Ausführung
    const target = { board: store.createBoard({ name: 'Ziel ohne Spalten', columns: [] }).id };
    expect(() =>
      store.deleteBoardWith(haus.board, { [a]: { action: 'delete' }, [b]: { action: 'move', boardId: target.board } }, ids.rene),
    ).toThrow();
    expect(data.get(a)).toBeTruthy();
    expect(store.listBoards(ids.rene).map((x) => x.id)).toContain(haus.board);
  });
});

describe('Wiederherstellen aus dem Papierkorb', () => {
  it('pausierte Wächter laufen von selbst wieder, der Status verschwindet', async () => {
    const w1 = watcher('Waschmaschine fertig', haus);
    const w2 = watcher('Batterie wechseln', haus);
    await call(rene, 'POST', `/api/boards/${haus.board}/delete`, {});
    expect(data.get(w1).status).toBe('target_missing');
    const res = await call(rene, 'POST', `/api/trash/board/${haus.board}/restore`);
    expect(res.status).toBe(204);
    for (const id of [w1, w2]) expect(data.get(id)).toMatchObject({ status: 'ok', active: true });
    const items = (await call(rene, 'GET', '/api/watchers')).body.items;
    expect(items.every((i: any) => i.status === 'ok' && i.pausedBy === null)).toBe(true);
  });

  it('ein Wächter, dessen Spalte fehlt, bleibt pausiert', () => {
    const w = watcher('Waschmaschine fertig', bad);
    const spare = store.addColumn(bad.board, { name: 'Reserve' });
    store.deleteColumn(bad.col, spare.id);
    data.setStatus(w, 'target_missing');
    data.setActive(w, false);
    expect(store.resumeWatchersOfBoard(bad.board)).toEqual([]);
    expect(data.get(w)).toMatchObject({ status: 'target_missing', active: false });
  });
});

describe('Archivieren', () => {
  it('das Board verschwindet aus Auswahl und Listen, ist für Direktaufrufe nicht da und taucht unter „Archivierte Boards" auf', async () => {
    task(bad, 'Fliesen bestellen');
    const res = await call(rene, 'POST', `/api/boards/${bad.board}/archive-board`, {});
    expect(res.status).toBe(200);
    expect((await call(rene, 'GET', '/api/boards')).body.map((b: any) => b.id)).toEqual([haus.board]);
    expect((await call(rene, 'GET', `/api/boards/${bad.board}`)).status).toBe(404);
    const list = (await call(rene, 'GET', '/api/boards/archived')).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: bad.board, name: 'Bad-Umbau', openCards: 1 });
    expect(list[0].archivedAt).toBeTruthy();
    // wer das Board nicht sehen darf, sieht es auch im Archiv nicht und kann es nicht holen
    const priv = mk('Privat', 'private', ids.anna);
    store.archiveBoard(priv.board, ids.anna);
    expect((await call(rene, 'GET', '/api/boards/archived')).body.map((b: any) => b.id)).toEqual([bad.board]);
    expect((await call(rene, 'POST', `/api/boards/${priv.board}/unarchive`)).status).toBe(404);
  });

  it('Aufgaben und Einstellungen bleiben unverändert; beim Wiederherstellen ist alles wieder da', async () => {
    const card = task(bad, 'Fliesen bestellen');
    store.addCategory(bad.board, { name: 'Material', color: 'blue' });
    await call(rene, 'POST', `/api/boards/${bad.board}/archive-board`, {});
    expect((await call(rene, 'POST', `/api/boards/${bad.board}/unarchive`)).status).toBe(200);
    const view = (await call(rene, 'GET', `/api/boards/${bad.board}`)).body;
    expect(view.cards.map((c: any) => c.id)).toEqual([card.id]);
    expect(view.categories.map((c: any) => c.name)).toEqual(['Material']);
    expect(view.board.archivedAt).toBeNull();
  });

  it('archivierte Boards fehlen überall: Heute, Termine, Mitteilungen, Fairness, Erinnerungen, Sensoren, Stupse, Papierkorb, Fairness', async () => {
    const due = '2026-11-04T15:00:00.000Z';
    const c = task(bad, 'Fliesen bestellen', { dueAt: due, assigneeIds: [ids.rene] });
    task(haus, 'Müll rausbringen', { dueAt: due, assigneeIds: [ids.rene] });
    store.completeCard(task(bad, 'Erledigt im Bad').id, { by: ids.rene, source: 'app' });
    store.setNotifyServices(ids.rene, ['mobile_app_rene']);
    const sentNudge = store.createNudges(c.id, ids.anna, { to: [ids.rene], text: 'hallo' });
    expect(sentNudge.skipped).toEqual([]);
    expect(sentNudge.sent).toHaveLength(1);
    const before = {
      today: (await call(rene, 'GET', '/api/today')).body.mine.length,
      schedule: (await call(rene, 'GET', '/api/schedule')).body.map((x: any) => x.title).sort(),
      due: store.openDueCards().map((x) => x.title).sort(),
      pub: store.openDueCards({ publicOnly: true }).map((x) => x.title).sort(),
      done: store.fairness('week').total.done,
    };
    expect(before.today).toBe(2);
    expect(before.schedule).toEqual(['Fliesen bestellen', 'Müll rausbringen']);
    expect(before.due).toEqual(['Fliesen bestellen', 'Müll rausbringen']);
    expect(before.done).toBe(1);

    await call(rene, 'POST', `/api/boards/${bad.board}/archive-board`, {});

    expect((await call(rene, 'GET', '/api/today')).body.mine.map((x: any) => x.title)).toEqual(['Müll rausbringen']);
    expect((await call(rene, 'GET', '/api/schedule')).body.map((x: any) => x.title)).toEqual(['Müll rausbringen']);
    expect((await call(rene, 'GET', `/api/schedule?boards=${bad.board}`)).body).toEqual([]);
    expect(store.openDueCards().map((x) => x.title)).toEqual(['Müll rausbringen']);
    expect(store.openDueCards({ publicOnly: true }).map((x) => x.title)).toEqual(['Müll rausbringen']);
    expect(store.dueReminders('2099-01-01T00:00:00.000Z')).toEqual([]);
    expect(store.fairness('week').total.done).toBe(0);
    expect(store.dueNudges()).toEqual([]);
    expect(store.openNudgeCounts({ publicOnly: true }).total).toBe(0);
    expect(store.openNudgeList({ publicOnly: true })).toEqual([]);
    expect((await call(rene, 'GET', `/api/cards/${c.id}`)).status).toBe(404);
    expect((await call(rene, 'GET', `/api/cards?ids=${c.id}`)).body).toEqual([]);
    expect((await call(rene, 'GET', '/api/inbox')).body.items.map((i: any) => i.cardId)).not.toContain(c.id);
    expect((await call(rene, 'GET', '/api/trash')).body.filter((i: any) => i.boardId === bad.board)).toEqual([]);
    expect(store.archiveDone()).toBe(0);

    await call(rene, 'POST', `/api/boards/${bad.board}/unarchive`);
    expect((await call(rene, 'GET', '/api/schedule')).body).toHaveLength(2);
    expect(store.fairness('week').total.done).toBe(1);
  });

  it('in einem archivierten Board entstehen keine Aufgaben (Wächter, Direktaufruf), und es lässt sich nicht löschen', async () => {
    await call(rene, 'POST', `/api/boards/${bad.board}/archive-board`, {});
    expect(() => store.createCard(bad.board, { columnId: bad.col, title: 'Neu' }, ids.rene)).toThrow(/nicht gefunden/);
    expect((await call(rene, 'POST', `/api/boards/${bad.board}/cards`, { columnId: bad.col, title: 'Neu' })).status).toBe(404);
    expect((await call(rene, 'DELETE', `/api/boards/${bad.board}`)).status).toBe(404);
    expect((await call(rene, 'POST', `/api/boards/${bad.board}/duplicate`, {})).status).toBe(404);
  });

  it('Wächter des Boards pausieren („Board archiviert") und laufen nach dem Wiederherstellen wieder', async () => {
    const wid = watcher('Waschmaschine fertig', bad);
    const other = watcher('Anderes Board', haus);
    const off = watcher('Aus', bad, { mode: 'rotation', personIds: [] }, false);
    const res = await call(rene, 'POST', `/api/boards/${bad.board}/archive-board`, {});
    expect(res.body.paused).toEqual([wid]);
    expect(data.get(wid)).toMatchObject({ status: 'target_missing', active: false });
    expect(data.get(other)).toMatchObject({ status: 'ok', active: true });
    const items = (await call(rene, 'GET', '/api/watchers')).body.items;
    expect(items.find((i: any) => i.id === wid)).toMatchObject({ status: 'target_missing', pausedBy: 'archived' });
    expect((await call(rene, 'GET', '/api/home')).status).toBeLessThan(500);
    const back = await call(rene, 'POST', `/api/boards/${bad.board}/unarchive`);
    expect(back.body.resumed).toEqual([wid]);
    expect(data.get(wid)).toMatchObject({ status: 'ok', active: true });
    expect(data.get(off)).toMatchObject({ status: 'ok', active: false });
  });

  it('auch das letzte Board lässt sich nicht archivieren; wiederholtes Archivieren und Wiederherstellen eines nicht archivierten Boards melden 409', async () => {
    expect((await call(rene, 'POST', `/api/boards/${bad.board}/archive-board`, {})).status).toBe(200);
    const last = await call(rene, 'POST', `/api/boards/${haus.board}/archive-board`, {});
    expect(last.status).toBe(409);
    expect(last.body.error).toBe('Das letzte Board kann nicht archiviert werden.');
    expect((await call(rene, 'POST', `/api/boards/${haus.board}/unarchive`)).status).toBe(409);
  });
});

describe('Duplizieren', () => {
  it('Standard: „X (Kopie)" mit Spalten und Kategorien, ohne Aufgaben; Besitzer ist, wer kopiert; Sichtbarkeit wie das Original', async () => {
    const orig = mk('Bad-Umbau', 'selected', ids.rene, [ids.anna]);
    store.addCategory(orig.board, { name: 'Material', color: 'blue' });
    task(orig, 'Fliesen');
    const res = await call(chef, 'POST', `/api/boards/${orig.board}/duplicate`, {});
    // Chef sieht das Board nicht (nur Rene und Anna)
    expect(res.status).toBe(404);
    const ok = await call(anna, 'POST', `/api/boards/${orig.board}/duplicate`, {});
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ name: 'Bad-Umbau (Kopie)', visibility: 'selected', ownerId: ids.anna, memberIds: [ids.rene] });
    const view = (await call(anna, 'GET', `/api/boards/${ok.body.id}`)).body;
    expect(view.columns.map((c: any) => c.name)).toEqual(store.getBoardView(orig.board).columns.map((c) => c.name));
    expect(view.categories.map((c: any) => c.name)).toEqual(['Material']);
    expect(view.cards).toEqual([]);
  });

  it('Schalter: ohne Spalten und Kategorien (Standardspalten), ohne Sichtbarkeit (Alle), eigener Name', async () => {
    const orig = mk('Privat', 'private', ids.rene);
    store.addCategory(orig.board, { name: 'X', color: 'blue' });
    const res = await call(rene, 'POST', `/api/boards/${orig.board}/duplicate`, { name: 'Meins', structure: false, keepVisibility: false });
    expect(res.body).toMatchObject({ name: 'Meins', visibility: 'all', ownerId: ids.rene });
    const view = (await call(rene, 'GET', `/api/boards/${res.body.id}`)).body;
    expect(view.categories).toEqual([]);
    expect(view.columns.some((c: any) => c.isDone)).toBe(true);
  });

  it('offene Aufgaben: ohne Zuständige, ohne Erledigte, Wiederholungen und Checklisten bleiben, Kategorien werden zugeordnet; Wächter nie', async () => {
    const cat = store.addCategory(bad.board, { name: 'Material', color: 'blue' });
    const open = task(bad, 'Fliesen', { dueAt: '2026-11-10T08:00:00.000Z', assigneeIds: [ids.rene], categoryIds: [cat.id], recurrence: { type: 'fixed', freq: 'weekly', every: 1, weekdays: [2] }, effort: 'large' });
    store.addChecklistItem(open.id, 'Messen');
    const finished = task(bad, 'Fertig');
    store.completeCard(finished.id, { by: ids.rene, source: 'app' });
    watcher('Waschmaschine fertig', bad);
    const res = await call(rene, 'POST', `/api/boards/${bad.board}/duplicate`, { openCards: true });
    const view = (await call(rene, 'GET', `/api/boards/${res.body.id}`)).body;
    expect(view.cards).toHaveLength(1);
    expect(view.cards[0]).toMatchObject({ title: 'Fliesen', assigneeIds: [], effort: 'large', recurrence: expect.objectContaining({ freq: 'weekly' }) });
    expect(view.cards[0].categoryIds).toEqual([view.categories[0].id]);
    expect(store.getCard(view.cards[0].id).checklistItems.map((i) => i.text)).toEqual(['Messen']);
    expect(data.list().filter((w) => w.card.boardId === res.body.id)).toEqual([]);
    expect(data.list()).toHaveLength(1);
    // das Original ist unverändert
    expect(store.getBoardView(bad.board).cards.map((c) => c.title).sort()).toEqual(['Fertig', 'Fliesen']);
  });

  it('ein Kind darf nicht duplizieren', async () => {
    const kid = store.addPerson({ haUserId: 'ha-kid', name: 'Kid' }).id;
    store.setChild(kid, { isChild: true });
    expect((await call(as('ha-kid', 'Kid'), 'POST', `/api/boards/${haus.board}/duplicate`, {})).status).toBe(403);
  });
});

describe('Als Vorlage speichern', () => {
  it('nur Spalten und Kategorien, keine Aufgaben; erscheint bei den Vorlagen', async () => {
    store.addCategory(bad.board, { name: 'Material', color: 'blue' });
    task(bad, 'Fliesen');
    const res = await call(rene, 'POST', `/api/boards/${bad.board}/save-as-template`, { name: 'Umbau', withCards: false });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Umbau', cards: 0, categories: 1 });
    expect((await call(rene, 'GET', '/api/templates')).body.some((t: any) => t.id === res.body.id)).toBe(true);
    // ohne die Angabe bleibt es, wie es war: mit offenen Aufgaben
    expect((await call(rene, 'POST', `/api/boards/${bad.board}/save-as-template`, { name: 'Mit Aufgaben' })).body.cards).toBe(1);
    const made = await call(rene, 'POST', '/api/boards', { name: 'Aus Vorlage', template: res.body.id });
    expect(made.status).toBe(201);
    expect((await call(rene, 'GET', `/api/boards/${made.body.id}`)).body.cards).toEqual([]);
  });
});

describe('Reihenfolge', () => {
  it('gilt für alle: die neue Reihenfolge steht in der Liste, Boards, die jemand nicht sieht, behalten ihren Platz', async () => {
    const c = mk('Dritte');
    const hidden = mk('Annas Privates', 'private', ids.anna);
    expect((await call(rene, 'GET', '/api/boards')).body.map((b: any) => b.name)).toEqual(['Haushalt', 'Bad-Umbau', 'Dritte']);
    const res = await call(rene, 'POST', '/api/boards/order', { ids: [c.board, haus.board, bad.board] });
    expect(res.status).toBe(204);
    expect((await call(rene, 'GET', '/api/boards')).body.map((b: any) => b.name)).toEqual(['Dritte', 'Haushalt', 'Bad-Umbau']);
    // für Anna (sieht auch das private Board) gilt dieselbe Reihenfolge der gemeinsamen Boards
    expect((await call(anna, 'GET', '/api/boards')).body.map((b: any) => b.name)).toEqual(['Dritte', 'Haushalt', 'Bad-Umbau', 'Annas Privates']);
    void hidden;
  });

  it('verlangt genau die sichtbaren Boards', async () => {
    expect((await call(rene, 'POST', '/api/boards/order', { ids: [haus.board] })).status).toBe(400);
    expect((await call(rene, 'POST', '/api/boards/order', { ids: [haus.board, bad.board, bad.board] })).status).toBe(400);
    expect((await call(rene, 'POST', '/api/boards/order', { ids: 'x' })).status).toBe(400);
    const priv = mk('Annas Privates', 'private', ids.anna);
    expect((await call(rene, 'POST', '/api/boards/order', { ids: [haus.board, bad.board, priv.board] })).status).toBe(400);
  });
});
