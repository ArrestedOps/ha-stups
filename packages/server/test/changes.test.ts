import Fastify from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { createEventBus } from '../src/events.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';
import { createWatcherData } from '../src/watcher-data.js';
import { parseWatcher } from '../src/watcher-types.js';

let store: Store;
let boardId: string;
let colId: string;
let doneId: string;
let anna: string;
let ben: string;

beforeEach(() => {
  store = createStore(openDb(':memory:'), { now: () => new Date('2026-11-04T10:00:00Z'), timeZone: () => 'Europe/Berlin' });
  anna = store.addPerson({ haUserId: 'u-anna', name: 'Anna' }).id;
  ben = store.addPerson({ haUserId: 'u-ben', name: 'Ben' }).id;
  const b = store.createBoard({ name: 'Haushalt', withPlanned: true });
  boardId = b.id;
  const cols = store.getBoardView(b.id).columns;
  colId = cols.find((c) => !c.isDone && !c.isPlanned)!.id;
  doneId = cols.find((c) => c.isDone)!.id;
  store.takeChanges(); // Aufbau gehört nicht zum Test
});

const card = (title = 'Bad putzen', extra: object = {}) => store.createCard(boardId, { columnId: colId, title, ...extra }, anna);

describe('Der Store merkt sich, was sich geändert hat', () => {
  it('nichts geändert: nichts zu melden', () => {
    expect(store.takeChanges()).toEqual({ full: false, cards: [] });
  });

  it('ein zurückgerollter Schreibzugriff bleibt nicht als Änderung stehen, schon vorher Gemeldetes aber bleibt', () => {
    const before = card('Davor');
    expect(() =>
      store.transaction(() => {
        card('Wird zurückgerollt');
        store.createBoard({ name: 'Auch weg' }); // „alles neu laden"
        throw new Error('abgebrochen');
      }),
    ).toThrow('abgebrochen');
    expect(store.takeChanges()).toEqual({ full: false, cards: [before.id] });
  });

  it('eine eigene Transaktion, die gelingt, meldet ihre Änderungen', () => {
    let id = '';
    store.transaction(() => {
      id = card('Geht durch').id;
    });
    expect(store.takeChanges()).toEqual({ full: false, cards: [id] });
  });

  it('eine neue Karte, Ändern, Verschieben und Löschen melden genau diese Karte', () => {
    const c = card();
    expect(store.takeChanges()).toEqual({ full: false, cards: [c.id] });
    store.updateCard(c.id, { title: 'Bad schrubben' }, anna);
    expect(store.takeChanges()).toEqual({ full: false, cards: [c.id] });
    store.moveCard(c.id, { columnId: doneId });
    expect(store.takeChanges()).toEqual({ full: false, cards: [c.id] });
    store.deleteCard(c.id);
    expect(store.takeChanges()).toEqual({ full: false, cards: [c.id] });
  });

  it('Checkliste, Links, Kommentare und Anhänge einer Karte melden die Karte (ihre Zahlen stehen auf der Karte)', () => {
    const c = card();
    store.takeChanges();
    store.addChecklistItem(c.id, 'Eimer');
    expect(store.takeChanges()).toEqual({ full: false, cards: [c.id] });
    store.addComment(c.id, anna, 'Danke');
    expect(store.takeChanges()).toEqual({ full: false, cards: [c.id] });
    store.addLink(c.id, { url: 'https://example.org' });
    expect(store.takeChanges()).toEqual({ full: false, cards: [c.id] });
  });

  it('Zuständige und Termin ändern: nur die Karte', () => {
    const c = card();
    store.takeChanges();
    store.updateCard(c.id, { assigneeIds: [anna, ben], dueAt: '2026-11-05T09:00:00Z' }, anna);
    expect(store.takeChanges()).toEqual({ full: false, cards: [c.id] });
  });

  it('mehrere Karten in einer Anfrage: alle, jede einmal, in der Reihenfolge der Änderung', () => {
    const a = card('A');
    const b = card('B');
    store.updateCard(a.id, { title: 'A2' }, anna);
    expect(store.takeChanges()).toEqual({ full: false, cards: [a.id, b.id] });
  });

  it('Erledigen einer Wiederholung meldet beide Karten: die erledigte und die nächste', () => {
    const c = card('Müll', { dueAt: '2026-11-04T09:00:00Z', recurrence: { type: 'fixed', freq: 'daily', every: 2 } });
    store.takeChanges();
    store.completeCard(c.id, { by: anna, source: 'app' });
    const ch = store.takeChanges();
    expect(ch.full).toBe(false);
    expect(ch.cards).toContain(c.id);
    expect(ch.cards).toHaveLength(2);
    const next = store.getBoardView(boardId).cards.find((x) => x.repeatedFrom === c.id)!;
    expect(ch.cards).toContain(next.id);
  });

  it('„Rückgängig" meldet die Karte, die zurückkommt, und die nächste, die wieder verschwindet', () => {
    const c = card('Müll', { dueAt: '2026-11-04T09:00:00Z', recurrence: { type: 'fixed', freq: 'daily', every: 2 } });
    const res = store.completeCard(c.id, { by: anna, source: 'app' });
    store.takeChanges();
    store.undoCompletion(res.completionId!);
    const ch = store.takeChanges();
    expect(ch.full).toBe(false);
    expect(ch.cards).toHaveLength(2);
  });

  it('Archivieren und Wiederherstellen aus dem Archiv melden die Karte', () => {
    const c = card();
    store.setArchived(c.id, true);
    expect(store.takeChanges().cards).toContain(c.id);
    store.restoreArchived(c.id, colId);
    expect(store.takeChanges().cards).toContain(c.id);
  });

  it('nach dem Abholen ist alles wieder leer', () => {
    card();
    store.takeChanges();
    expect(store.takeChanges()).toEqual({ full: false, cards: [] });
  });
});

