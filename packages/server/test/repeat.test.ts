import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { ValidationError } from '../src/errors.js';
import type { Recurrence } from '../src/recurrence.js';
import { createStore, type Store } from '../src/store.js';

let now: Date;
let store: Store;
let rene: { id: string };

beforeEach(() => {
  now = new Date('2026-10-30T10:00:00Z');
  store = createStore(openDb(':memory:'), { now: () => now, timeZone: () => 'Europe/Berlin' });
  store.syncPeople([{ name: 'Rene' }]);
  rene = store.resolveUser({ haId: 'ha-rene', name: 'rene', displayName: 'René' });
});

const everyDay: Recurrence = { type: 'fixed', freq: 'daily', every: 1 };

function setup() {
  const b = store.createBoard({ name: 'Haushalt' });
  const v = store.getBoardView(b.id);
  return { b, open: v.columns[0]!, done: v.columns[2]! };
}

/** Aufgabe mit Beschreibung, Kosten, Checkliste, Link, Anhang und Kommentar */
function fullCard(carryOver?: string[]) {
  const { b, open } = setup();
  const card = store.createCard(
    b.id,
    {
      columnId: open.id,
      title: 'Müll',
      description: 'Gelber Sack',
      costCents: 500,
      dueAt: '2026-10-30T09:00:00Z',
      recurrence: everyDay,
      ...(carryOver ? { carryOver } : {}),
    },
    rene.id,
  );
  store.addChecklistItem(card.id, 'Tonne raus');
  store.addLink(card.id, { url: 'https://example.com' });
  store.addAttachment(
    card.id,
    { id: 'att-1', filename: 'foto.jpg', mime: 'image/jpeg', size: 10, file: 'file-1.jpg', thumb: 'thumb-1.jpg' },
    rene.id,
  );
  store.addComment(card.id, rene.id, 'Heute war es voll');
  return { b, card };
}

describe('Übernahme-Felder einer wiederkehrenden Aufgabe', () => {
  it('ohne Angabe gilt die Voreinstellung: Beschreibung, Checkliste, Links und Kosten', () => {
    const { card } = fullCard();
    expect(card.carryOver).toEqual(['description', 'checklist', 'links', 'cost']);
    const res = store.completeCard(card.id, { by: rene.id, source: 'app' });
    const next = store.getCard(res.nextCardId!);
    expect(next).toMatchObject({ description: 'Gelber Sack', costCents: 500, linkCount: 1, attachmentCount: 0, commentCount: 0 });
    expect(next.checklistItems.map((i) => [i.text, i.done])).toEqual([['Tonne raus', false]]);
    // Das Erledigte behält alles
    expect(store.getCard(card.id)).toMatchObject({ attachmentCount: 1, commentCount: 1, description: 'Gelber Sack' });
  });

  it('nur gewählte Felder werden übernommen', () => {
    const { card } = fullCard(['description']);
    const next = store.getCard(store.completeCard(card.id, { by: rene.id, source: 'app' }).nextCardId!);
    expect(next).toMatchObject({ description: 'Gelber Sack', costCents: null, linkCount: 0, attachmentCount: 0, commentCount: 0 });
    expect(next.checklist).toEqual({ done: 0, total: 0 });
    expect(next.carryOver).toEqual(['description']); // die Auswahl wandert mit
  });

  it('eine leere Auswahl übernimmt nur Titel, Zuweisung, Kategorien, Priorität und Erinnerungen', () => {
    const { card } = fullCard([]);
    expect(card.carryOver).toEqual([]);
    const next = store.getCard(store.completeCard(card.id, { by: rene.id, source: 'app' }).nextCardId!);
    expect(next).toMatchObject({ title: 'Müll', description: null, costCents: null, linkCount: 0 });
  });

  it('Fotos und Kommentare lassen sich zusätzlich übernehmen, die Datei wird geteilt', () => {
    const { card } = fullCard(['attachments', 'comments']);
    const next = store.getCard(store.completeCard(card.id, { by: rene.id, source: 'app' }).nextCardId!);
    expect(next).toMatchObject({ attachmentCount: 1, commentCount: 1 });
    expect(store.listComments(next.id)[0]).toMatchObject({ text: 'Heute war es voll', authorId: rene.id });
    const copy = next.attachments[0]!;
    expect(store.getAttachment(copy.id)).toMatchObject({ file: 'file-1.jpg', thumb: 'thumb-1.jpg', cardId: next.id });
  });

  it('beim Löschen eines geteilten Fotos bleibt die Datei, bis das letzte Foto weg ist', () => {
    const { card } = fullCard(['attachments']);
    const next = store.getCard(store.completeCard(card.id, { by: rene.id, source: 'app' }).nextCardId!);
    expect(store.deleteAttachment('att-1')).toEqual({ file: null, thumb: null });
    expect(store.referencedFiles()).toEqual(new Set(['file-1.jpg', 'thumb-1.jpg']));
    expect(store.deleteAttachment(next.attachments[0]!.id)).toEqual({ file: 'file-1.jpg', thumb: 'thumb-1.jpg' });
  });

  it('lässt sich bei bestehenden Aufgaben ändern und prüft die Werte', () => {
    const { card } = fullCard();
    const upd = store.updateCard(card.id, { carryOver: ['links', 'links', 'cost'] });
    expect(upd.carryOver).toEqual(['links', 'cost']);
    expect(() => store.updateCard(card.id, { carryOver: ['beschreibung'] })).toThrow(ValidationError);
    expect(() => store.updateCard(card.id, { carryOver: 'description' })).toThrow(ValidationError);
    expect(() => store.updateCard(card.id, { carryOver: [1] })).toThrow(ValidationError);
  });

  it('Duplizieren übernimmt die Auswahl', () => {
    const { card } = fullCard(['links']);
    expect(store.duplicateCard(card.id, rene.id).carryOver).toEqual(['links']);
  });
});

