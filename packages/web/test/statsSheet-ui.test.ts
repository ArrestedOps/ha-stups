import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StatsSheet from '../src/components/StatsSheet.svelte';
import PillButton from '../src/components/ui/PillButton.svelte';
import StatsBar from '../src/components/ui/StatsBar.svelte';
import { agenda } from '../src/lib/agenda.svelte';
import { i18n } from '../src/lib/i18n/index.svelte';
import type { ScheduleCard } from '../src/lib/schedule';
import { ui } from '../src/lib/store.svelte';

const html = (c: any, props: Record<string, unknown>) => render(c, { props }).body;
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const snip = (h: string) => createRawSnippet(() => ({ render: () => h }));

describe('StatsBar mit Auswahl', () => {
  const items = [
    { id: 'today', label: 'Heute fällig', value: 3 },
    { id: 'overdue', label: 'Überfällig', value: 1 },
    { id: 'done', label: 'Erledigt heute', value: 4 },
  ];
  it('jede Zelle ist ein Knopf mit Vorlese-Name „Bezeichnung, Zahl“', () => {
    const out = html(StatsBar, { label: 'Stand', items, onselect: () => undefined });
    expect(count(out, /<button/g)).toBe(3);
    for (const n of ['Heute fällig, 3', 'Überfällig, 1', 'Erledigt heute, 4']) expect(out).toContain(`aria-label="${n}"`);
    expect(out).not.toMatch(/<button[^>]*>[^]*<div/); // kein Block in einem Knopf
  });
  it('ohne onselect bleibt es eine reine Anzeige', () => {
    expect(count(html(StatsBar, { label: 'Stand', items }), /<button/g)).toBe(0);
  });
});

describe('PillButton', () => {
  it('34 px, Rundung 12; primär mit Verlauf', () => {
    const out = html(PillButton, { children: snip('Morgen') });
    expect(out).toContain('h-[34px]');
    expect(out).toContain('rounded-[12px]');
    expect(out).not.toContain('bg-accent-grad');
    expect(html(PillButton, { primary: true, children: snip('x') })).toContain('bg-accent-grad');
  });
});

// ---------- Blätter ----------
const TZ_NOW = Date.parse('2026-11-04T10:00:00Z'); // Mi 11:00 Berlin
const mk = (id: string, dueAt: string | null, extra: Partial<ScheduleCard> = {}): ScheduleCard =>
  ({ id, boardId: 'b', boardName: 'Haus', boardColor: null, title: id, dueAt, completedAt: null, assigneeIds: ['me'], categories: [], icon: null, iconColor: null, ...extra }) as unknown as ScheduleCard;

function seed(cards: ScheduleCard[], child = false) {
  agenda.open = cards.filter((c) => !c.completedAt);
  agenda.recentDone = cards.filter((c) => c.completedAt);
  agenda.loaded = true;
  ui.me = { id: 'me', displayName: 'Rene', isPerson: true } as never;
  ui.people = [ui.me!];
  ui.isChild = child;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TZ_NOW);
  i18n.lang = 'de';
});

describe('Blatt „Heute fällig“', () => {
  const cards = [
    mk('Bad putzen', '2026-11-04T17:00:00Z'),
    mk('Paket abholen', '2026-11-04T15:30:00Z'),
    mk('Müll rausbringen', '2026-11-04T06:00:00Z', { completedAt: '2026-11-04T06:42:00Z' }),
    mk('Fremd', '2026-11-04T17:00:00Z', { assigneeIds: ['x'] }),
  ];
  it('Zusammenfassung, Gruppen, Knopf unten', () => {
    seed(cards);
    const out = html(StatsSheet, { kind: 'today' });
    expect(out).toContain('3</span>');
    expect(out).toContain('Aufgaben für heute.');
    expect(out).toContain('1 davon schon erledigt, 2 offen.');
    expect(out).toContain('Bis heute Abend');
    expect(out).toContain('Schon erledigt');
    expect(out).toContain('um 06:42'); // die Zeitzone des Geräts (im Test UTC)
    expect(out.indexOf('Paket abholen')).toBeLessThan(out.indexOf('Bad putzen')); // nach Uhrzeit
    expect(out).not.toContain('Fremd');
    expect(out).toContain('In der Liste filtern');
    expect(out).toContain('„Bad putzen“ erledigen');
  });
  it('Einzahl', () => {
    seed([cards[0]!]);
    const out = html(StatsSheet, { kind: 'today' });
    expect(out).toContain('Aufgabe für heute.');
    expect(out).not.toContain('Schon erledigt');
  });
});

