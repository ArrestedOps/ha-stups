import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { createAutomationCards } from '../src/automation-cards.js';
import { openDb } from '../src/db.js';
import { ValidationError } from '../src/errors.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';
import { exportData, importTransfer } from '../src/transfer.js';
import { createWatcherData, type WatcherData } from '../src/watcher-data.js';
import { parseTemplate, parseWatcher } from '../src/watcher-types.js';
import { createWatchers } from '../src/watchers.js';
import { watcherIcon } from '../src/watcher-icons.js';
import { FakeHa } from './helpers/fake-ha.js';

const TZ = 'Europe/Berlin';
let now: Date;
let store: Store;
let db0: DatabaseSync;
let rene: string;
let boardId: string;
let openId: string;

beforeEach(() => {
  now = new Date('2026-11-03T08:00:00Z');
  db0 = openDb(':memory:');
  store = createStore(db0, { now: () => now, timeZone: () => TZ });
  rene = store.addPerson({ haUserId: 'ha-rene', name: 'Rene' }).id;
  const b = store.createBoard({ name: 'Haushalt', withPlanned: true });
  boardId = b.id;
  openId = store.getBoardView(b.id).columns[0]!.id;
});

describe('Symbol und Farbe an der Karte', () => {
  it('eine neue Karte hat keins (Standard „Aufgabe“)', () => {
    const c = store.createCard(boardId, { columnId: openId, title: 'A' }, rene);
    expect(c.icon).toBeNull();
    expect(c.iconColor).toBeNull();
    expect(c.iconSource).toBeNull();
  });

  it('anlegen mit Symbol: ohne Angabe der Quelle gilt „von Hand“, „auto“ bleibt erhalten', () => {
    const manual = store.createCard(boardId, { columnId: openId, title: 'A', icon: 'leaf', iconColor: 'green' }, rene);
    expect(manual).toMatchObject({ icon: 'leaf', iconColor: 'green', iconSource: 'manual' });
    const auto = store.createCard(boardId, { columnId: openId, title: 'B', icon: 'trash-can-outline', iconSource: 'auto' }, rene);
    expect(auto).toMatchObject({ icon: 'trash-can-outline', iconColor: null, iconSource: 'auto' });
    expect(store.getBoardView(boardId).cards.find((c) => c.id === auto.id)).toMatchObject({ icon: 'trash-can-outline', iconSource: 'auto' });
  });

  it('ändern: Symbol, nur die Farbe, zurücksetzen', () => {
    const c = store.createCard(boardId, { columnId: openId, title: 'A' }, rene);
    expect(store.updateCard(c.id, { icon: 'dog', iconSource: 'auto' })).toMatchObject({ icon: 'dog', iconSource: 'auto' });
    expect(store.updateCard(c.id, { iconColor: 'red' })).toMatchObject({ icon: 'dog', iconColor: 'red', iconSource: 'auto' });
    expect(store.updateCard(c.id, { icon: 'cat' })).toMatchObject({ icon: 'cat', iconSource: 'manual' });
    const reset = store.updateCard(c.id, { icon: null, iconColor: null });
    expect(reset).toMatchObject({ icon: null, iconColor: null, iconSource: null });
    // der Titel allein ändert das Symbol nicht
    store.updateCard(c.id, { icon: 'dog' });
    expect(store.updateCard(c.id, { title: 'Neuer Titel' })).toMatchObject({ icon: 'dog' });
  });

  it('Quelle ohne Symbol gibt es nicht', () => {
    const c = store.createCard(boardId, { columnId: openId, title: 'A', iconSource: 'auto' }, rene);
    expect(c.iconSource).toBeNull();
  });

  it('ungültige Werte: Fehler der Prüfung, nie ein anderer', () => {
    const c = store.createCard(boardId, { columnId: openId, title: 'A' }, rene);
    for (const bad of ['Leaf', 'leaf outline', '', 'ä', 'a'.repeat(49), 5, true, {}, [], 'x/y']) {
      expect(() => store.updateCard(c.id, { icon: bad }), String(bad)).toThrow(ValidationError);
      expect(() => store.createCard(boardId, { columnId: openId, title: 'B', icon: bad }, rene), String(bad)).toThrow(ValidationError);
    }
    for (const bad of ['pink', 'Orange', '', 3, '#fff']) expect(() => store.updateCard(c.id, { iconColor: bad }), String(bad)).toThrow(/Farbe/);
    for (const bad of ['maybe', '', 1]) expect(() => store.updateCard(c.id, { iconSource: bad }), String(bad)).toThrow(/Quelle/);
    expect(store.getCard(c.id).icon).toBeNull();
  });

  it('alle acht Kachelfarben und die längste erlaubte Kennung gehen durch', () => {
    const c = store.createCard(boardId, { columnId: openId, title: 'A' }, rene);
    for (const col of ['orange', 'purple', 'violet', 'blue', 'teal', 'green', 'red', 'gray']) expect(store.updateCard(c.id, { iconColor: col }).iconColor).toBe(col);
    expect(store.updateCard(c.id, { icon: 'a'.repeat(48) }).icon).toBe('a'.repeat(48));
  });

  it('Duplizieren übernimmt Symbol, Farbe und Quelle', () => {
    const c = store.createCard(boardId, { columnId: openId, title: 'A', icon: 'leaf', iconColor: 'teal', iconSource: 'auto' }, rene);
    expect(store.duplicateCard(c.id, rene)).toMatchObject({ icon: 'leaf', iconColor: 'teal', iconSource: 'auto' });
  });

  it('die nächste Karte einer Wiederholung hat immer dasselbe Symbol (auch ohne „übernehmen“)', () => {
    const c = store.createCard(
      boardId,
      {
        columnId: openId,
        title: 'Müll',
        icon: 'trash-can-outline',
        iconColor: 'red',
        dueAt: '2026-11-03T07:00:00.000Z',
        recurrence: { type: 'after_completion', every: 1, unit: 'weeks' },
        carryOver: [],
      },
      rene,
    );
    const done = store.completeCard(c.id, { by: rene, source: 'app' });
    expect(store.getCard(done.nextCardId!)).toMatchObject({ icon: 'trash-can-outline', iconColor: 'red', iconSource: 'manual' });
  });

  it('Rückgängig stellt die Karte samt Symbol wieder her', () => {
    const c = store.createCard(boardId, { columnId: openId, title: 'A', icon: 'leaf' }, rene);
    const done = store.completeCard(c.id, { by: rene, source: 'app' });
    expect(store.getCard(c.id)).toMatchObject({ icon: 'leaf', iconSource: 'manual' });
    expect(done.card.completedAt).not.toBeNull();
    const undone = store.undoCompletion(done.completionId!);
    expect(undone).toMatchObject({ icon: 'leaf', iconSource: 'manual', completedAt: null });
  });

  it('eine Board-Vorlage aus einem Board nimmt das Symbol mit, und das Board daraus hat es wieder', () => {
    store.createCard(boardId, { columnId: openId, title: 'Müll', icon: 'trash-can-outline', iconColor: 'red' }, rene);
    store.createCard(boardId, { columnId: openId, title: 'Ohne' }, rene);
    const saved = store.saveBoardAsTemplate(boardId, 'Meine', rene);
    const data = store.getTemplateData(saved.id, 'de')!;
    expect(data.cards.find((c) => c.title === 'Müll')).toMatchObject({ icon: 'trash-can-outline', iconColor: 'red' });
    expect(data.cards.find((c) => c.title === 'Ohne')).toMatchObject({ icon: null, iconColor: null });
    const board = store.createBoardFromTemplate({ name: 'Neu', template: saved.id, lang: 'de', by: rene });
    const cards = store.getBoardView(board.id).cards;
    expect(cards.find((c) => c.title === 'Müll')).toMatchObject({ icon: 'trash-can-outline', iconColor: 'red', iconSource: 'manual' });
    expect(cards.find((c) => c.title === 'Ohne')).toMatchObject({ icon: null, iconSource: null });
  });

  it('eine gespeicherte Vorlage aus der Zeit vor Phase 3 (ohne die Felder) lässt sich weiter benutzen', () => {
    const old = {
      columns: [{ name: 'Offen', done: false, planned: false }, { name: 'Erledigt', done: true, planned: false }],
      categories: [],
      cards: [{ title: 'Alt', description: null, column: 0, categories: [], checklist: [], priority: null, effort: null, recurrence: null, dueInDays: null }],
    };
    db0.prepare('insert into board_templates (id, name, data, created_by, created_at) values (?, ?, ?, ?, ?)').run('t-alt', 'Alt', JSON.stringify(old), rene, now.toISOString());
    const data = store.getTemplateData('t-alt', 'de')!;
    expect(data.cards[0]!.icon ?? null).toBeNull();
    const board = store.createBoardFromTemplate({ name: 'Aus alt', template: 't-alt', lang: 'de', by: rene });
    expect(store.getBoardView(board.id).cards[0]).toMatchObject({ title: 'Alt', icon: null, iconSource: null });
  });

  it('eingebaute Vorlagen: Karten dürfen ein Symbol haben, die Form bleibt gültig', () => {
    const board = store.createBoardFromTemplate({ name: 'Zuhause', template: 'household', lang: 'de', by: rene });
    const cards = store.getBoardView(board.id).cards;
    expect(cards.find((c) => c.title === 'Müll rausbringen')).toMatchObject({ icon: 'trash-can-outline' });
    expect(cards.length).toBeGreaterThan(3);
  });
});

