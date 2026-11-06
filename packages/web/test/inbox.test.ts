import { beforeEach, describe, expect, it } from 'vitest';
import type { InboxEntry } from '../src/lib/api';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { chipOf, entryView, filterEntries, groupByDay, INBOX_CHIPS, isUnread, timeLabel, unreadCount } from '../src/lib/inbox';

// Feste Uhr: 4.11.2026 11:30 in Berlin (10:30 UTC). Der Rechner läuft in UTC, die App in Europe/Berlin.
const NOW = Date.parse('2026-11-04T10:30:00Z');
const TZ = 'Europe/Berlin';
const names: Record<string, string> = { ben: 'Ben', conny: 'Conny' };
const ctx = { nameOf: (id: string | null) => (id ? (names[id] ?? '?') : 'Jemand'), tz: TZ };

const e = (extra: Partial<InboxEntry> & Pick<InboxEntry, 'kind'>): InboxEntry => ({
  id: `${extra.kind}:1`,
  at: '2026-11-04T09:00:00.000Z',
  cardId: 'k1',
  cardTitle: 'Bad putzen',
  boardId: 'b1',
  actorId: 'conny',
  text: null,
  detail: null,
  watcherName: null,
  assigned: false,
  dueAt: null,
  watcherId: null,
  notice: null,
  ...extra,
});

beforeEach(() => setLanguage('de'));

describe('Gruppen nach Tag (Zeitzone der Person)', () => {
  const at = (iso: string, id = iso) => e({ kind: 'comment', id, at: iso });
  it.each([
    ['gerade eben', '2026-11-04T10:29:00Z', 'today'],
    ['kurz nach Mitternacht Berlin (23:30 UTC am Vortag) ist schon heute', '2026-11-03T23:30:00Z', 'today'],
    ['kurz vor Mitternacht Berlin (22:59 UTC am Vortag) ist noch gestern', '2026-11-03T22:59:00Z', 'yesterday'],
    ['gestern Nachmittag', '2026-11-03T15:00:00Z', 'yesterday'],
    ['vorgestern', '2026-11-02T12:00:00Z', 'older'],
    ['vor 10 Tagen', '2026-10-25T12:00:00Z', 'older'],
    ['in der Zukunft (Uhr geht falsch): heute', '2026-11-05T09:00:00Z', 'today'],
  ])('%s → %s', (_n, iso, key) => {
    expect(groupByDay([at(iso)], NOW, TZ).map((g) => g.key)).toEqual([key]);
  });

  it('Reihenfolge Heute, Gestern, Älter; leere fehlen; innerhalb bleibt die Reihenfolge des Servers', () => {
    const items = [at('2026-11-02T10:00:00Z', 'c'), at('2026-11-04T09:00:00Z', 'a'), at('2026-11-03T12:00:00Z', 'b'), at('2026-11-04T08:00:00Z', 'd')];
    const g = groupByDay(items, NOW, TZ);
    expect(g.map((x) => [x.key, x.items.map((i) => i.id)])).toEqual([['today', ['a', 'd']], ['yesterday', ['b']], ['older', ['c']]]);
    expect(groupByDay([], NOW, TZ)).toEqual([]);
  });

  it('Sommerzeitwechsel: am 26.10.2026 (Ende der Sommerzeit) bleiben die Tage Kalendertage', () => {
    const now = Date.parse('2026-10-26T12:00:00Z'); // 13:00 Berlin
    expect(groupByDay([at('2026-10-25T23:30:00Z')], now, TZ)[0]!.key).toBe('today'); // 00:30 Berlin (MESZ)... am 26.
    expect(groupByDay([at('2026-10-25T21:30:00Z')], now, TZ)[0]!.key).toBe('yesterday'); // 23:30 Berlin am 25.
  });
});

describe('Uhrzeit', () => {
  it('heute und gestern als Ortszeit, Älter mit Tag', () => {
    expect(timeLabel('2026-11-04T10:40:00Z', 'today', TZ)).toBe('11:40');
    expect(timeLabel('2026-11-03T19:14:00Z', 'yesterday', TZ)).toBe('20:14');
    expect(timeLabel('2026-10-29T10:00:00Z', 'older', TZ)).toBe('29. Okt');
    setLanguage('en');
    expect(timeLabel('2026-10-29T10:00:00Z', 'older', TZ)).toBe('29 Oct');
  });
});

