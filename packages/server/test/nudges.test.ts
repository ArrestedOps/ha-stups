import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { ConflictError, ForbiddenError, ValidationError } from '../src/errors.js';
import { migrations } from '../src/migrations.js';
import { createStore, NUDGE_TEMPLATES, type ClosedNudge, type Store } from '../src/store.js';

let now: Date;
let store: Store;
let closed: ClosedNudge[];
let rene: { id: string };
let conny: { id: string };
let gast: { id: string };
let boardId: string;
let openCol: string;

const at = (iso: string) => {
  now = new Date(iso);
};

beforeEach(() => {
  now = new Date('2026-11-04T10:00:00Z'); // 11:00 Berlin
  closed = [];
  store = createStore(openDb(':memory:'), {
    now: () => now,
    timeZone: () => 'Europe/Berlin',
    onNudgesClosed: (list) => closed.push(...list),
  });
  store.syncPeople([{ name: 'Rene', notify: ['svc_rene'] }, { name: 'Conny', notify: ['svc_conny'] }, { name: 'Gast' }]);
  rene = store.resolveUser({ haId: 'ha-rene', name: 'rene', displayName: 'Rene' });
  conny = store.resolveUser({ haId: 'ha-conny', name: 'conny', displayName: 'Conny' });
  gast = store.people().find((p) => p.name === 'Gast')!;
  const b = store.createBoard({ name: 'Haushalt' });
  boardId = b.id;
  openCol = store.getBoardView(b.id).columns[0]!.id;
});

const card = (extra: object = {}) => store.createCard(boardId, { columnId: openCol, title: 'Mülltonne raus', ...extra }, rene.id);

