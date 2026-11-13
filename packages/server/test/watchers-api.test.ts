import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';
import { createWatcherData } from '../src/watcher-data.js';
import { createWatchers } from '../src/watchers.js';
import { FakeHa } from './helpers/fake-ha.js';

const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const chef = as('ha-chef', 'Chef');
const anna = as('ha-anna', 'Anna');

const ENTITY = 'sensor.waschmaschine_leistung';

let app: FastifyInstance;
let store: Store;
let ha: FakeHa;
let boardId: string;
let columnId: string;
let annaId: string;

async function build(withWatchers = true) {
  ha = new FakeHa();
  const db = openDb(':memory:');
  store = createStore(db);
  annaId = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
  boardId = store.createBoard({ name: 'Haushalt', withPlanned: true }).id;
  columnId = store.getBoardView(boardId).columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  ha.set(ENTITY, '120', '2026-11-04T09:00:00Z', { friendly_name: 'Waschmaschine Leistung', unit_of_measurement: 'W' });
  ha.set('binary_sensor.tuer', 'off', '2026-11-04T09:00:00Z', { friendly_name: 'Tür Waschküche' });
  const data = createWatcherData(db);
  const engine = createWatchers({ store, data, ha, now: () => new Date(), timeZone: () => 'Europe/Berlin' });
  engine.start();
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    directory: { isAdmin: async (id: string) => id === 'ha-chef', persons: async () => [] },
    ha: { listDashboards: async () => [], getStates: () => ha.getStates(), getHistory: (e: string, a: string, b: string) => ha.getHistory(e, a, b) },
    now: () => new Date('2026-11-04T12:00:00Z'),
    ...(withWatchers ? { watchers: engine, watcherData: data } : {}),
  });
}

async function call(who: object, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const res = await app.inject({ method, url, headers: who as Record<string, string>, payload });
  return { status: res.statusCode, body: res.body ? (res.json() as any) : null };
}

const input = (extra: Record<string, unknown> = {}) => ({
  name: 'Waschmaschine fertig',
  trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 0 },
  card: { boardId, columnId, title: 'Waschmaschine ausräumen', due: { kind: 'in', minutes: 30 } },
  assign: { mode: 'fixed', personIds: [annaId] },
  ...extra,
});

beforeEach(() => build());

