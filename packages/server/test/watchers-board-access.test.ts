import type { DatabaseSync } from 'node:sqlite';
import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';
import { createBoardAccess, type BoardAccessPlan } from '../src/store/board-access.js';
import { createContext } from '../src/store/context.js';
import { createWatcherData, type WatcherData } from '../src/watcher-data.js';
import type { AssignRule } from '../src/watcher-types.js';
import { createWatchers } from '../src/watchers.js';
import { FakeHa } from './helpers/fake-ha.js';

/**
 * Wächter und die Personen eines Boards: Ziel-Board, „Wer?" nur aus dem Board, Fairness, Status `assignees_missing`,
 * Board auf „nur ich" und Mitglied entfernen (Vorschau, Folgen, Mitteilungen für die Glocke).
 */
const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const rene = as('ha-rene', 'Rene');
const anna = as('ha-anna', 'Anna');
const chef = as('ha-chef', 'Chef');
const tom = as('ha-tom', 'Tom');

const ENTITY = 'sensor.waschmaschine_leistung';

let db: DatabaseSync;
let app: FastifyInstance;
let store: Store;
let data: WatcherData;
let ha: FakeHa;
let ids: { rene: string; anna: string; chef: string; tom: string; kid: string };
let pub: { board: string; col: string };
let bad: { board: string; col: string }; // „Bad-Umbau": ausgewählt, Besitzer Rene, Mitglied Anna

async function build() {
  ha = new FakeHa();
  db = openDb(':memory:');
  store = createStore(db);
  ids = {
    rene: store.addPerson({ haUserId: 'ha-rene', name: 'Rene' }).id,
    anna: store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id,
    chef: store.addPerson({ haUserId: 'ha-chef', name: 'Chef' }).id,
    tom: store.addPerson({ haUserId: 'ha-tom', name: 'Tom' }).id,
    kid: store.addPerson({ haUserId: 'ha-kid', name: 'Kid' }).id,
  };
  store.setChild(ids.kid, { isChild: true });
  store.setPermissions(ids.tom, ['watchers']);
  const mk = (name: string, visibility: 'all' | 'private' | 'selected', owner: string, members: string[] = []) => {
    const b = store.createBoard({ name, visibility, ownerId: owner, memberIds: members, withPlanned: true });
    return { board: b.id, col: store.getBoardView(b.id).columns.find((c) => !c.isDone && !c.isPlanned)!.id };
  };
  pub = mk('Haushalt', 'all', ids.rene);
  bad = mk('Bad-Umbau', 'selected', ids.rene, [ids.anna]);
  ha.set(ENTITY, '120', '2026-11-04T09:00:00Z', { friendly_name: 'Waschmaschine Leistung', unit_of_measurement: 'W' });
  data = createWatcherData(db);
  const engine = createWatchers({ store, data, ha, now: () => new Date('2026-11-04T12:00:00Z'), timeZone: () => 'Europe/Berlin' });
  engine.start();
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    directory: { isAdmin: async (id: string) => id === 'ha-chef', persons: async () => [] },
    ha: { listDashboards: async () => [], getStates: () => ha.getStates(), getHistory: (e: string, a: string, b: string) => ha.getHistory(e, a, b) },
    now: () => new Date('2026-11-04T12:00:00Z'),
    watchers: engine,
    watcherData: data,
  });
}

async function call(who: object, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const res = await app.inject({ method, url, headers: who as Record<string, string>, payload });
  return { status: res.statusCode, body: res.body ? (res.json() as any) : null };
}

const input = (target: { board: string; col: string } = pub, extra: Record<string, unknown> = {}) => ({
  name: 'Waschmaschine fertig',
  trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 0 },
  card: { boardId: target.board, columnId: target.col, title: 'Waschmaschine ausräumen' },
  assign: { mode: 'rotation', personIds: [ids.rene, ids.anna] },
  ...extra,
});

beforeEach(() => build());