describe('Stups anlegen', () => {
  it('legt einen Stups je Empfänger an und zeigt ihn an der Aufgabe', () => {
    const c = card();
    const r = store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' });
    expect(r.skipped).toEqual([]);
    expect(r.sent).toEqual([{ nudgeId: expect.any(String), to: conny.id, status: 'sent', deliverAt: now.toISOString() }]);
    expect(store.getCard(c.id).openNudges).toEqual([{ id: r.sent[0]!.nudgeId, fromId: rene.id, toId: conny.id, delivered: false }]);
    expect(store.getBoardView(boardId).cards[0]!.openNudges).toHaveLength(1);
  });

  it('die Schnellauswahl hat vier Texte, ein eigener Text ersetzt sie', () => {
    expect(NUDGE_TEMPLATES).toEqual({
      think: 'Denkst du dran?',
      today: 'Heute noch?',
      help: 'Brauch deine Hilfe',
      thanks: 'Danke dir! ❤️',
    });
    const c = card();
    const a = store.createNudges(c.id, rene.id, { to: [conny.id], template: 'help' });
    expect(store.getNudge(a.sent[0]!.nudgeId)).toMatchObject({ template: 'help', text: 'Brauch deine Hilfe' });
    at('2026-11-04T11:00:00Z');
    const b = store.createNudges(c.id, rene.id, { to: [conny.id], template: 'help', text: '  Bitte vor 18 Uhr  ' });
    expect(store.getNudge(b.sent[0]!.nudgeId)).toMatchObject({ template: null, text: 'Bitte vor 18 Uhr' });
  });

  it('prüft die Nachricht', () => {
    const c = card();
    const go = (input: object) => () => store.createNudges(c.id, rene.id, { to: [conny.id], ...input });
    expect(go({})).toThrow(ValidationError);
    expect(go({ template: 'quatsch' })).toThrow(ValidationError);
    expect(go({ text: '   ' })).toThrow(ValidationError);
    expect(go({ text: 'x'.repeat(121) })).toThrow(ValidationError);
    expect(() => store.createNudges(c.id, rene.id, { to: [], template: 'think' })).toThrow(ValidationError);
    expect(() => store.createNudges(c.id, rene.id, { to: 'conny' as never, template: 'think' })).toThrow(ValidationError);
    expect(go({ text: 'x'.repeat(120) })).not.toThrow();
  });

  it('nur Personen stupsen, nie sich selbst und nur Personen mit Push-Gerät', () => {
    const c = card();
    const outsider = store.resolveUser({ haId: 'ha-x', name: 'xaver', displayName: 'Xaver' });
    expect(() => store.createNudges(c.id, outsider.id, { to: [conny.id], template: 'think' })).toThrow(ForbiddenError);

    const r = store.createNudges(c.id, rene.id, { to: [rene.id, outsider.id, gast.id, conny.id], template: 'think' });
    expect(r.sent.map((s) => s.to)).toEqual([conny.id]);
    expect(r.skipped).toEqual([
      { to: rene.id, reason: 'self', retryAt: null },
      { to: outsider.id, reason: 'no_person', retryAt: null },
      { to: gast.id, reason: 'no_device', retryAt: null },
    ]);
  });

  it('eine erledigte Aufgabe lässt sich nicht stupsen', () => {
    const c = card();
    store.completeCard(c.id, { by: rene.id, source: 'app' });
    expect(() => store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' })).toThrow(ConflictError);
  });
});

describe('Sperrzeit (30 Minuten je Aufgabe, Absender und Empfänger)', () => {
  it('ein zweiter Stups innerhalb von 30 Minuten wird abgelehnt, mit dem Zeitpunkt, ab wann es wieder geht', () => {
    const c = card();
    store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' });
    at('2026-11-04T10:12:00Z');
    const r = store.createNudges(c.id, rene.id, { to: [conny.id], template: 'today' });
    expect(r.sent).toEqual([]);
    expect(r.skipped).toEqual([{ to: conny.id, reason: 'rate', retryAt: '2026-11-04T10:30:00.000Z' }]);
    at('2026-11-04T10:30:00Z');
    expect(store.createNudges(c.id, rene.id, { to: [conny.id], template: 'today' }).sent).toHaveLength(1);
  });

  it('gilt nur für dieselbe Aufgabe, denselben Absender und denselben Empfänger', () => {
    const c1 = card();
    const c2 = card({ title: 'Wäsche' });
    store.createNudges(c1.id, rene.id, { to: [conny.id], template: 'think' });
    expect(store.createNudges(c2.id, rene.id, { to: [conny.id], template: 'think' }).sent).toHaveLength(1);
    expect(store.createNudges(c1.id, conny.id, { to: [rene.id], template: 'think' }).sent).toHaveLength(1);
  });

  it('bei mehreren Empfängern gehen die erlaubten raus und für die anderen gibt es die Auskunft', () => {
    store.setNotifyServices(gast.id, ['svc_gast']);
    const c = card();
    store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' });
    const r = store.createNudges(c.id, rene.id, { to: [conny.id, gast.id], template: 'think' });
    expect(r.sent.map((s) => s.to)).toEqual([gast.id]);
    expect(r.skipped).toEqual([{ to: conny.id, reason: 'rate', retryAt: '2026-11-04T10:30:00.000Z' }]);
  });
});

describe('Ruhezeit des Empfängers', () => {
  it('in der Vorgabe-Ruhezeit (22:00 bis 07:00) wird der Stups zum Ende zugestellt', () => {
    at('2026-11-04T22:30:00Z'); // 23:30 Berlin
    const c = card();
    const r = store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' });
    expect(r.sent).toEqual([{ nudgeId: expect.any(String), to: conny.id, status: 'queued', deliverAt: '2026-11-05T06:00:00.000Z' }]);
    expect(store.dueNudges()).toEqual([]);
    at('2026-11-05T06:00:00Z');
    expect(store.dueNudges().map((n) => n.id)).toEqual([r.sent[0]!.nudgeId]);
  });

  it('jede Person hat ihre eigene Ruhezeit, auch abschaltbar', () => {
    at('2026-11-04T22:30:00Z');
    const c = card();
    store.setNudgeQuiet(conny.id, { off: true });
    expect(store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' }).sent[0]!.status).toBe('sent');

    at('2026-11-04T12:00:00Z'); // 13:00 Berlin
    store.setNudgeQuiet(rene.id, { start: '12:30', end: '14:00', off: false });
    const r = store.createNudges(c.id, conny.id, { to: [rene.id], template: 'think' });
    expect(r.sent[0]).toMatchObject({ status: 'queued', deliverAt: '2026-11-04T13:00:00.000Z' }); // 14:00 Berlin
  });

  it('prüft die Einstellung und zeigt sie an der Person', () => {
    expect(store.userById(conny.id)!.nudgeQuiet).toEqual({ start: '22:00', end: '07:00', off: false });
    const u = store.setNudgeQuiet(conny.id, { start: '21:30', end: '06:15' });
    expect(u.nudgeQuiet).toEqual({ start: '21:30', end: '06:15', off: false });
    expect(() => store.setNudgeQuiet(conny.id, { start: '25:00' })).toThrow(ValidationError);
    expect(() => store.setNudgeQuiet(conny.id, { end: 'früh' })).toThrow(ValidationError);
    expect(() => store.setNudgeQuiet(conny.id, { off: 'ja' as never })).toThrow(ValidationError);
    expect(store.people().find((p) => p.id === conny.id)!.nudgeQuiet.start).toBe('21:30');
  });
});

describe('Vorauswahl im Sheet', () => {
  it('Zuständige außer dem Absender sind vorausgewählt', () => {
    const c = card({ assigneeIds: [rene.id, conny.id] });
    const t = store.nudgeTargets(c.id, rene.id);
    expect(t.map((x) => [x.id, x.preselected, x.selectable])).toEqual([
      [conny.id, true, true],
      [gast.id, false, false],
    ]);
    expect(t.find((x) => x.id === gast.id)).toMatchObject({ reason: 'no_device' });
  });

  it('niemand oder nur der Absender zuständig: keine Vorauswahl, außer es gibt genau eine andere wählbare Person', () => {
    const c = card({ assigneeIds: [rene.id] });
    // Conny und Gast: Gast hat kein Gerät, also ist nur Conny wählbar → vorausgewählt
    expect(store.nudgeTargets(c.id, rene.id).filter((x) => x.preselected).map((x) => x.id)).toEqual([conny.id]);
    store.setNotifyServices(gast.id, ['svc_gast']);
    // zwei wählbare Personen: keine Vorauswahl
    expect(store.nudgeTargets(c.id, rene.id).filter((x) => x.preselected)).toEqual([]);
  });

  it('meldet Sperrzeit und Zustellzeit je Person', () => {
    const c = card({ assigneeIds: [conny.id] });
    store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' });
    at('2026-11-04T10:10:00Z');
    const t = store.nudgeTargets(c.id, rene.id).find((x) => x.id === conny.id)!;
    expect(t).toMatchObject({ selectable: false, reason: 'rate', retryAt: '2026-11-04T10:30:00.000Z' });

    at('2026-11-04T23:00:00Z');
    const t2 = store.nudgeTargets(card({ title: 'Neu' }).id, rene.id).find((x) => x.id === conny.id)!;
    expect(t2).toMatchObject({ selectable: true, deliverAt: '2026-11-05T06:00:00.000Z' });
  });
});

describe('Zustellung und Antworten', () => {
  it('die Zustellung lässt sich nur einmal vormerken und bei einem Fehler zurücknehmen', () => {
    const c = card();
    const id = store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' }).sent[0]!.nudgeId;
    expect(store.dueNudges()[0]).toMatchObject({ id, cardTitle: 'Mülltonne raus', fromId: rene.id, fromName: 'Rene', toId: conny.id, round: 0 });
    expect(store.claimNudge(id, 0)).toBe(true);
    expect(store.claimNudge(id, 0)).toBe(false);
    expect(store.dueNudges()).toEqual([]);
    expect(store.getCard(c.id).openNudges[0]!.delivered).toBe(true);
    store.releaseNudge(id, 0);
    expect(store.dueNudges()).toHaveLength(1);
  });

  it('„Mach ich" schließt den Stups, nur der Empfänger darf antworten', () => {
    const c = card();
    const id = store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' }).sent[0]!.nudgeId;
    expect(store.replyNudge(id, rene.id, 'ack').outcome).toBe('forbidden');
    const r = store.replyNudge(id, conny.id, 'ack');
    expect(r.outcome).toBe('ok');
    expect(store.getNudge(id)).toMatchObject({ reply: 'ack', replyAt: now.toISOString() });
    expect(store.getCard(c.id).openNudges).toEqual([]);
    expect(store.replyNudge(id, conny.id, 'ack').outcome).toBe('stale'); // schon beantwortet
    expect(store.dueNudges()).toEqual([]);
  });

  it('„Später" stellt in einer Stunde noch einmal zu, höchstens dreimal', () => {
    const c = card();
    const id = store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' }).sent[0]!.nudgeId;
    store.claimNudge(id, 0);

    for (let round = 1; round <= 3; round++) {
      const r = store.replyNudge(id, conny.id, 'later');
      expect(r.outcome).toBe('ok');
      expect(store.getNudge(id)).toMatchObject({ laterCount: round, reply: null, deliverAt: new Date(now.getTime() + 3_600_000).toISOString() });
      expect(store.dueNudges()).toEqual([]); // noch nicht
      at(new Date(now.getTime() + 3_600_000).toISOString());
      expect(store.dueNudges().map((n) => [n.id, n.round])).toEqual([[id, round]]);
      expect(store.claimNudge(id, round)).toBe(true);
    }
    expect(store.replyNudge(id, conny.id, 'later').outcome).toBe('stale'); // das vierte nicht mehr
    expect(store.getNudge(id)!.laterCount).toBe(3);
  });

  it('„Später" in die Ruhezeit hinein wird zum Ende der Ruhezeit zugestellt', () => {
    at('2026-11-04T20:30:00Z'); // 21:30 Berlin
    const c = card();
    const id = store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' }).sent[0]!.nudgeId;
    store.claimNudge(id, 0);
    store.replyNudge(id, conny.id, 'later'); // in einer Stunde wäre 22:30
    expect(store.getNudge(id)!.deliverAt).toBe('2026-11-05T06:00:00.000Z');
  });

  it('veraltete Antworten tun nichts: unbekannter Stups', () => {
    expect(store.replyNudge('gibt-es-nicht', conny.id, 'ack').outcome).toBe('stale');
  });
});

describe('Erledigen, Löschen und Entfernen schließt offene Stupse', () => {
  it('Erledigen schließt alle offenen Stupse der Aufgabe und meldet sie, wer erledigt hat steht dabei', () => {
    store.setNotifyServices(gast.id, ['svc_gast']);
    const c = card();
    const a = store.createNudges(c.id, rene.id, { to: [conny.id, gast.id], template: 'think' }).sent;
    store.completeCard(c.id, { by: conny.id, source: 'push' });

    expect(store.getNudge(a[0]!.nudgeId)).toMatchObject({ reply: 'done' }); // Conny hat selbst erledigt
    expect(store.getNudge(a[1]!.nudgeId)).toMatchObject({ reply: 'closed' });
    expect(closed.map((x) => [x.nudgeId, x.fromId, x.toId, x.byId, x.cardTitle])).toEqual([
      [a[0]!.nudgeId, rene.id, conny.id, conny.id, 'Mülltonne raus'],
      [a[1]!.nudgeId, rene.id, gast.id, conny.id, 'Mülltonne raus'],
    ]);
    expect(store.dueNudges()).toEqual([]);
  });

  it('Ziehen in „Erledigt" und die Wiederholung schließen ebenfalls', () => {
    const done = store.getBoardView(boardId).columns.find((x) => x.isDone)!;
    const c1 = card();
    const n1 = store.createNudges(c1.id, rene.id, { to: [conny.id], template: 'think' }).sent[0]!.nudgeId;
    store.moveCard(c1.id, { columnId: done.id }, rene.id);
    expect(store.getNudge(n1)!.reply).toBe('closed');

    const c2 = card({ title: 'Wiederkehrend', dueAt: '2026-11-04T09:00:00Z', recurrence: { type: 'fixed', freq: 'daily', every: 2 } });
    const n2 = store.createNudges(c2.id, rene.id, { to: [conny.id], template: 'think' }).sent[0]!.nudgeId;
    const res = store.completeCard(c2.id, { by: rene.id, source: 'app' });
    expect(store.getNudge(n2)!.reply).toBe('closed');
    expect(store.getCard(res.nextCardId!).openNudges).toEqual([]); // die neue Aufgabe beginnt ohne Stupse
  });

  it('Löschen und das Entfernen einer Person schließen leise, ohne Meldung', () => {
    const c1 = card();
    const n1 = store.createNudges(c1.id, rene.id, { to: [conny.id], template: 'think' }).sent[0]!.nudgeId;
    store.deleteCard(c1.id);
    expect(store.getNudge(n1)!.reply).toBe('closed');

    const c2 = card({ title: 'Zweite' });
    const n2 = store.createNudges(c2.id, rene.id, { to: [conny.id], template: 'think' }).sent[0]!.nudgeId;
    store.removePerson(conny.id);
    expect(store.getNudge(n2)!.reply).toBe('closed');
    expect(closed).toEqual([]);
  });

  it('Rückgängig öffnet die Aufgabe, geschlossene Stupse bleiben geschlossen', () => {
    const c = card();
    const id = store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' }).sent[0]!.nudgeId;
    const res = store.completeCard(c.id, { by: rene.id, source: 'app' });
    store.undoCompletion(res.completionId!);
    expect(store.getNudge(id)!.reply).toBe('closed');
    expect(store.dueNudges()).toEqual([]);
  });

  it('ein Stups auf eine nicht zugestellte, später erledigte Aufgabe wird nie zugestellt', () => {
    at('2026-11-04T22:30:00Z');
    const c = card();
    store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' });
    store.completeCard(c.id, { by: rene.id, source: 'app' });
    at('2026-11-05T07:00:00Z');
    expect(store.dueNudges()).toEqual([]);
  });
});

describe('Verlauf, Zähler und Übersicht', () => {
  it('der Verlauf der Aufgabe zeigt Stups, „Mach ich" und „Später"', () => {
    const c = card();
    const id = store.createNudges(c.id, rene.id, { to: [conny.id], text: 'Bitte heute' }).sent[0]!.nudgeId;
    at('2026-11-04T10:05:00Z');
    store.claimNudge(id, 0);
    store.replyNudge(id, conny.id, 'later');
    at('2026-11-04T11:10:00Z');
    store.claimNudge(id, 1);
    store.replyNudge(id, conny.id, 'ack');

    const a = store.getCard(c.id).activity.filter((x) => x.kind === 'nudged' || x.kind === 'nudge_reply');
    expect(a.map((x) => [x.kind, x.byName, x.to, x.text])).toEqual([
      ['nudge_reply', 'Conny', undefined, 'Mach ich'],
      ['nudge_reply', 'Conny', undefined, 'Später'],
      ['nudged', 'Rene', 'Conny', 'Bitte heute'],
    ]);
  });

  it('zählt offene Stupse gesamt und je Person', () => {
    const c = card();
    const id = store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' }).sent[0]!.nudgeId;
    store.createNudges(c.id, conny.id, { to: [rene.id], template: 'think' });
    expect(store.openNudgeCounts()).toEqual({ total: 2, byUser: { [conny.id]: 1, [rene.id]: 1 } });
    store.replyNudge(id, conny.id, 'ack');
    expect(store.openNudgeCounts().total).toBe(1);
  });

  it('die Übersicht nennt den Stand jedes Stupses', () => {
    const c = card();
    store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' });
    at('2026-11-04T22:30:00Z');
    const c2 = card({ title: 'Nachts' });
    store.createNudges(c2.id, rene.id, { to: [conny.id], template: 'today' });
    const list = store.recentNudges(10, null);
    expect(list.map((n) => [n.title, n.from, n.to, n.state])).toEqual([
      ['Nachts', 'Rene', 'Conny', 'wartet'],
      ['Mülltonne raus', 'Rene', 'Conny', 'offen'],
    ]);
    expect(list[0]!.deliverAt).toBe('2026-11-05T06:00:00.000Z');
  });
});

describe('Migration 9', () => {
  it('übernimmt eine Datenbank im Stand von Version 0.12 unverändert', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-mig-'));
    const file = join(dir, 'k.sqlite');
    const old = openDb(file, { migrations: migrations.filter((m) => m.version <= 8) });
    old.exec(`insert into users (id, name, display_name, is_person, color, created_at, notify_services) values ('u1','rene','Rene',1,'#fff','2026-01-01T00:00:00Z','["svc"]')`);
    old.close();

    const db = openDb(file, { backupDir: join(dir, 'backups') });
    const s = createStore(db, { timeZone: () => 'Europe/Berlin' });
    expect(s.people().map((p) => [p.name, p.notifyServices, p.nudgeQuiet])).toEqual([['rene', ['svc'], { start: '22:00', end: '07:00', off: false }]]);
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(migrations.at(-1)!.version);
    expect(() => new DatabaseSync(file).prepare('select count(*) from nudges').get()).not.toThrow();
    db.close();
  });
});