describe('Wächter anlegen und ändern', () => {
  it('nur Administratoren, alle anderen sehen sie nur', async () => {
    expect((await call(anna, 'POST', '/api/watchers', input())).status).toBe(403);
    const created = await call(chef, 'POST', '/api/watchers', input());
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Waschmaschine fertig', active: true, status: 'ok', trigger: { forMin: 0, count: 1 } });

    const list = await call(anna, 'GET', '/api/watchers');
    expect(list.body.available).toBe(true);
    expect(list.body.items.map((w: any) => w.name)).toEqual(['Waschmaschine fertig']);

    const id = created.body.id;
    expect((await call(anna, 'PATCH', `/api/watchers/${id}`, { active: false })).status).toBe(403);
    expect((await call(anna, 'DELETE', `/api/watchers/${id}`)).status).toBe(403);
    expect((await call(anna, 'POST', `/api/watchers/${id}/test`)).status).toBe(403);
    expect((await call(anna, 'POST', `/api/watchers/${id}/reset-counter`)).status).toBe(403);
  });

  it('prüft die Eingabe mit verständlichen Meldungen', async () => {
    const bad = (extra: Record<string, unknown>) => call(chef, 'POST', '/api/watchers', input(extra));
    expect((await bad({ name: '' })).body.error).toMatch(/Name/);
    expect((await bad({ trigger: { entityId: 'nope', kind: 'below', value: 5 } })).status).toBe(400);
    expect((await bad({ card: { boardId: 'gibt-es-nicht', columnId, title: 'x' } })).body.error).toMatch(/Board gibt es nicht/);
    expect((await bad({ card: { boardId, columnId: 'falsch', title: 'x' } })).body.error).toMatch(/Spalte/);
    expect((await bad({ card: { boardId, columnId, title: 'x', categoryIds: ['falsch'] } })).body.error).toMatch(/Kategorie/);
    expect((await bad({ assign: { mode: 'fixed', personIds: ['unbekannt'] } })).body.error).toMatch(/Person/);
    expect((await call(chef, 'GET', '/api/watchers')).body.items).toEqual([]);
  });

  it('ändern, pausieren, wieder einschalten, löschen', async () => {
    const id = (await call(chef, 'POST', '/api/watchers', input())).body.id;
    const changed = await call(chef, 'PATCH', `/api/watchers/${id}`, { name: 'Spülmaschine fertig', cooldownMin: 20 });
    expect(changed.body).toMatchObject({ name: 'Spülmaschine fertig', cooldownMin: 20, trigger: { entityId: ENTITY } });

    const paused = await call(chef, 'PATCH', `/api/watchers/${id}`, { active: false });
    expect(paused.body.active).toBe(false);
    expect(ha.subs.has(`w:${id}:fire`)).toBe(false);
    const back = await call(chef, 'PATCH', `/api/watchers/${id}`, { active: true });
    expect(back.body.active).toBe(true);
    expect(ha.subs.has(`w:${id}:fire`)).toBe(true);

    expect((await call(chef, 'PATCH', `/api/watchers/${id}`, { trigger: { entityId: 'kaputt' } })).status).toBe(400);
    expect((await call(chef, 'DELETE', `/api/watchers/${id}`)).status).toBe(204);
    expect((await call(chef, 'GET', '/api/watchers')).body.items).toEqual([]);
    expect((await call(chef, 'DELETE', `/api/watchers/${id}`)).status).toBe(404);
  });
});

describe('Testen, Zähler, Läufe', () => {
  it('„Testen" legt eine Aufgabe an, „Zähler zurücksetzen" setzt auf null, die Läufe sind abrufbar', async () => {
    const id = (await call(chef, 'POST', '/api/watchers', input({ trigger: { entityId: ENTITY, kind: 'below', value: 5, count: 3 } }))).body.id;
    const tested = await call(chef, 'POST', `/api/watchers/${id}/test`);
    expect(tested.status).toBe(200);
    const cards = store.getBoardView(boardId).cards;
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ title: 'Waschmaschine ausräumen: Waschmaschine Leistung', watcherId: id, assigneeIds: [annaId] });

    const runs = await call(anna, 'GET', `/api/watchers/${id}/runs`);
    expect(runs.body[0]).toMatchObject({ result: 'test', cardId: cards[0]!.id });
    expect((await call(chef, 'POST', `/api/watchers/${id}/reset-counter`)).body.counter).toBe(0);
    expect((await call(chef, 'POST', '/api/watchers/gibt-es-nicht/test')).status).toBe(404);
  });

  it('ein Fehler beim Testen (Board gelöscht) kommt als Meldung zurück', async () => {
    const id = (await call(chef, 'POST', '/api/watchers', input())).body.id;
    store.deleteBoard(boardId);
    const res = await call(chef, 'POST', `/api/watchers/${id}/test`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nicht gefunden/);
  });
});

