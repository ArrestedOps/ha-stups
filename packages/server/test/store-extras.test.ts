import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { NotFoundError, ValidationError } from '../src/errors.js';
import { createStore, type Store } from '../src/store.js';

let now: Date;
let store: Store;
let rene: { id: string };
let conny: { id: string };

beforeEach(() => {
  now = new Date('2026-10-30T10:00:00Z');
  store = createStore(openDb(':memory:'), { now: () => now });
  store.syncPeople([{ name: 'Rene' }, { name: 'Conny' }]);
  rene = store.resolveUser({ haId: 'ha-rene', name: 'rene', displayName: 'René' });
  conny = store.resolveUser({ haId: 'ha-conny', name: 'conny', displayName: 'Conny' });
});

function setup() {
  const b = store.createBoard({ name: 'Haushalt' });
  const v = store.getBoardView(b.id);
  return { b, open: v.columns[0]!, done: v.columns[2]! };
}

describe('Erinnerungs-, Nachhak- und Kostenfelder', () => {
  it('speichert Vorab-Erinnerung, Nachhaken und Kosten', () => {
    const { b, open } = setup();
    const card = store.createCard(
      b.id,
      { columnId: open.id, title: 'Fenster', dueAt: '2026-11-01T09:00:00Z', remindBeforeMin: 60, reminder: { anchor: 'due', afterMin: 60, everyMin: null, max: 1 }, costCents: 420000 },
      rene.id,
    );
    expect(card).toMatchObject({ remindBeforeMin: 60, costCents: 420000 });
    expect(store.myReminder(card.id, rene.id)).toEqual({ anchor: 'due', afterMin: 60, everyMin: null, max: 1, atTime: null });
    expect(store.myReminder(card.id, conny.id)).toBeNull(); // persönlich: andere haben keins
    const upd = store.updateCard(card.id, { remindBeforeMin: null, reminder: null, costCents: null }, rene.id);
    expect(upd).toMatchObject({ remindBeforeMin: null, costCents: null });
    expect(store.myReminder(card.id, rene.id)).toBeNull();
  });

  it('prüft die Werte', () => {
    const { b, open } = setup();
    const mk = (extra: object) => () => store.createCard(b.id, { columnId: open.id, title: 'x', ...extra }, rene.id);
    expect(mk({ remindBeforeMin: 0 })).toThrow(ValidationError);
    expect(mk({ remindBeforeMin: 1.5 })).toThrow(ValidationError);
    expect(mk({ costCents: -1 })).toThrow(ValidationError);
    expect(mk({ reminder: { afterMin: 1 } })).toThrow(ValidationError);
    expect(mk({ reminder: { afterMin: 60, max: 100, everyMin: 60 } })).toThrow(ValidationError);
    expect(mk({ reminder: 'ja' })).toThrow(ValidationError);
  });

  it('summiert die Kosten eines Boards ohne gelöschte Karten', () => {
    const { b, open } = setup();
    store.createCard(b.id, { columnId: open.id, title: 'A', costCents: 1000 }, rene.id);
    const c = store.createCard(b.id, { columnId: open.id, title: 'B', costCents: 2500 }, rene.id);
    store.createCard(b.id, { columnId: open.id, title: 'C' }, rene.id);
    expect(store.getBoardView(b.id).costTotalCents).toBe(3500);
    store.deleteCard(c.id);
    expect(store.getBoardView(b.id).costTotalCents).toBe(1000);
  });
});

describe('Kommentare', () => {
  it('legt Kommentare mit Autor und Zeit an, zählt sie und löscht sie', () => {
    const { b, open } = setup();
    const card = store.createCard(b.id, { columnId: open.id, title: 'A' }, rene.id);
    const c1 = store.addComment(card.id, conny.id, ' Ruf bitte an ');
    now = new Date('2026-10-30T11:00:00Z');
    store.addComment(card.id, rene.id, 'Mach ich');
    expect(store.listComments(card.id).map((c) => [c.authorName, c.text])).toEqual([
      ['Conny', 'Ruf bitte an'],
      ['Rene', 'Mach ich'],
    ]);
    expect(store.getBoardView(b.id).cards[0]?.commentCount).toBe(2);
    store.deleteComment(c1.id);
    expect(store.listComments(card.id)).toHaveLength(1);
    expect(() => store.addComment(card.id, rene.id, '  ')).toThrow(ValidationError);
    expect(() => store.deleteComment('nope')).toThrow(NotFoundError);
  });

  it('bearbeiten setzt die Bearbeitungszeit', () => {
    const { b, open } = setup();
    const card = store.createCard(b.id, { columnId: open.id, title: 'A' }, rene.id);
    const c = store.addComment(card.id, rene.id, 'alt');
    now = new Date('2026-10-30T12:00:00Z');
    const upd = store.updateComment(c.id, 'neu');
    expect(upd).toMatchObject({ text: 'neu', editedAt: '2026-10-30T12:00:00.000Z' });
  });
});

