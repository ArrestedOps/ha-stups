import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { ValidationError } from '../src/errors.js';
import { createStore, type Store } from '../src/store.js';

// Jetzt: Fr 30.10.2026, 11:00 Berlin. Morgen beginnt um 23:00Z.
let now: Date;
let store: Store;
let rene: { id: string };

const TODAY_LATE = '2026-10-30T22:59:00Z'; // 23:59 heute
const TOMORROW = '2026-10-30T23:00:00Z'; // 00:00 morgen: schon „geplant"
const NEXT_WEEK = '2026-11-06T09:00:00Z';

beforeEach(() => {
  now = new Date('2026-10-30T10:00:00Z');
  store = createStore(openDb(':memory:'), { now: () => now, timeZone: () => 'Europe/Berlin' });
  store.syncPeople([{ name: 'Rene' }]);
  rene = store.resolveUser({ haId: 'ha-rene', name: 'rene', displayName: 'René' });
});

function board() {
  const b = store.createBoard({ name: 'Haushalt', withPlanned: true });
  const [open, planned, doing, done] = store.getBoardView(b.id).columns;
  return { b, open: open!, planned: planned!, doing: doing!, done: done! };
}

const card = (b: { b: { id: string } }, columnId: string, extra: object = {}) =>
  store.createCard(b.b.id, { columnId, title: 'x', ...extra }, rene.id);
const where = (id: string) => store.getCard(id).columnId;

describe('Spalte „Geplant"', () => {
  it('neue Boards haben sie hinter „Offen", Boards ohne den Zusatz nicht', () => {
    const { b } = board();
    expect(store.getBoardView(b.id).columns.map((c) => [c.name, c.isPlanned, c.isDone])).toEqual([
      ['Offen', false, false],
      ['Geplant', true, false],
      ['In Arbeit', false, false],
      ['Erledigt', false, true],
    ]);
    const plain = store.createBoard({ name: 'Alt' });
    expect(store.getBoardView(plain.id).columns.map((c) => c.name)).toEqual(['Offen', 'In Arbeit', 'Erledigt']);
  });

  it('eine Spalte ist nie „Geplant" und „Erledigt" zugleich, und es gibt nur eine „Geplant"', () => {
    const s = board();
    expect(() => store.updateColumn(s.planned.id, { isDone: true })).toThrow(ValidationError);
    expect(() => store.updateColumn(s.done.id, { isPlanned: true })).toThrow(ValidationError);
    expect(() => store.addColumn(s.b.id, { name: 'x', isDone: true, isPlanned: true })).toThrow(ValidationError);
    store.updateColumn(s.doing.id, { isPlanned: true });
    const cols = store.getBoardView(s.b.id).columns;
    expect(cols.filter((c) => c.isPlanned).map((c) => c.name)).toEqual(['In Arbeit']);
  });

  it('zählt Karten in „Geplant" nicht als offen', () => {
    const s = board();
    card(s, s.open.id);
    card(s, s.open.id, { dueAt: NEXT_WEEK });
    expect(store.listBoards(null)[0]?.openCards).toBe(1);
  });
});

