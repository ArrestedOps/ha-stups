import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { ConflictError, NotFoundError } from '../src/errors.js';
import type { Recurrence } from '../src/recurrence.js';
import { createStore, type Store } from '../src/store.js';

let now: Date;
let store: Store;
let rene: { id: string };
let conny: { id: string };

beforeEach(() => {
  now = new Date('2026-10-30T10:00:00Z');
  store = createStore(openDb(':memory:'), { now: () => now, timeZone: () => 'Europe/Berlin' });
  store.syncPeople([{ name: 'Rene' }, { name: 'Conny' }]);
  rene = store.resolveUser({ haId: 'ha-rene', name: 'rene', displayName: 'René' });
  conny = store.resolveUser({ haId: 'ha-conny', name: 'conny', displayName: 'Conny' });
});

function setup() {
  const b = store.createBoard({ name: 'Haushalt' });
  const v = store.getBoardView(b.id);
  return { b, open: v.columns[0]!, doing: v.columns[1]!, done: v.columns[2]! };
}

const saturday: Recurrence = { type: 'fixed', freq: 'weekly', every: 1, weekdays: [6] };

describe('Erledigen ohne Wiederholung', () => {
  it('verschiebt die Aufgabe an den Anfang der Erledigt-Spalte und protokolliert', () => {
    const { b, open, done } = setup();
    const old = store.createCard(b.id, { columnId: open.id, title: 'alt' }, rene.id);
    store.completeCard(old.id, { by: rene.id, source: 'app' });
    now = new Date('2026-10-30T11:00:00Z');
    const card = store.createCard(
      b.id,
      { columnId: open.id, title: 'Müll', dueAt: '2026-10-30T09:00:00Z' },
      rene.id,
    );
    const res = store.completeCard(card.id, { by: conny.id, source: 'push' });

    expect(res.nextDueAt).toBeNull();
    expect(res.card).toMatchObject({ columnId: done.id, completedAt: '2026-10-30T11:00:00.000Z' });
    const order = store.getBoardView(b.id).cards.filter((c) => c.columnId === done.id).map((c) => c.id);
    expect(order).toEqual([card.id, old.id]);
    const history = store.listCompletions(card.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      completedBy: conny.id,
      completedAt: '2026-10-30T11:00:00.000Z',
      dueAt: '2026-10-30T09:00:00.000Z',
      source: 'push',
    });
  });

  it('ist idempotent: ein zweites Erledigen (z. B. Doppeltipp im Push) tut nichts', () => {
    const { b, open } = setup();
    const card = store.createCard(b.id, { columnId: open.id, title: 'Müll' }, rene.id);
    const first = store.completeCard(card.id, { by: rene.id, source: 'push' });
    const second = store.completeCard(card.id, { by: rene.id, source: 'push' });
    expect(first.completionId).toBeTruthy();
    expect(second.completionId).toBeNull();
    expect(store.listCompletions(card.id)).toHaveLength(1);
  });

  it('markiert die Aufgabe auch ohne Erledigt-Spalte als erledigt', () => {
    const { b, open, done } = setup();
    store.updateColumn(done.id, { isDone: false });
    const card = store.createCard(b.id, { columnId: open.id, title: 'x' }, rene.id);
    const res = store.completeCard(card.id, { by: rene.id, source: 'app' });
    expect(res.card.completedAt).not.toBeNull();
    expect(res.card.columnId).toBe(open.id);
  });

  it('eine Aufgabe in die Erledigt-Spalte ziehen erledigt sie, zurückziehen macht es rückgängig', () => {
    const { b, open, done } = setup();
    const card = store.createCard(b.id, { columnId: open.id, title: 'x' }, rene.id);
    const moved = store.moveCard(card.id, { columnId: done.id }, rene.id);
    expect(moved.completedAt).not.toBeNull();
    expect(store.listCompletions(card.id)).toHaveLength(1);
    const back = store.moveCard(card.id, { columnId: open.id }, rene.id);
    expect(back.completedAt).toBeNull();
    expect(back.archivedAt).toBeNull();
  });

  it('eine wiederkehrende Aufgabe in die Erledigt-Spalte ziehen erledigt sie und legt die nächste Aufgabe an', () => {
    const { b, open, done } = setup();
    const card = store.createCard(
      b.id,
      { columnId: open.id, title: 'Bad', dueAt: '2026-10-31T08:00:00Z', recurrence: saturday },
      rene.id,
    );
    const moved = store.moveCard(card.id, { columnId: done.id }, rene.id);
    expect(moved).toMatchObject({ id: card.id, columnId: done.id, recurrence: null });
    expect(moved.completedAt).not.toBeNull();
    const next = store.getBoardView(b.id).cards.find((c) => c.repeatedFrom === card.id);
    expect(next).toMatchObject({ columnId: open.id, completedAt: null, title: 'Bad' });
    expect(next?.recurrence).toEqual(saturday);
  });
});