describe('Nachfrage nach dem Speichern', () => {
  const DOOR = 'binary_sensor.tuer';
  const doorInput = (extra: Record<string, unknown> = {}) =>
    input({ name: 'Tür offen', trigger: { entityId: DOOR, kind: 'state', to: 'off', forMin: 0 }, card: { boardId, columnId, title: 'Tür schließen' }, ...extra });
  const cardsNow = () => store.getBoardView(boardId).cards;

  it('Anlegen: ein Zustandswächter, dessen Zielzustand schon gilt, meldet metNow, es entsteht keine Aufgabe', async () => {
    const res = await call(chef, 'POST', '/api/watchers', doorInput());
    expect(res.status).toBe(201);
    expect(res.body.metNow).toEqual({ entityName: 'Tür Waschküche', stateText: 'aus', reason: 'already_met' });
    expect(cardsNow()).toHaveLength(0);
  });

  it('Anlegen: nicht erfüllt, dann metNow null', async () => {
    const res = await call(chef, 'POST', '/api/watchers', input());
    expect(res.body.metNow).toBeNull();
  });

  it('Anlegen: eine Batterie löst selbst aus und fragt nicht', async () => {
    ha.set('sensor.knopf_batterie', '1', '2026-11-04T09:00:00Z', { device_class: 'battery', unit_of_measurement: '%' });
    const res = await call(chef, 'POST', '/api/watchers', input({ trigger: { entityId: 'sensor.knopf_batterie', kind: 'below', value: 10, forMin: 0 } }));
    expect(res.body.metNow).toBeNull();
    expect(cardsNow()).toHaveLength(1);
  });

  it('Ändern: nur den Namen, dann keine Rückfrage; Zielzustand oder Entität geändert, dann schon', async () => {
    const id = (await call(chef, 'POST', '/api/watchers', doorInput())).body.id;
    expect((await call(chef, 'PATCH', `/api/watchers/${id}`, { name: 'Tür auf' })).body.metNow).toBeNull();
    expect((await call(chef, 'PATCH', `/api/watchers/${id}`, { cooldownMin: 30, card: { boardId, columnId, title: 'Anderer Titel' } })).body.metNow).toBeNull();
    // gleiche Bedingung noch einmal gespeichert (z. B. Assistent ohne Änderung): keine Rückfrage
    expect((await call(chef, 'PATCH', `/api/watchers/${id}`, { trigger: { entityId: DOOR, kind: 'state', to: 'off', forMin: 5 } })).body.metNow).toBeNull();

    ha.set(DOOR, 'on', '2026-11-04T09:00:00Z');
    expect((await call(chef, 'PATCH', `/api/watchers/${id}`, { trigger: { entityId: DOOR, kind: 'state', to: 'on', forMin: 0 } })).body.metNow).toMatchObject({ stateText: 'an' });

    ha.set('binary_sensor.fenster', 'off', '2026-11-04T09:00:00Z', { friendly_name: 'Fenster Bad' });
    const moved = await call(chef, 'PATCH', `/api/watchers/${id}`, { trigger: { entityId: 'binary_sensor.fenster', kind: 'state', to: 'off', forMin: 0 } });
    expect(moved.body.metNow).toEqual({ entityName: 'Fenster Bad', stateText: 'aus', reason: 'already_met' });
  });

  it('Pausieren und Wiedereinschalten fragen nicht', async () => {
    const id = (await call(chef, 'POST', '/api/watchers', doorInput())).body.id;
    await call(chef, 'PATCH', `/api/watchers/${id}`, { active: false });
    expect((await call(chef, 'PATCH', `/api/watchers/${id}`, { active: true })).body.metNow).toBeUndefined();
  });

  it('die Liste enthält kein metNow', async () => {
    await call(chef, 'POST', '/api/watchers', doorInput());
    expect((await call(chef, 'GET', '/api/watchers')).body.items[0].metNow).toBeUndefined();
  });

  describe('POST /api/watchers/:id/fire-now', () => {
    it('legt die Aufgabe an, mit Zuweisung und dem Hinweis im Lauf', async () => {
      const id = (await call(chef, 'POST', '/api/watchers', doorInput({ assign: { mode: 'fixed', personIds: [annaId] } }))).body.id;
      const res = await call(chef, 'POST', `/api/watchers/${id}/fire-now`);
      expect(res.status).toBe(200);
      expect(res.body.openCard).toMatchObject({ title: 'Tür schließen: Tür Waschküche', assigneeIds: [annaId] });
      expect(cardsNow()).toHaveLength(1);
      const runs = await call(chef, 'GET', `/api/watchers/${id}/runs`);
      expect(runs.body[0]).toMatchObject({ result: 'created', note: 'beim Anlegen, auf Nachfrage' });
    });

    it('wer keine Wächter ändern darf, bekommt 403 (und es entsteht nichts)', async () => {
      const id = (await call(chef, 'POST', '/api/watchers', doorInput())).body.id;
      expect((await call(anna, 'POST', `/api/watchers/${id}/fire-now`)).status).toBe(403);
      expect(cardsNow()).toHaveLength(0);
    });

    it('gilt die Bedingung nicht mehr: 409 mit freundlichem Text', async () => {
      const id = (await call(chef, 'POST', '/api/watchers', doorInput())).body.id;
      ha.set(DOOR, 'on', '2026-11-04T09:30:00Z');
      const res = await call(chef, 'POST', `/api/watchers/${id}/fire-now`);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Die Bedingung ist nicht mehr erfüllt, darum entsteht keine Aufgabe.');
      expect(cardsNow()).toHaveLength(0);
    });

    it('gibt es schon eine offene Aufgabe: 409', async () => {
      const id = (await call(chef, 'POST', '/api/watchers', doorInput())).body.id;
      expect((await call(chef, 'POST', `/api/watchers/${id}/fire-now`)).status).toBe(200);
      const again = await call(chef, 'POST', `/api/watchers/${id}/fire-now`);
      expect(again.status).toBe(409);
      expect(again.body.error).toBe('Zu diesem Wächter gibt es schon eine offene Aufgabe.');
      expect(cardsNow()).toHaveLength(1);
    });

    it('unbekannter Wächter: 404', async () => {
      expect((await call(chef, 'POST', '/api/watchers/gibt-es-nicht/fire-now')).status).toBe(404);
    });
  });
});