describe('Ungelesen', () => {
  const items = [e({ kind: 'nudge', at: '2026-11-04T09:00:00.000Z' }), e({ kind: 'done', at: '2026-11-04T08:00:00.000Z' }), e({ kind: 'comment', at: '2026-11-03T08:00:00.000Z' })];
  it.each([
    [null, 3],
    ['2026-11-01T00:00:00.000Z', 3],
    ['2026-11-04T08:30:00.000Z', 1],
    ['2026-11-04T08:00:00.000Z', 1], // genau gleich: schon gelesen
    ['2026-11-04T09:00:00.000Z', 0],
    ['2026-11-05T00:00:00.000Z', 0],
  ])('Marker %s → %i ungelesen', (seen, n) => {
    expect(unreadCount(items, seen)).toBe(n);
    expect(items.filter((i) => isUnread(i, seen)).length).toBe(n);
  });
  it('ohne Einträge: 0', () => expect(unreadCount([], null)).toBe(0));
});

describe('Chips', () => {
  it('fünf Chips wie im Mockup', () => expect(INBOX_CHIPS).toEqual(['all', 'nudge', 'watcher', 'done', 'comment']));
  it('jede Art gehört zu einem Chip oder nur zu „Alle"', () => {
    expect(['nudge', 'reply', 'watcher', 'done', 'confirm', 'comment', 'reminder', 'change'].map((k) => chipOf(k as never))).toEqual(['nudge', 'nudge', 'watcher', 'done', 'done', 'comment', null, null]);
  });
  it('filtert', () => {
    const items = [e({ kind: 'nudge', id: 'n' }), e({ kind: 'reply', id: 'r' }), e({ kind: 'reminder', id: 'x' }), e({ kind: 'comment', id: 'c' })];
    expect(filterEntries(items, 'all')).toHaveLength(4);
    expect(filterEntries(items, 'nudge').map((i) => i.id)).toEqual(['n', 'r']);
    expect(filterEntries(items, 'comment').map((i) => i.id)).toEqual(['c']);
    expect(filterEntries(items, 'watcher')).toEqual([]);
  });
});