describe('Verlauf und Verkettung', () => {
  it('die neue Aufgabe zeigt „Aus Wiederholung angelegt" und verweist auf die erledigte', () => {
    const { card } = fullCard();
    const res = store.completeCard(card.id, { by: rene.id, source: 'push' });
    const next = store.getCard(res.nextCardId!);
    expect(next.repeatedFrom).toBe(card.id);
    expect(next.activity.map((a) => a.kind)).toEqual(['repeated']);
    expect(store.getCard(card.id).repeatedFrom).toBeNull();
  });

  it('eine Kette: jede Wiederholung ist eine eigene Aufgabe, nur die letzte ist offen', () => {
    const { b, card } = fullCard();
    let id = card.id;
    for (let i = 0; i < 3; i++) {
      const res = store.completeCard(id, { by: rene.id, source: 'app' });
      id = res.nextCardId!;
    }
    const cards = store.getBoardView(b.id).cards;
    expect(cards).toHaveLength(4);
    expect(cards.filter((c) => c.completedAt === null)).toHaveLength(1);
    expect(cards.filter((c) => c.recurrence !== null)).toHaveLength(1);
  });

  it('Rückgängig nach „nur Fotos geteilt" lässt die Datei der erledigten Aufgabe unangetastet', () => {
    const { card } = fullCard(['attachments']);
    const res = store.completeCard(card.id, { by: rene.id, source: 'app' });
    store.undoCompletion(res.completionId!);
    expect(store.getCard(card.id).attachmentCount).toBe(1);
    expect(store.referencedFiles()).toEqual(new Set(['file-1.jpg', 'thumb-1.jpg']));
  });
});

describe('Stündlich, Zeitfenster und Toleranz bleiben beim Wiederholen erhalten', () => {
  const hourly: Recurrence = { type: 'fixed', freq: 'hourly', every: 3, window: { from: '08:00', to: '20:00' } };
  const tolerant: Recurrence = { type: 'fixed', freq: 'weekly', every: 2, weekdays: [6], lateTolerance: 3 };

  it('Erledigen: Folgeaufgabe mit gleicher Regel und dem berechneten Termin', () => {
    const { b, open } = setup();
    // jetzt Fr 30.10. 11:00 Berlin; Termin 10:00 Berlin (09:00Z)
    const card = store.createCard(b.id, { columnId: open.id, title: 'Trinken', dueAt: '2026-10-30T09:00:00Z', recurrence: hourly }, rene.id);
    const res = store.completeCard(card.id, { by: rene.id, source: 'app' });
    expect(res.nextDueAt).toBe('2026-10-30T12:00:00.000Z');
    expect(store.getCard(res.nextCardId!).recurrence).toEqual(hourly);
  });

  it('Erledigen mit Toleranz: zu spät → Plan beginnt neu', () => {
    const { b, open } = setup();
    // fällig Sa 14.11. 10:00, erledigt Mi 18.11.
    now = new Date('2026-11-18T12:00:00Z');
    const card = store.createCard(b.id, { columnId: open.id, title: 'Bad', dueAt: '2026-11-14T09:00:00Z', recurrence: tolerant }, rene.id);
    const res = store.completeCard(card.id, { by: rene.id, source: 'app' });
    expect(res.nextDueAt).toBe('2026-12-05T09:00:00.000Z');
    expect(store.getCard(res.nextCardId!).recurrence).toEqual(tolerant);
  });

  it('Duplizieren und Vorlage behalten Fenster und Toleranz', () => {
    const { b, open } = setup();
    const card = store.createCard(b.id, { columnId: open.id, title: 'Bad', dueAt: '2026-11-14T09:00:00Z', recurrence: tolerant }, rene.id);
    expect(store.duplicateCard(card.id, rene.id).recurrence).toEqual(tolerant);
    store.createCard(b.id, { columnId: open.id, title: 'Trinken', dueAt: '2026-11-14T09:00:00Z', recurrence: hourly }, rene.id);
    const saved = store.saveBoardAsTemplate(b.id, 'Meine', rene.id);
    const board = store.createBoardFromTemplate({ name: 'Neu', template: saved.id, lang: 'de', by: rene.id });
    const recs = store.getBoardView(board.id).cards.map((c) => c.recurrence);
    expect(recs).toEqual(expect.arrayContaining([tolerant, hourly]));
  });

  it('Aktualisieren speichert die neuen Felder', () => {
    const { b, open } = setup();
    const card = store.createCard(b.id, { columnId: open.id, title: 'Bad', dueAt: '2026-11-14T09:00:00Z' }, rene.id);
    expect(store.updateCard(card.id, { recurrence: tolerant }).recurrence).toEqual(tolerant);
  });
});