describe('Blatt „Überfällig“', () => {
  const cards = [mk('Fußmatte', '2026-11-02T09:00:00Z'), mk('Kabel', '2026-11-03T09:00:00Z'), mk('Später', '2026-11-04T17:00:00Z')];
  it('seit 2 Tagen / seit gestern, Morgen je Aufgabe, Sammel-Knöpfe, „In der Liste filtern“', () => {
    seed(cards);
    const out = html(StatsSheet, { kind: 'overdue' });
    expect(out).toContain('seit 2 Tagen');
    expect(out).toContain('seit gestern');
    expect(out).not.toContain('Später');
    expect(count(out, />Morgen</g)).toBe(2);
    for (const s of ['Alle auf heute', 'Alle auf morgen', 'Wochenende', 'In der Liste filtern']) expect(out).toContain(s);
    expect(out.indexOf('Fußmatte')).toBeLessThan(out.indexOf('Kabel'));
  });
  it('ein Kind sieht keine Verschiebeknöpfe', () => {
    seed(cards, true);
    const out = html(StatsSheet, { kind: 'overdue' });
    expect(out).toContain('seit 2 Tagen');
    for (const s of ['>Morgen<', 'Alle auf heute', 'Alle auf morgen', 'Wochenende']) expect(out).not.toContain(s);
    expect(out).toContain('„Fußmatte“ erledigen');
  });
  it('leer: freundlicher Text', () => {
    seed([]);
    expect(html(StatsSheet, { kind: 'overdue' })).toContain('Nichts überfällig 🎉');
  });
});

describe('Blatt „Heute erledigt“', () => {
  const done = (id: string, at: string) => mk(id, null, { completedAt: at });
  it('Ring „4 von 7“ (heute fällig + erledigt), Liste mit Uhrzeit und Rückgängig, Archiv öffnen', () => {
    const cards = [
      done('A', '2026-11-04T06:42:00Z'),
      done('B', '2026-11-04T07:15:00Z'),
      done('C', '2026-11-04T08:30:00Z'),
      done('D', '2026-11-04T09:05:00Z'),
      mk('o1', '2026-11-04T15:00:00Z'),
      mk('o2', '2026-11-04T16:00:00Z'),
      mk('o3', '2026-11-04T17:00:00Z'),
      done('gestern', '2026-11-03T12:00:00Z'),
    ];
    seed(cards);
    const out = html(StatsSheet, { kind: 'done' });
    expect(out).toContain('4 von 7 geschafft 👏');
    expect(out).toContain('3 Aufgaben sind noch offen.');
    expect(out).toContain('data-fraction="0.571"');
    expect(count(out, /wieder öffnen"/g)).toBe(4);
    expect(out).toContain('06:42');
    expect(out).not.toContain('>gestern<');
    expect(out).toContain('Archiv öffnen');
  });
  it('leer: „Heute noch nichts erledigt“', () => {
    seed([mk('o1', '2026-11-04T15:00:00Z')]);
    const out = html(StatsSheet, { kind: 'done' });
    expect(out).toContain('Heute noch nichts erledigt');
    expect(out).toContain('0 von 1 geschafft');
  });
  it('alles geschafft', () => {
    seed([done('A', '2026-11-04T06:42:00Z')]);
    expect(html(StatsSheet, { kind: 'done' })).toContain('Alles geschafft 🎉');
  });
  it('Englisch', () => {
    i18n.lang = 'en';
    seed([done('A', '2026-11-04T06:42:00Z'), mk('o1', '2026-11-04T15:00:00Z')]);
    const out = html(StatsSheet, { kind: 'done' });
    expect(out).toContain('1 of 2 done 👏');
    expect(out).toContain('Open archive');
    expect(out).toContain('Done today');
  });
});
