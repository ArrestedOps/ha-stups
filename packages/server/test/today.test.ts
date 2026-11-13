import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { createStore, type Store } from '../src/store.js';

// „Heute": was ist für mich dran, was kam vom Haus, was haben die anderen. Alles mit fester Uhr in Europe/Berlin.
const TZ = 'Europe/Berlin';
let now: Date;
let store: Store;
let db: ReturnType<typeof openDb>;
let ben: string;
let anna: string;
let mia: string;
let boardId: string;
let openId: string;

const at = (iso: string) => void (now = new Date(iso));
const card = (title: string, extra: Record<string, unknown> = {}) => store.createCard(boardId, { columnId: openId, title, ...extra }, ben);
const watcherCard = (title: string, assigneeIds: string[], watcherId = 'w1') => {
  const c = card(title, { assigneeIds });
  db.prepare('update cards set watcher_id = ? where id = ?').run(watcherId, c.id);
  return c;
};
const today = (who = ben) => store.today(who, now.getTime(), TZ);
const titles = (cards: { title: string }[]) => cards.map((c) => c.title);

beforeEach(() => {
  at('2026-11-04T09:00:00Z'); // Mi 10:00 Berlin
  db = openDb(':memory:');
  store = createStore(db, { now: () => now, timeZone: () => TZ });
  ben = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
  anna = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
  mia = store.addPerson({ haUserId: 'ha-mia', name: 'Mia' }).id;
  store.setChild(mia, { isChild: true });
  const b = store.createBoard({ name: 'Haushalt', withPlanned: true });
  boardId = b.id;
  openId = store.getBoardView(b.id).columns[0]!.id;
  db.prepare("insert into watchers (id, name, active, trigger_json, card_json, assign_json, cooldown_min, dedupe, position, created_at, updated_at) values ('w1', 'Waschmaschine fertig', 1, '{}', '{}', '{}', 10, 1, 0, 'x', 'x')").run();
});

describe('Für dich', () => {
  it('meine offenen Aufgaben bis Ende morgen, nach Termin: überfällig und heute zuerst, dann morgen', () => {
    card('Morgen', { assigneeIds: [ben], dueAt: '2026-11-05T18:00:00Z' });
    card('Heute', { assigneeIds: [ben], dueAt: '2026-11-04T17:00:00Z' });
    card('Gestern', { assigneeIds: [ben], dueAt: '2026-11-03T08:00:00Z' });
    card('Übermorgen', { assigneeIds: [ben], dueAt: '2026-11-06T08:00:00Z' });
    card('Ohne Termin', { assigneeIds: [ben] });
    card('Von Anna', { assigneeIds: [anna], dueAt: '2026-11-04T17:00:00Z' });
    expect(titles(today().mine)).toEqual(['Gestern', 'Heute', 'Morgen']);
  });

  it('die Grenze ist Mitternacht in der Zeitzone des Haushalts, nicht in UTC', () => {
    // 5.11. 23:59 Berlin ist noch „morgen", 6.11. 00:00 Berlin schon „übermorgen"
    card('Morgen spät', { assigneeIds: [ben], dueAt: '2026-11-05T22:59:00Z' });
    card('Übermorgen früh', { assigneeIds: [ben], dueAt: '2026-11-05T23:00:00Z' });
    expect(titles(today().mine)).toEqual(['Morgen spät']);
  });

  it('am Tag der Zeitumstellung (25.10.2026, 25 Stunden) bleibt „morgen" bis 24:00 Ortszeit', () => {
    at('2026-10-24T10:00:00Z'); // Sa 12:00 Berlin (Sommerzeit)
    card('Sonntag spät', { assigneeIds: [ben], dueAt: '2026-10-25T22:30:00Z' }); // So 23:30 Winterzeit
    card('Montag früh', { assigneeIds: [ben], dueAt: '2026-10-25T23:00:00Z' }); // Mo 00:00
    expect(titles(today().mine)).toEqual(['Sonntag spät']);
  });

  it('erledigte, gelöschte und archivierte Aufgaben fehlen; auch solche, die auf Bestätigung warten', () => {
    const done = card('Erledigt', { assigneeIds: [ben], dueAt: '2026-11-04T17:00:00Z' });
    store.completeCard(done.id, { by: ben, source: 'app' });
    const gone = card('Gelöscht', { assigneeIds: [ben], dueAt: '2026-11-04T17:00:00Z' });
    store.deleteCard(gone.id);
    card('Offen', { assigneeIds: [ben], dueAt: '2026-11-04T17:00:00Z' });
    expect(titles(today().mine)).toEqual(['Offen']);
  });

  it('Aufgaben von Wächtern stehen unter „Vom Haus", nicht doppelt unter „Für dich"', () => {
    watcherCard('Wäsche aufhängen', [ben]);
    expect(titles(today().mine)).toEqual([]);
    expect(titles(today().house)).toEqual(['Wäsche aufhängen']);
  });
});

describe('Vom Haus', () => {
  it('Wächter-Aufgaben, die mir zugewiesen sind oder noch niemandem, neueste zuerst; fremde nicht', () => {
    at('2026-11-04T08:00:00Z');
    watcherCard('Alt für mich', [ben]);
    at('2026-11-04T08:30:00Z');
    watcherCard('Niemand', []);
    at('2026-11-04T08:45:00Z');
    watcherCard('Für Anna', [anna]);
    card('Normale Aufgabe ohne Zuständige');
    const house = today().house;
    expect(titles(house)).toEqual(['Niemand', 'Alt für mich']);
    expect(house[0]).toMatchObject({ watcherId: 'w1', watcherName: 'Waschmaschine fertig', assigneeIds: [], boardName: 'Haushalt', why: null });
  });

  it('erledigte Wächter-Aufgaben fehlen', () => {
    const c = watcherCard('Fertig', [ben]);
    store.completeCard(c.id, { by: ben, source: 'app' });
    expect(today().house).toEqual([]);
  });
});

describe('Bei den anderen', () => {
  it('Zahl offener Aufgaben je andere Person, ohne mich und ohne Personen ohne Aufgaben', () => {
    card('A1', { assigneeIds: [anna], dueAt: '2026-11-04T17:00:00Z' });
    card('A2', { assigneeIds: [anna] });
    watcherCard('W', [anna]);
    card('B1', { assigneeIds: [ben] });
    expect(today().others).toEqual([{ personId: anna, open: 3 }]);
  });
});

describe('Kind', () => {
  it('sieht nur die eigenen Aufgaben und keine Zeile „Bei den anderen"', () => {
    card('Für Mia', { assigneeIds: [mia], dueAt: '2026-11-04T17:00:00Z' });
    card('Für Ben', { assigneeIds: [ben], dueAt: '2026-11-04T17:00:00Z' });
    watcherCard('Haus für Mia', [mia]);
    watcherCard('Haus für Ben', [ben]);
    watcherCard('Haus für niemand', []);
    const t = today(mia);
    expect(titles(t.mine)).toEqual(['Für Mia']);
    expect(titles(t.house)).toEqual(['Haus für Mia']);
    expect(t.others).toEqual([]);
  });
});