describe('Symbole erkennen (Stapel, nur Karten ohne Symbol)', () => {
  it('listet Karten ohne Symbol (offen, erledigt, archiviert), nicht die im Papierkorb und nicht die mit Symbol', () => {
    const a = store.createCard(boardId, { columnId: openId, title: 'Müll raus' }, rene);
    const b = store.createCard(boardId, { columnId: openId, title: 'Hat eins', icon: 'leaf' }, rene);
    const c = store.createCard(boardId, { columnId: openId, title: 'Gelöscht' }, rene);
    store.deleteCard(c.id);
    const d = store.createCard(boardId, { columnId: openId, title: 'Erledigt' }, rene);
    store.completeCard(d.id, { by: rene, source: 'app' });
    const list = store.cardsWithoutIcon(rene);
    expect(list.map((x) => x.id).sort()).toEqual([a.id, d.id].sort());
    expect(list.find((x) => x.id === a.id)).toEqual({ id: a.id, title: 'Müll raus' });
    expect(list.some((x) => x.id === b.id)).toBe(false);
  });

  it('setzt die Quelle „auto“, aber nur bei Karten, die noch kein Symbol haben, und zählt', () => {
    const a = store.createCard(boardId, { columnId: openId, title: 'Müll raus' }, rene);
    const b = store.createCard(boardId, { columnId: openId, title: 'Hat eins', icon: 'leaf' }, rene);
    const res = store.applyDetectedIcons([
      { id: a.id, icon: 'trash-can-outline' },
      { id: b.id, icon: 'dog' },
      { id: 'gibt-es-nicht', icon: 'dog' },
    ], rene);
    expect(res).toEqual({ updated: 1, skipped: 2 });
    expect(store.getCard(a.id)).toMatchObject({ icon: 'trash-can-outline', iconSource: 'auto', iconColor: null });
    expect(store.getCard(b.id)).toMatchObject({ icon: 'leaf', iconSource: 'manual' });
  });

  it('lässt Änderungszeit und Fassung der Karten unverändert (kein Eingriff der Person)', () => {
    const a = store.createCard(boardId, { columnId: openId, title: 'Müll raus' }, rene);
    now = new Date('2026-11-05T08:00:00Z');
    store.applyDetectedIcons([{ id: a.id, icon: 'trash-can-outline' }], rene);
    const after = store.getCard(a.id);
    expect(after.version).toBe(a.version);
    expect(after.updatedAt).toBe(a.updatedAt);
  });

  it('lehnt ungültige Kennungen ab, ohne etwas zu ändern', () => {
    const a = store.createCard(boardId, { columnId: openId, title: 'Müll raus' }, rene);
    expect(() => store.applyDetectedIcons([{ id: a.id, icon: 'Müll' }], rene)).toThrow(ValidationError);
    expect(() => store.applyDetectedIcons('x' as never, rene)).toThrow(ValidationError);
    expect(() => store.applyDetectedIcons(Array.from({ length: 2001 }, () => ({ id: a.id, icon: 'leaf' })), rene)).toThrow(ValidationError);
    expect(store.getCard(a.id).icon).toBeNull();
  });
});

