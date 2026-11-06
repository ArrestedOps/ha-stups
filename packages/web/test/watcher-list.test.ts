import { beforeEach, describe, expect, it } from 'vitest';
import type { HomeItem } from '../src/lib/api';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import {
  COLLAPSE_KEY,
  categoryKeyOf,
  categoryOptions,
  groupOpen,
  loadCollapse,
  parseCollapse,
  rowStatus,
  saveCollapse,
  toggleGroup,
  triggerText,
  uncategorizedCount,
  watcherLayout,
  whoText,
} from '../src/lib/watcherList';

const item = (over: Partial<HomeItem> & { watcherId: string }): HomeItem => ({
  name: 'Wächter',
  subject: null,
  entity: 'sensor.x',
  value: null,
  phase: 'quiet',
  since: null,
  progress: null,
  nextCard: 'Karte',
  entityMissing: false,
  openCard: null,
  nextEvent: null,
  active: true,
  category: null,
  trigger: { entityId: 'sensor.x', kind: 'below', to: null, value: 20, forMin: 10, count: 1 },
  entityUnit: '%',
  lastFiredAt: null,
  lastAssigneeIds: [],
  assign: { mode: 'rotation_present', personIds: [] },
  ...over,
});

beforeEach(() => setLanguage('de'));

describe('watcherLayout: genau einmal, oben die aktuellen', () => {
  const items = [
    item({ watcherId: 'a', phase: 'waiting', since: '2026-11-04T09:00:00Z', category: 'Haushaltsgeräte' }),
    item({ watcherId: 'b', phase: 'running', since: '2026-11-04T08:00:00Z', category: 'Haushaltsgeräte' }),
    item({ watcherId: 'c', phase: 'soon', category: 'Müll & Abfall' }),
    item({ watcherId: 'd', phase: 'quiet', category: 'Haushaltsgeräte', name: 'Spülmaschine' }),
    item({ watcherId: 'e', phase: 'quiet', category: 'Batterien', name: 'Batterie A' }),
    item({ watcherId: 'f', phase: 'quiet', category: null, name: 'Ohne' }),
  ];
  it('Wartet, Läuft, Bald oben; alle übrigen stehen in ihrer Kategorie, niemand doppelt', () => {
    const l = watcherLayout(items);
    expect(l.waiting.map((i) => i.watcherId)).toEqual(['a']);
    expect(l.running.map((i) => i.watcherId)).toEqual(['b']);
    expect(l.soon.map((i) => i.watcherId)).toEqual(['c']);
    const inGroups = l.groups.flatMap((g) => g.items.map((i) => i.watcherId));
    expect(inGroups.sort()).toEqual(['d', 'e', 'f']);
    const all = [...l.waiting, ...l.running, ...l.soon, ...l.groups.flatMap((g) => g.items)].map((i) => i.watcherId);
    expect(new Set(all).size).toBe(items.length);
  });

  it('Kategorien alphabetisch, „Ohne Kategorie" (name null) ganz unten, leere Kategorien gibt es nicht', () => {
    const l = watcherLayout(items);
    expect(l.groups.map((g) => g.name)).toEqual(['Batterien', 'Haushaltsgeräte', null]);
    expect(l.groups.at(-1)!.key).toBe(categoryKeyOf(null));
  });

  it('gleiche Namen ohne Beachtung der Groß-/Kleinschreibung bilden eine Gruppe (die erste Schreibweise gilt)', () => {
    const l = watcherLayout([
      item({ watcherId: '1', name: 'B', category: 'garten' }),
      item({ watcherId: '2', name: 'A', category: 'Garten' }),
      item({ watcherId: '3', name: 'C', category: ' GARTEN ' }),
    ]);
    expect(l.groups).toHaveLength(1);
    expect(l.groups[0]!.name).toBe('Garten');
    expect(l.groups[0]!.items.map((i) => i.watcherId)).toEqual(['2', '1', '3']);
  });

  it('in der Gruppe nach Name, dann Gerät, stabil', () => {
    const mk = (id: string, name: string, subject: string | null) => item({ watcherId: id, name, subject, category: 'X' });
    const l = watcherLayout([mk('1', 'Batterie schwach', 'Z'), mk('2', 'Batterie schwach', 'A'), mk('3', 'Abfall', null)]);
    expect(l.groups[0]!.items.map((i) => i.watcherId)).toEqual(['3', '2', '1']);
    expect(watcherLayout([mk('3', 'Abfall', null), mk('2', 'Batterie schwach', 'A'), mk('1', 'Batterie schwach', 'Z')]).groups[0]!.items.map((i) => i.watcherId)).toEqual(['3', '2', '1']);
  });

  it('ausgeschaltete Wächter bleiben sichtbar, in ihrer Kategorie; wartet noch ihre Karte, steht sie oben', () => {
    const l = watcherLayout([
      item({ watcherId: 'off', active: false, category: 'A', phase: 'quiet' }),
      item({ watcherId: 'offwait', active: false, category: 'A', phase: 'waiting', since: '2026-11-04T09:00:00Z' }),
      // ein Server, der es falsch schickt: „läuft" ohne aktiv gilt nicht
      item({ watcherId: 'offrun', active: false, category: 'A', phase: 'running' }),
    ]);
    expect(l.waiting.map((i) => i.watcherId)).toEqual(['offwait']);
    expect(l.running).toEqual([]);
    expect(l.groups[0]!.items.map((i) => i.watcherId).sort()).toEqual(['off', 'offrun']);
  });

  it('keine Wächter: keine Gruppen', () => {
    expect(watcherLayout([])).toEqual({ waiting: [], running: [], soon: [], groups: [] });
  });

  it('Wartende: die am längsten wartende zuerst', () => {
    const l = watcherLayout([item({ watcherId: 'b', phase: 'waiting', since: '2026-11-04T09:00:00Z' }), item({ watcherId: 'a', phase: 'waiting', since: '2026-11-04T08:00:00Z' })]);
    expect(l.waiting.map((i) => i.watcherId)).toEqual(['a', 'b']);
  });
});