describe('Reiter „Wächter"', () => {
  it('zeigt je Wächter Zustand der Entität und die offene Aufgabe; die Aktivität nennt die Wächter, alle dürfen sie sehen', async () => {
    const id = (await call(chef, 'POST', '/api/watchers', input())).body.id;
    expect((await call(anna, 'GET', '/api/watchers')).body.items[0]).toMatchObject({ entityState: '120', openCard: null });

    await call(chef, 'POST', `/api/watchers/${id}/test`);
    const item = (await call(anna, 'GET', '/api/watchers')).body.items[0];
    expect(item.openCard).toMatchObject({ title: 'Waschmaschine ausräumen: Waschmaschine Leistung', assigneeIds: [annaId], waiting: false });

    const activity = await call(anna, 'GET', '/api/watchers/activity');
    expect(activity.status).toBe(200);
    expect(activity.body[0]).toMatchObject({ watcherName: 'Waschmaschine fertig', result: 'test', cardId: item.openCard.id });
  });

  it('ohne Home Assistant ist die Aktivität leer', async () => {
    await build(false);
    expect((await call(chef, 'GET', '/api/watchers/activity')).body).toEqual([]);
  });
});

describe('Entitäten suchen', () => {
  it('nur Administratoren; Suche nach Name oder Kennung, mit Zustand und Einheit', async () => {
    expect((await call(anna, 'GET', '/api/ha/entities?q=wasch')).status).toBe(403);
    const res = await call(chef, 'GET', '/api/ha/entities?q=waschmaschine');
    expect(res.body).toEqual([{ entityId: ENTITY, name: 'Waschmaschine Leistung', state: '120', unit: 'W', domain: 'sensor', category: 'Haushaltsgeräte' }]);
    expect((await call(chef, 'GET', '/api/ha/entities?q=wasch')).body.map((e: any) => e.entityId)).toEqual([ENTITY, 'binary_sensor.tuer']); // Treffer im Namen zuerst
    expect((await call(chef, 'GET', '/api/ha/entities?q=tür')).body.map((e: any) => e.entityId)).toEqual(['binary_sensor.tuer']);
    // der kurze Gerätename für Name und Aufgabentitel von Wächtern
    expect((await call(chef, 'GET', '/api/ha/entities?q=waschmaschine')).body[0]).toMatchObject({ name: 'Waschmaschine Leistung' });
    expect((await call(chef, 'GET', '/api/ha/entities?q=leistung waschmaschine')).body).toHaveLength(1);
  });

  it('filtert nach Art (domain) und liefert höchstens 30', async () => {
    for (let i = 0; i < 40; i += 1) ha.set(`sensor.messwert_${i}`, String(i));
    expect((await call(chef, 'GET', '/api/ha/entities?q=messwert')).body).toHaveLength(30);
    expect((await call(chef, 'GET', '/api/ha/entities?domain=binary_sensor')).body.map((e: any) => e.entityId)).toEqual(['binary_sensor.tuer']);
  });
});

