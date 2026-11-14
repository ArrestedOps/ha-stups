import { describe, expect, it } from 'vitest';
import { canJoin, FOUND_PREVIEW, FOUND_SEARCH_FROM, foundIcon, groupSuggestions, hitId, pickableInGroup, showFoundSearch, visibleHits } from '../src/lib/foundGroups';
import type { WatcherSuggestion } from '../src/lib/watcher-types';

const templates = [
  { id: 'washer', title: 'Waschmaschine fertig' },
  { id: 'dryer', title: 'Trockner fertig' },
  { id: 'bins', title: 'Tonnen rausstellen' },
  { id: 'battery', title: 'Batterie schwach' },
  { id: 'vacuum', title: 'Saugroboter: Behälter leeren' },
];
const hit = (templateId: string, n: number | string, name = `Gerät ${n}`): WatcherSuggestion => ({
  templateId,
  entityId: `sensor.${templateId}_${n}`,
  name,
  reason: `${name}: Batterie bei 12 %`,
  variant: 'default',
});
const batteries = (n: number) => Array.from({ length: n }, (_, i) => hit('battery', i));

describe('Gefunden: Gruppen', () => {
  it('eine Gruppe je Vorlage, in der Reihenfolge der Vorlagen, mit Titel und Zähler', () => {
    const groups = groupSuggestions([hit('battery', 1), hit('bins', 1), hit('battery', 2), hit('washer', 1)], templates);
    expect(groups.map((g) => [g.id, g.title, g.items.length])).toEqual([
      ['washer', 'Waschmaschine fertig', 1],
      ['bins', 'Tonnen rausstellen', 1],
      ['battery', 'Batterie schwach', 2],
    ]);
  });

  it('die Reihenfolge der Treffer innerhalb einer Gruppe bleibt (der Server sortiert, Batterien schwächste zuerst)', () => {
    const groups = groupSuggestions([hit('battery', 'c'), hit('battery', 'a'), hit('battery', 'b')], templates);
    expect(groups[0]!.items.map((s) => s.entityId)).toEqual(['sensor.battery_c', 'sensor.battery_a', 'sensor.battery_b']);
  });

  it('leere Gruppen fehlen; eine unbekannte Vorlage steht zuletzt, mit der Kennung als Titel', () => {
    const groups = groupSuggestions([hit('zukunft', 1), hit('battery', 1)], templates);
    expect(groups.map((g) => [g.id, g.title])).toEqual([
      ['battery', 'Batterie schwach'],
      ['zukunft', 'zukunft'],
    ]);
    expect(groupSuggestions([], templates)).toEqual([]);
  });

  it('solange die Vorlagen noch laden, gruppiert es trotzdem (Titel = Kennung)', () => {
    expect(groupSuggestions([hit('battery', 1)], []).map((g) => g.title)).toEqual(['battery']);
  });
});

describe('Gefunden: Aufklappregel', () => {
  it('bis fünf Treffer stehen alle offen', () => {
    const g = groupSuggestions(batteries(FOUND_PREVIEW), templates)[0]!;
    expect(visibleHits(g, false, false)).toHaveLength(FOUND_PREVIEW);
  });

  it('ab sechs zeigt die Gruppe die ersten fünf; aufgeklappt alle', () => {
    const g = groupSuggestions(batteries(37), templates)[0]!;
    expect(visibleHits(g, false, false).map((s) => s.entityId)).toEqual(g.items.slice(0, 5).map((s) => s.entityId));
    expect(visibleHits(g, true, false)).toHaveLength(37);
  });

  it('mit einem Filter zeigt jede Gruppe alle Treffer, ohne Abschneiden', () => {
    const g = groupSuggestions(batteries(37), templates)[0]!;
    expect(visibleHits(g, false, true)).toHaveLength(37);
  });
});