describe('Wächter-Karten', () => {
  it('Tabelle: Name, Symbol der Entität, device_class, Domäne', () => {
    expect(watcherIcon({ entityId: 'sensor.waschmaschine_leistung' })).toBe('washing-machine');
    expect(watcherIcon({ entityId: 'sensor.xyz', name: 'Briefkasten Sensor' })).toBe('mailbox-outline');
    expect(watcherIcon({ entityId: 'sensor.x', icon: 'mdi:fan' })).toBe('fan');
    expect(watcherIcon({ entityId: 'sensor.x', icon: 'mdi:ganz-unbekannt' })).toBeNull();
    expect(watcherIcon({ entityId: 'binary_sensor.fenster_bad', deviceClass: 'window' })).toBe('window-closed-variant');
    expect(watcherIcon({ entityId: 'binary_sensor.a', deviceClass: 'moisture' })).toBe('water-alert-outline');
    expect(watcherIcon({ entityId: 'sensor.a', deviceClass: 'battery' })).toBe('battery-outline');
    expect(watcherIcon({ entityId: 'vacuum.saugi' })).toBe('robot-vacuum');
    expect(watcherIcon({ entityId: 'light.flur' })).toBe('lightbulb-outline');
    expect(watcherIcon({ entityId: 'sensor.irgendwas' })).toBeNull();
    expect(watcherIcon({ entityId: 'sensor.a', deviceClass: 42, icon: 7, name: {} })).toBeNull();
  });

  it('die Vorlage der Karte nimmt optional Symbol und Farbe an, ältere ohne beides', () => {
    const base = { boardId: 'b', columnId: 'c', title: 'T', due: { kind: 'none' } };
    expect(parseTemplate(base)).not.toHaveProperty('icon', 'x');
    expect(parseTemplate({ ...base, icon: 'leaf', iconColor: 'green' })).toMatchObject({ icon: 'leaf', iconColor: 'green' });
    expect(() => parseTemplate({ ...base, icon: 'Kein Name' })).toThrow(ValidationError);
    expect(() => parseTemplate({ ...base, iconColor: 'pink' })).toThrow(ValidationError);
  });

  describe('Karte beim Auslösen', () => {
    let ha: FakeHa;
    let data: WatcherData;
    let engineNow: number;
    const ENTITY = 'sensor.waschmaschine_leistung';

    beforeEach(() => {
      engineNow = Date.parse('2026-11-04T10:00:00Z');
      ha = new FakeHa();
      const db = openDb(':memory:');
      store = createStore(db, { now: () => new Date(engineNow), timeZone: () => TZ });
      data = createWatcherData(db, () => new Date(engineNow));
      const anna = store.addPerson({ haUserId: 'u-anna', name: 'Anna' }).id;
      const b = store.createBoard({ name: 'Haushalt', withPlanned: true });
      boardId = b.id;
      openId = store.getBoardView(b.id).columns.find((c) => !c.isDone && !c.isPlanned)!.id;
      ha.set('person.anna', 'not_home', '2026-11-04T08:00:00Z', { friendly_name: 'Anna', user_id: 'u-anna' });
      void anna;
    });

    async function fireWith(extraCard: Record<string, unknown>, attrs: Record<string, unknown>, entity = ENTITY) {
      ha.set(entity, '120', '2026-11-04T09:00:00Z', attrs);
      const engine = createWatchers({ store, data, ha, now: () => new Date(engineNow), timeZone: () => TZ, enabled: () => true });
      engine.start();
      const w = data.create(
        parseWatcher({
          name: 'W',
          trigger: { entityId: entity, kind: 'below', value: 5, forMin: 0 },
          card: { boardId, columnId: openId, title: 'Ausräumen', due: { kind: 'none' }, ...extraCard },
          assign: { mode: 'none', personIds: [] },
        }),
      );
      await engine.onSaved(w.id);
      ha.set(entity, '2');
      ha.emit(`w:${w.id}:fire`, '2', '2026-11-04T10:00:00Z', attrs);
      await engine.idle();
      return store.getBoardView(boardId).cards[0]!;
    }

    it('übernimmt das Symbol der Entität (hier: aus dem Namen), als „auto“', async () => {
      const card = await fireWith({}, { friendly_name: 'Waschmaschine' });
      expect(card).toMatchObject({ icon: 'washing-machine', iconSource: 'auto', iconColor: null });
    });

    it('nimmt das Symbol der Vorlage vor dem der Entität, als „von Hand“', async () => {
      const card = await fireWith({ icon: 'leaf', iconColor: 'green' }, { friendly_name: 'Waschmaschine' });
      expect(card).toMatchObject({ icon: 'leaf', iconColor: 'green', iconSource: 'manual' });
    });

    it('device_class, wenn der Name nichts verrät', async () => {
      const card = await fireWith({}, { device_class: 'moisture' }, 'binary_sensor.keller');
      expect(card.icon).toBe('water-alert-outline');
    });

    it('ohne passende Entität bleibt das Symbol leer (Standard)', async () => {
      const card = await fireWith({}, {}, 'sensor.irgendwas');
      expect(card.icon).toBeNull();
      expect(card.iconSource).toBeNull();
    });
  });

  it('Karten aus Automationen: optionales Symbol (mdi:-Präfix erlaubt), Ungültiges wird ignoriert', async () => {
    const ha = new FakeHa();
    const auto = createAutomationCards({ store, ha, now: () => now, presentPersonIds: async () => [] });
    auto.start();
    const send = async (data: Record<string, unknown>) => {
      ha.subs.get('stups_create_card')!.onEvent({ data: { board: 'Haushalt', ...data } });
      await new Promise((r) => setTimeout(r, 0));
    };
    await send({ title: 'Mit Symbol', icon: 'mdi:washing-machine', icon_color: 'blue' });
    await send({ title: 'Kaputt', icon: 'Das ist kein Name', icon_color: 'pink' });
    const cards = store.getBoardView(boardId).cards;
    expect(cards.find((c) => c.title === 'Mit Symbol')).toMatchObject({ icon: 'washing-machine', iconColor: 'blue', iconSource: 'manual' });
    expect(cards.find((c) => c.title === 'Kaputt')).toMatchObject({ icon: null, iconColor: null });
  });
});