describe('Alles andere heißt: neu laden', () => {
  it.each([
    ['neues Board', () => store.createBoard({ name: 'Garten' })],
    ['Spalte hinzufügen', () => store.addColumn(boardId, { name: 'Warten' })],
    ['Kategorie hinzufügen', () => store.addCategory(boardId, { name: 'Putzen', color: 'green' })],
    ['neue Person', () => store.addPerson({ haUserId: `u-${Math.random()}`, name: 'Conny' })],
    ['Person umbenennen', () => store.renamePerson(anna, `Anna ${Math.random()}`)],
    ['Stups', () => store.createNudges(card().id, anna, { to: [ben], template: 'think' })],
  ])('%s', (_name, act) => {
    store.setNotifyServices(ben, ['svc_ben']); // ohne Gerät wird kein Stups geschrieben
    act();
    store.takeChanges(); // Karte aus der Vorbereitung ist egal
    act();
    expect(store.takeChanges().full).toBe(true);
  });

  it('eine Karte, die gleichzeitig mit einer Spalte geändert wird: neu laden (die Spalte betrifft alle Karten)', () => {
    const c = card();
    store.takeChanges();
    store.updateCard(c.id, { title: 'X' }, anna);
    store.addColumn(boardId, { name: 'Neu' });
    expect(store.takeChanges().full).toBe(true);
  });

  it('Papierkorb: eine Karte wiederherstellen meldet die Karte', () => {
    const c = card();
    store.deleteCard(c.id);
    store.takeChanges();
    store.restoreFromTrash('card', c.id);
    expect(store.takeChanges().cards).toContain(c.id);
  });

  it('markAllChanged: Schreibzugriffe außerhalb des Stores heißen „alles neu laden"', () => {
    store.markAllChanged();
    expect(store.takeChanges().full).toBe(true);
    expect(store.takeChanges().full).toBe(false);
  });

  it('Wächter-Daten schreiben mit: ein neuer Wächter heißt „alles neu laden"', () => {
    const db = openDb(':memory:');
    const s = createStore(db);
    const data = createWatcherData(db, undefined, () => s.markAllChanged());
    s.takeChanges();
    data.list(); // Lesen ändert nichts
    expect(s.takeChanges().full).toBe(false);
    data.create(
      parseWatcher({
        name: 'Waschmaschine fertig',
        trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5 },
        card: { boardId: 'b', columnId: 'c', title: 'Waschmaschine ausräumen', due: { kind: 'in', minutes: 30 } },
        assign: { mode: 'rotation_present', personIds: [] },
      }),
    );
    expect(s.takeChanges().full).toBe(true);
  });

  it('Boards, die sich nur durch Sitzungen oder Sendeprotokoll ändern, melden nichts', () => {
    const c = card();
    store.takeChanges();
    store.claimNotification({ cardId: c.id, userId: anna, kind: 'due', key: 'x' });
    expect(store.takeChanges().full).toBe(false);
  });
});