describe('Ohne Verbindung zu Home Assistant', () => {
  beforeEach(() => build(false));

  it('die Liste ist leer und meldet „nicht verfügbar", Schreiben sagt warum nicht', async () => {
    expect((await call(chef, 'GET', '/api/watchers')).body).toEqual({ available: false, items: [] });
    const res = await call(chef, 'POST', '/api/watchers', input());
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Home Assistant/);
  });
});

describe('Vorlagen, Gefunden und Probelauf', () => {
  it('Vorlagen: nur Administratoren', async () => {
    expect((await call(anna, 'GET', '/api/watchers/templates')).status).toBe(403);
    const res = await call(chef, 'GET', '/api/watchers/templates');
    expect(res.status).toBe(200);
    expect(res.body.map((x: any) => x.id)).toContain('washer');
  });

  it('Gefunden: Treffer aus den Zuständen, ohne schon beobachtete Entitäten', async () => {
    expect((await call(anna, 'GET', '/api/watchers/suggestions')).status).toBe(403);
    ha.set(ENTITY, '120', '2026-11-04T09:00:00Z', { friendly_name: 'Waschmaschine Leistung', device_class: 'power' });
    const first = await call(chef, 'GET', '/api/watchers/suggestions');
    expect(first.body.items.map((s: any) => s.entityId)).toContain(ENTITY);
    expect(first.body.items.find((s: any) => s.entityId === ENTITY)).toMatchObject({ templateId: 'washer', variant: 'power', reason: 'Waschmaschine Leistung misst die Leistung' });
    await call(chef, 'POST', '/api/watchers', input());
    const second = await call(chef, 'GET', '/api/watchers/suggestions');
    expect(second.body.items.map((s: any) => s.entityId)).not.toContain(ENTITY);
  });

  it('Gefunden: Ausblenden gilt für immer, lässt sich zurücknehmen und ist nur für Administratoren', async () => {
    ha.set(ENTITY, '120', '2026-11-04T09:00:00Z', { friendly_name: 'Waschmaschine Leistung', device_class: 'power' });
    const hide = { templateId: 'washer', entityId: ENTITY };
    expect((await call(anna, 'POST', '/api/watchers/suggestions/hide', hide)).status).toBe(403);
    expect((await call(chef, 'POST', '/api/watchers/suggestions/hide', { templateId: 'gibtsnicht', entityId: ENTITY })).status).toBe(400);
    expect((await call(chef, 'POST', '/api/watchers/suggestions/hide', { templateId: 'washer', entityId: 'kaputt' })).status).toBe(400);
    expect((await call(chef, 'POST', '/api/watchers/suggestions/hide', hide)).status).toBe(204);
    expect((await call(chef, 'POST', '/api/watchers/suggestions/hide', hide)).status).toBe(204); // zweimal ist harmlos
    const hidden = await call(chef, 'GET', '/api/watchers/suggestions');
    expect(hidden.body.items.map((s: any) => s.entityId)).not.toContain(ENTITY);
    expect(hidden.body.hidden).toEqual([expect.objectContaining({ templateId: 'washer', entityId: ENTITY, name: 'Waschmaschine Leistung' })]);
    expect((await call(anna, 'POST', '/api/watchers/suggestions/unhide', hide)).status).toBe(403);
    expect((await call(chef, 'POST', '/api/watchers/suggestions/unhide', hide)).status).toBe(204);
    const back = await call(chef, 'GET', '/api/watchers/suggestions');
    expect(back.body.items.map((s: any) => s.entityId)).toContain(ENTITY);
    expect(back.body.hidden).toEqual([]);
  });

  it('Gefunden: ohne Verbindung zu Home Assistant ein Klartext statt eines Fehlers', async () => {
    ha.failStates = true;
    const res = await call(chef, 'GET', '/api/watchers/suggestions');
    expect(res.status).toBe(409);
    expect(res.body.error).toBeTruthy();
  });

  it('Probelauf: wendet die Regel auf die Historie an, speichert nichts', async () => {
    const at = (min: number) => new Date(Date.parse('2026-11-04T12:00:00Z') - min * 60_000).toISOString();
    ha.history.set(ENTITY, [{ state: '120', at: at(500) }, { state: '1', at: at(400) }, { state: '120', at: at(300) }, { state: '1', at: at(200) }]);
    expect((await call(anna, 'POST', '/api/watchers/dry-run', { trigger: input().trigger })).status).toBe(403);
    const res = await call(chef, 'POST', '/api/watchers/dry-run', { trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 3 }, cooldownMin: 10 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ noHistory: false, quick: 0, sentence: '2 Auslösungen erkannt, kein Fehlalarm' });
    expect(res.body.fired).toHaveLength(2);
    expect((await call(chef, 'GET', '/api/watchers')).body.items).toEqual([]);
  });

  it('Probelauf: fehlende Historie, ungültige Regel, Home Assistant nicht erreichbar', async () => {
    const noHist = await call(chef, 'POST', '/api/watchers/dry-run', { trigger: { entityId: 'sensor.neu', kind: 'below', value: 5 } });
    expect(noHist.body).toMatchObject({ noHistory: true, points: [] });
    expect((await call(chef, 'POST', '/api/watchers/dry-run', { trigger: { entityId: 'kaputt', kind: 'below', value: 5 } })).status).toBe(400);
    ha.failHistory = true;
    expect((await call(chef, 'POST', '/api/watchers/dry-run', { trigger: { entityId: ENTITY, kind: 'below', value: 5 } })).status).toBe(409);
  });
});