describe('Gefunden: Filter', () => {
  const all = [
    ...batteries(20),
    hit('battery', 'bad', 'Bad Fenster Batterie'),
    { ...hit('bins', 1, 'Abfallkalender'), entityId: 'calendar.abfall', reason: 'Abfallkalender ist ein Kalender mit Abfallterminen' },
    { ...hit('washer', 1, 'Waschmaschine Leistung'), entityId: 'sensor.wm_leistung', reason: 'Waschmaschine Leistung misst die Leistung' },
  ];

  it('filtert nach Gerätename, Groß- und Kleinschreibung und Akzente zählen nicht', () => {
    expect(groupSuggestions(all, templates, 'BAD fenster').flatMap((g) => g.items.map((s) => s.name))).toEqual(['Bad Fenster Batterie']);
  });

  it('filtert nach Entität und nach Begründung', () => {
    expect(groupSuggestions(all, templates, 'calendar.abfall').map((g) => g.id)).toEqual(['bins']);
    expect(groupSuggestions(all, templates, 'misst die leistung').map((g) => g.id)).toEqual(['washer']);
  });

  it('der Zähler der Gruppe ist die Zahl der Treffer nach dem Filter; Gruppen ohne Treffer fallen weg', () => {
    const groups = groupSuggestions(all, templates, 'sensor.battery_1');
    expect(groups.map((g) => g.id)).toEqual(['battery']);
    expect(groups[0]!.items).toHaveLength(11); // battery_1, battery_10 … battery_19
  });

  it('mehrere Wörter müssen alle vorkommen; leere Eingabe filtert nichts', () => {
    expect(groupSuggestions(all, templates, 'bad xyz')).toEqual([]);
    expect(groupSuggestions(all, templates, '   ').flatMap((g) => g.items)).toHaveLength(all.length);
  });

  it('der Titel der Vorlage zählt mit: „trockner“ findet die Treffer der Trockner-Gruppe', () => {
    const dry = [hit('dryer', 1, 'Steckdose Bad')];
    expect(groupSuggestions(dry, templates, 'trockner').map((g) => g.id)).toEqual(['dryer']);
  });
});

describe('Gefunden: Suchfeld und Symbole', () => {
  it('das Suchfeld erscheint ab zwölf Treffern, nicht früher', () => {
    expect(FOUND_SEARCH_FROM).toBe(12);
    expect(showFoundSearch(11)).toBe(false);
    expect(showFoundSearch(12)).toBe(true);
    expect(showFoundSearch(300)).toBe(true);
  });

  it('jede Vorlage hat ein Symbol; Unbekanntes bekommt das Auge', () => {
    for (const id of ['washer', 'dryer', 'dishwasher', 'bins', 'rain', 'battery', 'vacuum']) expect(foundIcon(id)).not.toBe('eye');
    expect(foundIcon('zukunft')).toBe('eye');
  });
});

describe('Treffer auswählen', () => {
  const s = (templateId: string, entityId: string, variant: 'power' | 'status' | 'default' = 'default') => ({ templateId, entityId, name: entityId, reason: entityId, variant });

  it('nur Treffer derselben Vorlage und Fassung lassen sich zusammen wählen', () => {
    const power = s('washer', 'sensor.a', 'power');
    expect(canJoin([], power)).toBe(true);
    expect(canJoin([power], s('washer', 'sensor.b', 'power'))).toBe(true);
    expect(canJoin([power], s('washer', 'sensor.b', 'status'))).toBe(false);
    expect(canJoin([power], s('dryer', 'sensor.c', 'power'))).toBe(false);
  });

  it('„Alle auswählen“ nimmt die Fassung des ersten Treffers, bei bestehender Auswahl deren Fassung', () => {
    const items = [s('washer', 'sensor.a', 'power'), s('washer', 'sensor.b', 'status'), s('washer', 'sensor.c', 'power')];
    expect(pickableInGroup(items, []).map((x) => x.entityId)).toEqual(['sensor.a', 'sensor.c']);
    expect(pickableInGroup(items, [items[1]!]).map((x) => x.entityId)).toEqual(['sensor.b']);
    expect(pickableInGroup(items, [s('dryer', 'sensor.z')])).toEqual([]);
    expect(pickableInGroup([], [])).toEqual([]);
  });

  it('die Kennung unterscheidet dieselbe Entität unter zwei Vorlagen', () => {
    expect(hitId(s('washer', 'sensor.a'))).not.toBe(hitId(s('dryer', 'sensor.a')));
  });
});