describe('Erledigen mit Wiederholung', () => {
  it('die erledigte Aufgabe landet in „Erledigt", eine neue mit dem nächsten Termin oben in „Offen"', () => {
    const { b, open, doing, done } = setup();
    const cat = store.addCategory(b.id, { name: 'Putzen', color: 'blue' });
    const card = store.createCard(
      b.id,
      {
        columnId: doing.id,
        title: 'Bad putzen',
        description: 'Entkalker',
        priority: 'high',
        dueAt: '2026-10-24T08:00:00Z', // Sa 10:00 CEST, bereits überfällig
        recurrence: saturday,
        assigneeIds: [conny.id],
        categoryIds: [cat.id],
      },
      rene.id,
    );
    const i1 = store.addChecklistItem(card.id, 'Spiegel');
    store.addChecklistItem(card.id, 'Dusche');
    store.updateChecklistItem(i1.id, { done: true });
    store.addLink(card.id, { url: 'https://example.com' });
    const other = store.createCard(b.id, { columnId: open.id, title: 'schon da' }, rene.id);

    now = new Date('2026-10-30T12:00:00Z'); // Fr
    const res = store.completeCard(card.id, { by: conny.id, source: 'app' });

    expect(res.nextDueAt).toBe('2026-10-31T09:00:00.000Z'); // Sa 31.10. 10:00 CET

    // Die erledigte Aufgabe bleibt mit allem, was an ihr hing, in „Erledigt" und wiederholt sich nicht mehr
    expect(res.card).toMatchObject({
      id: card.id,
      columnId: done.id,
      dueAt: '2026-10-24T08:00:00.000Z',
      completedAt: now.toISOString(),
      recurrence: null,
      title: 'Bad putzen',
    });
    expect(res.card.checklist).toEqual({ done: 1, total: 2 });
    expect(store.listCompletions(card.id)[0]).toMatchObject({
      completedBy: conny.id,
      dueAt: '2026-10-24T08:00:00.000Z',
    });

    // Die neue Aufgabe trägt den nächsten Termin und die voreingestellten Felder
    const next = store.getCard(res.nextCardId!);
    expect(next).toMatchObject({
      columnId: open.id,
      dueAt: '2026-10-31T09:00:00.000Z',
      completedAt: null,
      archivedAt: null,
      title: 'Bad putzen',
      description: 'Entkalker',
      priority: 'high',
      assigneeIds: [conny.id],
      categoryIds: [cat.id],
      linkCount: 1,
      repeatedFrom: card.id,
    });
    expect(next.recurrence).toEqual(saturday);
    expect(next.checklist).toEqual({ done: 0, total: 2 }); // zurückgesetzt
    const order = store.getBoardView(b.id).cards.filter((c) => c.columnId === open.id).map((c) => c.id);
    expect(order).toEqual([next.id, other.id]); // ganz oben
  });

  it('liegt der nächste Termin nach heute, wartet die neue Aufgabe in „Geplant"', () => {
    const b = store.createBoard({ name: 'Mit Geplant', withPlanned: true });
    const cols = store.getBoardView(b.id).columns;
    const planned = cols.find((c) => c.isPlanned)!;
    const open = cols.find((c) => !c.isPlanned && !c.isDone)!;
    const card = store.createCard(
      b.id,
      { columnId: open.id, title: 'Filter', dueAt: '2026-10-30T09:00:00Z', recurrence: { type: 'fixed', freq: 'daily', every: 3 } },
      rene.id,
    );
    const res = store.completeCard(card.id, { by: rene.id, source: 'app' });
    expect(store.getCard(res.nextCardId!).columnId).toBe(planned.id);
  });

  it('Intervall ab Erledigung rechnet vom Erledigungszeitpunkt', () => {
    const { b, open } = setup();
    const card = store.createCard(
      b.id,
      {
        columnId: open.id,
        title: 'Filter',
        dueAt: '2026-11-14T17:00:00Z',
        recurrence: { type: 'after_completion', every: 3, unit: 'months' },
      },
      rene.id,
    );
    now = new Date('2026-11-14T20:30:00Z');
    expect(store.completeCard(card.id, { by: rene.id, source: 'app' }).nextDueAt).toBe('2027-02-14T17:00:00.000Z');
  });

  it('die erledigte Aufgabe wird wie jede andere archiviert, die neue wiederkehrende nicht', () => {
    const { b, open } = setup();
    const card = store.createCard(
      b.id,
      { columnId: open.id, title: 'Bad', dueAt: '2026-10-31T08:00:00Z', recurrence: saturday },
      rene.id,
    );
    const res = store.completeCard(card.id, { by: rene.id, source: 'app' });
    now = new Date('2027-10-30T10:00:00Z');
    expect(store.archiveDone()).toBe(1);
    expect(store.listArchived(b.id).map((x) => x.id)).toEqual([card.id]);
    expect(store.getCard(res.nextCardId!).archivedAt).toBeNull();
  });
});

