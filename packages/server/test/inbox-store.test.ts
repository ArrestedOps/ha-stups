import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { createStore, type Store } from '../src/store.js';

/** Der Posteingang je Person: feste Uhr (UTC), Zeitpunkte als ISO */
let now: Date;
let db: DatabaseSync;
let store: Store;
let anna: string;
let ben: string;
let kim: string; // Kind, nur eigene Karten
let leo: string; // Kind, nur eigene Karten
let boardId: string;
let col: string;

const T = (hhmm: string, day = '2026-11-04') => `${day}T${hhmm}:00.000Z`;
const at = (iso: string) => {
  now = new Date(iso);
};

beforeEach(() => {
  now = new Date(T('10:00'));
  db = openDb(':memory:');
  store = createStore(db, { now: () => now, timeZone: () => 'Europe/Berlin' });
  store.syncPeople([{ name: 'Anna', notify: ['svc_anna'] }, { name: 'Ben', notify: ['svc_ben'] }, { name: 'Kim', notify: ['svc_kim'] }, { name: 'Leo', notify: ['svc_leo'] }]);
  const id = (n: string) => store.people().find((p) => p.name === n)!.id;
  anna = id('Anna');
  ben = id('Ben');
  kim = id('Kim');
  leo = id('Leo');
  store.setChild(kim, { isChild: true, childScope: 'assigned' });
  store.setChild(leo, { isChild: true, childScope: 'assigned' });
  const b = store.createBoard({ name: 'Haushalt' });
  boardId = b.id;
  const cols = store.getBoardView(b.id).columns;
  col = cols[0]!.id;
  // Alle Personen haben einen Marker weit in der Vergangenheit, damit die Fenster-Regel greift
  db.prepare("update users set inbox_seen_at = '2026-10-01T00:00:00.000Z'").run();
});

const card = (extra: object = {}, by = anna) => store.createCard(boardId, { columnId: col, title: 'Bad putzen', ...extra }, by);
const items = (u: string, o: { confirmAll?: boolean; before?: string | null } = {}) => store.inbox(u, o).items;

function watcher(cardId: string | null, assigned: string[], result = 'created', atIso = T('09:00')): string {
  db.prepare("insert or ignore into watchers (id, name, trigger_json, card_json, assign_json, created_at, updated_at) values ('w1', 'Waschmaschine', '{}', '{}', '{}', ?, ?)").run(T('00:00'), T('00:00'));
  const id = `r${Math.random()}`;
  db.prepare('insert into watcher_runs (id, watcher_id, at, result, card_id, assigned_to) values (?, ?, ?, ?, ?, ?)').run(id, 'w1', atIso, result, cardId, JSON.stringify(assigned));
  return id;
}