describe('Ohne Kategorie zählen', () => {
  it('zählt alle Wächter ohne Kategorie, auch aktuelle und ausgeschaltete', () => {
    expect(uncategorizedCount([item({ watcherId: '1' }), item({ watcherId: '2', category: 'A' }), item({ watcherId: '3', phase: 'running' }), item({ watcherId: '4', active: false })])).toBe(3);
  });
});

describe('Klappzustand: pro Gerät gemerkt, Standard aufgeklappt', () => {
  it('ohne Eintrag ist eine Gruppe offen; ein Eintrag gilt', () => {
    expect(groupOpen('a', {}, false)).toBe(true);
    expect(groupOpen('a', { a: false }, false)).toBe(false);
    expect(groupOpen('a', { a: true }, false)).toBe(true);
  });
  it('bei einer Suche sind Gruppen mit Treffern immer offen (der gemerkte Zustand bleibt unberührt)', () => {
    expect(groupOpen('a', { a: false }, true)).toBe(true);
  });
  it('toggleGroup kehrt den sichtbaren Zustand um', () => {
    expect(toggleGroup({}, 'a', true)).toEqual({ a: false });
    expect(toggleGroup({ a: false }, 'a', false)).toEqual({ a: true });
  });
  it('parseCollapse: nur Wahrheitswerte, Müll ergibt leer', () => {
    expect(parseCollapse('{"a":false,"b":true,"c":1}')).toEqual({ a: false, b: true });
    expect(parseCollapse('kaputt')).toEqual({});
    expect(parseCollapse(null)).toEqual({});
    expect(parseCollapse('[1]')).toEqual({});
  });
  it('Speichern und Laden mit try/catch: kaputter oder gesperrter Speicher bricht nichts', () => {
    const mem = new Map<string, string>();
    const ok = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    saveCollapse({ a: false }, ok);
    expect(mem.get(COLLAPSE_KEY)).toBe('{"a":false}');
    expect(loadCollapse(ok)).toEqual({ a: false });
    const broken = {
      getItem: () => {
        throw new Error('gesperrt');
      },
      setItem: () => {
        throw new Error('gesperrt');
      },
    };
    expect(loadCollapse(broken)).toEqual({});
    expect(() => saveCollapse({ a: true }, broken)).not.toThrow();
    expect(loadCollapse(null)).toEqual({});
  });
});

describe('Zeilen-Texte', () => {
  it('Status: Entität fehlt vor Aus vor Phase', () => {
    expect(rowStatus(item({ watcherId: '1', entityMissing: true, active: false }))).toBe('missing');
    expect(rowStatus(item({ watcherId: '1', active: false }))).toBe('off');
    expect(rowStatus(item({ watcherId: '1', phase: 'running' }))).toBe('running');
    expect(rowStatus(item({ watcherId: '1' }))).toBe('quiet');
  });

  it('die Bedingung als kurzer Satz', () => {
    expect(triggerText(item({ watcherId: '1', entity: 'Tür Batterie' }))).toBe('Tür Batterie 10 Minuten unter 20 % liegt');
    expect(
      triggerText(item({ watcherId: '1', entity: 'Saugi', entityUnit: null, trigger: { entityId: 'vacuum.s', kind: 'state', to: 'docked', value: null, forMin: 0, count: 3 } })),
    ).toBe('Saugi zu „docked“ wechselt');
    expect(
      triggerText(item({ watcherId: '1', entity: 'Abfall', trigger: { entityId: 'calendar.a', kind: 'calendar_event', to: null, value: null, forMin: 0, count: 1, leadMin: 720 } })),
    ).toBe('im Kalender Abfall 12 Stunden vor einem Termin ansteht');
  });

  it('Zuständige: Namen bei festen Personen, sonst die Art', () => {
    const name = (id: string) => ({ a: 'Anna', b: 'Ben' })[id] ?? '?';
    expect(whoText({ mode: 'fixed', personIds: ['a', 'b'] }, name)).toBe('Anna, Ben');
    expect(whoText({ mode: 'rotation', personIds: ['a', 'b'] }, name)).toBe('abwechselnd: Anna, Ben');
    expect(whoText({ mode: 'rotation_present', personIds: [] }, name)).toBe('abwechselnd, nur Anwesende');
    expect(whoText({ mode: 'none', personIds: [] }, name)).toBe('niemand');
  });
});

describe('Auswahl der Kategorien im Editor', () => {
  it('die vorhandenen ohne Doppelte (Schreibweise egal), alphabetisch, ohne leere', () => {
    expect(categoryOptions(['Keller', 'garten', null, 'Garten', '', 'Batterien'])).toEqual(['Batterien', 'garten', 'Keller']);
  });
  it('die aktuelle Wahl steht dabei, auch wenn sie neu ist; eine vorhandene wird nicht doppelt', () => {
    expect(categoryOptions(['Garten'], 'Neu')).toEqual(['Garten', 'Neu']);
    expect(categoryOptions(['Garten'], ' GARTEN ')).toEqual(['Garten']);
    expect(categoryOptions([], '')).toEqual([]);
  });
});