describe('Umzug und Export', () => {
  it('der Export nimmt Symbole mit, die neue App übernimmt sie', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-icon-'));
    const dbPath = join(dir, 'a', 'stups.sqlite');
    mkdirSync(join(dir, 'a'), { recursive: true });
    const db = openDb(dbPath);
    const s = createStore(db);
    s.ensureDefaultBoard();
    const b = s.listBoards(null)[0]!;
    const col = s.getBoardView(b.id).columns[0]!.id;
    s.createCard(b.id, { columnId: col, title: 'Müll', icon: 'trash-can-outline', iconColor: 'red', iconSource: 'auto' }, null);
    const share = mkdtempSync(join(tmpdir(), 'stups-share-'));
    exportData(db, join(dir, 'a'), share);
    const target = join(mkdtempSync(join(tmpdir(), 'stups-neu-')), 'stups.sqlite');
    expect(importTransfer(target, join(dir, 'files'), share)).toBe(true);
    expect(existsSync(target)).toBe(true);
    const copy = createStore(openDb(target));
    const card = copy.getBoardView(copy.listBoards(null)[0]!.id).cards[0]!;
    expect(card).toMatchObject({ icon: 'trash-can-outline', iconColor: 'red', iconSource: 'auto' });
  });

  it('ein Export aus der Zeit vor Phase 3 (Datenbank im Stand 21) bleibt lesbar: Symbole leer', async () => {
    const { migrations } = await import('../src/migrations.js');
    const dir = mkdtempSync(join(tmpdir(), 'stups-alt-'));
    const old = openDb(join(dir, 'k.sqlite'), { migrations: migrations.filter((m) => m.version <= 21) });
    old.exec(`insert into boards (id, name, position, created_at, updated_at) values ('b1','B','a','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`);
    old.exec(`insert into columns (id, board_id, name, position, is_done) values ('c1','b1','Offen','a',0)`);
    old.exec(`insert into cards (id, board_id, column_id, position, title, created_at, updated_at) values ('k1','b1','c1','a','Alt','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`);
    const share = mkdtempSync(join(tmpdir(), 'stups-share-'));
    exportData(old, dir, share);
    old.close();
    const target = join(mkdtempSync(join(tmpdir(), 'stups-neu-')), 'stups.sqlite');
    expect(importTransfer(target, join(dir, 'files'), share)).toBe(true);
    const s = createStore(openDb(target));
    expect(s.getCard('k1')).toMatchObject({ icon: null, iconColor: null, iconSource: null });
  });
});