describe('Ziel-Board', () => {
  it('private Boards sind nicht wählbar (400 mit klarer Meldung)', async () => {
    const mine = store.createBoard({ name: 'Meine Ideen', visibility: 'private', ownerId: ids.rene });
    const col = store.getBoardView(mine.id).columns[0]!.id;
    const res = await call(chef, 'POST', '/api/watchers', input({ board: mine.id, col }, { assign: { mode: 'fixed', personIds: [ids.rene] } }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Private Boards sind für Wächter nicht wählbar/);
    expect((await call(chef, 'GET', '/api/watchers')).body.items).toEqual([]);
  });

  it('ein ausgewähltes Board, das die Person nicht sieht, ist nicht wählbar; wer nur umbenennt, braucht es nicht zu sehen', async () => {
    // Chef ist Administrator, aber nicht im Board
    const res = await call(chef, 'POST', '/api/watchers', input(bad, { assign: { mode: 'fixed', personIds: [ids.rene] } }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Board gibt es nicht/);
    const made = await call(rene, 'POST', '/api/watchers', input(bad));
    expect(made.status).toBe(403); // Rene darf keine Wächter (kein Recht): nur Administratoren und Tom
    const ok = await call(tom, 'POST', '/api/watchers', input(bad));
    expect(ok.status).toBe(400); // Tom sieht das Board nicht
    // Der Besitzer des Boards ist keiner mit dem Recht: ein Administrator, der Mitglied ist, darf
    store.updateBoard(bad.board, { memberIds: [ids.anna, ids.chef] }, ids.rene);
    const good = await call(chef, 'POST', '/api/watchers', input(bad));
    expect(good.status).toBe(201);
    store.updateBoard(bad.board, { memberIds: [ids.anna] }, ids.rene);
    // Chef sieht das Board nicht mehr, kann den Wächter aber umbenennen
    expect((await call(chef, 'PATCH', `/api/watchers/${good.body.id}`, { name: 'Neu' })).status).toBe(200);
  });

  it('„Wer?" nur aus dem Board, auch für Rückfall und Kreis; Server prüft beim Speichern', async () => {
    const outside = await call(chef, 'POST', '/api/watchers', input(pub, { card: { boardId: pub.board, columnId: pub.col, title: 'x' } }));
    expect(outside.status).toBe(201); // Board für alle: jede Person
    store.updateBoard(pub.board, { visibility: 'selected', memberIds: [ids.anna, ids.chef] }, ids.rene);
    const bad1 = await call(chef, 'POST', '/api/watchers', input(pub, { assign: { mode: 'rotation', personIds: [ids.rene, ids.tom] } }));
    expect(bad1.status).toBe(400);
    expect(bad1.body.error).toMatch(/Personen aus dem Board/);
    const bad2 = await call(chef, 'POST', '/api/watchers', input(pub, { assign: { mode: 'rotation', personIds: [ids.rene], fallback: 'fixed', fallbackPersonId: ids.tom } }));
    expect(bad2.status).toBe(400);
    expect((await call(chef, 'POST', '/api/watchers', input(pub, { assign: { mode: 'rotation', personIds: [ids.rene, ids.anna] } }))).status).toBe(201);
  });

  it('eine Rotation wählt nie jemanden, der das Board nicht sieht (auch bei leerem Kreis)', async () => {
    const id = (await call(chef, 'POST', '/api/watchers', input(bad, { assign: { mode: 'rotation', personIds: [] } }))).body?.id;
    expect(id).toBeUndefined(); // Chef sieht das Board nicht
    store.updateBoard(bad.board, { memberIds: [ids.anna, ids.chef] }, ids.rene);
    const made = await call(chef, 'POST', '/api/watchers', input(bad, { assign: { mode: 'rotation', personIds: [] } }));
    expect(made.status).toBe(201);
    for (let i = 0; i < 4; i += 1) {
      await call(chef, 'POST', `/api/watchers/${made.body.id}/test`);
      store.getBoardView(bad.board).cards.forEach((c) => store.completeCard(c.id, { by: ids.rene, source: 'app' }));
    }
    const runs = data.runs(made.body.id).filter((r) => r.result === 'test');
    expect(runs.length).toBeGreaterThan(0);
    const chosen = new Set(runs.flatMap((r) => r.assignedTo));
    expect(chosen.size).toBeGreaterThan(1); // es wird reihum gewählt …
    for (const who of chosen) expect([ids.rene, ids.anna, ids.chef]).toContain(who); // … aber nur unter denen, die das Board sehen
  });
});

describe('Zählt zur Fairness (Wächter)', () => {
  it('Standard ist der Wert des Boards; der gespeicherte Wert bleibt, auch wenn das Board nicht mitzählt', async () => {
    const created = await call(chef, 'POST', '/api/watchers', input());
    expect(created.body.countsForFairness).toBe(true);
    store.updateBoard(pub.board, { countsForFairness: false }, ids.rene);
    const second = await call(chef, 'POST', '/api/watchers', input(pub, { name: 'Zweiter' }));
    expect(second.body.countsForFairness).toBe(false);
    // ausdrücklich gewählt gilt, auch wenn es das Board überstimmt
    const third = await call(chef, 'POST', '/api/watchers', input(pub, { name: 'Dritter', countsForFairness: true }));
    expect(third.body.countsForFairness).toBe(true);
    const patched = await call(chef, 'PATCH', `/api/watchers/${created.body.id}`, { countsForFairness: false });
    expect(patched.body.countsForFairness).toBe(false);
  });

  it('Karten eines Wächters zählen nur, wenn Board UND Wächter zählen', async () => {
    const mk = async (name: string, counts: boolean) => {
      const id = (await call(chef, 'POST', '/api/watchers', input(pub, { name, countsForFairness: counts, assign: { mode: 'fixed', personIds: [ids.anna] } }))).body.id as string;
      await call(chef, 'POST', `/api/watchers/${id}/test`);
      const card = store.getBoardView(pub.board).cards.find((c) => c.watcherId === id && !c.completedAt)!;
      store.completeCard(card.id, { by: ids.anna, source: 'app' });
    };
    await mk('zählt', true);
    await mk('zählt nicht', false);
    const anna1 = () => store.fairness('week').people.find((p) => p.id === ids.anna)!;
    expect(anna1()).toMatchObject({ done: 1, watcherCards: 1 });
    expect(store.fairness('week').houseCards).toBe(1);
    store.updateBoard(pub.board, { countsForFairness: false }, ids.rene);
    expect(anna1()).toMatchObject({ done: 0, watcherCards: 0 });
    expect(store.fairness('week').houseCards).toBe(0);
  });
});

describe('Board auf „nur ich" stellen', () => {
  it('verweigert, solange ein Wächter darauf zeigt; der Server liefert die Liste', async () => {
    const made = await call(chef, 'POST', '/api/watchers', input());
    const id = made.body.id as string;
    const res = await call(rene, 'PATCH', `/api/boards/${pub.board}`, { visibility: 'private' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/nicht privat werden/);
    expect(res.body.watchers).toEqual([{ id, name: 'Waschmaschine fertig' }]);
    expect(store.getBoard(pub.board).visibility).toBe('all');
    // die Vorschau sagt es vorher
    const preview = await call(rene, 'GET', `/api/boards/${pub.board}/access-preview?visibility=private`);
    expect(preview.body.blocking).toEqual([{ id, name: 'Waschmaschine fertig' }]);
    // ohne Wächter geht es
    data.remove(id);
    expect((await call(rene, 'PATCH', `/api/boards/${pub.board}`, { visibility: 'private' })).status).toBe(200);
  });
});

describe('Mitglied aus dem Board entfernen', () => {
  const makeThree = async () => {
    store.updateBoard(bad.board, { memberIds: [ids.anna, ids.chef] }, ids.rene);
    const a = (await call(chef, 'POST', '/api/watchers', input(bad, { name: 'Waschmaschine fertig', assign: { mode: 'rotation', personIds: [ids.rene, ids.anna] } }))).body.id as string;
    const b = (await call(chef, 'POST', '/api/watchers', input(bad, { name: 'Müll rausbringen', assign: { mode: 'rotation', personIds: [] } }))).body.id as string;
    const c = (await call(chef, 'POST', '/api/watchers', input(bad, { name: 'Heizung prüfen', assign: { mode: 'fixed', personIds: [ids.anna] } }))).body.id as string;
    store.updateBoard(bad.board, { memberIds: [ids.anna] }, ids.rene); // Chef war nur zum Anlegen im Board
    return { a, b, c };
  };

  it('die Vorschau zeigt alle betroffenen Wächter mit „jetzt" und „danach"', async () => {
    const { a, b, c } = await makeThree();
    const res = await call(rene, 'GET', `/api/boards/${bad.board}/access-preview?visibility=selected&members=`);
    expect(res.status).toBe(200);
    expect(res.body.removedIds).toEqual([ids.anna]);
    const byId = Object.fromEntries((res.body.watchers as any[]).map((w) => [w.watcherId, w]));
    expect(byId[a]).toMatchObject({ before: [ids.rene, ids.anna], after: [ids.rene], missing: false, circleEmpty: false });
    expect(byId[b]).toMatchObject({ before: [ids.rene, ids.anna], after: [ids.rene], missing: false, circleEmpty: true });
    expect(byId[c]).toMatchObject({ before: [ids.anna], after: [], missing: true });
    // nichts verändert
    expect(data.get(c).status).toBe('ok');
    expect(data.get(a).assign.personIds).toEqual([ids.rene, ids.anna]);
  });

  it('der Server nimmt die Person aus Kreisen und festen Personen; leer heißt nicht „alle", sondern assignees_missing', async () => {
    const { a, b, c } = await makeThree();
    const res = await call(rene, 'PATCH', `/api/boards/${bad.board}`, { memberIds: [] });
    expect(res.status).toBe(200);
    expect(data.get(a).assign.personIds).toEqual([ids.rene]);
    expect(data.get(a).status).toBe('ok');
    expect(data.get(b).assign.personIds).toEqual([]); // leerer Kreis bleibt leer: im Board gilt „alle im Board", jetzt nur Rene
    expect(data.get(b).status).toBe('ok');
    expect(data.get(c).assign.personIds).toEqual([]);
    expect(data.get(c).status).toBe('assignees_missing');
  });

  it('assignees_missing: der Wächter bleibt aktiv, legt aber keine Karten an (Lauf im Protokoll), auch Testen und „Jetzt erstellen" nicht', async () => {
    const { c } = await makeThree();
    await call(rene, 'PATCH', `/api/boards/${bad.board}`, { memberIds: [] });
    expect(data.get(c).active).toBe(true);
    const test = await call(chef, 'POST', `/api/watchers/${c}/test`);
    expect(test.status).toBe(400);
    expect(test.body.error).toMatch(/braucht neue Zuständige/);
    // der Wächter löst aus: ENTITY fällt unter 5
    ha.emit(`w:${c}:fire`, '3');
    await new Promise((r) => setTimeout(r, 20));
    expect(store.getBoardView(bad.board).cards.filter((x) => x.watcherId === c)).toHaveLength(0);
    expect(data.runs(c)[0]).toMatchObject({ result: 'no_assignees', cardId: null });
    expect(data.get(c).active).toBe(true);
    // wiederholt auslösen schreibt nicht endlos Zeilen
    ha.emit(`w:${c}:fire`, '10');
    ha.emit(`w:${c}:fire`, '2');
    await new Promise((r) => setTimeout(r, 20));
    expect(data.runs(c).filter((r) => r.result === 'no_assignees').length).toBeLessThanOrEqual(2);
    // die Liste sagt es
    const home = await call(rene, 'GET', '/api/home');
    expect(home.body.items.find((i: any) => i.watcherId === c).status).toBe('assignees_missing');
    const list = await call(rene, 'GET', '/api/watchers');
    expect(list.body.items.find((w: any) => w.id === c).status).toBe('assignees_missing');
  });

  it('der Status verschwindet, sobald gültige Zuständige gespeichert sind; Umbenennen und ein leerer Kreis lassen ihn stehen', async () => {
    const { c } = await makeThree();
    await call(rene, 'PATCH', `/api/boards/${bad.board}`, { memberIds: [] });
    expect((await call(chef, 'PATCH', `/api/watchers/${c}`, { name: 'Heizung ansehen' })).body.status).toBe('assignees_missing');
    expect((await call(chef, 'PATCH', `/api/watchers/${c}`, { assign: { mode: 'rotation', personIds: [] } })).body.status).toBe('assignees_missing');
    // Zuständige, die das Board nicht sehen: abgelehnt
    expect((await call(chef, 'PATCH', `/api/watchers/${c}`, { assign: { mode: 'fixed', personIds: [ids.anna] } })).status).toBe(400);
    const fixed = await call(chef, 'PATCH', `/api/watchers/${c}`, { assign: { mode: 'fixed', personIds: [ids.rene] } });
    expect(fixed.status).toBe(200);
    expect(fixed.body.status).toBe('ok');
    expect(data.get(c).status).toBe('ok');
  });

  it('Mitteilungen für die Glocke: Auslöser, Besitzer, Wächter-Recht und Administratoren, ohne Doppelte und ohne Kinder', async () => {
    const { a, c } = await makeThree();
    store.updateBoard(bad.board, { memberIds: [ids.anna, ids.kid] }, ids.rene);
    const res = await call(rene, 'PATCH', `/api/boards/${bad.board}`, { memberIds: [] });
    expect(res.status).toBe(200);
    const inbox = async (who: object) => ((await call(who, 'GET', '/api/inbox')).body.items as any[]).filter((i) => i.kind === 'watcher' && i.watcherId);
    // Rene (Auslöser und Besitzer: ein Eintrag je Wächter), Chef (Administrator), Tom (Recht „Wächter")
    const forRene = await inbox(rene);
    expect(forRene.map((i) => `${i.watcherName}:${i.detail}`).sort()).toEqual(['Heizung prüfen:assignees_missing', 'Müll rausbringen:shrunk', 'Waschmaschine fertig:shrunk'].sort());
    expect((await inbox(chef)).length).toBe(3);
    expect((await inbox(tom)).length).toBe(3);
    expect(await inbox(anna)).toEqual([]);
    expect(await inbox(as('ha-kid', 'Kid'))).toEqual([]); // ein Kind bekommt solche Mitteilungen nie
    const heizung = forRene.find((i) => i.watcherId === c);
    expect(heizung).toMatchObject({ kind: 'watcher', detail: 'assignees_missing', cardId: '', notice: { boardName: 'Bad-Umbau', removedNames: ['Anna'], remainingNames: [] } });
    const wasch = forRene.find((i) => i.watcherId === a);
    expect(wasch).toMatchObject({ detail: 'shrunk', notice: { removedNames: ['Anna'], remainingNames: ['Rene'] } });
    // ohne Änderung der Personen keine Mitteilung
    const before = forRene.length;
    await call(rene, 'PATCH', `/api/boards/${bad.board}`, { name: 'Bad-Umbau 2' });
    expect((await inbox(rene)).length).toBe(before);
  });

  it('wird ein Rückfall-Person entfernt, fällt der Rückfall weg (kein Weitergeben an Unsichtbare)', async () => {
    store.updateBoard(bad.board, { memberIds: [ids.anna, ids.chef] }, ids.rene);
    const id = (
      await call(chef, 'POST', '/api/watchers', input(bad, { assign: { mode: 'rotation_present', personIds: [ids.rene], fallback: 'fixed', fallbackPersonId: ids.anna } }))
    ).body.id as string;
    store.updateBoard(bad.board, { memberIds: [ids.chef] }, ids.rene);
    const w = data.get(id);
    expect(w.assign.fallbackPersonId).toBeNull();
    expect(w.assign.fallback).toBe('none');
    expect(w.status).toBe('ok');
  });
});

describe('Offene Karten eines Wächters in einem Board, das jemand nicht sieht', () => {
  it('Wächter-Liste und Zuhause zeigen die Karte nicht', async () => {
    store.updateBoard(bad.board, { memberIds: [ids.anna, ids.chef] }, ids.rene);
    const id = (await call(chef, 'POST', '/api/watchers', input(bad, { assign: { mode: 'fixed', personIds: [ids.rene] } }))).body.id as string;
    await call(chef, 'POST', `/api/watchers/${id}/test`);
    const seen = async (who: object) => ((await call(who, 'GET', '/api/home')).body.items as any[]).find((i) => i.watcherId === id).openCard;
    expect(await seen(rene)).not.toBeNull();
    expect(await seen(chef)).not.toBeNull();
    store.updateBoard(bad.board, { memberIds: [ids.anna] }, ids.rene);
    expect(await seen(chef)).toBeNull();
    expect(await seen(tom)).toBeNull();
    expect(((await call(tom, 'GET', '/api/watchers')).body.items as any[]).find((w) => w.id === id).openCard).toBeNull();
  });
});

describe('Folgen für Wächter im Detail (Plan und Ausführung)', () => {
  const rule = (extra: Partial<AssignRule> = {}): AssignRule => ({ mode: 'rotation', personIds: [], fallback: 'next', waitFallback: 'none', fallbackPersonId: null, ...extra });

  /**
   * Legt Wächter im Board „Bad-Umbau" an (Chef ist dafür kurz Mitglied) und setzt die Regel danach direkt in der Datenbank:
   * So kommen auch Altbestände vor, die die Eingabeprüfung nie durchließe (Kreis mit Personen, die das Board nicht sehen).
   */
  async function watchersOnBad(rules: Record<string, AssignRule>): Promise<Record<string, string>> {
    store.updateBoard(bad.board, { memberIds: [ids.anna, ids.chef] }, ids.rene);
    const made: Record<string, string> = {};
    for (const name of Object.keys(rules)) {
      made[name] = (await call(chef, 'POST', '/api/watchers', input(bad, { name, assign: { mode: 'fixed', personIds: [ids.rene] } }))).body.id as string;
    }
    store.updateBoard(bad.board, { memberIds: [ids.anna] }, ids.rene);
    for (const [name, assign] of Object.entries(rules)) db.prepare('update watchers set assign_json = ? where id = ?').run(JSON.stringify(assign), made[name]!);
    return made;
  }

  it('nur Wächter, die auf dieses Board zeigen und lesbar gespeichert sind, zählen (andere Boards, kaputtes JSON)', async () => {
    const w = await watchersOnBad({ Eigener: rule({ mode: 'fixed', personIds: [ids.rene] }), 'Kaputte Karte': rule(), 'Kaputte Zuweisung': rule() });
    await call(chef, 'POST', '/api/watchers', input(pub, { name: 'Anderes Board' }));
    db.prepare("update watchers set card_json = 'kaputt' where id = ?").run(w['Kaputte Karte']!);
    db.prepare("update watchers set assign_json = 'kaputt' where id = ?").run(w['Kaputte Zuweisung']!);
    const plan = store.previewBoardAccess(bad.board, { visibility: 'private' }, ids.rene);
    expect(plan.removedIds).toEqual([ids.anna]);
    expect(plan.blocking).toEqual([{ id: w.Eigener, name: 'Eigener' }]);
    expect(plan.watchers).toEqual([]);
    expect(plan.rules).toEqual([]);
  });

  it('nur Betroffene stehen im Plan: Art „keine Zuweisung", unberührte Kreise und ein bleibender Rückfall gehören nicht dazu', async () => {
    const w = await watchersOnBad({
      Keiner: rule({ mode: 'none' }),
      Unberührt: rule({ personIds: [ids.rene] }),
      'Rückfall bleibt': rule({ mode: 'rotation_present', personIds: [ids.rene], fallback: 'fixed', fallbackPersonId: ids.rene }),
      Betroffen: rule({ personIds: [ids.rene, ids.anna] }),
    });
    const plan = store.previewBoardAccess(bad.board, { memberIds: [] }, ids.rene);
    expect(plan.removedIds).toEqual([ids.anna]);
    expect(plan.watchers.map((x) => x.watcherId)).toEqual([w.Betroffen]);
    expect(plan.watchers[0]).toMatchObject({ mode: 'rotation', before: [ids.rene, ids.anna], after: [ids.rene], missing: false, circleEmpty: false, fallbackCleared: false });
    expect(plan.rules).toEqual([{ watcherId: w.Betroffen, rule: rule({ personIds: [ids.rene] }) }]);
  });

  it('der Kreis zählt nur Personen, die das Board vorher sahen; ein leerer Kreis bleibt leer', async () => {
    const w = await watchersOnBad({
      // Chef sieht das Board nicht (mehr): er steht im Kreis, gehört aber nicht zu „jetzt zuständig"
      Altbestand: rule({ personIds: [ids.anna, ids.chef] }),
      'Alle im Board': rule({ personIds: [] }),
    });
    const plan = store.previewBoardAccess(bad.board, { memberIds: [] }, ids.rene);
    const byId = Object.fromEntries(plan.watchers.map((x) => [x.watcherId, x]));
    expect(byId[w.Altbestand!]).toMatchObject({ before: [ids.anna], after: [], missing: true, circleEmpty: false });
    expect(byId[w['Alle im Board']!]).toMatchObject({ before: [ids.rene, ids.anna], after: [ids.rene], missing: false, circleEmpty: true });
    expect(plan.rules.find((r) => r.watcherId === w.Altbestand)!.rule.personIds).toEqual([]);
    expect(plan.rules.find((r) => r.watcherId === w['Alle im Board'])!.rule.personIds).toEqual([]);
  });

  it('eine Rückfall-Person, die das Board nie sah, bleibt eingetragen; sonst fällt nur der Rückfall „fixed" weg', async () => {
    const w = await watchersOnBad({
      Fremder: rule({ mode: 'rotation_present', personIds: [ids.rene, ids.anna], fallback: 'fixed', fallbackPersonId: ids.chef }),
      'Rückfall fest': rule({ mode: 'rotation_present', personIds: [ids.rene], fallback: 'fixed', waitFallback: 'all', fallbackPersonId: ids.anna }),
      'Warten fest': rule({ mode: 'first_home', personIds: [ids.rene], fallback: 'all', waitFallback: 'fixed', fallbackPersonId: ids.anna }),
      'Beides fest': rule({ mode: 'first_home', personIds: [ids.rene], fallback: 'fixed', waitFallback: 'fixed', fallbackPersonId: ids.anna }),
    });
    const plan = store.previewBoardAccess(bad.board, { memberIds: [] }, ids.rene);
    const impact = (id: string) => plan.watchers.find((x) => x.watcherId === id)!;
    const ruleOf = (id: string) => plan.rules.find((r) => r.watcherId === id)!.rule;
    expect(impact(w.Fremder!).fallbackCleared).toBe(false);
    expect(ruleOf(w.Fremder!)).toMatchObject({ fallback: 'fixed', fallbackPersonId: ids.chef, personIds: [ids.rene] });
    expect(impact(w['Rückfall fest']!).fallbackCleared).toBe(true);
    expect(ruleOf(w['Rückfall fest']!)).toMatchObject({ fallback: 'none', waitFallback: 'all', fallbackPersonId: null });
    expect(ruleOf(w['Warten fest']!)).toMatchObject({ fallback: 'all', waitFallback: 'none', fallbackPersonId: null });
    expect(ruleOf(w['Beides fest']!)).toMatchObject({ fallback: 'none', waitFallback: 'none', fallbackPersonId: null });
    // der Server schreibt dieselben Regeln
    store.updateBoard(bad.board, { memberIds: [] }, ids.rene);
    expect(data.get(w['Warten fest']!).assign).toMatchObject({ fallback: 'all', waitFallback: 'none', fallbackPersonId: null });
    expect(data.get(w.Fremder!).assign).toMatchObject({ fallback: 'fixed', fallbackPersonId: ids.chef });
  });

  it('beim Ändern verlieren nur die Karten des Boards die Zuständigen; sie zählen als geändert und bekommen eine neue Fassung', () => {
    const mk = (target: { board: string; col: string }, title: string, assigneeIds: string[]) => store.createCard(target.board, { columnId: target.col, title, assigneeIds }, ids.rene).id;
    const c1 = mk(bad, 'Eins', [ids.anna, ids.rene]);
    const c2 = mk(bad, 'Zwei', [ids.anna]);
    const c3 = mk(bad, 'Drei', [ids.rene]);
    const other = mk(pub, 'Anderswo', [ids.anna]);
    const versions = Object.fromEntries([c1, c2, c3].map((id) => [id, store.getCard(id).version]));
    store.takeChanges();
    const res = store.updateBoardWithEffects(bad.board, { memberIds: [] }, ids.rene);
    expect(res.effects).toMatchObject({ removedIds: [ids.anna], cardsChanged: 2 });
    expect(store.getCard(c1).assigneeIds).toEqual([ids.rene]);
    expect(store.getCard(c2).assigneeIds).toEqual([]);
    expect(store.getCard(c3).assigneeIds).toEqual([ids.rene]);
    expect(store.getCard(other).assigneeIds).toEqual([ids.anna]);
    expect(store.getCard(c1).version).toBe(versions[c1]! + 1);
    expect(store.getCard(c2).version).toBe(versions[c2]! + 1);
    expect(store.getCard(c3).version).toBe(versions[c3]!);
    expect(store.takeChanges().cards.sort()).toEqual([c1, c2].sort());
  });

  describe('applyBoardAccess mit einem Plan von Hand', () => {
    const impact = (watcherId: string, missing: boolean) => ({ watcherId, name: watcherId, mode: 'rotation' as const, before: [], after: [], missing, circleEmpty: true, fallbackCleared: false });
    const plan = (watchers: BoardAccessPlan['watchers'], rules: BoardAccessPlan['rules']): BoardAccessPlan => ({ removedIds: [], watchers, blocking: [], assigneeCards: 0, rules });
    const access = () => createBoardAccess(createContext(db), {});
    const mkPub = async (name: string) => (await call(chef, 'POST', '/api/watchers', input(pub, { name }))).body.id as string;

    it('ein Wächter ohne neue Regel, bei dem niemand bleibt, bekommt assignees_missing; die anderen nicht', async () => {
      const [w1, w2] = [await mkPub('Eins'), await mkPub('Zwei')];
      const effects = access().applyBoardAccess(pub.board, plan([impact(w1!, true), impact(w2!, false)], []));
      expect(effects.cardsChanged).toBe(0);
      expect(data.get(w1!).status).toBe('assignees_missing');
      expect(data.get(w2!).status).toBe('ok');
    });

    it('gibt es Regeln für andere Wächter, wird der ohne Regel trotzdem markiert; der mit Regel bekommt sie und den Status', async () => {
      const [w3, w4] = [await mkPub('Drei'), await mkPub('Vier')];
      access().applyBoardAccess(pub.board, plan([impact(w3!, true), impact(w4!, true)], [{ watcherId: w3!, rule: rule({ personIds: [ids.rene] }) }]));
      expect(data.get(w3!).status).toBe('assignees_missing');
      expect(data.get(w3!).assign.personIds).toEqual([ids.rene]);
      expect(data.get(w4!).status).toBe('assignees_missing');
      expect(data.get(w4!).assign.personIds).toEqual([ids.rene, ids.anna]);
    });
  });
});

describe('Mitteilungen der Glocke zu Wächtern (Store-Teil)', () => {
  const access = () => createBoardAccess(createContext(db), {});
  const detail = { boardId: 'b1', boardName: 'Bad-Umbau', removedNames: ['Anna'], remainingNames: ['Rene'] };
  const everything = (ba: ReturnType<typeof access>, who: string, limit = 10) => ba.watcherNoticesFor(who, '0000', '9999', limit);
  const rawNotice = (id: string, watcherId: string, at: string, recipients: string, detailJson: string, byUser: string | null = null) =>
    db.prepare("insert into watcher_notices (id, watcher_id, kind, at, by_user, recipients, detail) values (?, ?, 'shrunk', ?, ?, ?, ?)").run(id, watcherId, at, byUser, recipients, detailJson);
  const mkWatcher = async () => (await call(chef, 'POST', '/api/watchers', input(pub, { name: 'Waschmaschine fertig' }))).body.id as string;
  const count = () => (db.prepare('select count(*) as n from watcher_notices').get() as { n: number }).n;

  it('ohne Empfänger wird nichts gespeichert; Empfänger stehen einmal in der Zeile', async () => {
    const ba = access();
    const w = await mkWatcher();
    ba.addWatcherNotice({ watcherId: w, kind: 'shrunk', byUser: ids.rene, recipients: [], detail });
    expect(count()).toBe(0);
    ba.addWatcherNotice({ watcherId: w, kind: 'shrunk', byUser: ids.rene, recipients: ['u1', 'u1', 'u2'], detail });
    expect(count()).toBe(1);
    expect((db.prepare('select recipients from watcher_notices').get() as { recipients: string }).recipients).toBe('["u1","u2"]');
    expect(everything(ba, 'u1')).toMatchObject([{ watcherId: w, watcherName: 'Waschmaschine fertig', kind: 'shrunk', byUser: ids.rene, detail }]);
    expect(everything(ba, 'u2')).toHaveLength(1);
    expect(everything(ba, 'u3')).toEqual([]);
  });

  it('der Auslöser kann fehlen (null bleibt null); das Limit schneidet die neuesten zuerst ab', async () => {
    const ba = access();
    const w = await mkWatcher();
    rawNotice('n1', w, '2026-11-04T10:00:00.000Z', '["u1"]', JSON.stringify(detail), 'u9');
    rawNotice('n2', w, '2026-11-04T11:00:00.000Z', '["u1"]', JSON.stringify(detail));
    rawNotice('n3', w, '2026-11-04T12:00:00.000Z', '["u1"]', JSON.stringify(detail));
    const two = everything(ba, 'u1', 2);
    expect(two.map((n) => n.id)).toEqual(['n3', 'n2']);
    expect(two[0]!.byUser).toBeNull();
    expect(everything(ba, 'u1', 3).map((n) => [n.id, n.byUser])).toEqual([['n3', null], ['n2', null], ['n1', 'u9']]);
    expect(everything(ba, 'u1', 1)).toHaveLength(1);
  });

  it('kaputte oder unvollständige Angaben fallen auf leere Werte zurück; eine kaputte Empfängerliste meint niemanden', async () => {
    const ba = access();
    const w = await mkWatcher();
    rawNotice('kaputt', w, '2026-11-04T10:00:00.000Z', '["u1"]', 'kein json');
    rawNotice('teil', w, '2026-11-04T11:00:00.000Z', '["u1"]', JSON.stringify({ boardName: 'Bad-Umbau' }));
    rawNotice('ohne-empfaenger', w, '2026-11-04T12:00:00.000Z', 'kein json', JSON.stringify(detail));
    const empty = { boardId: '', boardName: '', removedNames: [], remainingNames: [] };
    const byId = Object.fromEntries(everything(ba, 'u1').map((n) => [n.id, n.detail]));
    expect(Object.keys(byId).sort()).toEqual(['kaputt', 'teil']);
    expect(byId.kaputt).toEqual(empty);
    expect(byId.teil).toEqual({ ...empty, boardName: 'Bad-Umbau' });
  });
});