describe('getCards: genau die gewünschten, sichtbaren Karten', () => {
  it('liefert die Karten wie die Board-Ansicht (gleiche Form, gleiche Reihenfolge nach Position)', () => {
    const a = card('A');
    const b = card('B');
    const view = store.getBoardView(boardId).cards;
    expect(store.getCards([b.id, a.id])).toEqual(view.filter((x) => [a.id, b.id].includes(x.id)));
  });

  it('gelöschte, archivierte und unbekannte Karten fehlen (der Aufrufer entfernt sie dann)', () => {
    const a = card('A');
    const b = card('B');
    const c = card('C');
    store.deleteCard(a.id);
    store.setArchived(b.id, true);
    expect(store.getCards([a.id, b.id, c.id, 'gibt-es-nicht']).map((x) => x.id)).toEqual([c.id]);
  });

  it('eine leere Liste ist leer', () => {
    expect(store.getCards([])).toEqual([]);
  });
});

describe('Der Bus hängt die Änderungen an jede Meldung', () => {
  it('eine Meldung je emit, fortlaufend nummeriert, mit dem Stand des Stores', () => {
    const bus = createEventBus({ changes: () => store.takeChanges() });
    const got: { seq: number; changes?: { full: boolean; cards: string[] } }[] = [];
    bus.subscribe((e) => got.push(e));
    const a = card('A');
    const b = card('B');
    bus.emit({ by: anna });
    store.updateCard(a.id, { title: 'A2' }, anna);
    bus.emit({ by: null });
    bus.emit({ by: null });
    expect(got.map((g) => g.seq)).toEqual([1, 2, 3]);
    expect(got[0]!.changes).toEqual({ full: false, cards: [a.id, b.id] });
    expect(got[1]!.changes).toEqual({ full: false, cards: [a.id] });
    expect(got[2]!.changes).toEqual({ full: false, cards: [] });
  });

  it('ohne Quelle gibt es keine Angabe (der Client lädt dann neu)', () => {
    const bus = createEventBus();
    const got: unknown[] = [];
    bus.subscribe((e) => got.push(e));
    bus.emit({ by: null });
    expect(got).toEqual([{ seq: 1, by: null }]);
  });
});

describe('GET /api/cards?ids=…', () => {
  async function app() {
    const f = Fastify();
    await f.register(ingressAuth, { enforceIp: false });
    await f.register(apiRoutes, { store, directory: { isAdmin: async () => true, persons: async () => [] } });
    return f;
  }
  const headers = { 'x-remote-user-id': 'u-anna', 'x-remote-user-name': 'Anna', 'x-remote-user-display-name': 'Anna' };

  it('liefert die Karten in einem Aufruf', async () => {
    const f = await app();
    const a = card('A');
    const b = card('B');
    const res = await f.inject({ url: `/api/cards?ids=${a.id},${b.id}`, headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((c: { id: string }) => c.id)).toEqual([a.id, b.id]);
    expect(res.json()[0]).toHaveProperty('openNudges');
  });

  it('höchstens 50, ohne Angabe leer, unbekannte werden übersprungen', async () => {
    const f = await app();
    const ids = Array.from({ length: 51 }, (_, i) => `id${i}`).join(',');
    expect((await f.inject({ url: `/api/cards?ids=${ids}`, headers })).statusCode).toBe(400);
    expect((await f.inject({ url: '/api/cards', headers })).json()).toEqual([]);
    expect((await f.inject({ url: '/api/cards?ids=gibt-es-nicht', headers })).json()).toEqual([]);
  });

  it('die Route für eine einzelne Karte bleibt, wie sie war', async () => {
    const f = await app();
    const a = card('A');
    const res = await f.inject({ url: `/api/cards/${a.id}`, headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(a.id);
  });
});