describe('Zusammenfassung eines Eintrags', () => {
  const v = (x: Partial<InboxEntry> & Pick<InboxEntry, 'kind'>) => entryView(e(x), ctx);
  it('Stups mit Vorlage (in der Sprache) und mit eigenem Text', () => {
    expect(v({ kind: 'nudge', detail: 'today', text: 'Heute noch?' })).toEqual({ title: 'Conny stupst dich 👋', meta: 'Bad putzen · „Heute noch?“', icon: 'hand', color: 'purple' });
    expect(v({ kind: 'nudge', detail: null, text: 'Bitte vor 18 Uhr' }).meta).toBe('Bad putzen · „Bitte vor 18 Uhr“');
    setLanguage('en');
    expect(v({ kind: 'nudge', detail: 'think', text: 'Denkst du dran?' }).meta).toBe('Bad putzen · “Are you on it?”');
    expect(v({ kind: 'nudge' }).title).toBe('Conny nudges you 👋');
  });
  it('Antwort, Erledigung, Kommentar', () => {
    expect(v({ kind: 'reply', actorId: 'ben', detail: 'ack' })).toEqual({ title: 'Ben: Mach ich 👍', meta: 'Antwort auf deinen Stups · Bad putzen', icon: 'user', color: 'teal' });
    expect(v({ kind: 'done', actorId: 'ben' })).toEqual({ title: 'Ben hat erledigt', meta: 'Bad putzen', icon: 'done', color: 'green' });
    expect(v({ kind: 'comment', text: 'Elektriker kommt erst am 3. Feb …' })).toEqual({ title: 'Conny hat kommentiert', meta: 'Bad putzen: „Elektriker kommt erst am 3. Feb …“', icon: 'message', color: 'blue' });
    expect(v({ kind: 'done', actorId: null }).title).toBe('Jemand hat erledigt');
  });
  it('Wächter: zugewiesen, sucht jemanden, weitergegeben, erinnert', () => {
    const w = { kind: 'watcher' as const, watcherName: 'Waschmaschine fertig', actorId: null, cardTitle: 'ausräumen' };
    expect(v({ ...w, assigned: true, detail: 'created' })).toEqual({ title: 'Wächter: Waschmaschine fertig', meta: 'Karte „ausräumen“ ist jetzt deine', icon: 'shield', color: 'orange' });
    expect(v({ ...w, assigned: false, detail: 'suggested' }).meta).toBe('„ausräumen“ sucht jemanden, der sie übernimmt');
    expect(v({ ...w, assigned: true, detail: 'passed' }).meta).toBe('Karte „ausräumen“ wurde dir weitergegeben');
    expect(v({ ...w, assigned: true, detail: 'nudged' }).meta).toBe('Karte „ausräumen“ wartet noch auf dich');
  });
  it('Erinnerungen: überfällig mit Wochentag seit dem Termin (Berlin), fällig, vorab', () => {
    // Montag 2.11.2026, 23:30 UTC = Dienstag 0:30 Berlin: Der Termin lag am Dienstag
    expect(v({ kind: 'reminder', detail: 'nag', dueAt: '2026-11-02T23:30:00Z', cardTitle: 'Netzwerkkabel' })).toEqual({ title: 'Überfällig', meta: 'Netzwerkkabel · seit Di', icon: 'alert', color: 'red' });
    expect(v({ kind: 'reminder', detail: 'nag', dueAt: null }).meta).toBe('Bad putzen');
    expect(v({ kind: 'reminder', detail: 'due' }).title).toBe('Jetzt fällig');
    expect(v({ kind: 'reminder', detail: 'reminder' }).title).toBe('Erinnerung');
    setLanguage('en');
    expect(v({ kind: 'reminder', detail: 'nag', dueAt: '2026-11-02T10:00:00Z', cardTitle: 'Cable' }).meta).toBe('Cable · since Mon');
  });
  it('Änderungen und Bitte um Bestätigung', () => {
    expect(v({ kind: 'change', detail: 'moved' }).title).toBe('Conny hat verschoben');
    expect(v({ kind: 'change', detail: 'reopened' }).title).toBe('Conny hat wieder geöffnet');
    expect(v({ kind: 'change', detail: 'due' }).title).toBe('Conny hat den Termin geändert');
    expect(v({ kind: 'confirm', actorId: 'ben' }).title).toBe('Ben wartet auf deine Bestätigung');
  });
});

describe('Mitteilungen zu Wächtern ohne Karte', () => {
  it('„braucht neue Zuständige": roter Eintrag mit dem Grund', () => {
    const v = entryView(
      e({ kind: 'watcher', cardId: '', cardTitle: '', detail: 'assignees_missing', watcherName: 'Heizung prüfen', watcherId: 'w1', notice: { boardName: 'Bad-Umbau', removedNames: ['Anna'], remainingNames: [] } }),
      ctx,
    );
    expect(v).toMatchObject({ title: 'Heizung prüfen braucht neue Zuständige', meta: 'Anna ist nicht mehr im Board „Bad-Umbau“', color: 'red' });
  });

  it('nur verkleinert: „Waschmaschine fertig: Anna entfernt", läuft weiter mit Rene', () => {
    const v = entryView(
      e({ kind: 'watcher', cardId: '', cardTitle: '', detail: 'shrunk', watcherName: 'Waschmaschine fertig', watcherId: 'w2', notice: { boardName: 'Bad-Umbau', removedNames: ['Anna'], remainingNames: ['Rene'] } }),
      ctx,
    );
    expect(v).toMatchObject({ title: 'Waschmaschine fertig: Anna entfernt', meta: 'läuft weiter mit Rene', color: 'purple' });
  });

  it('mehrere Namen, Englisch, und sie stehen unter dem Chip „Wächter"', () => {
    setLanguage('en');
    const entry = e({ kind: 'watcher', cardId: '', detail: 'assignees_missing', watcherName: 'Heating', watcherId: 'w1', notice: { boardName: 'Bath', removedNames: ['Anna', 'Ben'], remainingNames: [] } });
    expect(entryView(entry, ctx)).toMatchObject({ title: 'Heating needs new assignees', meta: 'Anna, Ben are no longer on the board “Bath”' });
    expect(filterEntries([entry], 'watcher')).toHaveLength(1);
  });
});