describe('Rückgängig', () => {
  it('stellt eine wiederkehrende Aufgabe vollständig wieder her und entfernt die neue Aufgabe', () => {
    const { b, doing } = setup();
    const card = store.createCard(
      b.id,
      { columnId: doing.id, title: 'Bad', dueAt: '2026-10-24T08:00:00Z', recurrence: saturday },
      rene.id,
    );
    const i1 = store.addChecklistItem(card.id, 'Spiegel');
    store.addChecklistItem(card.id, 'Dusche');
    store.updateChecklistItem(i1.id, { done: true });
    const before = store.getCard(card.id);

    const res = store.completeCard(card.id, { by: rene.id, source: 'app' });
    const undone = store.undoCompletion(res.completionId!);

    expect(undone.columnId).toBe(before.columnId);
    expect(undone.position).toBe(before.position);
    expect(undone.dueAt).toBe(before.dueAt);
    expect(undone.checklist).toEqual({ done: 1, total: 2 });
    expect(undone.recurrence).toEqual(saturday);
    expect(undone.completedAt).toBeNull();
    expect(store.listCompletions(card.id)).toHaveLength(0);
    // die neue Aufgabe ist wieder weg
    expect(() => store.getCard(res.nextCardId!)).toThrow(NotFoundError);
    expect(store.getBoardView(b.id).cards.map((c) => c.id)).toEqual([card.id]);
  });

  it('lässt sich nicht rückgängig machen, wenn die nächste Aufgabe schon erledigt wurde', () => {
    const { b, doing } = setup();
    const card = store.createCard(
      b.id,
      { columnId: doing.id, title: 'Bad', dueAt: '2026-10-24T08:00:00Z', recurrence: saturday },
      rene.id,
    );
    const first = store.completeCard(card.id, { by: rene.id, source: 'app' });
    store.completeCard(first.nextCardId!, { by: rene.id, source: 'app' });
    expect(() => store.undoCompletion(first.completionId!)).toThrow(ConflictError);
    expect(store.getCard(first.nextCardId!).completedAt).not.toBeNull();
  });

  it('stellt eine einmalige Aufgabe wieder her', () => {
    const { b, open } = setup();
    const card = store.createCard(b.id, { columnId: open.id, title: 'x' }, rene.id);
    const res = store.completeCard(card.id, { by: rene.id, source: 'app' });
    const undone = store.undoCompletion(res.completionId!);
    expect(undone).toMatchObject({ columnId: open.id, completedAt: null });
  });

  it('nur die letzte Erledigung einer Aufgabe lässt sich rückgängig machen', () => {
    const { b, doing } = setup();
    const card = store.createCard(
      b.id,
      { columnId: doing.id, title: 'Bad', dueAt: '2026-10-24T08:00:00Z', recurrence: saturday },
      rene.id,
    );
    const first = store.completeCard(card.id, { by: rene.id, source: 'app' });
    store.moveCard(card.id, { columnId: doing.id }, rene.id); // wieder geöffnet und noch einmal erledigt
    now = new Date('2026-11-01T12:00:00Z');
    store.completeCard(card.id, { by: rene.id, source: 'app' });
    expect(() => store.undoCompletion(first.completionId!)).toThrow(ConflictError);
    expect(() => store.undoCompletion('gibt-es-nicht')).toThrow(NotFoundError);
  });
});

