import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { createStore, type Store } from '../src/store.js';

// Fairness: wer erledigt wie viel? Alles mit fester Uhr in Europe/Berlin (Wochenbeginn Montag).
const TZ = 'Europe/Berlin';
let now: Date;
let store: Store;
let db: ReturnType<typeof openDb>;
let ben: string;
let anna: string;
let boardId: string;
let openId: string;

const at = (iso: string) => void (now = new Date(iso));
const card = (title: string, by: string, extra: Record<string, unknown> = {}) =>
  store.createCard(boardId, { columnId: openId, title, ...extra }, by);
const complete = (id: string, by: string) => store.completeCard(id, { by, source: 'app' });

beforeEach(() => {
  at('2026-11-04T09:00:00Z'); // Mi 10:00 Berlin
  db = openDb(':memory:');
  store = createStore(db, { now: () => now, timeZone: () => TZ });
  ben = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
  anna = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
  const b = store.createBoard({ name: 'Haushalt', withPlanned: true });
  boardId = b.id;
  openId = store.getBoardView(b.id).columns[0]!.id;
});

describe('Zeiträume', () => {
  it('Woche: Montag 00:00 bis zum nächsten Montag 00:00 (Ortszeit)', () => {
    const f = store.fairness('week');
    expect(f.period).toBe('week');
    expect(f.from).toBe('2026-11-01T23:00:00.000Z'); // Mo 2.11. 00:00 Berlin
    expect(f.to).toBe('2026-11-08T23:00:00.000Z'); // Mo 9.11. 00:00 Berlin
  });

  it('Monat: der Erste 00:00 bis zum Ersten des nächsten Monats', () => {
    const f = store.fairness('month');
    expect(f.from).toBe('2026-10-31T23:00:00.000Z');
    expect(f.to).toBe('2026-11-30T23:00:00.000Z');
  });

  it('die Woche der Zeitumstellung ist eine Stunde länger, die Grenzen bleiben Montag 00:00', () => {
    at('2026-10-21T10:00:00Z'); // Mi vor der Umstellung am Sonntag 25.10.
    const f = store.fairness('week');
    expect(f.from).toBe('2026-10-18T22:00:00.000Z'); // Mo 19.10. 00:00 (Sommerzeit, +2)
    expect(f.to).toBe('2026-10-25T23:00:00.000Z'); // Mo 26.10. 00:00 (Winterzeit, +1)
  });

  it('an einem Sonntag gehört der Tag noch zur laufenden Woche, am Montag beginnt die nächste', () => {
    at('2026-11-08T21:00:00Z'); // So 22:00 Berlin
    expect(store.fairness('week').from).toBe('2026-11-01T23:00:00.000Z');
    at('2026-11-08T23:00:00Z'); // Mo 00:00 Berlin
    expect(store.fairness('week').from).toBe('2026-11-08T23:00:00.000Z');
  });

  it('Jahreswechsel im Monat', () => {
    at('2026-12-31T20:00:00Z'); // 21:00 Berlin
    const f = store.fairness('month');
    expect(f.from).toBe('2026-11-30T23:00:00.000Z');
    expect(f.to).toBe('2026-12-31T23:00:00.000Z');
  });
});

