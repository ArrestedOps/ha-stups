import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
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

const later = (min: number) => {
  now = new Date(now.getTime() + min * 60_000);
};

describe('Aktivitätsverlauf einer Karte', () => {
  it('beginnt mit „angelegt" und nennt, wer die Karte angelegt hat', () => {
    const { b, open } = setup();
    const card = store.createCard(b.id, { columnId: open.id, title: 'Fenster' }, rene.id);
    expect(card.activity).toEqual([
      expect.objectContaining({ kind: 'created', at: '2026-10-30T10:00:00.000Z', byName: 'Rene' }),
    ]);
  });

  it('protokolliert Verschieben mit Von und Nach, neueste zuerst', () => {
    const { b, open, doing } = setup();
    const card = store.createCard(b.id, { columnId: open.id, title: 'Fenster' }, rene.id);
    later(5);
    const moved = store.moveCard(card.id, { columnId: doing.id }, conny.id);
    expect(moved.activity.map((a) => a.kind)).toEqual(['moved', 'created']);
    expect(moved.activity[0]).toMatchObject({ byName: 'Conny', from: open.name, to: doing.name });
  });

  it('verschiebt man innerhalb derselben Spalte, entsteht kein Eintrag', () => {
    const { b, open } = setup();
    const a = store.createCard(b.id, { columnId: open.id, title: 'A' }, rene.id);
    const c = store.createCard(b.id, { columnId: open.id, title: 'B' }, rene.id);
    const res = store.moveCard(c.id, { columnId: open.id, afterId: null }, rene.id);
    expect(res.activity.map((x) => x.kind)).toEqual(['created']);
    expect(store.getCard(a.id).activity).toHaveLength(1);
  });

  it('zeigt „Erledigt" aus der Erledigung und danach „Wieder geöffnet"', () => {
    const { b, open, done } = setup();
    const card = store.createCard(b.id, { columnId: open.id, title: 'Müll' }, rene.id);
    later(60);
    const res = store.completeCard(card.id, { by: conny.id, source: 'push' });
    expect(res.card.activity[0]).toMatchObject({
      kind: 'completed',
      at: '2026-10-30T11:00:00.000Z',
      byName: 'Conny',
      source: 'push',
    });
    later(30);
    const reopened = store.moveCard(card.id, { columnId: open.id }, rene.id);
    expect(reopened.activity.map((a) => a.kind)).toEqual(['reopened', 'completed', 'created']);
    expect(reopened.activity[0]).toMatchObject({ byName: 'Rene', to: open.name });
    expect(done.name).toBeTruthy();
  });

  it('Ziehen in die Erledigt-Spalte zählt als Erledigung, nicht als Verschieben', () => {
    const { b, open, done } = setup();
    const card = store.createCard(b.id, { columnId: open.id, title: 'Müll' }, rene.id);
    later(1);
    const res = store.moveCard(card.id, { columnId: done.id }, rene.id);
    expect(res.activity.map((a) => a.kind)).toEqual(['completed', 'created']);
  });

  it('Rückgängig entfernt den Erledigt-Eintrag wieder', () => {
    const { b, open } = setup();
    const card = store.createCard(b.id, { columnId: open.id, title: 'Müll' }, rene.id);
    later(1);
    const res = store.completeCard(card.id, { by: rene.id, source: 'app' });
    const undone = store.undoCompletion(res.completionId!);
    expect(undone.activity.map((a) => a.kind)).toEqual(['created']);
  });

  it('protokolliert eine geänderte Fälligkeit mit altem und neuem Termin', () => {
    const { b, open } = setup();
    const card = store.createCard(b.id, { columnId: open.id, title: 'Steuer', dueAt: '2026-10-30T12:00:00Z' }, rene.id);
    later(10);
    const upd = store.updateCard(card.id, { dueAt: '2026-10-30T15:00:00Z' }, conny.id);
    expect(upd.activity[0]).toMatchObject({
      kind: 'due',
      byName: 'Conny',
      from: '2026-10-30T12:00:00.000Z',
      to: '2026-10-30T15:00:00.000Z',
    });
    const cleared = store.updateCard(card.id, { dueAt: null }, conny.id);
    expect(cleared.activity[0]).toMatchObject({ kind: 'due', from: '2026-10-30T15:00:00.000Z', to: null });
  });

  it('andere Änderungen oder ein unveränderter Termin erzeugen keinen Eintrag', () => {
    const { b, open } = setup();
    const card = store.createCard(b.id, { columnId: open.id, title: 'Steuer', dueAt: '2026-10-30T12:00:00Z' }, rene.id);
    store.updateCard(card.id, { title: 'Steuer 2026' }, rene.id);
    const same = store.updateCard(card.id, { dueAt: '2026-10-30T12:00:00Z' }, rene.id);
    expect(same.activity.map((a) => a.kind)).toEqual(['created']);
  });

  it('Wiederherstellen aus dem Archiv steht als „Wieder geöffnet" im Verlauf', () => {
    const { b, open } = setup();
    const card = store.createCard(b.id, { columnId: open.id, title: 'Müll' }, rene.id);
    store.completeCard(card.id, { by: rene.id, source: 'app' });
    store.setArchived(card.id, true);
    later(5);
    const back = store.restoreArchived(card.id, open.id, conny.id);
    expect(back.activity[0]).toMatchObject({ kind: 'reopened', byName: 'Conny', to: open.name });
  });

  it('eine Karte ohne Eintrag in der Tabelle (vor dieser Version) zeigt trotzdem „angelegt"', () => {
    const { b, open } = setup();
    const card = store.createCard(b.id, { columnId: open.id, title: 'Alt' }, null);
    expect(card.activity).toEqual([expect.objectContaining({ kind: 'created', byName: null })]);
  });
});