describe('Rückgängig mit bearbeiteter Folgeaufgabe', () => {
  function erledigt() {
    const { b, doing } = setup();
    const card = store.createCard(
      b.id,
      { columnId: doing.id, title: 'Bad', dueAt: '2026-10-24T08:00:00Z', recurrence: saturday },
      rene.id,
    );
    const res = store.completeCard(card.id, { by: rene.id, source: 'app' });
    return { card, res, next: res.nextCardId! };
  }
  const exists = (id: string) => {
    try {
      store.getCard(id);
      return true;
    } catch {
      return false;
    }
  };

  it('unberührt: die Folgeaufgabe verschwindet wie bisher', () => {
    const { res, next } = erledigt();
    store.undoCompletion(res.completionId!);
    expect(exists(next)).toBe(false);
  });

  it('ein Kommentar auf der Folgeaufgabe verhindert das Löschen, nichts geht verloren', () => {
    const { res, next } = erledigt();
    store.addComment(next, rene.id, 'Bitte Fenster mit putzen');
    expect(() => store.undoCompletion(res.completionId!)).toThrow(ConflictError);
    expect(exists(next)).toBe(true);
    expect(store.getCard(next).commentCount).toBe(1);
  });

  it('ein abgehakter oder neuer Punkt der Checkliste ebenso', () => {
    const a = erledigt();
    const item = store.addChecklistItem(a.next, 'Spiegel');
    store.updateChecklistItem(item.id, { done: true });
    expect(() => store.undoCompletion(a.res.completionId!)).toThrow(ConflictError);
    expect(exists(a.next)).toBe(true);
  });

  it('ein geänderter Titel ebenso', () => {
    const { res, next } = erledigt();
    store.updateCard(next, { title: 'Bad und Gäste-WC' });
    expect(() => store.undoCompletion(res.completionId!)).toThrow(ConflictError);
    expect(exists(next)).toBe(true);
  });

  it('eine Änderung an der Version allein (etwa Geplant-Abgleich) zählt nicht als Arbeit', () => {
    const { res, next } = erledigt();
    store.moveCard(next, { columnId: store.getCard(next).columnId });
    store.undoCompletion(res.completionId!);
    expect(exists(next)).toBe(false);
  });
});

describe('Archiv-Job', () => {
  it('archiviert erledigte Aufgaben nach der Frist des Boards und sonst nicht', () => {
    const { b, open } = setup();
    const a = store.createCard(b.id, { columnId: open.id, title: 'alt' }, rene.id);
    store.completeCard(a.id, { by: rene.id, source: 'app' });
    now = new Date('2026-11-03T10:00:00Z'); // 4 Tage später
    const c = store.createCard(b.id, { columnId: open.id, title: 'neu' }, rene.id);
    store.completeCard(c.id, { by: rene.id, source: 'app' });

    now = new Date('2026-11-06T10:00:00Z'); // alt: 7 Tage alt, neu: 3 Tage
    expect(store.archiveDone()).toBe(1);
    expect(store.listArchived(b.id).map((x) => x.id)).toEqual([a.id]);
    expect(store.archiveDone()).toBe(0);
  });

  it('archive_after_days = 0 bedeutet nie archivieren', () => {
    const { b, open } = setup();
    store.updateBoard(b.id, { archiveAfterDays: 0 });
    const a = store.createCard(b.id, { columnId: open.id, title: 'alt' }, rene.id);
    store.completeCard(a.id, { by: rene.id, source: 'app' });
    now = new Date('2027-10-30T10:00:00Z');
    expect(store.archiveDone()).toBe(0);
  });

  it('eine wiederhergestellte Aufgabe aus dem Archiv ist nicht mehr erledigt', () => {
    const { b, open } = setup();
    const a = store.createCard(b.id, { columnId: open.id, title: 'alt' }, rene.id);
    store.completeCard(a.id, { by: rene.id, source: 'app' });
    now = new Date('2026-11-10T10:00:00Z');
    store.archiveDone();
    store.restoreArchived(a.id, open.id);
    const card = store.getCard(a.id);
    expect(card).toMatchObject({ archivedAt: null, completedAt: null, columnId: open.id });
  });
});

describe('Verlauf', () => {
  it('liefert die letzten Erledigungen mit Namen, neueste zuerst', () => {
    const { b, open, doing } = setup();
    const card = store.createCard(b.id, { columnId: doing.id, title: 'Bad' }, rene.id);
    store.completeCard(card.id, { by: rene.id, source: 'app' });
    store.moveCard(card.id, { columnId: open.id }, rene.id); // wieder geöffnet
    now = new Date('2026-11-01T12:00:00Z');
    store.completeCard(card.id, { by: conny.id, source: 'push' });
    const history = store.getCard(card.id).history;
    expect(history.map((h) => h.completedByName)).toEqual(['Conny', 'Rene']);
  });
});