describe('Posteingang: was wer sieht', () => {
  it('Stups an mich: erscheint bei mir, nicht beim Absender und nicht bei Dritten', () => {
    const c = card({ assigneeIds: [ben] });
    at(T('10:05'));
    store.createNudges(c.id, anna, { to: [ben], template: 'today' });
    const e = items(ben)[0]!;
    expect(e).toMatchObject({ kind: 'nudge', actorId: anna, cardId: c.id, cardTitle: 'Bad putzen', text: 'Heute noch?', detail: 'today', at: T('10:05') });
    expect(items(anna).filter((i) => i.kind === 'nudge')).toEqual([]);
    expect(items(kim)).toEqual([]);
  });

  it('ein gehaltener Stups (Ruhezeit) erscheint erst, wenn er ankommt', () => {
    const c = card({ assigneeIds: [ben] });
    store.createNudges(c.id, anna, { to: [ben], template: 'think' });
    db.prepare('update nudges set deliver_at = ?').run(T('11:00'));
    expect(items(ben)).toEqual([]);
    at(T('11:00'));
    expect(items(ben)[0]).toMatchObject({ kind: 'nudge', at: T('11:00') });
  });

  it('Antwort auf meinen Stups: nur „Mach ich", bei mir als Absender', () => {
    const c = card({ assigneeIds: [ben] });
    const r = store.createNudges(c.id, anna, { to: [ben], template: 'think' });
    at(T('10:30'));
    store.replyNudge(r.sent[0]!.nudgeId, ben, 'ack');
    expect(items(anna)).toEqual([expect.objectContaining({ kind: 'reply', actorId: ben, detail: 'ack', at: T('10:30') })]);
    expect(items(ben).map((i) => i.kind)).toEqual(['nudge']); // er sieht den Stups, nicht seine eigene Antwort
  });

  it('geschlossene und mit „Erledigt" beantwortete Stupse sind keine Antwort (die Erledigung steht einzeln da)', () => {
    const c = card({ assigneeIds: [ben] });
    store.createNudges(c.id, anna, { to: [ben], template: 'think' });
    store.completeCard(c.id, { by: ben, source: 'app' });
    expect(items(anna).map((i) => i.kind)).toEqual(['done']);
    const d = card({ assigneeIds: [ben], title: 'Zu' });
    store.createNudges(d.id, anna, { to: [ben], template: 'think' });
    store.completeCard(d.id, { by: null, source: 'app' });
    expect(items(anna).map((i) => i.kind)).not.toContain('reply');
  });

  it('Erledigung und Kommentar anderer auf meiner Karte; eigene Taten nicht', () => {
    const c = card({ assigneeIds: [anna] });
    at(T('10:10'));
    store.addComment(c.id, ben, 'Elektriker kommt erst am 3. Februar');
    store.addComment(c.id, anna, 'Danke');
    at(T('10:20'));
    store.completeCard(c.id, { by: ben, source: 'app' });
    expect(items(anna).map((i) => [i.kind, i.actorId])).toEqual([['done', ben], ['comment', ben]]);
    expect(items(anna)[1]!.text).toBe('Elektriker kommt erst am 3. Februar');
    // eigene Erledigung: nichts
    const d = card({ assigneeIds: [anna] }, anna);
    at(T('10:30'));
    store.completeCard(d.id, { by: anna, source: 'app' });
    expect(items(anna).filter((i) => i.cardId === d.id)).toEqual([]);
  });

  it('Kommentare werden gekürzt', () => {
    const c = card({ assigneeIds: [anna] });
    store.addComment(c.id, ben, 'x'.repeat(300));
    expect(items(anna)[0]!.text!.length).toBe(140);
    expect(items(anna)[0]!.text!.endsWith('…')).toBe(true);
  });

  it('Karten anderer, ohne Bezug zu mir, erscheinen nicht', () => {
    const c = card({ assigneeIds: [ben] }, ben);
    store.addComment(c.id, kim, 'Hallo');
    store.createNudges(c.id, ben, { to: [kim], template: 'think' });
    store.completeCard(c.id, { by: kim, source: 'app' });
    expect(items(anna)).toEqual([]);
  });

  it('eine Karte, die ich angelegt oder an der ich gestupst habe, gehört dazu', () => {
    const own = card({ assigneeIds: [ben] }, anna);
    const nudged = card({ assigneeIds: [ben], title: 'Fenster' }, ben);
    store.createNudges(nudged.id, anna, { to: [ben], template: 'think' });
    store.addComment(own.id, ben, 'a');
    store.addComment(nudged.id, ben, 'b');
    expect(items(anna).filter((i) => i.kind === 'comment').map((i) => i.cardId).sort()).toEqual([own.id, nudged.id].sort());
  });

  it('Erinnerungen: nur gesendete, nur meine; Zusammenfassungen ohne Karte nicht', () => {
    const c = card({ assigneeIds: [anna] });
    at(T('10:40'));
    store.claimNotification({ cardId: c.id, userId: anna, kind: 'nag', key: 'k1' });
    store.claimNotification({ cardId: c.id, userId: anna, kind: 'due', key: 'k2' }, 'skipped');
    store.claimNotification({ cardId: c.id, userId: ben, kind: 'nag', key: 'k3' });
    store.claimNotification({ cardId: 'ohne-karte', userId: anna, kind: 'summary', key: 'k4' });
    expect(items(anna).map((i) => [i.kind, i.detail, i.dueAt])).toEqual([['reminder', 'nag', null]]);
  });

  it('Änderungen anderer an meiner Karte: verschoben, wieder geöffnet; eigene nicht', () => {
    const c = card({ assigneeIds: [anna] });
    at(T('10:15'));
    const läuft = store.addColumn(boardId, { name: 'Läuft' }).id;
    store.moveCard(c.id, { columnId: läuft }, ben);
    at(T('10:16'));
    store.moveCard(c.id, { columnId: col }, anna);
    at(T('10:17'));
    store.completeCard(c.id, { by: anna, source: 'app' });
    at(T('10:18'));
    store.moveCard(c.id, { columnId: col }, ben); // wieder geöffnet
    const kinds = items(anna).filter((i) => i.kind === 'change').map((i) => [i.actorId, i.detail]);
    expect(kinds).toEqual([[ben, 'reopened'], [ben, 'moved']]);
    expect(kinds.every(([who]) => who !== anna)).toBe(true);
  });

  it('Wächter: Karte für mich, noch niemandem zugewiesene nur für Erwachsene, fremde nie', () => {
    const mineCard = card({ assigneeIds: [anna] });
    const open = card({ title: 'Wäsche', assigneeIds: [] });
    const other = card({ title: 'Müll', assigneeIds: [ben] });
    watcher(mineCard.id, [anna], 'created', T('09:01'));
    watcher(open.id, [], 'suggested', T('09:02'));
    watcher(other.id, [ben], 'created', T('09:03'));
    expect(items(anna).map((i) => [i.cardTitle, i.assigned, i.watcherName, i.detail])).toEqual([
      ['Wäsche', false, 'Waschmaschine', 'suggested'],
      ['Bad putzen', true, 'Waschmaschine', 'created'],
    ]);
    expect(items(ben).map((i) => i.cardTitle)).toEqual(['Müll', 'Wäsche']);
    expect(items(kim)).toEqual([]);
  });

  it('Bitte um Bestätigung: Erwachsene mit Recht, nie das Kind, nie ohne Recht', () => {
    store.setChild(kim, { confirmers: [anna] });
    const c = card({ assigneeIds: [kim] });
    at(T('10:50'));
    store.requestConfirmation(c.id, kim);
    expect(items(anna)).toEqual([expect.objectContaining({ kind: 'confirm', actorId: kim, cardId: c.id, at: T('10:50') })]);
    expect(items(ben)).toEqual([]); // Kim hat Anna gewählt
    expect(items(ben).length).toBe(0);
    expect(store.inbox(ben, { confirmAll: true }).items.map((i) => i.kind)).toEqual(['confirm']);
    expect(items(kim).map((i) => i.kind)).not.toContain('confirm');
  });
});