describe('Verlauf der Entität (letzte Stunden)', () => {
  const at = (min: number) => new Date(Date.parse('2026-11-04T12:00:00Z') - min * 60_000).toISOString();
  const url = (extra = '') => `/api/watchers/history?entityId=${ENTITY}${extra}`;

  it('Administratoren: Punkte, Fenster und Auslösepunkt der Regel aus der Query', async () => {
    ha.history.set(ENTITY, [{ state: '300', at: at(170) }, { state: '2', at: at(100) }, { state: '300', at: at(50) }]);
    const res = await call(chef, 'GET', url('&hours=3&kind=below&value=5&forMin=3&cooldownMin=10'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', kind: 'numeric', hours: 3, from: at(180), to: at(0), current: '300' });
    expect(res.body.points.map((p: any) => p.v)).toEqual([300, 2, 300, 300]);
    expect(res.body.fired).toEqual([{ at: at(97) }]);
  });

  it('ohne Regel nur der Verlauf; eine unfertige Regel zeichnet ihn trotzdem; Stunden werden auf 1 bis 24 begrenzt', async () => {
    ha.history.set(ENTITY, [{ state: '10', at: at(60) }]);
    expect((await call(chef, 'GET', url())).body).toMatchObject({ status: 'ok', fired: [], hours: 3 });
    expect((await call(chef, 'GET', url('&kind=below&value=abc'))).body).toMatchObject({ status: 'ok', fired: [] });
    expect((await call(chef, 'GET', url('&kind=quatsch'))).body).toMatchObject({ status: 'ok', fired: [] });
    expect((await call(chef, 'GET', url('&hours=500'))).body.hours).toBe(24);
    expect((await call(chef, 'GET', url('&hours=0'))).body.hours).toBe(1);
  });

  it('ohne Recorder oder ohne Verbindung: ein Zustand, nie ein Fehler', async () => {
    expect((await call(chef, 'GET', `/api/watchers/history?entityId=sensor.neu`)).body).toMatchObject({ status: 'no_data', points: [] });
    ha.failHistory = true;
    const res = await call(chef, 'GET', url());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'unavailable', points: [], fired: [] });
  });

  it('die Entität muss die Form domain.name haben', async () => {
    expect((await call(chef, 'GET', '/api/watchers/history?entityId=kaputt')).status).toBe(400);
    expect((await call(chef, 'GET', '/api/watchers/history')).status).toBe(400);
    expect((await call(chef, 'GET', '/api/watchers/history?entityId=a.b&entityId=c.d')).status).toBe(400);
  });

  it('Mitglieder: nur Entitäten, die ein Wächter beobachtet (Auslöser oder Erledigen-Bedingung)', async () => {
    expect((await call(anna, 'GET', url())).status).toBe(403);
    const created = await call(chef, 'POST', '/api/watchers', input({ done: { entityId: 'binary_sensor.tuer', kind: 'state', to: 'on' } }));
    expect(created.status).toBe(201);
    expect((await call(anna, 'GET', url())).status).toBe(200);
    expect((await call(anna, 'GET', '/api/watchers/history?entityId=binary_sensor.tuer')).status).toBe(200);
    expect((await call(anna, 'GET', '/api/watchers/history?entityId=sensor.geheim')).status).toBe(403);
  });

  it('ohne Verbindung zu Home Assistant (Docker): Status unavailable', async () => {
    const bare = Fastify();
    await bare.register(ingressAuth, { enforceIp: false });
    await bare.register(apiRoutes, { store, directory: { isAdmin: async () => true, persons: async () => [] } });
    const res = await bare.inject({ method: 'GET', url: url(), headers: chef as Record<string, string> });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('unavailable');
  });
});