describe('Schnittstelle', () => {
  let app: FastifyInstance;
  const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
  const admin = as('ha-rene', 'Rene');
  const kid = as('ha-kim', 'Kim');
  let kidId: string;
  let kidCard: string;

  beforeEach(async () => {
    kidId = store.addPerson({ haUserId: 'ha-kim', name: 'Kim' }).id;
    store.setChild(kidId, { isChild: true, childScope: 'assigned' });
    kidCard = store.createCard(boardId, { columnId: openId, title: 'Für Kim', icon: 'leaf', iconColor: 'green', assigneeIds: [kidId] }, rene).id;
    app = Fastify();
    await app.register(ingressAuth, { enforceIp: false });
    await app.register(apiRoutes, { store, directory: { isAdmin: async (id) => id === 'ha-rene', persons: async () => [] } });
  });
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, headers: Record<string, string>, payload?: unknown) =>
    app.inject({ method, url, headers, payload: payload as never });

  it('anlegen und ändern mit Symbol; ungültig ist 400, nie 500', async () => {
    const created = await call('POST', `/api/boards/${boardId}/cards`, admin, { columnId: openId, title: 'X', icon: 'dog', iconColor: 'teal', iconSource: 'auto' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ icon: 'dog', iconColor: 'teal', iconSource: 'auto' });
    const id = created.json().id as string;
    const patched = await call('PATCH', `/api/cards/${id}`, admin, { icon: 'cat', iconSource: 'manual' });
    expect(patched.json()).toMatchObject({ icon: 'cat', iconSource: 'manual', iconColor: 'teal' });
    for (const payload of [{ icon: 'Nein!' }, { icon: 5 }, { iconColor: 'pink' }, { iconSource: 'x' }, { icon: '' }]) {
      const bad = await call('PATCH', `/api/cards/${id}`, admin, payload);
      expect(bad.statusCode, JSON.stringify(payload)).toBe(400);
    }
    const badCreate = await call('POST', `/api/boards/${boardId}/cards`, admin, { columnId: openId, title: 'Y', icon: 'x y' });
    expect(badCreate.statusCode).toBe(400);
  });

  it('Delta-Sync liefert das Symbol: GET /api/cards?ids und die Boardansicht', async () => {
    const byIds = await call('GET', `/api/cards?ids=${kidCard}`, admin);
    expect(byIds.json()[0]).toMatchObject({ icon: 'leaf', iconColor: 'green' });
    const view = await call('GET', `/api/boards/${boardId}`, admin);
    expect(view.json().cards.find((c: { id: string }) => c.id === kidCard)).toMatchObject({ icon: 'leaf' });
  });

  it('ein Kind sieht das Symbol seiner Karte, ändern darf es nicht', async () => {
    const seen = await call('GET', `/api/cards/${kidCard}`, kid);
    expect(seen.statusCode).toBe(200);
    expect(seen.json()).toMatchObject({ icon: 'leaf', iconColor: 'green' });
    const view = await call('GET', `/api/boards/${boardId}`, kid);
    expect(view.json().cards[0]).toMatchObject({ icon: 'leaf' });
    const patch = await call('PATCH', `/api/cards/${kidCard}`, kid, { icon: 'dog' });
    expect(patch.statusCode).toBe(403);
    expect(store.getCard(kidCard).icon).toBe('leaf');
  });

  it('Symbole erkennen: nur Administratoren (Liste und Anwenden), Kinder und Mitglieder nicht', async () => {
    const member = as('ha-mia', 'Mia');
    store.addPerson({ haUserId: 'ha-mia', name: 'Mia' });
    const open = store.createCard(boardId, { columnId: openId, title: 'Müll raus' }, rene);
    expect((await call('GET', '/api/icons/candidates', admin)).statusCode).toBe(200);
    for (const who of [kid, member]) {
      expect((await call('GET', '/api/icons/candidates', who)).statusCode).toBe(403);
      expect((await call('POST', '/api/icons/apply', who, { items: [{ id: open.id, icon: 'trash-can-outline' }] })).statusCode).toBe(403);
    }
    expect(store.getCard(open.id).icon).toBeNull();
    const list = (await call('GET', '/api/icons/candidates', admin)).json() as { id: string; title: string }[];
    expect(list.some((c) => c.id === open.id && c.title === 'Müll raus')).toBe(true);
    expect(list.some((c) => c.id === kidCard)).toBe(false); // hat schon ein Symbol
    const applied = await call('POST', '/api/icons/apply', admin, { items: [{ id: open.id, icon: 'trash-can-outline' }, { id: kidCard, icon: 'dog' }] });
    expect(applied.statusCode).toBe(200);
    expect(applied.json()).toEqual({ updated: 1, skipped: 1 });
    expect(store.getCard(open.id)).toMatchObject({ icon: 'trash-can-outline', iconSource: 'auto' });
    expect(store.getCard(kidCard).icon).toBe('leaf');
    expect((await call('POST', '/api/icons/apply', admin, { items: 'kaputt' })).statusCode).toBe(400);
    expect((await call('POST', '/api/icons/apply', admin, { items: [{ id: open.id, icon: 'GROSS' }] })).statusCode).toBe(400);
    expect((await call('POST', '/api/icons/apply', admin, {})).statusCode).toBe(400);
  });
});