describe('Posteingang: Kind sieht nur Eigenes', () => {
  it('fremde Karten, fremde Boards und fremde Wächter-Karten erscheinen nie', () => {
    const second = store.createBoard({ name: 'Garten' });
    const col2 = store.getBoardView(second.id).columns[0]!.id;
    const own = card({ assigneeIds: [kim], title: 'Zimmer' });
    const foreign = store.createCard(second.id, { columnId: col2, title: 'Rasen', assigneeIds: [leo] }, anna);
    const noOne = card({ title: 'Ohne Zuweisung' }, kim); // vom Kind angelegt, aber niemandem zugewiesen
    for (const c of [own, foreign, noOne]) {
      store.addComment(c.id, anna, `Zu ${c.title}`);
      store.createNudges(c.id, anna, { to: [kim], template: 'think' });
      store.completeCard(c.id, { by: anna, source: 'app' });
      watcher(c.id, [kim], 'created');
      watcher(c.id, [], 'suggested');
      store.claimNotification({ cardId: c.id, userId: kim, kind: 'nag', key: c.id });
    }
    const mine = items(kim);
    expect(mine.length).toBeGreaterThan(0);
    expect([...new Set(mine.map((i) => i.cardId))]).toEqual([own.id]);
    expect(mine.map((i) => i.kind)).not.toContain('confirm');
    // das zweite Kind sieht nur seine Rasen-Karte, nichts von den anderen
    expect([...new Set(items(leo).map((i) => i.cardId))]).toEqual([foreign.id]);
  });

  it('ein Wächter-Lauf ohne Zuweisung zeigt dem Kind nichts', () => {
    const c = card({ assigneeIds: [] });
    watcher(c.id, [], 'suggested');
    expect(items(kim)).toEqual([]);
  });
});