describe('Reihenfolge für „An wen"', () => {
  it('Entwurf: der Kreis mit Anwesenheit, ohne dass sich etwas ändert', async () => {
    ha.set('person.anna', 'home', '2026-11-04T09:00:00Z', { friendly_name: 'Anna' });
    const res = await call(chef, 'GET', `/api/watchers/order?mode=rotation_present&personIds=${annaId}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mode: 'rotation_present', ordered: true, home: 1, circle: [{ id: annaId, present: true, next: true }] });
  });

  it('gespeicherter Wächter: übernimmt Modus und Kreis; die Rotation rückt nicht vor', async () => {
    const created = await call(chef, 'POST', '/api/watchers', input({ assign: { mode: 'rotation', personIds: [] } }));
    const first = await call(anna, 'GET', `/api/watchers/order?watcherId=${created.body.id}`);
    const again = await call(anna, 'GET', `/api/watchers/order?watcherId=${created.body.id}`);
    expect(first.status).toBe(200);
    expect(first.body.mode).toBe('rotation');
    expect(first.body.circle.map((e: any) => e.id)).toEqual(again.body.circle.map((e: any) => e.id));
    expect(first.body.circle.filter((e: any) => e.next)).toHaveLength(1);
  });

  it('ohne Home Assistant: Anwesenheit unbekannt, die Reihenfolge gibt es trotzdem', async () => {
    ha.failStates = true;
    const res = await call(chef, 'GET', `/api/watchers/order?mode=rotation&personIds=${annaId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ home: null, circle: [{ id: annaId, present: null }] });
  });

  it('unbekannter Modus 400, unbekannter Wächter 404, ohne Wächter-Dienst 409', async () => {
    expect((await call(chef, 'GET', '/api/watchers/order?mode=quatsch')).status).toBe(400);
    expect((await call(chef, 'GET', '/api/watchers/order')).status).toBe(400);
    expect((await call(chef, 'GET', '/api/watchers/order?watcherId=gibt-es-nicht')).status).toBe(404);
    await build(false);
    expect((await call(chef, 'GET', '/api/watchers/order?mode=none')).status).toBe(409);
  });
});