describe('Zählen', () => {
  it('erledigte Karten und Aufwand je Person, in der Reihenfolge der Personenliste', () => {
    complete(card('Klein', ben, { effort: 'small' }).id, ben);
    complete(card('Groß', ben, { effort: 'large' }).id, ben);
    complete(card('Ohne Angabe', anna).id, anna); // zählt wie mittel
    const f = store.fairness('week');
    expect(f.people.map((p) => p.name)).toEqual(['Ben', 'Anna']);
    expect(f.people[0]).toMatchObject({ id: ben, done: 2, effort: 4 });
    expect(f.people[1]).toMatchObject({ id: anna, done: 1, effort: 2 });
    expect(f.total).toMatchObject({ done: 3, effort: 6 });
  });

  it('die Grenzen: Sonntag 23:59 zählt zur alten, Montag 00:00 zur neuen Woche', () => {
    const a = card('Alt', ben);
    const b = card('Neu', ben);
    at('2026-11-01T22:59:00Z'); // So 1.11. 23:59 Berlin
    complete(a.id, ben);
    at('2026-11-01T23:00:00Z'); // Mo 2.11. 00:00 Berlin
    complete(b.id, ben);
    at('2026-11-04T09:00:00Z');
    expect(store.fairness('week').people[0]!.done).toBe(1);
    expect(store.fairness('month').people[0]!.done).toBe(2); // beide im November
  });

  it('der Monat zählt auch früher im Monat, die Woche nicht', () => {
    const early = card('Früh', ben);
    at('2026-11-02T10:00:00Z');
    complete(early.id, ben);
    at('2026-11-12T10:00:00Z'); // nächste Woche
    const f = store.fairness('week');
    expect(f.people[0]!.done).toBe(0);
    expect(store.fairness('month').people[0]!.done).toBe(1);
  });

  it('ein zurückgenommenes Erledigen zählt nicht', () => {
    const c = card('Müll', ben);
    const done = complete(c.id, ben);
    expect(store.fairness('week').people[0]!.done).toBe(1);
    store.undoCompletion(done.completionId!);
    expect(store.fairness('week').people[0]!.done).toBe(0);
  });

  it('angelegte Karten: nur von Hand angelegte (keine Wiederholungen, keine Wächter-Karten)', () => {
    card('Von Hand', ben);
    const rec = card('Wöchentlich', ben, { dueAt: '2026-11-04T08:00:00.000Z', recurrence: { type: 'after_completion', every: 1, unit: 'weeks' } });
    complete(rec.id, ben); // legt die nächste Karte an: zählt nicht als angelegt
    const watcher = card('Vom Wächter', anna);
    db.prepare('update cards set watcher_id = ? where id = ?').run('w1', watcher.id);
    const f = store.fairness('week');
    expect(f.people[0]!.created).toBe(2); // „Von Hand" und „Wöchentlich"
    expect(f.people[1]!.created).toBe(0); // die Wächter-Karte gehört nicht dazu
  });

  it('beantwortete Stupse: „Mach ich" und „Erledigt" zählen, „Später" und „geschlossen" nicht', () => {
    store.setNotifyServices(ben, ['svc']);
    const c1 = card('A', anna);
    const c2 = card('B', anna);
    const c3 = card('C', anna);
    const n1 = store.createNudges(c1.id, anna, { to: [ben], template: 'think' }).sent[0]!.nudgeId;
    const n2 = store.createNudges(c2.id, anna, { to: [ben], template: 'think' }).sent[0]!.nudgeId;
    const n3 = store.createNudges(c3.id, anna, { to: [ben], template: 'think' }).sent[0]!.nudgeId;
    store.replyNudge(n1, ben, 'ack');
    store.replyNudge(n2, ben, 'later'); // zählt nicht
    complete(c3.id, anna); // schließt den Stups: reply = closed
    expect(store.fairness('week').people[0]!.nudgesAnswered).toBe(1);
    expect(n2 && n3).toBeTruthy();
  });

  it('übernommene Wächter-Karten: erledigte Karten eines Wächters', () => {
    const w = card('Waschmaschine ausräumen', ben);
    db.prepare('update cards set watcher_id = ? where id = ?').run('w1', w.id);
    complete(w.id, ben);
    complete(card('Normal', ben).id, ben);
    const f = store.fairness('week');
    expect(f.people[0]).toMatchObject({ done: 2, watcherCards: 1 });
  });

  it('nur Personen: entfernte und wartende Benutzer zählen nicht', () => {
    const c = card('A', ben);
    complete(c.id, ben);
    store.removePerson(ben);
    expect(store.fairness('week').people.map((p) => p.name)).toEqual(['Anna']);
    store.resolveUser({ haId: 'ha-gast', name: 'gast', displayName: 'Gast' }); // wartet auf Freigabe
    expect(store.fairness('week').people.map((p) => p.name)).toEqual(['Anna']);
  });

  it('Karten aus allen Boards zählen', () => {
    const other = store.createBoard({ name: 'Garten' });
    const col = store.getBoardView(other.id).columns[0]!.id;
    complete(store.createCard(other.id, { columnId: col, title: 'Rasen' }, ben).id, ben);
    complete(card('Müll', ben).id, ben);
    expect(store.fairness('week').people[0]!.done).toBe(2);
  });

  it('ohne Daten: alles null, keine Fehler', () => {
    const f = store.fairness('week');
    expect(f.total).toEqual({ done: 0, effort: 0, created: 0, nudgesAnswered: 0, watcherCards: 0 });
    expect(f.people.every((p) => p.done === 0 && p.effort === 0)).toBe(true);
  });
});