describe('Posteingang: gelöscht, archiviert, Fenster, Reihenfolge', () => {
  it('gelöschte Karten und Boards im Papierkorb fallen weg, archivierte bleiben', () => {
    const gone = card({ assigneeIds: [anna], title: 'Weg' });
    const kept = card({ assigneeIds: [anna], title: 'Archiv' });
    store.addComment(gone.id, ben, 'a');
    store.addComment(kept.id, ben, 'b');
    store.deleteCard(gone.id);
    store.setArchived(kept.id, true);
    expect(items(anna).map((i) => i.cardTitle)).toEqual(['Archiv']);
    store.deleteBoard(boardId);
    expect(items(anna)).toEqual([]);
  });

  it('nur 14 Tage; „before" blättert; höchstens 100 mit hasMore', () => {
    const c = card({ assigneeIds: [anna] });
    at(T('10:00', '2026-10-15')); // 20 Tage vor dem 4.11.
    store.addComment(c.id, ben, 'alt');
    at(T('10:00', '2026-10-25')); // 10 Tage
    store.addComment(c.id, ben, 'neu');
    at(T('10:00'));
    expect(items(anna).map((i) => i.text)).toEqual(['neu']);
    expect(items(anna, { before: T('10:00', '2026-10-25') })).toEqual([]);

    for (let i = 0; i < 120; i++) db.prepare('insert into comments (id, card_id, author_id, text, created_at) values (?, ?, ?, ?, ?)').run(`c${i}`, c.id, ben, `t${i}`, new Date(Date.parse(T('09:00')) - i * 1000).toISOString());
    const r = store.inbox(anna);
    expect(r.items).toHaveLength(100);
    expect(r.hasMore).toBe(true);
    const next = store.inbox(anna, { before: r.items[99]!.at });
    expect(next.items.length).toBeGreaterThan(0);
    expect(next.items.every((i) => i.at < r.items[99]!.at)).toBe(true);
  });

  it('neueste zuerst, bei gleicher Zeit stabil nach Kennung', () => {
    const c = card({ assigneeIds: [anna] });
    for (const id of ['a', 'c', 'b']) db.prepare('insert into comments (id, card_id, author_id, text, created_at) values (?, ?, ?, ?, ?)').run(id, c.id, ben, id, T('09:00'));
    db.prepare('insert into comments (id, card_id, author_id, text, created_at) values (?, ?, ?, ?, ?)').run('z', c.id, ben, 'z', T('09:30'));
    expect(items(anna).map((i) => i.id)).toEqual(['comment:z', 'comment:c', 'comment:b', 'comment:a']);
    expect(items(anna).map((i) => i.id)).toEqual(items(anna).map((i) => i.id)); // zweimal gleich
  });

  it('Gelesen-Marker: kommt mit, „Alle gelesen" setzt jetzt und geht nie zurück', () => {
    expect(store.inbox(anna).seenAt).toBe('2026-10-01T00:00:00.000Z');
    expect(store.markInboxSeen(anna)).toBe(T('10:00'));
    at(T('09:00')); // die Uhr geht zurück: der Marker nicht
    expect(store.markInboxSeen(anna)).toBe(T('10:00'));
    expect(store.inbox(anna).seenAt).toBe(T('10:00'));
    expect(store.inbox(ben).seenAt).toBe('2026-10-01T00:00:00.000Z'); // pro Person
  });

  it('unbekannte Person: leer, kein Fehler', () => {
    expect(store.inbox('gibt-es-nicht')).toEqual({ items: [], seenAt: null, hasMore: false });
  });
});

describe('Posteingang: Indexe', () => {
  it('die Abfragen nutzen die Indexe der Migration 23 statt die Tabelle zu durchlaufen', () => {
    const plan = (sql: string) => (db.prepare(`explain query plan ${sql}`).all() as { detail: string }[]).map((r) => r.detail).join(' | ');
    expect(plan("select * from nudges where to_user = 'x' and created_at >= 'a'")).toMatch(/ix_nudges_to/);
    expect(plan("select * from nudges where from_user = 'x' and reply_at >= 'a'")).toMatch(/ix_nudges_from/);
    expect(plan("select * from comments where created_at >= 'a'")).toMatch(/ix_comments_at/);
    expect(plan("select * from completions where completed_at >= 'a'")).toMatch(/ix_completions_at/);
    expect(plan("select * from watcher_runs where at >= 'a'")).toMatch(/ix_watcher_runs_at/);
    expect(plan("select * from card_events where at >= 'a'")).toMatch(/ix_card_events_at/);
    expect(plan("select * from sent_notifications where user_id = 'x' and sent_at >= 'a'")).toMatch(/ix_sent_user_at/);
  });
});