describe('Das Gerät unter dem Namen der Wächter', () => {
  const battery = (entityId: string, extra: Record<string, unknown> = {}) =>
    input({
      name: 'Batterie schwach',
      trigger: { entityId, kind: 'below', value: 20, forMin: 10 },
      card: { boardId, columnId, title: 'Batterie wechseln', due: { kind: 'none' } },
      assign: { mode: 'none' },
      ...extra,
    });
  const IPHONE = 'sensor.iphone_rene_battery_level';
  const IPAD = 'sensor.ipad_battery';

  async function twoBatteries() {
    ha.set(IPHONE, '15', '2026-11-04T09:00:00Z', { friendly_name: 'iPhone Rene Battery Level', device_class: 'battery', unit_of_measurement: '%' });
    ha.set(IPAD, '12', '2026-11-04T09:00:00Z', { friendly_name: 'iPad Küche Batterie', device_class: 'battery', unit_of_measurement: '%' });
    const a = (await call(chef, 'POST', '/api/watchers', battery(IPHONE))).body;
    const b = (await call(chef, 'POST', '/api/watchers', battery(IPAD))).body;
    return { a, b };
  }
  const list = async () => (await call(anna, 'GET', '/api/watchers')).body.items as any[];

  it('die Liste nennt zu jedem Wächter den Friendly Name der Entität; der Name bleibt, wie er ist', async () => {
    await twoBatteries();
    const items = await list();
    expect(items.find((w) => w.trigger.entityId === IPHONE)).toMatchObject({ name: 'Batterie schwach', subject: 'iPhone Rene Battery Level' });
    expect(items.find((w) => w.trigger.entityId === IPAD)).toMatchObject({ name: 'Batterie schwach', subject: 'iPad Küche Batterie' });
    // es gibt keine Vorschläge für Namen mehr
    for (const w of items) for (const k of ['suggestedName', 'suggestedTitle', 'defaultName', 'nameHasDevice', 'deviceLabel']) expect(w, k).not.toHaveProperty(k);
  });

  it('ohne Home Assistant fällt das Gerät auf die Entitäts-ID zurück', async () => {
    const { a } = await twoBatteries();
    ha.states = [];
    ha.failStates = true;
    const lost = (await call(chef, 'POST', '/api/watchers', battery('sensor.flur_tuer_battery_level'))).body;
    const items = await list();
    expect(items.find((w) => w.id === lost.id)).toMatchObject({ subject: 'sensor.flur_tuer_battery_level' });
    expect(items.find((w) => w.id === a.id)?.subject).toBeTruthy();
  });

  it('die Wächter-Seite (Zuhause) nennt das Gerät immer, auch wenn der Name es enthält; die Aktivität auch', async () => {
    const { a } = await twoBatteries();
    await call(chef, 'POST', `/api/watchers/${a.id}/test`);
    const home = (await call(chef, 'GET', '/api/home')).body.items as any[];
    expect(home.map((i) => i.subject).sort()).toEqual(['iPad Küche Batterie', 'iPhone Rene Battery Level']);
    const activity = (await call(anna, 'GET', '/api/watchers/activity')).body as any[];
    expect(activity[0]).toMatchObject({ watcherName: 'Batterie schwach', subject: 'iPhone Rene Battery Level' });
    await call(chef, 'PATCH', `/api/watchers/${a.id}`, { name: 'Batterie schwach: iPhone Rene' });
    const after = (await call(chef, 'GET', '/api/home')).body.items as any[];
    expect(after.find((i) => i.watcherId === a.id)?.subject).toBe('iPhone Rene Battery Level');
  });

  it('die Sammel-Umbenennung gibt es nicht mehr', async () => {
    await twoBatteries();
    expect((await call(chef, 'POST', '/api/watchers/rename-with-device')).status).toBe(404);
  });
});