describe('Karten sortieren sich nach dem Termin', () => {
  it('neue Karte in „Offen" mit Termin nach heute landet in „Geplant", mit Termin heute oder ohne bleibt sie in „Offen"', () => {
    const s = board();
    expect(where(card(s, s.open.id, { dueAt: NEXT_WEEK }).id)).toBe(s.planned.id);
    expect(where(card(s, s.open.id, { dueAt: TOMORROW }).id)).toBe(s.planned.id);
    expect(where(card(s, s.open.id, { dueAt: TODAY_LATE }).id)).toBe(s.open.id);
    expect(where(card(s, s.open.id).id)).toBe(s.open.id);
  });

  it('in „Geplant" lässt sich nur mit Termin nach heute anlegen', () => {
    const s = board();
    expect(() => card(s, s.planned.id)).toThrow(ValidationError);
    expect(() => card(s, s.planned.id, { dueAt: TODAY_LATE })).toThrow(ValidationError);
    expect(where(card(s, s.planned.id, { dueAt: NEXT_WEEK }).id)).toBe(s.planned.id);
  });

  it('Termin setzen verschiebt von „Offen" nach „Geplant", Termin entfernen oder auf heute holen zurück', () => {
    const s = board();
    const c = card(s, s.open.id);
    store.updateCard(c.id, { dueAt: NEXT_WEEK });
    expect(where(c.id)).toBe(s.planned.id);
    store.updateCard(c.id, { dueAt: TODAY_LATE });
    expect(where(c.id)).toBe(s.open.id);
    store.updateCard(c.id, { dueAt: NEXT_WEEK });
    store.updateCard(c.id, { dueAt: null });
    expect(where(c.id)).toBe(s.open.id);
  });

  it('Karten in „In Arbeit" bleiben, egal wie der Termin liegt', () => {
    const s = board();
    const c = card(s, s.doing.id, { dueAt: NEXT_WEEK });
    store.updateCard(c.id, { title: 'neu' });
    store.syncPlanned();
    expect(where(c.id)).toBe(s.doing.id);
  });

  it('am Tag der Fälligkeit rückt die Karte von selbst nach „Offen", nach oben', () => {
    const s = board();
    const old = card(s, s.open.id);
    const c = card(s, s.open.id, { dueAt: '2026-11-02T09:00:00Z' }); // Mo 02.11.
    expect(where(c.id)).toBe(s.planned.id);

    now = new Date('2026-11-01T10:00:00Z'); // So: noch nicht
    expect(store.syncPlanned()).toBe(0);
    now = new Date('2026-11-01T23:30:00Z'); // 00:30 am Montag in Berlin
    expect(store.syncPlanned()).toBe(1);
    expect(where(c.id)).toBe(s.open.id);
    const order = store.getBoardView(s.b.id).cards.filter((x) => x.columnId === s.open.id).map((x) => x.id);
    expect(order).toEqual([c.id, old.id]);
    expect(store.syncPlanned()).toBe(0);
  });

  it('beim Verschieben: nicht passende Karten landen in der passenden Spalte', () => {
    const s = board();
    const noDate = card(s, s.open.id);
    const future = card(s, s.open.id, { dueAt: NEXT_WEEK });
    expect(store.moveCard(noDate.id, { columnId: s.planned.id }).columnId).toBe(s.open.id);
    expect(store.moveCard(future.id, { columnId: s.open.id }).columnId).toBe(s.planned.id);
    // „In Arbeit" nimmt alles, und zurück in „Offen" mit Termin nach heute führt nach „Geplant"
    expect(store.moveCard(future.id, { columnId: s.doing.id }).columnId).toBe(s.doing.id);
    expect(store.moveCard(future.id, { columnId: s.open.id }).columnId).toBe(s.planned.id);
    expect(store.moveCard(future.id, { columnId: s.planned.id }).columnId).toBe(s.planned.id);
  });

  it('eine wiederkehrende Karte wartet nach dem Erledigen in „Geplant", bis sie wieder dran ist', () => {
    const s = board();
    const c = card(s, s.doing.id, {
      dueAt: '2026-10-30T15:00:00Z', // heute 16:00
      recurrence: { type: 'fixed', freq: 'weekly', every: 1, weekdays: [5] }, // freitags
    });
    const res = store.completeCard(c.id, { by: rene.id, source: 'app' });
    expect(res.nextDueAt).toBe('2026-11-06T15:00:00.000Z');
    expect(res.card.columnId).toBe(s.done.id); // die erledigte Karte
    expect(where(res.nextCardId!)).toBe(s.planned.id); // die nächste wartet in „Geplant"
    // Rückgängig stellt die alte Spalte wieder her und entfernt die neue Karte
    store.undoCompletion(res.completionId!);
    expect(where(c.id)).toBe(s.doing.id);
    expect(() => store.getCard(res.nextCardId!)).toThrow();
  });

  it('eine täglich wiederkehrende Karte ohne „Geplant"-Spalte geht wie bisher nach „Offen"', () => {
    const plain = store.createBoard({ name: 'Alt' });
    const cols = store.getBoardView(plain.id).columns;
    const c = store.createCard(
      plain.id,
      {
        columnId: cols[1]!.id,
        title: 'täglich',
        dueAt: '2026-10-30T15:00:00Z',
        recurrence: { type: 'fixed', freq: 'daily', every: 1 },
      },
      rene.id,
    );
    const res = store.completeCard(c.id, { by: rene.id, source: 'app' });
    expect(store.getCard(res.nextCardId!).columnId).toBe(cols[0]!.id);
  });

  it('beim Einschalten von „Geplant" für eine Spalte sortieren sich vorhandene Karten sofort ein', () => {
    const plain = store.createBoard({ name: 'Alt' });
    const [open, doing] = store.getBoardView(plain.id).columns;
    const c = store.createCard(plain.id, { columnId: open!.id, title: 'später', dueAt: NEXT_WEEK }, rene.id);
    store.updateColumn(doing!.id, { isPlanned: true });
    expect(where(c.id)).toBe(doing!.id);
  });
});

describe('Boards von früher', () => {
  it('bekommen einmalig eine „Geplant"-Spalte hinter der ersten Spalte, und Karten sortieren sich ein', () => {
    const plain = store.createBoard({ name: 'Alt' });
    const [open] = store.getBoardView(plain.id).columns;
    const c = store.createCard(plain.id, { columnId: open!.id, title: 'später', dueAt: NEXT_WEEK }, rene.id);

    store.ensurePlannedColumns();
    const cols = store.getBoardView(plain.id).columns;
    expect(cols.map((x) => x.name)).toEqual(['Offen', 'Geplant', 'In Arbeit', 'Erledigt']);
    expect(where(c.id)).toBe(cols[1]!.id);

    // einmalig: wer die Spalte löscht, bekommt sie nicht zurück
    store.deleteColumn(cols[1]!.id, cols[0]!.id);
    store.ensurePlannedColumns();
    expect(store.getBoardView(plain.id).columns.map((x) => x.name)).toEqual(['Offen', 'In Arbeit', 'Erledigt']);
  });

  it('ändern ein Board nicht, das schon eine „Geplant"-Spalte hat', () => {
    const { b } = board();
    store.ensurePlannedColumns();
    expect(store.getBoardView(b.id).columns).toHaveLength(4);
  });
});