describe('Einstellungen', () => {
  it('speichert und liest Werte, mit Vorgaben', () => {
    expect(store.getSettings()).toEqual({ dashboardPath: null, panelPath: null, defaultDueTime: '09:00', dailySummaryTime: null });
    store.setSettings({ dashboardPath: '/dashboard-handy/start', panelPath: '/c552c524_stups' });
    expect(store.getSettings()).toEqual({ dashboardPath: '/dashboard-handy/start', panelPath: '/c552c524_stups', defaultDueTime: '09:00', dailySummaryTime: null });
    store.setSettings({ dashboardPath: null });
    expect(store.getSettings().dashboardPath).toBeNull();
    expect(store.getSettings().panelPath).toBe('/c552c524_stups');
  });

  it('Standard-Uhrzeit: Vorgabe 09:00, nur HH:MM, null stellt die Vorgabe wieder her', () => {
    expect(store.getSettings().defaultDueTime).toBe('09:00');
    store.setSettings({ defaultDueTime: '07:30' });
    expect(store.getSettings().defaultDueTime).toBe('07:30');
    for (const bad of ['24:00', '7:30', 'abc', '09:00:00', '']) expect(() => store.setSettings({ defaultDueTime: bad }), bad).toThrow(ValidationError);
    expect(store.getSettings().defaultDueTime).toBe('07:30');
    store.setSettings({ defaultDueTime: null });
    expect(store.getSettings().defaultDueTime).toBe('09:00');
  });

  it('verlangt Pfade, die mit / beginnen', () => {
    expect(() => store.setSettings({ dashboardPath: 'https://evil.example' })).toThrow(ValidationError);
    expect(() => store.setSettings({ panelPath: '//evil.example' })).toThrow(ValidationError);
  });
});

describe('Benachrichtigungs-Hilfen', () => {
  it('openDueCards liefert nur offene Karten mit Fälligkeit und zugewiesenen Personen', () => {
    const { b, open, done } = setup();
    const a = store.createCard(
      b.id,
      { columnId: open.id, title: 'A', dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id] },
      rene.id,
    );
    store.createCard(b.id, { columnId: open.id, title: 'ohne Datum', assigneeIds: [rene.id] }, rene.id);
    const erledigt = store.createCard(
      b.id,
      { columnId: open.id, title: 'erledigt', dueAt: '2026-11-01T09:00:00Z', assigneeIds: [rene.id] },
      rene.id,
    );
    store.completeCard(erledigt.id, { by: rene.id, source: 'app' });
    const geloescht = store.createCard(b.id, { columnId: done.id, title: 'x', dueAt: '2026-11-01T09:00:00Z' }, rene.id);
    store.deleteCard(geloescht.id);

    const due = store.openDueCards();
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ id: a.id, title: 'A', boardName: 'Haushalt', assigneeIds: [conny.id] });
  });

  it('claimNotification ist atomar und wird durch release wieder frei', () => {
    const key = { cardId: 'c1', userId: 'u1', kind: 'due' as const, key: '2026-11-01T09:00:00.000Z' };
    expect(store.claimNotification(key)).toBe(true);
    expect(store.claimNotification(key)).toBe(false);
    store.releaseNotification(key);
    expect(store.claimNotification(key)).toBe(true);
    expect(store.claimNotification({ ...key, key: 'anderer-termin' })).toBe(true);
  });

  it('userByHaId findet den Nutzer', () => {
    expect(store.userByHaId('ha-conny')?.id).toBe(conny.id);
    expect(store.userByHaId('unbekannt')).toBeNull();
  });
});
